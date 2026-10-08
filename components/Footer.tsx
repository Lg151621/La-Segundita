import Link from 'next/link';
import { navigation } from '@/lib/store';
import type { SiteContent } from '@/lib/content';
import { cityLabel } from '@/lib/site';
import { copy, pagePath, t, type Lang } from '@/lib/i18n';
import { Brand } from './Header';
import { ActionLink } from './Links';
import { DecorativeDivider } from './Decorations';

const socialName = (name: string) => (name === 'tiktok' ? 'TikTok' : name.charAt(0).toUpperCase() + name.slice(1));

export function Footer({ lang, settings }: { lang: Lang; settings: SiteContent['settings'] }) {
  const c = copy[lang], f = c.footer, place = cityLabel(t(settings.address, lang));
  return <footer className="footer"><div className="container">
    <div className="footer-main">
      <div className="footer-brand"><Brand lang={lang}/><p>{f.tagline[0]}<br/>{f.tagline[1]}</p>{place && <p className="footer-fact">{c.meta.businessType} · {place}</p>}</div>
      <div className="footer-col"><p className="footer-heading">{f.explore}</p><nav aria-label={c.footerNav}><ul>{navigation.map(n => <li key={t(n.label, 'en')}><Link href={`${pagePath(n.page, lang)}${n.hash ? `#${n.hash}` : ''}`} className="footer-link">{t(n.label, lang)}</Link></li>)}</ul></nav></div>
      <div className="footer-col"><p className="footer-heading">{f.follow}</p><ul>{Object.entries(settings.socials).map(([name, href]) => <li key={name}><ActionLink lang={lang} href={href} className="footer-link" label={`${f.our} ${socialName(name)}`}>{socialName(name)}</ActionLink></li>)}</ul></div>
      <div className="footer-col"><p className="footer-heading">{f.visit}</p><address>{t(settings.address, lang)}<br/>{settings.phoneHref ? <a className="footer-link" href={settings.phoneHref}>{t(settings.phone, lang)}</a> : t(settings.phone, lang)}</address><Link href={`${pagePath('home', lang)}#visit`} className="footer-link footer-hours-link">{f.hoursLink}</Link></div>
    </div>
    <DecorativeDivider className="light"/>
    <div className="footer-bottom"><span>{f.rights}</span><span>{f.motto}</span></div>
  </div></footer>;
}
