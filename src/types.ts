/**
 * Shared types for the member dataset.
 *
 * These are plain types with no runtime dependency — the browser bundle must
 * stay small. Validation happens once, at build time, in `scripts/schema.ts`.
 * By the time a Member reaches this code it is already known-good.
 */

export const MEMBER_KINDS = ['place', 'beat'] as const;
/**
 * `place` — the newsroom serves a geographic area and belongs on the map.
 * `beat`  — a national or diaspora newsroom, not defined by geography, and
 *           intentionally has no pin. This is not missing data.
 */
export type MemberKind = (typeof MEMBER_KINDS)[number];

export type Coverage = 'Place-based' | 'Regional' | 'National' | 'Diaspora';

export interface Coords {
  lat: number;
  lng: number;
}

export type CoordSource = 'sheet' | 'geocoded';

export interface Member {
  /** Stable slug derived from the name; survives row reordering in the Sheet. */
  id: string;
  name: string;
  kind: MemberKind;
  coverage: Coverage;
  city: string | null;
  state: string | null;
  coords: Coords | null;
  /** Where `coords` came from. Absent when `coords` is null. */
  coordSource: CoordSource | null;
  /** Guaranteed http(s) — other protocols are rejected at build time. */
  url: string | null;
}

export interface Dataset {
  /** ISO timestamp of the last successful sync. */
  generatedAt: string;
  /** Which input produced this file. */
  source: 'google-sheet' | 'local-csv';
  members: Member[];
}

/**
 * How a member is surfaced in the UI. Derived, not stored.
 *
 * The original map had no `unplaced` concept: `place` rows without coordinates
 * were dropped from the map and were not eligible for the sidebar either, so
 * 21 of 103 members rendered nowhere at all.
 */
export type Placement = 'mapped' | 'beat' | 'unplaced';

export function placementOf(member: Member): Placement {
  if (member.kind === 'beat') return 'beat';
  return member.coords ? 'mapped' : 'unplaced';
}
