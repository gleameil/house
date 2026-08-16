# `/house/` State

**Files:** `src/state/state.constants.ts`, `src/state/store.ts`, `src/state/inventory.ts`, `src/state/state.selftest.ts`

**Status:** designed and built, **wired into nothing**. `house.ts` is untouched; the game behaves exactly as it did this morning. The migration checklist at the end is the thing to execute.

---

## What This Is

Six pending features — persistent inventory, room revisits, key-gated navigation, almonds and mice, dolls, the zine — are all consumers of one missing thing: game state that survives a room change. This is that state: the storage primitive, the typed layer over it, and the rules for how a room decides what to ask you for.

Three modules, no framework, no dependencies, asset-free. `src/state/` may never import `house.constants.ts` — that file imports every asset URL in the game, so importing it drags Parcel's `url:` scheme into everything downstream. Keeping the state layer asset-free is what lets it be type-checked and tested outside a bundler, and it is the only thing preventing a circular import once `house.ts` starts calling in. Ids cross the boundary as plain strings.

---

## First: four things the code says that the briefs don't

The briefs were written without access to the repo. Where they disagree, the code wins.

**1. Five of the six dolls can never be assembled, today.** Six objects carry `partOf` — `ragged-body`, `ragged-head`, `gorilla-body`, `plus-size-body`, `curly-body`, `evil-body` — but exactly one `FusionSpec` exists in the whole game (`ragged`, children's bedroom). The other four bodies point at fusions that don't exist. Worse, their heads are in *other rooms*: `evil-head` in the master bathroom, `plus-size-head` and `gorilla-leg` in the broom closet, `curly-head` in the spare room — and those heads have no `partOf` at all, so they read as ordinary named objects.

Two consequences in the current build. `buildList()` skips anything with `partOf`, so those four bodies are findable but never appear in the to-find list. And `fusionFor()` looks only in `state.room!.fusions` while `fusionParts()` filters only `state.objects` — both are current-room-only, so cross-room fusion is not merely unbuilt, it is unrepresentable. This is squarely a state problem: a doll can only be assembled once "which parts do I have" outlives the room you found them in. `Inventory.dollParts` is where that lives. **I have not touched it** — dolls are out of scope for this lane — but nothing else in the migration will fix it by accident, so it needs its own slot on the list.

**2. The balcony has zero requestable objects.** It is 28 `scrap`s and nothing else. The request pool is exactly the set `buildList()` already computes — `named` objects without `partOf` — so:

| Room | objects | requestable | rounds of three |
|---|---|---|---|
| broom closet | 38 | 22 | 7 |
| master bathroom | 42 | 24 | 8 |
| spare room | 30 | 20 | 6 |
| children's bedroom | 32 | 22 | 7 |
| **balcony** | **28** | **0** | **—** |

The balcony is in final-pass mode from its first visit, permanently. That is not a bug to fix; it is a room with a different character, and the loop below has to not crash on it. It also means the balcony is the natural place to test final-pass mode.

**3. The contract's list of legacy `/in/` keys is incomplete.** Also in unprefixed localStorage: `currentBrowserTabName`, `metMadelineEnding`, `metMichaelEnding`, `metVernaEnding`, and `<className>ChapterIndex` / `<className>TextIndex` per book. None of them collide with `evernost:`, so the namespace rule holds unchanged — but the list shouldn't be treated as exhaustive by anyone deciding what's safe to clear. `clearNamespace()` is prefix-filtered precisely so nobody has to keep an accurate list.

**4. `evernost:shared:keys` cannot be house-owned.** key13's "Found in" column is `n/a` because it is found in Jennie's room in `/in/`, not in any house room. So `/in/` writes to that array too. Whole-array replacement would let whichever site wrote last erase the other's contribution. See "The `/in/` handoff" below.

---

## The storage layer (`store.ts`)

In production `gleameil.github.io/in`, `/out` and `/house` are the **same origin** — scheme, host and port match, path is irrelevant to the storage partition. localStorage is already shared. No transport layer is needed.

In local dev they are three Parcel servers on three ports, which is three origins, which is three separate and silently unconnected localStorages. Sharing stops working, and it stops working *quietly* — you get empty arrays, not errors. (BroadcastChannel does not help; it is origin-scoped too.)

Hence: **no feature code calls `localStorage` directly.** Four functions.

```ts
readShared<T>(key, fallback)   writeShared<T>(key, value)   // another site may read this
readLocal<T>(key, fallback)    writeLocal<T>(key, value)    // house-private
```

The shared/local split is not about the key's prefix — `evernost:house:inventory` is `house:`-prefixed and read by `/in/`. It is about **intent at the call site**, and it exists so the dev shim has something to hook. Choosing `readShared` is a declaration that another site cares.

The dev shim (`devSharedBackend`) applies only on localhost. Reads hit the real per-port store first and fall through to a fixture **only on genuine absence**; writes always go to the real store. Dev therefore behaves like production for everything you actually do, and only fills in the part production would have had from a sibling site. `DEV_FIXTURE` currently pretends a player finished two dolls and three keys — enough for `/in/` to have something to render, not a full playthrough.

Everything else in there is failure-tolerance, all of it deliberate: a non-namespaced key **throws** (a programming error, caught in development); an unparseable value logs one warning, returns the fallback, and is **left in place** rather than deleted; a disabled or full localStorage degrades to memory for the session instead of throwing on page load.

### Schema versioning

One integer, `SCHEMA_VERSION` in `state.constants.ts`, stored at `evernost:schema`. `ensureSchema()` runs once at boot and returns one of four outcomes.

| Stored | Outcome | What happens |
|---|---|---|
| absent | `fresh` | stamp the version |
| equal | `current` | nothing |
| **older** | `wiped` | **wipe the `evernost:` namespace, restamp** |
| **newer** | `future` | **do nothing at all** |

Wipe-and-start-over on an older version is the policy, written down so it is a decision and not an accident: migration code for a game with no players is a liability. Revisit if the house ships publicly and someone has a save worth keeping.

The newer case is the one that matters and is not hypothetical. The three sites deploy independently, so a player can easily reach an older `/house/` build carrying state written by a newer `/in/`. Wiping there would mean the older build destroys the newer build's save on sight. Instead the caller degrades — treat shared state as absent, don't write. Note the asymmetry is the whole point: **only a forward-moving version bump is allowed to destroy anything.**

Additive changes do not need a bump. `readInventory()` and `readRoomState()` normalize: a slot added since the player's last visit reads as empty, a wrong-typed slot is discarded rather than trusted.

---

## Inventory (`inventory.ts`)

The contract's shape, with two revisions, both documented in the source:

**`almonds` split into `almonds` + `almondsSpent`.** The contract annotated one field "consumed/held", which are opposite states. They have to be separable so the "almonds — 4 of 16" counter doesn't run backwards when the player feeds a mouse, and so the mouse trade can know which almond bought which fragment. Both are still flat string arrays; `almondsEverFound()` unions them for the counter.

**`artFragments` ids are composite.** `AlmondSpec.scrap` is `{ cardId, pieces }` — one *This Thing* card is several fragments — so a bare cardId can't address a single fragment. Ids are `` `${cardId}#${pieceIndex}` ``.

`collect(slot, id)` is the one writer. It is idempotent — finding the same object twice, or reloading mid-animation, must never produce "keys — 17 of 16" — and it mirrors `dolls` and `keys` into the shared arrays by union. Note that **`dolls` is not derivable from `dollParts`**: the Gorilla Prince is canonically never redeemed, so his body and leg sit in `dollParts` forever and no `gorilla` doll is ever written. `/in/` must not infer one from the other.

---

## Per-room state, and the visit/pass loop

`evernost:house:room:<roomId>` holds `{ found, requested, visits, spots?, messTotal? }`.

**`found` and `requested` are two collections answering two questions, and neither contains the other.**

- `found` — every object ever tidied here, cumulative. Answers *what is left in the mess?*
- `requested` — every object this room has ever **named out loud**, cumulative. Answers *what have I already asked for?* It is the anti-repeat ledger, and it is the only thing stopping a second visit from opening by naming the lamp again.

A player finds things nobody asked for — most clicks are like this. A player is asked for something and leaves without finding it. Collapsing these into one set is the failure the brief flags: if requests were drawn only from the not-yet-found pool, a room the player had already cleared could never ask for anything again, and the final cleanup pass would have nothing to be the last pass *of*.

### How a room decides what to request

Specified, not implemented.

```
pool(room)      = room.objects where kind === 'named' && !partOf     // == buildList()'s filter
candidates      = pool(room) − requested − found
request         = up to HOUSE_CONFIG.requestsPerRound (3) drawn at random from candidates
```

Subtracting `found` is what stops the room asking for something already tidied away. Subtracting `requested` is what guarantees no repeats across visits — and because `requested` only ever grows and is never pruned, that guarantee holds across sessions, not just within one.

A visit runs up to `roundsPerVisit` rounds; when the three named things are all found, the room may issue another three. `roundsPerVisit: 1` is "three and out"; higher is Nora's "a few series of three". One config value, no code change.

### How a room knows it has entered final-pass mode

**Derived, never stored:**

```
isFinalPass(room) = pool(room).every(id => found.includes(id) || requested.includes(id))
```

i.e. *there is nothing left I could ask for that I haven't already asked for.* A stored boolean would be a second source of truth that can desync from the two sets that actually decide it; a derived predicate cannot.

Two consequences worth stating out loud. Something requested but never found still counts toward the trigger, so ignoring a request hastens the final pass rather than deferring it forever — correct, and it falls into the mess like everything else. And the balcony, whose pool is empty, is trivially in final-pass mode on visit one, which `every()` on an empty array gives for free.

In final-pass mode the room stops naming things and shows the exhaustive counter instead:

> **the mess — 4 of 18**

`freezeMessTotal()` stores the denominator the first time final-pass mode is entered, so the number the player was shown never moves under them.

**One open question for Nora, cheap to change either way:** is 18 *the objects still loose when the final pass began* (my reading, and what `freezeMessTotal` implements — the counter then runs 0→18 and finishes at 18 of 18), or *everything in the room* (in which case it starts at, say, 24 of 42 and the early progress is invisible)? I built the first because it reads as progress rather than as a reminder of how much was already done. Say the word and it's a one-line change.

---

## Two open flags

Both are **flags, not decisions**. They exist so tomorrow's feature code can be written against both answers, and so the hidden-object game and the `/in/` version can differ without a fork. Neither is resolved here, and neither should be resolved in code.

| `HOUSE_CONFIG` | Default | Meaning |
|---|---|---|
| `persistObjectPositions` | `true` | an object sits where it sat last visit (stored in `RoomState.spots`) vs. re-rolling placement on entry, which is today's behaviour |
| `dateGating` | `false` | content gated by the February date vs. everything always available |

Defaults follow the brief: persist positions, no gating. Note that persist-positions is a *behaviour change* from today's `assignSpots()` — it changes nothing yet because nothing is wired, but it is the flag most likely to surprise someone during migration step 7.

`dateGating` has an obvious implementation when it's wanted: `/in/` already keeps `evernostianNow` and `limitOfFebruaryForesight` in unprefixed localStorage, and the house is same-origin, so reading them is free. It is deliberately not read today.

---

## The `/in/` handoff

`/in/` reads two keys and nothing else. It should never parse an `Inventory`; the shared arrays are deliberately the smaller, dumber surface.

```ts
readSharedDolls(): string[]   // evernost:shared:dolls — dolls made whole
readSharedKeys():  string[]   // evernost:shared:keys  — key ids held
```

**What `/in/` may assume:** both are arrays of strings, or absent. Ids are stable and match the house's own object ids (`ragged`, `curly`, …; `key1`…`key16`).

**What `/in/` must tolerate, all as ordinary cases and none as errors:**

- **Absent entirely** — a player who has never opened the house. Graceful absence is the default case: `[]`, no throw, no prompt, and ideally an invitation rather than a lock. The house is not yet public; for a while, *every* `/in/` player will be this player.
- **Partial** — dolls present, keys absent, or either half-filled.
- **Unknown ids** — the house adds a doll `/in/` has never heard of. Ignore it silently.
- **Corrupt JSON** — same as absent.
- **`ensureSchema()` returning `future`** — treat shared state as absent, and do not write.

**Both readers are total.** Absence, corruption, wrong types and unknown ids all resolve to a plain array. There is no path from "the player never opened the house" to an error.

**The array is shared, not owned.** key13 is found in `/in/`, so `/in/` calls `grantKeys(['key13'])` and the house's own key finds union into the same array. Every cross-site array write goes through `unionIntoShared()` — never `writeShared` with a whole array. This corrects `00-CONTRACTS.md` §1, which lists `evernost:shared:keys` as house-owned; it should read *house + in, append-only*.

`/in/` must never write `evernost:house:*`. The house must never write `/in/`'s unprefixed legacy keys.

---

## Testing

No test runner exists and adding one would have meant touching `package.json`, which this lane wasn't allowed to do. `state.selftest.ts` runs on the `esbuild` already in `dependencies`, against the memory backend, with no DOM and no Parcel:

```
npx esbuild src/state/state.selftest.ts --bundle --platform=node \
  --outfile=/tmp/selftest.js && node /tmp/selftest.js
```

**42 assertions, all passing.** `npx tsc --noEmit` is clean across the repo. The self-test is never imported by `house.ts`, so Parcel never sees it and it does not ship; delete it the day a real runner lands.

---

## Migration checklist

Ordered. Each step is independently shippable and leaves a working game. **The order is the deliverable** — several of these are safe only after an earlier one.

**1. Land `src/state/` unwired.** ← *this is what exists now.* New files only; `house.ts` untouched. Nothing can break.

**2. Call `ensureSchema()` at boot,** first line of `house.ts`'s entry, before `enterRoom`. Still nothing reads state, so this is a no-op with a stamp. *If done later:* a player whose stored state predates a change gets read by step 3 before anyone checked whether it was still valid — half-migrated state, wiped mid-session.

**3. Move found-state into `RoomState`.** `enterRoom` calls `recordVisit(room.id)` and marks objects found from `readRoomState(...).found`; `find()` calls `recordFound(room.id, obj.spec.id)`. `state.objects[].found` becomes a cache of persisted truth rather than the truth. *Must follow 2.* This is the first step a player can see, and the first that can lose data — do it alone, in its own commit.

**4. Move `fusionsDone` into `Inventory.dolls`,** via `collect('dolls', f.id)` in `restoreDoll()`, and record parts with `collect('dollParts', id)` in `find()`. *Must follow 3* — `restoreDoll` fires off the back of found parts, so if found-state isn't persistent yet the doll un-assembles on reload while its parts stay found.

**5. Route the counters through inventory.** `updateCounter()` currently counts `state.objects` — this room, this session. Moving it to `countOf(slot)` changes the semantics to cumulative-across-rooms, which is the intent but is a visible change to what the numbers mean. *Must follow 3 and 4* or every counter reads zero.

**6. Replace the auto-advance in `updateList()`.** It currently calls `enterRoom(ROOMS[i+1])` cyclically on `allFound()`, and it does so in the same tick it reveals the "Nothing here is abandoned now" banner — so the banner has never actually been seen. This is the one step that *removes* behaviour, so it goes late, and **not before a real room-to-room flow exists** — otherwise you clear a room and nothing happens, and the game is unplayable. Pair it with the same commit that introduces the exit, whatever that turns out to be (map, key gate, or just a door).

**7. Position persistence behind the flag.** `assignSpots()` reads `RoomState.spots` when `persistObjectPositions` is true, and `recordSpots()` writes them on first assignment. *Must follow 3*, same record. Expect this one to look like a bug the first time you see it — the room stops re-shuffling.

**8. Requests and final-pass mode.** The loop specified above, replacing the to-find list with the three-at-a-time panel plus the mess counter. *Must follow 3 and 6* — the request pool is read from `RoomState`, and while the auto-advance is still in place you'd be teleported out before a second visit could ever happen, so the anti-repeat ledger would never be exercised.

**Out of scope for this lane and untouched:** keys and the map, almonds and mice, dolls, the zine and IndexedDB, lunes, every scene file, every special effect. Cross-room fusion (finding 1 above) is the one item that has no home on this list yet and needs one.
