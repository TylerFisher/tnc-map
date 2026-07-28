/**
 * Dataset access and derived views.
 *
 * The roster is bundled at build time from `data/members.json`, which is
 * produced by `npm run sync`. There is no runtime fetch: the map cannot break
 * because a Google Sheet was unpublished, renamed, or rate-limited.
 */

import raw from '../data/members.json';
import { TIERS, placementOf, type Dataset, type Member, type Tier } from './types.js';

const dataset = raw as Dataset;

export const members: readonly Member[] = dataset.members;
export const generatedAt = new Date(dataset.generatedAt);

export const mappedMembers = members.filter((m) => m.coords !== null);
export const beatMembers = members.filter((m) => placementOf(m) === 'beat');
export const unplacedMembers = members.filter((m) => placementOf(m) === 'unplaced');

/** Totals per tier across the whole roster, used for the filter pill labels. */
export const tierTotals: Record<Tier, number> = Object.fromEntries(
  TIERS.map((tier) => [tier, members.filter((m) => m.tier === tier).length]),
) as Record<Tier, number>;

/** Distinct states among mapped members — the "N states and territories" figure. */
export function countStates(subset: readonly Member[]): number {
  return new Set(subset.map((m) => m.state).filter((s): s is string => Boolean(s))).size;
}

export function locationLabel(member: Member): string | null {
  return [member.city, member.state].filter(Boolean).join(', ') || null;
}
