// state.selftest.ts — assertions for store.ts and inventory.ts.
//
// This repo has no test runner and adding one would have meant touching
// package.json, which Lane A was not allowed to do. This runs instead on the
// esbuild that is already a dependency, against the memory backend, with no
// DOM and no Parcel:
//
//   npx esbuild src/state/state.selftest.ts --bundle --platform=node \
//     --outfile=/tmp/selftest.js && node /tmp/selftest.js
//
// It is never imported by house.ts, so Parcel never sees it and it does not
// ship. Delete it the day a real runner lands.

import { EMPTY_INVENTORY, SCHEMA_VERSION, STORAGE_KEYS } from './state.constants';
import {
  clearNamespace,
  ensureSchema,
  memoryBackend,
  readLocal,
  readShared,
  setBackends,
  unionIntoShared,
  writeLocal,
  writeShared,
} from './store';
import {
  collect,
  countOf,
  freezeMessTotal,
  grantKeys,
  readInventory,
  readRoomState,
  readSharedDolls,
  readSharedKeys,
  readSound,
  recordFound,
  recordRequested,
  recordVisit,
  spendAlmond,
  writeSound,
} from './inventory';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean): void {
  if (condition) passed++;
  else failures.push(label);
}

function same(label: string, actual: unknown, expected: unknown): void {
  check(
    `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    JSON.stringify(actual) === JSON.stringify(expected),
  );
}

function fresh(seed: Record<string, string> = {}): void {
  setBackends({ shared: memoryBackend(seed), local: memoryBackend() });
}

// ------------------------------------------------------------------ store --

fresh();
writeShared(STORAGE_KEYS.sound, 'off');
same('shared round-trip', readShared(STORAGE_KEYS.sound, 'on'), 'off');
same('shared absent → fallback', readShared('evernost:nothing:here', 'default'), 'default');
writeLocal(STORAGE_KEYS.room('broom-closet'), { visits: 2 });
same('local round-trip', readLocal<{ visits: number }>(STORAGE_KEYS.room('broom-closet'), { visits: 0 }), { visits: 2 });

check(
  'unnamespaced key throws',
  (() => {
    try {
      readShared('darkRoomPath', null);
      return false;
    } catch {
      return true;
    }
  })(),
);

fresh({ 'evernost:house:inventory': '{ not json' });
same('corrupt value → fallback, no throw', readInventory(), EMPTY_INVENTORY);

fresh();
same('union creates', unionIntoShared('evernost:shared:keys', ['key1', 'key4']), ['key1', 'key4']);
same('union merges without clobbering', unionIntoShared('evernost:shared:keys', ['key4', 'key13']), ['key1', 'key4', 'key13']);

// ----------------------------------------------------------------- schema --

fresh();
same('fresh store stamps schema', ensureSchema(), 'fresh');
same('schema value written', readShared(STORAGE_KEYS.schema, -1), SCHEMA_VERSION);
same('second call is a no-op', ensureSchema(), 'current');

fresh({ [STORAGE_KEYS.schema]: JSON.stringify(SCHEMA_VERSION - 1), [STORAGE_KEYS.sharedDolls]: '["ragged"]' });
same('older schema wipes', ensureSchema(), 'wiped');
same('wipe removed stale state', readSharedDolls(), []);
same('wipe restamped', readShared(STORAGE_KEYS.schema, -1), SCHEMA_VERSION);

fresh({ [STORAGE_KEYS.schema]: JSON.stringify(SCHEMA_VERSION + 1), [STORAGE_KEYS.sharedDolls]: '["ragged"]' });
same('newer schema reports future', ensureSchema(), 'future');
same('newer schema is NOT wiped', readSharedDolls(), ['ragged']);
same('newer schema version left alone', readShared(STORAGE_KEYS.schema, -1), SCHEMA_VERSION + 1);

const legacyBackend = memoryBackend({
  evernostianNow: '123',
  darkRoomPath: 'a|b',
  'evernost:shared:dolls': '["ragged"]',
});
setBackends({ shared: legacyBackend, local: memoryBackend() });
clearNamespace();
same('clearNamespace spares legacy /in/ keys', legacyBackend.read('evernostianNow'), '123');
same('clearNamespace spares the other legacy key', legacyBackend.read('darkRoomPath'), 'a|b');
same('clearNamespace removes ours', legacyBackend.read('evernost:shared:dolls'), null);

// -------------------------------------------------------------- inventory --

fresh();
same('empty inventory', readInventory(), EMPTY_INVENTORY);
collect('keys', 'key1');
collect('keys', 'key1');
same('collect is idempotent', readInventory().keys, ['key1']);
same('counts do not exceed reality', countOf('keys'), 1);
same('collect mirrors keys into shared', readSharedKeys(), ['key1']);

collect('dolls', 'ragged');
same('collect mirrors dolls into shared', readSharedDolls(), ['ragged']);
same('dollParts stays independent of dolls', readInventory().dollParts, []);

collect('almonds', 'almond-3');
collect('almonds', 'almond-7');
spendAlmond('almond-3');
same('spent almond leaves held', readInventory().almonds, ['almond-7']);
same('spent almond is remembered', readInventory().almondsSpent, ['almond-3']);
spendAlmond('almond-never-found');
same('spending an unheld almond is a no-op', readInventory().almondsSpent, ['almond-3']);

grantKeys(['key13']);
same('/in/ can add to shared keys', readSharedKeys(), ['key1', 'key13']);

fresh({ 'evernost:house:inventory': '{"keys":["key2"],"papers":"nope"}' });
same('missing slots read as empty', readInventory().dolls, []);
same('partial inventory keeps what is valid', readInventory().keys, ['key2']);
same('wrong-typed slot is discarded, not trusted', readInventory().papers, []);

fresh();
same('sound defaults to on', readSound(), 'on');
writeSound('off');
same('sound persists', readSound(), 'off');

// ------------------------------------------------------------- room state --

fresh();
same('unvisited room', readRoomState('balcony'), { found: [], requested: [], visits: 0 });
recordVisit('balcony');
recordVisit('balcony');
same('visits accumulate', readRoomState('balcony').visits, 2);

recordFound('spare-room', 'curly-head');
recordFound('spare-room', 'curly-head');
same('recordFound is idempotent', readRoomState('spare-room').found, ['curly-head']);
same('rooms do not bleed into each other', readRoomState('balcony').found, []);

recordRequested('spare-room', ['lamp', 'bottle']);
recordRequested('spare-room', ['bottle', 'hanger']);
same('requested is a growing ledger', readRoomState('spare-room').requested, ['lamp', 'bottle', 'hanger']);
same('requesting does not mark found', readRoomState('spare-room').found, ['curly-head']);
check(
  'found and requested are genuinely disjoint collections',
  !readRoomState('spare-room').requested.includes('curly-head'),
);

freezeMessTotal('spare-room', 18);
freezeMessTotal('spare-room', 4);
same('messTotal freezes on first call', readRoomState('spare-room').messTotal, 18);

// --------------------------------------------------------------- report ----

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
// throw rather than process.exit: this repo's tsconfig has no node types,
// and a thrown error still exits node nonzero.
if (failures.length > 0) throw new Error(`${failures.length} assertion(s) failed`);
