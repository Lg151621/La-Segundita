import { fontVariables } from '@/lib/fonts';
import { copy, type Lang } from '@/lib/i18n';
import { Header } from './Header';
import { Footer } from './Footer';

// Shared <html> shell for the English and Spanish root layouts.
export function Document({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <html lang={lang} className={fontVariables}><body><a className="skip-link" href="#main">{copy[lang].skip}</a><Header lang={lang}/>{children}<Footer lang={lang}/></body></html>;
}
