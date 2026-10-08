export function Butterfly({ className = '' }: { className?: string }) {
  return <svg className={`butterfly ${className}`} viewBox="0 0 100 80" fill="none" aria-hidden="true" focusable="false"><path d="M48 39C23 0 2 7 9 32c2 10 12 15 24 16C5 54 19 78 38 65l12-19 12 19c19 13 33-11 5-17 12-1 22-6 24-16C98 7 77 0 52 39" fill="#e9952c" stroke="#3a2a1e" strokeWidth="3"/><path d="M49 31v31m0-29-8-12m9 12 8-12M13 25l25 18m48-18L62 43M26 60l14-8m34 8-14-8" stroke="#3a2a1e" strokeWidth="2"/><g fill="#fff6e2"><circle cx="17" cy="19" r="2"/><circle cx="24" cy="14" r="2"/><circle cx="83" cy="19" r="2"/><circle cx="76" cy="14" r="2"/><circle cx="24" cy="59" r="2"/><circle cx="76" cy="59" r="2"/></g></svg>;
}
// Layered, ruffled petals give the local artwork a marigold silhouette.
export function Flower({ className = '' }: { className?: string }) {
  return <svg viewBox="0 0 80 80" className={`flower ${className}`} aria-hidden="true" focusable="false">
    <g fill="#eea533" stroke="#a65a1c" strokeWidth="1">
      {Array.from({ length: 12 }, (_, i) => <ellipse key={i} cx="40" cy="23" rx="9" ry="17" transform={`rotate(${i * 30} 40 40)`}/>)}
    </g>
    <g fill="#f8c454" stroke="#c4741f" strokeWidth="1">
      {Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx="40" cy="30" rx="6" ry="11" transform={`rotate(${i * 36 + 15} 40 40)`}/>)}
    </g>
    <circle cx="40" cy="40" r="8" fill="#d6801f"/>
    <path d="m35 40 3-4 4 2 3-1-1 6-5 2-4-2" fill="none" stroke="#fbd474" strokeWidth="2"/>
  </svg>;
}
// A printer's ornament: double rule, marigold, double rule.
export function DecorativeDivider({ className = '' }: { className?: string }) { return <div className={`divider ${className}`} aria-hidden="true"><span/><Flower/><span/></div>; }
// A small scalloped garland of marigolds used where one chapter hands off to the next.
export function Garland({ count = 7 }: { count?: number }) { return <div className="garland" aria-hidden="true">{Array.from({ length: count }, (_, i) => <Flower key={i}/>)}</div>; }
