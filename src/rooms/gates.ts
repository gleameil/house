// gates.ts — which rooms a key opens, and which rooms are open.
//
// Pure functions over ids. No DOM, no storage, no RoomSpec — map.ts supplies
// the gate table, the same arrangement requests.ts uses for its pool, and for
// the same reason: the data lives in house.constants.ts, which drags every
// asset URL in the game behind it, and this module wants to be type-checked
// and self-tested outside a bundler.
//
// The graph, read off key_message-opens-asset-foundIn.csv and confirmed
// against the placed KeySpecs, is a chain with exactly one front door:
//
//     /in/  --key-13-->  broom closet  --key-12-->  master bathroom
//                                      --key-8 -->  spare room
//                                                     --key-2 --> children's bedroom
//                                                     --key-14--> balcony
//
// Every room that exists is reachable, nothing is orphaned, and the entrance
// is in Jennie's room in /in/. The other ten placed keys open rooms that do
// not exist yet (the ~13-room vision); they are gates with no room behind
// them, which is not an error — see UNBUILT below.

import { HOUSE_CONFIG } from '../state/state.constants';

export interface GateSpec {
  /** the key that opens it */
  keyId: string;
  /** the room it opens — may name a room that does not exist yet */
  roomId: string;
}

/** Gates that no house object can ever satisfy, because the key is not found
 *  in the house. Today there is exactly one, and it is the front door:
 *  key-13's "Found in" column is `n/a` because it is found in Jennie's room
 *  in /in/, which grants it through grantKeys(['key-13']).
 *
 *  This cannot be derived from ROOMS — there is no KeySpec for key-13 in the
 *  house, by design — so it is written down here or it is nowhere. */
export const EXTERNAL_GATES: GateSpec[] = [{ keyId: 'key-13', roomId: 'broom-closet' }];

/** A room is unlocked when the player holds a key that opens it. A room that
 *  no key names is unlocked — most rooms in most games are just rooms — and
 *  HOUSE_CONFIG.frontDoor names the one room that opens regardless.
 *
 *  `heldKeys` is the union in `evernost:shared:keys`, not the house's own
 *  finds, because key-13 is granted by /in/ and never found here. */
export function isUnlocked(roomId: string, gates: GateSpec[], heldKeys: Iterable<string>): boolean {
  if (!HOUSE_CONFIG.keyGating) return true;
  if (roomId === HOUSE_CONFIG.frontDoor) return true;
  const opensThis = gates.filter((g) => g.roomId === roomId);
  if (opensThis.length === 0) return true;
  const held = new Set(heldKeys);
  return opensThis.some((g) => held.has(g.keyId));
}

/** The keys that would open this room, whether or not the player has them.
 *  Empty for an ungated room. The map uses this to say which key is missing
 *  rather than only that something is. */
export function keysFor(roomId: string, gates: GateSpec[]): string[] {
  return gates.filter((g) => g.roomId === roomId).map((g) => g.keyId);
}

/** Gates whose room does not exist yet. Ten of the fifteen placed keys are
 *  like this. They are not broken data — the key is real, its message is real,
 *  and the room is a promise. Callers that walk the gate table must tolerate
 *  them; this is the function that names them so nobody "fixes" it. */
export function unbuilt(gates: GateSpec[], existingRoomIds: Iterable<string>): GateSpec[] {
  const exists = new Set(existingRoomIds);
  return gates.filter((g) => !exists.has(g.roomId));
}

/** Every room the player can currently open, in the order given. */
export function unlockedRooms(
  roomIds: string[],
  gates: GateSpec[],
  heldKeys: Iterable<string>,
): string[] {
  const held = new Set(heldKeys);
  return roomIds.filter((id) => isUnlocked(id, gates, held));
}
