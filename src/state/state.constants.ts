// state.constants.ts — types, keys, and configuration for persisted house state.
//
// Models live in the constants file, alongside the data, matching the
// convention in house.constants.ts and in /in/.
//
// NOTHING IN src/state/ MAY IMPORT house.constants.ts. That file imports every
// asset URL in the game, which means importing it drags Parcel's `url:` scheme
// into any consumer. Keeping the state layer asset-free is what lets it be
// type-checked and unit-tested outside a bundler (see state.selftest.ts), and
// it is also the only thing preventing a circular import once house.ts starts
// calling into here. Ids cross this boundary as plain strings.

/** Bumped on any BREAKING change to the shape of stored data. See ensureSchema()
 *  in store.ts for the policy — additive fields do not need a bump, because
 *  readInventory()/readRoomState() normalize missing fields away. */
export const SCHEMA_VERSION = 1;

/** Every key this project writes from now on begins with this. Existing
 *  unprefixed /in/ keys are not migrated and are never touched — see
 *  clearNamespace() in store.ts, which deliberately cannot reach them. */
export const NAMESPACE_PREFIX = 'evernost:';

export const STORAGE_KEYS = {
  schema: 'evernost:schema',
  inventory: 'evernost:house:inventory',
  sharedDolls: 'evernost:shared:dolls',
  sharedDollParts: 'evernost:shared:dollParts',
  sharedKeys: 'evernost:shared:keys',
  sound: 'evernost:settings:sound',
  /** per-room; house-private, read with readLocal */
  room: (roomId: string) => `evernost:house:room:${roomId}`,
} as const;

export type SoundSetting = 'on' | 'off';

// ------------------------------------------------------------- inventory ---

/** The player's cumulative haul, across every room and every session.
 *
 *  Revisions from the shape proposed in 00-CONTRACTS.md §1, with reasons
 *  (the contract asks that any revision be documented):
 *
 *  - `almonds` split into `almonds` (held) and `almondsSpent` (given to a
 *    mouse). The contract's single field was annotated "consumed/held", which
 *    are opposite states. They have to be separable for two reasons: the
 *    "almonds — 4 of 16" counter must not run backwards when the player feeds
 *    a mouse, and the mouse trade has to know which almond bought which art
 *    fragment. Nothing else changes; both are still flat string arrays.
 *
 *  - `artFragments` ids are composite. AlmondSpec.scrap is
 *    `{ cardId: string; pieces: number }` — one This Thing card is several
 *    fragments — so a bare cardId cannot address a single fragment. Ids here
 *    are `${cardId}#${pieceIndex}`, which keeps the flat array and keeps the
 *    JSON small. Do not parse these anywhere except the art-fragment code.
 *
 *  Everything else is the contract's shape unchanged.
 */
export interface Inventory {
  /** key1 … key16 */
  keys: string[];
  /** almonds found and not yet given to a mouse */
  almonds: string[];
  /** almonds given to a mouse; kept so counters and trades stay honest */
  almondsSpent: string[];
  /** paper-ball poem ids */
  papers: string[];
  /** windswept abstract ids — 28 of them, all on the balcony */
  scraps: string[];
  /** heads, bodies, limbs, gorilla + gorilla leg. Mirrored to
   *  evernost:shared:dollParts, because /in/ needs the PIECES, not only the
   *  finished dolls — see the note on `dolls` below. */
  dollParts: string[];
  /** dolls that have been made whole.
   *
   *  NOT derivable from dollParts, in both directions. The Gorilla Prince
   *  crosses into /in/ in two pieces and stays that way through the house:
   *  his fusion is deferred, not impossible, and may land at the end of
   *  February (the Fisher King healed). So holding every part of a doll does
   *  not imply the doll — and conversely, /in/ may write a doll here that the
   *  house never assembled. Neither side may infer one list from the other. */
  dolls: string[];
  /** mouse-given, keyed to This Thing poems; see the id note above */
  artFragments: string[];
}

/** The slots of Inventory, as a type — every value is a string[]. */
export type InventorySlot = keyof Inventory;

export const EMPTY_INVENTORY: Inventory = {
  keys: [],
  almonds: [],
  almondsSpent: [],
  papers: [],
  scraps: [],
  dollParts: [],
  dolls: [],
  artFragments: [],
};

// ------------------------------------------------------------ room state ---

/** Structurally compatible with `Spot` in house.constants.ts, redeclared here
 *  so the state layer stays asset-free (see the header). If Spot gains a field,
 *  add it here too. */
export interface StoredSpot {
  x: number;
  y: number;
  width: number;
  rotation?: number;
}

/** What one room remembers between visits.
 *
 *  `found` and `requested` are two different collections answering two
 *  different questions, and neither contains the other:
 *
 *  - `found` — every object id the player has ever tidied away in this room,
 *    cumulative across visits. Answers "what is left in the mess?"
 *  - `requested` — every object id this room has ever ASKED FOR BY NAME,
 *    cumulative across visits. Answers "what have I already said out loud?"
 *    It is the anti-repeat ledger, and it is the only thing that guarantees a
 *    second visit does not open by naming the lamp again.
 *
 *  A player can find things nobody asked for (most clicks are like this), and
 *  can be asked for something and leave without finding it. Collapsing these
 *  into one set is the bug the contract's §"per-room state as two distinct
 *  sets" is warning about: if requests were drawn from the not-yet-found pool
 *  only, a room the player has already cleared could never ask for anything
 *  again, and the final cleanup pass would have nothing to be the last pass OF.
 */
export interface RoomState {
  found: string[];
  requested: string[];
  visits: number;
  /** Written only when HOUSE_CONFIG.persistObjectPositions is true; the spot
   *  each object was assigned, so the room looks the same when you come back.
   *  Absent means "re-roll placement on entry", which is today's behaviour. */
  spots?: Record<string, StoredSpot>;
  /** Size of the mess at the moment final-pass mode began, frozen so the
   *  "the mess — x of y" counter has a stable denominator. Absent until then;
   *  its presence is NOT what defines final-pass mode (that is derived — see
   *  doc-house-state.md), it is only the counter's memory. */
  messTotal?: number;
}

export const EMPTY_ROOM_STATE: RoomState = { found: [], requested: [], visits: 0 };

// ---------------------------------------------------------------- config ---

/** Two behaviours that are deliberately undecided. They are flags, not
 *  decisions: they exist so tomorrow's feature code can be written against
 *  both answers, and so that the hidden-object game and the /in/ version can
 *  differ without a fork. Do not resolve these in code — see the
 *  "Two open flags" section of doc-house-state.md. */
export interface HouseConfig {
  /** true: an object sits where it sat last visit. false: placement re-rolls
   *  on every entry, which is what house.ts does today. Default true. */
  persistObjectPositions: boolean;
  /** true: content is gated by the February date (/in/ already keeps
   *  `evernostianNow` and `limitOfFebruaryForesight` in unprefixed
   *  localStorage). false: everything is always available. Default false. */
  dateGating: boolean;
  /** true: a room opens only once the player holds a key that names it.
   *  false: every room is always reachable, which is what house.ts did before
   *  gating landed. Default true. See src/rooms/gates.ts for the graph. */
  keyGating: boolean;
  /** The one room that opens without a key, so a player who has never been to
   *  /in/ is invited rather than locked out — the "graceful absence" policy in
   *  doc-house-state.md, applied where it is actually visible to a player.
   *
   *  The house's real front door is key-13, which /in/ grants. Set this to
   *  null once /in/ reliably grants it and the house should be genuinely
   *  entered through Jennie's room. That is a one-word change and a real
   *  decision about whether the house can be played on its own. */
  frontDoor: string | null;
  /** how many objects a room names at once — Nora's instinct is three */
  requestsPerRound: number;
  /** how many rounds of that a single visit may run before the visit ends;
   *  1 is "three and out", higher is "a few series of three" */
  roundsPerVisit: number;
}

export const HOUSE_CONFIG: HouseConfig = {
  persistObjectPositions: true,
  dateGating: false,
  keyGating: true,
  frontDoor: 'broom-closet',
  requestsPerRound: 3,
  roundsPerVisit: 1,
};
