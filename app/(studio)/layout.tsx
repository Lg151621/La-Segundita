// Root layout for the embedded Sanity Studio: no site header, footer, or styles.
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body style={{ margin: 0 }}>{children}</body></html>;
}
