// house.constants.ts
// Interfaces live alongside constants, matching /in/ and /out/ convention.

// shared
import mouse from 'url:../assets/mouse.png';
import paper from 'url:../assets/paper.png';
import heart from 'url:../assets/heart.png';

// broom closet
import roomBroomCloset from 'url:../assets/room-broom-closet.jpg';

// spare room
import roomSpare from 'url:../assets/room-spare.jpg';

// balcony
import roomBalcony from 'url:../assets/room-balcony.jpg';

// child's bedroom
import roomBedroom from 'url:../assets/room-bedroom.jpg';
import backpack from 'url:../assets/backpack.png';
import balletShoes from 'url:../assets/balletshoes.png';
import block from 'url:../assets/block.png';
import boardBook from 'url:../assets/boardbook.png';
import brokenWand from 'url:../assets/brokenwand.png';
import bunnyLive from 'url:../assets/bunnylive.png';
import bunnyToy from 'url:../assets/bunnytoy.png';
import crayons from 'url:../assets/crayons.png';
import dollhouse from 'url:../assets/dollhouse.png';
import eBlock from 'url:../assets/eblock.png';
import fairy from 'url:../assets/fairy.png';
import iBlock from 'url:../assets/iblock.png';
import jack from 'url:../assets/jack.png';
import jenn from 'url:../assets/jenn.png';
import jumprope from 'url:../assets/jumprope.png';
import marbles from 'url:../assets/marbles.png';
import musicBox from 'url:../assets/musicbox.png';
import rubiks from 'url:../assets/rubiks.png';
import tRex from 'url:../assets/trex.png';
import tutu from 'url:../assets/tutu.png';
import wallMirror from 'url:../assets/wallmirror.png';
import wand from 'url:../assets/wand.png';
import watercolors from 'url:../assets/watercolors.png';
import raggedAssembled from 'url:../assets/jordan.png';
import raggedBody from 'url:../assets/jordan-body.png';
import raggedHead from 'url:../assets/jordan-head.png';
import curlyBody from 'url:../assets/christy-body.png';
import gorillaBody from 'url:../assets/gorilla-body.png';
import evilBody from 'url:../assets/evil-body.png';
import plusSizeBody from 'url:../assets/plus-size-body.png';
import guyBody from 'url:../assets/guy-body.png';


// master bedroom
import roomMasterBedroom from 'url:../assets/room-master-bedroom.jpg';
import album from 'url:../assets/album.png';
import envelope from 'url:../assets/envelope.png';
import locket from 'url:../assets/locket.png';

// master bathroom
import roomMasterBathroom from 'url:../assets/room-bathroom.jpg';
import airFreshener from 'url:../assets/air-freshener.png';
import boxers from 'url:../assets/boxers.png';
import bra from 'url:../assets/bra.png';
import bug from 'url:../assets/bug.png';
import deodorant from 'url:../assets/deodorant.png';
import gauntlet from 'url:../assets/gauntlet.png';
import knightHelmet from 'url:../assets/knight-helmet.png';
import lighter from 'url:../assets/lighter.png';
import loofah from 'url:../assets/loofah.png';
import lozenge from 'url:../assets/lozenge.png';
import lozenge2 from 'url:../assets/lozenge2.png';
import razor from 'url:../assets/razor.png';
import soap from 'url:../assets/soap.png';
import toiletBrush from 'url:../assets/toilet-brush.png';
import toothbrush from 'url:../assets/toothbrush.png';
import toothpaste from 'url:../assets/toothpaste.png';
import towel from 'url:../assets/towel.png';
import undies from 'url:../assets/undies.png';
import guyHead from 'url:../assets/guy-head.png';

// lady bathroom
import roomLadyBathroom from 'url:../assets/room-lady-bathroom.jpg';
import garbage from 'url:../assets/garbage.png';
import mirror from 'url:../assets/mirror.png';
import bracelet from 'url:../assets/bracelet.png'


/**
 * 'named'     — appears by name in the to-find list (one-offs, keys, dolls).
 * 'scrawl' — anonymous; the list shows only a counter.
 */
export type HiddenObjectKind =
  | 'named'      // one-offs, dolls' parts, keys
  | 'scrawl'    // poem paper-ball
  | 'scribble'   // day-artwork fragment (fields: day 1..29 (no 13), fragmentIndex)
  | 'almond'     // carries {text, works: boolean}
  | 'key'        // carries {keyText, opens?: roomId | null}
  | 'heart';     // stitched-heart emblem token

export interface MouseSpec {       // fauna, not HiddenObjectSpec
  id: string;
  scrap: { cardId: string; pieces: number }; // This Thing card it carries
  hole: { x: number; y: number };  // exit point
  haunts: Spot[];                  // scurry waypoints
}

/** A candidate placement. Coordinates are the object's CENTER as a
 *  fraction of the room's width/height; width 
 * is the fraction of fullWidth perspective dictates for the spot. */
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

export const CHILDRENS_BEDROOM: RoomSpec = {
  id: 'bedroom',
  name: "the children's room",
  background: roomBedroom,
  aspectRatio: 1920 / 1080,
  objects: [
        {
      id: 'jumprope',
      name: 'the jumprope',
      kind: 'named',
      image: jumprope,
      spots: [
        { x: 0.539, y: 0.591, width: 0.148},
        { x: 0.45, y: 0.31, width: 0.1, rotation: -50},
      ]
    },
    {
      id: 'mirror',
      name: 'the mirror',
      kind: 'named',
      image: wallMirror,
      spots: [
        { x: 0.505, y: 0.094, width: 0.1, rotation: 8 },
        { x: 0.505, y: 0.094, width: 0.1, rotation: -9 },
        { x: 0.685, y: 0.094, width: 0.1, rotation: -6 },
      ],
    },
    {
      id: 'backpack',
      name: 'the backpack',
      kind: 'named',
      image: backpack,
      spots: [
        { x: 0.655, y: 0.38, width: 0.085 },
        { x: 0.395, y: 0.78, width: 0.1, rotation: -30 },
        { x: 0.855, y: 0.87, width: 0.155 },
      ],
    },
    {
      id: 'ballet-shoes',
      name: 'the ballet shoes',
      kind: 'named',
      image: balletShoes,
      spots: [
        { x: 0.47, y: 0.54, width: 0.039, rotation: 40 },
        { x: 0.56, y: 0.60, width: 0.041, rotation: -60 },
        { x: 0.47, y: 0.86, width: 0.065 },
      ],
    },
    {
      id: 'block',
      name: 'the block',
      kind: 'named',
      image: block,
      spots: [
        { x: 0.428, y: 0.914, width: 0.032 },
        { x: 0.76, y: 0.944, width: 0.042 },
        { x: 0.41, y: 0.904, width: 0.031 },
      ],
    },
    {
      id: 'board-book',
      name: 'the board book',
      kind: 'named',
      image: boardBook,
      spots: [
        { x: 0.73, y: 0.845, width: 0.0975, rotation: 4 },
        { x: 0.03, y: 0.705, width: 0.0575 },
      ],
    },
    {
      id: 'broken-wand',
      name: 'the broken ribbon wand',
      kind: 'named',
      image: brokenWand,
      spots: [
        { x: 0.165, y: 0.55, width: 0.1, rotation: -36 },
        { x: 0.565, y: 0.54, width: 0.1, rotation: -36 },
      ],
    },
    {
      id: 'bunny-toy',
      name: 'the toy bunny',
      kind: 'named',
      image: bunnyToy,
      spots: [
        { x: 0.025, y: 0.79, width: 0.08, rotation: 47 },
        { x: 0.43, y: 0.22, width: 0.055, rotation: -4},
      ],
    },
    {
      id: 'crayons',
      name: 'the crayons',
      kind: 'named',
      image: crayons,
      spots: [
        { x: .45, y: 0.6, width: 0.028},
        { x: .36, y: 0.526, width: 0.038, rotation: 45},
      ]
    },
    {
      id: 'dollhouse',
      name: 'the dollhouse',
      kind: 'named',
      image: dollhouse,
      spots: [
        { x: 0.56, y: 0.25, width: 0.1},
        { x: 0.77, y: 0.25, width: 0.113, rotation: 10},
      ]
    },
    {
      id: 'e-block',
      name: 'the charm reading "E"',
      kind: 'named',
      image: eBlock,
      spots: [
        { x: 0.46, y: 0.985, width: 0.016},
        { x: 0.51, y: 0.93, width: 0.01},
        { x: 0.48, y: 0.97, width: 0.014},
        { x: 0.55, y: 0.93, width: 0.01},
      ]
    },
    {
      id: 'i-block',
      name: 'the charm reading "I"',
      kind: 'named',
      image: iBlock,
      spots: [
        { x: 0.456, y: 0.83, width: 0.015},
        { x: 0.532, y: 0.86, width: 0.015},
        { x: 0.526, y: 0.84, width: 0.015},
      ]
    },
    {
      id: 'jack',
      name: 'the jack',
      kind: 'named',
      image: jack,
      spots: [
        { x: 0.173, y: 0.74, width: 0.018},
        { x: 0.193, y: 0.74, width: 0.018},
        { x: 0.071, y: 0.7, width: 0.018},
        { x: 0.573, y: 0.7, width: 0.018},
        { x: 0.175, y: 0.55, width: 0.018},
      ]
    },
    {
      id: 'jenn',
      name: 'the broken charm bracelet',
      kind: 'named',
      image: jenn,
      spots: [
        { x: 0.512, y: 0.94, width: 0.06},
      ]
    },
    {
      id: 'marbles',
      name: 'the marbles',
      kind: 'named',
      image: marbles,
      spots: [
        { x: 0.166, y: 0.835, width: 0.048},
        { x: 0.26, y: 0.535, width: 0.048, rotation: 60},
      ]
    },
    {
      id: 'music-box',
      name: 'the music box',
      kind: 'named',
      image: musicBox,
      spots: [
        { x: 0.776, y: 0.397, width: 0.072},
      ]
    },
    {
      id: 'rubiks',
      name: "the Rubik's cube",
      kind: 'named',
      image: rubiks,
      spots: [
        { x: 0.317, y: 0.923, width: 0.048},
        { x: 0.65, y: 0.523, width: 0.032},
        { x: 0.56, y: 0.393, width: 0.026},
      ]
    },
    {
      id: 'trex',
      name: 'the T-Rex',
      kind: 'named',
      image: tRex,
      spots: [
        { x: 0.654, y: 0.42, width: 0.085},
        { x: 0.8, y: 0.52, width: 0.15},
        { x: 0.4, y: 0.9, width: 0.125},
      ]
    },
    {
      id: 'tutu',
      name: 'the tutu',
      kind: 'named',
      image: tutu,
      spots: [
        { x: 0.605, y: 0.82, width: 0.152, rotation: -16},
        { x: 0.05, y: 0.62, width: 0.152, rotation: 50},
      ]
    },
    {
      id: 'wand',
      name: 'the fairy wand',
      kind: 'named',
      image: wand,
      spots: [
        { x: 0.526, y: 0.721, width: 0.079},
        { x: 0.08, y: 0.82, width: 0.09, rotation: -20},
      ]
    },
    {
      id: 'watercolors',
      name: 'the watercolors',
      kind: 'named',
      image: watercolors,
      spots: [
        { x: 0.174, y: 0.8, width: 0.148},
        { x: 0.294, y: 0.55, width: 0.12, rotation: 20},
        { x: 0.467, y: 0.295, width: 0.07, rotation: 20},
      ]
    },
    {
      id: 'paper-1',
      name: 'a ball of paper',
      kind: 'scrawl',
      image: paper,
      spots: [
        { x: 0.425, y: 0.84, width: 0.032, rotation: 10 },
        { x: 0.735, y: 0.6, width: 0.03, rotation: -40 },
      ],
    },
    {
      id: 'fairy',
      name: 'the fairy',
      kind: 'named',
      image: fairy,
      spots: [
        { x: 0.73, y: 0.136, width: 0.076 },
        { x: 0.203, y: 0.90, width: 0.096 },
        { x: 0.172, y: 0.2, width: 0.086},
        { x: 0.04, y: 0.5, width: 0.086},
      ]
    },
    // --- Jordan, in two pieces -------------------------------------------
    {
      id: 'guy-body',
      name: "the guy doll's body",
      kind: 'named',
      partOf: 'guy',
      image: guyBody,
      spots: [
        { x: 0.38, y: 0.471, width: 0.034, rotation: 10 },
      ]
    },
    {
      id: 'ragged-body',
      name: "the ragged doll's body",
      kind: 'named',
      partOf: 'ragged',
      image: raggedBody,
      // lying on the rug among the drawn fallen dolls
      spots: [
        { x: 0.5, y: 0.575, width: 0.031, rotation: 78 },
        { x: 0.487, y: 0.425, width: 0.031, rotation: -18 },
      ],
    },
    {
      id: 'ragged-head',
      name: "the ragged doll's head",
      kind: 'named',
      partOf: 'ragged',
      image: raggedHead,
      // on the bed, near the teddy bear
      spots: [{ x: 0.155, y: 0.705, width: 0.048, rotation: -14 }],
    },
    {
      id: 'gorilla-body',
      name: "the gorilla's body",
      kind: 'named',
      partOf: 'gorilla',
      image: gorillaBody,
      // lying on the rug among the drawn fallen dolls
      spots: [
        { x: 0.589, y: 0.521, width: 0.034, rotation: 78 },
        { x: 0.41, y: 0.93, width: 0.054, rotation: 10 }
      ],
    },
    {
      id: 'plus-size-body',
      name: "the plus-size doll's body",
      kind: 'named',
      partOf: 'plus-size',
      image: plusSizeBody,
      // lying on the rug among the drawn fallen dolls
      spots: [
        { x: 0.487, y: 0.425, width: 0.031, rotation: -48 },
        { x: 0.487, y: 0.425, width: 0.031, rotation: 68 }
      ],
    },
    {
      id: 'curly-body',
      name: "the curly-haired doll's body",
      kind: 'named',
      partOf: 'curly',
      image: curlyBody,
      // lying on the rug among the drawn fallen dolls
      spots: [
        { x: 0.523, y: 0.585, width: 0.031, rotation: 36 },
        { x: 0.63, y: 0.285, width: 0.023, rotation: 80 }
      ],
    },
    {
      id: 'evil-body',
      name: "the evil doll's body",
      kind: 'named',
      partOf: 'evil',
      image: evilBody,
      spots: [
        {x: 0.489, y: 0.465, width: 0.031, rotation: -20},
        {x: 0.299, y: 0.865, width: 0.041 }
      ] 
    }
  ],
  fusions: [
    {
      id: 'ragged',
      name: 'the ragged doll',
      assembled: raggedAssembled,
      partIds: ['ragged-body', 'ragged-head'],
      headLanding: { x: 0.5, y: 0.115 },
      restoredSpot: { x: 0.328, y: 0.63, width: 0.048 },
    },
  ],
};
export const MASTER_BATHROOM: RoomSpec = {
  id: 'master-bathroom',
  name: "the master bathroom",
  background: roomMasterBathroom,
  aspectRatio: 1920 / 1080,
  objects: [
    {
      id: 'air-freshener',
      name: 'the air freshener',
      kind: 'named',
      image: airFreshener,
      spots: [
        { x: 0.16, y: 0.22, width: 0.05 },
        { x: 0.61, y: 0.28, width: 0.08 },
      ]
    },
    {
      id: 'boxers',
      name: 'the boxers',
      kind: 'named',
      image: boxers,
      spots: [
        { x: 0.5, y: 0.82, width: 0.3 },
        { x: 0.12, y: 0.26, width: 0.12 },
      ]
    },
    {
      id: 'bra',
      name: 'the bra',
      kind: 'named',
      image: bra,
      spots: [
        { x: 0.78, y: 0.55, width: 0.1 },
        { x: 0.9, y: 0.36, width: 0.09 },
        { x: 0.34, y: 0.044, width: 0.08 },
      ]
    },
    {
      id: 'bug',
      name: 'the bug',
      kind: 'named',
      image: bug,
      spots: [
        { x: 0.98, y: 0.4, width: 0.03 },
        { x: 0.97, y: 0.76, width: 0.06 },
      ]
    },
    {
      id: 'deodorant',
      name: 'the deodorant',
      kind: 'named',
      image: deodorant,
      spots: [
        { x: 0.73, y: 0.34, width: 0.03 },
        { x: 0.93, y: 0.67, width: 0.07 },
        { x: 0.94, y: 0.4, width: 0.03 },
      ]
    },
    {
      id: 'gauntlet',
      name: 'the gauntlet',
      kind: 'named',
      image: gauntlet,
      spots: [
        { x: 0.36, y: 0.86, width: 0.08 },
        { x: 0.136, y: 0.66, width: 0.07 },
        { x: 0.32, y: 0.044, width: 0.045, rotation: 70 },
      ]
    },
    {
      id: 'knight-helmet',
      name: "the knight's helmet",
      kind: 'named',
      image: knightHelmet,
      spots: [
        { x: 0.58, y: 0.865, width: 0.12 },
        { x: 0.7, y: 0.44, width: 0.08 },
        { x: 0.3, y: 0.46, width: 0.06 },
      ]
    },
    {
      id: 'lighter',
      name: 'the lighter',
      kind: 'named',
      image: lighter,
      spots: [
        { x: 0.95, y: 0.778, width: 0.04 },
        { x: 0.65, y: 0.96, width: 0.05, rotation: -80 },
      ]
    },
    {
      id: 'loofah',
      name: 'the loofah',
      kind: 'named',
      image: loofah,
      spots: [
        { x: 0.88, y: 0.46, width: 0.1 },
      ]
    },
    {
      id: 'lozenge',
      name: 'a lozenge',
      kind: 'named',
      image: lozenge,
      spots: [
        { x: 0.03, y: 0.96, width: 0.02 },
        { x: 0.4, y: 0.59, width: 0.017, rotation: 89 },
      ]
    },
    {
      id: 'lozenge2',
      name: 'another lozenge',
      kind: 'named',
      image: lozenge2,
      spots: [
        { x: 0.03, y: 0.3, width: 0.017 },
        { x: 0.58, y: 0.5, width: 0.02 },
      ]
    },
    {
      id: 'razor',
      name: 'the razor',
      kind: 'named',
      image: razor,
      spots: [
        { x: 0.74, y: 0.92, width: 0.06, rotation: -50 },
        { x: 0.73, y: 0.41, width: 0.06, rotation: -70 }
      ]
    },
    {
      id: 'soap',
      name: 'the bar of soap',
      kind: 'named',
      image: soap,
      spots: [
        { x: 0.76, y: 0.94, width: 0.06 },
        { x: 0.72, y: 0.1, width: 0.04 }
      ]
    },
    {
      id: 'toilet-brush',
      name: 'the toilet brush',
      kind: 'named',
      image: toiletBrush,
      spots: [
        { x: 0.2, y: 0.16, width: 0.06, rotation: -20 }
      ]
    },
    {
      id: 'toothbrush',
      name: 'the toothbrush',
      kind: 'named',
      image: toothbrush,
      spots: [
        {x: 0.28, y: 0.04, width: 0.015, rotation: -40},
        { x: 0.23, y: 0.40, width: 0.02, rotation: -70 }
      ]
    },
    {
      id: 'toothpaste',
      name: 'the toothpaste',
      kind: 'named',
      image: toothpaste,
      spots: [
        { x: 0.24, y: 0.56, width: 0.1 },
        { x: 0.12, y: 0.96, width: 0.13 },
      ]
    },
    {
      id: 'towel',
      name: 'the towel',
      kind: 'named',
      image: towel,
      spots: [
        { x: 0.62, y: 0.54, width: 0.18, rotation: -90 },
        { x: 0.25, y: 0.94, width: 0.2 },
      ]
    },
    {
      id: 'undies',
      name: "the women's underwear",
      kind: 'named',
      image: undies,
      spots: [
        { x: 0.39, y: 0.57, width: 0.1 },
        { x: 0.34, y: 0.7, width: 0.115 },
        { x: 0.124, y: 0.75, width: 0.118 }, 
      ]
    },
  ], // named: toilet paper tube, soap, toothpaste, toothbrush, razor, cockroach, mirror, Ken, breath mint?, deodorant (brand: Sansfoy), towel, loofah, underwear (men's), toilet brush, spary cleaner, underwear (women's), locket?, mop, tapestry-equivalent, barbell, gauntlet, lighter
  fusions: [],
};
export const BROOM_CLOSET: RoomSpec = {
  id: 'broom-closet',
  name: 'the broom closet',
  background: roomBroomCloset,
  aspectRatio: 1920 / 1080,
  objects: [],
  fusions: [],
};
export const SPARE_ROOM: RoomSpec = {
  id: 'spare-room',
  name: 'the spare room',
  background: roomSpare,
  aspectRatio: 1920 / 1080,
  objects: [],
  fusions: []
};
export const BALCONY: RoomSpec = {
  id: 'balcony',
  name: 'the balcony',
  background: roomBalcony,
  aspectRatio: 1920 / 1080,
  objects: [],
  fusions: []
};
export const LADY_BATHROOM: RoomSpec = {
  id: 'lady-bathroom',
  name: "a Lady's bathroom",
  background: roomLadyBathroom,
  aspectRatio: 1920 / 1080,
  objects: [],
  fusions: []
};
export const MASTER_BEDROOM: RoomSpec = {
  id: 'master-bedroom',
  name: 'the master bedroom',
  background: roomMasterBedroom,
  aspectRatio: 1920 / 1080,
  objects: [],
  fusions: []
};


