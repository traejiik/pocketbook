import type { MetadataRoute } from 'next';

// Web app manifest. Next.js serves this at /manifest.webmanifest and auto-injects
// the <link rel="manifest"> tag. No middleware exists, so it is not auth-gated.
//
// The hex colors below are an intentional exception to the "no hardcoded hex"
// rule: the manifest format requires literal color strings and cannot reference
// CSS variables. They are derived from --background of `.dark.shell-twotone` in
// app/globals.css; keep them in sync if that shell background changes.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Pocketbook',
    short_name: 'Pocketbook',
    description: 'Self-hosted personal finance',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0E0F14',
    theme_color: '#0E0F14',
    lang: 'en',
    dir: 'ltr',
    categories: ['finance'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
