// Assertions for placement.ts. Run:
//   npx esbuild src/rooms/placement.selftest.ts --bundle --platform=node \
//     --outfile=/tmp/placement.js && node /tmp/placement.js

import { StoredSpot } from '../state/state.constants';
import { rememberedSpot, sameSpot } from './placement';

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

const A: StoredSpot = { x: 0.1, y: 0.2, width: 0.05 };
const B: StoredSpot = { x: 0.7, y: 0.4, width: 0.05, rotation: 12 };
const AUTHORED = [A, B];

check('a spot equals itself', sameSpot(A, A));
check('a spot equals a JSON round-trip of itself', sameSpot(A, JSON.parse(JSON.stringify(A))));
check('different spots are different', !sameSpot(A, B));
check('absent rotation and zero rotation are the same spot', sameSpot(A, { ...A, rotation: 0 }));
check('a different rotation is a different spot', !sameSpot(B, { ...B, rotation: 13 }));
check('a different width is a different spot', !sameSpot(A, { ...A, width: 0.06 }));

same('a remembered spot comes back', rememberedSpot({ lamp: { ...A } }, 'lamp', AUTHORED), A);
check(
  'the returned spot is the AUTHORED object, not the stored copy',
  rememberedSpot({ lamp: { ...A } }, 'lamp', AUTHORED) === A,
);
check('nothing remembered means nothing returned', rememberedSpot({}, 'lamp', AUTHORED) === undefined);
check(
  'another object being remembered does not place this one',
  rememberedSpot({ bottle: { ...A } }, 'lamp', AUTHORED) === undefined,
);

// The case this function exists for: Nora moves an object's authored spots.
check(
  'a stale spot the room no longer authors is discarded',
  rememberedSpot({ lamp: { x: 0.9, y: 0.9, width: 0.05 } }, 'lamp', AUTHORED) === undefined,
);
check(
  'a spot that is authored elsewhere in the room still counts',
  rememberedSpot({ lamp: { ...B } }, 'lamp', AUTHORED) === B,
);
check('an empty authored list discards everything', rememberedSpot({ lamp: { ...A } }, 'lamp', []) === undefined);

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
if (failures.length > 0) throw new Error(`${failures.length} assertion(s) failed`);
