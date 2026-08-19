import { syncAllAutoRates } from '@/lib/frankfurter';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-job-token');
  const expected = process.env.PB_INTERNAL_JOB_TOKEN;

  if (!expected || secret !== expected) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (settings?.fxAutoSync === false) {
    return Response.json({ synced: 0, skipped: true });
  }

  const synced = await syncAllAutoRates();
  // Recurring rules convert at the live rate, so a cron rate change moves the
  // renewal and recurring-budget totals that are now cached between requests.
  if (synced > 0) revalidateFinanceTags(CACHE_TAGS.fx);
  return Response.json({ synced });
}
