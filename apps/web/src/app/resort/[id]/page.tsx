import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { configFromEnv, officialLinks, type OutboundLink } from '@searchski/affiliates';
import { getI18n } from '@/i18n/server';
import { getResort } from '@/lib/data';
import { SHOW_REGIONAL_LAYER } from '@/lib/features';
import { countryName, curatedValue, km, metres, minutesToHm, money, verificationOf } from '@/lib/format';
import { BoundaryNote, CountryList } from '@/components/AreaFacts';
import {
  CrowdingIndicator,
  ElevationProfile,
  LiftBreakdown,
  NightSki,
  StatTile,
  TerrainMix,
} from '@/components/ResortCharts';
import { ConditionsPanel } from '@/components/ConditionsPanel';
import { ResortMap } from '@/components/ResortMap';
import { OutboundLinkGroup } from '@/components/OutboundLink';
import { BookThisTrip } from '@/components/BookThisTrip';
import { CuratedFact, VerificationBadge, type Status } from '@/components/VerificationBadge';
import {
  gatewayAirport,
  groupsFromSearchParams,
  tripFromSearchParams,
  tripToQuery,
  tripWithPrimaryGroup,
} from '@/lib/trip';

interface PageProps {
  params: Promise<{ id: string }>;
  /**
   * The trip window arrives here in the query string, so a link followed from
   * the results list carries the user's dates, party size and origin airport
   * through to the booking links below. Every one of them is optional; an
   * absent or malformed value is dropped and the page says it has none.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const bundle = await getResort(decodeURIComponent(id));
  if (!bundle) return { title: 'Resort not found' };
  const { area } = bundle;
  return {
    title: area.name,
    description: `${area.name}, ${countryName(area.country)} — ${km(area.kmTotal, 0)} of piste, ${area.liftsTotal} lifts. Terrain, crowding, lifts and transfers.`,
  };
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function ResortPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { t, locale } = await getI18n();
  const bundle = await getResort(decodeURIComponent(id));
  if (!bundle) notFound();

  const { area, israel, apres, transfers, airports, passRegion, passPrices } = bundle;
  const affiliateConfig = configFromEnv();

  // The trip window, straight off the URL. Nothing is defaulted.
  const query = await searchParams;
  const trip = tripFromSearchParams(query);

  // Traveller groups, if the link carries any. EMPTY IS THE ORDINARY CASE and
  // everything below then behaves exactly as it did before groups existed —
  // one origin, one party, four link groups. See lib/trip.ts.
  const groups = groupsFromSearchParams(query);

  // The search page is single-origin by nature, so the link back to it carries
  // the FIRST group's origin and party size. That is the closest honest
  // approximation of "the trip"; the other groups keep their own values in
  // their own links, which is where the difference actually matters.
  const searchHref = `/${tripToQuery(tripWithPrimaryGroup(trip, groups))}`;

  // The airport a traveller flies into. Prefers a stored transfer row, which
  // carries a MEASURED drive time; falls back to the nearest airport we hold by
  // straight-line distance, which is enough to build a transfer or car search
  // and claims nothing about how long the drive takes. Null when we hold none
  // near enough to call a gateway — in which case those groups do not render.
  const gateway = gatewayAirport(area, airports, transfers);

  // Official links come from the affiliates package so the provider is always
  // named and the "never embed their trail map" rule holds in one place.
  const official: OutboundLink[] = officialLinks(area.websites, area.name);

  const israelStatus: Status = israel ? (verificationOf(israel.provenance) ?? 'unverified') : 'absent';
  const kosher = curatedValue(israel, (p) => p.kosherAvailability);
  const kosherWord = (level: 0 | 1 | 2 | 3 | null): string | null =>
    level === null ? null : t(`israel.kosher.${level}` as 'israel.kosher.0');

  const chabad = curatedValue(israel, (p) => p.chabadDistanceKm);
  const hebrew = curatedValue(israel, (p) => p.hebrewSkiSchool);

  return (
    <article className="space-y-4">
      {bundle.meta.isSample ? (
        <p role="status" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          {t('banner.sample')}
        </p>
      ) : null}

      <header>
        <p className="text-xs text-muted">
          <Link href="/" className="text-accent no-underline">
            {t('nav.search')}
          </Link>
          {' / '}
          <span>{countryName(area.country)}</span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-fg">{area.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <CountryList area={area} />
          {area.regionName ? ` · ${area.regionName}` : ''}
          {area.localities.length > 0 ? ` · ${area.localities.slice(0, 4).join(', ')}` : ''}
        </p>
        {area.aliases.length > 0 ? (
          <p className="mt-1 text-xs text-muted">
            {t('criteria.any')}: {area.aliases.slice(0, 6).join(' · ')}
          </p>
        ) : null}
      </header>

      {/* Must sit with the km total, not below the fold. */}
      <BoundaryNote area={area} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t('resort.pistes')} value={km(area.kmTotal, 0)} hint={`${area.runsTotal} ${t('resort.runs')}`} />
        <StatTile label={t('resort.vertical')} value={metres(area.verticalM)} hint={`${t('resort.top')} ${metres(area.topElevM)}`} />
        <StatTile label={t('resort.liftsTotal')} value={String(area.liftsTotal)} hint={km(area.liftsKmTotal, 1)} />
        <StatTile
          label={t('resort.snowmaking')}
          value={area.snowmakingKm > 0 ? km(area.snowmakingKm, 0) : t('resort.unknown')}
          hint={area.snowmakingKm > 0 ? undefined : 'not tagged in OSM'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('resort.terrain')}>
          <TerrainMix area={area} t={t} />
        </Section>

        <Section title={t('resort.elevation')}>
          <ElevationProfile area={area} t={t} />
        </Section>

        <Section title={t('resort.lifts')}>
          <LiftBreakdown area={area} t={t} />
        </Section>

        <Section title={t('resort.crowding')}>
          <CrowdingIndicator area={area} t={t} />
        </Section>

        <Section title={t('resort.nightSki')}>
          <NightSki area={area} t={t} />
        </Section>

        <Section title={t('resort.conditions')}>
          <ConditionsPanel resortId={area.id} />
        </Section>
      </div>

      {/* ------------------------------------------------------------------
          The regional layer — dormant. See src/lib/features.ts.

          Retained rather than deleted: the curated data, the verification
          gating and the claim-vs-fact rendering below are all correct, and
          `SHOW_REGIONAL_LAYER` restores them in one line. Every value here is
          hand-typed and rendered as a CLAIM until a human verifies it, because
          telling someone a restaurant is kosher when it is not is a real harm
          (PLAN.md §9). That discipline is what the language layer will reuse.
         ------------------------------------------------------------------ */}
      {SHOW_REGIONAL_LAYER ? (
      <Section title={t('resort.israel')} aside={<VerificationBadge status={israelStatus} t={t} />}>
        {!israel ? (
          <p className="text-sm text-muted">{t('israel.none')}</p>
        ) : (
          <dl>
            <CuratedFact
              label={t('israel.kosher')}
              value={kosherWord(kosher.value)}
              claim={
                kosher.claim !== null
                  ? `${kosherWord(kosher.claim)}${israel.kosherNotes ? ` — ${israel.kosherNotes}` : ''}`
                  : (israel.kosherNotes ?? null)
              }
              status={kosher.status}
              t={t}
              extraWarning={kosher.status !== 'verified' ? t('verify.kosherWarning') : undefined}
            />
            <CuratedFact
              label={t('israel.hebrewSchool')}
              value={hebrew.value === null ? null : hebrew.value ? t('resort.yes') : t('resort.no')}
              claim={
                hebrew.claim === null
                  ? (israel.hebrewSkiSchoolNotes ?? null)
                  : `${hebrew.claim ? t('resort.yes') : t('resort.no')}${israel.hebrewSkiSchoolNotes ? ` — ${israel.hebrewSkiSchoolNotes}` : ''}`
              }
              status={hebrew.status}
              t={t}
            />
            <CuratedFact
              label={t('israel.chabad')}
              value={chabad.value === null ? null : `${Math.round(chabad.value)} km${israel.chabadName ? ` — ${israel.chabadName}` : ''}`}
              claim={chabad.claim === null ? null : `${Math.round(chabad.claim)} km${israel.chabadName ? ` — ${israel.chabadName}` : ''}`}
              status={chabad.status}
              t={t}
            />
            {israel.shabbatNotes ? (
              <CuratedFact
                label={t('israel.shabbat')}
                value={israelStatus === 'verified' ? israel.shabbatNotes : null}
                claim={israel.shabbatNotes}
                status={israelStatus}
                t={t}
              />
            ) : null}
            {israel.israeliGatewayAirports.length > 0 ? (
              <div className="border-t border-border py-3">
                <dt className="text-sm font-medium text-fg">{t('israel.gateways')}</dt>
                <dd className="mt-1 font-mono text-sm text-muted">
                  {israel.israeliGatewayAirports.join(' · ')}
                </dd>
              </div>
            ) : null}
          </dl>
        )}
      </Section>
      ) : null}

      {/* Après-ski density is universal — an OpenStreetMap count of what is
          mapped near the base. It lived inside the regional section only by
          accident of layout, so it is its own section now and stays visible. */}
      {apres ? (
        <Section title={t('israel.apres')}>
          <p className="text-xs text-muted">
            {apres.barCount} bars · {apres.nightclubCount} clubs · {apres.restaurantCount}{' '}
            restaurants mapped near the base. An OpenStreetMap density proxy, not a review.
          </p>
        </Section>
      ) : null}

      {/* --- travel --- */}
      <Section title={t('resort.travel')}>
        {transfers.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">{t('resort.noTransfers')}</p>
            {/* We do hold the airport itself. Saying which one, and how far it
                is in a straight line, is a fact; turning that into a drive time
                would not be, so no drive time is shown. */}
            {gateway ? (
              <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                <p className="text-sm text-fg">
                  {t('resort.gateway')}: <span className="font-mono">{gateway.iata}</span>
                  {gateway.name && gateway.name !== gateway.iata ? (
                    <span className="text-muted"> · {gateway.name}</span>
                  ) : null}
                  <span className="ms-2 font-mono text-muted">
                    {km(gateway.straightLineKm, 0)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted">{t('resort.gatewayDerived')}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-2">
            {transfers.slice(0, 6).map((transfer) => {
              const airport = airports[transfer.airportIata];
              return (
                <li
                  key={transfer.airportIata}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm last:border-b-0"
                >
                  <span className="text-fg">
                    <span className="font-mono">{transfer.airportIata}</span>
                    {airport ? <span className="text-muted"> · {airport.name}</span> : null}
                    {/* "Direct from TLV" is part of the dormant regional layer,
                        and the seed data itself marks it unverified because
                        route maps change every season. Gated with the rest. */}
                    {SHOW_REGIONAL_LAYER && airport?.directFromTLV ? (
                      <span className="ms-2 rounded-full border border-accent/40 bg-accent-soft px-1.5 py-0.5 text-[11px] text-fg">
                        {t('resort.directTlv')}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-muted">
                    {minutesToHm(transfer.driveMinutes)} {t('resort.driveTime')} ·{' '}
                    {km(transfer.distanceKm, 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ------------------------------------------------------------------
          Book this trip.

          SEPARATE SEARCHES, NEVER ONE PURCHASE. No cart, no combined price, no
          single "book this trip" button — flights and lodging are distinct
          groups that the user follows and pays for independently. Combining
          them into one sale would make Searchski the "organiser" under the EU
          Package Travel Directive 2015/2302: strict liability for the whole
          trip plus mandatory insolvency bonding. PLAN.md §9 and the header of
          packages/affiliates/src/index.ts.

          That holds ACROSS traveller groups too. Several parties converging on
          one resort get several sets of separate links — never one basket.
         ------------------------------------------------------------------ */}
      <Section title={t('book.title')}>
        <BookThisTrip
          area={area}
          gateway={gateway}
          trip={trip}
          groups={groups}
          airports={Object.keys(airports)}
          config={affiliateConfig}
          t={t}
          searchHref={searchHref}
        />
      </Section>

      {/* --- pass --- */}
      <Section title={t('resort.passPrices')}>
        {passRegion ? (
          <p className="mb-2 text-sm text-fg">
            {t('resort.passRegion')}: <span className="font-medium">{passRegion.name}</span>
            {passRegion.marketedKm ? (
              <span className="text-muted"> · {km(passRegion.marketedKm, 0)} marketed</span>
            ) : null}
          </p>
        ) : null}
        {passPrices.length === 0 ? (
          <p className="text-sm text-muted">{t('resort.noPassPrices')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {passPrices.slice(0, 8).map((price, i) => (
              <li key={`${price.season}-${price.category}-${price.duration}-${i}`} className="flex justify-between gap-3">
                <span className="text-muted">
                  {price.category} · {price.duration} · {price.season}
                  {price.isDynamic ? ' · dynamic' : ''}
                </span>
                <span className="font-mono text-fg">{money(price.price, price.currency)}</span>
                <VerificationBadge status={verificationOf(price.provenance) ?? 'unverified'} t={t} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* --- map --- */}
      <Section title={t('resort.map')}>
        <ResortMap
          markers={[{ id: area.id, name: area.name, lat: area.lat, lon: area.lon, primary: true }]}
          label={`Map of ${area.name}`}
          height={340}
        />
        <p className="mt-2 font-mono text-xs text-muted">
          {area.lat.toFixed(4)}, {area.lon.toFixed(4)}
        </p>
      </Section>

      {/* ------------------------------------------------------------------
          Outbound links.
          Flights and lodging are SEPARATE groups on purpose. Combining a
          flight and accommodation into one sale would make Searchski the
          "organiser" under EU Package Travel Directive 2015/2302 — strict
          liability plus mandatory insolvency bonding. Do not add a cart or a
          combined price. PLAN.md §9.
         ------------------------------------------------------------------ */}
      <Section title={t('resort.links')}>
        <div className="grid gap-5 sm:grid-cols-2">
          <OutboundLinkGroup title={t('resort.officialSite')} links={official} />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-fg">{t('resort.trailMap')}</h3>
            <p className="text-xs text-muted">{t('resort.trailMapNote')}</p>
            {official[0] ? (
              <a
                href={official[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-fg no-underline hover:border-accent"
              >
                {t('resort.trailMap')} — {official[0].provider}
                <span className="sr-only"> ({t('outbound.aria')})</span>
              </a>
            ) : (
              <p className="text-sm text-muted">{t('resort.unknown')}</p>
            )}
          </div>
        </div>
        {affiliateConfig.travelpayoutsMarker || affiliateConfig.bookingAid ? (
          <p className="mt-4 border-t border-border pt-3 text-xs text-muted">
            Some links on Searchski are affiliate links and are labelled as such. Searchski is a
            referral service, not a tour operator or merchant of record.
          </p>
        ) : null}
      </Section>

      <p className="text-xs text-muted">
        Source: {area.provenance.source}
        {area.provenance.fetchedAt
          ? ` · fetched ${new Date(area.provenance.fetchedAt).toISOString().slice(0, 10)}`
          : ''}
        {' · '}
        <Link href="/about" className="text-accent" lang={locale}>
          {t('nav.about')}
        </Link>
      </p>
    </article>
  );
}
