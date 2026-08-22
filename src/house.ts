// house.ts — hidden-object room engine, now with reassembly.
//
// Hit testing (unchanged): one click listener on the room, objects walked
// top-to-bottom, click mapped into natural pixel space, cached alpha
// arrays consulted; transparent pixels fall through.
//
// Fusion: objects with `partOf` belong to a FusionSpec. When all parts of
// a fusion are found, a restoration plays: the body appears on a dimmed
// stage, the head descends to the neck, seats with a squeeze (the squeeze
// is canon: it is how you get a doll's head back on), and the two-part
// composite crossfades into the undivided original artwork — the seam
// disappears because the original never had one. The restored doll then
// stands in the room.

import './house.css';
import {
  ALPHA_THRESHOLD,
  ROOMS,
  FusionSpec,
  RoomSpec,
  Spot,
  HiddenObjectKind,
  HIDDEN_OBJECT_KINDS,
  KindMeta,
  COUNTABLE_KINDS,
  NamedSpec,
  AlmondSpec,
  KeySpec,
  PaperSpec,
  AnyHiddenObjectSpec,
  BUNNY_LIVE_IMAGE,
  ROAR_SOUND,
  MUSIC_BOX_SOUND,
  PICTURE_RESTORED_IMAGE,
  POEM_CONTENT,
} from './house.constants';
import { renderMarkdown } from './markdown';
import { initSoundToggle } from './effects/sound-toggle';
import { startWindAmbience, stopWindAmbience } from './effects/wind';
import { showVirusModal } from './effects/virus-modal';
import { showMap } from './rooms/map';
import {
  chooseRequests,
  isFinalPass,
  messProgress,
  roundSatisfied,
} from './rooms/requests';
import { playTransition, nextMirrorFragment } from './transitions/collage';
import { mountMice } from './mice/mice';
import { ensureSchema } from './state/store';
import {
  collect,
  freezeMessTotal,
  readInventory,
  readRoomState,
  recordFound,
  recordRequested,
  recordSpots,
  recordVisit,
} from './state/inventory';
import { InventorySlot, StoredSpot } from './state/state.constants';
import { rememberedSpot, sameSpot } from './rooms/placement';
import { EMPTY_ROOM_STATE, HOUSE_CONFIG, RoomState } from './state/state.constants';

const FOUND_MESSAGE_PLACEHOLDER = '[a message not yet written]';
/** how long "Nothing here is abandoned now." stays up before the room changes */
const ROOM_COMPLETE_PAUSE_MS = 1800;
/** beat between a room appearing and a doll it can now assemble coming together */
const FUSION_ON_ENTRY_DELAY_MS = 1200;
const POEM_PLACEHOLDER = { title: '(untitled)', body: 'No poem has been placed here yet.' };

interface LiveObject {
  spec: AnyHiddenObjectSpec;
  spot: Spot;
  element: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  alpha: Uint8ClampedArray;
  found: boolean;
}

/** False when ensureSchema() reported 'future' — the stored state was written
 *  by a NEWER build than this one. The three sites deploy independently, so an
 *  older /house/ can meet state written by a newer /in/. We read nothing and
 *  write nothing in that case rather than trampling a save we don't understand.
 *  See the schema table in doc-house-state.md. */
let persistence = true;

const state = {
  room: null as RoomSpec | null,
  objects: [] as LiveObject[],
  container: null as HTMLDivElement | null,
  fusionsDone: new Set<string>(),
  /** Inventory.dollParts, cached for the current room. Doll pieces are the one
   *  kind of object a room has to know about without containing. */
  dollParts: new Set<string>(),
  cutscenePlaying: false,
  /** ids this visit has been asked for, in the order they were asked. Empty in
   *  final-pass mode, when the room stops naming things and just counts. */
  requestedNow: [] as string[],
  /** rounds of three issued so far this visit */
  roundsThisVisit: 0,
  finalPass: false,
};

/** Every object's artwork, addressed by id across ALL rooms. A fusion needs to
 *  draw a head that may have been found three rooms ago and is not in
 *  state.objects, so it cannot look the image up from what is on screen. */
const OBJECT_IMAGES = new Map<string, string>(
  ROOMS.flatMap((room) => room.objects.map((spec) => [spec.id, spec.image] as const)),
);

// ---------------------------------------------------------------- alpha ---

function cacheAlpha(img: HTMLImageElement): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2d context unavailable');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ------------------------------------------------------------- geometry ---

function layoutRect(obj: LiveObject) {
  const roomRect = state.container!.getBoundingClientRect();
  const w = obj.spot.width * roomRect.width;
  const h = w * (obj.naturalHeight / obj.naturalWidth);
  const cx = roomRect.left + obj.spot.x * roomRect.width;
  const cy = roomRect.top + obj.spot.y * roomRect.height;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, cx, cy };
}

function hits(obj: LiveObject, clientX: number, clientY: number): boolean {
  const rect = layoutRect(obj);
  let x = clientX;
  let y = clientY;
  const theta = ((obj.spot.rotation ?? 0) * Math.PI) / 180;
  if (theta !== 0) {
    const dx = clientX - rect.cx;
    const dy = clientY - rect.cy;
    x = rect.cx + dx * Math.cos(-theta) - dy * Math.sin(-theta);
    y = rect.cy + dx * Math.sin(-theta) + dy * Math.cos(-theta);
  }
  if (x < rect.left || x >= rect.left + rect.width) return false;
  if (y < rect.top || y >= rect.top + rect.height) return false;
  const px = Math.floor(((x - rect.left) / rect.width) * obj.naturalWidth);
  const py = Math.floor(((y - rect.top) / rect.height) * obj.naturalHeight);
  return obj.alpha[py * obj.naturalWidth + px] > ALPHA_THRESHOLD;
}

// ------------------------------------------------------------------ DOM ---

function shuffled<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Fraction-space rectangle in the top-right corner reserved for the
 *  to-find panel; free-floating spots stay clear of it. */
const PANEL_EXCLUSION_ZONE = { minX: 0.8, maxY: 0.22 };

/** How close (in spot-fraction units) a candidate spot may land to a point
 *  being avoided — used to keep the wind from dropping a scrap back under
 *  the cursor that just clicked one away. */
const SCRAP_AVOID_RADIUS = 0.06;

/** A free-floating random spot, resampled if it would land in the
 *  to-find panel's top-right corner — the one part of the screen a
 *  fully random position can't be authored away from — or, if `avoid` is
 *  given, too close to that point. */
function randomSpot(avoid?: { x: number; y: number }): Spot {
  let x: number, y: number;
  do {
    x = Math.random();
    y = Math.random();
  } while (
    (x > PANEL_EXCLUSION_ZONE.minX && y < PANEL_EXCLUSION_ZONE.maxY) ||
    (avoid !== undefined && Math.hypot(x - avoid.x, y - avoid.y) < SCRAP_AVOID_RADIUS)
  );
  return { x, y, width: 0.04 };
}

/** Assigns every object in a room a Spot, keyed by object id.
 *
 *  - 'individualSpotLists' (named): one of the object's own spots, chosen
 *    at random.
 *  - 'random' (scrap): a free-floating random position.
 *  - 'sharedSpotList' (paper, almond, key): the room supplies one pool of
 *    spots per kind (`room.sharedSpots[kind]`); the pool is shuffled and
 *    handed out one spot per object of that kind, so within a room no two
 *    objects of the same kind ever land on the same spot. The pool must
 *    have at least as many spots as there are objects of that kind in the
 *    room — this throws early if a room is under-provisioned rather than
 *    silently reusing a spot.
 */
function assignSpots(room: RoomSpec): Map<string, Spot> {
  const assigned = new Map<string, Spot>();

  // HOUSE_CONFIG.persistObjectPositions — an object sits where it sat last
  // visit, rather than the room re-rolling on every entry. Expect this to look
  // like a bug the first time you see it: the room stops re-shuffling.
  //
  // Deliberately NOT applied to the 'random' strategy, which today is only the
  // balcony's scraps. Those are authored to blow around — reshuffleScraps()
  // moves them on every click — so pinning them would fight the room's whole
  // character. If that carve-out ever stops being right, this is the only
  // place it lives.
  const remembering = persistence && HOUSE_CONFIG.persistObjectPositions;
  const stored = remembering ? (readRoomState(room.id).spots ?? {}) : {};

  const sharedPoolKinds = new Set<HiddenObjectKind>();
  for (const spec of room.objects) {
    if (HIDDEN_OBJECT_KINDS[spec.kind].placementStrategy === 'sharedSpotList') {
      sharedPoolKinds.add(spec.kind);
    }
  }

  for (const kind of sharedPoolKinds) {
    const objectsOfKind = room.objects.filter((o) => o.kind === kind);
    const pool = room.sharedSpots?.[kind] ?? [];
    if (pool.length < objectsOfKind.length) {
      throw new Error(
        `Room "${room.id}" has ${objectsOfKind.length} objects of kind ` +
          `"${kind}" but only ${pool.length} shared spots for them.`,
      );
    }
    // Hand back remembered spots first, then deal the rest of the pool out
    // among whoever is left. Taking the remembered ones out of circulation is
    // what stops a newly-added object landing on top of one — the case that
    // arises the moment a room gains an object after a player has visited it.
    const taken: Spot[] = [];
    const unplaced: typeof objectsOfKind = [];
    for (const spec of objectsOfKind) {
      const spot = rememberedSpot(stored, spec.id, pool);
      if (spot && !taken.some((t) => sameSpot(t, spot))) {
        assigned.set(spec.id, spot);
        taken.push(spot);
      } else {
        unplaced.push(spec);
      }
    }
    const free = shuffled(pool.filter((spot) => !taken.some((t) => sameSpot(t, spot))));
    unplaced.forEach((spec, i) => assigned.set(spec.id, free[i]));
  }

  for (const spec of room.objects) {
    if (assigned.has(spec.id)) continue;
    const strategy = HIDDEN_OBJECT_KINDS[spec.kind].placementStrategy;
    if (strategy === 'individualSpotLists') {
      const spots = (spec as NamedSpec).spots;
      const spot = rememberedSpot(stored, spec.id, spots);
      assigned.set(spec.id, spot ?? spots[Math.floor(Math.random() * spots.length)]);
    } else {
      assigned.set(spec.id, randomSpot());
    }
  }

  if (remembering) {
    const toStore: Record<string, StoredSpot> = {};
    for (const [id, spot] of assigned) {
      // Scraps are omitted on purpose — see the carve-out above.
      const strategy = HIDDEN_OBJECT_KINDS[
        room.objects.find((o) => o.id === id)!.kind
      ].placementStrategy;
      if (strategy === 'random') continue;
      toStore[id] = { x: spot.x, y: spot.y, width: spot.width, rotation: spot.rotation };
    }
    recordSpots(room.id, toStore);
  }

  return assigned;
}

function placeAtSpot(
  element: HTMLElement,
  spot: Spot,
  naturalWidth: number,
  naturalHeight: number,
): void {
  element.style.left = `${(spot.x - spot.width / 2) * 100}%`;
  element.style.width = `${spot.width * 100}%`;
  const heightFraction =
    spot.width * (naturalHeight / naturalWidth) * state.room!.aspectRatio;
  element.style.top = `${(spot.y - heightFraction / 2) * 100}%`;
  element.style.transform = spot.rotation ? `rotate(${spot.rotation}deg)` : '';
}

/** The balcony's scraps are meant to be blowing in the wind, not sitting
 *  still once placed: every time one is clicked, the rest drift to a new
 *  spot. A scrap already near the click point — the one just found, or
 *  another one stacked near it — is left alone, and no scrap is moved to
 *  a new spot near the click point either. */
function reshuffleScraps(clientX: number, clientY: number): void {
  const roomRect = state.container!.getBoundingClientRect();
  const avoid = {
    x: (clientX - roomRect.left) / roomRect.width,
    y: (clientY - roomRect.top) / roomRect.height,
  };
  for (const obj of state.objects) {
    if (obj.spec.kind !== 'scrap' || obj.found) continue;
    if (Math.hypot(obj.spot.x - avoid.x, obj.spot.y - avoid.y) < SCRAP_AVOID_RADIUS) continue;
    obj.spot = randomSpot(avoid);
    placeAtSpot(obj.element, obj.spot, obj.naturalWidth, obj.naturalHeight);
  }
}

function sizeRoomToViewport(): void {
  if (!state.container || !state.room) return;
  const aspect = state.room.aspectRatio;
  let w = window.innerWidth;
  let h = w / aspect;
  if (h > window.innerHeight) {
    h = window.innerHeight;
    w = h * aspect;
  }
  state.container.style.width = `${w}px`;
  state.container.style.height = `${h}px`;
}

function missRipple(clientX: number, clientY: number): void {
  const ripple = document.createElement('div');
  ripple.className = 'house miss-ripple';
  ripple.style.left = `${clientX}px`;
  ripple.style.top = `${clientY}px`;
  document.body.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

function showFoundMessage(obj: LiveObject, message: string): void {
  const text = message || FOUND_MESSAGE_PLACEHOLDER;
  console.log(text);

  const rect = layoutRect(obj);
  const bubble = document.createElement('div');
  bubble.className = 'house almond-message';
  bubble.style.left = `${rect.cx}px`;
  bubble.style.top = `${rect.top}px`;
  bubble.textContent = text;
  document.body.appendChild(bubble);
  bubble.addEventListener('animationend', () => bubble.remove());
}

function openPaperModal(obj: LiveObject): void {
  const poem = POEM_CONTENT[(obj.spec as PaperSpec).poemId] ?? POEM_PLACEHOLDER;
  state.cutscenePlaying = true;

  const overlay = document.createElement('div');
  overlay.className = 'house';
  overlay.id = 'paper-overlay';

  const card = document.createElement('div');
  card.id = 'paper-card';

  const closeButton = document.createElement('button');
  closeButton.id = 'paper-close';
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';

  const title = document.createElement('h2');
  title.textContent = poem.title;

  const body = document.createElement('div');
  body.className = 'poem-body';
  body.innerHTML = renderMarkdown(poem.body);

  card.append(closeButton, title, body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    state.cutscenePlaying = false;
  };
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  requestAnimationFrame(() => overlay.classList.add('visible'));
}

// ------------------------------------------------------------- find flow --

function fusionFor(obj: LiveObject): FusionSpec | undefined {
  return state.room!.fusions.find((f) => f.id === (obj.spec as NamedSpec).partOf);
}

/** A fusion may only run when every part it DECLARES is in the player's hands,
 *  and when this is the room that owns the fusion.
 *
 *  Both halves matter. Asking the ROOM which parts are found was the old bug:
 *  three of the four dolls keep their head in a different room from their
 *  body, so "is everything I can see found?" was vacuously true for a body on
 *  its own, and runFusion() then dereferenced a head that wasn't there.
 *  Asking the INVENTORY fixes that and finally lets a doll be assembled from
 *  pieces gathered across the house.
 *
 *  The room half is the design decision: a doll comes together where the
 *  dollhouse is. You find the head in the spare room and nothing happens; you
 *  carry it back to the children's bedroom, and the doll is made whole there.
 *  This falls out of the data for free, because a FusionSpec belongs to a room
 *  and its restoredSpot is authored in that room's coordinates. */
function fusionReady(f: FusionSpec): boolean {
  if (f.fusesOnCompletion === false) return false;
  return f.partIds.every((id) => state.dollParts.has(id));
}

function allFound(): boolean {
  return (
    state.objects.every((o) => o.found) &&
    state.room!.fusions.every((f) => state.fusionsDone.has(f.id))
  );
}

/** The kind's own display name (e.g. 'paper' -> 'paper ball'), falling
 *  back to the kind id when no display name is authored (e.g. 'key'). */
function kindLabel(kind: HiddenObjectKind): string {
  return (HIDDEN_OBJECT_KINDS[kind] as KindMeta).displayName ?? kind;
}

/** Strips a leading "the " for alphabetising — the only article that
 *  shows up across the authored names; see house-briefs/B-bugfix-batch.md. */
function sortKey(name: string): string {
  return name.replace(/^the\s+/i, '').toLowerCase();
}

function updateCounter(kind: HiddenObjectKind) {
  const objectsOfKind = state.objects.filter((o) => o.spec.kind === kind);
  const counter = document.getElementById(`${kind}-count`);
  if (counter && objectsOfKind.length > 0)  {
    const found = objectsOfKind.filter((b) => b.found).length;
    counter.textContent = `${kindLabel(kind)}s — ${found} of ${objectsOfKind.length}`;
  }
}

/** Whether an object gets its own line in the to-find panel.
 *
 *  A doll part is normally listed under its fusion instead of by name — but
 *  only in the room that OWNS that fusion. Three of the four heads, and the
 *  gorilla's body, sit in rooms that own no fusion of theirs, so skipping
 *  every part unconditionally left them listed nowhere at all: no name to
 *  hunt for, no fusion line, no acknowledgement they existed. Since
 *  allFound() still counted them, four of the five rooms could not be
 *  completed and the player was stuck in whichever one they reached first.
 *
 *  The gorilla is the permanent case rather than an oversight: he has no
 *  FusionSpec anywhere, on purpose, so his pieces are always listed by name. */
function isListedByName(spec: AnyHiddenObjectSpec, room: RoomSpec): boolean {
  if (spec.kind !== 'named') return false;
  const partOf = (spec as NamedSpec).partOf;
  if (!partOf) return true;
  return !room.fusions.some((f) => f.id === partOf);
}


/** The room's persisted state, or an in-memory stand-in when persistence is
 *  off (a save written by a newer build — see openTheHouse). The stand-in
 *  covers this visit only, which is the best a read-only session can do, but
 *  it keeps the request loop and the mess counter working rather than freezing
 *  them at zero. */
function currentRoomState(room: RoomSpec): RoomState {
  if (persistence) return readRoomState(room.id);
  return {
    ...EMPTY_ROOM_STATE,
    found: state.objects.filter((o) => o.found).map((o) => o.spec.id),
    requested: [...state.requestedNow],
  };
}

/** The objects this room can name at the player: exactly the ones that get
 *  their own line in the panel. A doll part listed under its fusion is not
 *  asked for individually — the fusion is the thing being sought. */
function requestPool(room: RoomSpec): string[] {
  return room.objects.filter((spec) => isListedByName(spec, room)).map((spec) => spec.id);
}

/** Ask for the next few things, or discover there is nothing left to ask for
 *  and settle into the last pass. Returns nothing; the panel reads state. */
function issueRound(room: RoomSpec): void {
  const roomState = currentRoomState(room);
  const pool = requestPool(room);

  if (isFinalPass(pool, roomState)) {
    state.finalPass = true;
    state.requestedNow = [];
    const loose = room.objects.filter((o) => !roomState.found.includes(o.id)).length;
    if (persistence) freezeMessTotal(room.id, loose);
    return;
  }

  state.finalPass = false;
  state.requestedNow = chooseRequests(pool, roomState, HOUSE_CONFIG.requestsPerRound);
  state.roundsThisVisit += 1;
  if (persistence && state.requestedNow.length > 0) {
    recordRequested(room.id, state.requestedNow);
  }
}

function updateList(): void {
  const room = state.room;
  if (!room) return;

  // A satisfied round either hands out another few names or, if this visit has
  // had its share, leaves the player to wander off via the map in their own
  // time. Nothing ejects them: being thrown out of a room you were enjoying is
  // worse than being allowed to linger in one you have finished with.
  if (!state.finalPass && roundSatisfied(state.requestedNow, currentRoomState(room))) {
    if (state.roundsThisVisit < HOUSE_CONFIG.roundsPerVisit) issueRound(room);
    else state.requestedNow = [];
  }

  renderList();

  if (allFound()) {
    const banner = document.getElementById('all-found');
    if (banner) banner.classList.add('visible');
  }
}

/** The single seam every scene change in the game passes through
 *  (E-transition-collage.md). enterRoom() and showMap() are the two things
 *  that ever mount a scene; these two wrappers are the only callers of
 *  either that a player action reaches, everywhere in this file and in
 *  map.ts (which gets goToRoom handed to it as its onChoose callback, below
 *  and in openTheHouse()). playTransition() covers the screen with the
 *  drifting collage, calls the wrapped function while covered, and fades
 *  back in on whatever it built — see collage.ts for the timing and the
 *  skip behaviour. Fire-and-forget: nothing here needs to wait on a scene
 *  change finishing to keep running. */
function goToRoom(room: RoomSpec): void {
  void playTransition(() => enterRoom(room));
}

function goToMap(): void {
  void playTransition(() => showMap(goToRoom));
}

/** A room is finished. Show the banner long enough to read, then return to the
 *  map — the player chooses where to go next.
 *
 *  This replaces the cyclic enterRoom(ROOMS[i+1]) that used to fire from
 *  updateList(), which was a dev convenience rather than navigation
 *  (CLAUDE.md, Known Debt #2). It also has to fire only off the back of an
 *  ACTION that completed the room, never off the back of merely rendering it:
 *  updateList() runs on every entry, so once found-state persisted, advancing
 *  from there meant walking into a cleared room and being bounced straight out
 *  of it — with every room cleared, an infinite tour.
 *
 *  The pause happens first, banner visible and uncovered; the transition
 *  collage begins only after it, on the goToMap() call below — "banner ->
 *  hold -> fade -> collage -> next scene", per the brief. */
function maybeAdvance(): void {
  if (!allFound()) return;
  window.setTimeout(() => {
    if (state.room && allFound()) goToMap();
  }, ROOM_COMPLETE_PAUSE_MS);
}

// ----------------------------------------------------------- flourishes --
//
// Per-id effects independent of collection (notes.md): a handful of named
// objects do something extra on click, on top of the normal find-fade.
// Each flourish returns how many ms to hold the fade off for, so the
// flourish plays to completion before the object starts disappearing.

function playSound(src: string): void {
  const audio = new Audio(src);
  audio.play().catch(() => {}); // autoplay can be blocked; not worth surfacing
}

const FLOURISHES: Record<string, (obj: LiveObject) => number> = {
  'bunny-toy': flourishBunny,
  trex: flourishDinosaur,
  fairy: flourishFairy,
  'music-box': flourishMusicBox,
  mirror: flourishMirror,
  'broken-picture': flourishPicture,
  'thumb-drive': flourishVirus,
};

function flourishBunny(obj: LiveObject): number {
  const toyImage = obj.element.src;
  obj.element.src = BUNNY_LIVE_IMAGE;
  obj.element.classList.add('flourish-hop');
  window.setTimeout(() => {
    obj.element.src = toyImage;
    obj.element.classList.remove('flourish-hop');
  }, 900);
  return 950;
}

function flourishDinosaur(obj: LiveObject): number {
  playSound(ROAR_SOUND);
  obj.element.classList.add('flourish-roar');
  window.setTimeout(() => obj.element.classList.remove('flourish-roar'), 650);
  return 650;
}

function flourishFairy(obj: LiveObject): number {
  obj.element.classList.add('flourish-flutter');
  const rect = layoutRect(obj);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const dist = 16 + Math.random() * 14;
    const spark = document.createElement('div');
    spark.className = 'house fairy-spark';
    spark.style.left = `${rect.cx + Math.cos(angle) * dist}px`;
    spark.style.top = `${rect.cy + Math.sin(angle) * dist}px`;
    spark.style.animationDelay = `${i * 40}ms`;
    document.body.appendChild(spark);
    spark.addEventListener('animationend', () => spark.remove());
  }
  window.setTimeout(() => obj.element.classList.remove('flourish-flutter'), 800);
  return 800;
}

function flourishMusicBox(obj: LiveObject): number {
  playSound(MUSIC_BOX_SOUND);
  obj.element.classList.add('flourish-wiggle');
  const rect = layoutRect(obj);
  ['♪', '♫', '♪'].forEach((glyph, i) => {
    const note = document.createElement('div');
    note.className = 'house music-note';
    note.textContent = glyph;
    note.style.left = `${rect.cx + (i - 1) * 10}px`;
    note.style.top = `${rect.top}px`;
    note.style.animationDelay = `${i * 180}ms`;
    document.body.appendChild(note);
    note.addEventListener('animationend', () => note.remove());
  });
  window.setTimeout(() => obj.element.classList.remove('flourish-wiggle'), 1400);
  return 1400;
}

/** The mirror's white flash, and — new here — one line briefly revealed
 *  inside it. Jenny's register, not the fossil's: see the register-split
 *  comment atop transitions/collage.ts for why the mirror draws from its own
 *  separate pool rather than the one the scene transitions use. One fragment
 *  at a time, cycling in order (nextMirrorFragment), so a player who clicks
 *  the mirror repeatedly gets a legible sequence instead of noise. */
function flourishMirror(obj: LiveObject): number {
  const flash = document.createElement('div');
  flash.className = 'house mirror-flash';
  state.container!.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());

  const rect = layoutRect(obj);
  const text = document.createElement('div');
  text.className = 'house mirror-flash-text';
  text.textContent = nextMirrorFragment();
  text.style.left = `${rect.cx}px`;
  text.style.top = `${rect.cy}px`;
  document.body.appendChild(text);
  text.addEventListener('animationend', () => text.remove());

  return 700;
}

/** Crossfades the broken picture to its restored self and back, without
 *  touching obj.element (which is about to run the ordinary found-fade).
 *  A second image is laid directly over it at the same rect and rotation,
 *  faded in then out via one keyframe animation — a true two-image
 *  crossfade rather than an instant src swap. Until real restored art
 *  lands, PICTURE_RESTORED_IMAGE is a duplicate of the broken art, so this
 *  plays as a no-op flicker; see house.constants.ts. */
/** The sketchy thumb drive does what a sketchy thumb drive does. Returns 0:
 *  the popup is its own full-screen event that the player dismisses, so there
 *  is no reason to hold the thumb drive's find-fade behind it. */
function flourishVirus(): number {
  showVirusModal();
  return 0;
}

function flourishPicture(obj: LiveObject): number {
  const rect = layoutRect(obj);
  const overlay = document.createElement('img');
  overlay.src = PICTURE_RESTORED_IMAGE;
  overlay.alt = '';
  overlay.className = 'house picture-crossfade';
  // The two drawings are not the same shape — the broken one is nearly square
  // because the picture is escaping its frame, the whole one is taller than it
  // is wide. Matching the broken art's box exactly would squash the restored
  // picture, so it takes the same width and centre and keeps its own height
  // (left to CSS as `height: auto`). Rotation has to be composed with the
  // centring translate rather than replacing it.
  const spin = obj.spot.rotation ? ` rotate(${obj.spot.rotation}deg)` : '';
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.cy}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.transform = `translateY(-50%)${spin}`;
  document.body.appendChild(overlay);
  overlay.addEventListener('animationend', () => overlay.remove());
  return 2200;
}

/** What, if anything, a found object puts in the player's pockets.
 *
 *  Named one-offs put nothing there — tidying the plunger away is the whole
 *  of that transaction. The repeating kinds are the ones that accumulate, and
 *  a paper is carried as its POEM, not as the ball it was crumpled into.
 *
 *  The ids written here are the ids /in/ will match on, so they are the object
 *  ids exactly as authored: `key-1`…`key-16`, hyphenated. (`key-13` is absent
 *  from the house on purpose — it is found in Jennie's room in /in/, which
 *  grants it with grantKeys().) */
function inventoryEntryFor(
  spec: AnyHiddenObjectSpec,
): { slot: InventorySlot; id: string } | null {
  switch (spec.kind) {
    case 'key':
      return { slot: 'keys', id: spec.id };
    case 'almond':
      return { slot: 'almonds', id: spec.id };
    case 'paper':
      return { slot: 'papers', id: (spec as PaperSpec).poemId };
    case 'scrap':
      return { slot: 'scraps', id: spec.id };
    default:
      return null;
  }
}

function find(obj: LiveObject): void {
  obj.found = true;
  // Doll pieces are tracked in memory whether or not we are persisting, so a
  // read-only session can still assemble what it finds within that session.
  const isDollPart = obj.spec.kind === 'named' && (obj.spec as NamedSpec).partOf;
  if (isDollPart) state.dollParts.add(obj.spec.id);

  if (persistence) {
    recordFound(state.room!.id, obj.spec.id);
    // Doll pieces go into the inventory as well as the room, because they are
    // the one kind of object whose meaning outlives the room it was found in:
    // the bodies are in the children's bedroom and three of the four heads are
    // not. They also cross to /in/ — see doc-house-state.md on the gorilla.
    if (isDollPart) collect('dollParts', obj.spec.id);
    const carried = inventoryEntryFor(obj.spec);
    if (carried) collect(carried.slot, carried.id);
  }
  const delay = FLOURISHES[obj.spec.id]?.(obj) ?? 0;

  window.setTimeout(() => {
    obj.element.classList.add('being-found');
    obj.element.addEventListener(
      'transitionend',
      () => obj.element.classList.add('is-found'),
      { once: true },
    );
    updateList();

    if (obj.spec.kind === 'almond') showFoundMessage(obj, (obj.spec as AlmondSpec).message);
    if (obj.spec.kind === 'key') showFoundMessage(obj, (obj.spec as KeySpec).message);
    if (obj.spec.kind === 'paper') openPaperModal(obj);

    const f = fusionFor(obj);
    if (f && !state.fusionsDone.has(f.id) && fusionReady(f)) {
      window.setTimeout(() => void runReadyFusions(state.room!), 900);
      return; // the fusion's own completion decides whether the room is done
    }
    maybeAdvance();
  }, delay);
}

function onRoomClick(event: MouseEvent): void {
  if (state.cutscenePlaying) return;
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];
    if (obj.found) continue;
    if (hits(obj, event.clientX, event.clientY)) {
      find(obj);
      if (obj.spec.kind === 'scrap') reshuffleScraps(event.clientX, event.clientY);
      return;
    }
  }
  missRipple(event.clientX, event.clientY);
}

// -------------------------------------------------------------- fusion ---

async function runFusion(f: FusionSpec): Promise<void> {
  state.cutscenePlaying = true;

  const bodySrc = OBJECT_IMAGES.get(f.partIds[0]);
  const headSrc = OBJECT_IMAGES.get(f.partIds[1]);
  if (!bodySrc || !headSrc) {
    // A fusion naming a part no room contains is an authoring error. Say so
    // and stand down — the last thing that dereferenced a missing part left
    // cutscenePlaying stuck true and killed the room.
    console.warn(`[house] fusion "${f.id}" names a part no room contains; skipping`);
    state.cutscenePlaying = false;
    return;
  }

  const [assembled, bodyImg, headImg] = await Promise.all([
    loadImage(f.assembled),
    loadImage(bodySrc),
    loadImage(headSrc),
  ]);

  const overlay = document.createElement('div');
  overlay.className = 'house';
  overlay.id = 'fusion-overlay';

  // stage box sized from the assembled artwork
  const stageH = Math.min(window.innerHeight * 0.62, 640);
  const s = stageH / assembled.naturalHeight;
  const stageW = assembled.naturalWidth * s;
  const stage = document.createElement('div');
  stage.id = 'fusion-stage';
  stage.style.width = `${stageW}px`;
  stage.style.height = `${stageH}px`;

  // body: bottom-aligned with the assembled artwork (they share feet)
  const body = document.createElement('img');
  body.src = bodyImg.src;
  body.className = 'fusion-piece';
  body.style.width = `${bodyImg.naturalWidth * s}px`;
  body.style.left = `${(stageW - bodyImg.naturalWidth * s) / 2}px`;
  body.style.bottom = '0';

  // head: starts above the stage, descends to the neck
  const headW = headImg.naturalWidth * s;
  const headH = headImg.naturalHeight * s;
  const head = document.createElement('img');
  head.src = headImg.src;
  head.className = 'fusion-piece fusion-head';
  head.style.width = `${headW}px`;
  head.style.left = `${f.headLanding.x * stageW - headW / 2}px`;
  head.style.top = `${f.headLanding.y * stageH - headH / 2}px`;
  head.style.transform = `translateY(${-stageH * 0.38}px)`;
  head.style.opacity = '0';

  const whole = document.createElement('img');
  whole.src = assembled.src;
  whole.id = 'fusion-whole';
  whole.style.width = `${stageW}px`;

  const glow = document.createElement('div');
  glow.id = 'fusion-glow';

  const caption = document.createElement('div');
  caption.id = 'fusion-caption';
  caption.textContent = f.name;

  stage.append(glow, body, head, whole);
  overlay.append(stage, caption);
  document.body.appendChild(overlay);

  // sequence
  requestAnimationFrame(() => overlay.classList.add('visible'));
  window.setTimeout(() => {
    head.style.opacity = '1';
    head.style.transform = 'translateY(0)';
  }, 550);
  window.setTimeout(() => head.classList.add('seating'), 1250); // the squeeze
  window.setTimeout(() => {
    overlay.classList.add('fused');
    glow.classList.add('pulse');
  }, 1750);
  window.setTimeout(() => {
    caption.classList.add('visible');
    overlay.addEventListener(
      'click',
      () => {
        overlay.classList.remove('visible');
        overlay.addEventListener('transitionend', () => overlay.remove(), {
          once: true,
        });
        restoreDoll(f, assembled);
      },
      { once: true },
    );
  }, 2500);
}

/** Put a whole doll in the room at its authored spot. Used both at the end of
 *  the fusion cutscene and on re-entering a room where the doll already
 *  stands — a doll you assembled last visit is still there this visit. */
function standDoll(f: FusionSpec, assembled: HTMLImageElement): void {
  const doll = document.createElement('img');
  doll.src = assembled.src;
  doll.className = 'restored-doll';
  doll.alt = f.name;
  placeAtSpot(doll, f.restoredSpot, assembled.naturalWidth, assembled.naturalHeight);
  state.container!.appendChild(doll);
  requestAnimationFrame(() => doll.classList.add('standing'));
}

/** Run any fusion this room owns whose parts are all in hand. Sequential and
 *  guarded, because two cutscenes at once would fight over the overlay. Called
 *  on entering a room — carrying the last piece home is itself the trigger —
 *  and after finding a piece in the room that owns the fusion. */
async function runReadyFusions(room: RoomSpec): Promise<boolean> {
  // Call sites are delayed, so the player may have left in the meantime; a
  // cutscene staged into a room that is no longer on screen would place its
  // doll against the wrong geometry.
  if (state.room !== room) return false;
  for (const f of room.fusions) {
    if (state.cutscenePlaying) return false;
    if (state.fusionsDone.has(f.id)) continue;
    if (!fusionReady(f)) continue;
    await runFusion(f);
    // One at a time: runFusion hands control to the player, and restoreDoll
    // comes back here when they dismiss it, so a backlog drains one cutscene
    // per click instead of stacking overlays.
    return true;
  }
  return false;
}

function restoreDoll(f: FusionSpec, assembled: HTMLImageElement): void {
  standDoll(f, assembled);
  state.fusionsDone.add(f.id);
  if (persistence) collect('dolls', f.id);
  state.cutscenePlaying = false;
  updateList();
  // Another doll may have been ready all along and waiting its turn. Only
  // consider the room finished once nothing else wants to come together.
  const room = state.room!;
  void runReadyFusions(room).then((ran) => {
    if (!ran) maybeAdvance();
  });
}

/** Re-seat dolls assembled on an earlier visit. Deliberately fire-and-forget:
 *  a doll that fails to load is a doll that is missing from the corner of a
 *  room, not a reason to fail entering it. */
async function standRestoredDolls(room: RoomSpec): Promise<void> {
  for (const f of room.fusions) {
    if (!state.fusionsDone.has(f.id)) continue;
    try {
      standDoll(f, await loadImage(f.assembled));
    } catch {
      /* the doll simply isn't there */
    }
  }
}

// ---------------------------------------------------------------- build ---

function buildList(room: RoomSpec): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'house';
  panel.id = 'to-find';

  const heading = document.createElement('h1');
  heading.textContent = room.name;
  panel.appendChild(heading);

  // Filled by renderList() on every change, because what belongs in it depends
  // on whether the room is still naming things or has settled into its last
  // pass — and that can flip mid-visit, the moment the last nameable object
  // is asked for.
  const ul = document.createElement('ul');
  ul.id = 'to-find-list';
  panel.appendChild(ul);

  const banner = document.createElement('div');
  banner.id = 'all-found';
  banner.textContent = 'Nothing here is abandoned now.';
  panel.appendChild(banner);

  const back = document.createElement('button');
  back.type = 'button';
  back.id = 'to-the-map';
  back.textContent = 'the rest of the house';
  back.addEventListener('click', () => goToMap());
  panel.appendChild(back);

  return panel;
}

/** Renders the panel's list. Two modes.
 *
 *  While the room is still asking: only the few things it has asked for this
 *  visit. Not the whole inventory of the room — being handed forty names at
 *  once is the thing this replaces.
 *
 *  In the last pass: no names at all, just the size of what is left. The point
 *  of the final sweep is that you stop looking for particular objects and
 *  start tidying, so naming them would work against it.
 *
 *  Fusions and the kind-counters show in both modes: a doll being assembled is
 *  a goal that outlives any one round, and the counters are ambient. */
function renderList(): void {
  const ul = document.getElementById('to-find-list');
  const room = state.room;
  if (!ul || !room) return;
  ul.textContent = '';

  const entries: { key: string; li: HTMLLIElement }[] = [];

  if (state.finalPass) {
    const roomState = currentRoomState(room);
    const ids = room.objects.map((o) => o.id);
    const { tidied, total } = messProgress(ids, roomState, roomState.messTotal);
    const li = document.createElement('li');
    li.id = 'the-mess';
    li.textContent = `the mess — ${tidied} of ${total}`;
    ul.appendChild(li);
  } else {
    for (const id of state.requestedNow) {
      const spec = room.objects.find((o) => o.id === id);
      if (!spec) continue;
      const name = (spec as NamedSpec).name;
      const li = document.createElement('li');
      li.id = `to-find-${id}`;
      li.textContent = name;
      li.classList.toggle('found', state.objects.find((o) => o.spec.id === id)?.found ?? false);
      entries.push({ key: sortKey(name), li });
    }
  }

  for (const f of room.fusions) {
    const li = document.createElement('li');
    li.id = `to-find-fusion-${f.id}`;
    const foundCount = f.partIds.filter((id) => state.dollParts.has(id)).length;
    if (state.fusionsDone.has(f.id)) {
      li.textContent = f.name;
      li.classList.add('found');
    } else {
      // partIds.length, not the in-room subset: a doll whose head is three
      // rooms away still has two pieces.
      li.textContent = `${f.name} — ${foundCount} of ${f.partIds.length} pieces`;
    }
    entries.push({ key: sortKey(f.name), li });
  }

  // Alphabetised by the name actually shown, article stripped — see
  // house-briefs/B-bugfix-batch.md.
  entries.sort((a, b) => a.key.localeCompare(b.key));
  for (const { li } of entries) ul.appendChild(li);

  const counters = COUNTABLE_KINDS.map((k) => ({ key: kindLabel(k).toLowerCase(), kind: k }));
  counters.sort((a, b) => a.key.localeCompare(b.key));
  for (const { kind } of counters) {
    const li = document.createElement('li');
    li.id = `${kind}-count`;
    ul.appendChild(li);
  }
  COUNTABLE_KINDS.forEach((k) => updateCounter(k));
}

export async function enterRoom(room: RoomSpec): Promise<void> {
  let current = document.getElementsByClassName('house');
  while (current.length > 0) {
    current[0].remove();
  }
  state.room = room;
  // The wind belongs to the balcony and nowhere else, so it follows the room
  // rather than the page. The toggle in the corner can silence it.
  if (room.id === 'balcony') startWindAmbience();
  else stopWindAmbience();

  const container = document.createElement('div');
  container.className = 'house';
  container.id = 'house-room';
  state.container = container;

  const background = await loadImage(room.background);
  background.className = 'room-background';
  background.alt = room.name;
  background.draggable = false;
  container.appendChild(background);

  const images = await Promise.all(
    room.objects.map((spec) => loadImage(spec.image)),
  );

  const spots = assignSpots(room);

  // Persisted truth, read once per entry. state.objects[].found is a cache of
  // this from here on, not the source of it.
  const roomState = persistence ? recordVisit(room.id) : EMPTY_ROOM_STATE;
  const alreadyFound = new Set(roomState.found);

  // Dolls live in the inventory, not in the room: Inventory.dolls is the
  // record of what has been made whole anywhere, and fusionsDone is this
  // room's view of it.
  const inventory = persistence ? readInventory() : null;
  const dolls = new Set(inventory?.dolls ?? []);
  state.fusionsDone = new Set(room.fusions.filter((f) => dolls.has(f.id)).map((f) => f.id));
  // Parts persist across rooms; that is the whole point of them.
  state.dollParts = new Set(inventory?.dollParts ?? []);

  // A visit's requests are per-visit; the ledger of what has ever been asked
  // for is not, and lives in RoomState.requested.
  state.requestedNow = [];
  state.roundsThisVisit = 0;
  state.finalPass = false;

  state.objects = room.objects.map((spec, i) => {
    const img = images[i];
    const element = document.createElement('img');
    element.src = spec.image;
    element.alt = '';
    element.className = spec.kind === 'scrap' ? 'hidden-object scrap' : 'hidden-object';
    element.draggable = false;
    element.dataset.objectId = spec.id;
    const live: LiveObject = {
      spec,
      spot: spots.get(spec.id)!,
      element,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      alpha: cacheAlpha(img),
      found: alreadyFound.has(spec.id),
    };
    // Objects tidied on a previous visit are already gone when you walk in —
    // is-found directly, skipping being-found, so nothing plays its find
    // animation at you for a second time.
    if (live.found) element.classList.add('is-found');
    container.appendChild(element);
    return live;
  });

  document.body.appendChild(container);
  document.body.appendChild(buildList(room));
  // initSoundToggle appends for us. The toggle carries the 'house' class, so
  // it is torn down and rebuilt with everything else on a room change rather
  // than needing a lifecycle of its own.
  initSoundToggle();

  sizeRoomToViewport();
  for (const obj of state.objects)
    placeAtSpot(obj.element, obj.spot, obj.naturalWidth, obj.naturalHeight);
  window.addEventListener('resize', sizeRoomToViewport);
  container.addEventListener('click', onRoomClick);
  void mountMice(container, room);
  void standRestoredDolls(room);
  issueRound(room);
  renderList();
  // Walking in holding the last piece is itself the trigger. Delayed so the
  // room is on screen before the cutscene takes it away again.
  window.setTimeout(() => void runReadyFusions(room), FUSION_ON_ENTRY_DELAY_MS);
}
/** Boot. ensureSchema() runs before anything reads or writes state, so a
 *  stale save is dealt with once, up front, rather than half-read. */
function openTheHouse(): void {
  const outcome = ensureSchema();
  if (outcome === 'future') {
    persistence = false;
    console.log(
      'This browser is holding house state written by a newer version of ' +
        'Evernost than this one. Nothing will be saved this visit, and ' +
        'nothing already saved will be disturbed.',
    );
  }
  if (outcome === 'wiped') {
    console.log('The house has been rebuilt since you were last here. Starting over.');
  }
  // The map is the front door now. Shown directly, not through goToMap() —
  // there is no prior scene on screen yet for the collage to fade from, only
  // a blank page, so a transition here would just be a delay with nothing to
  // ease between. Choosing a room from this first map view still goes
  // through the collage, via goToRoom. To jump straight into a room while
  // working on it, call enterRoom(ROOMS[n]) here instead — the old dev
  // convenience, kept deliberately.
  showMap(goToRoom);
}

openTheHouse();
