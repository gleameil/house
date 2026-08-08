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
- match suits to rooms (keys, almonds, scribbles, scrawls)
- spare room art
- fusions across rooms, collectibles across rooms (persistent inventory from menu)

## BUGFIXES:
~~- objects do not overflow the scene~~
- collapsible list (right now obscures the screen)

Design decisions:
- A shifting subset of a room's objects are collectible?
  - No, the goal is tidying — get all of the objects and have them hidden away (garbage can?)
  - Animations indicating where they go? They fly to the correct locations?
- Number of rooms
  - 4.5 plus text-based
- Sordid rooms
  - Yes, carefully
- Word-only rooms
  - Yes, very much so
- SD rooms (part of map? part of Out? a creepy night experience *until* Beloved?)
