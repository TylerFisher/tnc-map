/**
 * Roster search.
 *
 * Search is the surface's answer to finding a newsroom — the map is evidence
 * and is deliberately not operable. It matches across name, coverage type, city
 * and state, which means it doubles as a demonstration of the network's
 * composition: typing "Filipino" returns Ang Diaryo, Mahalaya and Tayo;
 * "Spanish" returns outlets in four states. A funder testing whether the
 * roster is really what TNC claims gets the answer by typing.
 */

import { stateName } from './states.js';
import type { Member } from './types.js';

export interface IndexedMember {
  member: Member;
  haystack: string;
}

/**
 * Folds case and strips diacritics, so "Kaheawai" finds "Kaheāwai Media" and
 * "BoriMas" finds "BoriMás". Members whose names carry marks should not be
 * harder to find than the rest of the roster.
 */
function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Extra strings folded into the index so a search matches the way people type.
 * Nobody searches "DC"; they type "Washington" or "District of Columbia".
 */
const SEARCH_ALIASES: Record<string, string> = {
  DC: 'District of Columbia',
  VI: 'Virgin Islands',
  MP: 'Marianas',
};

export function buildIndex(members: readonly Member[]): IndexedMember[] {
  return members.map((member) => {
    const code = (member.state ?? '').toUpperCase();
    const parts = [
      member.name,
      member.coverage,
      member.city ?? '',
      code,
      code ? stateName(code) : '',
      SEARCH_ALIASES[code] ?? '',
    ];
    return { member, haystack: normalize(parts.join(' ')) };
  });
}

/**
 * All terms must match, in any field and any order — "chicago community"
 * narrows rather than widening, which is what people expect from a search box
 * even when they could not say so.
 */
export function search(index: readonly IndexedMember[], query: string): Member[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return index.map((entry) => entry.member);

  return index
    .filter((entry) => terms.every((term) => entry.haystack.includes(term)))
    .map((entry) => entry.member);
}
