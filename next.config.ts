import type { NextConfig } from 'next';
// Static export: next/image keeps lazy loading and sizing, but skips the server optimizer.
// Export photos at roughly 2x their displayed size (about 1600px wide) before adding them to public/images/.
const config: NextConfig = { output: 'export', trailingSlash: true, images: { unoptimized: true },
  // Two root layouts (English and Spanish) need a global 404 page.
  experimental: { globalNotFound: true } };
export default config;
