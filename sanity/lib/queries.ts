import { defineQuery } from 'next-sanity';

const photo = `{ asset, crop, hotspot, alt }`;

// Everything the site reads from Sanity, in one request. Hidden items and switched-off announcements are filtered here.
// The counts tell "none created yet" (show the built-in samples) apart from "all hidden" (show none).
export const siteContentQuery = defineQuery(`{
  "settings": *[_id == "storeSettings"][0]{ address, phone, directionsUrl, mondayFridayHours, saturdayHours, sundayHours, instagram, tiktok, depop, poshmark },
  "photos": *[_id == "featuredPhotos"][0]{
    storefront${photo}, inside${photo}, welcome${photo}, welcomeCaption, momPortrait${photo}, auntPortrait${photo}, team${photo}
  },
  "findCount": count(*[_type == "freshFind"]),
  "finds": *[_type == "freshFind" && visible != false && defined(name.en)] | order(coalesce(order, 999) asc, _createdAt asc)[0...4]{ name, caption, category, image${photo} },
  "socialFeatureCount": count(*[_type == "socialFeature"]),
  "socialFeatures": *[_type == "socialFeature" && visible != false && defined(label.en)] | order(coalesce(order, 999) asc, _createdAt asc)[0...3]{ label, url, image${photo} },
  "announcements": *[_type == "announcement" && enabled == true && defined(message.en)] | order(_updatedAt desc){ message, startsAt, endsAt }
}`);
