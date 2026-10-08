// The public site address for canonical links, the sitemap, robots, and structured data.
// Set NEXT_PUBLIC_SITE_URL in production; on Vercel the production domain is used automatically if it is missing.
const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')).replace(/\/$/, '');
export const absoluteUrl = (path: string) => new URL(path, siteUrl).href;

// "141 N Broadway, Blythe, CA 92225" → its parts; null for anything else (placeholders, free text), so nothing is guessed.
export type PostalAddress = { streetAddress: string; addressLocality: string; addressRegion: string; postalCode?: string };
export function parseAddress(text: string): PostalAddress | null {
  const m = text.trim().match(/^(.+?),\s*([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/);
  return m ? { streetAddress: m[1], addressLocality: m[2], addressRegion: m[3], ...(m[4] && { postalCode: m[4] }) } : null;
}
// "Blythe, CA" when the address can be read, otherwise null.
export const cityLabel = (text: string) => { const a = parseAddress(text); return a ? `${a.addressLocality}, ${a.addressRegion}` : null; };
