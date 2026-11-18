import type { Metadata } from 'next';
// Self-hosted (latin, variable weight) instead of next/font/google: the build
// doesn't depend on what Google serves, which broke CI builds when the font
// URLs came back with query strings Turbopack can't map.
import localFont from 'next/font/local';
import './globals.css';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/components/query-provider';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Suspense } from 'react';
import { NavigationProgress } from '@/components/navigation-progress';
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site';

const geistSans = localFont({
  src: './fonts/geist-latin.woff2',
  weight: '100 900',
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = localFont({
  src: './fonts/geist-mono-latin.woff2',
  weight: '100 900',
  variable: '--font-geist-mono',
  display: 'swap',
  // Rarely used (code in descriptions), so don't compete with the page's
  // first paint for bandwidth; it loads when something uses it.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Suspense: it reads the URL, which mustn't make static pages dynamic. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <QueryProvider>
          <ThemeProvider
            attribute='class'
            defaultTheme='system'
            enableSystem
            disableTransitionOnChange>
            {children}
            <Toaster />
          </ThemeProvider>
        </QueryProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
