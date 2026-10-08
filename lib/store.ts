// Replace these values when approved business details and photographs are ready.
// Image paths refer to files in public/. Empty paths show illustrated placeholders.
// Text that differs by language uses { en, es }. Once a real value is known (an address,
// a name), a single plain string is fine: it is shown the same in both languages.
import type { Localized } from './i18n';

export const store = {
  // Set NEXT_PUBLIC_SITE_URL (e.g. https://lasegundita.com) before a production build.
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  address: { en: '[STORE ADDRESS]', es: '[DIRECCIÓN DE LA TIENDA]' } as Localized,
  hours: { weekdays: { en: '[HOURS]', es: '[HORARIO]' } as Localized, sunday: { en: '[HOURS]', es: '[HORARIO]' } as Localized },
  phone: { en: '[STORE PHONE NUMBER]', es: '[TELÉFONO DE LA TIENDA]' } as Localized,
  phoneHref: '', directions: '',
  socials: { instagram: '', tiktok: '', depop: '', poshmark: '' },
  photos: { storefront: '', inside: '', welcome: '', team: '' },
  owners: {
    mom: {
      name: { en: '[Mom’s Name]', es: '[Nombre de Mamá]' } as Localized, portrait: '',
      label: { en: 'Mom’s Portrait', es: 'Retrato de Mamá' } as Localized,
      biography: { en: '[Approved biography to come. Share why she wanted to open La Segundita, what she loves about thrifting, what helping customers and giving back mean to her, and one personal detail in her own voice. Aim for 60–90 words.]', es: '[Biografía aprobada próximamente. Compartir por qué quiso abrir La Segundita, qué le encanta de la ropa de segunda mano, qué significa para ella ayudar a los clientes y apoyar a la comunidad, y un detalle personal en sus propias palabras. De 60 a 90 palabras.]' } as Localized,
    },
    aunt: {
      name: { en: '[Aunt’s Name]', es: '[Nombre de la Tía]' } as Localized, portrait: '',
      label: { en: 'Aunt’s Portrait', es: 'Retrato de la Tía' } as Localized,
      biography: { en: '[Approved biography to come. Share her role in the business, what she enjoys about the store, how she makes the shop welcoming, and why she personally loves this work. Aim for 60–90 words.]', es: '[Biografía aprobada próximamente. Compartir su papel en el negocio, qué disfruta de la tienda, cómo hace que la tienda sea acogedora y por qué le encanta este trabajo. De 60 a 90 palabras.]' } as Localized,
    },
  },
  finds: [
    { name: { en: 'Vintage Levi’s', es: 'Levi’s vintage' } as Localized, type: 'denim', image: '' },
    { name: { en: 'Y2K Handbag', es: 'Bolso Y2K' } as Localized, type: 'bag', image: '' },
    { name: { en: 'Cowboy Boots', es: 'Botas vaqueras' } as Localized, type: 'boots', image: '' },
    { name: { en: 'Vintage Jacket', es: 'Chaqueta vintage' } as Localized, type: 'jacket', image: '' },
  ],
  socialPhotos: [
    { label: { en: 'Thrift hauls', es: 'Compras de segunda mano' } as Localized, image: '', type: 'jacket' },
    { label: { en: 'Hidden gems', es: 'Joyas escondidas' } as Localized, image: '', type: 'bag' },
    { label: { en: 'Behind the scenes', es: 'Detrás de cámaras' } as Localized, image: '', type: 'interior' },
  ],
};

export type Owner = typeof store.owners.mom;
export type SectionId = 'fresh-finds' | 'visit' | 'contact';
export const navigation: { label: Localized; page: 'home' | 'story'; hash?: SectionId }[] = [
  { label: { en: 'Home', es: 'Inicio' }, page: 'home' },
  { label: { en: 'Our Story', es: 'Nuestra Historia' }, page: 'story' },
  { label: { en: 'Fresh Finds', es: 'Hallazgos' }, page: 'home', hash: 'fresh-finds' },
  { label: { en: 'Visit', es: 'Visítanos' }, page: 'home', hash: 'visit' },
  { label: { en: 'Contact', es: 'Contacto' }, page: 'home', hash: 'contact' },
];

// A value counts as provided once it is non-empty and no longer a [BRACKETED] placeholder.
export const isProvided = (value: string) => value.trim() !== '' && !value.trim().startsWith('[');
