import Link from 'next/link';
import { navigation, store } from '@/lib/store';
import { copy, pagePath, t, type Lang } from '@/lib/i18n';
import { Brand } from './Header';
import { ActionLink } from './Links';
import { DecorativeDivider } from './Decorations';

const socialName = (name: string) => (name === 'tiktok' ? 'TikTok' : name.charAt(0).toUpperCase() + name.slice(1));

export function Footer({ lang }: { lang: Lang }) {
  const c = copy[lang], f = c.footer;
  return <footer className="footer"><div className="container">
    <div className="footer-main">
      <div className="footer-brand"><Brand lang={lang}/><p>{f.tagline[0]}<br/>{f.tagline[1]}</p></div>
      <div className="footer-col"><h2>{f.explore}</h2><nav aria-label={c.footerNav}><ul>{navigation.map(n => <li key={t(n.label, 'en')}><Link href={`${pagePath(n.page, lang)}${n.hash ? `#${n.hash}` : ''}`} className="footer-link">{t(n.label, lang)}</Link></li>)}</ul></nav></div>
      <div className="footer-col"><h2>{f.follow}</h2><ul>{Object.entries(store.socials).map(([name, href]) => <li key={name}><ActionLink lang={lang} href={href} className="footer-link" label={`${f.our} ${socialName(name)}`}>{socialName(name)}</ActionLink></li>)}</ul></div>
      <div className="footer-col"><h2>{f.visit}</h2><address>{t(store.address, lang)}<br/>{c.visit.weekdays}: {t(store.hours.weekdays, lang)}<br/>{c.visit.sunday}: {t(store.hours.sunday, lang)}<br/>{t(store.phone, lang)}</address></div>
    </div>
    <DecorativeDivider className="light"/>
    <div className="footer-bottom"><span>{f.rights}</span><span>{f.motto}</span></div>
  </div></footer>;
}
