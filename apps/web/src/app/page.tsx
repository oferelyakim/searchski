import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { getDataset } from '@/lib/data';
import { runSearch } from '@/lib/search-service';
import { SearchExperience } from '@/components/SearchExperience';
import { DataSourceBanner } from '@/components/Chrome';

export const metadata: Metadata = {
  title: 'Search',
  description:
    'Describe the ski trip you want in your own words and see resorts ranked, with the reason for every score.',
};

/**
 * The search page.
 *
 * Rendered on the server with a first page of results already in it, so the
 * page is useful before any JavaScript loads. The client component takes over
 * from there and talks to /api/search.
 */
export default async function SearchPage() {
  const { t } = await getI18n();
  const data = await getDataset();

  // A bare query: the always-on factors alone give a sensible starting order.
  const initialResponse = await runSearch({ criteria: { limit: 12 } });

  // Suggestions for the "Flying from" box, nothing more: the field takes any
  // IATA code and has NO default. Drawn from every airport we hold plus every
  // one a transfer row mentions, so the list is not silently narrowed to the
  // handful of resorts that happen to have measured drive times.
  const airports = [
    ...new Set([
      ...data.airports.map((a) => a.iata.toUpperCase()),
      ...data.transfers.map((tr) => tr.airportIata.toUpperCase()),
    ]),
  ].sort();

  return (
    <>
      <div className="-mx-4 -mt-5 mb-4">
        <DataSourceBanner meta={data.meta} t={t} />
      </div>

      <div className="mb-5">
        <h1 className="text-xl font-semibold text-fg sm:text-2xl">{t('app.name')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('app.tagline')}</p>
      </div>

      <SearchExperience
        initialResponse={initialResponse}
        countries={data.meta.countries}
        airports={airports}
      />
    </>
  );
}
