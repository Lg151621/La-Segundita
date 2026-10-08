import type { NextConfig } from 'next';

// Hosted on a Next.js server (e.g. Vercel) so Sanity edits reach the live site without a rebuild:
// pages are static and refresh from Sanity hourly, or right away via /api/revalidate/.
const config: NextConfig = {
  trailingSlash: true,
  // Two root layouts (English and Spanish, plus the Studio) need a global 404 page.
  experimental: { globalNotFound: true },
};
export default config;
