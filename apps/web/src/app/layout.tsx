import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getI18n } from '@/i18n/server';
import { I18nProvider } from '@/i18n/client';
import { Footer, Header } from '@/components/Chrome';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Searchski',
    template: '%s · Searchski',
  },
  description:
    'A ski-trip decision engine. Describe the trip you want in plain language and see exactly why each resort matched — or why we could not tell.',
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1117' },
  ],
};

/**
 * Applied before first paint so an explicit theme choice never flashes.
 * Deliberately tiny and dependency-free; it reads one localStorage key.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('searchski.theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Locale is resolved on the server so `lang` and `dir` are correct in the
  // very first byte — essential for Hebrew, which lays out right-to-left.
  const { locale, dir, t } = await getI18n();

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="bg-bg text-fg antialiased">
        <I18nProvider locale={locale}>
          <a href="#main" className="skip-link">
            {t('nav.skipToContent')}
          </a>
          <Header t={t} />
          <main id="main" className="mx-auto max-w-6xl px-4 py-5">
            {children}
          </main>
          <Footer t={t} />
        </I18nProvider>
      </body>
    </html>
  );
}
