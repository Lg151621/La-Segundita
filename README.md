# La Segundita

A responsive family-owned thrift store website built with Next.js, React, and TypeScript. It has a Home page and an Our Story page, in English (default) and Spanish. No checkout or ecommerce.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000 (Spanish: http://localhost:3000/es/). Stop the server with Ctrl+C.

## Check and build

```sh
npm run typecheck
npm run build
```

To preview the production build locally, run `npm run start` after `npm run build`.

The site runs on a Next.js host such as Vercel (not as plain static files), so content edits in Sanity reach the live site without a rebuild. Copy `.env.example` to `.env.local` for local development and add the same variables in your host's settings. Set `NEXT_PUBLIC_SITE_URL` to the site's real address (e.g. `https://lasegundita.com`) so canonical links, the sitemap, robots.txt, structured data, and social previews point to it. On Vercel, the project's production domain is used automatically if it is missing.

**Search & local SEO:** page titles, descriptions, and the business's structured data (address, phone, opening hours, map link, social profiles) are generated from Store Settings, so keeping Store Settings accurate keeps Google and AI search consistent with the site. The search title includes the city once the address is written as `Street, City, ST 12345`. Search engines are kept out of `/studio/` and `/api/`.

## Content management (Sanity)

The owners edit store information, photos, Fresh Finds, social cards, and announcements in Sanity Studio at `/studio`. Headings, labels, layout, and design stay in code.

| In the Studio | What it controls on the site |
| --- | --- |
| **Store Settings** | Address, phone, Monday–Friday / Saturday / Sunday hours, Google Maps link, and Instagram/TikTok/Depop/Poshmark links, everywhere they appear (Visit section, hero strip, Contact, footer, search data) |
| **Featured Photos** | Storefront, inside-the-shop, welcome photo (and its caption), both portraits, and the cousins' group photo |
| **Fresh Finds** | The first four visible finds, in display order: name, photo, short caption, category |
| **Social Features** | The first three visible photo cards in "Follow the Finds", each optionally linking to a post |
| **Announcements** | A slim bar above the header while switched on and inside its optional start/end dates |

Every field is optional. Anything left empty keeps today's placeholder or illustration, and Spanish text falls back to English when it isn't filled in.

### One-time setup

1. Create a free project at [sanity.io/manage](https://www.sanity.io/manage) (dataset name: `production`).
2. Put its project ID in `NEXT_PUBLIC_SANITY_PROJECT_ID` (in `.env.local` and on your host), then restart or redeploy.
3. In the project's **API → CORS origins**, add `http://localhost:3000` and your live site address, with **Allow credentials** checked, so the Studio can sign in.
4. In **Members**, invite the owners as Editors. They sign in at `yoursite.com/studio`.

### Store hours cleanup (one time)

Store hours are Monday–Friday, Saturday, and Sunday. The old "Monday – Saturday" and "Sunday" fields were removed from the Studio, but their old values may still be stored in the Store Settings document, where the Studio lists them as unknown fields. To clear them, sign in once with `npx sanity login`, then run `npx sanity migration run split-store-hours --no-dry-run`. It never changes the new hours fields.

### Instant updates when the owners publish

The live site caches pages and refreshes them the moment Sanity reports a publish, so owners never need to redeploy or wait. Every Sanity-managed section (Store Settings, Featured Photos, Fresh Finds, Social Features, Announcements) is read in one cached request tagged `sanity`, and the webhook invalidates exactly that tag, nothing else. Set this up once:

1. **Create the secret.** Generate a long random value, for example with `openssl rand -hex 32`.
2. **Add it in Vercel.** Project → **Settings → Environment Variables** → add `SANITY_REVALIDATE_SECRET` with that value for the **Production** environment (and Preview if you use it). It is server-only: never prefix it with `NEXT_PUBLIC_`. Then **redeploy** (Deployments → ⋯ → Redeploy), because environment variables only apply to new deployments.
3. **Create the webhook in Sanity.** [sanity.io/manage](https://www.sanity.io/manage) → your project → **API → Webhooks → Create webhook**:
   - **Name:** Revalidate website
   - **URL:** `https://YOUR-DOMAIN/api/revalidate/`, e.g. `https://la-segundita-nine.vercel.app/api/revalidate/`. Keep the **trailing slash**: without it the site answers with a redirect, which webhook POSTs should not rely on.
   - **Dataset:** `production`
   - **Trigger on:** ✅ Create ✅ Update ✅ Delete
   - **Filter:** `_type in ["storeSettings", "featuredPhotos", "freshFind", "socialFeature", "announcement"]`
   - **Projection:** leave empty
   - **Status:** Enabled · **HTTP method:** POST · **API version:** leave the default
   - **Drafts:** off · **Versions:** off (only publishes change the live site)
   - **Secret:** the same value as `SANITY_REVALIDATE_SECRET`
4. **Test it.** Publish a small change (e.g. a Fresh Find caption) and reload the site: it shows up right away. In Sanity, the webhook's **Attempts log** should show `200`. A `401` means the two secrets don't match; a `500` saying the secret is not set means step 2's variable is missing or the site wasn't redeployed.

If a webhook delivery is ever missed, pages still refresh on their own within an hour. In local development (`npm run dev`) content is always fetched fresh, so a reload shows the latest published content without any webhook.

Fresh Finds and Social Features show the built-in sample cards only until the owners create their first item. After that, hidden or deleted items simply disappear, and the section shows only what's visible.

Code layout: `sanity/schemaTypes/` (content model), `sanity/structure.ts` (Studio sidebar), `sanity.config.ts` (Studio), `sanity/lib/` (client, query, image helpers), `lib/content.ts` (merges Sanity content with the placeholders in `lib/store.ts`), `app/(studio)/studio/` (Studio route), `app/api/revalidate/` (publish webhook).

## Update content

- **Business details and photos:** edit these in Sanity (see above). `lib/store.ts` holds the fallback values shown until Sanity has them, plus the owner names and biographies, which stay in code for now. Values that differ by language are written as `{ en: '…', es: '…' }`; once a real value is known (like an address), a single plain string works for both languages.
- **Photos and links:** upload photos in the Studio's Featured Photos, and add the phone, map, and social links in Store Settings. The "Call Us" button dials the phone number automatically. Until a photo is set, its spot shows a labeled illustration; until a link is set, its button shows a "will be added soon" notice.
- **Site copy and translations:** `lib/i18n.ts` holds every heading, paragraph, and button label in English and Spanish. Keep both languages in step when editing.
- **Logo:** replace the temporary brand in `components/Header.tsx` (`Brand`) and `public/favicon.svg` when the final logo is ready.
- **Social share images:** `public/og/share-en.png` and `share-es.png` (1200×630).

No personal or business facts have been invented. Search data (`lib/seo.ts`) only includes the address, phone, and social profiles once they are real.

## Structure

- `app/(en)/` and `app/(es)/es/`: English and Spanish routes, each with its own root layout (`<html lang>`)
- `app/global-not-found.tsx`: the 404 page
- `app/sitemap.ts`, `app/robots.ts`: search engine files
- `app/globals.css`: design tokens (colors, type, spacing, motion), section styles, responsive rules
- `components/`: header, hero, sections, family profiles, photos and placeholders, icons, decorations, links
- `components/pages/`: the Home and Our Story pages, shared by both languages
- `lib/store.ts`: fallback business content and owner placeholders
- `lib/content.ts`, `sanity/`: content from Sanity, merged with the fallbacks
- `lib/i18n.ts`: English and Spanish copy
- `lib/seo.ts`: page metadata and structured data
- `lib/fonts.ts`: Libre Caslon Display, Libre Caslon Text (italic), and DM Sans, self-hosted at build time

Fonts are downloaded at build time and served from the site itself; all illustrations are local CSS/SVG.
