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
  COUNTABLE_KINDS,
  NamedSpec,
  AnyHiddenObjectSpec,
} from './house.constants';

interface LiveObject {
  spec: AnyHiddenObjectSpec;
  spot: Spot;
  element: HTMLImageElement;
  naturalWidth: number;
  naturalHeight: number;
  alpha: Uint8ClampedArray;
  found: boolean;
}

const state = {
  room: null as RoomSpec | null,
  objects: [] as LiveObject[],
  container: null as HTMLDivElement | null,
  fusionsDone: new Set<string>(),
  cutscenePlaying: false,
};

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
    const pick = shuffled(pool);
    objectsOfKind.forEach((spec, i) => assigned.set(spec.id, pick[i]));
  }

  for (const spec of room.objects) {
    if (assigned.has(spec.id)) continue;
    const strategy = HIDDEN_OBJECT_KINDS[spec.kind].placementStrategy;
    if (strategy === 'individualSpotLists') {
      const spots = (spec as NamedSpec).spots;
      assigned.set(spec.id, spots[Math.floor(Math.random() * spots.length)]);
    } else {
      assigned.set(spec.id, { x: Math.random(), y: Math.random(), width: 0.04 });
    }
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

// ------------------------------------------------------------- find flow --

function fusionFor(obj: LiveObject): FusionSpec | undefined {
  return state.room!.fusions.find((f) => f.id === (obj.spec as NamedSpec).partOf);
}

function fusionParts(f: FusionSpec): LiveObject[] {
  return state.objects.filter((o) => (o.spec as NamedSpec).partOf === f.id);
}

function allFound(): boolean {
  return (
    state.objects.every((o) => o.found) &&
    state.room!.fusions.every((f) => state.fusionsDone.has(f.id))
  );
}

function updateCounter(kind: HiddenObjectKind) {
  const objectsOfKind = state.objects.filter((o) => o.spec.kind === kind);
  const counter = document.getElementById(`${kind}-count`);
  if (counter && objectsOfKind.length > 0)  {
    const found = objectsOfKind.filter((b) => b.found).length;
    counter.textContent = `${kind}s — ${found} of ${objectsOfKind.length}`;
  }
}

function updateList(): void {
  for (const obj of state.objects) {
    if (obj.spec.kind !== 'named' || obj.spec.partOf) continue;
    const li = document.getElementById(`to-find-${obj.spec.id}`);
    if (li) li.classList.toggle('found', obj.found);
  }
  for (const f of state.room!.fusions) {
    const li = document.getElementById(`to-find-fusion-${f.id}`);
    if (!li) continue;
    const parts = fusionParts(f);
    const foundCount = parts.filter((p) => p.found).length;
    if (state.fusionsDone.has(f.id)) {
      li.textContent = f.name;
      li.classList.add('found');
    } else {
      li.textContent = `${f.name} — ${foundCount} of ${parts.length} pieces`;
      li.classList.remove('found');
    }
  }
  COUNTABLE_KINDS.forEach((k) => updateCounter(k))
  
  if (allFound()) {
    const banner = document.getElementById('all-found');
    if (banner) banner.classList.add('visible');
    enterRoom(ROOMS[(ROOMS.indexOf(state.room ?? ROOMS[ROOMS.length - 1]) + 1) % ROOMS.length])
  }
}

function find(obj: LiveObject): void {
  obj.found = true;
  obj.element.classList.add('being-found');
  obj.element.addEventListener(
    'transitionend',
    () => obj.element.classList.add('is-found'),
    { once: true },
  );
  updateList();

  const f = fusionFor(obj);
  if (f && !state.fusionsDone.has(f.id)) {
    const parts = fusionParts(f);
    if (parts.every((p) => p.found)) {
      window.setTimeout(() => runFusion(f), 900);
    }
  }
}

function onRoomClick(event: MouseEvent): void {
  if (state.cutscenePlaying) return;
  for (let i = state.objects.length - 1; i >= 0; i--) {
    const obj = state.objects[i];
    if (obj.found) continue;
    if (hits(obj, event.clientX, event.clientY)) {
      find(obj);
      return;
    }
  }
  missRipple(event.clientX, event.clientY);
}

// -------------------------------------------------------------- fusion ---

async function runFusion(f: FusionSpec): Promise<void> {
  state.cutscenePlaying = true;

  const [assembled, bodyImg, headImg] = await Promise.all([
    loadImage(f.assembled),
    loadImage(state.objects.find((o) => o.spec.id === f.partIds[0])!.spec.image),
    loadImage(state.objects.find((o) => o.spec.id === f.partIds[1])!.spec.image),
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

function restoreDoll(f: FusionSpec, assembled: HTMLImageElement): void {
  const doll = document.createElement('img');
  doll.src = assembled.src;
  doll.className = 'restored-doll';
  doll.alt = f.name;
  placeAtSpot(doll, f.restoredSpot, assembled.naturalWidth, assembled.naturalHeight);
  state.container!.appendChild(doll);
  requestAnimationFrame(() => doll.classList.add('standing'));
  state.fusionsDone.add(f.id);
  state.cutscenePlaying = false;
  updateList();
}

// ---------------------------------------------------------------- build ---

function buildList(room: RoomSpec): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'house';
  panel.id = 'to-find';
  const heading = document.createElement('h1');
  heading.textContent = room.name;
  panel.appendChild(heading);
  const ul = document.createElement('ul');
  for (const spec of room.objects) {
    if (spec.kind !== 'named' || spec.partOf) continue;
    const li = document.createElement('li');
    li.id = `to-find-${spec.id}`;
    li.textContent = (spec as NamedSpec).name;
    ul.appendChild(li);
  }
  for (const f of room.fusions) {
    const li = document.createElement('li');
    li.id = `to-find-fusion-${f.id}`;
    ul.appendChild(li);
  }

  COUNTABLE_KINDS.forEach((k) => {
    const counterForKind = document.createElement('li');
    counterForKind.id = `${k}-count`;
    ul.appendChild(counterForKind);
  });

  panel.appendChild(ul);

  const banner = document.createElement('div');
  banner.id = 'all-found';
  banner.textContent = 'Nothing here is abandoned now.';
  panel.appendChild(banner);
  return panel;
}

export async function enterRoom(room: RoomSpec): Promise<void> {
  let current = document.getElementsByClassName('house');
  while (current.length > 0) {
    current[0].remove();
  }
  state.room = room;
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

  state.objects = room.objects.map((spec, i) => {
    const img = images[i];
    const element = document.createElement('img');
    element.src = spec.image;
    element.alt = '';
    element.className = 'hidden-object';
    element.draggable = false;
    const live: LiveObject = {
      spec,
      spot: spots.get(spec.id)!,
      element,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      alpha: cacheAlpha(img),
      found: false,
    };
    container.appendChild(element);
    return live;
  });

  document.body.appendChild(container);
  document.body.appendChild(buildList(room));

  sizeRoomToViewport();
  for (const obj of state.objects)
    placeAtSpot(obj.element, obj.spot, obj.naturalWidth, obj.naturalHeight);
  window.addEventListener('resize', sizeRoomToViewport);
  container.addEventListener('click', onRoomClick);
  updateList();
}
// Choices at present: CHILDRENS_BEDROOM, MASTER_BATHROOM, BROOM_CLOSET, SPARE_ROOM, BALCONY, LADY_BATHROOM, MASTER_BEDROOM
enterRoom(ROOMS[1]);
