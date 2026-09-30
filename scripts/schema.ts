/**
 * Build-time validation of the Google Sheet.
 *
 * The whole point of this file is that a typo in a spreadsheet becomes a loud
 * build failure instead of a silently missing pin.
 */

import { z } from 'zod';
import type { Coverage, MemberKind } from '../src/types.js';

const trimmed = z.string().trim();

/** Empty-string -> null, so blank spreadsheet cells stop being `""` everywhere. */
const blankToNull = trimmed.transform((v) => (v === '' ? null : v));

/**
 * Coordinates arrive as strings and are frequently blank. Anything present but
 * unparseable is an error, not a silent drop — a mistyped latitude should stop
 * the build rather than quietly remove a newsroom from the map.
 */
const coordinate = (min: number, max: number, label: string) =>
  trimmed.transform((v, ctx) => {
    if (v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} "${v}" is not a number` });
      return z.NEVER;
    }
    if (n < min || n > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} ${n} is outside the valid range ${min}..${max}`,
      });
      return z.NEVER;
    }
    return n;
  });

/**
 * Only http(s) survives. A `javascript:` URL in the Sheet would otherwise reach
 * an `href` attribute in the popup markup.
 */
const webUrl = trimmed.transform((v, ctx) => {
  if (v === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `url "${v}" is not a valid URL` });
    return z.NEVER;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `url "${v}" uses disallowed protocol "${parsed.protocol}"`,
    });
    return z.NEVER;
  }
  return parsed.toString();
});

/** Sheet "Coverage Type" -> how the map treats it. National and diaspora outlets get no pin. */
const COVERAGE: Record<string, [Coverage, MemberKind]> = {
  'place-based': ['Place-based', 'place'],
  regional: ['Regional', 'place'],
  national: ['National', 'beat'],
  diaspora: ['Diaspora', 'beat'],
};

export const RawRowSchema = z
  .object({
    'outlet name': trimmed.min(1, 'name is required'),
    city: blankToNull,
    state: blankToNull,
    latitude: coordinate(-90, 90, 'latitude'),
    longitude: coordinate(-180, 180, 'longitude'),
    url: webUrl,
    'coverage type': trimmed,
  })
  .transform((row, ctx) => {
    const hit = COVERAGE[row['coverage type'].toLowerCase()];
    if (!hit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `coverage type "${row['coverage type']}" is not one of: Place-based, Regional, National, Diaspora`,
      });
      return z.NEVER;
    }
    const [coverage, kind] = hit;
    // A half-filled coordinate pair is a data-entry mistake, not a location.
    if ((row.latitude === null) !== (row.longitude === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `row has ${row.latitude === null ? 'longitude but no latitude' : 'latitude but no longitude'}`,
      });
      return z.NEVER;
    }
    // Some national rows carry HQ coordinates; a pin would claim local coverage.
    const placed = kind === 'place';
    return {
      name: row['outlet name'],
      kind,
      coverage,
      city: row.city,
      state: row.state,
      lat: placed ? row.latitude : null,
      lng: placed ? row.longitude : null,
      url: row.url,
    };
  });

export type RawRow = z.infer<typeof RawRowSchema>;

export const REQUIRED_COLUMNS = [
  'outlet name',
  'city',
  'state',
  'latitude',
  'longitude',
  'url',
  'coverage type',
] as const;
