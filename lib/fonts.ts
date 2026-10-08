import { DM_Sans, Libre_Caslon_Display, Libre_Caslon_Text } from 'next/font/google';

// Self-hosted at build time by next/font: no render-blocking stylesheet, no layout shift.
export const display = Libre_Caslon_Display({ weight: '400', subsets: ['latin', 'latin-ext'], variable: '--font-display', display: 'swap' });
export const italic = Libre_Caslon_Text({ weight: '400', style: 'italic', subsets: ['latin', 'latin-ext'], variable: '--font-italic', display: 'swap' });
export const sans = DM_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
export const fontVariables = `${display.variable} ${italic.variable} ${sans.variable}`;
