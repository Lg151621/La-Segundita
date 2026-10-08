'use client';
import { useState } from 'react';
import { copy, type Lang } from '@/lib/i18n';
import { Icon } from './Icons';

// Links whose URL is not approved yet render as a button that explains the link is coming.
export function ActionLink({ href, children, className = 'button', label, lang, arrow = true }: { href?: string; children: React.ReactNode; className?: string; label?: string; lang: Lang; arrow?: boolean }) {
  const [notice, setNotice] = useState(false);
  const inner = <>{children}{arrow && <Icon name="arrow"/>}</>;
  if (href) return <a className={className} href={href} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inner}</a>;
  return <span className="pending-action"><button type="button" className={className} onClick={() => setNotice(!notice)} aria-expanded={notice}>{inner}</button>{notice && <span className="pending-notice" role="status">{label || copy[lang].thisLink} {copy[lang].soon}</span>}</span>;
}
