// Realistic data based on the brief: HUF-primary, ~321k in / ~233k out, 13 subs, 1 installment.

const fxRates = {
  HUF_per_USD: 358.4,
  HUF_per_EUR: 396.1,
};

const categories = [
  { id: 'rent_in',   name: 'Rent Income',     color: '#3FBF7F', kind: 'income'  },
  { id: 'allowance', name: 'Allowance',       color: '#5AA3FF', kind: 'income'  },
  { id: 'plasma',    name: 'Plasma',          color: '#C58CFF', kind: 'income'  },
  { id: 'housing',   name: 'Housing',         color: '#FF8A65', kind: 'expense' },
  { id: 'food',      name: 'Food & Groceries',color: '#F5B544', kind: 'expense' },
  { id: 'subs',      name: 'Subscriptions',   color: '#6FB8FF', kind: 'expense' },
  { id: 'transit',   name: 'Transit',         color: '#7BD3B3', kind: 'expense' },
  { id: 'eating',    name: 'Eating Out',      color: '#E36F8E', kind: 'expense' },
  { id: 'fitness',   name: 'Fitness',         color: '#A4D453', kind: 'expense' },
  { id: 'phone',     name: 'Phone Plan',      color: '#9C8CFF', kind: 'expense' },
  { id: 'misc',      name: 'Misc',            color: '#8E97A8', kind: 'expense' },
  { id: 'emergency', name: 'Emergency Fund',  color: '#4FB3E0', kind: 'savings' },
];

const catBy = Object.fromEntries(categories.map(c => [c.id, c]));

// Current month: May 2026 (matches "today")
const transactions = [
  { id: 't01', date: '2026-05-01', desc: 'Tenant rent — apt 4B',           amt:  180000, cur: 'HUF', cat: 'rent_in',   type: 'income' },
  { id: 't02', date: '2026-05-01', desc: 'Rent — Bartók Béla út',          amt: -148000, cur: 'HUF', cat: 'housing',   type: 'expense', recurring: 'rec_rent' },
  { id: 't03', date: '2026-05-02', desc: 'Spar — weekly groceries',        amt:  -14820, cur: 'HUF', cat: 'food',      type: 'expense' },
  { id: 't04', date: '2026-05-03', desc: 'Allowance — parents',            amt:  100000, cur: 'HUF', cat: 'allowance', type: 'income' },
  { id: 't05', date: '2026-05-04', desc: 'Spotify Family',                 amt:   -2490, cur: 'HUF', cat: 'subs',      type: 'expense', recurring: 'rec_spotify' },
  { id: 't06', date: '2026-05-04', desc: 'Mobile contract — installment 9/15', amt: -20045, cur: 'HUF', cat: 'phone', type: 'expense', recurring: 'rec_mobile' },
  { id: 't07', date: '2026-05-05', desc: 'Anthropic — Claude Pro',         amt:     -20, cur: 'USD', cat: 'subs',      type: 'expense', recurring: 'rec_claude' },
  { id: 't08', date: '2026-05-06', desc: 'OpenAI — ChatGPT Plus',          amt:     -20, cur: 'USD', cat: 'subs',      type: 'expense', recurring: 'rec_chatgpt' },
  { id: 't09', date: '2026-05-06', desc: 'BKK monthly pass',               amt:   -9500, cur: 'HUF', cat: 'transit',   type: 'expense' },
  { id: 't10', date: '2026-05-07', desc: 'Plasma — May visit 1',           amt:   12000, cur: 'HUF', cat: 'plasma',    type: 'income' },
  { id: 't11', date: '2026-05-08', desc: 'Gym — FitBalance',               amt:  -14990, cur: 'HUF', cat: 'fitness',   type: 'expense', recurring: 'rec_gym' },
  { id: 't12', date: '2026-05-08', desc: 'Hevy — annual',                  amt:    -899, cur: 'HUF', cat: 'fitness',   type: 'expense', recurring: 'rec_hevy' },
  { id: 't13', date: '2026-05-09', desc: 'Pizza Manufaktúra',              amt:   -5990, cur: 'HUF', cat: 'eating',    type: 'expense' },
  { id: 't14', date: '2026-05-10', desc: 'YouTube Premium',                amt:   -2990, cur: 'HUF', cat: 'subs',      type: 'expense', recurring: 'rec_yt' },
  { id: 't15', date: '2026-05-12', desc: 'Lidl',                           amt:   -9210, cur: 'HUF', cat: 'food',      type: 'expense' },
  { id: 't16', date: '2026-05-12', desc: 'Apple Music',                    amt:   -1990, cur: 'HUF', cat: 'subs',      type: 'expense', recurring: 'rec_apple' },
  { id: 't17', date: '2026-05-13', desc: 'PS Plus Essential',              amt:   -3590, cur: 'HUF', cat: 'subs',      type: 'expense', recurring: 'rec_ps' },
  { id: 't18', date: '2026-05-14', desc: 'Plasma — May visit 2',           amt:   12000, cur: 'HUF', cat: 'plasma',    type: 'income' },
  { id: 't19', date: '2026-05-14', desc: 'Coffee — Magvető Café',          amt:   -1450, cur: 'HUF', cat: 'eating',    type: 'expense' },
  { id: 't20', date: '2026-05-15', desc: 'Spar',                           amt:  -11340, cur: 'HUF', cat: 'food',      type: 'expense' },
  { id: 't21', date: '2026-05-15', desc: 'Google One 200GB',               amt:    -990, cur: 'HUF', cat: 'subs',      type: 'expense', recurring: 'rec_google' },
  { id: 't22', date: '2026-05-16', desc: 'Emergency fund — auto-save',     amt:  -25000, cur: 'HUF', cat: 'emergency', type: 'savings' },
  { id: 't23', date: '2026-05-17', desc: 'Bolt — late night',              amt:   -2800, cur: 'HUF', cat: 'transit',   type: 'expense' },
  { id: 't24', date: '2026-05-17', desc: 'Plasma — May visit 3',           amt:   12000, cur: 'HUF', cat: 'plasma',    type: 'income' },
  { id: 't25', date: '2026-05-18', desc: 'Cinema — Toldi',                 amt:   -2900, cur: 'HUF', cat: 'eating',    type: 'expense' },
];

const recurring = [
  { id: 'rec_rent',    name: 'Rent — Bartók Béla út',    amt: 148000, cur: 'HUF', cycle: 'monthly', next: '2026-06-01', kind: 'expense', cat: 'housing' },
  { id: 'rec_mobile',  name: 'Mobile contract',          amt:  20045, cur: 'HUF', cycle: 'monthly', next: '2026-06-04', kind: 'expense', cat: 'phone',  installment: { paid: 9, total: 15, endsOn: '2026-07-04' } },
  { id: 'rec_gym',     name: 'FitBalance Gym',           amt:  14990, cur: 'HUF', cycle: 'monthly', next: '2026-06-08', kind: 'expense', cat: 'fitness' },
  { id: 'rec_chatgpt', name: 'ChatGPT Plus',             amt:     20, cur: 'USD', cycle: 'monthly', next: '2026-06-06', kind: 'expense', cat: 'subs' },
  { id: 'rec_claude',  name: 'Claude Pro',               amt:     20, cur: 'USD', cycle: 'monthly', next: '2026-06-05', kind: 'expense', cat: 'subs' },
  { id: 'rec_ps',      name: 'PS Plus Essential',        amt:   3590, cur: 'HUF', cycle: 'monthly', next: '2026-06-13', kind: 'expense', cat: 'subs' },
  { id: 'rec_yt',      name: 'YouTube Premium',          amt:   2990, cur: 'HUF', cycle: 'monthly', next: '2026-06-10', kind: 'expense', cat: 'subs' },
  { id: 'rec_apple',   name: 'Apple Music',              amt:   1990, cur: 'HUF', cycle: 'monthly', next: '2026-06-12', kind: 'expense', cat: 'subs' },
  { id: 'rec_spotify', name: 'Spotify Family',           amt:   2490, cur: 'HUF', cycle: 'monthly', next: '2026-06-04', kind: 'expense', cat: 'subs' },
  { id: 'rec_google',  name: 'Google One 200GB',         amt:    990, cur: 'HUF', cycle: 'monthly', next: '2026-06-15', kind: 'expense', cat: 'subs' },
  { id: 'rec_hevy',    name: 'Hevy Pro',                 amt:    899, cur: 'HUF', cycle: 'annual',  next: '2027-05-08', kind: 'expense', cat: 'fitness' },
  { id: 'rec_kick',    name: 'Kickresume',               amt:     19, cur: 'EUR', cycle: 'annual',  next: '2026-11-22', kind: 'expense', cat: 'subs' },
  { id: 'rec_jb',      name: 'JetBrains All Products',   amt:     69, cur: 'EUR', cycle: 'annual',  next: '2026-09-01', kind: 'expense', cat: 'subs' },
  // incomes
  { id: 'rec_rentin',  name: 'Tenant rent — apt 4B',     amt: 180000, cur: 'HUF', cycle: 'monthly', next: '2026-06-01', kind: 'income',  cat: 'rent_in' },
  { id: 'rec_allow',   name: 'Allowance',                amt: 100000, cur: 'HUF', cycle: 'monthly', next: '2026-06-03', kind: 'income',  cat: 'allowance' },
];

// Aggregate KPIs (current month so far)
const kpis = (() => {
  const inHUF = (amt, cur) => cur === 'USD' ? amt * fxRates.HUF_per_USD : cur === 'EUR' ? amt * fxRates.HUF_per_EUR : amt;
  let inc = 0, exp = 0, sav = 0;
  transactions.forEach(t => {
    const huf = inHUF(t.amt, t.cur);
    if (t.type === 'income')  inc += huf;
    if (t.type === 'expense') exp += -huf;
    if (t.type === 'savings') sav += -huf;
  });
  return { income: inc, expense: exp, savings: sav, net: inc - exp - sav };
})();

// Expenses by category (HUF)
const byCategory = (() => {
  const inHUF = (amt, cur) => cur === 'USD' ? amt * fxRates.HUF_per_USD : cur === 'EUR' ? amt * fxRates.HUF_per_EUR : amt;
  const map = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    map[t.cat] = (map[t.cat] || 0) + (-inHUF(t.amt, t.cur));
  });
  return Object.entries(map)
    .map(([cat, v]) => ({ cat, name: catBy[cat].name, color: catBy[cat].color, value: Math.round(v) }))
    .sort((a, b) => b.value - a.value);
})();

// Sparkline data: last 6 months net
const trend6mo = [
  { m: 'Dec', net:  62000 },
  { m: 'Jan', net:  41000 },
  { m: 'Feb', net:  78000 },
  { m: 'Mar', net:  53000 },
  { m: 'Apr', net:  84000 },
  { m: 'May', net:  Math.round(kpis.net) },
];

// Helpers
const fmtHUF = (n, opts = {}) => {
  const sign = opts.signed && n > 0 ? '+' : '';
  const abs = Math.round(Math.abs(n));
  return `${n < 0 ? '−' : sign}${abs.toLocaleString('hu-HU').replace(/,/g, ' ').replace(/\u00a0/g, ' ')} Ft`;
};
const fmtCur = (n, cur) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (cur === 'HUF') return `${sign}${Math.round(abs).toLocaleString('hu-HU').replace(/,/g,' ')} Ft`;
  if (cur === 'USD') return `${sign}$${abs.toFixed(2)}`;
  if (cur === 'EUR') return `${sign}€${abs.toFixed(2)}`;
  return `${sign}${abs}`;
};
const fmtDate = (iso, opts = {}) => {
  const d = new Date(iso + 'T00:00');
  if (opts.short) return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const dayOfWeek = (iso) => new Date(iso + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short' });

window.PB_DATA = {
  fxRates, categories, catBy, transactions, recurring, kpis, byCategory, trend6mo,
  fmtHUF, fmtCur, fmtDate, dayOfWeek,
};
