/**
 * Band 3 — the substance, organised by state.
 *
 * Every one of the 103 members, name and description, each a link. This is
 * where the composition claim lands: the descriptions naming Filipino diaspora
 * newsrooms, Philadelphia's Afghan community and worker-owned tabletop-games
 * journalism are readable without a single click.
 *
 * Grouping by state does work the map cannot. It makes "29 states and
 * territories" verifiable by scrolling rather than merely asserted, and it
 * places two members the map has to omit — Witness PA and Community Voices
 * have a state but no coordinates — under Pennsylvania and Virginia where
 * they belong.
 *
 * It is also the accessible equivalent of the map, which is hidden from
 * assistive technology, so the state headings double as screen-reader
 * navigation landmarks.
 */

import { clear, el, nameNode } from './dom.js';
import { stateName } from './states.js';
import type { Member } from './types.js';

export interface RosterCallbacks {
  /** Fires when a row is hovered or focused, so the map can reflect it. */
  onLight(id: string | null): void;
}

export interface RosterController {
  render(members: readonly Member[]): void;
  light(id: string | null): void;
}

interface Group {
  /** Sort key. Trailing groups sort last via the leading marker. */
  key: string;
  label: string;
  members: Member[];
}

/**
 * Members with no state need a home that stays truthful.
 *
 * `beat` members have no location by definition, which is a fact about their
 * journalism and worth stating. The rest are place-based newsrooms whose
 * location TNC has not recorded yet — a gap in the spreadsheet, not in the
 * network — so they are described as pending rather than as missing.
 */
const BEAT_LABEL = 'National & beat-based';
const PENDING_LABEL = 'Location to be confirmed';

/** Sorts after every real place name. */
const TRAILING = '￿';

export function createRoster(
  container: HTMLElement,
  callbacks: RosterCallbacks,
): RosterController {
  const rows = new Map<string, HTMLElement>();
  let lit: string | null = null;

  function render(members: readonly Member[]): void {
    clear(container);
    rows.clear();
    lit = null;

    for (const group of groupByState(members)) {
      container.append(sectionFor(group));
    }
  }

  function sectionFor(group: Group): HTMLElement {
    const list = el(
      'ul',
      { class: 'state__list' },
      group.members.map((member) => rowFor(member)),
    );

    return el('section', { class: 'state' }, [
      el('h3', { class: 'state__name', text: group.label }),
      list,
    ]);
  }

  function rowFor(member: Member): HTMLElement {
    // The description is the useful second half of the line. Without one the
    // name stands alone rather than butting against what follows — the defect
    // that rendered 14 members as "Bottom Up MediaPublisher".
    //
    // The separator is a real text node, not a CSS ::before: generated content
    // is not reliably exposed to assistive tech, so a pseudo-element dash left
    // screen readers announcing "Hola CulturaLatino arts and culture" — the
    // same weld, surviving where it could not be seen.
    const row = el('li', { class: 'roster__item', 'data-id': member.id }, [
      nameNode(member.name, member.url, 'roster__name'),
      member.description && el('span', { class: 'roster__desc', text: ` — ${member.description}` }),
    ]);

    const enter = (): void => callbacks.onLight(member.id);
    const leave = (): void => callbacks.onLight(null);

    row.addEventListener('mouseenter', enter);
    row.addEventListener('mouseleave', leave);
    row.addEventListener('focusin', enter);
    row.addEventListener('focusout', leave);

    rows.set(member.id, row);
    return row;
  }

  function light(id: string | null): void {
    if (lit === id) return;

    if (lit) rows.get(lit)?.classList.remove('is-lit');
    lit = id;
    if (!id) return;

    const row = rows.get(id);
    if (!row) return;
    row.classList.add('is-lit');
    row.scrollIntoView({ block: 'nearest' });
  }

  return { render, light };
}

function groupByState(members: readonly Member[]): Group[] {
  const groups = new Map<string, Group>();

  const put = (key: string, label: string, member: Member): void => {
    const existing = groups.get(key);
    if (existing) existing.members.push(member);
    else groups.set(key, { key, label, members: [member] });
  };

  for (const member of members) {
    if (member.state) {
      const label = stateName(member.state);
      put(label, label, member);
    } else if (member.kind === 'beat') {
      put(TRAILING + '1', BEAT_LABEL, member);
    } else if (member.city) {
      // Located, just not in a US state — eShe is published from New Delhi.
      // Filing it under "location to be confirmed" would be plainly false.
      put(member.city, member.city, member);
    } else {
      put(TRAILING + '2', PENDING_LABEL, member);
    }
  }

  const sorted = [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const group of sorted) {
    group.members.sort((a, b) => a.name.localeCompare(b.name));
  }
  return sorted;
}
