import { NextStudio } from 'next-sanity/studio';
import config from '@/sanity.config';
import { isSanityConfigured } from '@/sanity/env';

// The Studio is a client-side app; this page just serves its shell. Owners sign in with their Sanity account.
export const dynamic = 'force-static';
import { metadata as studioMetadata } from 'next-sanity/studio';
export { viewport } from 'next-sanity/studio';
export const metadata = { ...studioMetadata, title: 'La Segundita Studio' };

export default function StudioPage() {
  if (!isSanityConfigured) return <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 560, margin: '15vh auto', padding: '0 20px', lineHeight: 1.6 }}>
    <h1>Studio not connected yet</h1>
    <p>Set <code>NEXT_PUBLIC_SANITY_PROJECT_ID</code> (and optionally <code>NEXT_PUBLIC_SANITY_DATASET</code>) in your environment, then restart or redeploy. See the README’s “Content management (Sanity)” section.</p>
  </main>;
  return <NextStudio config={config}/>;
}
