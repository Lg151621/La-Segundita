import { StoryPage } from '@/components/pages/StoryPage';
import { pageMetadata } from '@/lib/seo';

export const generateMetadata = () => pageMetadata('story', 'en');
export default function OurStory() { return <StoryPage lang="en"/>; }
