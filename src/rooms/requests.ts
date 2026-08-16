// requests.ts — how a room decides what to ask for, and when it stops asking.
//
// Pure functions over ids and RoomState. No DOM, no storage, no RoomSpec —
// house.ts supplies the pool, because deciding which objects are askable-for
// is a presentation question (it is exactly the set that gets its own line in
// the to-find panel) and it lives there.
//
// The design this implements is written up in doc-house-state.md under
// "Per-room state, and the visit/pass loop".

import { RoomState } from '../state/state.constants';

/** Objects this room could still name at the player: askable, not already
 *  asked for, not already tidied away.
 *
 *  Subtracting `found` stops the room asking for something that is gone.
 *  Subtracting `requested` is the no-repeats guarantee — and because
 *  `requested` only ever grows and is never pruned, it holds across sessions
 *  and not merely within a visit. */
export function candidates(pool: string[], state: RoomState): string[] {
  const spent = new Set([...state.found, ...state.requested]);
  return pool.filter((id) => !spent.has(id));
}

/** Pick up to `count` of them, at random, without replacement. */
export function chooseRequests(pool: string[], state: RoomState, count: number): string[] {
  const available = candidates(pool, state);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, Math.max(0, count));
}

/** True when there is nothing left this room could ask for that it has not
 *  already asked for.
 *
 *  DERIVED, never stored. A stored boolean would be a second source of truth
 *  able to drift from the two sets that actually decide it.
 *
 *  Two consequences worth knowing. Something requested but never found still
 *  counts toward the trigger, so ignoring a request hastens the final pass
 *  rather than deferring it forever — and the object simply falls into the
 *  mess like everything else. And a room with an empty pool is trivially in
 *  final-pass mode from its first visit, which is the balcony's permanent
 *  condition: 28 scraps and not one named object among them. */
export function isFinalPass(pool: string[], state: RoomState): boolean {
  return candidates(pool, state).length === 0;
}

/** Progress through the exhaustive last pass.
 *
 *  `total` is the size of the mess at the moment final-pass mode began, frozen
 *  by the caller (see freezeMessTotal) so the denominator the player was shown
 *  never moves under them. `tidied` counts up toward it. */
export function messProgress(
  allObjectIds: string[],
  state: RoomState,
  frozenTotal: number | undefined,
): { tidied: number; total: number } {
  const found = new Set(state.found);
  const remaining = allObjectIds.filter((id) => !found.has(id)).length;
  const total = frozenTotal ?? remaining;
  return { tidied: Math.max(0, total - remaining), total };
}

/** Whether every object named in this round has been tidied away. */
export function roundSatisfied(requestedNow: string[], state: RoomState): boolean {
  if (requestedNow.length === 0) return false;
  const found = new Set(state.found);
  return requestedNow.every((id) => found.has(id));
}
