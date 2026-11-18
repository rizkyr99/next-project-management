import localFont from 'next/font/local';
import { SiteFooter } from './_components/site-footer';
import { SiteHeader } from './_components/site-header';

// Headlines on public pages only; the app itself stays on Geist.
// Self-hosted like the app fonts (see app/layout.tsx).
const display = localFont({
  src: '../fonts/schibsted-grotesk-latin.woff2',
  weight: '600 800',
  variable: '--font-display-face',
  display: 'swap',
});

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} flex min-h-dvh flex-col bg-background text-foreground`}>
      <a
        href='#main'
        className='sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring'>
        Skip to content
      </a>
      <SiteHeader />
      <main id='main' className='flex-1'>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
