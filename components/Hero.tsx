'use client';
import { useState } from 'react';
import type { SiteContent } from '@/lib/content';
import { hoursRows } from '@/lib/hours';
import { cityLabel } from '@/lib/site';
import { copy, t, type Lang } from '@/lib/i18n';
import { Photo } from './Photo';
import { Butterfly, Flower } from './Decorations';
import { Icon } from './Icons';
import { ActionLink } from './Links';

export function Hero({ lang, photos, settings }: { lang: Lang; photos: SiteContent['photos']; settings: SiteContent['settings'] }) {
  const c = copy[lang], h = c.hero;
  const [inside, setInside] = useState(false);
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-inner">
      <div className="hero-copy">
        <span className="tag-label">{h.eyebrow}</span>
        <h1 id="hero-title"><span>{h.title[0]}</span> <em>{h.title[1]}</em></h1>
        <p className="lede">{h.lede}</p>
        <div className="hero-actions">
          <a href="#visit" className="button primary">{h.visit}<Icon name="arrow"/></a>
          <a href="#fresh-finds" className="text-link">{h.explore}<Icon name="arrow"/></a>
        </div>
      </div>
      <figure className={`hero-print${inside ? ' is-inside' : ''}`}>
        <div className="print-frame">
          <div className="print-layer outside" aria-hidden={inside}><Photo lang={lang} source={photos.storefront} type="storefront" label={h.outside} sizes="(max-width: 900px) 92vw, 46vw" priority/></div>
          <div className="print-layer inside" aria-hidden={!inside}><Photo lang={lang} source={photos.inside} type="interior" label={h.inside} sizes="(max-width: 900px) 92vw, 46vw"/></div>
        </div>
        <figcaption className="print-controls">
          <span aria-live="polite">{inside ? h.insideCaption : h.outsideCaption}</span>
          <button type="button" onClick={() => setInside(!inside)} aria-pressed={inside}>{inside ? h.seeOutside : h.seeInside}<Icon name="arrow"/></button>
        </figcaption>
        <div className="stamp" aria-hidden="true"><span>{h.stamp[0]}</span><em>{h.stamp[1]}</em><span>{h.stamp[2]}</span></div>
        <Butterfly className="hero-butterfly"/>
        <Flower className="hero-flower"/>
      </figure>
    </div>
    <div className="visit-strip">
      <dl>
        <div><dt><Icon name="pin"/>{c.visit.location}</dt><dd>{cityLabel(t(settings.address, lang)) ?? t(settings.address, lang)}</dd></div>
        <div><dt><Icon name="clock"/>{c.visit.hours}</dt><dd>{hoursRows(settings.hours, c.visit.short).map((r, i) => <span key={r.day} className="strip-hours">{i > 0 && <span aria-hidden="true"> · </span>}{r.label}: {t(r.value, lang)}</span>)}</dd></div>
      </dl>
      <ActionLink lang={lang} href={settings.directions} className="button ink" label={c.directionsLabel}>{c.visit.directions}</ActionLink>
    </div>
  </section>;
}
