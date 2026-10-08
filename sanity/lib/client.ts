import { createClient } from 'next-sanity';
import { apiVersion, dataset, fallbackRevalidateSeconds, isSanityConfigured, projectId, sanityCacheTag } from '../env';

// Read-only client for published content. It reads the live API rather than Sanity's API CDN: the site caches
// pages itself, so traffic to Sanity stays tiny, and a refresh right after a publish never gets a stale CDN answer.
export const client = isSanityConfigured ? createClient({ projectId, dataset, apiVersion, useCdn: false, perspective: 'published' }) : null;

// Development always fetches fresh content. Production caches it until Sanity's publish webhook invalidates the tag.
const cacheOptions = process.env.NODE_ENV === 'development'
  ? { cache: 'no-store' as const }
  : { next: { revalidate: fallbackRevalidateSeconds, tags: [sanityCacheTag] } };

export async function sanityFetch<T>(query: string): Promise<T | null> {
  if (!client) return null;
  try {
    return await client.fetch<T>(query, {}, cacheOptions);
  } catch (error) {
    // A Sanity outage should never take the site down: fall back to the built-in content.
    console.error('[sanity] fetch failed, using fallback content:', error);
    return null;
  }
}
