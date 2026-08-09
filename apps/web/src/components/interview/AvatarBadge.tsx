'use client';

import { CAST, type CastId } from '@/lib/interview/cast';

/**
 * A cast member's face: initial in a colored disc. Pure CSS/SVG — no image
 * assets, so it costs nothing and matches both themes. The color is the
 * member's fixed identity across the whole app; the ring makes it read as an
 * avatar rather than a bullet point.
 */
export function AvatarBadge({ id, size = 36 }: { id: CastId; size?: number }) {
  const member = CAST[id];
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 select-none place-items-center rounded-full font-semibold text-white ring-2 ring-surface"
      style={{
        width: size,
        height: size,
        background: member.color,
        fontSize: size * 0.42,
      }}
    >
      {member.name.charAt(0)}
    </span>
  );
}

/** Name + role line shown beside the avatar on a message. */
export function SpeakerLine({ id, role }: { id: CastId; role: string }) {
  const member = CAST[id];
  return (
    <span className="flex items-baseline gap-1.5 text-xs">
      <span className="font-semibold" style={{ color: member.color }}>
        {member.name}
      </span>
      <span aria-hidden="true">{member.emoji}</span>
      <span className="text-muted">{role}</span>
    </span>
  );
}
