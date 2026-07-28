# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: funders and philanthropic partners.** They encounter the map while
evaluating Tiny News Collective as an organization — not while looking for a
specific newsroom. They arrive through a page on TNC's own site, usually
alongside other material about the collective. When their needs conflict with
another audience's, they win.

**Secondary, confirmed but not prioritized:** prospective member newsrooms
weighing whether to join; existing members; press and public.

**Operator: a non-technical TNC staffer.** They maintain the roster and will
never open a code editor. Every roster change has to be possible from a
spreadsheet.

## Product Purpose

Show that the TNC network is larger, more geographically spread, and more
varied than a visitor assumes.

Success is a funder coming away with a credible impression of reach. The map is
**not** a directory, **not** a discovery tool for readers, and **not** primarily
a traffic driver to member sites — those are welcome side effects, not the job.

## Positioning

The defensible claim is the *composition* of the roster, not its size. A
neighboring organization could copy a member count; it could not truthfully copy
this list.

The network is made of very small outlets serving specific communities —
Filipino diaspora, Philadelphia's Afghan community, Native Hawaiian readers,
Alabama's Black Belt, Puerto Rico, Spanish-language outlets in Sacramento and
South Carolina, a worker-owned tabletop-games newsroom. "Tiny" is the point:
many small, precisely-aimed newsrooms rather than a few large ones.

Beat-based members (defined by what they cover rather than where) are part of
this claim, not an exception to it.

## Operating Context

- The map is **embedded in an iframe inside a Ghost site**. It is not a
  standalone destination and does not own the page it appears on.
- Ghost cannot host the application itself; the build is deployed to a separate
  static host and framed in.
- Funders view it as one artifact among several while evaluating TNC.
- The roster is maintained in a Google Sheet by a non-technical staffer.
- Roster updates should reach production without a developer in the loop:
  scheduled sync, validate, deploy. Decided, not yet implemented.

## Capabilities and Constraints

**Confirmed functionality**

- 103 members across three tiers: Publisher (65), Community (24), Alumni (14).
- Two member kinds: `place` (serves a geographic area) and `beat` (defined by
  subject matter and intentionally has no location).
- 69 members appear as map pins; 34 appear in a list beside the map — 13
  beat-based, 21 whose location is not yet confirmed.
- Filtering by tier.
- Coordinates are resolved from city/state at build time, not by hand.

**Technical constraints**

- Must render correctly inside an iframe on a Ghost site: requires a
  `frame-ancestors` policy naming the Ghost origin, and https on both sides.
- No runtime dependency on Google. Roster data is validated and baked into the
  build; the live map must survive the Sheet being unpublished or renamed.
- Static hosting only. No backend, no database, no server-side rendering.
- The map must not trap page scroll or duplicate the host page's heading.

**Terminology (binding)**

- "member", never "customer", "client", or "partner newsroom".
- Tiers are named Publisher, Community, and Alumni.
- "beat-based" describes members defined by what they cover rather than where.
- **"members served"** is the phrase for any figure that includes Alumni. It is
  what makes a total of 103 honest rather than inflated: TNC served all 103,
  including the 14 who have since moved on. Use it wherever the headline count
  spans every tier.

**Explicitly undecided**

- Whether Alumni are visually distinguished at all. The *counting* question is
  settled by "members served" above, so tier may now vanish from the visual
  without making the headline figure dishonest. Currently visible and filterable.
- Whether the 21 members without confirmed locations will get cities added, or
  remain listed off-map indefinitely.
- Whether the map should offer any path toward joining TNC. It currently does
  not.
- The production hostname for the map, and which Ghost page embeds it.

## Brand Commitments

- Name: **Tiny News Collective** (TNC). Existing site: `tinynewsco.org`.
- Typography, specified by the user as binding: **Libre Baskerville** for
  headings, **Work Sans** for body and UI.
- Palette, specified by the user as binding: navy `rgb(27, 29, 67)`, gold
  `rgb(243, 196, 98)`, sand `rgb(237, 231, 221)`.
- Because the map is embedded, the host page supplies the page-level heading and
  the embed suppresses its own.

Observed, not confirmed as a rule: the roster's own descriptions are plain and
unadorned ("Community news for Petaluma"), with no marketing register. Worth
matching until someone says otherwise.

## Evidence on Hand

**Real material available**

- `data/members.csv` and `data/members.json` — 103 genuine member newsrooms with
  names, tiers, cities, states, one-line descriptions, and live URLs. This is
  real data supplied by TNC, not placeholder content.
- 69 verified coordinate pairs, each cross-checked against its stated city and
  within 60 km of it.
- `reference/original-vibecoded-map.html` — the original single-file map, kept
  as the roster's provenance and as an anti-reference.

**Real gaps. Future work must not fill these with invented values.**

- 21 members have no confirmed location; 19 of those have neither city nor
  state.
- 10 members have no URL.
- There is **no** data on: funder names, audience or traffic figures, impact
  metrics, revenue or grant amounts, founding dates, membership growth over
  time, or testimonials from members or funders. None of this exists in the
  repository and none of it may be fabricated to strengthen the reach argument.

## Product Principles

1. **Reach is the argument.** Every decision answers "does a funder come away
   understanding how far this network extends?" Aggregate legibility beats
   individual browsability.

2. **No member disappears.** The roster's composition is the evidence. A member
   without coordinates still proves reach; dropping it understates the network
   and misrepresents TNC. This is why unplaced members are listed rather than
   filtered out.

3. **The spreadsheet is the interface.** The people who know the roster are not
   developers. Anything that requires code to update will go stale.

4. **Data honesty over visual convenience.** Never invent a location, a link, or
   a count to make the map look fuller. Gaps are shown as gaps.

5. **It is a guest on someone else's page.** The map lives inside a Ghost post.
   It must not fight the host layout, hijack scrolling, or duplicate its
   heading.

## Accessibility & Inclusion

No formal standard has been set for this project. Two product-specific facts are
confirmed and binding:

- Member names contain characters outside basic Latin — Kaheāwai Media, BoriMás,
  Juri•See. Typography and font subsetting must render them correctly rather
  than falling back mid-word.
- Tier must not be encoded by color alone. It is currently also carried by pin
  fill versus outline and by a text badge.

The network centers communities that are underserved by mainstream media,
including multilingual and Spanish-language outlets. Excluding people from the
artifact that represents them would undercut the argument it exists to make.
