import Link from 'next/link';
import type { DatasetMeta } from '@/lib/data-types';
import type { MessageKey } from '@/i18n/dictionary';
import { ThemeToggle } from './ThemeToggle';
import { LocaleToggle } from './LocaleToggle';

type T = (key: MessageKey) => string;

export function Header({ t }: { t: T }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/" className="text-base font-semibold text-fg no-underline">
          {t('app.name')}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-muted no-underline hover:text-fg">
            {t('nav.search')}
          </Link>
          <Link href="/compare" className="text-muted no-underline hover:text-fg">
            {t('nav.compare')}
          </Link>
          <Link href="/about" className="text-muted no-underline hover:text-fg">
            {t('nav.about')}
          </Link>
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export function Footer({ t }: { t: T }) {
  return (
    <footer className="mt-10 border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl space-y-1 px-4 py-6 text-xs text-muted">
        <p>{t('footer.attribution')}</p>
        {/* Not decoration — see PLAN.md §9. */}
        <p className="font-medium text-fg">{t('footer.notOperator')}</p>
        <p>
          <Link href="/about" className="text-accent">
            {t('nav.about')}
          </Link>
        </p>
      </div>
    </footer>
  );
}

/**
 * Standing notice when the app is serving the built-in sample rows, plus a
 * quiet line naming the real source otherwise. A user must never mistake
 * placeholder numbers for researched data.
 */
export function DataSourceBanner({ meta, t }: { meta: DatasetMeta; t: T }) {
  if (meta.isSample) {
    return (
      <div role="status" className="border-b border-warn/40 bg-warn/10">
        <p className="mx-auto max-w-6xl px-4 py-2 text-xs text-warn">
          <strong className="font-semibold">Sample data.</strong> {t('banner.sample')}
        </p>
      </div>
    );
  }
  return (
    <p className="mx-auto max-w-6xl px-4 pt-2 text-[11px] text-muted">
      {t('banner.source')}: {meta.source} · {meta.areaCount.toLocaleString()} ski areas
    </p>
  );
}
