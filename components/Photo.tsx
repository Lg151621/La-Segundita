import Image from 'next/image';
import { Image as SanityImage } from 'next-sanity/image';
import { copy, t, type Lang } from '@/lib/i18n';
import type { PhotoSource } from '@/lib/content';
import { Flower } from './Decorations';

// Real photos fill their frame (object-fit: cover, around the editor's focal point); empty sources draw a labelled illustration instead.
export function Photo({ source, label, type = 'family', className = '', lang, sizes = '(max-width: 760px) 100vw, 50vw', priority = false }: { source?: PhotoSource; label: string; type?: string; className?: string; lang: Lang; sizes?: string; priority?: boolean }) {
  const c = copy[lang];
  if (source?.src) {
    const alt = (source.alt && t(source.alt, lang)) || label;
    const imageProps = { alt, fill: true, sizes, priority, style: source.position ? { objectPosition: source.position } : undefined };
    return <div className={`photo ${type} ${className}`}>{source.src.startsWith('https://cdn.sanity.io/') ? <SanityImage src={source.src} {...imageProps}/> : <Image src={source.src} {...imageProps}/>}</div>;
  }
  return <div className={`photo placeholder ${type} ${className}`} role="img" aria-label={`${label} — ${c.placeholderSuffix}`}>
    <div className="illustration" aria-hidden="true">
      {type === 'storefront' ? <div className="shop"><div className="shop-sign">La Segundita<small>{c.shopSign}</small></div><div className="awning"/><div className="shop-front"><div className="window"><i/><i/><i/></div><div className="door"><span>{c.open}</span></div><div className="window"><i/><i/><i/></div></div><div className="pots"><Flower/><Flower/></div></div> : type === 'interior' ? <div className="room"><div className="rack">{['#a65f3e','#e8b046','#f1e2c2','#6e6b3a','#b8734a'].map(c => <span key={c} style={{background:c}}/>)}</div><div className="room-table"/><Flower/></div> : ['denim','bag','boots','jacket'].includes(type) ? <svg className="product-art" viewBox="0 0 240 260">{type === 'denim' ? <><path d="M67 34h107l-3 75 16 126-53 2-18-110-10 110-52-2 11-126z" fill="#6f8790" stroke="#3d5660" strokeWidth="3"/><path d="M116 35v77M68 53h103M75 57q0 35 25 27m63-27q0 35-25 27M77 110l-11 118m86-118 22 118" fill="none" stroke="#e2cfa2" strokeWidth="2"/></> : type === 'bag' ? <><path d="M85 100V77c0-50 72-50 72 0v23" fill="none" stroke="#6b4a30" strokeWidth="12"/><path d="M49 99q71-17 142 0l13 101q-83 34-166 0z" fill="#a8452c" stroke="#6b3020" strokeWidth="3"/><path d="M48 116q71 36 144 0" fill="none" stroke="#e39a6c" strokeWidth="3"/><rect x="110" y="125" width="23" height="20" rx="3" fill="#e8b046"/></> : type === 'boots' ? <><path d="M59 41h54l-4 127 42 36q9 18-12 20H50v-28l12-29z" fill="#94603e" stroke="#5c3f26" strokeWidth="3"/><path d="M134 35h48l-3 127 34 33q13 17-9 20h-47l-27-29 6-24z" fill="#a8764b" stroke="#5c3f26" strokeWidth="3"/><path d="m70 67 16 27 16-27m43-6 16 27 14-27M50 216h94m13-9h53" fill="none" stroke="#e2bd85" strokeWidth="3"/></> : <><path d="m83 45 36 13 36-13 40 30 27 96-37 13-24-65 7 107H71l6-107-25 65-36-13 27-96z" fill="#6e6b3a" stroke="#45431f" strokeWidth="3"/><path d="m83 45 36 35 36-35m-36 35v146M80 114h28v32H80m52-32h28v32h-28" fill="none" stroke="#d9cf9a" strokeWidth="3"/></>}</svg> : <div className="portrait-art"><Flower/><span/><span/><span/></div>}
    </div><span className="photo-label">{label} <small>{c.photoPlaceholder}</small></span>
  </div>;
}
