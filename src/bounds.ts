/**
 * Choosing the map's opening camera position.
 *
 * The roster contains one member in New Delhi. Fitting the initial view to
 * every pin therefore framed a hemisphere, reducing the US — where the other
 * 68 pins are — to a smear along one edge. That was the original map's default
 * view on every page load.
 *
 * A hardcoded US bounding box would fix today's data and silently break the
 * next international member, so the outlier test here is statistical rather
 * than geographic: an interquartile fence over latitude and longitude
 * independently. Pins outside the fence stay on the map and remain findable
 * via the "Show all" control; only the opening frame ignores them.
 */

import type { Coords } from './types.js';

/** Below this many points, "outlier" is not a meaningful claim. */
const MIN_SAMPLE = 5;

/**
 * Standard Tukey fence multiplier.
 *
 * Checked against the real roster: 1.5 excludes Wasilla, Honolulu and New
 * Delhi from the opening frame, which is the behaviour we want. Widening it to
 * 3.0 does pull Alaska and Hawaii back in, but only by zooming out far enough
 * that the other 66 pins collapse into an unreadable knot with most of the
 * frame given over to ocean and South America — the fix is worse than the bug.
 *
 * Excluded pins are not hidden: they stay on the map, and the "Show all"
 * control names how many sit outside the current view. See `map.ts`.
 *
 * Note that the rendered viewport is wider than the fitted bounds once padding
 * and aspect ratio are applied, so being outside this fence does not by itself
 * mean being off-screen — San Juan is excluded here but visible in practice.
 */
const FENCE_MULTIPLIER = 1.5;

/**
 * If the fence rejects more than this share of the data, the distribution is
 * genuinely spread out rather than outlier-y, and trimming would hide real
 * members rather than one stray. Fall back to framing everything.
 */
const MIN_RETAINED_FRACTION = 0.6;

export function withoutOutliers(coords: readonly Coords[]): Coords[] {
  if (coords.length < MIN_SAMPLE) return [...coords];

  const lat = fence(coords.map((c) => c.lat));
  const lng = fence(coords.map((c) => c.lng));

  const kept = coords.filter(
    (c) => c.lat >= lat.lo && c.lat <= lat.hi && c.lng >= lng.lo && c.lng <= lng.hi,
  );

  return kept.length >= coords.length * MIN_RETAINED_FRACTION ? kept : [...coords];
}

export function fence(values: readonly number[]): { lo: number; hi: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return { lo: q1 - FENCE_MULTIPLIER * iqr, hi: q3 + FENCE_MULTIPLIER * iqr };
}

/** Linear-interpolated quantile over a pre-sorted array. */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const lower = sorted[base] ?? 0;
  const upper = sorted[base + 1] ?? lower;
  return lower + (upper - lower) * (pos - base);
}
