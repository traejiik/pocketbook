// Main entry — design canvas with: spec view, prototype, individual screens.

function Root() {
  return (
    <DesignCanvas>
      {/* Logo explorations — pick the direction you want adopted globally */}
      <DCSection id="logos" title="Logo explorations">
        <DCArtboard id="logo-options" label="5 directions · current credit-card icon → choose a replacement" width={1280} height={420}>
          <LogoExplorations />
        </DCArtboard>
      </DCSection>

      {/* Spec doc — one wide artboard */}
      <DCSection id="spec" title="Design system">
        <DCArtboard id="spec-doc" label="Visual identity, tokens, components, interaction notes" width={1200} height={2580}>
          <SpecView />
        </DCArtboard>
      </DCSection>

      {/* Live prototype — full app with sidebar nav */}
      <DCSection id="proto" title="Interactive prototype">
        <DCArtboard id="proto-app" label="Full app · click sidebar to navigate, click +N to add transaction, sun icon to swap theme" width={1280} height={860}>
          <PocketbookApp initialScreen="dashboard" initialLoggedIn={true} />
        </DCArtboard>
        <DCArtboard id="proto-login" label="Login · single user" width={1280} height={860}>
          <PocketbookApp initialScreen="dashboard" initialLoggedIn={false} />
        </DCArtboard>
      </DCSection>

      {/* All 9 screens, side-by-side, dark theme */}
      <DCSection id="screens-dark" title="All 9 screens · dark mode (default)">
        <DCArtboard id="s1" label="1 · Login" width={1280} height={860}>
          <PocketbookApp initialScreen="dashboard" initialLoggedIn={false} />
        </DCArtboard>
        <DCArtboard id="s2" label="2 · Dashboard" width={1280} height={1100}>
          <PocketbookApp initialScreen="dashboard" />
        </DCArtboard>
        <DCArtboard id="s3" label="3 · Transactions" width={1280} height={1240}>
          <PocketbookApp initialScreen="transactions" />
        </DCArtboard>
        <DCArtboard id="s4" label="4 · Add transaction (drawer open over transactions)" width={1280} height={1100}>
          <AppWithDrawerOpen />
        </DCArtboard>
        <DCArtboard id="s5" label="5 · Recurring rules" width={1280} height={1180}>
          <PocketbookApp initialScreen="recurring" />
        </DCArtboard>
        <DCArtboard id="s6" label="6 · Categories" width={1280} height={1200}>
          <PocketbookApp initialScreen="categories" />
        </DCArtboard>
        <DCArtboard id="s7" label="7 · Upcoming renewals" width={1280} height={1340}>
          <PocketbookApp initialScreen="renewals" />
        </DCArtboard>
        <DCArtboard id="s8" label="8 · AI Insights" width={1280} height={1220}>
          <PocketbookApp initialScreen="insights" />
        </DCArtboard>
        <DCArtboard id="s9" label="9 · Settings" width={1280} height={1560}>
          <PocketbookApp initialScreen="settings" />
        </DCArtboard>
      </DCSection>

      {/* Light mode parity */}
      <DCSection id="screens-light" title="Light mode parity">
        <DCArtboard id="l-dash" label="Dashboard · light" width={1280} height={1100}>
          <PocketbookApp initialScreen="dashboard" theme="light" />
        </DCArtboard>
        <DCArtboard id="l-tx" label="Transactions · light" width={1280} height={1240}>
          <PocketbookApp initialScreen="transactions" theme="light" />
        </DCArtboard>
        <DCArtboard id="l-insights" label="Insights · light" width={1280} height={1220}>
          <PocketbookApp initialScreen="insights" theme="light" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

// Logo explorations panel
function LogoExplorations() {
  const options = [
    { id: 'logo',         name: 'A · Card (current)', desc: 'Credit-card pouch with a P + coin. Reads like generic fintech.' },
    { id: 'logo-pocket',  name: 'B · Pocket pouch',   desc: 'A pocket with a coin peeking out. Most literal to "Pocketbook."' },
    { id: 'logo-ledger',  name: 'C · Open ledger',    desc: 'Two facing pages with line entries. Evokes the book half of the name.' },
    { id: 'logo-arc',     name: 'D · Gauge arc',      desc: 'Half-circle echoing the dashboard\'s "Income used" meter. Most abstract, most product-native.' },
    { id: 'logo-coin-p',  name: 'E · Coin monogram',  desc: 'Bold P inside a coin disc with milled edge. App-icon friendly.' },
    { id: 'logo-receipt', name: 'F · Receipt',        desc: 'Torn receipt with line items. Tactile, transactional.' },
  ];
  return (
    <div className="w-full h-full bg-background text-foreground p-8 overflow-auto">
      <div className="mb-5">
        <div className="text-[20px] font-semibold tracking-tight">Pick a logo direction</div>
        <div className="text-[12.5px] text-muted-foreground mt-1">Once you choose, I'll wire it in everywhere the current "card" mark appears (sidebar, login, browser favicon).</div>
      </div>
      <div className="grid grid-cols-6 gap-4">
        {options.map(o => (
          <div key={o.id} className="rounded-2xl border border-border bg-card p-5 flex flex-col">
            {/* Big mark */}
            <div className="aspect-square w-full rounded-xl bg-secondary/40 border border-border flex items-center justify-center mb-3">
              <Icon name={o.id} className="w-20 h-20" />
            </div>
            {/* In-context: sidebar header preview */}
            <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-md bg-secondary/50">
              <Icon name={o.id} className="w-5 h-5" />
              <span className="text-[12px] font-semibold tracking-tight">Pocketbook</span>
            </div>
            {/* Favicon-size preview */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mono mb-3">
              <Icon name={o.id} className="w-3 h-3" />
              <span>16px</span>
              <span className="text-border">·</span>
              <Icon name={o.id} className="w-4 h-4" />
              <span>24px</span>
            </div>
            <div className="mt-auto">
              <div className="text-[12.5px] font-semibold tracking-tight">{o.name}</div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{o.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper: app with drawer pre-opened for screen 4
function AppWithDrawerOpen() {
  const ref = React.useRef(null);
  React.useEffect(() => {
    // After mount, click "Add transaction" button to open the drawer
    setTimeout(() => {
      const btns = ref.current?.querySelectorAll('button');
      if (!btns) return;
      for (const b of btns) {
        if (b.textContent && b.textContent.trim().toLowerCase().startsWith('add transaction')) {
          b.click();
          break;
        }
      }
    }, 50);
  }, []);
  return <div ref={ref} className="w-full h-full"><PocketbookApp initialScreen="transactions" /></div>;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Root />);
