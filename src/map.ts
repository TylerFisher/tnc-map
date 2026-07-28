/**
 * Band 2 — the evidence.
 *
 * This is a figure, not an application. Dragging, zooming, keyboard control
 * and every Leaflet control are disabled: "the map is an output, never an
 * input" is only true if the thing genuinely cannot be operated. Finding a
 * newsroom is the search field's job.
 *
 * Consequences worth stating, because each fixes a named defect:
 *
 * - No clustering. 69 members render as 69 dots. Clustering collapsed them
 *   into 26 marks on desktop and 10 on a phone, which argued the network was
 *   a fifth of its real size on a surface whose entire job is conveying size.
 * - Dots overlap where the network is dense. Overlap reads as density, which
 *   is the argument; two members on the same city centroid no longer need a
 *   spiderfy interaction to coexist.
 * - The whole figure is aria-hidden and holds no tab stops. The roster is its
 *   accessible equivalent, so the 26 meaningless "button, 3… button, 7…" stops
 *   are gone rather than relabelled.
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

export interface MapCallbacks {
  onLight(id: string | null): void;
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
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    scrollWheelZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomControl: false,
    // Rendered as a static credit line in the surface instead, so no control
    // chrome floats over the evidence. Attribution is still displayed.
    attributionControl: false,
    // Finer zoom steps let the fit land closer to the ideal framing when the
    // frame is a fixed height rather than a full page.
    zoomSnap: 0.25,
  });

  // `detectRetina` is deliberately off: combined with fractional zoom it makes
  // Leaflet scale @2x tiles by a non-integer factor, which leaves visible
  // seams across the figure on high-DPI displays.
  L.tileLayer(TILE_URL, { maxZoom: 12, noWrap: true }).addTo(map);

  const placed = members.filter((m): m is PlacedMember => m.coords !== null);
  const dots = new Map<string, HTMLElement>();
  const layer = L.layerGroup().addTo(map);

  for (const member of placed) {
    const dot = el('span', { class: 'dot' });
    dots.set(member.id, dot);

    const marker = L.marker([member.coords.lat, member.coords.lng], {
      icon: L.divIcon({ html: dot, className: '', iconSize: [11, 11], iconAnchor: [5.5, 5.5] }),
      // Not a tab stop: the figure carries no semantics of its own.
      keyboard: false,
      interactive: true,
      // Pointer feedback only; the roster row is the real target.
      riseOnHover: true,
    });

    marker.on('mouseover', () => callbacks.onLight(member.id));
    marker.on('mouseout', () => callbacks.onLight(null));
    marker.addTo(layer);
  }

  frame();

  // The fixed-height frame can still change width inside a responsive host.
  const observer = new ResizeObserver(() => {
    map.invalidateSize({ animate: false });
    frame();
  });
  observer.observe(container);

  /**
   * Frames the dense core of the roster. Outliers stay on the map but do not
   * drag the opening view out to a hemisphere — the original map fitted every
   * pin including one in New Delhi and rendered the US as a smear on the edge.
   */
  function frame(): void {
    const coords = placed.map((m) => m.coords);
    if (coords.length === 0) return;
    const core = withoutOutliers(coords);
    const bounds = L.latLngBounds(
      (core.length > 0 ? core : coords).map((c) => [c.lat, c.lng] as L.LatLngTuple),
    );
    map.fitBounds(bounds, { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM, animate: false });
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
    },
  };
}
