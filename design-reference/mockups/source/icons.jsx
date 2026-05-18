// Tiny inline icon set (Lucide-style, hand-tuned). Single stroke, 1.6 weight.
const Icon = ({ name, className = 'w-4 h-4', strokeWidth = 1.6 }) => {
  const props = {
    width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    className,
  };
  switch (name) {
    case 'wallet': return (<svg {...props}><path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2H5a2 2 0 0 0 0 4h15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><circle cx="16" cy="11" r="1.1" fill="currentColor" stroke="none"/></svg>);
    case 'home': return (<svg {...props}><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></svg>);
    case 'list': return (<svg {...props}><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>);
    case 'repeat': return (<svg {...props}><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>);
    case 'tag': return (<svg {...props}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><circle cx="7" cy="7" r="1.4" fill="currentColor" stroke="none"/></svg>);
    case 'calendar': return (<svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>);
    case 'sparkles': return (<svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="m6 6 2 2M16 16l2 2M16 8l2-2M6 18l2-2"/><circle cx="12" cy="12" r="2.4"/></svg>);
    case 'settings': return (<svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.24 16.97l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.03 4.24l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.76 7.03l-.06.06A1.7 1.7 0 0 0 19.4 9c.07.4.3.76.61 1a1.7 1.7 0 0 0 .94.04H21a2 2 0 1 1 0 4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></svg>);
    case 'plus': return (<svg {...props}><path d="M12 5v14M5 12h14"/></svg>);
    case 'search': return (<svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>);
    case 'arrow-up': return (<svg {...props}><path d="M12 19V5M5 12l7-7 7 7"/></svg>);
    case 'arrow-down': return (<svg {...props}><path d="M12 5v14M19 12l-7 7-7-7"/></svg>);
    case 'arrow-right': return (<svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>);
    case 'arrow-up-right': return (<svg {...props}><path d="M7 17 17 7M8 7h9v9"/></svg>);
    case 'pause': return (<svg {...props}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>);
    case 'stop': return (<svg {...props}><rect x="5" y="5" width="14" height="14" rx="2"/></svg>);
    case 'video': return (<svg {...props}><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8Z"/></svg>);
    case 'chevron-down': return (<svg {...props}><path d="m6 9 6 6 6-6"/></svg>);
    case 'chevron-right': return (<svg {...props}><path d="m9 6 6 6-6 6"/></svg>);
    case 'chevron-left': return (<svg {...props}><path d="m15 6-6 6 6 6"/></svg>);
    case 'check': return (<svg {...props}><path d="m20 6-11 11-5-5"/></svg>);
    case 'x': return (<svg {...props}><path d="M18 6 6 18M6 6l12 12"/></svg>);
    case 'sun': return (<svg {...props}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>);
    case 'moon': return (<svg {...props}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>);
    case 'lock': return (<svg {...props}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 1 1 8 0v3"/></svg>);
    case 'user': return (<svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>);
    case 'filter': return (<svg {...props}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5Z"/></svg>);
    case 'more': return (<svg {...props}><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>);
    case 'edit': return (<svg {...props}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>);
    case 'trash': return (<svg {...props}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>);
    case 'logout': return (<svg {...props}><path d="M15 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 17l-5-5 5-5M5 12h12"/></svg>);
    case 'check-circle': return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5L16 9.5"/></svg>);
    case 'alert': return (<svg {...props}><path d="M12 3 2 21h20L12 3Z"/><path d="M12 10v5M12 18v.5"/></svg>);
    case 'piggy': return (<svg {...props}><path d="M20 13c0 4-3.5 7-8 7s-8-3-8-7c0-2.4 1.5-4.5 4-5.7V5l2.5 1.5A11 11 0 0 1 12 6c4.5 0 8 3 8 7Z"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/></svg>);
    case 'currency': return (<svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9 9h4.5a2 2 0 1 1 0 4H9m0 0h4.5a2 2 0 1 1 0 4H9m3-12v14"/></svg>);
    case 'sliders': return (<svg {...props}><path d="M4 6h10M4 12h6M4 18h12"/><circle cx="18" cy="6" r="2"/><circle cx="14" cy="12" r="2"/><circle cx="20" cy="18" r="2"/></svg>);
    case 'eye': return (<svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>);
    case 'eye-off': return (<svg {...props}><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-3.5 4.3"/><path d="M6.6 6.6A16 16 0 0 0 2 12s3.5 6 10 6a10 10 0 0 0 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>);
    case 'logo': return (
      // Adopted direction: D — gauge arc in primary blue
      <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" className={className}>
        <path d="M5 20a11 11 0 0 1 22 0" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round"/>
        <path d="M5 20a11 11 0 0 1 11-11" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.35"/>
        <circle cx="16" cy="22" r="2.2" fill="hsl(var(--primary))"/>
      </svg>
    );
    // Logo exploration variants — selectable via spec/canvas
    case 'logo-pocket': return (
      // A: stylised "pocket" pouch with a coin peeking out
      <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" className={className}>
        <path d="M5 11a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v3c0 8-4 13-11 13S5 22 5 14v-3Z" fill="hsl(var(--income))"/>
        <path d="M5 11h22" stroke="hsl(var(--income))" strokeWidth="1.5" strokeOpacity="0.4"/>
        <circle cx="22" cy="13" r="3.5" fill="hsl(var(--background))" stroke="hsl(var(--income))" strokeWidth="1.4"/>
        <text x="22" y="15.5" textAnchor="middle" fontSize="4.5" fontWeight="700" fontFamily="Geist,system-ui" fill="hsl(var(--income))">$</text>
      </svg>
    );
    case 'logo-ledger': return (
      // B: open ledger book with stacked line entries
      <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" className={className}>
        <path d="M4 7c4-2 8-2 12 1v18c-4-3-8-3-12-1V7Z" fill="hsl(var(--income))" stroke="hsl(var(--income))" strokeWidth="0.5"/>
        <path d="M28 7c-4-2-8-2-12 1v18c4-3 8-3 12-1V7Z" fill="hsl(var(--income))" fillOpacity="0.55" stroke="hsl(var(--income))" strokeWidth="0.5"/>
        <line x1="7"  y1="13" x2="13" y2="14.5" stroke="hsl(var(--background))" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="7"  y1="17" x2="13" y2="18.5" stroke="hsl(var(--background))" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="7"  y1="21" x2="11" y2="22"   stroke="hsl(var(--background))" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="19" y1="14.5" x2="25" y2="13" stroke="hsl(var(--background))" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="19" y1="18.5" x2="25" y2="17" stroke="hsl(var(--background))" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    );
    case 'logo-arc': return (
      // D: gauge-arc in primary blue — adopted direction
      <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" className={className}>
        <path d="M5 20a11 11 0 0 1 22 0" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round"/>
        <path d="M5 20a11 11 0 0 1 11-11" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round" strokeOpacity="0.35"/>
        <circle cx="16" cy="22" r="2.2" fill="hsl(var(--primary))"/>
      </svg>
    );
    case 'logo-coin-p': return (
      // D: coin monogram — bold P inside a green disc
      <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" className={className}>
        <circle cx="16" cy="16" r="13" fill="hsl(var(--income))"/>
        <circle cx="16" cy="16" r="13" stroke="hsl(var(--background))" strokeOpacity="0.5" strokeWidth="0.8"/>
        <circle cx="16" cy="16" r="10.5" fill="none" stroke="hsl(var(--background))" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="1.5 1.5"/>
        <path d="M11 9h7a4.5 4.5 0 1 1 0 9h-3v6h-4V9Z" fill="hsl(var(--background))"/>
      </svg>
    );
    case 'logo-receipt': return (
      // E: receipt strip with zigzag bottom + bars
      <svg viewBox="0 0 32 32" width="1em" height="1em" fill="none" className={className}>
        <path d="M7 3h18v22l-3-2-3 2-3-2-3 2-3-2-3 2V3Z" fill="hsl(var(--income))" stroke="hsl(var(--income))" strokeWidth="0.5" strokeLinejoin="round"/>
        <rect x="10" y="8"  width="12" height="1.6" rx="0.8" fill="hsl(var(--background))"/>
        <rect x="10" y="12" width="8"  height="1.6" rx="0.8" fill="hsl(var(--background))"/>
        <rect x="10" y="16" width="10" height="1.6" rx="0.8" fill="hsl(var(--background))"/>
        <circle cx="22" cy="13" r="1.4" fill="hsl(var(--background))"/>
      </svg>
    );
    default: return null;
  }
};

window.Icon = Icon;
