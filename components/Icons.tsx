// One drawn icon family: 24px grid, 1.6 stroke, round joins. Decorative unless labelled by the parent.
type IconName = 'arrow' | 'pin' | 'clock' | 'phone' | 'menu' | 'close' | 'recycle' | 'tag' | 'spark' | 'globe';
const paths: Record<IconName, React.ReactNode> = {
  arrow: <path d="M7 17 17 7M9 7h8v8"/>,
  pin: <><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/></>,
  clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
  phone: <path d="M6.5 3.5h3l1.5 4-2 1.2a10 10 0 0 0 6.3 6.3l1.2-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>,
  menu: <path d="M4 7h16M4 12h16M4 17h10"/>,
  close: <path d="M6 6l12 12M18 6 6 18"/>,
  recycle: <><path d="M9.2 5.3 11 2.5l3.2 5.3"/><path d="M14.2 7.8 11 7.6"/><path d="M19.6 13.5l1.6 2.9-6 .2"/><path d="m15.2 16.6 1.6-2.8"/><path d="M5.6 18.4H2.4l3.2-5.4"/><path d="m5.6 13 1.5 2.8"/><path d="M8.4 5.5 4.6 12M20 12.4l-3.8-6.6M8.6 18.6h7.6"/></>,
  tag: <><path d="M3.5 12.3V4.5a1 1 0 0 1 1-1h7.8l8.2 8.2a1.4 1.4 0 0 1 0 2l-6.8 6.8a1.4 1.4 0 0 1-2 0Z"/><circle cx="8.2" cy="8.2" r="1.6"/></>,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>,
  globe: <><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.4 5.3 3.4 8.5s-1 5.9-3.4 8.5c-2.4-2.6-3.4-5.3-3.4-8.5s1-5.9 3.4-8.5Z"/></>,
};
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
