import { syncAllAutoRates } from '@/lib/frankfurter';
import { prisma } from '@/lib/prisma';
import { CACHE_TAGS, revalidateFinanceTags } from '@/lib/cache';
import { logger } from '@/lib/logger';

const log = logger('fx');

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-job-token');
  const expected = process.env.PB_INTERNAL_JOB_TOKEN;

  if (!expected || secret !== expected) {
    log.warn('fx sync refused', { reason: expected ? 'bad token' : 'no job token configured' });
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const timer = log.start('fx sync');
  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  if (settings?.fxAutoSync === false) {
    timer.skip('automatic FX sync disabled');
    return Response.json({ synced: 0, skipped: true });
  }

  const synced = await syncAllAutoRates();
  timer.ok({ synced });
  // Recurring rules convert at the live rate, so a cron rate change moves the
  // renewal and recurring-budget totals that are now cached between requests.
  if (synced > 0) revalidateFinanceTags(CACHE_TAGS.fx);
  return Response.json({ synced });
}
