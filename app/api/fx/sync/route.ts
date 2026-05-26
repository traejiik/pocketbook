import { syncAllAutoRates } from '@/lib/frankfurter';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  const expected = process.env.FX_SYNC_SECRET;

  if (!expected || secret !== expected) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (settings?.fxAutoSync === false) {
    return Response.json({ synced: 0, skipped: true });
  }

  const synced = await syncAllAutoRates();
  return Response.json({ synced });
}
