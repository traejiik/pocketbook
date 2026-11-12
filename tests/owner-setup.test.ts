import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimOwner, ensureSetupCode, issueSetupCode } from '@/lib/owner/setup';
import { importLegacyOwnerNames } from '@/lib/owner/names';

const url = process.env.PB_OWNER_TEST_DATABASE_URL;

// Run only against a migrated, disposable database. These tests replace its
// owner and settings and deliberately inject a failure after the User insert.
describe.skipIf(!url)('owner setup on PostgreSQL', () => {
  const first = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const second = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const input = {
    email: 'first@example.test',
    displayName: 'First owner',
    password: 'a long example password',
    confirmPassword: 'a long example password',
    instanceName: 'First ledger',
  };

  beforeEach(async () => {
    await first.user.deleteMany();
    await first.appSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton' },
      update: { instanceName: null, legacyNamesImported: false, setupCodeHash: null, setupCodeExpiresAt: null },
    });
  });

  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('imports only missing names for an existing owner and never reapplies them after a restart', async () => {
    const owner = await first.user.create({ data: { email: input.email, passwordHash: 'unused', displayName: 'Saved owner' } });
    const legacy = { PB_USER_DISPLAY_NAME: ' Legacy owner ', PB_INSTANCE_NAME: ' Legacy ledger ' };
    const key = { id: 'singleton' };

    await Promise.all([importLegacyOwnerNames(first, legacy), importLegacyOwnerNames(second, legacy)]);
    expect(await first.user.findUnique({ where: { id: owner.id } })).toMatchObject({ displayName: 'Saved owner' });
    expect(await first.appSettings.findUnique({ where: key })).toMatchObject({ instanceName: 'Legacy ledger' });

    await first.appSettings.update({ where: key, data: { instanceName: null } });
    await importLegacyOwnerNames(second, legacy);
    expect(await first.appSettings.findUnique({ where: key })).toMatchObject({ instanceName: null });
  });

  it('imports a trimmed display name and preserves the existing instance name', async () => {
    const owner = await first.user.create({ data: { email: input.email, passwordHash: 'unused' } });
    const key = { id: 'singleton' };
    await first.appSettings.update({ where: key, data: { instanceName: 'Saved ledger' } });

    await importLegacyOwnerNames(first, { PB_USER_DISPLAY_NAME: ' Legacy owner ', PB_INSTANCE_NAME: 'Legacy ledger' });

    expect(await first.user.findUnique({ where: { id: owner.id } })).toMatchObject({ displayName: 'Legacy owner' });
    expect(await first.appSettings.findUnique({ where: key })).toMatchObject({ instanceName: 'Saved ledger' });
  });

  it('issues one code across concurrent requests and preserves it while active', async () => {
    const results = await Promise.all([ensureSetupCode(first), ensureSetupCode(second)]);
    const issued = results.filter(result => result.status === 'issued');
    expect(issued).toHaveLength(1);
    const active = { status: 'active', expiresAt: issued[0].expiresAt };
    expect(results).toContainEqual(active);
    expect(await ensureSetupCode(first)).toEqual(active);

    await claimOwner(first, { ...input, code: issued[0].code });
    expect(await ensureSetupCode(second)).toEqual({ status: 'configured' });
  });

  it('replaces an expired startup code', async () => {
    const expired = await issueSetupCode(first, new Date(Date.now() - 31 * 60_000));
    const fresh = await ensureSetupCode(first);
    if (fresh.status !== 'issued') throw new Error(`Expected a fresh code, got ${fresh.status}`);
    expect(fresh.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(claimOwner(first, { ...input, code: expired })).rejects.toMatchObject({
      field: 'code',
      message: 'The setup code is invalid or expired.',
    });
    await expect(claimOwner(first, { ...input, code: fresh.code })).resolves.toBeUndefined();
  });

  it('rejects invalid, expired and replaced codes', async () => {
    const expired = await issueSetupCode(first, new Date(Date.now() - 31 * 60_000));
    await expect(claimOwner(first, { ...input, code: expired })).rejects.toThrow('invalid or expired');
    const replaced = await issueSetupCode(first);
    await issueSetupCode(first);
    await expect(claimOwner(first, { ...input, code: replaced })).rejects.toThrow('invalid or expired');
    await expect(claimOwner(first, { ...input, code: 'x'.repeat(43) })).rejects.toThrow('invalid or expired');
    await expect(claimOwner(first, { ...input, code: 'too short' })).rejects.toMatchObject({ field: 'code' });
    expect(await first.user.count()).toBe(0);
  });

  it('commits exactly one concurrent claim and consumes the code', async () => {
    const code = await issueSetupCode(first);
    const other = { ...input, email: 'second@example.test', instanceName: 'Second ledger' };
    const attempts = await Promise.allSettled([
      claimOwner(first, { ...input, code }),
      claimOwner(second, { ...other, code }),
    ]);
    expect(attempts.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const winner = attempts[0].status === 'fulfilled' ? input : other;
    const users = await first.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe(winner.email);
    expect(await first.appSettings.findUniqueOrThrow({ where: { id: 'singleton' } })).toMatchObject({
      instanceName: winner.instanceName,
      setupCodeHash: null,
      setupCodeExpiresAt: null,
    });
    await expect(claimOwner(second, { ...input, code })).rejects.toThrow('already configured');
    await expect(issueSetupCode(second)).rejects.toThrow('already configured');
  });

  it('rolls back the new owner when saving the instance name fails', async () => {
    const code = await issueSetupCode(first);
    await first.$executeRaw`ALTER TABLE "AppSettings" ADD CONSTRAINT "owner_test_failure" CHECK ("instanceName" IS NULL)`;
    try {
      await expect(claimOwner(first, { ...input, code })).rejects.toThrow();
      expect(await second.user.count()).toBe(0);
      expect(await second.appSettings.findUniqueOrThrow({ where: { id: 'singleton' } })).toMatchObject({
        instanceName: null,
        setupCodeHash: expect.any(String),
      });
    } finally {
      await first.$executeRaw`ALTER TABLE "AppSettings" DROP CONSTRAINT "owner_test_failure"`;
    }
    await expect(claimOwner(first, { ...input, code })).resolves.toBeUndefined();
  });
});
