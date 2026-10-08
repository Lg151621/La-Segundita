import { StoryPage } from '@/components/pages/StoryPage';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata('story', 'en');
export default function OurStory() { return <StoryPage lang="en"/>; }
