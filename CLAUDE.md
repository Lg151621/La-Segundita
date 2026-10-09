@AGENTS.md

# La Segundita — project handoff

## What it is
Marketing site for La Segundita, a family-owned thrift store at 141 N Broadway, Blythe, CA (mom and aunt own it; cousins work there). Not ecommerce: no cart, prices, inventory, or checkout. Goals: get local shoppers to visit, show the vibe/finds, connect to social. English by default, full Spanish version under `/es/`. Live: https://la-segundita-nine.vercel.app (Vercel). Repo: github.com/Lg151621/La-Segundita, branch `main`.

## Stack
Next.js 16.4 (App Router, Turbopack; read `node_modules/next/dist/docs/` before using Next APIs, per AGENTS.md) · React 19 · TypeScript · custom CSS (no Tailwind/UI libs) · Sanity v6 via `next-sanity` (Studio embedded at `/studio`) · `next/font` (Libre Caslon Display, Libre Caslon Text italic, DM Sans) · `@vercel/analytics`. No animation library: motion is CSS only.

## Run locally
```sh
npm install
cp .env.example .env.local   # NEXT_PUBLIC_SANITY_PROJECT_ID=vmjws3vm, NEXT_PUBLIC_SANITY_DATASET=production, NEXT_PUBLIC_SITE_URL
npm run dev                  # http://localhost:3000, Studio at /studio, Spanish at /es/
npm run typecheck && npm run build   # no lint script exists
```
In dev, Sanity is always fetched fresh (`cache: 'no-store'`). Without a project ID the site renders built-in placeholders.

## Structure
- `app/(en)/`, `app/(es)/es/`: two root layouts (sets `<html lang>`); `app/(studio)/studio/[[...tool]]/`: Studio; `app/api/revalidate/route.ts`: Sanity publish webhook; `app/global-not-found.tsx` (needs `experimental.globalNotFound`); `app/sitemap.ts`, `app/robots.ts`.
- `components/pages/HomePage.tsx`, `StoryPage.tsx`: shared by both languages; `components/`: Header (client), Hero (client), Sections, Family, Footer, Photo (Sanity image or drawn placeholder), Links (`ActionLink`: empty URL → "coming soon" notice), Icons (drawn SVG), Decorations, Document (html shell + announcement bar).
- `lib/i18n.ts`: ALL UI copy, `{ en, es }`; `lib/content.ts`: `getSiteContent()` merges Sanity with fallbacks from `lib/store.ts`; `lib/hours.ts`: hours rows + parsing; `lib/seo.tsx`: metadata + JSON-LD; `lib/site.ts`: `siteUrl`, address parsing; `lib/fonts.ts`.
- `sanity/`: `env.ts` (project, cache tag, fallback interval), `schemaTypes/`, `structure.ts`, `i18n.ts` (Studio label bundle), `lib/` (client, GROQ query, image helpers); `sanity.config.ts`, `sanity.cli.ts`; `migrations/split-store-hours/`.
- `app/globals.css`: design tokens at top, then sections, then Motion, then Responsive. `PRODUCT.md`, `.impeccable/`: design-skill context.

## Conventions
- Never invent business facts (names, bios, hours, reviews, photos). Placeholders like `[Mom’s Name]` stay until the owners supply real content.
- Sanity Store Settings is the single source of truth for address/phone/hours/map/social links; code fallbacks live only in `lib/store.ts`.
- Every UI string goes in `lib/i18n.ts` in both languages; Spanish CMS text falls back to English.
- Headings/labels/layout stay in code; only changing business content goes in Sanity. Keep the Studio simple for non-technical owners.
- Custom Studio labels (sidebar titles, orderings) must carry an i18n key from `sanity/i18n.ts`; un-keyed labels caused React "useMemo changed size" errors.
- One Sanity query (`siteContentQuery`), one cache tag `sanity`; the webhook calls `revalidateTag('sanity', { expire: 0 })`. Client uses `useCdn: false`.
- Fresh Finds/Social Features show built-in samples only when zero documents exist; hidden items just disappear.
- Header height is fixed (84px / 72px); the scrolled state only fades a shadow. Don't animate layout properties.
- Motion: transform/opacity only, CSS scroll-driven reveals (content visible if unsupported), everything gated by `prefers-reduced-motion`.
- Code style: compact components (often one long JSX line), short comments explaining why.
- `trailingSlash: true`: internal URLs and the webhook URL end in `/`.
- Sitemap entries are URL + hreflang alternates only (no changefreq/priority: Next writes them in schema-invalid order).

## Finished this session
Redesign (Mexican-vintage editorial) · EN/ES routing and language switch · navbar scroll glitch fix · Sanity CMS (Store Settings, Featured Photos, Fresh Finds, Social Features, Announcements) with fallbacks · instant publish revalidation + hourly fallback · Studio hook error fix · store hours split into Mon–Fri / Sat / Sun (old fields removed) · SEO/GEO pass (location-aware titles, ClothingStore JSON-LD with hours/address/sameAs, AboutPage, robots blocks `/studio/` `/api/`, heading cleanup, less repetition) · premium motion layer · sitemap schema fix (verified valid on live).

## In progress / needs the owner
- **Webhook not live yet:** `SANITY_REVALIDATE_SECRET` is not set in Vercel (live endpoint returns 500). Add it, redeploy, create the Sanity webhook to `https://la-segundita-nine.vercel.app/api/revalidate/`. Steps in README. Until then edits appear within an hour.
- Run `npx sanity login` then `npx sanity migration run split-store-hours --no-dry-run` to clear leftover old hour fields from the Store Settings document.
- Search Console: resubmit `/sitemap.xml` (valid XML; "Couldn't fetch" was a GSC delay/browser display issue).

## Known issues
- Studio hook-error fix couldn't be verified signed-in here; confirm no "useMemo changed size" errors in `/studio`.
- `npm audit`: 18 vulnerabilities from Sanity's transitive deps (not force-fixed).
- Content gaps: owner names/bios placeholders; TikTok/Depop/Poshmark empty ("coming soon"); Sunday hours lack Spanish ("Cerrado"); Fresh Find alt text is weak ("Our cute boy", "TUFF"); no real storefront/team photos yet.
- Scroll reveals don't run in Firefox (content shows statically, by design).
- Translations were machine-written; have a native speaker review `lib/i18n.ts`.

## Next steps
1. Configure the webhook secret + Sanity webhook; verify a publish updates the live site.
2. Set `NEXT_PUBLIC_SITE_URL` in Vercel to the final domain when it exists (falls back to the Vercel production URL).
3. Owners fill Sanity: photos with good alt text, Spanish hours, social links, real names/bios (bios still in `lib/store.ts`).
4. Optional design follow-ups from the earlier review (not done): sign-painted wordmark, dustier rose for the Social section, rework the "Why Shop" block, inked stamp.
