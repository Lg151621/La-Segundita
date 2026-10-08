import { Hero } from '@/components/Hero';
import { WelcomeSection, FreshFinds, WhyShop, SocialSection, VisitSection, ContactSection } from '@/components/Sections';
import { businessJsonLd } from '@/lib/seo';
import type { Lang } from '@/lib/i18n';

export function HomePage({ lang }: { lang: Lang }) {
  return <main id="main">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd(lang)).replace(/</g, '\\u003c') }}/>
    <Hero lang={lang}/><WelcomeSection lang={lang}/><FreshFinds lang={lang}/><WhyShop lang={lang}/><SocialSection lang={lang}/><VisitSection lang={lang}/><ContactSection lang={lang}/>
  </main>;
}
