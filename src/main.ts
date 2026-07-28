/*
 * TNC brand typefaces, self-hosted — no request to Google Fonts.
 *
 * Latin + Latin Extended, at only the weights the stylesheet uses.
 * `latin-ext` is not optional: "Kaheāwai Media" carries an ā (U+0101) that
 * lives outside the basic Latin subset and would otherwise fall back to a
 * system font mid-word. It is the single glyph in the roster that needs it.
 */
import '@fontsource/libre-baskerville/latin-700.css';
import '@fontsource/libre-baskerville/latin-ext-700.css';

import '@fontsource/work-sans/latin-400.css';
import '@fontsource/work-sans/latin-500.css';
import '@fontsource/work-sans/latin-ext-400.css';
import '@fontsource/work-sans/latin-ext-500.css';

import 'leaflet/dist/leaflet.css';
import './styles.css';

import { el, mustFind } from './dom.js';
import { countStates, generatedAt, mappedMembers, members } from './dataset.js';
import { buildIndex, search } from './search.js';
import { createRoster } from './roster.js';
import { createMap } from './map.js';
import { announceReady, applyEmbedConfig, readEmbedConfig, startHeightReporting } from './embed.js';

/** How long to wait before announcing a result count to screen readers. */
const ANNOUNCE_DELAY_MS = 450;

function main(): void {
  const config = readEmbedConfig();
  applyEmbedConfig(config);

  const searchInput = mustFind<HTMLInputElement>('#search');
  const countEl = mustFind('#count');
  const countLive = mustFind('#count-live');
  const emptyEl = mustFind('#roster-empty');
  const listEl = mustFind('#roster');

  writeClaim();
  writeCredit();

  const index = buildIndex(members);

  // One highlight state, driven from either side. Both controllers no-op when
  // the id is unchanged, so a dot lighting its row cannot bounce back.
  const setLit = (id: string | null): void => {
    roster.light(id);
    map.light(id);
  };

  const roster = createRoster(listEl, { onLight: setLit });
  const map = createMap(mustFind('#map'), members, { onLight: setLit });

  let announceTimer: number | undefined;

  function apply(query: string): void {
    const results = search(index, query);

    roster.render(results);
    map.reflect(new Set(results.map((m) => m.id)));

    const trimmed = query.trim();
    countEl.textContent = countLabel(results.length, trimmed);

    const isEmpty = results.length === 0;
    emptyEl.hidden = !isEmpty;
    listEl.hidden = isEmpty;
    if (isEmpty) writeEmptyState(emptyEl, trimmed, searchInput, apply);
    else emptyEl.replaceChildren();

    // The visible count updates on every keystroke; the announcement waits, so
    // a screen reader is not read a new total for every character typed.
    window.clearTimeout(announceTimer);
    announceTimer = window.setTimeout(() => {
      countLive.textContent = countLabel(results.length, trimmed);
    }, ANNOUNCE_DELAY_MS);
  }

  searchInput.addEventListener('input', () => apply(searchInput.value));
  // Escape clears, which is what the browser's own search-input affordance
  // implies and what people try first.
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && searchInput.value !== '') {
      event.preventDefault();
      searchInput.value = '';
      apply('');
    }
  });

  apply('');

  mustFind('#map-caption').textContent =
    `Map showing the locations of ${mappedMembers.length} of the ${members.length} member ` +
    `newsrooms across ${countStates(mappedMembers)} states and territories. ` +
    `Every member, mapped or not, is listed below.`;

  startHeightReporting(config);
  announceReady();
  window.addEventListener('resize', () => map.invalidate());
}

/**
 * "Members served" rather than "members": the total includes 14 alumni, and
 * TNC did serve all of them. This is the phrasing that makes the headline
 * figure honest instead of inflated — see PRODUCT.md.
 */
function writeClaim(): void {
  const total = members.length;
  const mapped = mappedMembers.length;
  const states = countStates(mappedMembers);

  mustFind('#claim').replaceChildren(
    document.createTextNode(`${total} members served.`),
    el('span', { class: 'claim__second', text: `${states} states and territories.` }),
  );

  mustFind('#claim-sub').textContent =
    `${mapped} of them appear on the map. Every member is listed below.`;
}

function countLabel(shown: number, query: string): string {
  if (query === '') return `${members.length} members`;
  return `${shown} of ${members.length}`;
}

function writeEmptyState(
  target: HTMLElement,
  query: string,
  input: HTMLInputElement,
  apply: (query: string) => void,
): void {
  const clearButton = el('button', {
    type: 'button',
    class: 'roster__clear',
    text: 'Clear search',
  });
  clearButton.addEventListener('click', () => {
    input.value = '';
    apply('');
    input.focus();
  });

  // Names the problem and the recovery, in the product's own words.
  target.replaceChildren(
    document.createTextNode(`No members match “${query}”. Try a place, a state, or a subject — `),
    clearButton,
    document.createTextNode(' to see all 103.'),
  );
}

/**
 * Tile attribution. Leaflet's own control is disabled so no chrome floats over
 * the evidence, which makes rendering it here a requirement rather than a
 * nicety — CARTO and OpenStreetMap both require visible credit.
 */
function writeCredit(): void {
  const updated = generatedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  mustFind('#credit').replaceChildren(
    document.createTextNode('Map data © '),
    el('a', {
      href: 'https://www.openstreetmap.org/copyright',
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'OpenStreetMap',
    }),
    document.createTextNode(' contributors, © '),
    el('a', {
      href: 'https://carto.com/attributions',
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'CARTO',
    }),
    document.createTextNode(`. Roster updated ${updated}.`),
  );
}

// Vite injects this as a module, so the DOM is already parsed. The guard covers
// the case of the bundle being moved into the document head by a host CMS.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}

// Surface failures in the UI instead of only the console — this page is
// normally embedded, where nobody is watching devtools.
window.addEventListener('error', (event) => {
  const claim = document.querySelector('#claim-sub');
  if (claim && !claim.textContent) {
    claim.textContent = `The map failed to load: ${event.message}`;
  }
});
