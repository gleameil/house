// placement.ts — the pure half of HOUSE_CONFIG.persistObjectPositions.
//
// assignSpots() in house.ts does the actual placing, because it needs RoomSpec
// and therefore every asset URL in the game. These two functions are the part
// with rules in it, so they live out here where they can be self-tested
// outside a bundler — same arrangement as requests.ts and gates.ts.
//
// Spots are compared by value, not by identity. The stored copy came back
// through JSON and is a different object from the authored one, so identity
// would never match and every remembered position would be silently discarded.

import { StoredSpot } from '../state/state.constants';

export function sameSpot(a: StoredSpot, b: StoredSpot): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && (a.rotation ?? 0) === (b.rotation ?? 0)
  );
}

/** A remembered spot, but only if the room still authors it.
 *
 *  If Nora moves an object's spots in house.constants.ts, a position a player
 *  stored earlier is stale. Silently honouring it would make her edit look
 *  like it did nothing — the worst failure available here, because it looks
 *  like the code is broken rather than like the save is old. So a stored spot
 *  must still be findable in the authored list to be reused. */
export function rememberedSpot<T extends StoredSpot>(
  stored: Record<string, StoredSpot>,
  id: string,
  authored: T[],
): T | undefined {
  const remembered = stored[id];
  if (!remembered) return undefined;
  return authored.find((spot) => sameSpot(spot, remembered));
}
