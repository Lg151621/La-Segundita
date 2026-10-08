import Link from 'next/link';
import type { Metadata } from 'next';
import { Document } from '@/components/Document';
import { Butterfly } from '@/components/Decorations';
import { Icon } from '@/components/Icons';
import { copy } from '@/lib/i18n';
import './globals.css';

export const metadata: Metadata = { title: 'Page not found | La Segundita', robots: { index: false } };

export default function GlobalNotFound() {
  const en = copy.en.notFound, es = copy.es.notFound;
  return <Document lang="en"><main id="main" className="not-found chapter marigold"><div className="container">
    <Butterfly className="story-butterfly"/>
    <h1>{en.title}</h1>
    <p className="lede">{en.body}</p>
    <p className="lede" lang="es"><em>{es.title}. {es.body}</em></p>
    <div className="button-row centered"><Link href="/" className="button primary">{en.home}<Icon name="arrow"/></Link><Link href="/es/" className="button outline" lang="es">{es.home}<Icon name="arrow"/></Link></div>
  </div></main></Document>;
}
