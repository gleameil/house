## Today's split (2026-08-12)

Reorganized from the TODO below by what's blocking what. See `CLAUDE.md` for
the engine architecture and full known-debt list this maps onto.

**Placeholder policy:** anywhere a key/almond/scrap needs message text, ship
a placeholder now (e.g. `"[placeholder: key-3 text]"`) rather than waiting.
Nora will hand over a CSV of the real id→text associations later today;
build the lookup so dropping that CSV in is the only step left, not a
find-and-replace through room definitions.

### A. Buildable now, no content blockers — good parallel Claude work
- [x] Object flourishes (independent of collection): dinosaur roar, toy bunny → live bunny, fairy sparkle, music box tune, mirror light-ripple. Roar/tune are visual stand-ins (shake/floating note glyphs) since no audio assets exist yet in the repo at all — sound can slot in later without touching the trigger logic.
- [x] To-find list obscured the scene — not narrow-viewport-only as first suspected; the panel runs nearly full-height on any list-heavy room, so it was really a full right-side strip, not a corner. Fixed by pulling in ~15 individual object spot coordinates (across all 4 non-balcony rooms) plus adding a keep-clear rejection zone to the `random` placement strategy (balcony's scraps, which have no authored spots at all — every visit is freshly randomized, so nothing could be "moved" there without an algorithmic fix). Verified overlap-free via automated DOM overlap-rect checks at 1280×800 and 1024×700 across dozens of reloads per room. **Not fixed:** sub-640px viewports, where `#to-find` switches to a full-width layout (see the media query in house.css) — that's a structurally different, bigger version of the same complaint and would need its own pass if it matters.
- [x] Almond found → show text — turned out almonds already had real message text authored per-object (`AlmondSpec.message`), not placeholders, so no CSV/lookup table was needed here after all; just needed the display.
- [ ] Key found → show text (placeholder/lookup approach) — **sequenced after** placing key objects into rooms, see bucket B; no key objects exist yet to attach this to

### B. Buildable now with placeholders, but bigger — needs a bit more design first
- [ ] **Place `paper` and `key` objects + real spot pools into broom closet, spare room, and children's bedroom** (master bathroom already has its almonds; per the resolved concentration rule, spare room gets the most `paper`, broom closet the most `key`). None of these exist in any room yet — this is new placement, not rewiring. Room *i* ↔ `key1`–`key5` for the unlock pair; extra keys can reuse any asset as flavor. `poemId` on `paper` objects can be a placeholder id for now.
- [ ] Mouse mechanic: running animation, accepts almond → drops correct scrap, scrap shown via text-particle effect (biggest single unbuilt piece; see `CLAUDE.md` Known Debt #1)
- [ ] Key → unlock correct room (`KeySpec.roomId` already exists in the type; needs the actual gating logic plus a real room-to-room flow, replacing the current dev cycle-through) — depends on the placement task above
- [ ] "Almonds are for feeding mice" needs to read clearly to a first-time player — thought bubble on the mouse? On the almond? (small UX task, not just code)

### C. Resolved 2026-08-12
- [x] **Kind naming crosswalk** (old notes below use different names than the code): `paper` kind = old "scrawl" — associated with an existing poem, `PaperSpec.poemId`, generic paper-ball asset. `scrap` kind = old "scribble" — has real drawn art (`scribble1–29.png`), currently balcony-only. The lune-writing prompt (old "scrawl effects: invite lune?") actually belongs to `scrap`, not `paper` — confirmed against the old wording, this is a deliberate change, not an inconsistency to fix. Lune-writing itself is bucket E; so is the far-future idea of compiling written lunes into a 13-page zine.
- [x] **Key math**: until the CSV arrives, room *i* ↔ key asset *i* for the first five keys (`key1`–`key5`) as the unlock pair. Any extra key objects placed in a room per the concentration rule below can reuse any of the 16 assets as flavor — not specified further, not worth blocking on.
- [x] **Match suits to rooms**: every room except the balcony gets all three shared-spot kinds (`paper`, `almond`, `key`); the balcony stays `scrap`-only. Concentration by room: **master bathroom = most almonds** (already true in code — 16 vs. 2–3 elsewhere, no change needed), **spare room = most paper balls**, **broom closet = most keys**. Children's bedroom isn't the max for anything — that's fine, not a gap.
  - **Consequence worth flagging**: `paper` and `key` objects don't exist in *any* room yet (checked the code directly) — this isn't rewiring existing objects, it's adding new ones (plus real spot-pool coordinates; `KEY_SPOTS` is currently just `[]`). Sequence matters: place the objects + spots first, then the found-text flourish from bucket A has something to attach to.

### D. Content/creative — Nora
- [ ] Draw the room-navigation map
- [ ] Spare room art (more needed)
- [ ] The poem–almond–key–message CSV (whenever it's ready today)
- [ ] Gather candidate source material for one-off found books/poems: *Of the Abandoned*? *Sleepers Awake* / February? *This Thing*? Poems in `/in/`? (untouched since original note — say if you want a Claude pass at compiling candidates from any of these)

### E. Bigger and explicitly deferred past today unless you want to open it
- [ ] Lune-writing prompt on `scrap` (balcony) objects — design TBD
- [ ] Compiling player-written lunes into a 13-page zine — explicitly "definitely E," further out than the prompt itself
- [ ] Code the map (once drawn/designed)
- [ ] Text-based rooms (engine-level: does the fossil just have a book, or a real text-room engine?) — lower priority per scope decision, "if time"
- [ ] Persistence + cross-room/cross-session inventory (`CLAUDE.md` Known Debt #3) — needed before "fusions/collectibles across rooms" is real
- [ ] `/in/` ↔ `house/` connection (`CLAUDE.md` Known Debt #7) — the single biggest architectural gap, wants its own design conversation before code

---

## Original TODO (kept for reference; superseded by the split above)
- objects that have an extra effect (independent of whether they are collectible):
  - dinosaur roars
  - toy bunny becomes live bunny briefly
  - fairy sparkles (flutters wings?)
  - music box plays a tune
  - mirror makes blinding ripple of light across room
- mouse effects
  - simple running animation?
  - show scrap (text particle effects)
  - accept almond, drop scrap
- key effects
  - show text (text particle effects)
  - unlock correct room
- scribble effects
  - unball? flash text?
- scrawl effects
  - invite lune?
- draw map
- code map
- text-based rooms
  - select text
  - code engine
  - or just have a book for the fossil's wanderings?
- match suits to rooms (keys, almonds, scribbles, scrawls)
- spare room art
- fusions across rooms, collectibles across rooms (persistent inventory from menu)
- connection between in/ and house/

## BUGFIXES:
~~- objects do not overflow the scene~~
~~- collapsible list (right now obscures the scene)~~ — see item A above; decided against building collapse behavior for now

## DESIGN DECISIONS
- A shifting subset of a room's objects are collectible?
  - No, the goal is tidying — get all of the objects and have them hidden away (garbage can?)
  - Animations indicating where they go? They fly to the correct locations? post-mvp?
- Number of rooms
  - ~~4.5 plus (maybe later) text-based~~ — settled 2026-08-12: five rooms is the core scope; text-based rooms only if time allows
- "Sordid" rooms
  - Yes, carefully
- Word-only rooms
  - Yes, if time (hesitancy: some of the objects properly belong in text rooms but I already have them drawn and I like having rich drawn rooms)

## Almond text
- Text should appear when an almond is found
- When a mouse is clicked, they automatically offer the correct scrap for the almond they were given
- How to make it clear that the almonds are for feeding mice ("almond" thought bubble?)
## Key text
- Text should appear when a key is found
- If there are text rooms, each key opens a room
- If there are not, only 5 of 16 keys have any use? Shrink to 13 keys with 5 locks?
## Room list - with text
## Files to include
- Of the Abandoned?
- Sleepers Awake / February
- This Thing
- Poems in /in/
## Poems and art
