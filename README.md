# Tiny News Collective member map

An embeddable map of TNC member newsrooms. The roster is maintained in a Google
Sheet; a sync script validates it, fills in missing coordinates, and writes a
static JSON file that ships with the build.

The live page has **no runtime dependency on Google**. If the Sheet is
unpublished, renamed, or rate-limited, the map keeps working — the *build* is
what breaks, loudly, in front of a developer.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run sync` | Pull the Sheet, validate, geocode, rewrite `data/members.json` |
| `npm run sync:check` | Validate only. Exits non-zero on error — use in CI |
| `npm run typecheck` | `tsc --noEmit` |

---

## Updating the member list

**Day to day, edit the Google Sheet.** Nothing else. Then a developer runs:

```bash
npm run sync
git commit -am "Update member roster"
git push          # deploy is automatic
```

`sync` prints a report before writing anything:

```
note     103 members: 69 mapped, 13 beat-based, 21 awaiting a location.
WARNING  Witness PA: has state "PA" but no city, so it cannot be placed
         precisely. Add a city to the Sheet and it will be mapped automatically.
ERROR    Row 47 (Example News): tier "Publsher" is not one of: Publisher, Community, Alumni
```

Errors abort the sync and leave `data/members.json` untouched, so a typo in a
spreadsheet can never take the live map down. Warnings are advisory.

### Sheet columns

| Column | Required | Notes |
| --- | --- | --- |
| `name` | ✅ | Must be unique. Duplicates are an error |
| `tier` | ✅ | `Publisher`, `Community`, or `Alumni`. Case-insensitive |
| `type` | | `place` (default) or `beat` |
| `city` | | Fill this in and coordinates are looked up automatically |
| `state` | | Two-letter code |
| `lat` / `lng` | | Optional. Overrides geocoding when present |
| `description` | | One line, shown in the popup and the sidebar |
| `url` | | Must be `http(s)`. Anything else is rejected |
| `status`, `notes` | | For humans. Ignored by the code |

**You almost never need to fill in `lat`/`lng` by hand.** Type a city and state;
the sync script geocodes it and caches the result. Coordinates you *do* enter
are never overwritten — they are cross-checked against the city, and you get a
warning if they disagree by more than 60 km.

### Members with no location

A `place` row with no coordinates is **not dropped**. It appears in the sidebar
under "Not yet on the map", with whatever partial location is known. There are
currently 21 of these, and only two of them (`Witness PA`, `Community Voices`)
have any location hint at all — a state with no city.

State-only rows are deliberately **not** geocoded. A state centroid renders as a
confident pin in the middle of Pennsylvania, which is worse than no pin: it
looks like an answer. Add a city and it maps itself.

---

## Deploying

The build is a static directory. Any static host works; `netlify.toml` is
included for Netlify, and `public/_headers` is read by both Netlify and
Cloudflare Pages.

```
Build command:      npm run build
Publish directory:  dist
Node version:       22
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the deploy
rather than shipping a broken map.

---

## Embedding in Ghost

Ghost cannot host this app itself — it has no way to serve a static bundle. Host
the build somewhere (Netlify, Cloudflare Pages, GitHub Pages) and embed it in an
iframe.

### 1. Allow Ghost to frame the map

Open `public/_headers` and set `frame-ancestors` to the Ghost site's domain:

```
/*
  Content-Security-Policy: frame-ancestors 'self' https://tinynewsco.org https://*.tinynewsco.org
```

**This is the step that gets missed.** Skip it and some hosts default to
`X-Frame-Options: SAMEORIGIN`, which renders the embed as a blank box with
nothing but a console error to explain why.

### 2. Paste into a Ghost HTML card

In the Ghost editor, type `/html` to insert an HTML card, then paste:

```html
<style>
  .tnc-map-embed {
    display: block;
    width: 100%;
    height: 720px;
    border: 1px solid #d5ccbd;
    border-radius: 10px;
    background: #ede7dd;
  }
  @media (max-width: 760px) {
    .tnc-map-embed { height: 640px; }
  }
</style>

<iframe
  class="tnc-map-embed"
  src="https://YOUR-MAP-HOST/?embed=1"
  title="Map of Tiny News Collective member newsrooms"
  loading="lazy"
></iframe>
```

Replace `YOUR-MAP-HOST` with the deployed URL. It must be **https** — a Ghost
site on https will refuse to load an http iframe.

`?embed=1` hides the map's own `<h1>`, on the assumption the Ghost post supplies
the heading. Drop it if you want the map's title shown too.

### 3. Optional: make it wider than the post column

Most Ghost themes constrain post content to roughly 720px. If your theme
supports Koenig's width classes, wrap the iframe:

```html
<div class="kg-width-wide"> … </div>   <!-- or kg-width-full -->
```

This is theme-dependent — check how it looks before publishing.

### Optional: auto-height

The fixed-height embed above is the recommended default: predictable, and it
cannot be broken by a script that fails to load. If you would rather the sidebar
list ran to full length instead of scrolling inside the frame, use auto-height.

Add `&autoheight=1` to the iframe `src`, then add this script to the same HTML
card (or to **Settings → Code injection → Site footer**):

```html
<script>
  const MAP_ORIGIN = 'https://YOUR-MAP-HOST';
  const frame = document.querySelector('.tnc-map-embed');

  window.addEventListener('message', (event) => {
    if (event.origin !== MAP_ORIGIN) return;
    if (event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'tnc-map:height') return;

    const height = Number(event.data.height);
    if (!Number.isFinite(height) || height < 200 || height > 5000) return;
    frame.style.height = height + 'px';
  });
</script>
```

Both origin *and* source are checked. Either alone is weaker than it looks on a
page that may host other embeds.

Supported query parameters:

| Parameter | Effect |
| --- | --- |
| `embed=1` | Hide the page heading, tighten the chrome |
| `embed=0` | Force the full standalone layout even inside a frame |
| `autoheight=1` | Grow to fit content and post height to the parent |
| `height=520` | Map height in pixels, auto-height mode only |

### Testing before you publish

`dist/embed-test.html` is a mock Ghost post containing both embed modes:

```bash
npm run build && npm run preview
# open http://localhost:4173/embed-test.html
```

---

## Project structure

```
data/
  members.csv          Snapshot of the Sheet, committed for readable diffs
  members.json         Generated. The only data the site reads
  geocode-cache.json   Committed, so builds cost ~0 geocoding requests
scripts/
  sync.ts              Sheet -> validate -> geocode -> members.json
  schema.ts            Zod schema. Build-time only, never shipped
  geocode.ts           Cached, rate-limited Nominatim client
src/
  main.ts              Wiring, filters, summary line
  map.ts               Leaflet, markers, clustering, popups
  bounds.ts            Initial-view framing
  sidebar.ts           Off-map member list
  dataset.ts           Dataset access and derived views
  dom.ts               Node-building helpers (no innerHTML)
  embed.ts             Iframe detection and height reporting
  types.ts             Shared types
reference/
  original-vibecoded-map.html    The single-file original, kept for reference
```

---

## Notable behaviour, and why

**Nothing is loaded from a CDN.** Leaflet, MarkerCluster, and both typefaces are
installed from npm and bundled. The original pulled four separate CDN scripts
with no integrity hashes; any of them going down took the map with it.

**No `innerHTML`.** All rendering builds real DOM nodes with `textContent`. The
original escaped most values but interpolated `tier` directly into a `class`
attribute in two places, so a wrong value in a spreadsheet column could execute
script. Node construction makes that unrepresentable rather than merely
remembered.

**The opening view frames the contiguous states.** Fitting all pins put one
member in New Delhi and shrank the other 68 into an unreadable knot — that was
the original's default view on every load. Outliers are now excluded from the
opening camera by an interquartile fence (`src/bounds.ts`), *not* a hardcoded US
bounding box, which would break the next international member. Excluded pins
stay on the map, and the **"Show all"** control reports how many sit outside the
current view.

**Every figure in the summary line comes from the same filtered set.** The
original mixed scopes mid-sentence — tier counts from the full roster, the
states count from the filtered pins — so toggling a tier produced a sentence
that contradicted itself.

**Scroll-wheel zoom is off until you click the map.** Inside an iframe this is
the difference between a page that scrolls and one that traps the reader.

**Members sharing exact coordinates fan out on click.** 505omatic and UpLift
Chronicles are both on Albuquerque's centroid; previously one was permanently
hidden under the other.
