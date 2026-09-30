/**
 * Pull the member roster from the published Google Sheet, validate it, fill in
 * missing coordinates via geocoding, and write `data/members.json`.
 *
 * Run it with `npm run sync`. The generated JSON is committed, so the site
 * builds and deploys with zero runtime dependency on Google — if the Sheet is
 * deleted, renamed, or unpublished, the live map keeps working and the *build*
 * is what breaks, loudly, in front of a developer.
 *
 * Usage:
 *   npm run sync                 pull from the Sheet (or local CSV), geocode, write
 *   npm run sync:check           validate only; exit non-zero on error. For CI.
 *   npm run sync -- --offline    skip network geocoding; use the cache only
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Papa from 'papaparse';

import { RawRowSchema, REQUIRED_COLUMNS, type RawRow } from './schema.js';
import { createGeocoder, distanceKm } from './geocode.js';
import type { Dataset, Member } from '../src/types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = join(ROOT, 'data', 'members.csv');
const JSON_PATH = join(ROOT, 'data', 'members.json');
const CACHE_PATH = join(ROOT, 'data', 'geocode-cache.json');

/**
 * Published Google Sheet CSV URL.
 * File > Share > Publish to web > pick the sheet > Comma-separated values.
 */
const SHEET_CSV_URL = process.env.SHEET_CSV_URL ?? '';

/** Hand-entered coordinates further than this from the city are probably wrong. */
const COORD_MISMATCH_THRESHOLD_KM = 60;

const argv = new Set(process.argv.slice(2));
const CHECK_ONLY = argv.has('--check');
const OFFLINE = argv.has('--offline');

interface Report {
  errors: string[];
  warnings: string[];
  notices: string[];
}

async function main(): Promise<void> {
  const report: Report = { errors: [], warnings: [], notices: [] };

  const { csv, source } = await loadCsv();
  const rows = parseCsv(csv, report);
  if (report.errors.length > 0) return finish(report);

  const members = await buildMembers(rows, report);
  if (report.errors.length > 0) return finish(report);

  auditMembers(members, report);

  if (!CHECK_ONLY) {
    const dataset: Dataset = {
      generatedAt: new Date().toISOString(),
      source,
      members,
    };
    await writeFile(JSON_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
    // Keep a CSV snapshot in git so roster changes show up as a readable diff.
    if (source === 'google-sheet') {
      await writeFile(CSV_PATH, csv.trim() + '\n', 'utf8');
    }
    report.notices.push(`Wrote ${members.length} members to data/members.json`);
  }

  finish(report);
}

async function loadCsv(): Promise<{ csv: string; source: Dataset['source'] }> {
  if (SHEET_CSV_URL) {
    process.stderr.write('Fetching published Google Sheet…\n');
    const res = await fetch(SHEET_CSV_URL, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(
        `Sheet fetch failed: ${res.status} ${res.statusText}. ` +
          `Check that SHEET_CSV_URL still points at a published sheet.`,
      );
    }
    const csv = await res.text();
    // A revoked "publish to web" link returns an HTML error page with HTTP 200.
    if (csv.trimStart().startsWith('<')) {
      throw new Error(
        'Sheet URL returned HTML rather than CSV — the publish-to-web link has ' +
          'probably been revoked. Re-publish the sheet and update SHEET_CSV_URL.',
      );
    }
    return { csv, source: 'google-sheet' };
  }

  process.stderr.write('SHEET_CSV_URL not set — using local data/members.csv\n');
  return { csv: await readFile(CSV_PATH, 'utf8'), source: 'local-csv' };
}

function parseCsv(csv: string, report: Report): RawRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv.trim(), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  for (const err of parsed.errors) {
    report.errors.push(`CSV parse error on row ${(err.row ?? 0) + 2}: ${err.message}`);
  }

  const headers = parsed.meta.fields ?? [];
  for (const column of REQUIRED_COLUMNS) {
    if (!headers.includes(column)) {
      report.errors.push(`Sheet is missing the required "${column}" column.`);
    }
  }
  if (report.errors.length > 0) return [];

  const rows: RawRow[] = [];
  parsed.data.forEach((raw, index) => {
    // Spreadsheet line number: +1 for the header, +1 for 1-based rows.
    const line = index + 2;

    // Fully blank lines are a normal artifact of spreadsheet editing.
    if (Object.values(raw).every((v) => (v ?? '').trim() === '')) return;

    const result = RawRowSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || 'row';
        report.errors.push(`Row ${line} (${raw['outlet name'] || 'unnamed'}): ${field} — ${issue.message}`);
      }
      return;
    }
    rows.push(result.data);
  });

  return rows;
}

async function buildMembers(rows: RawRow[], report: Report): Promise<Member[]> {
  const geocoder = await createGeocoder(CACHE_PATH, { offline: OFFLINE });
  const members: Member[] = [];
  const usedIds = new Map<string, number>();

  for (const row of rows) {
    let coords: Member['coords'] = null;
    let coordSource: Member['coordSource'] = null;

    if (row.lat !== null && row.lng !== null) {
      coords = { lat: row.lat, lng: row.lng };
      coordSource = 'sheet';

      // Cross-check hand-entered coordinates against the stated city. This is
      // report-only: we never silently move a pin someone deliberately placed.
      if (row.city) {
        const hit = await geocoder.lookup(row.city, row.state);
        if (hit) {
          const drift = distanceKm(coords, hit);
          if (drift > COORD_MISMATCH_THRESHOLD_KM) {
            report.warnings.push(
              `${row.name}: coordinates are ${Math.round(drift)} km from ` +
                `"${[row.city, row.state].filter(Boolean).join(', ')}" ` +
                `(geocoder says ${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)}). Verify the lat/lng.`,
            );
          }
        }
      }
    } else if (row.kind === 'place' && row.city) {
      // Missing coordinates but a usable city — this is what the geocoder is for.
      const hit = await geocoder.lookup(row.city, row.state);
      if (hit) {
        coords = { lat: hit.lat, lng: hit.lng };
        coordSource = 'geocoded';
        report.notices.push(
          `${row.name}: geocoded "${[row.city, row.state].filter(Boolean).join(', ')}" ` +
            `-> ${hit.lat.toFixed(4)}, ${hit.lng.toFixed(4)} (${hit.displayName})`,
        );
      } else {
        report.warnings.push(
          `${row.name}: could not geocode "${[row.city, row.state].filter(Boolean).join(', ')}". ` +
            `Add lat/lng manually.`,
        );
      }
    } else if (row.kind === 'place' && row.state && !row.city) {
      // Deliberately not geocoded — see the policy note in geocode.ts.
      report.warnings.push(
        `${row.name}: has state "${row.state}" but no city, so it cannot be placed ` +
          `precisely. Add a city to the Sheet and it will be mapped automatically.`,
      );
    }

    members.push({
      id: uniqueId(slugify(row.name), usedIds),
      name: row.name,
      kind: row.kind,
      coverage: row.coverage,
      city: row.city,
      state: row.state,
      coords,
      coordSource,
      url: row.url,
    });
  }

  await geocoder.save();
  const { requests, cached } = geocoder.stats;
  report.notices.push(`Geocoder: ${requests} network request(s), ${cached} served from cache.`);

  return members;
}

/** Non-fatal data-quality checks surfaced to whoever maintains the Sheet. */
function auditMembers(members: Member[], report: Report): void {
  const byName = new Map<string, number>();
  const byCoord = new Map<string, string[]>();

  for (const m of members) {
    const nameKey = m.name.toLowerCase();
    byName.set(nameKey, (byName.get(nameKey) ?? 0) + 1);

    if (m.coords) {
      const key = `${m.coords.lat.toFixed(5)},${m.coords.lng.toFixed(5)}`;
      byCoord.set(key, [...(byCoord.get(key) ?? []), m.name]);
    }
    if (!m.url) {
      report.warnings.push(`${m.name}: no url — it will render as plain text, not a link.`);
    }
  }

  for (const [name, count] of byName) {
    if (count > 1) report.errors.push(`Duplicate member name "${name}" appears ${count} times.`);
  }
  for (const [coord, names] of byCoord) {
    if (names.length > 1) {
      report.notices.push(
        `Identical coordinates (${coord}) shared by: ${names.join(', ')}. ` +
          `They will be spiderfied on the map rather than hidden.`,
      );
    }
  }

  const unplaced = members.filter((m) => m.kind === 'place' && !m.coords);
  const mapped = members.filter((m) => m.coords);
  const beat = members.filter((m) => m.kind === 'beat');
  report.notices.push(
    `${members.length} members: ${mapped.length} mapped, ${beat.length} beat-based, ` +
      `${unplaced.length} awaiting a location.`,
  );
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFKD')
      // Strip combining marks so "Kaheāwai" and "BoriMás" produce clean slugs.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'member'
  );
}

function uniqueId(base: string, used: Map<string, number>): string {
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

function finish(report: Report): void {
  for (const n of report.notices) process.stderr.write(`  note     ${n}\n`);
  for (const w of report.warnings) process.stderr.write(`  WARNING  ${w}\n`);
  for (const e of report.errors) process.stderr.write(`  ERROR    ${e}\n`);

  process.stderr.write(
    `\n${report.errors.length} error(s), ${report.warnings.length} warning(s).\n`,
  );

  if (report.errors.length > 0) {
    process.stderr.write('Sync aborted — data/members.json was not modified.\n');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`\nSync failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
