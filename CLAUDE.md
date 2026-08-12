# CLAUDE.md — `/house/`

This file orients an AI assistant (or future developer) to the `house` repo. Read this before touching anything. For the broader *Of Evernost* project context, read `PROJECT-CLAUDE.md` in the project root and `docs-in/doc-february-dolls.md` for how this piece connects to the DOLLS redemption engine.

---

## What This Is

`house` is **the Abandoned House** — a hidden-object game and one of the seven environments of *Digital February*, the net art that redeems the tragedies of *Of the Abandoned*. In the fiction, it unlocks February 8 (Brook's birthday). The player searches rooms of a house for objects that don't belong there and tidies them away.

The loot table carries the ethics, not just the mechanics:
- **Named objects** (books, doll parts) — one-offs; significant items, including fossil-fragments meant to eventually flow into the DOLLS game in `/in/`
- **Paper balls** — repeats; what survived discarding, tied to one poetry book
- **Scraps** — windblown day-artwork fragments, freely scattered (currently the only kind used in the balcony room)
- **Almonds** — repeats; carry a message and are meant to be traded to mice for poem-fragments (mice not yet implemented — see Known Debt)
- **Keys** — repeats; room progression currency (not yet wired to actually unlock anything — see Known Debt)

Target scope is **~13 rooms**. Five exist today: the broom closet, master bathroom, spare room, balcony, and children's bedroom.

No framework — vanilla TypeScript, bundled with Parcel, same as `/in/` and `/out/`. No backend. Currently **no persistence at all**: progress lives only in the in-memory `state` object in `house.ts` and is lost on reload. This repo is not yet deployed anywhere.

---

## Architecture in One Page

The entire engine is two files:

```
house.constants.ts   data: asset imports, types, HIDDEN_OBJECT_KINDS, room specs, ROOMS
house.ts              engine: hit-testing, placement, find flow, fusion cutscene, room transitions
```

```
enterRoom(room)
  ├── tear down any existing '.house' DOM
  ├── load background + all object images, cache per-pixel alpha for each
  ├── assignSpots(room)        pick a Spot per object (see placement strategies below)
  ├── render objects + buildList(room) (the "to find" panel)
  └── wire up container click → onRoomClick

onRoomClick(event)
  └── walk state.objects top-to-bottom (last-rendered wins ties), hit-test via
      cached alpha at the clicked pixel; first opaque hit → find(obj); else → missRipple()

find(obj)
  ├── mark found, fade out via CSS class, updateList()
  └── if obj completes a FusionSpec's parts → runFusion() after a beat

runFusion(f) → cutscene (body appears, head descends, "the squeeze", crossfade to
  the undivided assembled artwork) → click to dismiss → restoreDoll() places the
  whole doll in the room and marks the fusion done

updateList() also checks allFound() — when a room is fully cleared, it currently
auto-advances to the next room in ROOMS (cyclically). This is a placeholder for
real room-to-room progression (see Known Debt).
```

### Placement strategies (`PlacementStrategy`)
Every `HiddenObjectKind` declares how its instances get positioned, read in `assignSpots()`:
- **`individualSpotLists`** (`named`) — the object supplies its own `spots: Spot[]`; one is chosen at random each visit.
- **`sharedSpotList`** (`paper`, `almond`, `key`) — the *room* supplies one pool of spots per kind (`room.sharedSpots[kind]`). The pool is shuffled and handed out one-per-object, so two objects of the same kind never land on the same spot in the same room. Under-provisioning a pool throws at room-entry time rather than silently colliding — a deliberate fail-loud choice.
- **`random`** (`scrap`) — a free-floating random `{x, y}` each visit.

### Hit-testing
One click listener on the room container, not per-object. Each object's alpha channel is cached to a `Uint8ClampedArray` on load (`cacheAlpha`); a click is mapped from screen space into the object's natural pixel space (inverse-rotated if the spot has `rotation`), and a transparent pixel falls through to the object beneath it, or to `missRipple()`. This is why `.hidden-object` is `pointer-events: none` in CSS — the DOM does no hit-testing at all.

### Fusion (doll reassembly)
Objects with `partOf` on a `NamedSpec` belong to a `FusionSpec` and are excluded from their own line in the "to find" list — they're listed under the fusion's name instead, as an "N of 2 pieces" count. Once both parts are found, `runFusion()` plays a fixed cutscene (body, then head descending with "the squeeze," then crossfade to the single `assembled` artwork — no seam, because the original artwork never had one) before `restoreDoll()` seats the whole doll in the room permanently.

---

## Conventions

**Models live in the constants file**, alongside the data, matching `/in/` and `/out/` convention. `HiddenObjectSpec` and its per-kind subtypes (`NamedSpec`, `PaperSpec`, `AlmondSpec`, `KeySpec`, `ScrapSpec`) are discriminated by `kind`; look there first for any type.

**Render order = z-order.** `room.objects` array order determines both hit-test priority (last wins) and visual stacking. There is no separate z-index concept.

**No `cursor: pointer` anywhere, ever.** Commented directly in `house.css`: a hover tell is a hint system, and hint systems should be designed deliberately, not leaked as a side effect of default cursor styling.

**Asset imports** follow the same Parcel `url:` prefix pattern as `/in/` and `/out/` (`import x from 'url:../assets/x.png'`), grouped by room with a comment header in `house.constants.ts`.

**`COUNTABLE_KINDS`** drives the auto-generated counters (e.g. "keys — 2 of 5") in the to-find panel; if you add a kind that should show a running count, add it there.

---

## Known Debt / Not Yet Built

Tracked more informally in `notes.md`, but the load-bearing ones:

1. **Mice are unimplemented.** `MouseSpec` is fully typed in `house.constants.ts` but never referenced from `house.ts` — no mouse rendering, scurrying, or almond-for-poem-scrap trade exists yet.
2. **Keys don't unlock anything.** `KeySpec.roomId` is defined but never read. Room-to-room progression is currently just "clear the room → advance to `ROOMS[i+1]` cyclically" in `updateList()` — a placeholder, not real gating.
3. **No persistence.** Found-state, fusions, and room order all live in the module-level `state` object and vanish on reload. This blocks the eventual `/in/` connection (fossil-fragments need to survive a page navigation to reach the DOLLS game).
4. **The "to find" list can obscure the scene** on narrow viewports — flagged in `notes.md`, not yet fixed. A collapsible panel is the likely fix.
5. **Only 5 of ~13 planned rooms exist**: broom closet, master bathroom, spare room, balcony, children's bedroom.
6. **Object effects are unbuilt**: the dinosaur roar, toy bunny → live bunny, fairy sparkle, music box tune, and mirror light-ripple are all still just static art per `notes.md`.
7. **No connection between `/in/` and `house/`** yet — this is the single biggest architectural gap before DOLLS can consume this game's output. Needs a persistence + handoff design, not just a URL param (contrast with the `/in/`↔`/out/` query-param contract, which works because both sides are stateless per-visit).

---

## Deployment

Not yet live. There is no `.github/workflows/`. `/in/` and `/out/` are each their own repo under the same GitHub owner, each deployed as a GitHub Pages **project site** via a `Setup Node → npm install → npm run build → upload-pages-artifact → deploy-pages` Actions workflow, landing at `gleameil.github.io/in` and `gleameil.github.io/out` respectively. `house` is structured identically (own repo, own `package.json` with a `build` script producing `dist/` via `parcel build index.html --public-url ./`) and should follow the same pattern to land at `gleameil.github.io/house`.
