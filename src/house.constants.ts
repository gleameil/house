// house.constants.ts
// Interfaces live alongside constants, matching /in/ and /out/ convention.

import roomBedroom from 'url:../assets/room-bedroom.jpg';
import album from 'url:../assets/album.png';
import envelope from 'url:../assets/envelope.png';
import garbage from 'url:../assets/garbage.png';
import heart from 'url:../assets/heart.png';
import locket from 'url:../assets/locket.png';
import mirror from 'url:../assets/mirror.png';
import mouse from 'url:../assets/mouse.png';
import paper from 'url:../assets/paper.png';
import jordanAssembled from 'url:../assets/jordan.png';
import jordanBody from 'url:../assets/jordan-body.png';
import jordanHead from 'url:../assets/jordan-head.png';

/**
 * 'named'     — appears by name in the to-find list (one-offs, keys, dolls).
 * 'paperBall' — anonymous; the list shows only a counter.
 */
export type HiddenObjectKind = 'named' | 'paperBall';

/** A candidate placement. Coordinates are the object's CENTER as a
 *  fraction of the room's width/height; width is a fraction of room width. */
export interface Spot {
  x: number;
  y: number;
  width: number;
  /** degrees, clockwise; hit test inverse-rotates the click, so rotation is safe */
  rotation?: number;
}

export interface HiddenObjectSpec {
  id: string;
  name: string;
  kind: HiddenObjectKind;
  image: string;
  /** one spot is chosen at random each visit — this is the shuffle */
  spots: Spot[];
  /** if set, this object is a piece of a FusionSpec and is listed there,
   *  not under its own name */
  partOf?: string;
}

/** A doll (or any broken thing) that reassembles when all its parts are
 *  found. Restoration plays as a cutscene, then the whole doll stands in
 *  the room at `restoredSpot`. */
export interface FusionSpec {
  id: string;
  name: string;
  /** the undivided original artwork — the seam disappears because the
   *  composite of parts is replaced by this image */
  assembled: string;
  /** object ids, head last (the last-found piece animates into place;
   *  the head is the piece that seats with the squeeze) */
  partIds: [string, string];
  /** where the head's center lands, as fractions of the assembled image */
  headLanding: { x: number; y: number };
  /** where the restored doll stands afterwards */
  restoredSpot: Spot;
}

export interface RoomSpec {
  id: string;
  name: string;
  background: string;
  aspectRatio: number;
  /** render order = array order; later entries sit on top and win ties */
  objects: HiddenObjectSpec[];
  fusions: FusionSpec[];
}

/** Alpha threshold (0–255) above which a pixel counts as clickable. */
export const ALPHA_THRESHOLD = 10;

export const BEDROOM: RoomSpec = {
  id: 'bedroom',
  name: "the children's room",
  background: roomBedroom,
  aspectRatio: 1920 / 1080,
  objects: [
    {
      id: 'mirror',
      name: 'the hand mirror',
      kind: 'named',
      image: mirror,
      spots: [
        { x: 0.205, y: 0.24, width: 0.045, rotation: 8 },
        { x: 0.8, y: 0.3, width: 0.045, rotation: -12 },
      ],
    },
    {
      id: 'album',
      name: 'the album',
      kind: 'named',
      image: album,
      spots: [
        { x: 0.705, y: 0.38, width: 0.05 },
        { x: 0.585, y: 0.9, width: 0.055, rotation: -20 },
      ],
    },
    {
      id: 'envelope',
      name: 'the sealed envelope',
      kind: 'named',
      image: envelope,
      spots: [
        { x: 0.47, y: 0.54, width: 0.04, rotation: 14 },
        { x: 0.335, y: 0.68, width: 0.045, rotation: -30 },
      ],
    },
    {
      id: 'locket',
      name: 'the locket',
      kind: 'named',
      image: locket,
      spots: [
        { x: 0.528, y: 0.7, width: 0.022 },
        { x: 0.1, y: 0.7, width: 0.024, rotation: -6 },
      ],
    },
    {
      id: 'mouse',
      name: 'the mouse',
      kind: 'named',
      image: mouse,
      spots: [
        { x: 0.635, y: 0.885, width: 0.055 },
        { x: 0.77, y: 0.965, width: 0.055, rotation: 4 },
      ],
    },
    {
      id: 'garbage',
      name: 'the garbage',
      kind: 'named',
      image: garbage,
      spots: [
        { x: 0.895, y: 0.9, width: 0.055, rotation: 6 },
        { x: 0.29, y: 0.44, width: 0.045, rotation: -4 },
      ],
    },
    {
      id: 'heart',
      name: 'the heart',
      kind: 'named',
      image: heart,
      spots: [
        { x: 0.225, y: 0.79, width: 0.03, rotation: -18 },
        { x: 0.115, y: 0.945, width: 0.028, rotation: 24 },
      ],
    },
    {
      id: 'paper-1',
      name: 'a ball of paper',
      kind: 'paperBall',
      image: paper,
      spots: [
        { x: 0.425, y: 0.84, width: 0.032, rotation: 10 },
        { x: 0.735, y: 0.6, width: 0.03, rotation: -40 },
      ],
    },
    // --- Jordan, in two pieces -------------------------------------------
    {
      id: 'jordan-body',
      name: "Jordan's body",
      kind: 'named',
      partOf: 'jordan',
      image: jordanBody,
      // lying on the rug among the drawn fallen dolls
      spots: [{ x: 0.5, y: 0.575, width: 0.04, rotation: 78 }],
    },
    {
      id: 'jordan-head',
      name: "Jordan's head",
      kind: 'named',
      partOf: 'jordan',
      image: jordanHead,
      // on the bed, near the teddy bear
      spots: [{ x: 0.155, y: 0.705, width: 0.048, rotation: -14 }],
    },
  ],
  fusions: [
    {
      id: 'jordan',
      name: 'Jordan — the ragged doll',
      assembled: jordanAssembled,
      partIds: ['jordan-body', 'jordan-head'],
      headLanding: { x: 0.5, y: 0.115 },
      restoredSpot: { x: 0.328, y: 0.63, width: 0.048 },
    },
  ],
};
