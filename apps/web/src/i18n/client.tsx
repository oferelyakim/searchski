'use client';

/**
 * Client-side access to the locale chosen on the server.
 *
 * The provider receives the already-resolved locale as a prop, so server and
 * client render identical markup on the first pass — no hydration mismatch and
 * no flash of the wrong language.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  dirFor,
  makeTranslator,
  type Locale,
  type MessageKey,
  type Translate,
} from './dictionary';

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Translate;
}

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  dir: 'ltr',
  t: makeTranslator(DEFAULT_LOCALE),
});

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({ locale, dir: dirFor(locale), t: makeTranslator(locale) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

export function useT(): (key: MessageKey) => string {
  return useContext(I18nContext).t;
}
