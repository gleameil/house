// Assertions for the pure logic in collage.ts (the DOM orchestration in
// playTransition() is not exercised here — no DOM in this run, same
// boundary as requests.selftest.ts). Run:
//   npx esbuild src/transitions/collage.selftest.ts --bundle --platform=node \
//     --outfile=/tmp/collage.js && node /tmp/collage.js

import { pickTransitionFragments, createMirrorCycler } from './collage';

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean): void {
  if (ok) passed++;
  else failures.push(label);
}
function same(label: string, actual: unknown, expected: unknown): void {
  check(
    `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}

// deterministic PRNG (mulberry32) so the weighting check is reproducible
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_FRAGMENTS = pickTransitionFragments(1000, mulberry32(1)); // dedup caps it at pool size
const POOL_SIZE = ALL_FRAGMENTS.length;

// -------------------------------------------------------- basic invariants
{
  const rng = mulberry32(42);
  const five = pickTransitionFragments(5, rng);
  same('asks for the requested count', five.length, 5);
  check('no repeats within one draw', new Set(five).size === five.length);
  check('every fragment comes from the pool', five.every((f) => ALL_FRAGMENTS.includes(f)));
}

same('a count of zero draws nothing', pickTransitionFragments(0, mulberry32(7)), []);

{
  const whole = pickTransitionFragments(POOL_SIZE + 10, mulberry32(3));
  same('cannot draw more than the pool holds', whole.length, POOL_SIZE);
  check('drawing "the whole pool" has no duplicates', new Set(whole).size === POOL_SIZE);
}

// ------------------------------------------------------- weighting toward
// the epigraph refrain — "need alone", "the needed came", "it knew it would
// not know the needed" should turn up noticeably more than an unweighted
// line across many draws, or the transitions read as word salad rather than
// a refrain (the brief's own language for why the weighting exists).
{
  const HEAVY = ['need alone', 'the needed came', 'it knew it would not know the needed'];
  const counts = new Map<string, number>();
  for (const f of ALL_FRAGMENTS) counts.set(f, 0);

  const rng = mulberry32(1234);
  const TRIALS = 4000;
  for (let i = 0; i < TRIALS; i++) {
    for (const f of pickTransitionFragments(3, rng)) {
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }

  const light = ALL_FRAGMENTS.filter((f) => !HEAVY.includes(f));
  const avgLight = light.reduce((sum, f) => sum + (counts.get(f) ?? 0), 0) / light.length;
  const avgHeavy = HEAVY.reduce((sum, f) => sum + (counts.get(f) ?? 0), 0) / HEAVY.length;

  check(
    `the epigraph refrain is drawn more often than the rest of the pool ` +
      `(heavy avg ${avgHeavy.toFixed(1)} vs light avg ${avgLight.toFixed(1)} over ${TRIALS} draws)`,
    avgHeavy > avgLight * 1.5,
  );
}

// --------------------------------------------------------- mirror cycler
{
  const next = createMirrorCycler();
  const first = next();
  const rest = Array.from({ length: 5 }, () => next());
  const wrapped = next(); // the 7th call, should be back to the 1st line

  check('the mirror cycler starts on the pool\'s first line', first === 'Whom, precisely, do I address?');
  check('no repeats across one full cycle', new Set([first, ...rest]).size === 6);
  same('the cycle wraps back to the start on the 7th call', wrapped, first);

  const independent = createMirrorCycler();
  same(
    'a fresh cycler starts over, independent of one already in progress',
    independent(),
    'Whom, precisely, do I address?',
  );
}

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
if (failures.length > 0) throw new Error(`${failures.length} assertion(s) failed`);
