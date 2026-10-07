export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation';

// Settings is split into subpages; the bare route opens the first one.
export default function SettingsPage() {
  redirect('/settings/general');
}
