/**
 * Build-time validation of the Google Sheet.
 *
 * The whole point of this file is that a typo in a spreadsheet becomes a loud
 * build failure instead of a silently missing pin (or, in the case of the
 * `tier` column, a script-injection vector — the original map interpolated
 * `tier` straight into a class attribute without escaping).
 */

import { z } from 'zod';
import { TIERS, MEMBER_KINDS } from '../src/types.js';

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

/** Case- and whitespace-insensitive match against a fixed set of options. */
const enumLoose = <T extends readonly [string, ...string[]]>(options: T, column: string) =>
  trimmed.transform((v, ctx) => {
    const hit = options.find((o) => o.toLowerCase() === v.toLowerCase());
    if (!hit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${column} "${v}" is not one of: ${options.join(', ')}`,
      });
      return z.NEVER;
    }
    return hit as T[number];
  });

export const RawRowSchema = z
  .object({
    name: trimmed.min(1, 'name is required'),
    tier: enumLoose(TIERS, 'tier'),
    // The Sheet leaves `type` blank more often than not; `place` is the sane default.
    type: trimmed.default('place').transform((v) => (v === '' ? 'place' : v)),
    city: blankToNull,
    state: blankToNull,
    lat: coordinate(-90, 90, 'lat'),
    lng: coordinate(-180, 180, 'lng'),
    description: blankToNull,
    url: webUrl,
    // Editorial workflow columns. Read by humans, ignored by the renderer,
    // but accepted here so their presence doesn't fail validation.
    status: blankToNull.optional(),
    notes: blankToNull.optional(),
  })
  .transform((row, ctx) => {
    const kind = MEMBER_KINDS.find((k) => k === row.type.toLowerCase());
    if (!kind) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `type "${row.type}" is not one of: ${MEMBER_KINDS.join(', ')}`,
      });
      return z.NEVER;
    }
    // A half-filled coordinate pair is a data-entry mistake, not a location.
    if ((row.lat === null) !== (row.lng === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `row has ${row.lat === null ? 'lng but no lat' : 'lat but no lng'}`,
      });
      return z.NEVER;
    }
    return { ...row, kind };
  });

export type RawRow = z.infer<typeof RawRowSchema>;

export const REQUIRED_COLUMNS = [
  'name',
  'tier',
  'type',
  'city',
  'state',
  'lat',
  'lng',
  'description',
  'url',
] as const;
