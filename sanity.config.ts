'use client';
// Sanity Studio, served by this site at /studio.
import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { apiVersion, dataset, projectId } from './sanity/env';
import { schemaTypes, singletonTypes } from './sanity/schemaTypes';
import { structure } from './sanity/structure';
import { studioLocaleBundle } from './sanity/i18n';

export default defineConfig({
  name: 'la-segundita', title: 'La Segundita', basePath: '/studio',
  projectId, dataset,
  plugins: [structureTool({ structure, title: 'Content' })],
  schema: {
    types: schemaTypes,
    // Singletons can't be created again from the "+" menu.
    templates: templates => templates.filter(({ schemaType }) => !singletonTypes.has(schemaType)),
  },
  document: {
    // Singletons can be edited and published, never duplicated or deleted.
    actions: (actions, { schemaType }) => (singletonTypes.has(schemaType) ? actions.filter(({ action }) => action && ['publish', 'discardChanges', 'restore'].includes(action)) : actions),
  },
  // Translation keys for our custom Studio labels (see sanity/i18n.ts).
  i18n: { bundles: [studioLocaleBundle] },
  apiVersion,
});
