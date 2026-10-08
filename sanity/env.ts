// Sanity connection settings. Until NEXT_PUBLIC_SANITY_PROJECT_ID is set, the site shows its built-in placeholders.
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
export const apiVersion = '2026-10-01';
export const isSanityConfigured = projectId !== '';
// Publishing in Sanity refreshes the live site immediately through the webhook (/api/revalidate/).
// This is only a safety net in case a webhook call is missed (seconds).
export const fallbackRevalidateSeconds = 3600;
// The one cache tag on every Sanity fetch; the webhook invalidates exactly this, nothing else.
export const sanityCacheTag = 'sanity';
