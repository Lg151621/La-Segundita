import { fontVariables } from '@/lib/fonts';
import { copy, t, type Lang } from '@/lib/i18n';
import { getSiteContent } from '@/lib/content';
import { Header } from './Header';
import { Footer } from './Footer';
import { Flower } from './Decorations';

// Shared <html> shell for the English and Spanish root layouts.
export async function Document({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const { settings, announcement } = await getSiteContent();
  return <html lang={lang} className={fontVariables}><body>
    <a className="skip-link" href="#main">{copy[lang].skip}</a>
    {announcement && <aside className="announcement" aria-label={copy[lang].announcementLabel}><Flower/><p>{t(announcement, lang)}</p><Flower/></aside>}
    <Header lang={lang}/>{children}<Footer lang={lang} settings={settings}/>
  </body></html>;
}
