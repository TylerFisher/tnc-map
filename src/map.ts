/**
 * Leaflet map: pins, clustering, popups, and initial framing.
 */

import L from 'leaflet';
import 'leaflet.markercluster';

import { el, nameNode } from './dom.js';
import { locationLabel } from './dataset.js';
import { withoutOutliers } from './bounds.js';
import type { Coords, Member } from './types.js';

type PlacedMember = Member & { coords: Coords };

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Wide enough to read the country, close enough to be useful on first paint. */
const INITIAL_FIT_MAX_ZOOM = 6;
const FIT_PADDING: L.PointTuple = [36, 36];

export interface MapController {
  render(visible: readonly Member[]): void;
  /** Frame the dense core of the roster, ignoring geographic outliers. */
  fitToCore(): void;
  /** Frame every pin, however far-flung. */
  fitToAll(): void;
  invalidate(): void;
}

export function createMap(container: HTMLElement): MapController {
  const map = L.map(container, {
    // Scroll-wheel zoom is off until the user clicks the map. In an iframe,
    // hijacking the wheel means the host page stops scrolling under the cursor.
    scrollWheelZoom: false,
    worldCopyJump: true,
    zoomControl: true,
  });

  L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);

  // Provisional view so the tiles have somewhere to be while markers are built.
  map.setView([39.8, -98.5], 4);

  enableClickToZoom(map);

  const clusters = L.markerClusterGroup({
    maxClusterRadius: 36,
    showCoverageOnHover: false,
    // Members sharing exact coordinates (505omatic and UpLift Chronicles both
    // sit on Albuquerque's centroid) fan out instead of hiding one another.
    spiderfyOnMaxZoom: true,
    iconCreateFunction: (cluster) =>
      L.divIcon({
        html: el('div', { class: 'cluster', text: cluster.getChildCount() }),
        className: '',
        iconSize: [32, 32],
      }),
  });
  map.addLayer(clusters);

  let placed: PlacedMember[] = [];

  const offFrameNotice = createOffFrameControl(map, () => fitToAll());

  function render(visible: readonly Member[]): void {
    clusters.clearLayers();
    placed = visible.filter((m): m is PlacedMember => m.coords !== null);
    clusters.addLayers(placed.map(markerFor));
    // Filtering can change which members sit outside the current view.
    refreshOffFrameNotice();
  }

  function fitToCore(): void {
    const core = withoutOutliers(placed.map((m) => m.coords));
    fit(core.length > 0 ? core : placed.map((m) => m.coords));
  }

  function fitToAll(): void {
    fit(placed.map((m) => m.coords));
  }

  function fit(coords: readonly Coords[]): void {
    if (coords.length === 0) return;
    const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng] as L.LatLngTuple));
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: INITIAL_FIT_MAX_ZOOM });
    map.once('moveend', refreshOffFrameNotice);
  }

  /**
   * Keeps the "Show all" control honest by naming who is currently off-screen.
   *
   * Tested against the real viewport rather than the outlier set, because
   * padding and aspect ratio mean the rendered view is wider than the fitted
   * bounds — Puerto Rico falls outside the statistical core but is visible on
   * screen anyway, and claiming otherwise would be wrong.
   */
  function refreshOffFrameNotice(): void {
    const bounds = map.getBounds();
    const outside = placed.filter((m) => !bounds.contains([m.coords.lat, m.coords.lng]));
    offFrameNotice.update(outside);
  }

  return {
    render,
    fitToCore,
    fitToAll,
    invalidate: () => map.invalidateSize(),
  };
}

function markerFor(member: PlacedMember): L.Marker {
  const marker = L.marker([member.coords.lat, member.coords.lng], {
    icon: L.divIcon({
      html: el('span', { class: `pin pin--${member.tier}` }),
      className: '',
      iconSize: [15, 15],
      iconAnchor: [7.5, 7.5],
    }),
    title: member.name,
    alt: `${member.name}, ${member.tier} member`,
    // Leaflet's default; stated explicitly because tab-reachable pins are the
    // only keyboard path to a member's details.
    keyboard: true,
  });

  marker.bindPopup(() => popupFor(member), { closeButton: true, maxWidth: 260 });
  return marker;
}

function popupFor(member: Member): HTMLElement {
  const location = locationLabel(member);

  return el('div', { class: 'popup' }, [
    nameNode(member.name, member.url, 'popup__name'),
    location && el('p', { class: 'popup__loc', text: location }),
    member.description && el('p', { class: 'popup__desc', text: member.description }),
    el('span', { class: `badge badge--${member.tier}`, text: member.tier }),
  ]);
}

interface OffFrameControl {
  update(outside: readonly PlacedMember[]): void;
}

/**
 * A control that widens the view to take in members outside the current frame.
 *
 * The default view deliberately frames the contiguous states, which is the
 * only way the map reads at a glance — fitting Alaska, Hawaii and New Delhi
 * into the opening shot shrinks the other 66 pins into an unreadable knot.
 * The cost of that choice is that some members start off-screen, so this
 * control states plainly how many and where, instead of leaving them to be
 * discovered by accident.
 */
function createOffFrameControl(map: L.Map, onClick: () => void): OffFrameControl {
  const label = el('span', { class: 'fit-all__label', text: 'Show all' });
  const count = el('span', { class: 'fit-all__count' });

  const button = el('button', { type: 'button', class: 'fit-all__button' }, [label, count]);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });

  const wrap = el('div', { class: 'leaflet-bar fit-all' }, [button]);
  L.DomEvent.disableClickPropagation(wrap);

  const Control = L.Control.extend({
    options: { position: 'topleft' as L.ControlPosition },
    onAdd: () => wrap,
  });
  new Control().addTo(map);

  return {
    update(outside) {
      // Nothing hidden means the control has nothing to offer.
      wrap.hidden = outside.length === 0;
      if (outside.length === 0) return;

      count.textContent = String(outside.length);

      const places = [...new Set(outside.map((m) => m.state ?? m.city ?? m.name))];
      button.title =
        `${outside.length} member${outside.length === 1 ? '' : 's'} outside this view ` +
        `(${places.join(', ')}). Click to zoom out and include them.`;
      button.setAttribute(
        'aria-label',
        `Show all members, including ${outside.length} outside the current view`,
      );
    },
  };
}

/**
 * Wheel-zoom stays off until the map is clicked or focused, and switches back
 * off when the pointer leaves. Inside an iframe this is the difference between
 * a page that scrolls and one that traps the reader.
 */
function enableClickToZoom(map: L.Map): void {
  const container = map.getContainer();

  const enable = (): void => {
    map.scrollWheelZoom.enable();
    container.classList.add('is-active');
  };
  const disable = (): void => {
    map.scrollWheelZoom.disable();
    container.classList.remove('is-active');
  };

  map.on('click', enable);
  map.on('focus', enable);
  map.on('blur', disable);
  container.addEventListener('mouseleave', disable);
}
