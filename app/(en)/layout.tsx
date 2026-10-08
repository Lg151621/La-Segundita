import { Document } from '@/components/Document';
import { Analytics } from '@vercel/analytics/next';
import '../globals.css';

export default function EnglishLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Document lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </Document>
  );
}