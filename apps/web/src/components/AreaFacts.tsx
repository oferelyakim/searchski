import type { SkiArea } from '@searchski/core/types';
import { countryName, flagEmoji } from '@/lib/format';

/**
 * Two facts about a ski area that must not be rendered ad hoc, because getting
 * either one wrong misleads the reader.
 */

/**
 * `boundaryNote` is set when upstream merged two separately-marketed resorts
 * into one record, so `kmTotal` describes something bigger than the name
 * implies — Alta Badia's 252.8 km includes all of Val Gardena.
 *
 * It MUST appear anywhere the piste km total appears. A user comparing that
 * figure against a 78 km resort is being misled without it. We do not split
 * the number or apportion it: we have no faithful basis for that, and a
 * guessed piste figure is precisely the fabrication this project refuses to
 * ship.
 */
export function BoundaryNote({ area, compact = false }: { area: SkiArea; compact?: boolean }) {
  const note = area.boundaryNote;
  if (!note) return null;

  if (compact) {
    return (
      <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-warn">
        <svg
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M12 8v5M12 16.5v.5" strokeLinecap="round" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        <span>{note}</span>
      </p>
    );
  }

  return (
    <p
      role="note"
      className="mt-2 rounded-md border border-warn/40 bg-warn/10 px-2.5 py-2 text-xs leading-snug text-warn"
    >
      <strong className="font-semibold">Piste total caveat. </strong>
      {note}
    </p>
  );
}

/**
 * Border resorts genuinely belong to both sides — Drei Zinnen straddles
 * Italy/Austria, La Thuile is lift-linked into France. Showing only the
 * primary `country` hides that from a skier flying into the other one.
 */
export function CountryList({ area }: { area: SkiArea }) {
  const codes = area.countries && area.countries.length > 0 ? area.countries : area.country ? [area.country] : [];

  if (codes.length === 0) return <span>—</span>;

  return (
    <span>
      {codes.map((code, i) => (
        <span key={code}>
          {i > 0 ? <span className="text-muted"> · </span> : null}
          <span aria-hidden="true">{flagEmoji(code)} </span>
          {countryName(code)}
        </span>
      ))}
    </span>
  );
}
