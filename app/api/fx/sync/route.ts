import { syncAllAutoRates } from '@/lib/frankfurter';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = request.headers.get('x-sync-secret');
  const expected = process.env.FX_SYNC_SECRET;

  if (!expected || secret !== expected) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const synced = await syncAllAutoRates();
  return Response.json({ synced });
}
