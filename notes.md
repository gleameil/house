## TODO
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
- collapsible list (right now obscures the scene)

## DESIGN DECISIONS
- A shifting subset of a room's objects are collectible?
  - No, the goal is tidying — get all of the objects and have them hidden away (garbage can?)
  - Animations indicating where they go? They fly to the correct locations? post-mvp?
- Number of rooms
  - 4.5 plus (maybe later) text-based
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
