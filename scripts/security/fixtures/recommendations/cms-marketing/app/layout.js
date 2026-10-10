import { Analytics } from '@vercel/analytics/next';
export default function Layout({ children }) { return [children, Analytics]; }
