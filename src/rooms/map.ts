// map.ts — the way between rooms.
//
// PLACEHOLDER, by the asset contract's own description: "a list of room links
// is the shipping placeholder; the drawn map with keyholes is a separate
// afternoon." So this is a list of room names, each showing how much of that
// room is still a mess, and nothing more. When the drawn map arrives it
// replaces the rendering here; roomsForMap() and the entries it produces are
// the shape the drawing will hang on.
//
// It also replaces what CLAUDE.md called Known Debt #2 — clearing a room used
// to teleport you to ROOMS[i+1] cyclically, which was a dev convenience, not
// navigation. Finishing a room now returns you here, and every room has a way
// back here at any time.
//
// NOT YET GATED. KeySpec.roomId exists and is populated, but no key unlocks
// anything; every room is listed and reachable. Gating is the next thing this
// file grows, and it belongs here rather than in house.ts.

import { ROOMS, RoomSpec } from '../house.constants';
import { readRoomState } from '../state/inventory';

export interface MapEntry {
  room: RoomSpec;
  /** how many of the room's objects are still loose */
  remaining: number;
  total: number;
  visited: boolean;
}

export function roomsForMap(): MapEntry[] {
  return ROOMS.map((room) => {
    const state = readRoomState(room.id);
    const found = new Set(state.found);
    const remaining = room.objects.filter((o) => !found.has(o.id)).length;
    return { room, remaining, total: room.objects.length, visited: state.visits > 0 };
  });
}

/** Renders the map. `onChoose` is handed the chosen room — house.ts passes
 *  enterRoom, which is also what keeps this module from importing it and
 *  making a cycle out of house.ts -> map.ts -> house.ts. */
export function showMap(onChoose: (room: RoomSpec) => void): void {
  for (const existing of Array.from(document.getElementsByClassName('house'))) {
    existing.remove();
  }

  const panel = document.createElement('div');
  panel.className = 'house';
  panel.id = 'house-map';

  const heading = document.createElement('h1');
  heading.textContent = 'the house';
  panel.appendChild(heading);

  const list = document.createElement('ul');
  for (const entry of roomsForMap()) {
    const item = document.createElement('li');

    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'map-room';
    link.textContent = entry.room.name;
    link.addEventListener('click', () => onChoose(entry.room));

    const note = document.createElement('span');
    note.className = 'map-note';
    if (!entry.visited) note.textContent = 'not yet opened';
    else if (entry.remaining === 0) note.textContent = 'nothing here is abandoned now';
    else note.textContent = `the mess — ${entry.remaining} of ${entry.total}`;

    item.append(link, note);
    list.appendChild(item);
  }
  panel.appendChild(list);
  document.body.appendChild(panel);
}
