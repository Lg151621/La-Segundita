'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { navigation } from '@/lib/store';
import { copy, pagePath, t, type Lang } from '@/lib/i18n';
import { Butterfly } from './Decorations';
import { Icon } from './Icons';

export function Brand({ lang }: { lang: Lang }) { return <Link className="brand" href={pagePath('home', lang)} aria-label={copy[lang].brandHome}><Butterfly/><span className="brand-name">La Segundita<small>{copy[lang].brandTagline}</small></span></Link>; }

export function Header({ lang }: { lang: Lang }) {
  const c = copy[lang];
  const pathname = usePathname() || '/';
  const page = pathname.includes('our-story') ? 'story' : 'home';
  const other: Lang = lang === 'en' ? 'es' : 'en';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [section, setSection] = useState<string | null>(null);

  // Shade the masthead once scrolled (its height never changes), and on Home highlight the last section whose top has passed 40% of the viewport.
  useEffect(() => {
    const ids = page === 'home' ? navigation.flatMap(n => (n.hash ? [n.hash] : [])) : [];
    let frame = 0;
    const update = () => {
      frame = 0;
      // Hysteresis: the shadow appears past 24px and clears under 8px, so small scrolls near the top can't flicker it.
      const y = window.scrollY;
      setScrolled(s => (s ? y > 8 : y > 24));
      const line = window.innerHeight * 0.4;
      setSection(ids.filter(id => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= line).pop() ?? null);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); };
  }, [page]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return <header className={`header${scrolled ? ' scrolled' : ''}${open ? ' menu-open' : ''}`}>
    <div className="header-inner">
      <Brand lang={lang}/>
      <nav id="main-navigation" aria-label={c.mainNav} className={open ? 'nav open' : 'nav'}>
        {navigation.map(n => {
          const current = n.hash ? page === 'home' && section === n.hash : page === n.page && (n.page === 'story' || !section);
          return <Link key={t(n.label, 'en')} href={`${pagePath(n.page, lang)}${n.hash ? `#${n.hash}` : ''}`} aria-current={current ? (n.hash ? 'location' : 'page') : undefined} onClick={() => setOpen(false)}>{t(n.label, lang)}</Link>;
        })}
      </nav>
      <a className="lang-switch" href={pagePath(page, other)} hrefLang={other} lang={other} aria-label={c.switchLang} onClick={e => { if (window.location.hash) e.currentTarget.href = pagePath(page, other) + window.location.hash; }}>
        <Icon name="globe"/><span className="lang-full">{c.switchLang}</span><span className="lang-short" aria-hidden="true">{c.switchLangShort}</span>
      </a>
      <button type="button" className="menu-toggle" aria-label={open ? c.closeNav : c.openNav} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}><Icon name={open ? 'close' : 'menu'}/></button>
    </div>
  </header>;
}
