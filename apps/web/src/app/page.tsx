import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { getDataset } from '@/lib/data';
import { runSearch } from '@/lib/search-service';
import { InterviewExperience } from '@/components/interview/InterviewExperience';
import { DataSourceBanner } from '@/components/Chrome';

export const metadata: Metadata = {
  title: 'Plan a trip',
  description:
    'Answer a few quick questions from our crew of ski specialists and get resorts ranked to fit — with the reason for every score.',
};

/**
 * The front door: the interview.
 *
 * A short chat with the agency cast that compiles to the same `SearchCriteria`
 * the classic search uses — the classic page lives on at /search and the
 * interview links to it as an escape hatch. The only server work here is the
 * pool size, so the "N areas in play" counter starts truthful before the
 * first answer.
 */
export default async function HomePage() {
  const { t } = await getI18n();
  const data = await getDataset();

  const initial = await runSearch({ criteria: { limit: 1 } });

  return (
    <>
      <div className="-mx-4 -mt-5 mb-4">
        <DataSourceBanner meta={data.meta} t={t} />
      </div>

      <div className="mb-5 text-center">
        <h1 className="text-xl font-semibold text-fg sm:text-2xl">{t('iv.heading')}</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted">{t('iv.tagline')}</p>
      </div>

      <InterviewExperience totalAtStart={initial.totalConsidered} />
    </>
  );
}
