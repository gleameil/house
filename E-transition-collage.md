# Lane E — Transition collage & mirror flash (Sonnet, half a day)

## Read first
`PROJECT-CLAUDE.md`, `Sleepers_Awake__February.md`, `doc-house-state.md`, then the house repo.

## What this is
Room-to-room transitions are currently instantaneous and flashlike. They should fade out to a
drifting collage of text from *Sleepers Awake — February*, hold, and fade into the next scene.
The mirror's white flash should briefly reveal text too — but **not the same text**.

## The register split — this is the design, don't collapse it

Two moments, two voices, drawn from two different parts of the source.

**Transitions use the fossil's register.** Third person, impersonal, in motion, not
understanding what it is doing. This is the mode of moving through a house without knowing
why, which is exactly what a transition is. Draw from the epigraph and the movement prose.

**The mirror uses Jenny's register.** Second person, direct address, the question of who is
being spoken to. The mirror is where "you" lives. Draw from the "Whom, precisely, do I
address?" passage in section 1.

If the two pools mix, both moments lose their character. Keep them as separate constants.

## Transition pool — the fossil

Verbatim from the source. Use as-is; do not paraphrase, do not add.

```
need alone
a ghost, a cloud of dust
through gray expanses
For days or aeons, it had roamed
it knew it would not know the needed
even if, against all chance
the needed came
or was it wood?
if mind it had
unmoved by the cold wind
the remains of a wall
baffled wonderment
it changed its mind
and kept the paper in its hand
nothing to its satisfaction
it did stop frequently to glance wonderingly at the keys
The door swung open
```

The epigraph lines carry the most weight — *need alone*, *the needed came*, *it knew it would
not know the needed*. Weight the draw toward those rather than drawing flat-random, or the
transitions read as a word salad instead of a refrain.

## Mirror pool — Jenny

```
Whom, precisely, do I address?
There are several options. I vacillate among them.
Surely, you, reader, are part of you whom I address.
Perhaps you are God. There — I said it.
a listener, a lover, who is everything I might want him to be
I want to be Jennie.
```

The mirror flash is brief — one fragment, not a collage. Different fragment each time, cycling
rather than random so the sequence is legible to a player who clicks repeatedly.

## Mechanics

- Fade out → collage → fade in. Total budget ~1.2–1.8s. Tune by feel; err short. A transition
  the player has seen forty times must not become a toll booth.
- **Skippable.** Any click or keypress during the collage jumps straight to the next scene.
  Non-negotiable.
- **`prefers-reduced-motion`** collapses drift to a static hold, and shortens the whole thing.
- Fragments drift — slow translate plus opacity, staggered entry, overlapping. Text can
  overlap text; illegibility in places is fine and correct. Not centered, not a list.
- 5–9 fragments per transition. No repeats within a single transition.
- Pure CSS animation where possible. No new dependency.

## The banner

`updateList()` currently reveals a "Nothing here is abandoned now" banner and calls
`enterRoom()` for the next room **in the same tick**, so the banner has never once been seen.
The collage is where it finally gets a beat: banner → hold → fade → collage → next scene.

**Do not remove or restructure the auto-advance.** That is migration step 6 in
`doc-house-state.md` and belongs to whoever executes the checklist. Insert the transition
*around* the existing call and leave the call itself intact. If that turns out to be
impossible without touching the advance logic, stop and say so rather than doing it.

## Constraints
- **Touch nothing in `src/state/`.** This lane must remain mergeable in any order relative to
  the migration.
- Do not gate the collage on state. It should work identically before and after the migration
  lands.
- Do not add a per-room collage variation yet. One shared pool, weighted. Per-room text is a
  content decision for Nora, and building the hook for it is enough.

## Definition of done
Transitions and mirror flash both working, skippable, reduced-motion respected, banner visible
for the first time. Two clearly separated text constants with a comment explaining why they are
separate. `git diff` shows no file under `src/state/`.
