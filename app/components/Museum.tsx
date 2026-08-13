"use client";

import { Text, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { SRGBColorSpace } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";

import {
  PORTRAIT_HALF_DEPTH,
  PORTRAIT_HALF_Z,
  PORTRAIT_OFFSET_X,
  FORECOURT_DEPTH,
  FORECOURT_HALF_Z,
  HALL_HALF_Z,
  MUSEUM_CENTER_X,
  MUSEUM_CENTER_Z,
  MUSEUM_DEPTH,
  MUSEUM_DOOR_HALF_WIDTH,
  MUSEUM_DOOR_HEIGHT,
  MUSEUM_GROUNDS_ENTER_X,
  MUSEUM_GROUNDS_EXIT_X,
  MUSEUM_HALF_WIDTH,
  MUSEUM_HEIGHT,
  MUSEUM_PLINTH_DEPTH,
  MUSEUM_PLINTH_HEIGHT,
  MUSEUM_WALL,
  ROAD_SURFACE_Y,
} from "./worldGeometry";

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ *
 * The footprint the building is drawn from — and the footprint the CAR
 * is let onto: isOnPavement reads these same numbers to decide where you
 * can drive. The doorway you see is the doorway you drive through only
 * because both come from one object.
 *
 * That coupling is why the defaults live in worldGeometry. Reskinning a
 * museum (name / theme / exhibits) is free. RELOCATING or RESIZING one is
 * not: if you override `geometry`, you MUST feed the same values to
 * isOnPavement, or the visible walls and the invisible collision walls
 * drift apart and the car clips stone or floats through it.
 */
export type MuseumGeometry = {
  depth: number;
  halfWidth: number;
  height: number;
  wall: number;
  doorHalfWidth: number;
  doorHeight: number;
  plinthDepth: number;
  plinthHeight: number;
  hallHalfZ: number;
  forecourtDepth: number;
  forecourtHalfZ: number;
  centerX: number;
  centerZ: number;
  roadSurfaceY: number;
  groundsEnterX: number;
  groundsExitX: number;
};

/** Defaults = the single museum wired into worldGeometry. Pass nothing and
 *  the component renders exactly as it did before this refactor. */
export const defaultMuseumGeometry: MuseumGeometry = {
  depth: MUSEUM_DEPTH,
  halfWidth: MUSEUM_HALF_WIDTH,
  height: MUSEUM_HEIGHT,
  wall: MUSEUM_WALL,
  doorHalfWidth: MUSEUM_DOOR_HALF_WIDTH,
  doorHeight: MUSEUM_DOOR_HEIGHT,
  plinthDepth: MUSEUM_PLINTH_DEPTH,
  plinthHeight: MUSEUM_PLINTH_HEIGHT,
  hallHalfZ: HALL_HALF_Z,
  forecourtDepth: FORECOURT_DEPTH,
  forecourtHalfZ: FORECOURT_HALF_Z,
  centerX: MUSEUM_CENTER_X,
  centerZ: MUSEUM_CENTER_Z,
  roadSurfaceY: ROAD_SURFACE_Y,
  groundsEnterX: MUSEUM_GROUNDS_ENTER_X,
  groundsExitX: MUSEUM_GROUNDS_EXIT_X,
};

/* ------------------------------------------------------------------ *
 * Theme — every colour the museum wears, so one building can be reskinned
 * into another without touching a single dimension.
 * ------------------------------------------------------------------ */
export type MuseumTheme = {
  base: string;
  forecourt: string;
  wall: string;
  facade: string;
  cornice: string;
  column: string;
  plinth: string;
  sign: string;
  signOutline: string;
  exhibitLeftColor: string;
  exhibitLeftEmissive: string;
  exhibitRightColor: string;
  exhibitRightEmissive: string;
  artworkFrame: string;
  artworkPanel: string;
  artworkPanelEmissive: string;
  strip: string;
  stripEmissive: string;
  light: string;
  /* The centrepiece display. Its own tokens rather than borrowing artworkFrame /
   * artworkPanel: those dress the six frames hung on the walls, and a colour
   * picked for the portrait would silently restyle the whole gallery with it. */
  deck: string;
  deckCap: string;
  panelShell: string;
  panelScreen: string;
  panelAccent: string;
  panelText: string;
  panelMuted: string;
  panelLive: string;
};

export const defaultMuseumTheme: MuseumTheme = {
  base: "#575263",
  forecourt: "#46434c",
  wall: "#ddd5c6",
  facade: "#e7e0d2",
  cornice: "#b3a692",
  column: "#f2ece1",
  plinth: "#4a4550",
  sign: "#fbbf24",
  signOutline: "#451a03",
  exhibitLeftColor: "#fca5a5",
  exhibitLeftEmissive: "#ef4444",
  exhibitRightColor: "#7dd3fc",
  exhibitRightEmissive: "#0ea5e9",
  artworkFrame: "#1c1917",
  artworkPanel: "#312e81",
  artworkPanelEmissive: "#4338ca",
  strip: "#fff7ed",
  stripEmissive: "#ffedd5",
  light: "#ffe9c9",
  /* Cold hardware against warm sandstone. The contrast is the point: in a stone
   * room lit by one warm lamp, the one thing glowing cyan reads as the one thing
   * that is switched ON — which is the entire difference between a display and a
   * memorial. */
  deck: "#20262f",
  deckCap: "#2c3440",
  panelShell: "#161b23",
  panelScreen: "#0d1219",
  panelAccent: "#22d3ee",
  panelText: "#e8f7ff",
  panelMuted: "#8aa6bb",
  panelLive: "#4ade80",
};

/** How high above its pedestal an exhibit is seated. Exported because it is a
 *  contract, not a detail: the museum places every exhibit at this one height,
 *  so a shape that wants to STAND on the pedestal rather than hover over it has
 *  to be drawn — or translated — with its underside this far below its origin.
 *  The primitives below are all radius ~0.45 and so seat themselves; anything
 *  built to its own proportions has to do the arithmetic, and this is the number
 *  it does it against. */
export const EXHIBIT_SEAT = 0.45;

/**
 * One piece of one exhibit.
 *
 * `geometry` is the geometry ELEMENT only — the mesh and the lit glow stay with
 * the component, which is what keeps a hall of exhibits looking like one hall
 * however they were supplied.
 *
 * Everything else is an override, and they exist for one reason: an ABSTRACT
 * exhibit wants the museum's own look, because matching is what makes the two
 * plinths read as a set — but a real-world mark cannot have it. A MongoDB leaf
 * in the museum's salmon pink is not a MongoDB leaf, and a logo rendered in the
 * half-metal, low-roughness recipe the abstract solids use is not a logo, it is
 * a boiled sweet in the shape of one. Leave them off and the museum decides.
 */
export type ExhibitPart = {
  geometry: ReactNode;
  color?: string;
  emissive?: string;
  metalness?: number;
  roughness?: number;
  /** Nudge within the exhibit's own frame, before it is turned to face the hall.
   *  Mostly for a face that stands proud of the body behind it. */
  offset?: [number, number, number];
};

/**
 * One thing standing on a pedestal, as a list of parts.
 *
 * A list rather than a single mesh because a real mark is rarely one colour: a
 * MongoDB leaf is two greens meeting at a fold, a Node hexagon is a light face
 * on a dark body. One mesh can carry one material, so a one-mesh exhibit can
 * only ever be a silhouette — which is exactly what these looked like.
 *
 * The parts share one frame and one seat, so they stay registered to each other
 * however many there are.
 */
export type Exhibit = ExhibitPart[];

/** Default exhibit shapes, cycled so a longer hall keeps varying instead of
 *  repeating one form. One part each and no overrides on purpose — these are the
 *  abstract set, and they take the theme's colours and the museum's material. */
export const defaultExhibits = (i: number): Exhibit => [
  {
    geometry:
      i % 3 === 0 ? (
        <icosahedronGeometry args={[0.45, 0]} />
      ) : i % 3 === 1 ? (
        <torusGeometry args={[0.34, 0.13, 12, 24]} />
      ) : (
        <octahedronGeometry args={[0.5, 0]} />
      ),
  },
];

/* ------------------------------------------------------------------ *
 * The centrepiece: a workstation, not a shrine
 * ------------------------------------------------------------------ *
 * This used to be a black frame on a waist-high stone plinth, lit warm, with a
 * name engraved on a plate below it and the same name repeated on the back. Read
 * the list: black frame, catafalque, face held above the viewer, a slab square
 * to the room, all-caps name alone on a plate, no motion. Every one of those is
 * a funeral cue, and together they made a living developer look interred.
 *
 * So the whole thing is rebuilt as the object a developer is actually behind: a
 * display on a low deck, tilted back on an arm, screen lit and running — name,
 * role and a live status on the readout, the stack on the back, and a slow orbit
 * around it so the exhibit is never completely still.
 *
 * What that redesign is allowed to spend is worth stating, because it is the
 * only real constraint here. isOnPavement's hole is TWO DIMENSIONAL: it tests x
 * and z against PORTRAIT_HALF_DEPTH / PORTRAIT_HALF_Z and never looks at y. So
 * the deck cap below is still drawn to exactly those two constants — that part
 * is untouchable — and in exchange every vertical decision is free. Lowering the
 * plinth, floating the head off it, tilting it, hanging an orbit at head height:
 * none of it costs worldGeometry a line.
 */

/** Whose museum this is. `src` is a path under public/ — the image is loaded as
 *  a texture, not an <img>, so next/image is no help here and a plain URL is
 *  what the loader wants.
 *
 *  Everything below `src` is optional and each line simply doesn't render when
 *  missing, so a museum can show a face and nothing else. They live on the type
 *  rather than as literals inside the component for the same reason `name` and
 *  `theme` do: this is one reusable building, and the second one is a prop away. */
export type MuseumPortrait = {
  src: string;
  /** The name, across the readout under the picture. */
  caption?: string;
  /** What they do — the line that stops a name on its own reading as an epitaph. */
  role?: string;
  /** Present tense, next to the live indicator: what they are doing NOW. */
  status?: string;
  /** The stack, as chips on the BACK of the display. The back is what a driver
   *  circling the deck sees, and it used to be the name again on a slab — which
   *  is a headstone however warmly it is lit. This is the fix. */
  tags?: string[];
  /** Width : height of the source file, so a picture that is not square is
   *  matted to fit instead of being stretched to the frame. */
  aspect?: number;
};

/** The deck. Low on purpose — a shrine puts the face above you, a desk puts it
 *  in front of you, and the height is most of the difference.
 *
 *  CAP_DEPTH / CAP_WIDTH are the widest parts and are the collision contract
 *  itself: they ARE PORTRAIT_HALF_DEPTH / PORTRAIT_HALF_Z doubled. Everything
 *  else in this exhibit may be retuned freely; if you change these two, the
 *  invisible hole in the hall floor no longer matches the thing standing in it.
 *
 *  BODY_DEPTH is short for a reason worth knowing before you widen it. The kerb
 *  test takes the car's half-WIDTH as its margin whatever way the car is
 *  pointing, but the car is 3 long — so a car driven nose-first at this exhibit
 *  stops with its CENTRE 2.14 out from the middle, which puts its front wheels
 *  0.82 out and its bumper 0.62. Those numbers are what this deck is cut to: the
 *  lower body clears the 0.28 top by a whisker, and the solid mass is drawn back
 *  inside 0.82 so the wheels never reach it. What the wheels can still reach is
 *  the cap's lip, and the cap is the one part that cannot move. That is the
 *  bargain: an overhang a wheel can tuck under, not a block it drives into. */
const DECK_HEIGHT = 0.28;
const DECK_BODY_DEPTH = 1.5;
const DECK_BODY_WIDTH = 4;
const DECK_CAP_DEPTH = PORTRAIT_HALF_DEPTH * 2;
const DECK_CAP_WIDTH = PORTRAIT_HALF_Z * 2;
const DECK_CAP_THICKNESS = 0.14;

/** The lit inset in the deck's top face — the powered plate the arm grows out
 *  of. Inset well in from the cap: at the full width of the deck it stopped
 *  reading as a light let into a surface and started reading as a tablecloth. */
const DECK_APERTURE_DEPTH = 0.75;
const DECK_APERTURE_WIDTH = 2.4;

/** The display head, and how far it leans back. About six degrees is enough:
 *  a slab standing square to the room is icon geometry, and the tilt is what
 *  makes the same slab read as something angled for someone to work at.
 *
 *  LANDSCAPE, and that is not a style choice — it is the one thing here that had
 *  to be measured. The chase camera seats itself 2.5 up and looks DOWN at the
 *  car's roof, which puts the top of frame only about five degrees above
 *  horizontal; at the distance you actually stop at, anything above roughly 3.3
 *  is outside the picture. A portrait-shaped card tall enough to stack a photo
 *  over three lines of text does not fit under that, and the first build proved
 *  it by cropping the top of his head.
 *
 *  Turning the card on its side is what buys the room back: photo on one half,
 *  readout on the other, and the whole thing tops out under the line. It also
 *  happens to be the better composition — a face beside its details reads as a
 *  profile, where a face above an inscription reads as a plaque. */
const PANEL_HEIGHT = 2.6;
const PANEL_WIDTH = 4.3;
const PANEL_THICKNESS = 0.16;
const PANEL_TILT = 0.11;

/** Clear air between the deck's top and the bottom edge of the head. The arm
 *  spans it, and BOTH the arm's length and its lean are derived from this below
 *  rather than typed — retune the lift or the tilt and the arm still lands on
 *  the deck at one end and inside the head at the other. */
const PANEL_LIFT = 0.44;

/** The glowing rim left proud around the screen, and how far the screen board is
 *  inset from the edge of the head. */
const PANEL_BEZEL = 0.09;
const PANEL_INSET = 0.16;

/** Picture area, and the margin between it and the screen edge it sits against.
 *  Bounded by the screen's HEIGHT on a landscape card, so it is a plain size
 *  rather than a fraction — and it is not large: the source is a 200x200 file,
 *  which does not want enlarging. */
const PICTURE_SIZE = 1.8;
const PICTURE_MARGIN = 0.07;

/** The gutter between the picture and the readout column beside it. */
const READOUT_GUTTER = 0.2;

/** One pass of the scan bar, top to bottom, and how strong it gets at the middle
 *  of that pass. Deliberately faint: additive light over a brightly lit face
 *  washes straight to white, and at anything above about this it stops reading as
 *  a refresh and starts reading either as a rendering seam or — worse, when it
 *  was scoped to the picture alone — as a laser line drawn across someone's eyes.
 *  It sweeps the whole screen for the same reason: a display refreshes, a
 *  scanner targets, and only one of those is what this exhibit is doing. */
const SCAN_PERIOD = 4.2;
const SCAN_THICKNESS = 0.05;
const SCAN_PEAK = 0.3;

/** Rough advance width of an SDF glyph, as a fraction of its font size. Used
 *  only to size the stack chips around their labels: troika measures text
 *  asynchronously, well after this frame's layout, so anything that has to be
 *  sized WITH the text has to estimate it. Erring wide is deliberate — a chip a
 *  little too big reads as padding, one too small reads as a bug. */
const GLYPH_ADVANCE = 0.62;

const CHIP_FONT = 0.16;
const CHIP_PADDING = 0.18;
const CHIP_MAX_STEP = 0.5;
const CHIP_MAX_HEIGHT = 0.34;

/** Above this many, the stack is dealt in two columns instead of one. A landscape
 *  back is wide and short, so a single list of six runs off the bottom while half
 *  the board sits empty either side of it. */
const CHIP_COLUMN_LIMIT = 3;

/* ------------------------------------------------------------------ *
 * The wall gallery
 * ------------------------------------------------------------------ */

/** One hung picture. Everything about it is optional because a gallery gets
 *  hung before it gets filled: a slot with no `src` is a mounted empty frame
 *  with its caption on the board, which is what a wall waiting for prints
 *  actually looks like — and better than a hole that silently isn't there. */
export type GalleryItem = {
  /** Path under public/, loaded as a texture. */
  src?: string;
  caption?: string;
  /** Width : height of the SOURCE file. Wrong values here stretch the picture
   *  rather than raise an error, so it is worth checking the file. */
  aspect?: number;
};

/** How far a frame stands off the wall, the border of frame left around the
 *  board, and the strip of board reserved at the bottom for the caption. */
const GALLERY_FRAME_DEPTH = 0.16;
const GALLERY_REVEAL = 0.22;
const GALLERY_CAPTION_BAND = 0.32;

/** A cap, not a width. Frames are sized to the gap between them so a crowded
 *  wall doesn't overlap itself; without a ceiling, three pictures in a thirty
 *  metre hall would each be hung as a billboard. */
const GALLERY_FRAME_MAX_WIDTH = 3;

/** Clearance the picture rail keeps from what it hangs between: the light strip
 *  above, and the exhibits standing on the plinth below. */
const GALLERY_STRIP_CLEARANCE = 0.35;
const GALLERY_EXHIBIT_CLEARANCE = 0.55;

/* Proportions that describe how ANY of these museums is built rather than
 * which one. Kept internal so the public config stays about size and skin;
 * lift them to props if you ever need to tune the look itself. */
const BASE_THICKNESS = 0.9;
const WALL_SINK = 0.1;
const WING_PROJECTION = 2.6;
const COLUMN_SPACING = 2.3;
const EAVES = 0.6;
const EXHIBIT_SPACING = 4.2;
const PEDESTAL_HEIGHT = 1.1;

/** Column height : diameter, and base radius : top radius. Slenderness rather
 *  than a fixed radius, so a taller portico gets thicker columns instead of
 *  fourteen pencils — 14:1 is about where a stone column still reads as one. */
const COLUMN_SLENDERNESS = 14;
const COLUMN_TAPER = 1.125;

/** What the hall lamp is aimed at: roughly this much light reaching the darkest
 *  point in the room, the far bottom corner. The lamp has decay 2 — inverse
 *  square — so its intensity is this times the SQUARE of that corner's distance,
 *  and a hall that grows by half needs more than twice the lamp. Deriving it
 *  from the corner is what keeps that arithmetic from being done by hand and
 *  forgotten; the pair below reproduce the 310/34 the default hall was tuned to
 *  by eye, which is where both numbers come from. */
const HALL_CORNER_LUX = 0.96;

/** How far past that corner the lamp's `distance` cutoff is pushed. Falloff is
 *  already near-nothing out there, but stopping AT the corner clips it to black
 *  on a hard edge. */
const LIGHT_RANGE_MARGIN = 1.9;

/** Everything positional, derived from one geometry object. Pure, so it
 *  memoises on the geometry reference: the whole layout recomputes only when
 *  you actually hand the museum different dimensions. */
function deriveLayout(g: MuseumGeometry) {
  const HALF_DEPTH = g.depth / 2;
  const HALF_WIDTH = g.halfWidth;
  const INNER_X = HALF_DEPTH - g.wall;

  // Walls run from just under the floor to just under the roof, so touching
  // faces don't fight over the depth buffer.
  const WALL_HEIGHT = g.height + WALL_SINK;
  const WALL_Y = WALL_HEIGHT / 2 - WALL_SINK;

  const PIER_WIDTH = HALF_WIDTH - g.doorHalfWidth;
  const PIER_Z = (HALF_WIDTH + g.doorHalfWidth) / 2;
  const FACADE_X = HALF_DEPTH - g.wall / 2;

  // Wing inner faces sit exactly at the forecourt edge — the pavement test
  // stops the car's flank at that same line, so any further in and it would
  // clip stone before being blocked.
  const WING_INNER_Z = g.forecourtHalfZ;
  const WING_Z = (WING_INNER_Z + HALF_WIDTH) / 2;
  const WING_WIDTH = HALF_WIDTH - WING_INNER_Z;
  const WING_X = HALF_DEPTH + WING_PROJECTION / 2;

  // Columns spaced by a constant, count follows the wing width — a wider wing
  // gets more, not the same pair marooned in the middle.
  const COLUMN_COUNT = Math.max(2, Math.round(WING_WIDTH / COLUMN_SPACING));
  const COLUMN_OFFSETS = Array.from(
    { length: COLUMN_COUNT },
    (_, i) => (i - (COLUMN_COUNT - 1) / 2) * (WING_WIDTH / COLUMN_COUNT),
  );
  const COLUMN_RADIUS = g.height / (2 * COLUMN_SLENDERNESS);

  const ROOF_EDGE_X = HALF_DEPTH + EAVES;

  // Same idea as columns: a longer gallery gets more cases, not wider gaps.
  const EXHIBIT_COUNT = Math.max(
    3,
    Math.round((INNER_X * 2 - 2.5) / EXHIBIT_SPACING),
  );
  const EXHIBIT_X = Array.from(
    { length: EXHIBIT_COUNT },
    (_, i) => (i - (EXHIBIT_COUNT - 1) / 2) * EXHIBIT_SPACING,
  );
  const PLINTH_Z = g.hallHalfZ + g.plinthDepth / 2;
  const PEDESTAL_TOP = g.plinthHeight + PEDESTAL_HEIGHT;

  // Back-wall art and light strips as fractions of the room, so they keep
  // their proportions if the hall height moves.
  const ARTWORK_Y = g.height * 0.49;
  const ARTWORK_HEIGHT = g.height * 0.56;
  const ARTWORK_HALF_Z = g.hallHalfZ * 0.66;
  const STRIP_Y = g.height * 0.43;

  // The picture rail: the band of side wall between the tops of the exhibits and
  // the light strip above them. Derived from both rather than fixed, so a taller
  // hall hangs its pictures higher instead of behind its own sculpture — and so
  // the strip ends up reading as the light the pictures are hung under, which is
  // where a gallery puts it anyway.
  const GALLERY_TOP = STRIP_Y - GALLERY_STRIP_CLEARANCE;
  const GALLERY_BOTTOM = PEDESTAL_TOP + GALLERY_EXHIBIT_CLEARANCE;
  const GALLERY_FRAME_HEIGHT = GALLERY_TOP - GALLERY_BOTTOM;
  const GALLERY_Y = (GALLERY_TOP + GALLERY_BOTTOM) / 2;

  // Hung against the wall's inner face, standing off it by half its own depth so
  // the back of the frame lands flush on the stone.
  const GALLERY_WALL_Z = HALF_WIDTH - g.wall - GALLERY_FRAME_DEPTH / 2;

  // The run of wall the frames are spread over, corners left clear.
  const GALLERY_SPAN = INNER_X * 2 - 3;

  // Inside the frame: mount board, then a caption strip along the bottom and the
  // picture above it. Both offsets fall out of the band's height, which is what
  // keeps the caption off the picture when the hall is resized.
  const GALLERY_INNER_HEIGHT = GALLERY_FRAME_HEIGHT - GALLERY_REVEAL * 2;
  const GALLERY_PICTURE_HEIGHT = GALLERY_INNER_HEIGHT - GALLERY_CAPTION_BAND;
  const GALLERY_PICTURE_Y = GALLERY_CAPTION_BAND / 2;
  const GALLERY_CAPTION_Y =
    -GALLERY_INNER_HEIGHT / 2 + GALLERY_CAPTION_BAND / 2;

  // The hall's one lamp, sized to the room rather than hand-tuned. Its reach is
  // the distance to the far bottom corner of the walled room — not the hall
  // floor: the exhibits stand on the plinths outside that, and they are the
  // things worth lighting.
  //
  // One lamp and not a row of them, however long the hall gets. three.js renders
  // forward, so every light is evaluated for every lit fragment, and each extra
  // pointLight measured ~10ms/frame in this scene (see LIT_LAMP_COUNT in
  // <StreetLamps>). A second one here would cost more than the far end of the
  // room is worth — that end is carried by emissive exhibits and wall strips,
  // which are free.
  const LIGHT_Y = g.height - 1.4;
  const LIGHT_REACH = Math.hypot(INNER_X, HALF_WIDTH - g.wall, LIGHT_Y);
  const LIGHT_INTENSITY = HALL_CORNER_LUX * LIGHT_REACH ** 2;
  const LIGHT_DISTANCE = LIGHT_REACH * LIGHT_RANGE_MARGIN;

  return {
    HALF_DEPTH,
    HALF_WIDTH,
    INNER_X,
    WALL_HEIGHT,
    WALL_Y,
    PIER_WIDTH,
    PIER_Z,
    FACADE_X,
    WING_INNER_Z,
    WING_Z,
    WING_WIDTH,
    WING_X,
    COLUMN_OFFSETS,
    COLUMN_RADIUS,
    ROOF_EDGE_X,
    EXHIBIT_X,
    PLINTH_Z,
    PEDESTAL_TOP,
    ARTWORK_Y,
    ARTWORK_HEIGHT,
    ARTWORK_HALF_Z,
    STRIP_Y,
    GALLERY_FRAME_HEIGHT,
    GALLERY_Y,
    GALLERY_WALL_Z,
    GALLERY_SPAN,
    GALLERY_PICTURE_HEIGHT,
    GALLERY_PICTURE_Y,
    GALLERY_CAPTION_Y,
    LIGHT_Y,
    LIGHT_INTENSITY,
    LIGHT_DISTANCE,
  };
}

/* ------------------------------------------------------------------ *
 * Derived once, at module scope. Everything the display is made of is arithmetic
 * on the constants above and never a typed-in number, because the pieces have to
 * move TOGETHER: retune the tilt and the arm has to re-aim, shrink the picture
 * and the readout has to grow into the space rather than the caption creeping
 * onto the face. That was the one thing the old frame got right, and it is worth
 * keeping through a redesign that changed everything else.
 * ------------------------------------------------------------------ */

const PANEL_HALF_HEIGHT = PANEL_HEIGHT / 2;

/** Where the head sits, and how far its bottom edge swings forward as it leans
 *  back. Both fall out of the tilt: the head is positioned so its bottom edge
 *  lands exactly PANEL_LIFT above the deck whatever angle it is set to. */
const PANEL_BOTTOM_Y = DECK_HEIGHT + PANEL_LIFT;
const PANEL_BOTTOM_X = Math.sin(PANEL_TILT) * PANEL_HALF_HEIGHT;
const PANEL_Y = PANEL_BOTTOM_Y + Math.cos(PANEL_TILT) * PANEL_HALF_HEIGHT;

/** The arm, aimed from the middle of the deck at the middle of the head's bottom
 *  edge. A cylinder points along +y, so the rotation that swings it onto that
 *  line is atan2(-dx, dy) — and the extra length is overlap, sunk half into the
 *  deck and half into the head so neither joint shows a seam. */
const ARM_LENGTH = Math.hypot(PANEL_BOTTOM_X, PANEL_LIFT) + 0.32;
const ARM_TILT = Math.atan2(-PANEL_BOTTOM_X, PANEL_LIFT);
const ARM_X = PANEL_BOTTOM_X / 2;
const ARM_Y = DECK_HEIGHT + PANEL_LIFT / 2;

/* Everything from here is in the HEAD's own frame — measured from the middle of
 * the display, which is why none of it mentions the tilt or the lift. The head's
 * group carries both, so its contents never have to know. */

const PANEL_FACE_X = PANEL_THICKNESS / 2;
const SCREEN_HALF_WIDTH = PANEL_WIDTH / 2 - PANEL_INSET;
const SCREEN_HALF_HEIGHT = PANEL_HALF_HEIGHT - PANEL_INSET;

/* On this card z is the HORIZONTAL axis and y is vertical: the head faces +x, so
 * its contents are laid out in the y/z plane. Viewed from the front, +z is the
 * viewer's LEFT — which is why the picture, on the left of the card, has a
 * positive z, and why the readout column beside it runs off into -z. */

/** The picture, held against the left edge of the screen and centred on the
 *  card's own middle. Bounded by the screen's height here rather than its width,
 *  which is the whole reason a landscape card has room for a column beside it. */
const PICTURE_Z = SCREEN_HALF_WIDTH - PICTURE_MARGIN - PICTURE_SIZE / 2;
const PICTURE_Y = 0;

/** The readout column: the rest of the screen, from the gutter beside the picture
 *  out to the far edge. Its rows are placed as fractions of the screen height and
 *  SIZED as a fraction of the column's width, so the block reproportions itself
 *  rather than three hardcoded numbers drifting apart when the card is retuned. */
const READOUT_START_Z = PICTURE_Z - PICTURE_SIZE / 2 - READOUT_GUTTER;
const READOUT_END_Z = -SCREEN_HALF_WIDTH + 0.14;
const READOUT_WIDTH = READOUT_START_Z - READOUT_END_Z;
const NAME_Y = SCREEN_HALF_HEIGHT * 0.42;
const RULE_Y = SCREEN_HALF_HEIGHT * 0.15;
const ROLE_Y = -SCREEN_HALF_HEIGHT * 0.06;
const STATUS_Y = -SCREEN_HALF_HEIGHT * 0.48;
const NAME_SIZE = READOUT_WIDTH * 0.115;
const ROLE_SIZE = READOUT_WIDTH * 0.072;
const STATUS_SIZE = READOUT_WIDTH * 0.068;

/** The live indicator, sitting at the head of the status line the way a bullet
 *  would — but as geometry, so it can pulse on its own and needs no text metrics
 *  to place. The status line is indented past it; every other row starts at the
 *  column's edge. */
const LIVE_DOT_RADIUS = 0.055;
const LIVE_DOT_Z = READOUT_START_Z - LIVE_DOT_RADIUS;
const STATUS_INDENT = LIVE_DOT_RADIUS * 3.5;

/** The scan bar's travel: the whole screen, edge to edge. */
const SCAN_TOP = SCREEN_HALF_HEIGHT;
const SCAN_BOTTOM = -SCREEN_HALF_HEIGHT;

/** The stack board on the back: a header, then the band the chips are dealt into,
 *  and the two column centres they alternate between. */
const STACK_HEADER_Y = SCREEN_HALF_HEIGHT - 0.2;
const STACK_TOP = STACK_HEADER_Y - 0.34;
const STACK_BOTTOM = -SCREEN_HALF_HEIGHT + 0.14;
const STACK_BAND = STACK_TOP - STACK_BOTTOM;
const STACK_COLUMN_Z = SCREEN_HALF_WIDTH / 2;

/** The depth ladder. Coplanar surfaces z-fight, so each layer of the display
 *  stands one step proud of the one behind it: shell, bezel glow, screen board,
 *  picture, scan bar, text. Six steps is 0.07 of relief — invisible edge-on, and
 *  the reason nothing here flickers. Same ladder mirrored on the back. */
const LAYER = 0.012;
const layerX = (step: number) => PANEL_FACE_X + LAYER * step;
const backLayerX = (step: number) => -PANEL_FACE_X - LAYER * step;

/** Faces for the front and back of the head. The half turn on the back does
 *  double duty exactly as it does on the wall frames: it aims the content out of
 *  the panel AND flips the local axis, so the chips read left-to-right from
 *  behind instead of mirrored. */
const FACE_FRONT: [number, number, number] = [0, Math.PI / 2, 0];
const FACE_BACK: [number, number, number] = [0, -Math.PI / 2, 0];

/**
 * Just the picture. Split out because loading a texture SUSPENDS, and the
 * stonework around it must not blink out of the scene while the file is in
 * flight — so only this much sits under the <Suspense> below.
 *
 * It carries its own glow instead of being lit. A spotlight on the frame is the
 * obvious answer and the wrong one: this renderer evaluates every light against
 * every lit fragment, which is why the hall is down to a single pointLight in
 * the first place. An emissiveMap costs nothing, and on something meant to read
 * as a backlit display it is also the more honest look.
 */
function FittedPicture({
  src,
  aspect = 1,
  fitWidth,
  fitHeight,
  lit,
  position,
  rotation,
}: {
  src: string;
  aspect?: number;
  /** The box to fit inside — the picture area of whatever frame holds it. */
  fitWidth: number;
  fitHeight: number;
  lit: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const loaded = useTexture(src);

  // TextureLoader leaves colorSpace unset, so three reads the file's sRGB bytes
  // as if they were linear and the face comes out dark and muddy. drei's
  // useTexture does not do this for you — check its source before believing
  // otherwise.
  //
  // On a clone, not in place: useLoader caches by URL and hands the SAME Texture
  // to every caller, so setting these on it would reach back through the cache
  // and into anything else that ever loads this file. The clone shares its
  // `source`, so the pixels are still uploaded once.
  const map = useMemo(() => {
    const texture = loaded.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }, [loaded]);

  // Contain, not cover: whichever axis runs out first sets the size and the
  // other is left as mount board. A source that doesn't match its frame gets
  // margins — never a stretched face, and never a cropped one.
  const width = Math.min(fitWidth, fitHeight * aspect);
  const height = width / aspect;

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={lit ? 0.85 : 0.3}
        roughness={0.7}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * The centrepiece, standing in the middle of the hall on its own deck.
 *
 * Positioned in the museum's LOCAL frame, at +x — which is always the door,
 * because `facing` turns the whole building rather than mirroring it. That is
 * what lets one offset serve a museum looking either way; the collision hole in
 * isOnPavement is the only place the two signs have to be spelled out.
 */
function PortraitExhibit({
  portrait,
  theme: t,
  lit,
}: {
  portrait: MuseumPortrait;
  theme: MuseumTheme;
  lit: boolean;
}) {
  const scanBar = useRef<Mesh>(null);
  const scanMaterial = useRef<MeshBasicMaterial>(null);
  const bezelMaterial = useRef<MeshStandardMaterial>(null);
  const apertureMaterial = useRef<MeshStandardMaterial>(null);
  const liveMaterial = useRef<MeshStandardMaterial>(null);

  // Chips dealt into as many rows as the band has room for, rather than at a
  // fixed pitch, so a long stack packs tighter instead of running off the bottom
  // of the board — the same bargain the exhibit cases and the wall frames make
  // with their own runs. Two columns past a short list, because the back of a
  // landscape card is wide and shallow and a single file wastes both halves.
  const chips = useMemo(() => {
    const tags = portrait.tags ?? [];
    if (tags.length === 0) return [];

    const columns = tags.length > CHIP_COLUMN_LIMIT ? 2 : 1;
    const rows = Math.ceil(tags.length / columns);
    const step = Math.min(CHIP_MAX_STEP, STACK_BAND / rows);

    return tags.map((label, i) => ({
      label,
      // Filled across then down, so the reading order is the order they're given.
      // The first column is at NEGATIVE z, because this board is read from
      // BEHIND the head — where the panel's +z is on the viewer's right, not
      // their left. Get the sign wrong and the list is legible but back to front.
      z: columns === 1 ? 0 : (i % 2 === 0 ? -1 : 1) * STACK_COLUMN_Z,
      y: STACK_TOP - (Math.floor(i / columns) + 0.5) * step,
      width: label.length * CHIP_FONT * GLYPH_ADVANCE + CHIP_PADDING * 2,
      height: Math.min(CHIP_MAX_HEIGHT, step - 0.1),
    }));
  }, [portrait.tags]);

  // A sweep, two breaths out of phase, and a blink. Four property writes a
  // frame, no new geometry and — the part that matters in this renderer — NO NEW
  // LIGHT: everything that appears to glow here is emissive, for the same reason
  // the hall is down to a single pointLight.
  //
  // All of it belongs to the SCREEN, and that is a deliberate correction. The
  // first build put a rotating orbit ring around the whole exhibit for the same
  // reason — an exhibit with nothing moving in it reads as something being
  // preserved — but a hairline ring seen from a car is a diagonal line drifting
  // across the face, which reads as a broken renderer, not as an orbit. Motion
  // that lives on a surface that is supposed to be emitting light cannot be
  // mistaken for a glitch, and that turns out to be the whole trick.
  //
  // None of it is gated on `lit`, because it costs the same either way and the
  // dim values it multiplies are what keep the exhibit dark in an empty hall.
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    const pass = (time % SCAN_PERIOD) / SCAN_PERIOD;

    if (scanBar.current) {
      scanBar.current.position.y = SCAN_TOP - pass * (SCAN_TOP - SCAN_BOTTOM);
    }
    // Faded in and out across the pass. Without this the bar teleports back to
    // the top of the picture at full brightness once every SCAN_PERIOD, which
    // reads as a glitch rather than as a refresh.
    if (scanMaterial.current) {
      scanMaterial.current.opacity =
        (lit ? SCAN_PEAK : SCAN_PEAK * 0.35) * Math.sin(Math.PI * pass);
    }
    if (bezelMaterial.current) {
      bezelMaterial.current.emissiveIntensity =
        (lit ? 1.2 : 0.32) * (0.88 + 0.12 * Math.sin(time * 1.6));
    }
    // Off the bezel's beat on purpose. Two things breathing in step read as one
    // thing flashing; out of step they read as a machine with more than one part
    // to it, which is the impression the whole exhibit is after.
    if (apertureMaterial.current) {
      apertureMaterial.current.emissiveIntensity =
        (lit ? 0.75 : 0.2) * (0.78 + 0.22 * Math.sin(time * 0.9 + 1.1));
    }
    if (liveMaterial.current) {
      liveMaterial.current.emissiveIntensity =
        (lit ? 2.6 : 0.7) * (0.5 + 0.5 * Math.sin(time * 2.6));
    }
  });

  return (
    <group position={[PORTRAIT_OFFSET_X, 0, 0]}>
      {/* Deck, and a cap that oversails it. The cap is the widest thing here and
          PORTRAIT_HALF_DEPTH / PORTRAIT_HALF_Z are drawn to it — a box cut to
          the head instead would let the car's nose in under a lip it can plainly
          see. This is the one part of the exhibit that is not free to move. */}
      <mesh position={[0, DECK_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[DECK_BODY_DEPTH, DECK_HEIGHT, DECK_BODY_WIDTH]} />
        <meshStandardMaterial color={t.deck} metalness={0.35} roughness={0.5} />
      </mesh>
      <mesh position={[0, DECK_HEIGHT - DECK_CAP_THICKNESS / 2, 0]} castShadow>
        <boxGeometry args={[DECK_CAP_DEPTH, DECK_CAP_THICKNESS, DECK_CAP_WIDTH]} />
        <meshStandardMaterial color={t.deckCap} metalness={0.3} roughness={0.45} />
      </mesh>

      {/* The lit plate in the deck's top face. Laid ON the cap rather than let
          into it — a hair proud, like every other surface in this exhibit, which
          is cheaper than a hole and doesn't z-fight. */}
      <mesh position={[0, DECK_HEIGHT + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[DECK_APERTURE_DEPTH, DECK_APERTURE_WIDTH]} />
        <meshStandardMaterial
          ref={apertureMaterial}
          color={t.panelScreen}
          emissive={t.panelAccent}
          emissiveIntensity={lit ? 0.75 : 0.2}
          roughness={0.4}
        />
      </mesh>

      {/* The arm. Length and lean both derived, so the head can be re-tilted or
          re-lifted without this having to be re-aimed by hand. Tapered hard, and
          wide at the foot: a uniform pole over this short a rise reads as a stick
          the display has been skewered on rather than as something holding it. */}
      <mesh position={[ARM_X, ARM_Y, 0]} rotation={[0, 0, ARM_TILT]} castShadow>
        <cylinderGeometry args={[0.085, 0.185, ARM_LENGTH, 14]} />
        <meshStandardMaterial color={t.deckCap} metalness={0.55} roughness={0.35} />
      </mesh>

      {/* The head, tilted back on the arm. Everything inside is measured from the
          middle of the display, so the tilt lives here and nowhere else. */}
      <group position={[0, PANEL_Y, 0]} rotation={[0, 0, PANEL_TILT]}>
        {/* Shell */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[PANEL_THICKNESS, PANEL_HEIGHT, PANEL_WIDTH]} />
          <meshStandardMaterial
            color={t.panelShell}
            metalness={0.45}
            roughness={0.42}
          />
        </mesh>

        {/* Bezel glow, then the screen board on top of it — the strip of bezel
            left showing around the board IS the rim light. One plane instead of
            four edge bars, and it breathes, which is most of what sells the
            display as powered rather than as a picture of one. */}
        <mesh position={[layerX(1), 0, 0]} rotation={FACE_FRONT}>
          <planeGeometry
            args={[
              (SCREEN_HALF_WIDTH + PANEL_BEZEL) * 2,
              (SCREEN_HALF_HEIGHT + PANEL_BEZEL) * 2,
            ]}
          />
          <meshStandardMaterial
            ref={bezelMaterial}
            color={t.panelAccent}
            emissive={t.panelAccent}
            emissiveIntensity={lit ? 1.2 : 0.32}
            roughness={0.4}
          />
        </mesh>
        {/* Barely emissive, and that is the point: at anything like the rim's
            brightness the whole board floods teal, the picture stops being the
            brightest thing on the display and the readout loses its contrast.
            The screen is meant to be the dark the rim is bright against. */}
        <mesh position={[layerX(2), 0, 0]} rotation={FACE_FRONT}>
          <planeGeometry args={[SCREEN_HALF_WIDTH * 2, SCREEN_HALF_HEIGHT * 2]} />
          <meshStandardMaterial
            color={t.panelScreen}
            emissive={t.panelAccent}
            emissiveIntensity={lit ? 0.045 : 0.015}
            roughness={0.6}
          />
        </mesh>

        <Suspense fallback={null}>
          <FittedPicture
            src={portrait.src}
            aspect={portrait.aspect}
            fitWidth={PICTURE_SIZE}
            fitHeight={PICTURE_SIZE}
            lit={lit}
            position={[layerX(3), PICTURE_Y, PICTURE_Z]}
            rotation={FACE_FRONT}
          />
        </Suspense>

        {/* The scan bar, riding down the screen. A basic material, so the one
            thing moving every frame is also the one thing the renderer does least
            work for — and a TINT rather than added light, which is the less
            obvious of the two choices. Additive is what a glowing bar physically
            is, but additive over a brightly lit face saturates instantly to white
            while the same bar over the dark half of the screen is invisible; one
            effect that looks like two. A flat alpha tint crosses both halves
            looking like the same object, which is what actually reads. */}
        <mesh ref={scanBar} position={[layerX(4), SCAN_TOP, 0]} rotation={FACE_FRONT}>
          <planeGeometry args={[SCREEN_HALF_WIDTH * 2, SCAN_THICKNESS]} />
          <meshBasicMaterial
            ref={scanMaterial}
            color={t.panelAccent}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>

        {/* Rule under the name, spanning the readout column. */}
        <mesh
          position={[layerX(5), RULE_Y, (READOUT_START_Z + READOUT_END_Z) / 2]}
          rotation={FACE_FRONT}
        >
          <planeGeometry args={[READOUT_WIDTH, 0.016]} />
          <meshStandardMaterial
            color={t.panelAccent}
            emissive={t.panelAccent}
            emissiveIntensity={lit ? 1 : 0.3}
          />
        </mesh>

        {/* The live indicator, blinking at the head of the status line. A
            geometric dot rather than a character in the text, so it needs no text
            metrics to place and can pulse on its own. */}
        <mesh
          position={[layerX(5), STATUS_Y, LIVE_DOT_Z]}
          rotation={FACE_FRONT}
        >
          <circleGeometry args={[LIVE_DOT_RADIUS, 16]} />
          <meshStandardMaterial
            ref={liveMaterial}
            color={t.panelLive}
            emissive={t.panelLive}
            emissiveIntensity={lit ? 2.6 : 0.7}
          />
        </mesh>

        {/* Name, role, status, ranged left down the column beside the face. The
            role is the line doing the real work here: a name alone under a
            portrait is an epitaph, and a name with a job is a person who has one.
            Left-aligned rather than centred because a ragged-right block reads as
            a record about someone, and a centred one reads as an inscription.

            anchorX="left" and the text runs off into -z, which is why every row
            starts at the column's +z edge. maxWidth wraps a longer role onto a
            second line rather than letting it run under the picture. */}
        {portrait.caption && (
          <Text
            position={[layerX(6), NAME_Y, READOUT_START_Z]}
            rotation={FACE_FRONT}
            fontSize={NAME_SIZE}
            letterSpacing={0.06}
            maxWidth={READOUT_WIDTH}
            textAlign="left"
            anchorX="left"
            anchorY="middle"
            color={t.panelText}
          >
            {portrait.caption}
          </Text>
        )}
        {portrait.role && (
          <Text
            position={[layerX(6), ROLE_Y, READOUT_START_Z]}
            rotation={FACE_FRONT}
            fontSize={ROLE_SIZE}
            letterSpacing={0.11}
            lineHeight={1.35}
            maxWidth={READOUT_WIDTH}
            textAlign="left"
            anchorX="left"
            anchorY="middle"
            color={t.panelAccent}
          >
            {portrait.role.toUpperCase()}
          </Text>
        )}
        {portrait.status && (
          <Text
            position={[layerX(6), STATUS_Y, READOUT_START_Z - STATUS_INDENT]}
            rotation={FACE_FRONT}
            fontSize={STATUS_SIZE}
            letterSpacing={0.06}
            maxWidth={READOUT_WIDTH - STATUS_INDENT}
            textAlign="left"
            anchorX="left"
            anchorY="middle"
            color={t.panelMuted}
          >
            {portrait.status}
          </Text>
        )}

        {/* The back. This is where the name used to be repeated in big outlined
            letters on a slab, which is a headstone however you light it. It is
            the stack instead — the thing you would actually want to read once
            you have driven around to look. */}
        <mesh position={[backLayerX(1), 0, 0]} rotation={FACE_BACK}>
          <planeGeometry args={[SCREEN_HALF_WIDTH * 2, SCREEN_HALF_HEIGHT * 2]} />
          <meshStandardMaterial
            color={t.panelScreen}
            emissive={t.panelAccent}
            emissiveIntensity={lit ? 0.035 : 0.012}
            roughness={0.7}
          />
        </mesh>
        {chips.length > 0 && (
          <Text
            position={[backLayerX(3), STACK_HEADER_Y, 0]}
            rotation={FACE_BACK}
            fontSize={0.17}
            letterSpacing={0.34}
            anchorX="center"
            anchorY="middle"
            color={t.panelMuted}
          >
            STACK
          </Text>
        )}
        {chips.map((chip) => (
          <group key={chip.label} position={[0, chip.y, chip.z]}>
            <mesh position={[backLayerX(2), 0, 0]} rotation={FACE_BACK}>
              <planeGeometry args={[chip.width, chip.height]} />
              <meshStandardMaterial
                color={t.panelShell}
                emissive={t.panelAccent}
                emissiveIntensity={lit ? 0.16 : 0.05}
                roughness={0.5}
              />
            </mesh>
            <Text
              position={[backLayerX(3), 0, 0]}
              rotation={FACE_BACK}
              fontSize={CHIP_FONT}
              letterSpacing={0.08}
              anchorX="center"
              anchorY="middle"
              color={t.panelText}
            >
              {chip.label}
            </Text>
          </group>
        ))}
      </group>

    </group>
  );
}

/**
 * One picture hung on a side wall.
 *
 * The group carries the placement, so everything inside is measured from the
 * middle of the frame and the wall it hangs on drops out of the arithmetic. The
 * half turn on the +z wall is doing double duty: it aims the frame back into the
 * room AND flips the local x axis, which is what keeps the picture the right way
 * round rather than mirrored — a wall on the far side of the room is not the
 * same as a wall seen from behind.
 */
function GalleryFrame({
  item,
  theme: t,
  lit,
  width,
  height,
  pictureHeight,
  pictureY,
  captionY,
  position,
  side,
}: {
  item: GalleryItem;
  theme: MuseumTheme;
  lit: boolean;
  width: number;
  height: number;
  pictureHeight: number;
  pictureY: number;
  captionY: number;
  position: [number, number, number];
  side: 1 | -1;
}) {
  const faceZ = GALLERY_FRAME_DEPTH / 2;

  return (
    <group position={position} rotation={[0, side > 0 ? Math.PI : 0, 0]}>
      {/* Frame, then mount board a hair proud of it, then the picture a hair
          proud of that — the stagger is the only thing keeping three coplanar
          surfaces out of a depth fight. No castShadow: the one light that could
          cast here is the hall's pointLight, and that has shadows off for the
          cube-map reason given below. */}
      <mesh>
        <boxGeometry args={[width, height, GALLERY_FRAME_DEPTH]} />
        <meshStandardMaterial color={t.artworkFrame} roughness={0.85} />
      </mesh>

      <mesh position={[0, 0, faceZ + 0.01]}>
        <planeGeometry
          args={[width - GALLERY_REVEAL * 2, height - GALLERY_REVEAL * 2]}
        />
        <meshStandardMaterial
          color={t.facade}
          emissive={t.stripEmissive}
          emissiveIntensity={lit ? 0.3 : 0.09}
          roughness={0.9}
        />
      </mesh>

      {item.src && (
        <Suspense fallback={null}>
          <FittedPicture
            src={item.src}
            aspect={item.aspect}
            fitWidth={width - GALLERY_REVEAL * 2}
            fitHeight={pictureHeight}
            lit={lit}
            position={[0, pictureY, faceZ + 0.02]}
            rotation={[0, 0, 0]}
          />
        </Suspense>
      )}

      {item.caption && (
        <Text
          position={[0, captionY, faceZ + 0.03]}
          fontSize={0.19}
          letterSpacing={0.08}
          maxWidth={width - GALLERY_REVEAL * 2 - 0.2}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color={t.signOutline}
        >
          {item.caption}
        </Text>
      )}
    </group>
  );
}

type MuseumProps = {
  /** The car, so the museum can tell when someone has driven onto its grounds. */
  target: RefObject<Group | null>;
  /** Bring the hall lights up. Owned by the parent, driven by the flag this
   *  component reports — the museum keeps no second copy of that state. */
  lit?: boolean;
  /** Fired once on each crossing of the grounds boundary, not every frame. */
  onOccupancyChange?: (occupied: boolean) => void;
  /** Name across the lintel. */
  name?: string;
  /** Which way the facade looks along x: +1 for +x (the default), -1 for -x,
   *  for a museum at the end of a road running the other way.
   *
   *  Implemented as a yaw of the whole group rather than a second set of
   *  mirrored dimensions — the building is symmetric in z, so a half turn is
   *  indistinguishable from a mirror and costs one number instead of twenty.
   *  It also flips the grounds test below, since a car now arrives with x
   *  increasing. The matching isOnPavement rules still have to be mirrored by
   *  hand; nothing here can do that for you. */
  facing?: 1 | -1;
  /** Footprint + placement. Defaults to the museum wired into worldGeometry.
   *  Override ONLY together with the matching isOnPavement config (see the
   *  MuseumGeometry note above), and memoise it if you build it inline, or the
   *  layout recomputes every render. */
  geometry?: MuseumGeometry;
  /** Colour overrides, merged over the defaults — pass only the ones you change. */
  theme?: Partial<MuseumTheme>;
  /** Restock the pedestals. Called per case, with the case's index and which
   *  plinth it stands on — `side` is passed so a set can be OFFSET between the
   *  two walls: a cycle of four marks over six pedestals otherwise deals both
   *  sides the identical hand, and a hall that looks photocopied down its middle
   *  is worse than one with fewer shapes in it. */
  exhibits?: (i: number, side: 1 | -1) => Exhibit;
  /** Whose museum this is — a framed picture on a plinth in the middle of the
   *  hall, which is the one thing in here you can collide with.
   *
   *  Passing this is HALF the change. The other half is the matching
   *  MUSEUM_HAS_PORTRAIT / RIGHT_MUSEUM_HAS_PORTRAIT flag in worldGeometry, which
   *  is what cuts its footprint out of the drivable floor. Set one without the
   *  other and you get a picture the car drives straight through, or an invisible
   *  block in the middle of an empty room. */
  portrait?: MuseumPortrait;
  /** Pictures for the side walls — projects, work, whatever this museum is for.
   *
   *  Unlike `portrait` this needs nothing from worldGeometry: the frames hang on
   *  the wall above the plinths, which is already outside the drivable floor, so
   *  there is nothing for the car to hit and nothing to keep in step.
   *
   *  Give it a stable reference (module scope, or memoised) — the wall layout
   *  memoises on it. */
  gallery?: GalleryItem[];
  /** Hall pointLight. Both default to values derived from `geometry` — a bigger
   *  hall lights itself correctly without being retuned — so pass these only to
   *  deliberately over- or under-light a room, not to keep up with its size. */
  lightIntensity?: number;
  lightDistance?: number;
};

/**
 * A building you drive into, not a prop.
 *
 * Reusable along four axes: `name` and `theme` reskin it, `exhibitGeometry`
 * restocks it, `facing` turns it to meet a road from the other side, and
 * `geometry` relocates/resizes it — the last two only in step with
 * isOnPavement, since the two share one source of truth.
 */
export function Museum({
  target,
  lit = false,
  onOccupancyChange,
  name = "MUSEUM",
  facing = 1,
  geometry = defaultMuseumGeometry,
  theme,
  exhibits = defaultExhibits,
  portrait,
  gallery,
  lightIntensity,
  lightDistance,
}: MuseumProps) {
  const g = geometry;
  const t = useMemo(() => ({ ...defaultMuseumTheme, ...theme }), [theme]);
  const l = useMemo(() => deriveLayout(g), [g]);

  // Where each picture hangs. Depends on how MANY there are, which is data
  // rather than dimensions, so it can't live in deriveLayout with the rest.
  const gallerySlots = useMemo(() => {
    const items = gallery ?? [];
    if (items.length === 0) return [];

    const step = l.GALLERY_SPAN / items.length;

    return items.map((item, i) => ({
      item,
      x: (i - (items.length - 1) / 2) * step,
      // Alternating walls rather than one wall filled then the other: a drive up
      // the hall should have something on both sides the whole way.
      side: (i % 2 === 0 ? -1 : 1) as 1 | -1,
      // Neighbours on the same wall are two steps apart, so that — less a gap —
      // is how wide a frame can be before they touch. Capped, or four pictures
      // in a thirty-metre hall each get hung as a billboard.
      width: Math.min(GALLERY_FRAME_MAX_WIDTH, step * 2 - 0.6),
    }));
  }, [gallery, l.GALLERY_SPAN]);

  // Latched here rather than compared against a prop, because the parent's
  // state update lands a render later — without the ref this would fire the
  // callback again on every frame in between.
  const occupied = useRef(false);

  useFrame(() => {
    const car = target.current;
    if (!car) return;

    // x alone is enough: everything drivable out here is museum grounds. The
    // two thresholds stop a car idling on the line from flickering the flag.
    //
    // `facing` decides which side of each threshold counts as inside: a museum
    // looking down -x has its grounds out at +x, so both tests invert with it.
    const insideOf = (line: number) =>
      facing > 0 ? car.position.x <= line : car.position.x >= line;

    const next = occupied.current
      ? insideOf(g.groundsExitX)
      : insideOf(g.groundsEnterX);

    if (next === occupied.current) return;
    occupied.current = next;
    onOccupancyChange?.(next);
  });

  return (
    <group
      position={[g.centerX, g.roadSurfaceY, g.centerZ]}
      rotation={[0, facing > 0 ? 0 : Math.PI, 0]}
    >
      {/* Floor and base in one slab: top face is the polished hall floor, the
          sides are the plinth the building stands on. Barely any metalness —
          with no environment map to reflect, more turns the floor black. */}
      <mesh position={[0, -BASE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[l.HALF_DEPTH * 2, BASE_THICKNESS, l.HALF_WIDTH * 2]} />
        <meshStandardMaterial color={t.base} metalness={0.08} roughness={0.38} />
      </mesh>

      {/* Forecourt at road height, so the car drives straight in with no ramp. */}
      <mesh
        position={[l.HALF_DEPTH + g.forecourtDepth / 2, -0.1, 0]}
        receiveShadow
      >
        <boxGeometry args={[g.forecourtDepth, 0.2, g.forecourtHalfZ * 2]} />
        <meshStandardMaterial color={t.forecourt} roughness={0.85} />
      </mesh>

      {/* Back wall */}
      <mesh position={[-l.FACADE_X, l.WALL_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[g.wall, l.WALL_HEIGHT, l.HALF_WIDTH * 2]} />
        <meshStandardMaterial color={t.wall} roughness={0.75} />
      </mesh>

      {/* Side walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={`side${side}`}
          position={[0, l.WALL_Y, side * (l.HALF_WIDTH - g.wall / 2)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[l.HALF_DEPTH * 2, l.WALL_HEIGHT, g.wall]} />
          <meshStandardMaterial color={t.wall} roughness={0.75} />
        </mesh>
      ))}

      {/* Facade: a pier either side of the opening, and a lintel across it. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`pier${side}`}
          position={[l.FACADE_X, l.WALL_Y, side * l.PIER_Z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[g.wall, l.WALL_HEIGHT, l.PIER_WIDTH]} />
          <meshStandardMaterial color={t.facade} roughness={0.7} />
        </mesh>
      ))}
      <mesh
        position={[l.FACADE_X, (g.doorHeight + g.height) / 2, 0]}
        castShadow
      >
        <boxGeometry
          args={[g.wall, g.height - g.doorHeight, g.doorHalfWidth * 2]}
        />
        <meshStandardMaterial color={t.facade} roughness={0.7} />
      </mesh>

      {/* Entrance wings, standing on their own stone down to the base. */}
      {[-1, 1].map((side) => (
        <group key={`wing${side}`} position={[0, 0, side * l.WING_Z]}>
          <mesh
            position={[l.WING_X, (g.height - BASE_THICKNESS) / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[WING_PROJECTION, g.height + BASE_THICKNESS, l.WING_WIDTH]}
            />
            <meshStandardMaterial color={t.facade} roughness={0.7} />
          </mesh>

          {/* Cornice — starts where the main roof's overhang stops, so the two
              slabs share an edge instead of overlapping faces. */}
          <mesh
            position={[
              (l.ROOF_EDGE_X + l.HALF_DEPTH + WING_PROJECTION + 0.3) / 2,
              g.height + 0.3,
              0,
            ]}
            castShadow
          >
            <boxGeometry
              args={[
                l.HALF_DEPTH + WING_PROJECTION + 0.3 - l.ROOF_EDGE_X,
                0.8,
                l.WING_WIDTH + 0.6,
              ]}
            />
            <meshStandardMaterial color={t.cornice} roughness={0.75} />
          </mesh>

          {/* Engaged columns, half-sunk into the wing's front face — cheaper
              than free-standing and they can't end up in the car's way. */}
          {l.COLUMN_OFFSETS.map((offset) => (
            <mesh
              key={offset}
              position={[l.HALF_DEPTH + WING_PROJECTION, g.height / 2, offset]}
              castShadow
            >
              <cylinderGeometry
                args={[
                  l.COLUMN_RADIUS,
                  l.COLUMN_RADIUS * COLUMN_TAPER,
                  g.height,
                  14,
                ]}
              />
              <meshStandardMaterial color={t.column} roughness={0.65} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Roof slab, oversized so it reads as an overhang. */}
      <mesh position={[0, g.height + 0.25, 0]} castShadow>
        <boxGeometry args={[l.ROOF_EDGE_X * 2, 0.7, (l.HALF_WIDTH + EAVES) * 2]} />
        <meshStandardMaterial color={t.cornice} roughness={0.75} />
      </mesh>

      {/* Sign across the lintel. Sized to the flat facade BETWEEN the wings, and
          set just above the door — the chase camera looks slightly downward, so
          anything high on the facade leaves frame before the car arrives. */}
      <Text
        position={[l.HALF_DEPTH + 0.06, g.doorHeight + 1, 0]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.85}
        letterSpacing={0.12}
        maxWidth={l.WING_INNER_Z * 2 - 1}
        textAlign="center"
        lineHeight={1.35}
        anchorX="center"
        anchorY="middle"
        color={t.sign}
        outlineWidth={0.015}
        outlineColor={t.signOutline}
      >
        {name}
      </Text>

      {/* Plinths down both side walls — the hall's real edges; the drivable
          floor stops exactly where they start. */}
      {([-1, 1] as const).map((side) => (
        <group key={`gallery${side}`} position={[0, 0, side * l.PLINTH_Z]}>
          <mesh position={[0, g.plinthHeight / 2, 0]} receiveShadow>
            <boxGeometry args={[l.INNER_X * 2, g.plinthHeight, g.plinthDepth]} />
            <meshStandardMaterial color={t.plinth} roughness={0.6} />
          </mesh>

          {l.EXHIBIT_X.map((x, i) => {
            const exhibit = exhibits(i, side);

            return (
              <group key={x} position={[x, 0, 0]}>
                {/* Pedestal */}
                <mesh
                  position={[0, g.plinthHeight + PEDESTAL_HEIGHT / 2, 0]}
                  castShadow
                >
                  <boxGeometry args={[1, PEDESTAL_HEIGHT, 1]} />
                  <meshStandardMaterial color={t.facade} roughness={0.7} />
                </mesh>

                {/* Exhibit — emissive, so each carries its own glow instead of
                    needing a spotlight (one pointLight per case).

                    The seat and the facing live on the GROUP, so a multi-part
                    mark's pieces stay registered to each other and each part's
                    `offset` is read in the mark's own frame rather than in
                    whichever direction this plinth happens to be turned.

                    Turned to face the middle of the hall, which costs nothing for
                    a solid but is the whole difference for a flat one: a logo cut
                    from a plate is a sliver edge-on, and these plinths are looked
                    at from the lane between them. The +z plinth takes the half
                    turn because a flat geometry's face points +z to begin with. */}
                <group
                  position={[0, l.PEDESTAL_TOP + EXHIBIT_SEAT, 0]}
                  rotation={[0, side > 0 ? Math.PI : 0, 0]}
                >
                  {exhibit.map((part, p) => (
                    <mesh key={p} position={part.offset ?? [0, 0, 0]} castShadow>
                      {part.geometry}
                      <meshStandardMaterial
                        color={
                          part.color ??
                          (side > 0 ? t.exhibitRightColor : t.exhibitLeftColor)
                        }
                        emissive={
                          part.emissive ??
                          (side > 0
                            ? t.exhibitRightEmissive
                            : t.exhibitLeftEmissive)
                        }
                        emissiveIntensity={lit ? 0.9 : 0.45}
                        metalness={part.metalness ?? 0.5}
                        roughness={part.roughness ?? 0.3}
                      />
                    </mesh>
                  ))}
                </group>
              </group>
            );
          })}
        </group>
      ))}

      {/* Artwork on the back wall, so there is something to drive up to. */}
      <mesh position={[-l.INNER_X + 0.05, l.ARTWORK_Y, 0]}>
        <boxGeometry args={[0.08, l.ARTWORK_HEIGHT, l.ARTWORK_HALF_Z * 2]} />
        <meshStandardMaterial color={t.artworkFrame} roughness={0.9} />
      </mesh>
      <mesh position={[-l.INNER_X + 0.12, l.ARTWORK_Y, 0]}>
        <boxGeometry
          args={[0.06, l.ARTWORK_HEIGHT - 0.7, l.ARTWORK_HALF_Z * 2 - 0.8]}
        />
        <meshStandardMaterial
          color={t.artworkPanel}
          emissive={t.artworkPanelEmissive}
          emissiveIntensity={lit ? 0.55 : 0.25}
          roughness={0.5}
        />
      </mesh>

      {/* Backlit strips along the side walls, just above the exhibits. Emissive
          only — they give the pointLight a visible source. On the walls, not
          the ceiling, because the chase camera never looks up. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`strip${side}`}
          position={[0, l.STRIP_Y, side * (l.HALF_WIDTH - g.wall - 0.06)]}
        >
          <boxGeometry args={[l.INNER_X * 2 - 1.4, 0.28, 0.12]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.stripEmissive}
            emissiveIntensity={lit ? 2 : 0.15}
          />
        </mesh>
      ))}

      {/* The gallery, hung along both side walls in the band between the
          exhibits and the strips above — which is why the strips end up reading
          as the lights the pictures are hung under. */}
      {gallerySlots.map(({ item, x, side, width }, i) => (
        <GalleryFrame
          key={i}
          item={item}
          theme={t}
          lit={lit}
          width={width}
          height={l.GALLERY_FRAME_HEIGHT}
          pictureHeight={l.GALLERY_PICTURE_HEIGHT}
          pictureY={l.GALLERY_PICTURE_Y}
          captionY={l.GALLERY_CAPTION_Y}
          position={[x, l.GALLERY_Y, side * l.GALLERY_WALL_Z]}
          side={side}
        />
      ))}

      {/* The centrepiece, if this museum has one. Everything above is the room;
          this is what the room is for. */}
      {portrait && (
        <PortraitExhibit portrait={portrait} theme={t} lit={lit} />
      )}

      {/* The hall's only real light, and only while someone is here — every
          light in a forward renderer is evaluated for every lit fragment. No
          castShadow: a shadow-casting pointLight renders a six-face cube map. */}
      {lit && (
        <pointLight
          position={[0, l.LIGHT_Y, 0]}
          color={t.light}
          intensity={lightIntensity ?? l.LIGHT_INTENSITY}
          distance={lightDistance ?? l.LIGHT_DISTANCE}
          decay={2}
        />
      )}
    </group>
  );
}