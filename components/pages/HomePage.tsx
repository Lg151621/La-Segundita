import { Hero } from '@/components/Hero';
import { WelcomeSection, FreshFinds, WhyShop, SocialSection, VisitSection, ContactSection } from '@/components/Sections';
import { getSiteContent } from '@/lib/content';
import { JsonLd, structuredData } from '@/lib/seo';
import type { Lang } from '@/lib/i18n';

export async function HomePage({ lang }: { lang: Lang }) {
  const content = await getSiteContent();
  return <main id="main">
    <JsonLd data={structuredData('home', lang, content)}/>
    <Hero lang={lang} photos={content.photos} settings={content.settings}/><WelcomeSection lang={lang} content={content}/><FreshFinds lang={lang} content={content}/><WhyShop lang={lang}/><SocialSection lang={lang} content={content}/><VisitSection lang={lang} content={content}/><ContactSection lang={lang} content={content}/>
  </main>;
}
