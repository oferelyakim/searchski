'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n/client';

type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'searchski.theme';

/**
 * Theme switch. The OS preference is the default; an explicit choice writes
 * `data-theme` on <html> and wins in both directions.
 *
 * The initial value is applied by a blocking inline script in the layout, so
 * there is no flash. This component only handles the toggle afterwards.
 */
export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  const apply = (next: Theme) => {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'system') {
      root.removeAttribute('data-theme');
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute('data-theme', next);
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  const cycle = () => apply(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');

  return (
    <button
      type="button"
      onClick={cycle}
      title={t('nav.theme')}
      aria-label={`${t('nav.theme')} (${theme})`}
      className="rounded-md border border-border px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-fg"
    >
      <span aria-hidden="true">{theme === 'dark' ? '◐' : theme === 'light' ? '☀' : '◑'}</span>
      <span className="ms-1.5 hidden sm:inline">{theme}</span>
    </button>
  );
}
