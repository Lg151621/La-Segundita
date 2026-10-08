import Link from 'next/link';
import { store, type Owner } from '@/lib/store';
import { copy, pagePath, t, type Lang } from '@/lib/i18n';
import { Photo } from './Photo';
import { Butterfly, Flower } from './Decorations';
import { Icon } from './Icons';

export function OwnerProfile({ owner, lang, reverse = false, id }: { owner: Owner; lang: Lang; reverse?: boolean; id: string }) {
  const s = copy[lang].story;
  return <section className={`owner chapter ${reverse ? 'reverse ivory' : 'paper'}`} aria-labelledby={id}><div className="container owner-grid">
    <figure className="owner-portrait reveal">
      <div className="mounted corners"><Photo lang={lang} src={owner.portrait} label={t(owner.label, lang)} type="portrait" sizes="(max-width: 760px) 90vw, 40vw"/></div>
      <Flower className="portrait-flower"/>
    </figure>
    <div className="owner-copy reveal">
      <span className="tag-label">{s.ownerEyebrow}</span>
      <h2 id={id}>{t(owner.name, lang)}</h2>
      <h3 className="deck">{s.ownerRole}</h3>
      <p className="biography">{t(owner.biography, lang)}</p>
    </div>
  </div></section>;
}

export function FamilyTeam({ lang }: { lang: Lang }) {
  const s = copy[lang].story;
  return <section className="team chapter olive" aria-labelledby="team-title"><div className="container team-grid">
    <figure className="team-photo reveal"><div className="mounted"><Photo lang={lang} src={store.photos.team} label={s.teamPhoto} sizes="(max-width: 760px) 92vw, 55vw"/></div></figure>
    <div className="team-copy reveal">
      <span className="tag-label light">{s.teamEyebrow}</span>
      <h2 id="team-title">{s.teamTitle}</h2>
      <p>{s.teamBody}</p>
      <Link href={`${pagePath('home', lang)}#visit`} className="button cream">{s.teamCta}<Icon name="arrow"/></Link>
      <Butterfly className="team-butterfly"/>
    </div>
  </div></section>;
}
