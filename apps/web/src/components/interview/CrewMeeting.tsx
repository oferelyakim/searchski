'use client';

import { CAST, CAST_IDS, type CastId } from '@/lib/interview/cast';
import { useT } from '@/i18n/client';
import { AvatarBadge } from './AvatarBadge';

/**
 * The crew as a video-call grid: whoever is talking holds the big tile, the
 * rest sit in small tiles alongside, visibly "in the room". Pure CSS theatre —
 * the active speaker simply follows the transcript, and the small tiles dim
 * slightly so the eye lands on the speaker.
 */
export function CrewMeeting({
  active,
  speaking,
  compact = false,
}: {
  /** Who holds the big tile. */
  active: CastId;
  /** True while the active member is "typing" — animates the indicator. */
  speaking: boolean;
  /** Tight variant for the results-phase side panel. */
  compact?: boolean;
}) {
  const t = useT();
  const member = CAST[active];
  const others = CAST_IDS.filter((id) => id !== active);

  return (
    <div
      className={`rounded-xl border border-border bg-bg p-2 ${compact ? '' : 'sm:p-3'}`}
      role="group"
      aria-label={t('iv.chatHeading')}
    >
      <div className={`flex items-stretch gap-2 ${compact ? '' : 'sm:gap-3'}`}>
        {/* The speaker's tile */}
        <div
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border p-2.5"
          style={{
            borderColor: member.color,
            background: `color-mix(in oklab, ${member.color} 8%, var(--c-surface))`,
          }}
        >
          <AvatarBadge id={active} size={compact ? 40 : 52} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">
              {member.name} <span aria-hidden="true">{member.emoji}</span>
            </p>
            <p className="truncate text-xs text-muted">{t(member.roleKey)}</p>
            {speaking ? (
              <span className="typing-dots mt-1" aria-label={t('iv.typing')}>
                <span /><span /><span />
              </span>
            ) : null}
          </div>
        </div>

        {/* Everyone else, listening in */}
        <div className={`grid shrink-0 content-center gap-1.5 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {others.map((id) => (
            <div
              key={id}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1 opacity-70"
              title={`${CAST[id].name} — ${t(CAST[id].roleKey)}`}
            >
              <AvatarBadge id={id} size={compact ? 20 : 24} />
              {!compact ? <span className="text-[11px] text-muted">{CAST[id].name}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
