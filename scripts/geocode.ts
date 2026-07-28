/**
 * Disk-cached geocoding via OpenStreetMap Nominatim.
 *
 * Policy notes, because these are judgement calls and not obvious from the code:
 *
 * 1. A city is REQUIRED. Geocoding a state on its own returns that state's
 *    centroid, which renders as a confident pin in a place the newsroom is not.
 *    State-only rows stay unplaced and get reported as "needs a city" so the
 *    fix happens in the Sheet, where it belongs.
 *
 * 2. Results are cached to disk and committed. Nominatim asks for <=1 request
 *    per second and is run by volunteers; a build should cost ~0 requests once
 *    warm, and only pay for genuinely new rows.
 *
 * 3. Misses are cached too, otherwise every build re-queries the same dead
 *    strings forever.
 */

import { readFile, writeFile } from 'node:fs/promises';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

/** Nominatim's usage policy asks for an identifying UA with contact info. */
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ??
  'tnc-member-map/1.0 (Tiny News Collective; https://www.tinynewsco.org/)';

/** Nominatim's published limit is 1 req/s. Sit comfortably under it. */
const MIN_REQUEST_INTERVAL_MS = 1_200;

export interface GeocodeHit {
  lat: number;
  lng: number;
  /** Nominatim's canonical name for the match — useful for eyeballing bad hits. */
  displayName: string;
}

type CacheEntry = (GeocodeHit & { found: true }) | { found: false };

interface CacheFile {
  /** Bumped when query construction changes in a way that invalidates results. */
  version: number;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = 1;

export interface GeocoderStats {
  hits: number;
  misses: number;
  cached: number;
  requests: number;
}

export interface Geocoder {
  /** Returns null when the place could not be resolved. */
  lookup(city: string, state: string | null): Promise<GeocodeHit | null>;
  save(): Promise<void>;
  readonly stats: GeocoderStats;
}

export async function createGeocoder(
  cachePath: string,
  options: { offline?: boolean } = {},
): Promise<Geocoder> {
  const cache = await loadCache(cachePath);
  let dirty = false;
  let lastRequestAt = 0;

  const stats: GeocoderStats = { hits: 0, misses: 0, cached: 0, requests: 0 };

  async function lookup(city: string, state: string | null): Promise<GeocodeHit | null> {
    const query = [city, state].filter(Boolean).join(', ');
    const key = query.toLowerCase();

    const cachedEntry = cache.entries[key];
    if (cachedEntry) {
      stats.cached += 1;
      return cachedEntry.found ? cachedEntry : null;
    }

    // `--offline` keeps `sync` usable on a plane or in CI without network egress.
    if (options.offline) {
      stats.misses += 1;
      return null;
    }

    await throttle();
    const hit = await request(query);
    cache.entries[key] = hit ? { ...hit, found: true } : { found: false };
    dirty = true;

    if (hit) stats.hits += 1;
    else stats.misses += 1;
    return hit;
  }

  async function throttle(): Promise<void> {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
    lastRequestAt = Date.now();
  }

  async function request(query: string): Promise<GeocodeHit | null> {
    const url = new URL(NOMINATIM);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    // No `countrycodes` filter: the roster already includes a non-US member
    // (eShe, New Delhi) and hard-coding the US would break the next one.

    stats.requests += 1;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      throw new Error(`Nominatim returned ${res.status} ${res.statusText} for "${query}"`);
    }

    const body = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;

    const first = body[0];
    if (!first) return null;

    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng, displayName: first.display_name };
  }

  async function save(): Promise<void> {
    if (!dirty) return;
    // Sort keys so the committed cache produces readable diffs.
    const sorted: Record<string, CacheEntry> = {};
    for (const key of Object.keys(cache.entries).sort()) {
      sorted[key] = cache.entries[key]!;
    }
    const out: CacheFile = { version: CACHE_VERSION, entries: sorted };
    await writeFile(cachePath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  }

  return { lookup, save, stats };
}

async function loadCache(path: string): Promise<CacheFile> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as CacheFile;
    if (parsed.version === CACHE_VERSION && parsed.entries) return parsed;
  } catch {
    // Missing or unreadable cache is not an error — start fresh.
  }
  return { version: CACHE_VERSION, entries: {} };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Great-circle distance in kilometres, for sanity-checking hand-entered coords. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
