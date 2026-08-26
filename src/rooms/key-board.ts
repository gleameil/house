// key-board.ts — the sixteen hooks.
//
// The panel counters inside a room stay per-room: "keys — 2 of 5" is about the
// room you are standing in. This is the other view, the whole-house one, and
// it lives with the map because that is where you stand when you are thinking
// about the house rather than about a floor.
//
// Sixteen hooks, filled and unfilled. An unfilled hook is a key not yet found,
// which makes the shape of what is missing visible without naming it — the
// board is a count you can look at, not a list.
//
// Two things worth knowing before changing this:
//
// 1. It reads readSharedKeys(), the union in `evernost:shared:keys`, and NOT
//    the house's own finds. key-13 is found in Jennie's room in /in/, which
//    grants it with grantKeys(['key-13']). Read the house's inventory instead
//    and that hook can never fill.
// 2. Therefore one hook stays empty no matter how thoroughly the house is
//    cleaned. The house contains fifteen of the sixteen. That is the first
//    place the /in/ handoff becomes visible to a player rather than to the
//    code, and it is the point of it.

import { ALL_KEY_IDS, HOOK_ART, KEY_ART } from '../house.constants';
import { readSharedKeys } from '../state/inventory';

export interface HookState {
  keyId: string;
  held: boolean;
}

export function hooks(): HookState[] {
  const held = new Set(readSharedKeys());
  return ALL_KEY_IDS.map((keyId) => ({ keyId, held: held.has(keyId) }));
}

/** Builds the board. The caller appends it — this module does not know where
 *  it goes, so the drawn map can hang it somewhere else later. */
export function keyBoard(): HTMLElement {
  const board = document.createElement('div');
  board.id = 'key-board';

  const row = document.createElement('div');
  row.className = 'key-hooks';

  const state = hooks();
  for (const hook of state) {
    const slot = document.createElement('div');
    slot.className = hook.held ? 'key-hook key-hook-filled' : 'key-hook';

    const art = document.createElement('img');
    art.src = hook.held ? KEY_ART[hook.keyId] : HOOK_ART;
    // A held key is worth naming to a screen reader; an empty hook is not,
    // and sixteen "empty hook"s in a row would be noise.
    art.alt = hook.held ? hook.keyId.replace('-', ' ') : '';
    slot.appendChild(art);

    row.appendChild(slot);
  }
  board.appendChild(row);

  const count = document.createElement('span');
  count.className = 'key-board-count';
  count.textContent = `keys — ${state.filter((h) => h.held).length} of ${state.length}`;
  board.appendChild(count);

  return board;
}
