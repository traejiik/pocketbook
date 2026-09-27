/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['192.168.0.58'],
  experimental: {
    // React <ViewTransition> on navigations — see components/shell/PageTransition.tsx.
    viewTransition: true,
  },
};

export default nextConfig;
