/**
 * Server-side locale resolution.
 *
 * The locale lives in a cookie so the very first HTML response already carries
 * the right `lang` and `dir`. A client-side-only switch would render the page
 * LTR in English and then flip, which for an RTL audience is not acceptable.
 */

import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dirFor,
  isLocale,
  makeTranslator,
  type Locale,
  type Translate,
} from './dictionary';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  try {
    const h = await headers();
    const accept = h.get('accept-language') ?? '';
    if (/(^|[,;\s])he\b/i.test(accept) || /(^|[,;\s])iw\b/i.test(accept)) return 'he';
  } catch {
    // headers() is unavailable during static generation; default is fine.
  }
  return DEFAULT_LOCALE;
}

export async function getI18n(): Promise<{ locale: Locale; dir: 'ltr' | 'rtl'; t: Translate }> {
  const locale = await getLocale();
  return { locale, dir: dirFor(locale), t: makeTranslator(locale) };
}
