// inventory.ts — the typed layer over store.ts.
//
// Two sections: the cumulative Inventory (what the player is carrying, across
// every room and session), and per-room RoomState (what one room remembers).
// They live together because both are thin typed views over the same storage
// primitive; split them when the request/final-pass algorithm lands and this
// file grows a second personality.
//
// Nothing here is wired into house.ts yet. See the migration checklist at the
// end of doc-house-state.md for the order in which it should be.

import {
  EMPTY_INVENTORY,
  EMPTY_ROOM_STATE,
  Inventory,
  InventorySlot,
  RoomState,
  STORAGE_KEYS,
  SoundSetting,
  StoredSpot,
} from './state.constants';
import {
  readLocal,
  readShared,
  unionIntoShared,
  writeLocal,
  writeShared,
} from './store';

// ------------------------------------------------------------- inventory ---

/** Every slot is a string[]; anything stored that is not an array of strings
 *  is discarded rather than trusted. This is also the forward-compatibility
 *  path for additive changes: a slot added after a player's last visit simply
 *  reads as empty, so adding a field needs no schema bump. */
function normalizeInventory(raw: unknown): Inventory {
  const out: Inventory = { ...EMPTY_INVENTORY };
  if (typeof raw !== 'object' || raw === null) return out;
  const record = raw as Record<string, unknown>;
  for (const slot of Object.keys(EMPTY_INVENTORY) as InventorySlot[]) {
    const value = record[slot];
    out[slot] = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  }
  return out;
}

export function readInventory(): Inventory {
  return normalizeInventory(readShared<unknown>(STORAGE_KEYS.inventory, null));
}

export function writeInventory(inventory: Inventory): void {
  writeShared(STORAGE_KEYS.inventory, inventory);
}

export function has(slot: InventorySlot, id: string): boolean {
  return readInventory()[slot].includes(id);
}

export function countOf(slot: InventorySlot): number {
  return readInventory()[slot].length;
}

/** Add an id to a slot. Idempotent — finding the same object twice, or a
 *  reload mid-animation, must not produce "keys — 17 of 16".
 *
 *  `dolls`, `dollParts` and `keys` are additionally mirrored into the
 *  evernost:shared:* arrays that /in/ reads, by union rather than replacement
 *  (see unionIntoShared). The inventory record stays the house's own account;
 *  the shared arrays are the handoff surface, and they are deliberately the
 *  smaller, dumber thing — /in/ should never have to parse an Inventory. */
export function collect(slot: InventorySlot, id: string): Inventory {
  const inventory = readInventory();
  if (!inventory[slot].includes(id)) {
    inventory[slot] = [...inventory[slot], id];
    writeInventory(inventory);
  }
  if (slot === 'dolls') unionIntoShared(STORAGE_KEYS.sharedDolls, [id]);
  if (slot === 'dollParts') unionIntoShared(STORAGE_KEYS.sharedDollParts, [id]);
  if (slot === 'keys') unionIntoShared(STORAGE_KEYS.sharedKeys, [id]);
  return inventory;
}

/** Move an almond from held to spent. The two lists together are the full
 *  set of almonds ever found, which is what the "almonds — n of m" counter
 *  wants; `almonds` alone is what the mice will accept. */
export function spendAlmond(id: string): Inventory {
  const inventory = readInventory();
  if (!inventory.almonds.includes(id)) return inventory;
  inventory.almonds = inventory.almonds.filter((a) => a !== id);
  if (!inventory.almondsSpent.includes(id)) {
    inventory.almondsSpent = [...inventory.almondsSpent, id];
  }
  writeInventory(inventory);
  return inventory;
}

/** Every almond ever found, held or spent. */
export function almondsEverFound(inventory: Inventory = readInventory()): string[] {
  return [...new Set([...inventory.almonds, ...inventory.almondsSpent])];
}

// ------------------------------------------------- the /in/ read contract ---
//
// These two are what /in/ calls. They are exported from the house repo as the
// reference implementation; /in/ will have its own copy of the same six lines.
// Both are total: absence, corruption, and unknown ids all resolve to a plain
// array, never to a throw and never to a prompt. A player who reaches /in/
// having never opened the house gets [] and an ordinary February.

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export function readSharedDolls(): string[] {
  return stringArray(readShared<unknown>(STORAGE_KEYS.sharedDolls, []));
}

/** The pieces, not the finished dolls. /in/ needs both lists and must read
 *  them independently: the Gorilla Prince arrives here in two pieces and
 *  never appears in readSharedDolls(), because the house does not assemble
 *  him. If /in/ later heals him, it writes the doll with grantDolls(). */
export function readSharedDollParts(): string[] {
  return stringArray(readShared<unknown>(STORAGE_KEYS.sharedDollParts, []));
}

export function readSharedKeys(): string[] {
  return stringArray(readShared<unknown>(STORAGE_KEYS.sharedKeys, []));
}

/** key13 is the reason this is exported rather than kept private: its "Found
 *  in" column in key_message-opens-asset-foundIn.csv is n/a, because it is
 *  found in Jennie's room in /in/, not in any house room. /in/ writes it here. */
export function grantKeys(ids: string[]): string[] {
  return unionIntoShared(STORAGE_KEYS.sharedKeys, ids);
}

/** The other direction of the same door: /in/ assembling a doll the house
 *  could not. The gorilla is the case this exists for. Union, never replace —
 *  the house's own dolls are in the same array. */
export function grantDolls(ids: string[]): string[] {
  return unionIntoShared(STORAGE_KEYS.sharedDolls, ids);
}

// ---------------------------------------------------------------- sound ---

export function readSound(): SoundSetting {
  return readShared<SoundSetting>(STORAGE_KEYS.sound, 'on') === 'off' ? 'off' : 'on';
}

export function writeSound(setting: SoundSetting): void {
  writeShared(STORAGE_KEYS.sound, setting);
}

// ------------------------------------------------------------ room state ---

function normalizeRoomState(raw: unknown): RoomState {
  const out: RoomState = { ...EMPTY_ROOM_STATE, found: [], requested: [] };
  if (typeof raw !== 'object' || raw === null) return out;
  const record = raw as Record<string, unknown>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  out.found = strings(record.found);
  out.requested = strings(record.requested);
  out.visits = typeof record.visits === 'number' && record.visits >= 0 ? record.visits : 0;
  if (typeof record.spots === 'object' && record.spots !== null) {
    out.spots = record.spots as Record<string, StoredSpot>;
  }
  if (typeof record.messTotal === 'number') out.messTotal = record.messTotal;
  return out;
}

export function readRoomState(roomId: string): RoomState {
  return normalizeRoomState(readLocal<unknown>(STORAGE_KEYS.room(roomId), null));
}

export function writeRoomState(roomId: string, state: RoomState): void {
  writeLocal(STORAGE_KEYS.room(roomId), state);
}

/** Call on entering a room, once per entry. */
export function recordVisit(roomId: string): RoomState {
  const state = readRoomState(roomId);
  state.visits += 1;
  writeRoomState(roomId, state);
  return state;
}

/** Call when an object is tidied away. Idempotent. */
export function recordFound(roomId: string, objectId: string): RoomState {
  const state = readRoomState(roomId);
  if (!state.found.includes(objectId)) {
    state.found = [...state.found, objectId];
    writeRoomState(roomId, state);
  }
  return state;
}

/** Call when a room names objects at the player. Adds to the anti-repeat
 *  ledger. Note that this does NOT touch `found`: being asked and complying
 *  are separate events, and an ignored request stays requested forever, which
 *  is what pushes the room toward its final pass. */
export function recordRequested(roomId: string, objectIds: string[]): RoomState {
  const state = readRoomState(roomId);
  const merged = [...new Set([...state.requested, ...objectIds])];
  if (merged.length !== state.requested.length) {
    state.requested = merged;
    writeRoomState(roomId, state);
  }
  return state;
}

export function recordSpots(roomId: string, spots: Record<string, StoredSpot>): RoomState {
  const state = readRoomState(roomId);
  state.spots = spots;
  writeRoomState(roomId, state);
  return state;
}

/** Freeze the denominator for "the mess — x of y" the first time the room
 *  enters final-pass mode. Later calls are ignored, so the number the player
 *  was shown never moves under them. */
export function freezeMessTotal(roomId: string, remaining: number): RoomState {
  const state = readRoomState(roomId);
  if (state.messTotal === undefined) {
    state.messTotal = remaining;
    writeRoomState(roomId, state);
  }
  return state;
}
