import Link from 'next/link';
import { store } from '@/lib/store';
import { copy, pagePath, t, type Lang } from '@/lib/i18n';
import { Photo } from './Photo';
import { Butterfly, DecorativeDivider, Flower, Garland } from './Decorations';
import { ActionLink } from './Links';
import { Icon } from './Icons';

const our = (lang: Lang, name: string) => `${copy[lang].footer.our} ${name}`;

export function WelcomeSection({ lang }: { lang: Lang }) {
  const w = copy[lang].welcome;
  return <section className="welcome chapter paper" aria-labelledby="welcome-title"><div className="container welcome-grid">
    <figure className="welcome-photo reveal">
      <div className="mounted"><Photo lang={lang} src={store.photos.welcome} label={w.photo}/></div>
      <figcaption className="photo-caption">{w.caption}</figcaption>
    </figure>
    <div className="welcome-copy reveal">
      <span className="tag-label">{w.eyebrow}</span>
      <h2 id="welcome-title">{w.title[0]}<br/>{w.title[1]}</h2>
      <h3 className="deck">{w.subtitle}</h3>
      <p className="dropcap">{w.body}</p>
      <div className="family-link"><Link href={pagePath('story', lang)} className="button secondary">{w.cta}<Icon name="arrow"/></Link><Butterfly/></div>
    </div>
  </div></section>;
}

export function FreshFinds({ lang }: { lang: Lang }) {
  const f = copy[lang].finds;
  return <section id="fresh-finds" className="finds chapter parchment" aria-labelledby="finds-title"><div className="container">
    <div className="section-heading split">
      <div><span className="tag-label">{f.eyebrow}</span><h2 id="finds-title">{f.title}</h2></div>
      <p className="aside-note">{f.intro[0]}<br/>{f.intro[1]}</p>
    </div>
    <div className="clothesline">
      <ul className="tag-rack">{store.finds.map((item, i) => <li className="find-tag" key={t(item.name, 'en')} style={{ '--i': i } as React.CSSProperties}>
        <article aria-labelledby={`find-${i}`}>
          <span className="tag-hole" aria-hidden="true"/>
          <Photo lang={lang} src={item.image} label={t(item.name, lang)} type={item.type} sizes="(max-width: 760px) 46vw, 24vw"/>
          <div className="find-title"><h3 id={`find-${i}`}>{t(item.name, lang)}</h3><span className="lot">{f.lot} 0{i + 1}</span></div>
        </article>
      </li>)}</ul>
    </div>
    <div className="finds-bottom">
      <div><p>{f.follow}</p><small>{f.note}</small></div>
      <div className="button-row"><ActionLink lang={lang} href={store.socials.tiktok} className="button outline" label={our(lang, 'TikTok')}>{f.tiktok}</ActionLink><ActionLink lang={lang} href={store.socials.instagram} className="button outline" label={our(lang, 'Instagram')}>{f.instagram}</ActionLink></div>
    </div>
    <DecorativeDivider/>
  </div></section>;
}

export function WhyShop({ lang }: { lang: Lang }) {
  const y = copy[lang].why;
  const marks = [<Icon key="r" name="recycle"/>, <Icon key="t" name="tag"/>, <Butterfly key="b"/>];
  return <section className="why chapter chocolate" aria-labelledby="why-title"><div className="container">
    <span className="tag-label light">{y.eyebrow}</span>
    <h2 id="why-title">{y.title}</h2>
    <div className="why-grid">{y.items.map((item, i) => <article className="reveal" key={item.title}><span className="benefit-mark" aria-hidden="true">{marks[i]}</span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div>
  </div></section>;
}

export function SocialSection({ lang }: { lang: Lang }) {
  const s = copy[lang].social;
  return <section className="social chapter rose" aria-labelledby="social-title"><div className="container">
    <div className="social-heading">
      <span className="tag-label light">{s.eyebrow}</span>
      <h2 id="social-title">{s.title} <Butterfly/></h2>
      <p>{s.body}</p>
    </div>
    <ul className="contact-sheet">{store.socialPhotos.map((photo, i) => <li className={`print tile-${i}`} key={t(photo.label, 'en')}>
      <span className="tape" aria-hidden="true"/>
      <Photo lang={lang} src={photo.image} label={t(photo.label, lang)} type={photo.type} sizes="(max-width: 760px) 80vw, 30vw"/>
      <span className="print-label">{t(photo.label, lang)}</span>
    </li>)}</ul>
    <div className="button-row centered"><ActionLink lang={lang} href={store.socials.instagram} className="button cream" label={our(lang, 'Instagram')}>{s.instagram}</ActionLink><ActionLink lang={lang} href={store.socials.tiktok} className="button outline light" label={our(lang, 'TikTok')}>{s.tiktok}</ActionLink></div>
    <Flower className="social-flower"/>
  </div></section>;
}

export function VisitSection({ lang }: { lang: Lang }) {
  const v = copy[lang].visit;
  return <section id="visit" className="visit chapter paper" aria-labelledby="visit-title"><div className="container visit-grid">
    <div className="visit-copy">
      <span className="tag-label">{v.eyebrow}</span>
      <h2 id="visit-title">{v.title[0]}<br/>{v.title[1]}</h2>
      <dl className="hours-sign">
        <div><dt><Icon name="pin"/>{v.address}</dt><dd>{t(store.address, lang)}</dd></div>
        <div><dt><Icon name="clock"/>{v.hours}</dt><dd><span className="row"><span>{v.weekdays}</span><i aria-hidden="true"/><span>{t(store.hours.weekdays, lang)}</span></span><span className="row"><span>{v.sunday}</span><i aria-hidden="true"/><span>{t(store.hours.sunday, lang)}</span></span></dd></div>
        <div><dt><Icon name="phone"/>{v.phone}</dt><dd>{t(store.phone, lang)}</dd></div>
      </dl>
      <ActionLink lang={lang} href={store.directions} className="button primary" label={copy[lang].directionsLabel}>{v.directions}</ActionLink>
    </div>
    <div className="map-print" role="img" aria-label={v.mapLabel}>
      <div className="map" aria-hidden="true"><div className="map-block block-1"/><div className="map-block block-2"/><div className="map-block block-3"/><div className="map-road road-1"/><div className="map-road road-2"/><div className="map-road road-3"/><svg className="compass" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="none" stroke="currentColor"/><path d="M20 5l4 15-4 15-4-15z" fill="currentColor"/><text x="20" y="4.5" textAnchor="middle" fontSize="5" fill="currentColor">N</text></svg></div>
      <div className="map-card" aria-hidden="true"><Icon name="pin"/><strong>La Segundita</strong><p>{v.mapTagline}</p><small>{v.mapSoon}</small></div>
    </div>
  </div></section>;
}

export function ContactSection({ lang }: { lang: Lang }) {
  const c = copy[lang].contact;
  return <section id="contact" className="contact chapter marigold" aria-labelledby="contact-title"><Garland/><div className="container">
    <span className="tag-label">{c.eyebrow}</span>
    <h2 id="contact-title">{c.title}</h2>
    <p>{c.body}</p>
    <div className="button-row centered"><ActionLink lang={lang} href={store.phoneHref} className="button primary" label={copy[lang].phoneLabel}>{c.call}</ActionLink><ActionLink lang={lang} href={store.socials.instagram} className="button outline" label={our(lang, 'Instagram')}>{c.message}</ActionLink></div>
  </div></section>;
}
