import { localeString, localeText } from './localeString';
import { photo } from './photo';
import { storeSettings } from './storeSettings';
import { featuredPhotos } from './featuredPhotos';
import { freshFind } from './freshFind';
import { socialFeature } from './socialFeature';
import { announcement } from './announcement';

export const schemaTypes = [localeString, localeText, photo, storeSettings, featuredPhotos, freshFind, socialFeature, announcement];
// Documents that exist exactly once, with fixed IDs.
export const singletonTypes = new Set(['storeSettings', 'featuredPhotos']);
