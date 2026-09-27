# Tiny News Collective member map

An embeddable artifact showing the reach of the TNC network: a stated claim, a
map as evidence for it, and the full roster of every member newsroom, grouped
by state and searchable.

The roster is maintained in a Google Sheet; a sync script validates it, fills in
missing coordinates, and writes a static JSON file that ships with the build.
The live page has **no runtime dependency on Google** — if the Sheet is
unpublished or renamed, the map keeps working and the *build* is what breaks,
loudly, in front of a developer.

Product truth lives in [PRODUCT.md](PRODUCT.md). Read it before changing what
the surface argues.

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Typecheck, then build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run sync` | Pull the Sheet, validate, geocode, rewrite `data/members.json` |
| `npm run sync:check` | Validate only. Exits non-zero on error — use in CI |
| `npm run typecheck` | `tsc --noEmit` |

---

## How the surface is composed

Three bands of declining scale and equal standing, inside a 900px column:

1. **The claim.** `103 members served. 29 states and territories.` at display
   scale. It never changes in response to search — it is the standing argument,
   not a readout.
2. **The evidence.** Every mapped member as one dot. No clustering.
3. **The substance.** All 103 members grouped by state, each a link, with a
   search field over names, descriptions, cities and states.

**The map is explorable, but it is not how you find a newsroom.** Search and
the roster do that. Navigation is therefore bounded rather than open — you can
move around inside the network, but you cannot lose it:

- Pan and zoom are clamped to the roster's own extent, and zooming out past the
  opening frame is disabled.
- A **Reset view** control appears once the view has moved, and only then.
- Wheel zoom is off until the map is clicked. In an iframe, hijacking the wheel
  means the host page stops scrolling under the cursor.
- One-finger drag is off on touch, so a phone reader is never trapped in the
  figure. Pinch still zooms and pans.
- Dots are not tab stops. The map is one labelled, focusable element with
  arrow-key panning; the roster carries every member for keyboard and
  screen-reader users. It cannot be `aria-hidden` while focusable, so it is
  labelled instead.

### Why "members served"

The total includes 14 Alumni. TNC served all 103, so "members served" is the
phrasing that keeps the headline figure honest rather than inflated. This is
binding — see PRODUCT.md.

---

## Updating the member list

**Day to day, edit the Google Sheet.** Then a developer runs:

```bash
npm run sync
git commit -am "Update member roster"
git push          # deploy is automatic
```

`sync` prints a report before writing anything, and errors abort it without
touching `data/members.json`, so a typo in a spreadsheet can never take the live
map down.

### Sheet columns

| Column | Required | Notes |
| --- | --- | --- |
| `name` | ✅ | Must be unique. Duplicates are an error |
| `tier` | ✅ | `Publisher`, `Community`, or `Alumni`. Case-insensitive |
| `type` | | `place` (default) or `beat` |
| `city` | | Fill this in and coordinates are looked up automatically |
| `state` | | Two-letter code. **Also what the roster groups by** |
| `lat` / `lng` | | Optional. Overrides geocoding when present |
| `description` | | One line. This is the most valuable column — see below |
| `url` | | Must be `http(s)`. Anything else is rejected |
| `status`, `notes` | | For humans. Ignored by the code |

**You almost never need to fill in `lat`/`lng` by hand.** Type a city and state;
the sync script geocodes it and caches the result. Coordinates you *do* enter
are never overwritten — they are cross-checked against the city and you get a
warning if they disagree by more than 60 km.

**`description` is the column that does the persuading.** "News and information
for Philadelphia's Afghan community" is the kind of detail no other organisation
could truthfully claim about its network. It appears in the roster next to every
name and is fully searchable. A member with no description still renders
correctly — it just contributes nothing to the argument.

**`state` matters even without coordinates.** Witness PA and Community Voices
have a state but no city, so they cannot be mapped — but they still appear under
Pennsylvania and Virginia in the roster. Filling in `state` is worth doing even
when you don't know the city.

### Members with no location

Nothing is dropped. Members without a state fall into two groups at the end of
the roster:

- **National & beat-based** — `type=beat`. These have no location by definition;
  it is a fact about their journalism, not missing data.
- **Location to be confirmed** — place-based newsrooms whose location TNC has
  not recorded yet.

State-only rows are deliberately **not** geocoded. A state centroid renders as a
confident pin in the middle of Pennsylvania, which is worse than no pin: it
looks like an answer.

---

## Deploying

Production runs on Railway (`tnc-map` service), which builds on every push to
`main`. Railpack detects Vite, runs `npm run build`, and serves `dist` with
Caddy using the repo-root `Caddyfile`. That file also carries the response
headers; `public/_headers` holds the same rules for Netlify or Cloudflare Pages
— keep the two in step.

```
Build command:      npm run build
Publish directory:  dist
Node version:       22
```

### Basemap tiles

The basemap is a self-hosted [Protomaps](https://protomaps.com) archive, not a
tile service: one file, `world.pmtiles` (~550 MB, the whole world to zoom 8),
on a Railway volume mounted at `/tiles`. Caddy serves it at
`/tiles/world.pmtiles`. It is not in the repo, and `npm run dev` proxies
`/tiles` to production so local development needs no copy.

To create or refresh it (rarely: OpenStreetMap changes don't matter at this
zoom), with the [pmtiles CLI](https://docs.protomaps.com/pmtiles/cli):

```sh
# Pick a date from https://maps.protomaps.com/builds
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles world.pmtiles \
  --bbox=-180,-60,180,85 --maxzoom=8
railway ssh -s tnc-map -- 'cat > /tiles/world.pmtiles.tmp && mv /tiles/world.pmtiles.tmp /tiles/world.pmtiles' < world.pmtiles
```

If the map shows only dots on a blank panel, this file is missing.

---

## Embedding in Ghost

Ghost cannot host this app — it has no way to serve a static bundle. Host the
build elsewhere and embed it in an iframe.

### 1. Allow Ghost to frame the map

In `Caddyfile` (and `public/_headers`), set `frame-ancestors` to the Ghost
site's domain:

```
/*
  Content-Security-Policy: frame-ancestors 'self' https://tinynewsco.org https://*.tinynewsco.org
```

**This is the step that gets missed.** Skip it and some hosts default to
`X-Frame-Options: SAMEORIGIN`, which renders the embed as a blank box with
nothing but a console error to explain why.

### 2. Paste into a Ghost HTML card

Type `/html` in the Ghost editor, then paste:

```html
<style>
  .tnc-map-embed {
    display: block;
    width: 100%;
    height: 1000px;
    border: 1px solid #d5ccbd;
    border-radius: 10px;
    background: #ede7dd;
  }
  @media (max-width: 760px) {
    .tnc-map-embed { height: 880px; }
  }
</style>

<iframe
  class="tnc-map-embed"
  src="https://YOUR-MAP-HOST/?embed=1"
  title="Map of Tiny News Collective member newsrooms"
  loading="lazy"
></iframe>
```

Replace `YOUR-MAP-HOST` with the deployed URL. It must be **https**.

The surface is authored for a **900px content well**, which is what the TNC
theme gives a post. It caps itself at that width and centres, so the standalone
page and the embed are the same composition. If your theme's well is a different
width, change `--well` in `src/styles.css` to match.

### Query parameters

| Parameter | Effect |
| --- | --- |
| `embed=1` | Tightens the chrome for a host page that supplies its own surrounding heading |
| `embed=0` | Forces the standalone layout even inside a frame |
| `autoheight=1` | Grows to fit content and posts height to the parent |
| `mapheight=340` | Overrides the evidence band's height in pixels |

### Optional: auto-height

The fixed-height embed above is the recommended default. If you would rather the
full roster ran to its natural length than scrolled inside the frame, add
`&autoheight=1` and add this to the same HTML card (or **Settings → Code
injection → Site footer**):

```html
<script>
  const MAP_ORIGIN = 'https://YOUR-MAP-HOST';
  const frame = document.querySelector('.tnc-map-embed');

  window.addEventListener('message', (event) => {
    if (event.origin !== MAP_ORIGIN) return;
    if (event.source !== frame.contentWindow) return;
    if (!event.data || event.data.type !== 'tnc-map:height') return;

    const height = Number(event.data.height);
    if (!Number.isFinite(height) || height < 200 || height > 8000) return;
    frame.style.height = height + 'px';
  });
</script>
```

Both origin *and* source are checked; either alone is weaker than it looks on a
page that may host other embeds. Note that auto-height makes the embed very
tall — 103 members is a long list.

### Testing before you publish

`dist/embed-test.html` is a mock Ghost post at the real 900px well, containing
both embed modes:

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
  main.ts              Wiring, claim copy, search handling
  map.ts               The evidence figure — non-interactive, aria-hidden
  bounds.ts            Which pins the opening frame includes
  roster.ts            The state-grouped member list
  search.ts            Matching logic over name, description, city, state
  states.ts            Two-letter code -> display name
  dataset.ts           Dataset access and derived views
  dom.ts               Node-building helpers (no innerHTML)
  embed.ts             Iframe detection and height reporting
  types.ts             Shared types
reference/
  original-vibecoded-map.html    The single-file original, kept for reference
```

---

## Notable behaviour, and why

**Nothing loads from a CDN.** Leaflet and both typefaces are bundled from npm.
The original pulled four CDN scripts with no integrity hashes.

**No `innerHTML`.** All rendering builds DOM nodes with `textContent`. The
original interpolated `tier` directly into a `class` attribute in two places, so
a wrong value in a spreadsheet column could execute script.

**Separators are real text nodes, not `::before`.** Generated content is not
reliably exposed to assistive technology, so a CSS em dash between a member's
name and description left screen readers announcing "Hola CulturaLatino arts and
culture" — the same weld the visual fix removed, surviving where it could not be
seen.

**No negative inline margins inside the roster.** `overflow-y: auto` promotes
the other axis from `visible` to `auto`, so anything bleeding past its grid
track becomes a horizontal scrollbar on the list.

**No clustering.** 69 members render as 69 dots, overlapping where the network
is dense, because overlap reads as density and density is the argument.
Clustering previously collapsed them into 26 marks on desktop and 10 on a phone.

**The opening frame excludes statistical outliers** (`src/bounds.ts`), not a
hardcoded US bounding box, which would break on the next international member.

**Motion is absent by design.** The brief pins this surface as static; there are
no transitions anywhere.
