/**
 * Dataset access and derived views.
 *
 * The roster is bundled at build time from `data/members.json`, produced by
 * `npm run sync`. There is no runtime fetch: the map cannot break because a
 * Google Sheet was unpublished, renamed, or rate-limited.
 */

import raw from '../data/members.json';
import type { Dataset, Member } from './types.js';

const dataset = raw as Dataset;

export const members: readonly Member[] = dataset.members;
export const generatedAt = new Date(dataset.generatedAt);

/** Members with coordinates. These are the only ones the figure can show. */
export const mappedMembers = members.filter((m) => m.coords !== null);

/** Distinct states among mapped members — the "N states and territories" figure. */
export function countStates(subset: readonly Member[]): number {
  return new Set(subset.map((m) => m.state).filter((s): s is string => Boolean(s))).size;
}

export function locationLabel(member: Member): string | null {
  return [member.city, member.state].filter(Boolean).join(', ') || null;
}
