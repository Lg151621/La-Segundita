import { HomePage } from '@/components/pages/HomePage';
import { pageMetadata } from '@/lib/seo';

export const generateMetadata = () => pageMetadata('home', 'es');
export default function Inicio() { return <HomePage lang="es"/>; }
