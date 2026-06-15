import type { Metadata } from 'next';
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
