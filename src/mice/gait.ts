// gait.ts — the arithmetic of a scurry, with no DOM and no assets in it.
//
// Split out of mice.ts for the same reason src/state/ is split out of
// house.constants.ts: this file can be bundled and run under node (see
// mice.selftest.ts), and mice.ts cannot, because it reaches for images.
//
// Everything here works in the game's fraction space — x is a fraction of the
// room's width, y a fraction of its height — which is NOT square. A step of
// 0.01 across is a much shorter distance on screen than a step of 0.01 down
// in a 16:9 room, so every distance in here is measured in width-units, with
// y converted by dividing by the room's aspect ratio. Forget that and mice
// sprint vertically and trudge horizontally.

export interface Point {
  x: number;
  y: number;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Screen distance between two fraction-space points, in width-units. */
export function distance(from: Point, to: Point, aspectRatio: number): number {
  const dx = to.x - from.x;
  const dy = (to.y - from.y) / aspectRatio;
  return Math.hypot(dx, dy);
}

export interface Step {
  position: Point;
  /** true when this step landed on (or overshot to) the target */
  arrived: boolean;
}

/** One leg frame's worth of movement from `position` towards `target`.
 *
 *  Overshoot is clamped rather than allowed, so the last step of a journey
 *  lands exactly on the haunt instead of jittering around it. A step of zero
 *  length (already there, or a zero step distance) reports arrival rather
 *  than dividing by zero. */
export function step(
  position: Point,
  target: Point,
  stepDistance: number,
  aspectRatio: number,
): Step {
  const remaining = distance(position, target, aspectRatio);
  if (remaining === 0 || stepDistance <= 0 || remaining <= stepDistance) {
    return { position: { x: target.x, y: target.y }, arrived: true };
  }
  const t = stepDistance / remaining;
  return {
    position: {
      x: lerp(position.x, target.x, t),
      y: lerp(position.y, target.y, t),
    },
    arrived: false,
  };
}

/** How far along a journey the mouse is, 0 at the start point and 1 at the
 *  target — used to interpolate the sprite's width, which is how perspective
 *  is carried between haunts drawn at different sizes. */
export function progress(
  from: Point,
  position: Point,
  target: Point,
  aspectRatio: number,
): number {
  const total = distance(from, target, aspectRatio);
  if (total === 0) return 1;
  return clamp01(distance(from, position, aspectRatio) / total);
}

/** Inclusive random integer in [min, max] — the ms ranges and haunt counts in
 *  house.constants.ts are all declared as tuples for this. */
export function randomBetween([min, max]: [number, number]): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** A walk through `count` haunts that never stands still: no haunt is chosen
 *  twice in a row, and the mouse does not simply shuttle between two of them
 *  if there are others to visit. Returns indices into the haunt list. */
export function routeThrough(hauntCount: number, count: number, roll = Math.random): number[] {
  if (hauntCount <= 0) return [];
  const route: number[] = [];
  let previous = -1;
  for (let i = 0; i < count; i++) {
    let next = Math.floor(roll() * hauntCount);
    if (next >= hauntCount) next = hauntCount - 1;
    if (next === previous && hauntCount > 1) next = (next + 1) % hauntCount;
    route.push(next);
    previous = next;
  }
  return route;
}
