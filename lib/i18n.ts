// Site copy in English and Spanish. English is the approved source; keep both in step.
export type Lang = 'en' | 'es';
export type Localized = string | { en: string; es: string };
export const langs: Lang[] = ['en', 'es'];
export const t = (value: Localized, lang: Lang) => (typeof value === 'string' ? value : value[lang]);

export type Page = 'home' | 'story';
export const pagePath = (page: Page, lang: Lang) => `${lang === 'es' ? '/es' : ''}${page === 'story' ? '/our-story/' : '/'}`;

export const copy = {
  en: {
    skip: 'Skip to content',
    brandTagline: 'FAMILY-OWNED · SECONDHAND, FIRST LOVED',
    brandHome: 'La Segundita home',
    openNav: 'Open navigation', closeNav: 'Close navigation', mainNav: 'Main navigation', footerNav: 'Footer navigation',
    switchLang: 'Ver en español', switchLangShort: 'ES',
    meta: {
      homeTitle: 'La Segundita | Good Finds. New Beginnings.',
      homeDescription: 'Meet La Segundita, a family-owned thrift shop bringing together affordable fashion, unique pieces, and hidden treasures.',
      storyTitle: 'Our Story',
      storyDescription: 'Meet the family behind La Segundita, a family-owned thrift store built around giving clothing another life and helping our community.',
    },
    hero: {
      eyebrow: 'A LITTLE SHOP. A LOT OF HEART.', title: ['Good finds.', 'New beginnings.'],
      lede: 'Secondhand treasures, everyday prices, and a warm welcome from our family to yours.',
      explore: 'Explore the Finds', visit: 'Come Say Hola',
      outside: 'La Segundita storefront', inside: 'Inside La Segundita',
      outsideCaption: '01 / OUR LITTLE SHOP', insideCaption: '02 / INSIDE THE SHOP',
      seeInside: 'See Inside', seeOutside: 'See Outside',
      stamp: ['PRE-LOVED', 'con amor', 'LA SEGUNDITA'],
    },
    photoPlaceholder: 'PHOTO PLACEHOLDER', placeholderSuffix: 'photo placeholder',
    shopSign: 'THRIFT & TREASURES', open: 'OPEN',
    welcome: {
      photo: 'Family/workers inside the store', caption: 'A family business, a community of friends.',
      eyebrow: 'BIENVENIDOS · WELCOME', title: ['Welcome to', 'La Segundita'], subtitle: 'More Than Just a Thrift Store',
      body: 'La Segundita is a family-owned thrift shop bringing together affordable fashion, unique pieces, and hidden treasures. Every item gets another opportunity to be loved.',
      cta: 'Meet Our Family',
    },
    finds: {
      eyebrow: 'THE JOY IS IN THE FIND', title: 'Fresh Finds', intro: ['A little vintage. A little unexpected.', 'Always worth a second look.'],
      follow: 'New pieces arrive regularly — follow us to see the latest drops.',
      note: 'Illustrative finds. Availability changes with every visit.',
      tiktok: 'Follow on TikTok', instagram: 'Follow on Instagram', lot: 'No.',
    },
    why: {
      eyebrow: 'GOOD FOR YOUR CLOSET. GOOD FOR YOUR COMMUNITY.', title: 'Why Shop La Segundita?',
      items: [
        { title: 'Give Clothes Another Life', body: 'Quality secondhand pieces deserve another chance.' },
        { title: 'Affordable Finds', body: 'Great style doesn’t have to cost a fortune.' },
        { title: 'One-of-a-Kind Pieces', body: 'Find clothing and treasures you won’t see everywhere else.' },
      ],
    },
    social: {
      eyebrow: 'A PEEK INTO OUR WORLD', title: 'Follow the Finds',
      body: 'Thrift hauls, new arrivals, hidden gems, and behind-the-scenes at La Segundita.',
      instagram: 'Instagram', tiktok: 'TikTok',
    },
    visit: {
      eyebrow: 'YOUR NEXT FAVORITE IS WAITING', title: ['Come Find Your', 'Next Treasure'],
      address: 'Address', hours: 'Store Hours', weekdays: 'Monday – Saturday', sunday: 'Sunday', phone: 'Phone',
      directions: 'Get Directions',
      mapLabel: 'Map placeholder: store location to be added', mapTagline: 'Your neighborhood treasure stop.', mapSoon: 'MAP & LOCATION COMING SOON',
    },
    contact: {
      eyebrow: 'LET’S TALK TREASURES', title: 'Questions?',
      body: 'Looking for something specific or want to know what’s currently in stock?',
      call: 'Call Us', message: 'Message Us on Instagram',
    },
    story: {
      eyebrow: 'OUR STORY · NUESTRA FAMILIA', title: ['Meet the Family', 'Behind La Segundita'],
      intro: 'La Segundita is more than a thrift store. It’s a family business built around giving clothing another life, helping our community, and creating a welcoming place where everyone can find something special.',
      ownerEyebrow: 'THE HEART OF LA SEGUNDITA', ownerRole: 'Owner & Co-Founder',
      teamPhoto: 'User + Cousins Working Together', teamEyebrow: 'FAMILY AT THE HEART OF IT ALL', teamTitle: 'Working Together, Giving Back',
      teamBody: 'We love working alongside our mom and aunt at La Segundita. As cousins, we get to spend time together, help customers find something special, and give back to the community we love. We’re proud to be part of this family business and to help give every piece a new life.',
      teamCta: 'Come Visit Us',
    },
    footer: {
      tagline: ['Good finds. New beginnings.', 'From our family to yours.'],
      visit: 'Visit', explore: 'Explore', follow: 'Follow',
      rights: '© 2026 La Segundita. All Rights Reserved.', motto: 'SECONDHAND, WITH A LITTLE CORAZÓN.',
      our: 'Our',
    },
    notFound: { title: 'Page not found', body: 'This page wandered off the rack.', home: 'Back to La Segundita' },
    soon: 'will be added soon.', thisLink: 'This link', directionsLabel: 'Store directions', phoneLabel: 'Our phone number',
  },
  es: {
    skip: 'Saltar al contenido',
    brandTagline: 'NEGOCIO FAMILIAR · DE SEGUNDA, QUERIDO PRIMERO',
    brandHome: 'Inicio de La Segundita',
    openNav: 'Abrir navegación', closeNav: 'Cerrar navegación', mainNav: 'Navegación principal', footerNav: 'Navegación del pie de página',
    switchLang: 'View in English', switchLangShort: 'EN',
    meta: {
      homeTitle: 'La Segundita | Buenos hallazgos. Nuevos comienzos.',
      homeDescription: 'Conoce La Segundita, una tienda de segunda mano familiar que reúne moda accesible, piezas únicas y tesoros escondidos.',
      storyTitle: 'Nuestra Historia',
      storyDescription: 'Conoce a la familia detrás de La Segundita, una tienda de segunda mano familiar que le da otra vida a la ropa y apoya a nuestra comunidad.',
    },
    hero: {
      eyebrow: 'UNA TIENDITA. MUCHO CORAZÓN.', title: ['Buenos hallazgos.', 'Nuevos comienzos.'],
      lede: 'Tesoros de segunda mano, precios de todos los días y una cálida bienvenida de nuestra familia a la tuya.',
      explore: 'Explora los hallazgos', visit: 'Ven a saludarnos',
      outside: 'Fachada de La Segundita', inside: 'Dentro de La Segundita',
      outsideCaption: '01 / NUESTRA TIENDITA', insideCaption: '02 / DENTRO DE LA TIENDA',
      seeInside: 'Ver por dentro', seeOutside: 'Ver por fuera',
      stamp: ['DE SEGUNDA', 'con amor', 'LA SEGUNDITA'],
    },
    photoPlaceholder: 'FOTO PROVISIONAL', placeholderSuffix: 'foto provisional',
    shopSign: 'SEGUNDA MANO Y TESOROS', open: 'ABIERTO',
    welcome: {
      photo: 'La familia y el equipo dentro de la tienda', caption: 'Un negocio familiar, una comunidad de amigos.',
      eyebrow: 'BIENVENIDOS · WELCOME', title: ['Bienvenidos a', 'La Segundita'], subtitle: 'Más que una tienda de segunda mano',
      body: 'La Segundita es una tienda de segunda mano familiar que reúne moda accesible, piezas únicas y tesoros escondidos. Cada prenda tiene otra oportunidad de ser querida.',
      cta: 'Conoce a nuestra familia',
    },
    finds: {
      eyebrow: 'LA ALEGRÍA ESTÁ EN EL HALLAZGO', title: 'Hallazgos recientes', intro: ['Un poco vintage. Un poco inesperado.', 'Siempre vale la pena una segunda mirada.'],
      follow: 'Llegan piezas nuevas con frecuencia: síguenos para ver lo más reciente.',
      note: 'Hallazgos ilustrativos. La disponibilidad cambia en cada visita.',
      tiktok: 'Síguenos en TikTok', instagram: 'Síguenos en Instagram', lot: 'No.',
    },
    why: {
      eyebrow: 'BUENO PARA TU CLÓSET. BUENO PARA TU COMUNIDAD.', title: '¿Por qué comprar en La Segundita?',
      items: [
        { title: 'Dale otra vida a la ropa', body: 'Las buenas prendas de segunda mano merecen otra oportunidad.' },
        { title: 'Hallazgos accesibles', body: 'El buen estilo no tiene que costar una fortuna.' },
        { title: 'Piezas únicas', body: 'Encuentra ropa y tesoros que no verás en ningún otro lugar.' },
      ],
    },
    social: {
      eyebrow: 'UN VISTAZO A NUESTRO MUNDO', title: 'Sigue los hallazgos',
      body: 'Compras de segunda mano, novedades, joyas escondidas y lo que pasa detrás de cámaras en La Segundita.',
      instagram: 'Instagram', tiktok: 'TikTok',
    },
    visit: {
      eyebrow: 'TU PRÓXIMO FAVORITO TE ESPERA', title: ['Ven a encontrar', 'tu próximo tesoro'],
      address: 'Dirección', hours: 'Horario', weekdays: 'Lunes – Sábado', sunday: 'Domingo', phone: 'Teléfono',
      directions: 'Cómo llegar',
      mapLabel: 'Mapa provisional: la ubicación de la tienda se agregará pronto', mapTagline: 'Tu tiendita de tesoros del barrio.', mapSoon: 'MAPA Y UBICACIÓN PRÓXIMAMENTE',
    },
    contact: {
      eyebrow: 'HABLEMOS DE TESOROS', title: '¿Preguntas?',
      body: '¿Buscas algo en específico o quieres saber qué tenemos ahora en la tienda?',
      call: 'Llámanos', message: 'Escríbenos por Instagram',
    },
    story: {
      eyebrow: 'NUESTRA HISTORIA · NUESTRA FAMILIA', title: ['Conoce a la familia', 'detrás de La Segundita'],
      intro: 'La Segundita es más que una tienda de segunda mano. Es un negocio familiar dedicado a darle otra vida a la ropa, ayudar a nuestra comunidad y crear un lugar acogedor donde todos puedan encontrar algo especial.',
      ownerEyebrow: 'EL CORAZÓN DE LA SEGUNDITA', ownerRole: 'Dueña y cofundadora',
      teamPhoto: 'Usuario + primos trabajando juntos', teamEyebrow: 'LA FAMILIA EN EL CORAZÓN DE TODO', teamTitle: 'Trabajando juntos, apoyando a la comunidad',
      teamBody: 'Nos encanta trabajar junto a nuestra mamá y nuestra tía en La Segundita. Como primos, pasamos tiempo juntos, ayudamos a los clientes a encontrar algo especial y apoyamos a la comunidad que queremos. Estamos orgullosos de ser parte de este negocio familiar y de ayudar a darle una nueva vida a cada pieza.',
      teamCta: 'Ven a visitarnos',
    },
    footer: {
      tagline: ['Buenos hallazgos. Nuevos comienzos.', 'De nuestra familia a la tuya.'],
      visit: 'Visítanos', explore: 'Explora', follow: 'Síguenos',
      rights: '© 2026 La Segundita. Todos los derechos reservados.', motto: 'DE SEGUNDA MANO, CON UN POQUITO DE CORAZÓN.',
      our: 'Nuestro',
    },
    notFound: { title: 'Página no encontrada', body: 'Esta página se salió del perchero.', home: 'Volver a La Segundita' },
    soon: 'se agregará pronto.', thisLink: 'Este enlace', directionsLabel: 'Indicaciones para llegar', phoneLabel: 'Nuestro número de teléfono',
  },
} as const;

export type Copy = (typeof copy)[Lang];
