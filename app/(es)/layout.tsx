import { Document } from '@/components/Document';
import '../globals.css';

export default function SpanishLayout({ children }: { children: React.ReactNode }) { return <Document lang="es">{children}</Document>; }
