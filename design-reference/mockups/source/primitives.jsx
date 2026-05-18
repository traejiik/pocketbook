// Shared shadcn-flavored primitives (Button, Card, Input, Badge, KpiCard, etc.)

const cn = (...c) => c.filter(Boolean).join(' ');

const Button = ({ variant = 'default', size = 'md', className = '', children, icon, iconAfter, ...rest }) => {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-0';
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-9 px-3.5 text-[13.5px]',
    lg: 'h-10 px-4 text-sm',
    icon: 'h-9 w-9 p-0',
  };
  const variants = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border',
    ghost: 'text-foreground/80 hover:bg-accent hover:text-foreground',
    outline: 'border border-border bg-transparent text-foreground hover:bg-accent',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...rest}>
      {icon && <Icon name={icon} className="w-[15px] h-[15px]" />}
      {children}
      {iconAfter && <Icon name={iconAfter} className="w-[15px] h-[15px]" />}
    </button>
  );
};

const Card = ({ className = '', children, hover = false, ...rest }) => (
  <div className={cn('pb-card', hover && 'pb-card-hover transition-colors', className)} {...rest}>
    {children}
  </div>
);

const Input = React.forwardRef(({ className = '', icon, suffix, ...rest }, ref) => (
  <div className={cn('relative flex items-center', className)}>
    {icon && (
      <span className="absolute left-3 text-muted-foreground pointer-events-none">
        <Icon name={icon} className="w-4 h-4" />
      </span>
    )}
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-md border border-input bg-transparent px-3 text-[13.5px] placeholder:text-muted-foreground/70',
        'focus:outline-none focus:ring-2 focus:ring-ring/60 focus:border-ring/60 transition',
        icon && 'pl-9', suffix && 'pr-12'
      )}
      {...rest}
    />
    {suffix && <span className="absolute right-3 text-xs text-muted-foreground mono">{suffix}</span>}
  </div>
));

const Label = ({ children, htmlFor, hint }) => (
  <label htmlFor={htmlFor} className="flex items-baseline justify-between text-[12px] font-medium text-muted-foreground mb-1.5">
    <span>{children}</span>
    {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
  </label>
);

const Badge = ({ children, color, kind, className = '' }) => {
  // Categorical pill with a color dot.
  if (color) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-secondary/60 border border-border px-2 py-0.5 text-[11.5px] text-foreground/85', className)}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        {children}
      </span>
    );
  }
  const tones = {
    income:   'bg-income/12 text-income border-income/25',
    expense:  'bg-expense/12 text-expense border-expense/25',
    savings:  'bg-savings/12 text-savings border-savings/25',
    neutral:  'bg-secondary text-muted-foreground border-border',
    primary:  'bg-primary/12 text-primary border-primary/25',
    warning:  'bg-amber-500/12 text-amber-400 border-amber-500/25',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border', tones[kind || 'neutral'], className)}>
      {children}
    </span>
  );
};

const CategoryBadge = ({ id, className = '' }) => {
  const c = PB_DATA.catBy[id];
  if (!c) return null;
  return <Badge color={c.color} className={className}>{c.name}</Badge>;
};

// Big amount display with currency suffix, tabular nums.
const AmountDisplay = ({ value, currency = 'HUF', tone, size = 'md', signed = false, className = '' }) => {
  const sizes = { sm: 'text-[15px]', md: 'text-[20px]', lg: 'text-[28px]', xl: 'text-[34px]' };
  const tones = {
    income: 'text-income',
    expense: 'text-expense',
    savings: 'text-savings',
    neutral: 'text-foreground',
  };
  const t = tones[tone || 'neutral'];
  const sign = signed && value > 0 ? '+' : (value < 0 ? '−' : '');
  const abs = Math.abs(value);
  let str;
  if (currency === 'HUF') str = `${Math.round(abs).toLocaleString('hu-HU').replace(/,/g, ' ')}`;
  else if (currency === 'USD') str = `${abs.toFixed(2)}`;
  else if (currency === 'EUR') str = `${abs.toFixed(2)}`;
  else str = `${abs}`;
  const cur = currency === 'HUF' ? 'Ft' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency;
  const prefix = currency !== 'HUF';
  return (
    <span className={cn('tabular font-semibold tracking-tight', sizes[size], t, className)}>
      {sign}{prefix && <span className="text-foreground/55 font-normal mr-0.5">{cur}</span>}{str}
      {!prefix && <span className="text-foreground/55 font-normal ml-1.5 text-[0.62em]">{cur}</span>}
    </span>
  );
};

// KPI card with sparkline-ish accent
const KpiCard = ({ label, value, currency = 'HUF', tone = 'neutral', delta, deltaLabel, accentDots, footnote }) => (
  <Card className="p-4 flex flex-col gap-3 relative overflow-hidden">
    <div className="flex items-center justify-between">
      <div className="text-[11.5px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{label}</div>
      {delta != null && (
        <span className={cn('mono text-[11px] inline-flex items-center gap-0.5',
          delta > 0 ? (tone === 'expense' ? 'text-expense' : 'text-income') :
          delta < 0 ? (tone === 'expense' ? 'text-income' : 'text-expense') : 'text-muted-foreground'
        )}>
          <Icon name={delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'arrow-right'} className="w-3 h-3" />
          {Math.abs(delta).toFixed(1)}%
        </span>
      )}
    </div>
    <AmountDisplay value={value} currency={currency} tone={tone} size="xl" />
    <div className="flex items-center justify-between">
      <div className="text-[11.5px] text-muted-foreground">{footnote || (deltaLabel ? `vs ${deltaLabel}` : '\u00A0')}</div>
      {accentDots && (
        <div className="flex gap-0.5">
          {accentDots.map((d, i) => (
            <span key={i} className="w-0.5 rounded-full" style={{ height: `${6 + d * 14}px`, background: 'hsl(var(--' + (tone === 'expense' ? 'expense' : tone === 'income' ? 'income' : tone === 'savings' ? 'savings' : 'muted-foreground') + '))' , opacity: 0.35 + 0.55 * d }} />
          ))}
        </div>
      )}
    </div>
  </Card>
);

// shadcn-style segmented control
const Segmented = ({ options, value, onChange, className = '' }) => (
  <div className={cn('inline-flex p-0.5 bg-secondary border border-border rounded-md', className)}>
    {options.map(o => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={cn(
          'h-7 px-3 text-[12px] rounded-[5px] font-medium transition-colors',
          value === o.value ? 'bg-card text-foreground shadow-pb-1' : 'text-muted-foreground hover:text-foreground'
        )}
      >{o.label}</button>
    ))}
  </div>
);

// Toggle switch
const Switch = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors', checked ? 'bg-primary' : 'bg-secondary border border-border')}
  >
    <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-card shadow-pb-1 transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
  </button>
);

// Drawer / Sheet (right side)
const Sheet = ({ open, onClose, children, title, subtitle, width = 'w-[440px]' }) => {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-30">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn('absolute right-0 top-0 bottom-0 bg-card border-l border-border shadow-pb-3 flex flex-col', width)}>
        <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <div className="text-[15px] font-semibold tracking-tight">{title}</div>
            {subtitle && <div className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 -mr-1.5 -mt-1">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
};

// Toast
const Toast = ({ children, tone = 'success', visible }) => (
  <div className={cn(
    'absolute bottom-5 right-5 z-40 pointer-events-none transition-all duration-200',
    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
  )}>
    <div className={cn(
      'flex items-center gap-2.5 px-3.5 py-2.5 rounded-md border shadow-pb-3 text-[13px] bg-card',
      tone === 'success' && 'border-income/30',
      tone === 'error' && 'border-destructive/40'
    )}>
      <Icon name={tone === 'success' ? 'check-circle' : 'alert'} className={cn('w-4 h-4', tone === 'success' ? 'text-income' : 'text-destructive')} />
      {children}
    </div>
  </div>
);

// Skeleton block
const Skeleton = ({ className = '' }) => (
  <div className={cn('rounded-md bg-muted/60 animate-pulse', className)} />
);

// Empty state
const Empty = ({ icon = 'wallet', title, body, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground mb-4">
      <Icon name={icon} className="w-5 h-5" />
    </div>
    <div className="text-[15px] font-semibold tracking-tight">{title}</div>
    {body && <div className="text-[13px] text-muted-foreground mt-1 max-w-xs">{body}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

Object.assign(window, { cn, Button, Card, Input, Label, Badge, CategoryBadge, AmountDisplay, KpiCard, Segmented, Switch, Sheet, Toast, Skeleton, Empty });
