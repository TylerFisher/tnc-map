/**
 * The list beside the map, holding every member that legitimately has no pin.
 *
 * The original sidebar showed only `type=beat` rows. `place` rows without
 * coordinates were filtered out of the map and were never eligible for the
 * list, so 21 of 103 members appeared nowhere in the UI at all — acknowledged
 * only by a footer line promising they would show up eventually. Both groups
 * are rendered here now, kept visually distinct because they mean different
 * things: a beat newsroom has no location by definition, an unplaced one is
 * waiting on a data-entry fix.
 */

import { clear, el, nameNode } from './dom.js';
import { locationLabel } from './dataset.js';
import type { Member } from './types.js';

interface Group {
  id: string;
  title: string;
  blurb: string;
  members: readonly Member[];
}

export function renderSidebar(
  container: HTMLElement,
  beat: readonly Member[],
  unplaced: readonly Member[],
): void {
  clear(container);

  const groups: Group[] = [
    {
      id: 'beat',
      title: 'National & beat-based',
      blurb: 'Members defined by what they cover rather than where.',
      members: beat,
    },
    {
      id: 'unplaced',
      title: 'Not yet on the map',
      blurb: 'Members whose home base is still being confirmed.',
      members: unplaced,
    },
  ];

  const rendered = groups.filter((g) => g.members.length > 0);

  if (rendered.length === 0) {
    container.append(
      el('p', { class: 'sidebar__empty', text: 'No members outside the selected tiers.' }),
    );
    return;
  }

  for (const group of rendered) {
    container.append(
      el('section', { class: 'group', 'aria-labelledby': `group-${group.id}` }, [
        el('h2', { class: 'group__title', id: `group-${group.id}` }, [
          group.title,
          el('span', { class: 'group__count', text: group.members.length }),
        ]),
        el('p', { class: 'group__blurb', text: group.blurb }),
        el(
          'ul',
          { class: 'cards' },
          group.members.map((m) => cardFor(m, group.id === 'unplaced')),
        ),
      ]),
    );
  }
}

function cardFor(member: Member, showLocationHint: boolean): HTMLElement {
  // For unplaced members a partial location (a state with no city) is the most
  // useful thing we know, and signals precisely what the Sheet is missing.
  const hint = showLocationHint ? locationLabel(member) : null;

  return el('li', { class: 'card' }, [
    nameNode(member.name, member.url, 'card__name'),
    hint && el('p', { class: 'card__hint', text: hint }),
    member.description && el('p', { class: 'card__desc', text: member.description }),
    el('span', { class: `badge badge--${member.tier}`, text: member.tier }),
  ]);
}
