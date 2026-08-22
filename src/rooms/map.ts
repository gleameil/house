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
// GATED as of key gating landing. Which room a key opens is KeySpec.roomId;
// the graph and the rules live in gates.ts, which is pure and self-tested.
// This file only derives the gate table from ROOMS and renders the result.

import { AnyHiddenObjectSpec, KeySpec, ROOMS, RoomSpec } from '../house.constants';
import { readRoomState, readSharedKeys } from '../state/inventory';
import { EXTERNAL_GATES, GateSpec, isUnlocked } from './gates';
import { keyBoard } from './key-board';

export interface MapEntry {
  room: RoomSpec;
  /** how many of the room's objects are still loose */
  remaining: number;
  total: number;
  visited: boolean;
  unlocked: boolean;
}

/** Every gate in the game: one per placed key that names a room, plus the
 *  external gates no house object can satisfy. Most of these name rooms that
 *  do not exist yet — see gates.unbuilt(). Derived rather than written down so
 *  that placing a key is the only step in adding a lock. */
export function houseGates(): GateSpec[] {
  const fromKeys: GateSpec[] = [];
  for (const room of ROOMS) {
    for (const spec of room.objects as AnyHiddenObjectSpec[]) {
      if (spec.kind !== 'key') continue;
      const roomId = (spec as KeySpec).roomId;
      if (roomId) fromKeys.push({ keyId: spec.id, roomId });
    }
  }
  return [...EXTERNAL_GATES, ...fromKeys];
}

export function roomsForMap(): MapEntry[] {
  const gates = houseGates();
  // The union, not the house's own finds: key-13 is granted by /in/.
  const held = readSharedKeys();
  return ROOMS.map((room) => {
    const state = readRoomState(room.id);
    const found = new Set(state.found);
    const remaining = room.objects.filter((o) => !found.has(o.id)).length;
    return {
      room,
      remaining,
      total: room.objects.length,
      visited: state.visits > 0,
      unlocked: isUnlocked(room.id, gates, held),
    };
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

    // A shut room is a span, not a disabled button: there is nothing to press,
    // and a disabled control still announces itself as a control.
    let link: HTMLElement;
    if (entry.unlocked) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-room';
      button.textContent = entry.room.name;
      button.addEventListener('click', () => onChoose(entry.room));
      link = button;
    } else {
      link = document.createElement('span');
      link.className = 'map-room map-room-shut';
      link.textContent = entry.room.name;
    }

    const note = document.createElement('span');
    note.className = 'map-note';
    if (!entry.unlocked) note.textContent = 'still shut';
    else if (!entry.visited) note.textContent = 'not yet opened';
    else if (entry.remaining === 0) note.textContent = 'nothing here is abandoned now';
    else note.textContent = `the mess — ${entry.remaining} of ${entry.total}`;

    item.append(link, note);
    list.appendChild(item);
  }
  panel.appendChild(list);
  panel.appendChild(keyBoard());
  document.body.appendChild(panel);
}
