import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimOwner, issueSetupCode } from '@/lib/owner/setup';

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
      update: { instanceName: null, setupCodeHash: null, setupCodeExpiresAt: null },
    });
  });

  afterAll(async () => {
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  });

  it('rejects invalid, expired and replaced codes', async () => {
    const expired = await issueSetupCode(first, new Date(Date.now() - 31 * 60_000));
    await expect(claimOwner(first, { ...input, code: expired })).rejects.toThrow('invalid or expired');
    const replaced = await issueSetupCode(first);
    await issueSetupCode(first);
    await expect(claimOwner(first, { ...input, code: replaced })).rejects.toThrow('invalid or expired');
    await expect(claimOwner(first, { ...input, code: 'x'.repeat(43) })).rejects.toThrow('invalid or expired');
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
