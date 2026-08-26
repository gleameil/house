// Assertions for requests.ts. Run:
//   npx esbuild src/rooms/requests.selftest.ts --bundle --platform=node \
//     --outfile=/tmp/req.js && node /tmp/req.js

import { EMPTY_ROOM_STATE, RoomState } from '../state/state.constants';
import {
  candidates,
  chooseRequests,
  isFinalPass,
  messProgress,
  roundSatisfied,
} from './requests';

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
function roomState(over: Partial<RoomState> = {}): RoomState {
  return { ...EMPTY_ROOM_STATE, found: [], requested: [], ...over };
}

const POOL = ['lamp', 'bottle', 'hanger', 'fork', 'mirror'];

same('everything is a candidate at first', candidates(POOL, roomState()), POOL);
same(
  'found objects are not asked for',
  candidates(POOL, roomState({ found: ['lamp'] })),
  ['bottle', 'hanger', 'fork', 'mirror'],
);
same(
  'already-requested objects are not asked for again',
  candidates(POOL, roomState({ requested: ['bottle'] })),
  ['lamp', 'hanger', 'fork', 'mirror'],
);
same(
  'a request ignored on a past visit is still not repeated',
  candidates(POOL, roomState({ requested: ['bottle'], found: [] })),
  ['lamp', 'hanger', 'fork', 'mirror'],
);

const three = chooseRequests(POOL, roomState(), 3);
same('asks for three', three.length, 3);
check('no duplicates within a round', new Set(three).size === three.length);
check('all drawn from the pool', three.every((id) => POOL.includes(id)));

same(
  'asks for what is left when fewer than three remain',
  chooseRequests(POOL, roomState({ requested: ['lamp', 'bottle', 'hanger'] }), 3).length,
  2,
);
same('asks for nothing when nothing is left', chooseRequests(POOL, roomState({ requested: POOL }), 3), []);

// across visits: accumulate requests and confirm nothing ever repeats
{
  const seen: string[] = [];
  const state = roomState();
  for (let visit = 0; visit < 4; visit++) {
    const asked = chooseRequests(POOL, state, 3);
    for (const id of asked) {
      check(`"${id}" was never asked for twice across visits`, !seen.includes(id));
      seen.push(id);
    }
    state.requested = [...state.requested, ...asked];
  }
  same('four visits of three exhaust a pool of five', seen.length, POOL.length);
}

check('not final while anything is unasked', !isFinalPass(POOL, roomState()));
check(
  'final once everything is found or asked for',
  isFinalPass(POOL, roomState({ found: ['lamp', 'bottle'], requested: ['hanger', 'fork', 'mirror'] })),
);
check(
  'an ignored request still pushes toward the final pass',
  isFinalPass(POOL, roomState({ requested: POOL })),
);
check('an empty pool is final from the first visit (the balcony)', isFinalPass([], roomState()));

const ALL = ['lamp', 'bottle', 'hanger', 'fork', 'mirror', 'almond-1', 'scrap-1'];
same(
  'the mess is measured against what was loose when it began',
  messProgress(ALL, roomState({ found: ['lamp', 'bottle'] }), 5),
  { tidied: 0, total: 5 },
);
same(
  'tidying counts up toward the frozen total',
  messProgress(ALL, roomState({ found: ['lamp', 'bottle', 'fork', 'mirror'] }), 5),
  { tidied: 2, total: 5 },
);
same(
  'a clean room reads as complete',
  messProgress(ALL, roomState({ found: ALL }), 5),
  { tidied: 5, total: 5 },
);
same(
  'with no frozen total, the current mess is the total',
  messProgress(ALL, roomState({ found: ['lamp'] }), undefined),
  { tidied: 0, total: 6 },
);

check('an empty round is never satisfied', !roundSatisfied([], roomState({ found: ALL })));
check('a partly-found round is not satisfied', !roundSatisfied(['lamp', 'fork'], roomState({ found: ['lamp'] })));
check('a fully-found round is satisfied', roundSatisfied(['lamp', 'fork'], roomState({ found: ['lamp', 'fork'] })));

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
if (failures.length > 0) throw new Error(`${failures.length} assertion(s) failed`);
