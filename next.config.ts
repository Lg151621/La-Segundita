import type { NextConfig } from 'next';

// Hosted on a Next.js server (e.g. Vercel) so Sanity edits reach the live site without a rebuild:
// pages are static and refresh from Sanity hourly, or right away via /api/revalidate/.
const config: NextConfig = {
  trailingSlash: true,
  // Two root layouts (English and Spanish, plus the Studio) need a global 404 page.
  experimental: { globalNotFound: true },
  // Baseline security headers on every response. Nothing here needs to be framed (the Studio has no
  // Presentation tool), so framing is denied everywhere: this blocks clickjacking, mainly of the Studio.
  // frame-ancestors is the only CSP directive on purpose; a full script/style policy is a separate step.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};
export default config;
