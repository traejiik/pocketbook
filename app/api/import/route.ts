import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  return lines.slice(1).map(line => {
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) ?? line.split(',');
    return Object.fromEntries(
      headers.map((h, i) => [h, (cols[i] ?? '').replace(/^"|"$/g, '').trim()])
    );
  });
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  return candidates.find(c => headers.includes(c));
}

function parseDate(raw: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + 'T00:00:00Z');
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split('/');
    const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ imported: 0, skipped: 0, errors: ['Failed to parse form data'] });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ imported: 0, skipped: 0, errors: ['No file provided'] });
  }

  const text = await (file as File).text();
  const rows = parseCSV(text);

  if (rows.length === 0) {
    return Response.json({ imported: 0, skipped: 0, errors: ['CSV is empty or has no data rows'] });
  }

  const sampleHeaders = Object.keys(rows[0]);
  const dateKey = findHeader(sampleHeaders, ['date', 'transaction date', 'value date']);
  const descKey = findHeader(sampleHeaders, ['description', 'details', 'narrative', 'memo']);
  const amountKey = findHeader(sampleHeaders, ['amount', 'value', 'debit/credit', 'sum']);

  if (!dateKey || !descKey || !amountKey) {
    return Response.json({
      imported: 0,
      skipped: 0,
      errors: [`Could not identify required columns (date, description, amount). Headers found: ${sampleHeaders.join(', ')}`],
    });
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const currency = settings?.anchorCurrency ?? 'HUF';

  const uncategorised = await prisma.category.upsert({
    where: { name_kind: { name: 'Uncategorised', kind: 'EXPENSE' } },
    create: { name: 'Uncategorised', kind: 'EXPENSE', color: '#6B7280' },
    update: {},
  });

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rawDate = row[dateKey] ?? '';
    const rawDesc = row[descKey] ?? '';
    const rawAmount = row[amountKey] ?? '';

    if (!rawDate || !rawDesc || !rawAmount) {
      errors.push(`Row ${rowNum}: missing required field`);
      continue;
    }

    const parsedDate = parseDate(rawDate);
    if (!parsedDate) {
      errors.push(`Row ${rowNum}: unrecognised date format "${rawDate}"`);
      continue;
    }

    const parsedAmount = parseAmount(rawAmount);
    if (parsedAmount === null) {
      errors.push(`Row ${rowNum}: unrecognised amount "${rawAmount}"`);
      continue;
    }

    const description = rawDesc.trim();
    const absAmount = Math.abs(parsedAmount);
    const type = parsedAmount < 0 ? 'EXPENSE' : 'INCOME';

    const existing = await prisma.transaction.findFirst({
      where: { date: parsedDate, description, amount: absAmount },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.transaction.create({
      data: {
        date: parsedDate,
        description,
        amount: absAmount,
        type,
        currency,
        categoryId: uncategorised.id,
        recurringRuleId: null,
      },
    });
    imported++;
  }

  return Response.json({ imported, skipped, errors });
}
