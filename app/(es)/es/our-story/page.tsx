import { StoryPage } from '@/components/pages/StoryPage';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('story', 'es');
export default function NuestraHistoria() { return <StoryPage lang="es"/>; }
