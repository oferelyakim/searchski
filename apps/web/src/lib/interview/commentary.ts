/**
 * The crew's closing remarks over a finished search.
 *
 * Every line is computed from data the response actually contains — a
 * specialist never asserts anything the engine cannot back up, and a line
 * whose data is missing is simply not spoken. Fixed dictionary strings with
 * `{placeholder}` interpolation; zero model involvement.
 */

import type { SearchResponse } from '@searchski/core/types';
import type { MessageKey } from '@/i18n/dictionary';
import type { CastId } from './cast';
import type { InterviewState } from './script';

export interface CommentLine {
  speaker: CastId;
  key: MessageKey;
  values?: Record<string, string>;
}

const MAX_LINES = 4;

export function crewCommentary(state: InterviewState, response: SearchResponse): CommentLine[] {
  const lines: CommentLine[] = [];
  const top = response.results[0];
  if (!top) return lines;

  if (top.area.kmTotal > 0) {
    lines.push({
      speaker: 'marco',
      key: 'iv.cmt.marco',
      values: { name: top.area.name, km: String(Math.round(top.area.kmTotal)) },
    });
  }

  if (top.transfer) {
    lines.push({
      speaker: 'tomer',
      key: 'iv.cmt.tomer',
      values: {
        name: top.area.name,
        min: String(top.transfer.driveMinutes),
        iata: top.transfer.airportIata,
      },
    });
  }

  if (state.criteria.originAirport) {
    lines.push({
      speaker: 'jonas',
      key: 'iv.cmt.jonas',
      values: { origin: state.criteria.originAirport },
    });
  } else {
    lines.push({ speaker: 'jonas', key: 'iv.cmt.jonasNoOrigin' });
  }

  if (state.criteria.wantFamily) {
    lines.push({ speaker: 'noa', key: 'iv.cmt.noa' });
  }

  lines.push({ speaker: 'lena', key: 'iv.cmt.lena' });

  if (typeof state.facts.budgetPerPersonUsd === 'number') {
    lines.push({
      speaker: 'maya',
      key: 'iv.cmt.budget',
      values: { budget: `$${state.facts.budgetPerPersonUsd.toLocaleString('en-US')}` },
    });
  }

  return lines.slice(0, MAX_LINES);
}

/** `"{name} is great"` + `{name: "Bansko"}` → `"Bansko is great"`. */
export function fillTemplate(template: string, values?: Record<string, string>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
