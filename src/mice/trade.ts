// trade.ts — the mouse's economy: one almond in, one art fragment out.
//
// DOM-free and asset-free on purpose, like src/state/ and for the same
// reasons: it can be type-checked and run under node (mice.selftest.ts), and
// it never drags Parcel's `url:` scheme into anything. The almond → card
// mapping lives in house.constants.ts, where the data lives; it is passed in
// here as a plain lookup function so this file never has to import it.
//
// Storage is touched only through src/state/inventory.ts. Nothing in here
// goes near localStorage — see the header of src/state/store.ts for the
// (long, correct) reason.

import { collect, readInventory, spendAlmond } from '../state/inventory';
import { Inventory } from '../state/state.constants';

/** The shape of AlmondSpec.scrap, restated so this file need not import
 *  house.constants.ts. One This Thing card, cut into `pieces` fragments. */
export interface CardScrap {
  cardId: string;
  pieces: number;
}

/** almond id → the card that almond buys a piece of, or undefined if that
 *  almond has no card yet (which is an ordinary state, not an error: the
 *  almonds CSV has not landed and the mapping is placeholder). */
export type ScrapLookup = (almondId: string) => CardScrap | undefined;

/** Art-fragment ids are composite — `${cardId}#${pieceIndex}` — because a
 *  bare card id cannot address one fragment of a card cut into several. See
 *  doc-house-state.md, "Inventory". Do not parse these anywhere but here. */
export const FRAGMENT_SEPARATOR = '#';

/** Piece indices are 0-based in the id and 1-based when spoken to the
 *  player ("piece 2 of 3"); fragmentLabel() is the only place that converts. */
export function fragmentId(cardId: string, pieceIndex: number): string {
  return `${cardId}${FRAGMENT_SEPARATOR}${pieceIndex}`;
}

export function parseFragmentId(id: string): { cardId: string; pieceIndex: number } | null {
  const at = id.lastIndexOf(FRAGMENT_SEPARATOR);
  if (at <= 0 || at === id.length - 1) return null;
  const pieceIndex = Number(id.slice(at + 1));
  if (!Number.isInteger(pieceIndex) || pieceIndex < 0) return null;
  return { cardId: id.slice(0, at), pieceIndex };
}

/** Fragments of one card the player already holds. */
export function piecesHeld(cardId: string, artFragments: string[]): number[] {
  const held: number[] = [];
  for (const id of artFragments) {
    const parsed = parseFragmentId(id);
    if (parsed && parsed.cardId === cardId) held.push(parsed.pieceIndex);
  }
  return held.sort((a, b) => a - b);
}

/** The lowest piece of this card the player does not have, or null when the
 *  card is whole. Lowest-first rather than random so a card fills up in a
 *  legible order — the fragments arrive as 1 of 3, 2 of 3, 3 of 3 however
 *  many mice it took and in whatever rooms. */
export function nextPieceIndex(scrap: CardScrap, artFragments: string[]): number | null {
  const held = new Set(piecesHeld(scrap.cardId, artFragments));
  for (let i = 0; i < scrap.pieces; i++) {
    if (!held.has(i)) return i;
  }
  return null;
}

export interface TradeOffer {
  /** the almond the mouse takes */
  almondId: string;
  cardId: string;
  /** 0-based; see fragmentId() */
  pieceIndex: number;
  /** how many pieces the whole card is cut into */
  pieces: number;
  /** the composite id written into Inventory.artFragments */
  fragmentId: string;
}

export type TradeRefusal =
  /** the player is not carrying an almond */
  | 'no-almonds'
  /** every almond they carry buys a piece of a card they have already
   *  finished, or a card nobody has written yet */
  | 'nothing-left';

export type TradePlan =
  | { accepted: true; offer: TradeOffer }
  | { accepted: false; reason: TradeRefusal };

/** Decide what the mouse takes and what it drops, without changing anything.
 *
 *  The player never picks which almond to hand over — there is no inventory
 *  UI and the almonds are interchangeable to them — so the mouse takes the
 *  first one in the bag that actually buys something, skipping any that are
 *  unmapped or would buy a piece already held. That skip is the whole reason
 *  this is a plan rather than a one-liner: refusing on the first almond would
 *  strand a player holding one finished card and four useful almonds. */
export function planTrade(inventory: Inventory, lookup: ScrapLookup): TradePlan {
  if (inventory.almonds.length === 0) return { accepted: false, reason: 'no-almonds' };
  for (const almondId of inventory.almonds) {
    const scrap = lookup(almondId);
    if (!scrap || scrap.pieces <= 0) continue;
    const pieceIndex = nextPieceIndex(scrap, inventory.artFragments);
    if (pieceIndex === null) continue;
    return {
      accepted: true,
      offer: {
        almondId,
        cardId: scrap.cardId,
        pieceIndex,
        pieces: scrap.pieces,
        fragmentId: fragmentId(scrap.cardId, pieceIndex),
      },
    };
  }
  return { accepted: false, reason: 'nothing-left' };
}

/** Spend the almond, record the fragment. Both writers are idempotent, so a
 *  double click during the nibble animation cannot produce two fragments or
 *  lose two almonds. */
export function commitTrade(offer: TradeOffer): Inventory {
  spendAlmond(offer.almondId);
  return collect('artFragments', offer.fragmentId);
}

/** Plan and commit in one call — what the renderer uses. */
export function feedMouse(lookup: ScrapLookup): TradePlan {
  const plan = planTrade(readInventory(), lookup);
  if (plan.accepted) commitTrade(plan.offer);
  return plan;
}

/** What the text-particle reveal spells out. 1-based for the player. */
export function fragmentLabel(title: string, offer: TradeOffer): string {
  if (offer.pieces <= 1) return title;
  return `${title} — piece ${offer.pieceIndex + 1} of ${offer.pieces}`;
}

/** Has this player ever fed a mouse? Derived from the two inventory slots
 *  rather than stored as its own flag — a second source of truth for
 *  "have they got it yet" is exactly the kind of thing that desyncs, and
 *  doc-house-state.md is emphatic about deriving rather than storing. */
export function hasEverFedAMouse(inventory: Inventory = readInventory()): boolean {
  return inventory.almondsSpent.length > 0 || inventory.artFragments.length > 0;
}
