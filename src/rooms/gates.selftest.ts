// Assertions for gates.ts. Run:
//   npx esbuild src/rooms/gates.selftest.ts --bundle --platform=node \
//     --outfile=/tmp/gates.js && node /tmp/gates.js

import { HOUSE_CONFIG } from '../state/state.constants';
import { EXTERNAL_GATES, GateSpec, isUnlocked, keysFor, unbuilt, unlockedRooms } from './gates';

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

// The real graph, as placed in house.constants.ts plus the one external gate.
const GATES: GateSpec[] = [
  ...EXTERNAL_GATES,
  { keyId: 'key-12', roomId: 'master-bathroom' },
  { keyId: 'key-8', roomId: 'spare-room' },
  { keyId: 'key-2', roomId: 'bedroom' },
  { keyId: 'key-14', roomId: 'balcony' },
  { keyId: 'key-15', roomId: 'throne-room' },
  { keyId: 'key-9', roomId: 'artists-studio' },
];
const EXISTING = ['bedroom', 'master-bathroom', 'broom-closet', 'spare-room', 'balcony'];

const gating = HOUSE_CONFIG.keyGating;
const frontDoor = HOUSE_CONFIG.frontDoor;
function withConfig(g: boolean, f: string | null, body: () => void): void {
  HOUSE_CONFIG.keyGating = g;
  HOUSE_CONFIG.frontDoor = f;
  try {
    body();
  } finally {
    HOUSE_CONFIG.keyGating = gating;
    HOUSE_CONFIG.frontDoor = frontDoor;
  }
}

withConfig(true, null, () => {
  check('a gated room is shut without its key', !isUnlocked('spare-room', GATES, []));
  check('a gated room opens with its key', isUnlocked('spare-room', GATES, ['key-8']));
  check('the wrong key does not open it', !isUnlocked('spare-room', GATES, ['key-2', 'key-14']));
  check('an ungated room is always open', isUnlocked('nowhere-in-particular', GATES, []));
  check('the front door is shut too, with no front door set', !isUnlocked('broom-closet', GATES, []));
  check('/in/ granting key-13 opens the house', isUnlocked('broom-closet', GATES, ['key-13']));

  // The chain: holding only the front-door key gets you exactly one room.
  same(
    'key-13 alone opens only the broom closet',
    unlockedRooms(EXISTING, GATES, ['key-13']),
    ['broom-closet'],
  );
  same(
    'the broom closet keys open two more',
    unlockedRooms(EXISTING, GATES, ['key-13', 'key-12', 'key-8']),
    ['master-bathroom', 'broom-closet', 'spare-room'],
  );
  same(
    'the spare room keys open the rest',
    unlockedRooms(EXISTING, GATES, ['key-13', 'key-12', 'key-8', 'key-2', 'key-14']),
    EXISTING,
  );
  check(
    'every existing room is reachable — the graph has no orphan',
    unlockedRooms(EXISTING, GATES, ['key-13', 'key-12', 'key-8', 'key-2', 'key-14']).length ===
      EXISTING.length,
  );
});

withConfig(true, 'broom-closet', () => {
  check('the front door opens with no keys at all', isUnlocked('broom-closet', GATES, []));
  same(
    'a player who has never opened /in/ still gets in',
    unlockedRooms(EXISTING, GATES, []),
    ['broom-closet'],
  );
  check('but only the front door', !isUnlocked('spare-room', GATES, []));
});

withConfig(false, null, () => {
  check('gating off opens everything', isUnlocked('spare-room', GATES, []));
  same('gating off lists every room', unlockedRooms(EXISTING, GATES, []), EXISTING);
});

same('keysFor names the missing key', keysFor('master-bathroom', GATES), ['key-12']);
same('keysFor is empty for an ungated room', keysFor('kitchen', GATES), []);

same(
  'rooms that do not exist yet are named, not treated as broken',
  unbuilt(GATES, EXISTING).map((g) => g.roomId),
  ['throne-room', 'artists-studio'],
);
check('the front door is not unbuilt', !unbuilt(GATES, EXISTING).some((g) => g.keyId === 'key-13'));

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
if (failures.length > 0) throw new Error(`${failures.length} assertion(s) failed`);
