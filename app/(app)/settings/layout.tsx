import { SettingsSectionNav } from './SettingsSectionNav';

// Shared frame for every settings subpage. The section chips live here so they
// persist across section changes instead of remounting with each page.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 lg:px-7 pb-9 pt-1 max-w-[860px] mx-auto">
      <SettingsSectionNav />
      {children}
    </div>
  );
}
