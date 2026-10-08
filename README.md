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

The production build exports static files to `out/`. To preview that export, run `npx serve out`.

Before a production build, set the site's real address so canonical links, the sitemap, and social previews point to it:

```sh
NEXT_PUBLIC_SITE_URL=https://your-domain.com npm run build
```

## Update content

- **Business details and photos:** `lib/store.ts` holds the address, hours, telephone, directions, social links, owner names and biographies, product names, and every photo path. Values that differ by language are written as `{ en: '…', es: '…' }`; once a real value is known (like an address), a single plain string works for both languages.
- **Photos:** place them in `public/images/` and set their paths to `/images/filename.jpg`. Export them at about 1600px wide. Empty image paths display labeled illustrated placeholders.
- **Links:** set `phoneHref` to a real `tel:+1...` URL and `directions` to your Google Maps link. Empty social URLs show a "will be added soon" notice when clicked.
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
- `lib/store.ts`: business content and photo paths
- `lib/i18n.ts`: English and Spanish copy
- `lib/seo.ts`: page metadata and structured data
- `lib/fonts.ts`: Libre Caslon Display, Libre Caslon Text (italic), and DM Sans, self-hosted at build time

Fonts are downloaded at build time and served from the site itself; all illustrations are local CSS/SVG.
