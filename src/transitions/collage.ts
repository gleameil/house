// collage.ts — the drift of text between scenes, and the mirror's one line.
//
// E-transition-collage.md, "The register split — this is the design, don't
// collapse it": two moments, two voices, drawn from two different parts of
// Sleepers_Awake__February.md, and they must not mix.
//
//   TRANSITION_FRAGMENTS is the fossil's register: third person, impersonal,
//   in motion, not understanding what it is doing — the mode of moving
//   through a house without knowing why, which is what a scene transition
//   IS. Drawn from the epigraph and the movement prose of section 1.
//
//   MIRROR_FRAGMENTS is Jenny's register: second person, direct address, the
//   question of who is being spoken to. The mirror is where "you" lives.
//   Drawn from the "Whom, precisely, do I address?" passage, also section 1.
//
// Keeping these as two separate constants (rather than one pool tagged by
// use) is the whole point: if a transition ever drew a mirror line, or the
// mirror flashed a fossil line, both moments would lose their character.
// Verbatim from the source in both cases — no paraphrase, nothing added.

/** The fossil's register. Weighted below toward the epigraph's refrain. */
const TRANSITION_FRAGMENTS: readonly string[] = [
  'need alone',
  'a ghost, a cloud of dust',
  'through gray expanses',
  'For days or aeons, it had roamed',
  'it knew it would not know the needed',
  'even if, against all chance',
  'the needed came',
  'or was it wood?',
  'if mind it had',
  'unmoved by the cold wind',
  'the remains of a wall',
  'baffled wonderment',
  'it changed its mind',
  'and kept the paper in its hand',
  'nothing to its satisfaction',
  'it did stop frequently to glance wonderingly at the keys',
  'The door swung open',
];

/** Jenny's register. Cycled, not drawn from — see nextMirrorFragment. */
const MIRROR_FRAGMENTS: readonly string[] = [
  'Whom, precisely, do I address?',
  'There are several options. I vacillate among them.',
  'Surely, you, reader, are part of you whom I address.',
  'Perhaps you are God. There — I said it.',
  'a listener, a lover, who is everything I might want him to be',
  'I want to be Jennie.',
];

/** The epigraph lines carry the most weight — the brief's own words: draw
 *  toward these or the transitions read as a word salad instead of a
 *  refrain. Everything else in the pool is weight 1. */
const HEAVILY_WEIGHTED = new Set<string>([
  'need alone',
  'the needed came',
  'it knew it would not know the needed',
]);
const HEAVY_WEIGHT = 3;
const LIGHT_WEIGHT = 1;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Weighted draw without replacement: a line's copies in the bag are
 *  proportional to its weight, the bag is shuffled, and the first `count`
 *  distinct lines encountered are kept. Approximate rather than an exact
 *  weighted-without-replacement distribution, but for a pool this small it
 *  reads exactly as intended — heavy lines turn up noticeably more often —
 *  which is all a refrain needs. `rng` is injectable so the selftest can
 *  drive it deterministically. */
export function pickTransitionFragments(
  count: number,
  rng: () => number = Math.random,
): string[] {
  const bag: string[] = [];
  for (const line of TRANSITION_FRAGMENTS) {
    const weight = HEAVILY_WEIGHTED.has(line) ? HEAVY_WEIGHT : LIGHT_WEIGHT;
    for (let i = 0; i < weight; i++) bag.push(line);
  }
  const drawn = shuffle(bag, rng);
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const line of drawn) {
    if (chosen.length >= count) break;
    if (seen.has(line)) continue;
    seen.add(line);
    chosen.push(line);
  }
  return chosen;
}

/** A fresh cycler over the mirror pool: in order, wrapping, independent of
 *  any other cycler. The brief asks for cycling rather than random so the
 *  sequence is legible to a player who clicks the mirror repeatedly — a
 *  fresh instance exists so the selftest can verify the order without
 *  disturbing the one the game actually plays from. */
export function createMirrorCycler(): () => string {
  let i = 0;
  return () => {
    const text = MIRROR_FRAGMENTS[i % MIRROR_FRAGMENTS.length];
    i += 1;
    return text;
  };
}

/** The cycler the mirror flourish actually draws from. */
export const nextMirrorFragment = createMirrorCycler();

// --------------------------------------------------------------- timing ---

/** Total budget ~1.2-1.8s per the brief; err short. */
const FADE_MS = 350;
const HOLD_MS = 700;
const FADE_OUT_MS = 350;

/** prefers-reduced-motion: collapse drift to a static hold, and shorten the
 *  whole thing rather than just removing the movement. */
const REDUCED_FADE_MS = 140;
const REDUCED_HOLD_MS = 260;
const REDUCED_FADE_OUT_MS = 140;

const MIN_FRAGMENTS = 5;
const MAX_FRAGMENTS = 9;
const FRAGMENT_DRIFT_MS = 1500;
const FRAGMENT_STAGGER_MS = 70;
const FRAGMENT_HOLD_MS = 500;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function race(ms: number, skip: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    skip.then(() => {
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function populateFragments(overlay: HTMLElement, reducedMotion: boolean): void {
  const count =
    MIN_FRAGMENTS + Math.floor(Math.random() * (MAX_FRAGMENTS - MIN_FRAGMENTS + 1));
  const fragments = pickTransitionFragments(count);
  fragments.forEach((text, i) => {
    const el = document.createElement('span');
    el.className = reducedMotion ? 'transition-fragment reduced-motion' : 'transition-fragment';
    el.textContent = text;
    // Not centered, not a list — scattered, and free to overlap. Illegibility
    // in places is fine and correct; see the brief.
    el.style.left = `${6 + Math.random() * 82}%`;
    el.style.top = `${8 + Math.random() * 78}%`;
    el.style.setProperty('--drift-rotate', `${(Math.random() * 8 - 4).toFixed(1)}deg`);
    if (reducedMotion) {
      el.style.animationDuration = `${FRAGMENT_HOLD_MS}ms`;
      el.style.animationDelay = '0ms';
    } else {
      el.style.animationDuration = `${FRAGMENT_DRIFT_MS}ms`;
      el.style.animationDelay = `${i * FRAGMENT_STAGGER_MS}ms`;
    }
    overlay.appendChild(el);
  });
}

/** Fade out to the collage, hold, run `render` (which tears down whatever is
 *  on screen and mounts the next scene) while fully covered, then fade in on
 *  what render() built.
 *
 *  This is the one seam every scene change in the game passes through — see
 *  goToRoom() and goToMap() in house.ts, which are the only callers. It does
 *  NOT carry the 'house' class: enterRoom() and showMap() both begin by
 *  removing every element with that class, and this overlay has to still be
 *  covering the screen while they do it, not be swept away by it.
 *
 *  Skippable by any click on the overlay or any keypress, at any point in the
 *  sequence — non-negotiable per the brief. A skip forces the overlay fully
 *  (and instantly) opaque if render() hasn't run yet, so the DOM swap is
 *  never visible mid-skip, then collapses every remaining wait to zero. */
export async function playTransition(render: () => void | Promise<void>): Promise<void> {
  const reducedMotion = prefersReducedMotion();
  const fadeMs = reducedMotion ? REDUCED_FADE_MS : FADE_MS;
  const holdMs = reducedMotion ? REDUCED_HOLD_MS : HOLD_MS;
  const fadeOutMs = reducedMotion ? REDUCED_FADE_OUT_MS : FADE_OUT_MS;

  let skipped = false;
  let rendered = false;
  let resolveSkip: () => void = () => {};
  const skip = new Promise<void>((resolve) => {
    resolveSkip = resolve;
  });

  const overlay = document.createElement('div');
  overlay.className = 'scene-transition';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.transitionDuration = `${fadeMs}ms`;

  const requestSkip = (): void => {
    if (skipped) return;
    skipped = true;
    if (!rendered) {
      // The new scene isn't built yet — snap to fully covered so the
      // teardown-and-rebuild that render() is about to do never shows.
      overlay.style.transitionDuration = '0ms';
      overlay.classList.add('visible');
    }
    resolveSkip();
  };
  overlay.addEventListener('click', requestSkip);
  const onKey = (): void => requestSkip();
  window.addEventListener('keydown', onKey);

  populateFragments(overlay, reducedMotion);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  try {
    await race(fadeMs, skip);
    await race(holdMs, skip);

    await render();
    rendered = true;

    overlay.style.transitionDuration = skipped ? '0ms' : `${fadeOutMs}ms`;
    overlay.classList.remove('visible');
    await race(fadeOutMs, skip);
  } finally {
    window.removeEventListener('keydown', onKey);
    overlay.remove();
  }
}
