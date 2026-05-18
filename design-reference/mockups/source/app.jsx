// App shell — sidebar nav + topbar + active screen. Theme toggle.

const NAV = [
{ id: 'dashboard', label: 'Dashboard', icon: 'home' },
{ id: 'transactions', label: 'Transactions', icon: 'list' },
{ id: 'recurring', label: 'Recurring', icon: 'repeat' },
{ id: 'renewals', label: 'Renewals', icon: 'calendar' },
{ id: 'categories', label: 'Categories', icon: 'tag' },
{ id: 'insights', label: 'AI Insights', icon: 'sparkles' },
{ id: 'settings', label: 'Settings', icon: 'settings' }];


const PocketbookApp = ({ initialScreen = 'dashboard', initialLoggedIn = true, theme: themeProp }) => {
  const [loggedIn, setLoggedIn] = React.useState(initialLoggedIn);
  const [screen, setScreen] = React.useState(initialScreen);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [theme, setTheme] = React.useState(themeProp || 'dark');
  const rootRef = React.useRef(null);

  // Apply theme to the local wrapper, not the global html. This means each artboard can have its own theme.
  React.useEffect(() => {
    if (rootRef.current) {
      rootRef.current.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  const showToast = (msg, tone = 'success') => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2200);
  };

  const onAddTx = () => {setEditing(null);setDrawerOpen(true);};
  const onEditTx = (t) => {setEditing(t);setDrawerOpen(true);};
  const onSubmit = () => {
    setDrawerOpen(false);
    showToast(editing ? 'Transaction updated' : 'Transaction added');
  };

  if (!loggedIn) {
    return (
      <div ref={rootRef} className={cn('w-full h-full bg-background text-foreground relative', theme === 'dark' && 'dark')}>
        <LoginScreen onLogin={() => setLoggedIn(true)} />
      </div>);

  }

  const ScreenComponent = {
    dashboard: Dashboard,
    transactions: Transactions,
    recurring: Recurring,
    categories: Categories,
    renewals: Renewals,
    insights: Insights,
    settings: Settings
  }[screen];

  const activeNav = NAV.find((n) => n.id === screen);

  return (
    <div ref={rootRef} className={cn('w-full h-full bg-background text-foreground flex relative overflow-hidden p-3 gap-3', theme === 'dark' && 'dark')}>
      {/* Sidebar island */}
      <aside className="w-[220px] flex-shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden relative">
        {/* Decorative bg */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 220 800">
          <defs>
            <radialGradient id="sb-glow-top" cx="20%" cy="0%" r="80%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.09" />
              <stop offset="60%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="sb-glow-bot" cx="100%" cy="100%" r="70%">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
              <stop offset="70%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="220" height="800" fill="url(#sb-glow-top)" />
          <rect width="220" height="800" fill="url(#sb-glow-bot)" />
          {/* Curvy decorative path */}
          <path d="M -20 380 Q 80 360, 120 420 T 260 480" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.06" strokeWidth="40" strokeLinecap="round" />
        </svg>

        <div className="relative px-4 pt-4 pb-3 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-pb-1">
            <Icon name="logo" className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[14px] font-semibold tracking-tight leading-none">Pocketbook</div>
            <div className="text-[10.5px] text-muted-foreground mono mt-1">homelab · v0.4.2</div>
          </div>
        </div>

        <div className="relative px-3 mt-2 mb-1.5">
          <div className="text-[9.5px] mono uppercase tracking-[0.12em] text-muted-foreground/70 pl-2.5">Workspace</div>
        </div>

        <nav className="relative px-2 flex-1 space-y-0.5">
          {NAV.map((n) => {
            const active = screen === n.id;
            return (
              <button key={n.id} onClick={() => setScreen(n.id)}
              className={cn('group w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-full text-[12.5px] transition-all relative',
              active ?
              'bg-primary text-primary-foreground font-medium shadow-pb-1' :
              'text-foreground/70 hover:text-foreground hover:bg-accent/60'
              )}>
                <span className={cn('w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0',
                active ? 'bg-white/15' : 'bg-secondary/60 border border-border group-hover:border-ring/30'
                )}>
                  <Icon name={n.icon} className="w-3.5 h-3.5" />
                </span>
                <span className="flex-1 text-left">{n.label}</span>
                {n.id === 'renewals' &&
                <span className={cn('mono text-[10px] rounded-full px-1.5 py-0.5 leading-none',
                active ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                )}>6</span>
                }
              </button>);

          })}
        </nav>

        {/* Quick add — sole footer */}
        <div className="relative px-3 pb-3 mt-2">
          <button onClick={onAddTx}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-full bg-secondary/80 backdrop-blur border border-border hover:border-ring/40 text-[12px] transition-colors">
            <span className="w-5 h-5 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0">
              <Icon name="plus" className="w-3 h-3" />
            </span>
            <span className="text-foreground/80">Quick add</span>
            <span className="ml-auto mono text-[10px] text-muted-foreground border border-border rounded px-1">N</span>
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Top header bar — island */}
        <header className="flex-shrink-0 bg-card border border-border rounded-2xl px-4 h-[68px] flex items-center gap-4">
          <div className="pl-1 pr-2">
            <div className="text-[10.5px] mono uppercase tracking-wider text-muted-foreground leading-none">Monday · 18 May 2026</div>
          </div>
          <div className="w-px h-7 bg-border" />
          <div className="flex-1 max-w-[420px]">
            <Input icon="search" placeholder="Search transactions, subs, categories…" suffix="⌘K" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button title="Notifications" className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent relative">
              <Icon name="alert" className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-expense" />
            </button>
            <button title="Inbox" className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
              <Icon name="list" className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-border mx-1.5" />
            <button onClick={() => setLoggedIn(false)} className="flex items-center gap-2.5 pr-1 hover:opacity-90 transition" title="Sign out">
              <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[12px] font-semibold text-primary">B</div>
              <div className="leading-tight text-left">
                <div className="text-[12.5px] font-medium">Bence</div>
                <div className="text-[10.5px] text-muted-foreground mono">bence@home.lan</div>
              </div>
            </button>
          </div>
        </header>

        {/* Screen content area */}
        <main className="flex-1 overflow-auto relative">
          <ScreenComponent
            onNavigate={setScreen}
            onAddTx={onAddTx}
            onAddRule={onAddTx}
            onEditTx={onEditTx}
            onGenerateInsights={() => setScreen('insights')} />
          
          <AddTransaction
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            editing={editing}
            onSubmit={onSubmit} />
          
          <Toast visible={!!toast} tone={toast?.tone}>{toast?.msg}</Toast>
        </main>
      </div>
    </div>);

};

window.PocketbookApp = PocketbookApp;