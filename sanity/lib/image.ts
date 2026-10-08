import { createImageUrlBuilder } from '@sanity/image-url';
import { dataset, projectId } from '../env';

export type SanityPhoto = {
  asset?: { _ref: string };
  crop?: { top: number; bottom: number; left: number; right: number };
  hotspot?: { x: number; y: number };
  alt?: { en?: string; es?: string };
};

const builder = createImageUrlBuilder({ projectId, dataset });

// Base CDN URL for a photo (with the editor's crop applied); next-sanity's Image adds width, quality, and format.
export const photoUrl = (photo?: SanityPhoto | null) => (photo?.asset?._ref ? builder.image(photo).url() : '');
// The editor's focal point, as a CSS object-position, so cover-cropped frames keep it in view.
export const photoPosition = (photo?: SanityPhoto | null) => (photo?.hotspot ? `${Math.round(photo.hotspot.x * 100)}% ${Math.round(photo.hotspot.y * 100)}%` : undefined);
