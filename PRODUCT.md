# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two equally important audiences: local shoppers nearby deciding whether to stop in, and people who found the shop on social media (TikTok/Instagram) and want to see the vibe and the finds before visiting.

## Product Purpose
The marketing website for La Segundita, a small family-owned thrift store. It introduces the shop and the family behind it, shows the kind of finds it carries, and gets people to visit in person. There is no ecommerce or checkout. Success: a first-time visitor knows where and when to come and wants to.

## Positioning
A family business (mom and aunt as owners, cousins working alongside) that gives secondhand clothing another life and gives back to its community; a warm, bilingual, neighborhood treasure stop rather than a chain resale store.

## Operating Context
Visitors arrive from search, maps, and social links, mostly on phones. Primary action: come visit the store (directions, hours, address). Secondary: follow on social, meet the family on the Our Story page.

## Capabilities and Constraints
- Next.js 16 static export (`output: 'export'`, trailing slashes), React 19, TypeScript, custom CSS. No Tailwind or UI libraries; keep dependencies minimal.
- Routes: Home (`/`), Our Story (`/our-story/`), plus Spanish versions (`/es/`, `/es/our-story/`).
- Language: English by default, with a visible control that switches the whole site to Spanish.
- All business content lives in `lib/store.ts`; keep that separation so a CMS could be added later.
- Undecided / not yet provided: address, hours, phone, map link, social URLs, owner names and biographies, all photographs, final logo.

## Brand Commitments
- Name: La Segundita. Taglines: "Good finds. New beginnings.", "Secondhand, first loved", "Secondhand, with a little corazón".
- Existing palette (cream, warm yellow, burnt orange, marigold, brown), Caslon-style display serif with DM Sans, butterfly and marigold-flower motifs, illustrated photo placeholders, tilted photo treatments. These evolve; they are not replaced.
- Voice: warm, family, plainspoken, bilingual touches. Existing copy is approved and must not be rewritten.

## Evidence on Hand
Approved site copy in `components/` and `app/`. No real photos, reviews, testimonials, or business details yet. Never fabricate address, hours, phone, social links, names, biographies, products, reviews, or photos; placeholders stay visible until real content is supplied.

## Product Principles
1. Getting people through the door comes first.
2. The family is the differentiator; let it show.
3. Honest placeholders over invented facts.
4. Warmth with professional polish, never a template.

## Accessibility & Inclusion
Bilingual English/Spanish audience. Mobile-first usage. WCAG AA contrast, keyboard navigation, and reduced-motion support are required.
