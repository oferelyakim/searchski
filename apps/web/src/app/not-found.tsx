import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="py-10 text-center">
      <h1 className="text-xl font-semibold text-fg">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('notFound.body')}</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg no-underline"
      >
        {t('nav.search')}
      </Link>
    </div>
  );
}
