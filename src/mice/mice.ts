// mice.ts — the fauna layer: a mouse comes out of the wall, scurries between
// its haunts, takes an almond off the player and drops a piece of a This
// Thing card in the form of text particles.
//
// UNWIRED ON PURPOSE. house.ts does not import this file. Wiring it is one
// line at the end of enterRoom(), after the container is in the document:
//
//     mountMice(container, room);          // import { mountMice } from './mice/mice';
//
// and nothing else — no change to find(), onRoomClick(), updateList() or the
// state object. Everything this module needs from the game it either owns
// (its own click listener, its own animation loop) or reads from
// src/state/inventory.ts, which is the same interface the trunk will be
// writing almonds into. Until the trunk calls collect('almonds', id) in
// find(), the mice are visible and scurrying but every trade refuses with
// 'no-almonds', because the player's bag is genuinely empty.
//
// Layers: gait.ts is the arithmetic, trade.ts is the economy, this file is
// the only part that knows about pixels.

import {
  ALMOND_SCRAPS,
  ALPHA_THRESHOLD,
  AlmondSpec,
  FRAGMENT_TITLE_PLACEHOLDER,
  MICE,
  MOUSE_ART_FACES,
  MOUSE_DWELL_MS,
  MOUSE_FADE_MS,
  MOUSE_FRAMES,
  MOUSE_FRAME_MS,
  MOUSE_HAUNTS_PER_OUTING,
  MOUSE_HIDDEN_MS,
  MOUSE_HOLE_WIDTH_SCALE,
  MOUSE_NIBBLE_MS,
  MOUSE_STARTLE_SPEED,
  MOUSE_STEP,
  MOUSE_THOUGHT_IMAGE,
  MouseSpec,
  ROOMS,
  RoomSpec,
  THIS_THING_CARDS,
} from '../house.constants';
import { readInventory } from '../state/inventory';
import { Point, lerp, progress, randomBetween, routeThrough, step } from './gait';
import { CardScrap, ScrapLookup, TradeOffer, feedMouse, fragmentLabel, hasEverFedAMouse } from './trade';

// Presentation tuning that belongs to this effect and nothing else, kept
// here for the same reason the flourish timings live in house.ts. The two
// numbers the asset contract cares about — frame rate and step distance —
// are NOT here: they are MOUSE_FRAME_MS and MOUSE_STEP in house.constants.ts.
const PARTICLE_SPACING_PX = 11;
const PARTICLE_STAGGER_MS = 38;
const PARTICLE_RISE_PX = 14;

// --------------------------------------------------------------- images ---
//
// cacheAlpha/loadImage/layoutRect/hits are deliberate copies of the four
// helpers in house.ts. They are private there and house.ts belongs to another
// lane this week, so copying was cheaper than exporting; the day house.ts
// exports them, delete these and import instead. The hit-test arithmetic must
// stay identical to house.ts's — a mouse that hit-tests differently from the
// hidden objects is a bug the player will feel before anyone can name it.

interface Frame {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  alpha: Uint8ClampedArray;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

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

let framesPromise: Promise<Frame[]> | null = null;

/** Loaded once per session, not once per room: the frames are the same four
 *  images in every room, and re-caching their alpha on every room change is
 *  pure waste. */
function loadFrames(): Promise<Frame[]> {
  if (!framesPromise) {
    framesPromise = Promise.all(MOUSE_FRAMES.map(loadImage)).then((images) =>
      images.map((img) => ({
        src: img.src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        alpha: cacheAlpha(img),
      })),
    );
  }
  return framesPromise;
}

// ---------------------------------------------------------------- lookup ---

let scrapLookup: ScrapLookup | null = null;

/** almond id → This Thing card.
 *
 *  An AlmondSpec that carries its own `scrap` wins; ALMOND_SCRAPS is the
 *  fallback. That order is the placeholder policy made mechanical: when the
 *  almonds CSV lands it can be poured into either the per-object specs or the
 *  one table, and this resolves the same way. Built from ROOMS rather than
 *  from the current room because the player carries almonds between rooms —
 *  an almond found in the master bathroom is fed to the broom closet's mouse
 *  as readily as to its own. */
function buildScrapLookup(): ScrapLookup {
  const table = new Map<string, CardScrap>();
  for (const room of ROOMS) {
    for (const spec of room.objects) {
      if (spec.kind !== 'almond') continue;
      const authored = (spec as AlmondSpec).scrap;
      if (authored) table.set(spec.id, authored);
    }
  }
  return (almondId) => table.get(almondId) ?? ALMOND_SCRAPS[almondId];
}

function lookup(): ScrapLookup {
  if (!scrapLookup) scrapLookup = buildScrapLookup();
  return scrapLookup;
}

// ------------------------------------------------------------------ mice ---

type Phase = 'down-the-hole' | 'scurrying' | 'nibbling';

interface LiveMouse {
  spec: MouseSpec;
  element: HTMLImageElement;
  thought: HTMLDivElement | null;
  frames: Frame[];
  frameIndex: number;
  phase: Phase;
  /** current position, in the same fraction space as Spot */
  position: Point;
  /** where the current leg of the journey started, for width interpolation */
  origin: Point;
  target: Point;
  originWidth: number;
  targetWidth: number;
  /** haunt indices still to visit this outing */
  route: number[];
  /** nothing moves until performance.now() passes this */
  waitUntil: number;
  goingHome: boolean;
  /** multiplier on MOUSE_STEP — 1 strolling, MOUSE_STARTLE_SPEED bolting */
  speed: number;
  facing: 1 | -1;
}

const current = {
  container: null as HTMLDivElement | null,
  room: null as RoomSpec | null,
  mice: [] as LiveMouse[],
  timer: 0,
  wasConnected: false,
};

let listening = false;

/** Mount every mouse this room has. Safe to call on each enterRoom; the
 *  previous room's mice are torn down first. Rooms with no entry in MICE get
 *  no mice and no animation loop — the balcony's permanent condition. */
export async function mountMice(container: HTMLDivElement, room: RoomSpec): Promise<void> {
  unmountMice();
  const specs = MICE[room.id] ?? [];
  if (specs.length === 0) return;

  const frames = await loadFrames();
  // A room change while the frames were loading: the container we were handed
  // is stale, so drop it rather than seeding the new room with old mice.
  if (current.container !== null || !container.isConnected) return;

  current.container = container;
  current.room = room;
  current.wasConnected = container.isConnected;
  current.mice = specs.map((spec) => createMouse(spec, frames, container));

  ensureListening();
  current.timer = window.setInterval(tick, MOUSE_FRAME_MS);
}

export function unmountMice(): void {
  if (current.timer) window.clearInterval(current.timer);
  current.timer = 0;
  for (const mouse of current.mice) {
    mouse.element.remove();
    mouse.thought?.remove();
  }
  current.mice = [];
  current.container = null;
  current.room = null;
  current.wasConnected = false;
}

function createMouse(spec: MouseSpec, frames: Frame[], container: HTMLDivElement): LiveMouse {
  const element = document.createElement('img');
  element.className = 'house-mouse';
  element.src = frames[0].src;
  element.alt = '';
  element.draggable = false;
  // Timings come from the constants rather than the stylesheet so that the
  // gait is tuned in exactly one place; house.css says so too.
  element.style.transition =
    `left ${MOUSE_FRAME_MS}ms linear, top ${MOUSE_FRAME_MS}ms linear, ` +
    `width ${MOUSE_FRAME_MS}ms linear, opacity ${MOUSE_FADE_MS}ms ease`;
  container.appendChild(element);

  const hole = { x: spec.hole.x, y: spec.hole.y };
  const mouse: LiveMouse = {
    spec,
    element,
    thought: null,
    frames,
    frameIndex: 0,
    phase: 'down-the-hole',
    position: hole,
    origin: hole,
    target: hole,
    originWidth: holeWidth(spec),
    targetWidth: holeWidth(spec),
    route: [],
    waitUntil: performance.now() + randomBetween(MOUSE_HIDDEN_MS),
    goingHome: false,
    speed: 1,
    facing: 1,
  };
  render(mouse);
  return mouse;
}

/** A mouse at its hole is drawn smaller than at its nearest haunt, so it
 *  reads as half inside the wall rather than parked on the baseboard. */
function holeWidth(spec: MouseSpec): number {
  const first = spec.haunts[0];
  return (first ? first.width : 0.05) * MOUSE_HOLE_WIDTH_SCALE;
}

// ------------------------------------------------------------ the scurry ---

function tick(): void {
  const container = current.container;
  if (!container) return;
  if (current.wasConnected && !container.isConnected) {
    // the room was torn down under us (enterRoom removes every .house element)
    unmountMice();
    return;
  }
  current.wasConnected = current.wasConnected || container.isConnected;
  const now = performance.now();
  for (const mouse of current.mice) advance(mouse, now);
}

function advance(mouse: LiveMouse, now: number): void {
  if (now < mouse.waitUntil) return;

  if (mouse.phase === 'down-the-hole') {
    beginOuting(mouse, now);
    return;
  }
  if (mouse.phase === 'nibbling') return;

  const aspect = current.room?.aspectRatio ?? 1;
  const heading = mouse.target.x - mouse.position.x;
  if (Math.abs(heading) > 1e-6) mouse.facing = heading > 0 ? 1 : -1;

  const taken = step(mouse.position, mouse.target, MOUSE_STEP * mouse.speed, aspect);
  mouse.position = taken.position;
  mouse.frameIndex = (mouse.frameIndex + 1) % mouse.frames.length;
  render(mouse);

  if (taken.arrived) arrive(mouse, now);
}

function beginOuting(mouse: LiveMouse, now: number): void {
  const haunts = mouse.spec.haunts;
  if (haunts.length === 0) return; // a mouse with no haunts simply stays in
  mouse.route = routeThrough(haunts.length, randomBetween(MOUSE_HAUNTS_PER_OUTING));
  mouse.phase = 'scurrying';
  mouse.goingHome = false;
  mouse.speed = 1;
  mouse.position = { ...mouse.spec.hole };
  mouse.originWidth = holeWidth(mouse.spec);
  headFor(mouse, mouse.route.shift() ?? 0);
  mouse.element.classList.add('out');
  render(mouse);
  maybeShowThought(mouse);
  mouse.waitUntil = now;
}

function headFor(mouse: LiveMouse, hauntIndex: number): void {
  const haunt = mouse.spec.haunts[hauntIndex];
  mouse.origin = { ...mouse.position };
  mouse.originWidth = currentWidth(mouse);
  mouse.target = { x: haunt.x, y: haunt.y };
  mouse.targetWidth = haunt.width;
}

function headHome(mouse: LiveMouse, fast = false): void {
  mouse.origin = { ...mouse.position };
  mouse.originWidth = currentWidth(mouse);
  mouse.target = { ...mouse.spec.hole };
  mouse.targetWidth = holeWidth(mouse.spec);
  mouse.goingHome = true;
  mouse.route = [];
  mouse.phase = 'scurrying';
  mouse.speed = fast ? MOUSE_STARTLE_SPEED : 1;
  mouse.waitUntil = 0;
}

function arrive(mouse: LiveMouse, now: number): void {
  if (mouse.goingHome) {
    mouse.phase = 'down-the-hole';
    mouse.element.classList.remove('out');
    hideThought(mouse);
    mouse.waitUntil = now + MOUSE_FADE_MS + randomBetween(MOUSE_HIDDEN_MS);
    return;
  }
  const next = mouse.route.shift();
  if (next === undefined) {
    headHome(mouse);
    mouse.waitUntil = now + randomBetween(MOUSE_DWELL_MS);
    return;
  }
  headFor(mouse, next);
  // an almond picked up mid-outing still gets asked for, at the next pause
  maybeShowThought(mouse);
  mouse.waitUntil = now + randomBetween(MOUSE_DWELL_MS);
}

// ----------------------------------------------------------------- paint ---

function currentWidth(mouse: LiveMouse): number {
  const aspect = current.room?.aspectRatio ?? 1;
  const t = progress(mouse.origin, mouse.position, mouse.target, aspect);
  return lerp(mouse.originWidth, mouse.targetWidth, t);
}

function render(mouse: LiveMouse): void {
  const frame = mouse.frames[mouse.frameIndex];
  if (mouse.element.src !== frame.src) mouse.element.src = frame.src;

  const aspect = current.room?.aspectRatio ?? 1;
  const width = currentWidth(mouse);
  const heightFraction = width * (frame.naturalHeight / frame.naturalWidth) * aspect;
  mouse.element.style.left = `${(mouse.position.x - width / 2) * 100}%`;
  mouse.element.style.top = `${(mouse.position.y - heightFraction / 2) * 100}%`;
  mouse.element.style.width = `${width * 100}%`;
  // The art faces one way; travelling the other way mirrors it.
  const mirrored = MOUSE_ART_FACES === 'left' ? mouse.facing > 0 : mouse.facing < 0;
  mouse.element.style.transform = mirrored ? 'scaleX(-1)' : '';

  if (mouse.thought) {
    mouse.thought.style.left = `${mouse.position.x * 100}%`;
    mouse.thought.style.top = `${(mouse.position.y - heightFraction / 2) * 100}%`;
    mouse.thought.style.width = `${width * 0.85 * 100}%`;
  }
}

/** Where the mouse currently is, in screen coordinates — the anchor for the
 *  fragment particles, and the geometry the hit test inverts. */
function layoutRect(mouse: LiveMouse) {
  const roomRect = current.container!.getBoundingClientRect();
  const frame = mouse.frames[mouse.frameIndex];
  const w = currentWidth(mouse) * roomRect.width;
  const h = w * (frame.naturalHeight / frame.naturalWidth);
  const cx = roomRect.left + mouse.position.x * roomRect.width;
  const cy = roomRect.top + mouse.position.y * roomRect.height;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, cx, cy };
}

// ------------------------------------------------------------- the click ---
//
// Hit-testing is per-pixel alpha against the current frame, exactly as
// onRoomClick does it for hidden objects — the mouse element is
// pointer-events: none like everything else in the room, and a click that
// lands on a transparent pixel of the mouse falls through to the game.
//
// The listener is on `document` in the CAPTURE phase rather than on the room
// container. That is not decoration: house.ts's own listener is on the
// container, and two listeners on the SAME element fire in registration
// order regardless of capture flag, so a container listener could not
// reliably swallow a click before find() saw it. Capturing at the document
// means the mouse always gets first refusal, whatever order the wiring line
// ends up in. On a miss the event proceeds untouched and the game behaves
// exactly as it does today.

function ensureListening(): void {
  if (listening) return;
  document.addEventListener('click', onDocumentClickCapture, true);
  listening = true;
}

function onDocumentClickCapture(event: MouseEvent): void {
  const container = current.container;
  if (!container || !container.isConnected) return;
  // A modal or cutscene overlay on top of the room is the click's target
  // instead of the container, which is how this stays out of the way of
  // house.ts's cutscenePlaying flag without being able to see it.
  const target = event.target;
  if (!(target instanceof Node) || !container.contains(target)) return;

  for (let i = current.mice.length - 1; i >= 0; i--) {
    const mouse = current.mice[i];
    if (mouse.phase === 'down-the-hole' || mouse.phase === 'nibbling') continue;
    if (!hits(mouse, event.clientX, event.clientY)) continue;
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
    offerAlmond(mouse);
    return;
  }
}

function hits(mouse: LiveMouse, clientX: number, clientY: number): boolean {
  const rect = layoutRect(mouse);
  if (clientX < rect.left || clientX >= rect.left + rect.width) return false;
  if (clientY < rect.top || clientY >= rect.top + rect.height) return false;
  const frame = mouse.frames[mouse.frameIndex];
  let px = Math.floor(((clientX - rect.left) / rect.width) * frame.naturalWidth);
  const py = Math.floor(((clientY - rect.top) / rect.height) * frame.naturalHeight);
  // the sprite may be mirrored on screen; the alpha array never is
  const mirrored = mouse.element.style.transform === 'scaleX(-1)';
  if (mirrored) px = frame.naturalWidth - 1 - px;
  return frame.alpha[py * frame.naturalWidth + px] > ALPHA_THRESHOLD;
}

// ------------------------------------------------------------- the trade ---

function offerAlmond(mouse: LiveMouse): void {
  const plan = feedMouse(lookup());

  if (!plan.accepted) {
    // Nothing to give it, or nothing left it can give back. The mouse is
    // startled rather than silent: the click has to do SOMETHING, or a
    // player concludes the mouse is scenery.
    mouse.element.classList.add('startled');
    window.setTimeout(() => mouse.element.classList.remove('startled'), 320);
    headHome(mouse, true);
    return;
  }

  mouse.phase = 'nibbling';
  mouse.element.classList.add('nibbling');
  hideThought(mouse);

  window.setTimeout(() => {
    // the room may have been torn down mid-nibble; the fragment is already
    // banked in inventory, so there is nothing to undo, only nothing to draw
    if (!current.container || !current.mice.includes(mouse)) return;
    mouse.element.classList.remove('nibbling');
    revealFragment(mouse, plan.offer);
    // then it takes its almond and goes; the fragment is already banked
    headHome(mouse);
  }, MOUSE_NIBBLE_MS);
}

/** The fragment reveal: the card's title comes apart into letters that drift
 *  up off the mouse. Same register as flourishFairy/flourishMusicBox in
 *  house.ts — transient elements on document.body, class 'house' so a room
 *  change sweeps them away, removed on animationend. */
function revealFragment(mouse: LiveMouse, offer: TradeOffer): void {
  const card = THIS_THING_CARDS[offer.cardId];
  const label = fragmentLabel(card?.title ?? FRAGMENT_TITLE_PLACEHOLDER, offer);
  console.log(label);

  const rect = layoutRect(mouse);
  const characters = [...label];
  const spread = (characters.length - 1) * PARTICLE_SPACING_PX;
  characters.forEach((character, i) => {
    if (character === ' ') return;
    const particle = document.createElement('div');
    particle.className = 'house fragment-particle';
    particle.textContent = character;
    particle.style.left = `${rect.cx - spread / 2 + i * PARTICLE_SPACING_PX}px`;
    particle.style.top = `${rect.top - PARTICLE_RISE_PX}px`;
    particle.style.animationDelay = `${i * PARTICLE_STAGGER_MS}ms`;
    document.body.appendChild(particle);
    particle.addEventListener('animationend', () => particle.remove());
  });
}

// ---------------------------------------------------- the thought bubble ---
//
// "Almonds are for feeding mice" has to reach a first-time player, and
// notes.md leaves the choice open between a bubble on the mouse and one on
// the almond. It is on the MOUSE, it appears only while the player is
// actually carrying an almond, and it never appears again after the first
// successful trade.
//
// The almond's own found-message is already spoken for by Nora's authored
// AlmondSpec.message, and an almond in the pocket is inert anyway — the
// question "what is this for?" only becomes answerable when there is a mouse
// on the floor. Putting the ask on the creature that wants the thing makes
// it characterisation rather than UI, and gating it on actually holding one
// keeps the game from teaching a verb the player cannot yet perform.
// Retiring it after the first feeding keeps it from hardening into a HUD.
//
// "Ever fed a mouse" is derived from inventory (almondsSpent/artFragments),
// so it needs no new storage key and survives a reload for free.

function maybeShowThought(mouse: LiveMouse): void {
  if (mouse.thought) return;
  const inventory = readInventory();
  if (inventory.almonds.length === 0) return;
  if (hasEverFedAMouse(inventory)) return;

  const bubble = document.createElement('div');
  bubble.className = 'mouse-thought';
  const almond = document.createElement('img');
  almond.src = MOUSE_THOUGHT_IMAGE;
  almond.alt = '';
  almond.draggable = false;
  bubble.appendChild(almond);
  current.container?.appendChild(bubble);
  mouse.thought = bubble;
  render(mouse);
}

function hideThought(mouse: LiveMouse): void {
  mouse.thought?.remove();
  mouse.thought = null;
}
