/**
 * Band 2 — the evidence.
 *
 * The map is explorable but it is not the way to find a newsroom; that is the
 * search field's job, and the roster is the index. So navigation here is
 * bounded rather than open: you can move around inside the network, but you
 * cannot lose it.
 *
 * What that costs and buys, since each choice fixes or protects something:
 *
 * - No clustering. 69 members render as 69 dots. Clustering collapsed them
 *   into 26 marks on desktop and 10 on a phone, arguing the network was a
 *   fifth of its real size on a surface whose whole job is conveying size.
 * - Wheel zoom is off until the map is clicked. Inside an iframe, hijacking
 *   the wheel means the host page stops scrolling under the cursor.
 * - One-finger drag is off on touch. It would trap a phone reader inside a
 *   300px box with no way to scroll past it; pinch still zooms and pans.
 * - Pan and zoom are bounded to the roster's own extent, and a Reset control
 *   restores the opening frame. A map you can move is a map you can get lost
 *   in, and "no way back to the default view" is a real usability defect.
 * - Dots are not tab stops. The map container is one focusable, labelled
 *   element with arrow-key panning; the roster carries every member for
 *   keyboard and screen-reader users.
 * - Tiles carry no place labels, so nothing competes with the claim and the
 *   basemap stops rendering "AFRIKA / أفريقيا" in a US-audience artifact.
 */

import L from 'leaflet';

import { el } from './dom.js';
import { withoutOutliers } from './bounds.js';
import type { Coords, Member } from './types.js';

type PlacedMember = Member & { coords: Coords };

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
const FIT_PADDING: L.PointTuple = [28, 28];
const FIT_MAX_ZOOM = 6;
/** Close enough to separate two newsrooms in one city, no closer. */
const MAX_ZOOM = 11;
/** How much room to allow outside the roster's own extent when panning. */
const BOUNDS_PAD = 0.35;

export interface MapCallbacks {
  onLight(id: string | null): void;
  /** A dot was clicked. The roster, not a popup, is where the member lives. */
  onSelect(id: string): void;
}

export interface MapController {
  /** Dim every dot outside the current result set. */
  reflect(visibleIds: ReadonlySet<string>): void;
  light(id: string | null): void;
  invalidate(): void;
}

export function createMap(
  container: HTMLElement,
  members: readonly Member[],
  callbacks: MapCallbacks,
): MapController {
  const map = L.map(container, {
    // One-finger drag would trap a phone reader inside the figure. Pinch still
    // zooms and pans, which is the contract embedded maps have taught people.
    dragging: !L.Browser.mobile,
    touchZoom: true,
    doubleClickZoom: true,
    scrollWheelZoom: false,
    boxZoom: false,
    // Arrow-key panning and +/- zoom once the container has focus. This is the
    // only reason the figure can be interactive and still accessible.
    keyboard: true,
    zoomControl: false,
    // Rendered as a static credit line in the surface instead, so no control
    // chrome floats over the evidence. Attribution is still displayed.
    attributionControl: false,
    zoomSnap: 0.25,
    maxZoom: MAX_ZOOM,
  });

  // `detectRetina` is deliberately off: combined with fractional zoom it makes
  // Leaflet scale @2x tiles by a non-integer factor, which leaves visible
  // seams across the figure on high-DPI displays.
  L.tileLayer(TILE_URL, { maxZoom: MAX_ZOOM, noWrap: true }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  const placed = members.filter((m): m is PlacedMember => m.coords !== null);
  const dots = new Map<string, HTMLElement>();
  const layer = L.layerGroup().addTo(map);

  for (const member of placed) {
    const dot = el('span', { class: 'dot' });
    dots.set(member.id, dot);

    L.marker([member.coords.lat, member.coords.lng], {
      icon: L.divIcon({ html: dot, className: '', iconSize: [11, 11], iconAnchor: [5.5, 5.5] }),
      // Not a tab stop: 69 of these would bury the roster, and the roster is
      // what actually carries the members.
      keyboard: false,
      interactive: true,
      riseOnHover: true,
      title: member.name,
    })
      .on('mouseover', () => callbacks.onLight(member.id))
      .on('mouseout', () => callbacks.onLight(null))
      .on('click', () => callbacks.onSelect(member.id))
      .addTo(layer);
  }

  /** Signature of the opening frame, so "has the view moved?" is answerable. */
  let home = '';
  /** Assigned once the control exists; `frame()` may run before that. */
  let syncReset: () => void = () => {};

  frame();
  constrain();
  syncReset = addResetControl(map, frame, () => home);
  enableClickToZoom(map);

  const observer = new ResizeObserver(() => {
    map.invalidateSize({ animate: false });
    frame();
    constrain();
  });
  observer.observe(container);

  /**
   * Frames the dense core of the roster. Outliers stay on the map but do not
   * drag the opening view out to a hemisphere — the original fitted every pin
   * including one in New Delhi and rendered the US as a smear on the edge.
   */
  function frame(): void {
    const coords = placed.map((m) => m.coords);
    if (coords.length === 0) return;
    const core = withoutOutliers(coords);
    map.fitBounds(toBounds(core.length > 0 ? core : coords), {
      padding: FIT_PADDING,
      maxZoom: FIT_MAX_ZOOM,
      animate: false,
    });
    // Recorded here rather than on a ready/moveend event: `animate: false`
    // applies synchronously, so this is the only moment the home view is
    // knowable without racing the events fitBounds itself emits.
    home = viewSignature(map);
    // `invalidateSize` emits a moveend that evaluates the control against the
    // previous home and reveals it. Re-syncing here is what settles it.
    syncReset();
  }

  /**
   * Bounds the exploration to the roster's own extent. Without this you can
   * zoom out to the whole globe or pan into empty ocean, and the argument the
   * figure exists to make disappears off-screen.
   */
  function constrain(): void {
    if (placed.length === 0) return;
    map.setMinZoom(map.getZoom());
    map.setMaxBounds(toBounds(placed.map((m) => m.coords)).pad(BOUNDS_PAD));
  }

  let lit: string | null = null;

  return {
    reflect(visibleIds) {
      // Non-matches are dimmed rather than removed, so the shape of the whole
      // network stays legible behind a filtered result and searching never
      // makes the network look smaller than it is.
      const filtering = visibleIds.size !== placed.length;
      for (const [id, dot] of dots) {
        dot.classList.toggle('is-muted', filtering && !visibleIds.has(id));
      }
    },

    light(id) {
      if (lit === id) return;
      if (lit) dots.get(lit)?.classList.remove('is-lit');
      lit = id;
      if (id) dots.get(id)?.classList.add('is-lit');
    },

    invalidate() {
      map.invalidateSize({ animate: false });
      frame();
      constrain();
    },
  };
}

function toBounds(coords: readonly Coords[]): L.LatLngBounds {
  return L.latLngBounds(coords.map((c) => [c.lat, c.lng] as L.LatLngTuple));
}

/**
 * Wheel zoom stays off until the map is clicked or focused, and switches back
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

/** Rounded so sub-pixel drift does not read as "the view moved". */
function viewSignature(map: L.Map): string {
  const c = map.getCenter();
  return `${map.getZoom().toFixed(2)}|${c.lat.toFixed(3)}|${c.lng.toFixed(3)}`;
}

/**
 * Restores the opening frame. Only shown once the view has actually moved.
 * Returns its sync function so the caller can settle it after re-framing.
 */
function addResetControl(map: L.Map, reset: () => void, home: () => string): () => void {
  const button = el('button', {
    type: 'button',
    class: 'map-reset',
    text: 'Reset view',
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    reset();
  });

  const wrap = el('div', { class: 'leaflet-bar map-reset__wrap' }, [button]);
  wrap.hidden = true;
  L.DomEvent.disableClickPropagation(wrap);

  const Control = L.Control.extend({
    options: { position: 'topleft' as L.ControlPosition },
    onAdd: () => wrap,
  });
  new Control().addTo(map);

  // Offering a reset before anything has moved is noise; offering it after is
  // the difference between exploring and getting lost.
  const sync = (): void => {
    wrap.hidden = viewSignature(map) === home();
  };
  map.on('moveend zoomend', sync);
  sync();
  return sync;
}
