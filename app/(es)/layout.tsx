import { Document } from '@/components/Document';
import { Analytics } from '@vercel/analytics/next';
import '../globals.css';

export default function SpanishLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Document lang="es">
      <body>
        {children}
        <Analytics />
      </body>
    </Document>
  );
}