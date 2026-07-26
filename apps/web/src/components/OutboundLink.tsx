import type { OutboundLink as OutboundLinkData } from '@searchski/affiliates';

/**
 * The ONLY way this app renders a link to a third party.
 *
 * Two rules, both from PLAN.md §9 and neither negotiable:
 *
 *  1. The provider is always visible BEFORE the click. A user must never
 *     discover which company they have been handed to only after arriving.
 *  2. A monetized link carries `rel="noopener nofollow sponsored"` and says so
 *     in words. Undisclosed affiliate links are the thing that turns a useful
 *     referral site into a dishonest one.
 *
 * Searchski is a referral service. It never sells, never takes payment, and is
 * never the merchant of record.
 */

export interface OutboundLinkProps {
  link: OutboundLinkData;
  /** Compact form for dense lists. */
  dense?: boolean;
  className?: string;
}

export function OutboundLinkView({ link, dense = false, className = '' }: OutboundLinkProps) {
  const rel = link.monetized ? 'noopener noreferrer nofollow sponsored' : 'noopener noreferrer';

  return (
    <a
      href={link.url}
      target="_blank"
      rel={rel}
      className={`group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 ${
        dense ? 'py-2' : 'py-2.5'
      } text-sm no-underline transition-colors hover:border-accent ${className}`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-fg">{link.label}</span>
        {/* Rule 1: the third party is named, always. */}
        <span className="text-xs text-muted">
          {link.provider}
          {link.monetized ? ' · affiliate link' : ''}
        </span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-muted transition-colors group-hover:text-accent">
        {/* Logical direction: flips automatically under dir="rtl". */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="sr-only">(opens on a third-party site in a new tab)</span>
    </a>
  );
}

/**
 * A group of outbound links of ONE kind.
 *
 * Flights and lodging must never be rendered as a single combined "book this
 * trip" action with one price. Combining a flight and accommodation into one
 * sale makes Searchski the "organiser" under the EU Package Travel Directive
 * 2015/2302 — strict liability for the whole trip plus mandatory insolvency
 * bonding. Separate, independently-followed links do not create a package.
 * Keep the groups visually and functionally distinct. Do not add a cart.
 */
export function OutboundLinkGroup({
  title,
  note,
  links,
  /**
   * Heading level for the group title. `h3` by default, which is right directly
   * under a page section. Multi-group booking nests these under a per-group
   * `h3`, and a heading outline that skips or repeats a level is exactly what
   * makes a page unnavigable by heading for a screen-reader user.
   */
  headingLevel = 3,
}: {
  title: string;
  note?: string;
  links: OutboundLinkData[];
  headingLevel?: 3 | 4;
}) {
  if (links.length === 0) return null;
  const Heading = headingLevel === 4 ? 'h4' : 'h3';
  return (
    <div className="space-y-2">
      <Heading className="text-sm font-semibold text-fg">{title}</Heading>
      {note ? <p className="text-xs text-muted">{note}</p> : null}
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={`${link.provider}-${link.url}`}>
            <OutboundLinkView link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}
