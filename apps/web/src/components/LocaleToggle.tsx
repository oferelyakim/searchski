'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALES, LOCALE_COOKIE, type Locale } from '@/i18n/dictionary';
import { useI18n } from '@/i18n/client';

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
};

/**
 * Language switch.
 *
 * Writes a cookie and asks the server to re-render, rather than swapping
 * strings on the client — the whole document's `lang` and `dir` have to change
 * together for Hebrew to lay out correctly, and only the server can set those
 * on the first byte.
 */
export function LocaleToggle() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const choose = (next: Locale) => {
    // Cookie, not localStorage: the server has to be able to read it.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div role="group" aria-label={t('nav.language')} className="flex rounded-md border border-border">
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          onClick={() => choose(code)}
          aria-pressed={locale === code}
          disabled={pending}
          className={`px-2 py-1.5 text-xs first:rounded-s-md last:rounded-e-md ${
            locale === code ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg'
          }`}
        >
          {LOCALE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
