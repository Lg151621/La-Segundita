import { Butterfly, Garland } from '@/components/Decorations';
import { OwnerProfile, FamilyTeam } from '@/components/Family';
import { copy, type Lang } from '@/lib/i18n';
import { store } from '@/lib/store';
import { getSiteContent } from '@/lib/content';
import { JsonLd, structuredData } from '@/lib/seo';

export async function StoryPage({ lang }: { lang: Lang }) {
  const content = await getSiteContent(), { photos } = content;
  const s = copy[lang].story;
  return <main id="main">
    <JsonLd data={structuredData('story', lang, content)}/>
    <section className="story-intro chapter marigold" aria-labelledby="story-title"><div className="container">
      <span className="tag-label">{s.eyebrow}</span>
      <h1 id="story-title">{s.title[0]}<br/><em>{s.title[1]}</em></h1>
      <Butterfly className="story-butterfly"/>
      <p className="lede">{s.intro}</p>
    </div><Garland count={9}/></section>
    <OwnerProfile id="owner-mom" owner={store.owners.mom} portrait={photos.momPortrait} lang={lang}/>
    <OwnerProfile id="owner-aunt" owner={store.owners.aunt} portrait={photos.auntPortrait} lang={lang} reverse/>
    <FamilyTeam lang={lang} photo={photos.team}/>
  </main>;
}
