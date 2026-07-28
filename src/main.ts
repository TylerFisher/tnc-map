/*
 * TNC brand typefaces, self-hosted — no request to Google Fonts.
 *
 * Latin + Latin Extended, at only the weights the stylesheet uses.
 * `latin-ext` is not optional: member names include "Kaheāwai Media", whose ā
 * lives outside the basic Latin subset and would otherwise fall back to a
 * system font mid-word.
 */
import '@fontsource/libre-baskerville/latin-400.css';
import '@fontsource/libre-baskerville/latin-700.css';
import '@fontsource/libre-baskerville/latin-ext-400.css';
import '@fontsource/libre-baskerville/latin-ext-700.css';

import '@fontsource/work-sans/latin-400.css';
import '@fontsource/work-sans/latin-500.css';
import '@fontsource/work-sans/latin-600.css';
import '@fontsource/work-sans/latin-ext-400.css';
import '@fontsource/work-sans/latin-ext-500.css';
import '@fontsource/work-sans/latin-ext-600.css';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import './styles.css';

import { el, mustFind } from './dom.js';
import { countStates, generatedAt, members, tierTotals, unplacedMembers } from './dataset.js';
import { createMap } from './map.js';
import { renderSidebar } from './sidebar.js';
import { announceReady, applyEmbedConfig, readEmbedConfig, startHeightReporting } from './embed.js';
import { TIERS, placementOf, type Member, type Tier } from './types.js';

const activeTiers = new Set<Tier>(TIERS);

function main(): void {
  const config = readEmbedConfig();
  applyEmbedConfig(config);

  const mapController = createMap(mustFind('#map'));
  const sidebar = mustFind('#sidebar-content');
  const summary = mustFind('#summary');
  const footnote = mustFind('#footnote');

  buildFilters(mustFind('#filters'), () => update(false));

  function update(isFirstRender: boolean): void {
    const visible = members.filter((m) => activeTiers.has(m.tier));

    mapController.render(visible);
    if (isFirstRender) mapController.fitToCore();

    renderSidebar(
      sidebar,
      visible.filter((m) => placementOf(m) === 'beat'),
      visible.filter((m) => placementOf(m) === 'unplaced'),
    );

    summary.textContent = summaryText(visible);
  }

  update(true);
  footnote.replaceChildren(...footnoteNodes());

  // The sidebar can change height as tiers are toggled, which moves the map.
  new ResizeObserver(() => mapController.invalidate()).observe(mustFind('#map'));

  startHeightReporting(config);
  announceReady();
}

function buildFilters(container: HTMLElement, onChange: () => void): void {
  for (const tier of TIERS) {
    const button = el(
      'button',
      {
        type: 'button',
        class: 'pill',
        'data-tier': tier,
        'aria-pressed': 'true',
      },
      [el('span', { class: 'pill__dot' }), tier, el('span', { class: 'pill__count', text: tierTotals[tier] })],
    );

    button.addEventListener('click', () => {
      if (activeTiers.has(tier)) activeTiers.delete(tier);
      else activeTiers.add(tier);
      button.setAttribute('aria-pressed', String(activeTiers.has(tier)));
      onChange();
    });

    container.append(button);
  }
}

/**
 * Every figure in this sentence is computed from the same filtered set.
 *
 * The original mixed scopes mid-sentence: tier counts came from the unfiltered
 * roster while the states figure came from the filtered pins, so switching a
 * tier off produced a line that contradicted itself.
 */
function summaryText(visible: readonly Member[]): string {
  if (visible.length === 0) return 'No tiers selected — choose at least one above.';

  const mapped = visible.filter((m) => m.coords !== null);
  const offMap = visible.length - mapped.length;
  const states = countStates(mapped);

  const parts = [
    visible.length === members.length
      ? `${members.length} members`
      : `${visible.length} of ${members.length} members`,
    `${mapped.length} on the map across ${states} states and territories`,
  ];
  if (offMap > 0) parts.push(`${offMap} listed alongside`);

  return parts.join(' · ');
}

function footnoteNodes(): Node[] {
  const pending = unplacedMembers.length;
  const updated = generatedAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return [
    el('span', {
      text:
        pending > 0
          ? `${pending} members are listed without a pin while their locations are confirmed.`
          : 'Every member is mapped.',
    }),
    el('span', { class: 'footnote__sep', text: '·' }),
    el('span', { text: `Roster updated ${updated}` }),
  ];
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
  const summary = document.querySelector('#summary');
  if (summary && !summary.textContent) {
    summary.textContent = `The map failed to load: ${event.message}`;
  }
});
