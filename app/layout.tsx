import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const sans = GeistSans;
const mono = GeistMono;

export const metadata: Metadata = {
  title: 'Pocketbook',
  description: 'Self-hosted personal finance',
  applicationName: 'Pocketbook',
  // iOS Safari ignores the manifest for the home screen — these drive the
  // standalone install (apple-touch-icon + apple-mobile-web-app meta tags).
  appleWebApp: { capable: true, title: 'Pocketbook', statusBarStyle: 'default' },
  icons: {
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

// themeColor must live in the viewport export, not metadata. Dark is the
// permanent first-render default, so a single dark value is correct. The hex is
// derived from --background of `.dark.shell-twotone` in app/globals.css.
export const viewport: Viewport = {
  themeColor: '#0E0F14',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} dark shell-twotone`} suppressHydrationWarning>
      <body className="font-sans bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-card focus:border focus:border-border focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-ring/60"
          >
            Skip to main content
          </a>
          {children}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
