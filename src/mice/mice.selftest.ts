// mice.selftest.ts — assertions for gait.ts and trade.ts.
//
// Same arrangement (and same reasoning) as src/state/state.selftest.ts: this
// repo has no test runner, adding one would mean editing package.json, so
// this runs on the esbuild already in dependencies, against the memory
// storage backend, with no DOM and no Parcel:
//
//   npx esbuild src/mice/mice.selftest.ts --bundle --platform=node \
//     --outfile=/tmp/mice-selftest.js && node /tmp/mice-selftest.js
//
// It covers the two files a bundler is not needed for. mice.ts itself is
// untested here — it imports house.constants.ts, which imports every asset
// URL in the game, and dragging Parcel's `url:` scheme into node is exactly
// what the state layer's asset-free rule exists to avoid.
//
// Never imported by house.ts or mice.ts, so it does not ship.

import { EMPTY_INVENTORY, Inventory } from '../state/state.constants';
import { memoryBackend, setBackends } from '../state/store';
import { collect, readInventory, spendAlmond } from '../state/inventory';
import {
  CardScrap,
  ScrapLookup,
  commitTrade,
  feedMouse,
  fragmentId,
  fragmentLabel,
  hasEverFedAMouse,
  nextPieceIndex,
  parseFragmentId,
  piecesHeld,
  planTrade,
} from './trade';
import { distance, progress, randomBetween, routeThrough, step } from './gait';

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

function close(label: string, actual: number, expected: number, epsilon = 1e-9): void {
  check(`${label} — expected ~${expected}, got ${actual}`, Math.abs(actual - expected) < epsilon);
}

function fresh(): void {
  setBackends({ shared: memoryBackend(), local: memoryBackend() });
}

function inventoryWith(partial: Partial<Inventory>): Inventory {
  return { ...EMPTY_INVENTORY, ...partial };
}

// ------------------------------------------------------------------ gait ---

close('a step of 1 across is one width-unit', distance({ x: 0, y: 0 }, { x: 1, y: 0 }, 16 / 9), 1);
close(
  'a full-height drop is shorter than a full-width run in a wide room',
  distance({ x: 0, y: 0 }, { x: 0, y: 1 }, 16 / 9),
  9 / 16,
);

const walked = step({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.25, 1);
same('a step moves exactly the step distance', walked.position, { x: 0.25, y: 0 });
check('a step short of the target has not arrived', !walked.arrived);

const overshot = step({ x: 0.9, y: 0 }, { x: 1, y: 0 }, 0.25, 1);
same('the last step lands exactly on the target', overshot.position, { x: 1, y: 0 });
check('landing on the target reports arrival', overshot.arrived);

check('a zero-length journey arrives rather than dividing by zero',
  step({ x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 }, 0.01, 1).arrived);

close('progress is half-way at the half-way point',
  progress({ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, 1), 0.5);
close('progress on a zero-length journey is 1',
  progress({ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }, 1), 1);

const route = routeThrough(4, 12);
same('a route has one entry per haunt visited', route.length, 12);
check('a route never names the same haunt twice running',
  route.every((haunt, i) => i === 0 || haunt !== route[i - 1]));
check('every haunt in a route exists', route.every((haunt) => haunt >= 0 && haunt < 4));
same('a room with no haunts produces no route', routeThrough(0, 3), []);
same('a single haunt is allowed to repeat', routeThrough(1, 3), [0, 0, 0]);

const rolls = Array.from({ length: 200 }, () => randomBetween([2, 4]));
check('randomBetween stays inside its inclusive range',
  rolls.every((n) => n >= 2 && n <= 4 && Number.isInteger(n)));

// -------------------------------------------------------- fragment ids ----

same('fragment ids are composite', fragmentId('this-thing-04', 2), 'this-thing-04#2');
same('fragment ids round-trip', parseFragmentId('this-thing-04#2'), {
  cardId: 'this-thing-04',
  pieceIndex: 2,
});
same('a card id with no piece is not a fragment id', parseFragmentId('this-thing-04'), null);
same('a trailing separator is not a fragment id', parseFragmentId('this-thing-04#'), null);
same('a non-numeric piece is not a fragment id', parseFragmentId('this-thing-04#head'), null);
same('pieces of other cards do not count', piecesHeld('a', ['a#0', 'b#1', 'a#2']), [0, 2]);

const threePieces: CardScrap = { cardId: 'this-thing-01', pieces: 3 };
same('the first piece of an untouched card is 0', nextPieceIndex(threePieces, []), 0);
same('pieces fill lowest-first', nextPieceIndex(threePieces, ['this-thing-01#0']), 1);
same('a gap is filled before the end',
  nextPieceIndex(threePieces, ['this-thing-01#0', 'this-thing-01#2']), 1);
same('a whole card offers nothing',
  nextPieceIndex(threePieces, ['this-thing-01#0', 'this-thing-01#1', 'this-thing-01#2']), null);
same('another card’s pieces do not complete this one',
  nextPieceIndex(threePieces, ['this-thing-02#0', 'this-thing-02#1', 'this-thing-02#2']), 0);

// ------------------------------------------------------------- planning ---

const lookup: ScrapLookup = (id) =>
  ({
    'almond-1': { cardId: 'card-a', pieces: 2 },
    'almond-2': { cardId: 'card-a', pieces: 2 },
    'almond-3': { cardId: 'card-b', pieces: 1 },
  })[id];

same('an empty bag refuses',
  planTrade(inventoryWith({}), lookup), { accepted: false, reason: 'no-almonds' });

same('an unmapped almond alone leaves nothing to trade',
  planTrade(inventoryWith({ almonds: ['almond-99'] }), lookup),
  { accepted: false, reason: 'nothing-left' });

const firstPlan = planTrade(inventoryWith({ almonds: ['almond-1', 'almond-3'] }), lookup);
check('a held, mapped almond is accepted', firstPlan.accepted);
if (firstPlan.accepted) {
  same('the mouse takes the first useful almond', firstPlan.offer.almondId, 'almond-1');
  same('and drops the first piece of its card', firstPlan.offer.fragmentId, 'card-a#0');
  same('the reveal counts pieces from one',
    fragmentLabel('[This Thing — card 1]', firstPlan.offer),
    '[This Thing — card 1] — piece 1 of 2');
}

const skipping = planTrade(
  inventoryWith({ almonds: ['almond-99', 'almond-3'], artFragments: [] }),
  lookup,
);
check('an unmapped almond is skipped rather than refused', skipping.accepted);
if (skipping.accepted) same('the next usable almond is taken', skipping.offer.almondId, 'almond-3');

const finished = planTrade(
  inventoryWith({ almonds: ['almond-3'], artFragments: ['card-b#0'] }),
  lookup,
);
same('an almond keyed to a finished card buys nothing',
  finished, { accepted: false, reason: 'nothing-left' });

const stranded = planTrade(
  inventoryWith({ almonds: ['almond-3', 'almond-1'], artFragments: ['card-b#0'] }),
  lookup,
);
check('a finished card does not strand the almonds behind it', stranded.accepted);
if (stranded.accepted) same('the useful almond is found further down the bag',
  stranded.offer.almondId, 'almond-1');

same('a one-piece card names itself without a piece count',
  fragmentLabel('[card]', { almondId: 'x', cardId: 'c', pieceIndex: 0, pieces: 1, fragmentId: 'c#0' }),
  '[card]');

// ------------------------------------------------------------ committing --

fresh();
collect('almonds', 'almond-1');
collect('almonds', 'almond-2');

const traded = feedMouse(lookup);
check('feeding a mouse from real inventory is accepted', traded.accepted);
same('the almond leaves the bag', readInventory().almonds, ['almond-2']);
same('and is remembered as spent', readInventory().almondsSpent, ['almond-1']);
same('the fragment is banked', readInventory().artFragments, ['card-a#0']);
check('the player has now fed a mouse', hasEverFedAMouse());

if (traded.accepted) {
  commitTrade(traded.offer);
  same('committing the same trade twice banks one fragment',
    readInventory().artFragments, ['card-a#0']);
  same('and does not un-spend or re-spend the almond',
    readInventory().almondsSpent, ['almond-1']);
}

const second = feedMouse(lookup);
check('the second almond of the same card is accepted', second.accepted);
same('the card fills up in order',
  readInventory().artFragments, ['card-a#0', 'card-a#1']);
same('both almonds are spent, none held', readInventory().almonds, []);

const empty = feedMouse(lookup);
same('an empty bag refuses at the storage layer too',
  empty, { accepted: false, reason: 'no-almonds' });

fresh();
collect('almonds', 'almond-1');
check('a fresh player has never fed a mouse', !hasEverFedAMouse());
spendAlmond('almond-1');
check('spending an almond alone already counts as having fed one', hasEverFedAMouse());

// --------------------------------------------------------------- report ---

console.log(`\n${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`  FAIL  ${failure}`);
// throw rather than process.exit, matching state.selftest.ts: this repo's
// tsconfig has no node types, and a thrown error still exits node nonzero.
if (failures.length > 0) throw new Error(`${failures.length} assertion(s) failed`);
