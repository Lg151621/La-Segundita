import { HomePage } from '@/components/pages/HomePage';
import { pageMetadata } from '@/lib/seo';

export const generateMetadata = () => pageMetadata('home', 'en');
export default function Home() { return <HomePage lang="en"/>; }
