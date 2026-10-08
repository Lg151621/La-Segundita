import { Document } from '@/components/Document';
import '../globals.css';

export default function EnglishLayout({ children }: { children: React.ReactNode }) { return <Document lang="en">{children}</Document>; }
