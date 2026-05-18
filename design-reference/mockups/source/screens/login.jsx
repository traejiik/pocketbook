// Login screen — single-user, single password. Minimal centred card.

const LoginScreen = ({ onLogin }) => {
  const [pw, setPw] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const submit = (e) => {
    e?.preventDefault();
    if (!pw) { setError('Enter your password.'); return; }
    setLoading(true);
    setError('');
    setTimeout(() => {
      setLoading(false);
      if (pw === 'wrong') setError('That password is incorrect.');
      else onLogin?.();
    }, 700);
  };

  return (
    <div className="w-full h-full grid place-items-center relative overflow-hidden">
      {/* Base near-black backdrop (same vibe in light & dark mode — login is an "outside" surface) */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: '#070912' }} />

      {/* Layer 1 — staggered glowing rounded-rectangle grid */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1440 900">
        <defs>
          <filter id="lp-halo" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
          <filter id="lp-edge" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <radialGradient id="lp-vignette" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#070912" stopOpacity="0" />
            <stop offset="80%" stopColor="#070912" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        {/* Row 1 — top-ish, three wide pills with overlap-feel */}
        {/* Row 2 — middle, four pills, offset */}
        {/* Row 3 — lower, three pills */}
        {[
          // y, x, w, h
          [120,  -60, 460, 240],
          [120,  460, 540, 240],
          [120, 1080, 460, 240],

          [380, -120, 420, 230],
          [380,  340, 460, 230],
          [380,  840, 420, 230],
          [380, 1280, 380, 230],

          [620,  -80, 480, 230],
          [620,  460, 500, 230],
          [620, 1020, 480, 230],
        ].map(([y, x, w, h], i) => (
          <g key={i}>
            {/* Outer diffuse halo */}
            <rect x={x} y={y} width={w} height={h} rx={h*0.45}
                  fill="none"
                  stroke="#6b9eff" strokeOpacity="0.20" strokeWidth="2"
                  filter="url(#lp-halo)" />
            {/* Crisper inner edge */}
            <rect x={x} y={y} width={w} height={h} rx={h*0.45}
                  fill="none"
                  stroke="#8ab4ff" strokeOpacity="0.24" strokeWidth="0.7"
                  filter="url(#lp-edge)" />
          </g>
        ))}

        {/* Vignette to keep edges dark and focus the card */}
        <rect width="1440" height="900" fill="url(#lp-vignette)" />
      </svg>

      {/* Layer 2 — very faint floating currency glyphs, just enough to whisper "money" */}
      <div className="absolute inset-0 pointer-events-none mono select-none" style={{ color: '#8ab4ff' }}>
        <span className="absolute top-[14%] left-[7%]  text-[80px] font-light opacity-[0.045] leading-none">€</span>
        <span className="absolute top-[68%] right-[10%] text-[64px] font-light opacity-[0.055] leading-none">Ft</span>
        <span className="absolute bottom-[8%] left-[22%] text-[56px] font-light opacity-[0.045] leading-none">$</span>
      </div>

      <div className="relative w-[380px]">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <Icon name="logo" className="w-7 h-7" />
          <div className="text-[18px] font-semibold tracking-tight text-white">Pocketbook</div>
        </div>

        <Card className="p-6 shadow-pb-3">
          <div className="text-center mb-5">
            <div className="text-[16px] font-semibold tracking-tight">Welcome back, Bence</div>
            <div className="text-[12.5px] text-muted-foreground mt-1">Sign in to your personal ledger</div>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <div>
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type={show ? 'text' : 'password'}
                value={pw}
                onChange={(e) => { setPw(e.target.value); setError(''); }}
                placeholder="••••••••••••"
                icon="lock"
                suffix={
                  <button type="button" onClick={(e) => { e.preventDefault(); setShow(!show); }} className="text-muted-foreground hover:text-foreground">
                    <Icon name={show ? 'eye-off' : 'eye'} className="w-3.5 h-3.5" />
                  </button>
                }
                autoFocus
              />
              {error && (
                <div className="mt-2 text-[12px] text-destructive flex items-center gap-1.5">
                  <Icon name="alert" className="w-3.5 h-3.5" /> {error}
                </div>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in
                </>
              ) : <>Sign in <Icon name="arrow-right" className="w-4 h-4" /></>}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-income animate-pulse" />
              homelab · pocketbook.local
            </span>
            <span className="mono">v0.4.2</span>
          </div>
        </Card>

        <div className="text-center text-[11px] text-white/55 mt-4">
          Self-hosted. No accounts, no tracking. Just your numbers.
        </div>
      </div>
    </div>
  );
};

window.LoginScreen = LoginScreen;
