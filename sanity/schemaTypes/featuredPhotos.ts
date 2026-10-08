import { defineField, defineType } from 'sanity';
import { ImagesIcon } from '@sanity/icons/Images';

// One document: the fixed photo spots on the site. An empty spot keeps its illustrated placeholder.
const spot = (name: string, title: string, description: string, group: string) => defineField({ name, title, type: 'photo', description, group });

export const featuredPhotos = defineType({
  name: 'featuredPhotos', title: 'Featured Photos', type: 'document', icon: ImagesIcon,
  groups: [{ name: 'home', title: 'Home page', default: true }, { name: 'story', title: 'Our Story page' }],
  fields: [
    spot('storefront', 'Storefront', 'The big tilted photo at the top of the home page. Landscape works best.', 'home'),
    spot('inside', 'Inside the shop', 'Shown when visitors tap "See Inside" on the storefront photo. Landscape works best.', 'home'),
    spot('welcome', 'Family / workers in the store', 'Shown in the "Welcome to La Segundita" section.', 'home'),
    defineField({ name: 'welcomeCaption', title: 'Caption under the welcome photo', type: 'localeString', group: 'home', description: 'Optional. Leave empty to keep "A family business, a community of friends."' }),
    spot('momPortrait', 'Mom’s portrait', 'Our Story page. Portrait (tall) photos work best.', 'story'),
    spot('auntPortrait', 'Aunt’s portrait', 'Our Story page. Portrait (tall) photos work best.', 'story'),
    spot('team', 'Cousins working together', 'The group photo in "Working Together, Giving Back". Landscape works best.', 'story'),
  ],
  preview: { prepare: () => ({ title: 'Featured Photos' }) },
});
