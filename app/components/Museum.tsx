"use client";

import { MeshReflectorMaterial, Text, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { SRGBColorSpace } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";

import { CAR_ROOF_Y } from "./carShell";
import { HoloMotes, HoloPanel, HoloWall } from "./museumHolo";
import { MuseumMonitor } from "./museumMonitor";
import type {
  MonitorAchievement,
  MonitorProject,
  MonitorSkill,
  MonitorStat,
} from "./museumMonitor";

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
  MUSEUM_WING_PROJECTION,
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
 * ------------------------------------------------------------------ *
 * The palette is doing more work here than a skin usually does, because the
 * room it describes is MOSTLY DARK. In a lit room, materials are what you see
 * and light is what reveals them; in this one it is the other way round — the
 * charcoal below is very nearly the black of the page behind it, so the only
 * thing separating a wall from the void is the LED line running along it. That
 * inverts the usual rule about restraint: the greys have to stay almost black
 * (lift them and the room reads as a grey box, not a dark one), and the accents
 * have to stay very few (electric blue, cyan, a little purple — a fourth hue
 * turns a laboratory into an arcade).
 */
export type MuseumTheme = {
  base: string;
  /** The glossy hall floor. Its own token rather than sharing `base`: the slab
   *  and its top face are the same object structurally, but one is unlit
   *  substrate and the other is the most reflective surface in the building. */
  floor: string;
  forecourt: string;
  wall: string;
  facade: string;
  /** The architectural panels articulating the walls — read against `wall` by a
   *  hair, never by a shade. The panelling is meant to be found, not announced. */
  panel: string;
  cornice: string;
  column: string;
  plinth: string;
  /** Brushed aluminium: the trim, the pedestal shafts, the entrance fins. The
   *  one genuinely light material in the building, and it works precisely
   *  because there is so little of it. */
  metal: string;
  /** Smoked glass. Dark, slightly blue, and always transparent where it's used. */
  glass: string;
  /** The primary neon — every LED strip, floor line and rim in the building
   *  unless something has a reason to differ. */
  accent: string;
  /** The secondary, used sparingly. "Small amounts of purple" is the brief and
   *  the token exists to keep it small: one name, so it is obvious at a glance
   *  how many places spend it. */
  accentAlt: string;
  /** The back wall's display: the light it emits, and the dark it emits against. */
  holo: string;
  holoScreen: string;
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
  /* Structure. Every one of these is within a few points of black, and the
   * spread between them is tiny on purpose — `wall` to `facade` is barely two
   * shades. In a room this dark that gap is still plainly visible, and anything
   * wider starts separating the building into its parts instead of reading as
   * one machined object. */
  base: "#05070a",
  /* Much lighter than it looks in the room, and it has to be — this value is
   * multiplied INTO the floor's reflection rather than sitting under it, so a
   * black floor reflects nothing at all. See the reflector's own note. */
  floor: "#2e3742",
  forecourt: "#0a0d13",
  wall: "#12151b",
  panel: "#0d1015",
  facade: "#171b22",
  cornice: "#1d222a",
  column: "#232932",
  plinth: "#0c0f14",
  metal: "#7d8895",
  glass: "#0b1119",

  /* Light. Three hues and no more: electric blue for the architecture, cyan for
   * anything that is a DISPLAY, purple for the few things that are neither. */
  accent: "#22d3ee",
  accentAlt: "#8b5cf6",
  holo: "#38bdf8",
  holoScreen: "#04070d",
  sign: "#67e8f9",
  signOutline: "#022c39",
  strip: "#d8f6ff",
  stripEmissive: "#22d3ee",

  /* The hall's one real lamp. Cool and dim — see LIGHT_INTENSITY. A warm lamp
   * here would fight every emissive surface in the room, and losing that fight
   * is what makes a sci-fi interior look like a stage set with a work light on. */
  light: "#a8d8ff",

  /* Exhibit fallbacks, for a hall stocked with the abstract solids rather than
   * with logos. Cyan one side, purple the other, so the two plinths read as a
   * pair without being identical. */
  exhibitLeftColor: "#a5f3fc",
  exhibitLeftEmissive: "#0e7490",
  exhibitRightColor: "#ddd6fe",
  exhibitRightEmissive: "#6d28d9",

  /* The gallery frames on the side walls. Barely-there bezels around lit boards
   * — a heavy frame is a museum, and this room is a showroom. */
  artworkFrame: "#0a0d12",
  artworkPanel: "#060a12",
  artworkPanelEmissive: "#0e7490",

  /* The centrepiece display's hardware. This was always the cold, switched-on
   * thing in a warm stone room; now the room has caught up with it, which is why
   * these barely moved — they were the design the rest of the building is being
   * rebuilt toward. */
  deck: "#12171e",
  deckCap: "#1b222b",
  panelShell: "#0e1319",
  panelScreen: "#05090f",
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

  /* ---------------------------------------------------------------- *
   * The portfolio, as shown on the back wall's monitor.
   * ---------------------------------------------------------------- *
   * All optional, and every one of them simply doesn't render when missing — a
   * museum can put a face and a name on the wall and nothing else. They live
   * here rather than in a second prop because they are all facts about the SAME
   * PERSON: splitting "whose museum is this" across two objects is how the name
   * on the wall and the name on the display end up disagreeing.
   */
  about?: string;
  /** Next to the green indicator. */
  availability?: string;
  stats?: MonitorStat[];
  /** The stack as it appears on the monitor. Falls back to `tags` — those are
   *  the same list in a different voice, and one museum should not have to
   *  spell it twice. */
  tech?: string[];
  skills?: MonitorSkill[];
  achievements?: MonitorAchievement[];
  focus?: { text: string; progress: number };
  /** The faint corner readouts. Defaults inside the monitor. */
  telemetry?: string[];

  /* Everything below is only ever seen after a visitor has walked up to the
   * monitor and OPENED one of its panels. Same object rather than a second one
   * for the same reason as the rest: it is all facts about one person, and
   * splitting a person across two props is how the name on the wall and the
   * name on the display end up disagreeing. */
  philosophy?: string;
  timeline?: { year: string; label: string }[];
  techGroups?: { label: string; items: string[] }[];
  milestones?: { year: string; label: string }[];
  learning?: string[];
  projects?: MonitorProject[];
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
/** The one proportion here that something outside the building also needs — the
 *  roadside kerb runs up the forecourt and has to stop before it. Aliased rather
 *  than spelled out twice, so there is still only one of it. */
const WING_PROJECTION = MUSEUM_WING_PROJECTION;
const FIN_SPACING = 2.3;
const EAVES = 0.6;
const EXHIBIT_SPACING = 4.2;
const PEDESTAL_HEIGHT = 1.1;

/** The entrance fins — what used to be engaged classical columns, and the change
 *  that decides whether the building reads as a museum or as a showroom before
 *  you are through the door.
 *
 *  A column is a load-bearing cylinder that tapers because stone does. None of
 *  that is true of a fin: it is a flat blade standing off the wall with a light
 *  in its front edge, it carries nothing, and it is deliberately too thin to
 *  look like it could. Same rhythm, same positions, opposite argument. */
const FIN_WIDTH = 0.34;
const FIN_PROJECTION = 0.5;
/** How much shorter than the wall it stands against — a fin that reached the
 *  cornice would read as a pilaster, which is the thing being avoided. */
const FIN_HEAD_ROOM = 1.6;

/** The wall panelling: how wide one bay is, how far a panel stands proud of the
 *  wall behind it, and the reveal left around it. The relief is TINY — under two
 *  centimetres — and that is the entire trick. The brief asks for panels that
 *  are subtle, and at this depth, in a room lit by grazing LED light, a panel is
 *  a change of shading rather than a visible step. Deepen it and the walls start
 *  reading as shipping crates. */
const PANEL_BAY = 3.6;
const PANEL_RELIEF = 0.018;
const PANEL_REVEAL = 0.22;

/** The vertical LED seam between bays, and how much shorter it is than the panel
 *  it divides. Thin — this is the "thin glowing LED strips built into the walls"
 *  of the brief, and a strip you could measure by eye is a tube light. */
const SEAM_WIDTH = 0.035;
const SEAM_INSET = 1.1;

/** The ceiling light coves: how far below the ceiling they hang, the radius of
 *  the tube, and how far in from the side walls the outer pair runs.
 *
 *  Capsules, not boxes. A capsule is a cylinder with hemispherical ends, so one
 *  primitive gives a continuous strip that CURVES at both ends and needs no cap
 *  geometry, no mitre and no seam — which is exactly the light fitting the brief
 *  describes, and the cheapest possible way to draw it. */
const COVE_DROP = 0.42;
const COVE_RADIUS = 0.11;
const COVE_INSET = 5.5;

/** The transverse arches: half-torus ribs of light spanning the hall, and how
 *  many of them are spread down its length.
 *
 *  These are what stop the ceiling being three parallel lines. They also do the
 *  job the brief hints at without naming — "sharp modern edges mixed with a few
 *  smooth curved elements" — and they are the few. Three, because at four the
 *  ceiling starts to read as a tunnel, and a tunnel is a corridor, not a room. */
const ARCH_COUNT = 3;
const ARCH_RADIUS = 0.075;

/** The runway lines let into the floor. Two long lines flanking the drive lane
 *  and a pair of tramlines further out, plus how far apart the transverse ticks
 *  between them fall.
 *
 *  Laid ON the floor rather than cut into it — a hair proud, like every other
 *  emissive surface in this building. A real inset would mean cutting the floor
 *  plane into strips, and the floor plane is the one surface here that has to
 *  stay whole, because it is the one carrying the reflection. */
const RUNWAY_WEIGHT = 0.05;
const RUNWAY_LIFT = 0.006;
const RUNWAY_HALF_Z = 4.2;
const TRAMLINE_FRACTION = 0.82;
const TICK_SPACING = 3.4;
const TICK_LENGTH = 0.55;

/** The floor's gloss. Only spent while someone is in the room — see the note on
 *  the floor mesh itself, which is where the real explanation lives. */
const FLOOR_REFLECT_RESOLUTION = 512;
const FLOOR_REFLECT_BLUR: [number, number] = [420, 110];

/** What the hall lamp is aimed at: roughly this much light reaching the darkest
 *  point in the room, the far bottom corner. The lamp has decay 2 — inverse
 *  square — so its intensity is this times the SQUARE of that corner's distance,
 *  and a hall that grows by half needs more than twice the lamp. Deriving it
 *  from the corner is what keeps that arithmetic from being done by hand and
 *  forgotten.
 *
 *  Cut to a THIRD of what the stone hall was tuned to, and that is the single
 *  most important number in this redesign. "Mostly dark" is not a colour, it is
 *  an exposure: a charcoal room under a lamp bright enough to read by is a grey
 *  room, and no amount of neon on top of it will read as neon. Everything that
 *  looks bright in here is emissive, which means it does not brighten the room —
 *  so the room can afford to be genuinely dark, and the LEDs are the only things
 *  in it with any luminance at all. That is what makes them glow. */
const HALL_CORNER_LUX = 0.32;

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

  // Fins spaced by a constant, count follows the wing width — a wider wing gets
  // more, not the same pair marooned in the middle.
  const FIN_COUNT = Math.max(2, Math.round(WING_WIDTH / FIN_SPACING));
  const FIN_OFFSETS = Array.from(
    { length: FIN_COUNT },
    (_, i) => (i - (FIN_COUNT - 1) / 2) * (WING_WIDTH / FIN_COUNT),
  );
  const FIN_HEIGHT = g.height - FIN_HEAD_ROOM;
  const FIN_Y = FIN_HEIGHT / 2;
  const FIN_X = HALF_DEPTH + WING_PROJECTION + FIN_PROJECTION / 2;

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

  // The inner faces of the walls: where anything mounted INSIDE the hall lives.
  const INNER_Z = HALF_WIDTH - g.wall;

  /* The back wall's display. "Huge" and "seamless" are the brief, so it is sized
   * to the wall rather than to itself: the full inner width less a hand's-width
   * of reveal at each side, and from just above the floor to just below the
   * ceiling coves. What is left of the wall around it is a margin, not a frame. */
  const HOLO_WIDTH = INNER_Z * 2 - 1.6;
  const HOLO_BOTTOM = 0.7;
  const HOLO_TOP = g.height - 1.9;
  const HOLO_HEIGHT = HOLO_TOP - HOLO_BOTTOM;
  const HOLO_Y = (HOLO_TOP + HOLO_BOTTOM) / 2;

  /* The portfolio monitor, hung on that wall. Three constraints decide it and
   * not one of them is a taste.
   *
   * The BOTTOM EDGE is a clearance, and it is derived rather than typed. This is
   * the only thing in the hall that stands PROUD of a wall you can drive at:
   * isOnPavement stops the car's centre at the wall less its half-width, which
   * still leaves the nose of a 4-long car through the plane of the wall by well
   * over half a metre. Nothing catches it only because the machine's underside
   * is held above the car's roof — so the roof is what the number is measured
   * from, and a taller car raises the monitor instead of driving through it.
   *
   * The WIDTH is the wall's, less a reveal. The machine is meant to BE the back
   * wall rather than to hang on it, so it takes the whole panel — and the strip
   * of wall left showing all the way round is doing a job, not saving space: the
   * wall behind is ruled at a fixed world pitch, the display is ruled at the
   * same one, and the reveal is what lets you see the two lines meet. Close the
   * gap and the ruling has nowhere to be read; open it and the monitor is hung
   * on the wall again instead of let into it.
   *
   * The HEIGHT is what the reveal and the car clearance leave. It cannot be
   * symmetric top and bottom, because the bottom edge is a collision contract
   * and the top edge is only a margin — so the machine sits a little high in its
   * wall, which is where a display you stand under belongs anyway.
   *
   * One consequence worth knowing rather than discovering. The chase camera
   * looks DOWN — it sits 2.5 above the car aiming at its roof, leaving about
   * five degrees of sky above the horizon — so from the door you see to roughly
   * 4.8 up this wall and from mid-hall to under 4. A full-wall machine is
   * therefore never entirely in the default frame: the identity block sits in
   * it, the floor's mirror carries the rest, and the top is the part you drag
   * the view down to see. That is the trade this size is making, and it is the
   * right one for a wall you drive up to — but it is a trade. */
  const MONITOR_REVEAL = 0.8;
  const MONITOR_BOTTOM = CAR_ROOF_Y + 0.45;
  const MONITOR_TOP = HOLO_TOP - MONITOR_REVEAL;
  const MONITOR_WIDTH = HOLO_WIDTH - MONITOR_REVEAL * 2;
  const MONITOR_HEIGHT = MONITOR_TOP - MONITOR_BOTTOM;
  const MONITOR_Y = MONITOR_BOTTOM + MONITOR_HEIGHT / 2;

  /* The side walls' horizontal LED line. Lower than the old gallery strip, at
   * about eye height from a car — it is the line the room is read along, and a
   * line above the pictures lights them where a line beside them leads you down
   * the hall. */
  const STRIP_Y = g.height * 0.38;

  /* Wall panelling. Bays are sized by dividing the run into a whole number of
   * them rather than by stepping a fixed width along it, so the panelling always
   * closes on the corners — a part bay at one end is the one thing that would
   * make a machined wall look tiled. */
  const PANEL_BAYS = Math.max(3, Math.round((INNER_X * 2) / PANEL_BAY));
  const PANEL_STEP = (INNER_X * 2) / PANEL_BAYS;
  const PANEL_X = Array.from(
    { length: PANEL_BAYS },
    (_, i) => (i - (PANEL_BAYS - 1) / 2) * PANEL_STEP,
  );
  /* The seams fall BETWEEN bays, which is one fewer than the bays themselves —
   * a seam at each end would land in the corner, where two of them meet and read
   * as a mistake rather than as a joint. */
  const SEAM_X = Array.from(
    { length: PANEL_BAYS - 1 },
    (_, i) => (i - (PANEL_BAYS - 2) / 2) * PANEL_STEP,
  );
  const PANEL_HEIGHT_WALL = g.height - SEAM_INSET * 2;
  const PANEL_WALL_Y = g.height / 2;

  /* Ceiling. A real one, hung under the roof slab — the old building had none,
   * because the chase camera never looks up. It does now, indirectly: the floor
   * below is a mirror, so the ceiling is on screen the whole time you are in
   * here, upside down and at the bottom of the frame. That is also why the coves
   * are worth the geometry. */
  const CEILING_Y = g.height;
  const COVE_Y = CEILING_Y - COVE_DROP;
  const COVE_LENGTH = INNER_X * 2 - 2.4;
  const COVE_Z = [-1, 0, 1].map((k) => k * (INNER_Z - COVE_INSET));

  const ARCH_X = Array.from(
    { length: ARCH_COUNT },
    (_, i) => (i - (ARCH_COUNT - 1) / 2) * ((INNER_X * 2 - 6) / ARCH_COUNT),
  );
  /* The arch springs from the tops of the side walls and passes just under the
   * ceiling, so its radius is the hall's half-width — a half-torus of exactly
   * that radius touches both walls at floor level of the ceiling plane, which is
   * where a rib belongs. Dropped by its own tube radius so it lies against the
   * ceiling rather than through it. */
  const ARCH_RADIUS_SPAN = INNER_Z;
  const ARCH_Y = CEILING_Y - ARCH_RADIUS - 0.02;

  /* Runway. The two inner lines flank the lane the car actually drives; the
   * tramlines sit most of the way out toward the plinths, which is what gives
   * the floor its length. Everything stops short of the back wall so the lines
   * appear to run UNDER the display rather than into it. */
  const RUNWAY_LENGTH = INNER_X * 2 - 1.2;
  const TRAMLINE_Z = g.hallHalfZ * TRAMLINE_FRACTION;
  const TICK_COUNT = Math.max(2, Math.round(RUNWAY_LENGTH / TICK_SPACING));
  const TICK_X = Array.from(
    { length: TICK_COUNT },
    (_, i) => (i - (TICK_COUNT - 1) / 2) * (RUNWAY_LENGTH / TICK_COUNT),
  );

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
    FIN_OFFSETS,
    FIN_HEIGHT,
    FIN_Y,
    FIN_X,
    ROOF_EDGE_X,
    EXHIBIT_X,
    PLINTH_Z,
    PEDESTAL_TOP,
    INNER_Z,
    HOLO_WIDTH,
    HOLO_HEIGHT,
    HOLO_Y,
    MONITOR_WIDTH,
    MONITOR_HEIGHT,
    MONITOR_Y,
    STRIP_Y,
    PANEL_X,
    PANEL_STEP,
    SEAM_X,
    PANEL_HEIGHT_WALL,
    PANEL_WALL_Y,
    CEILING_Y,
    COVE_Y,
    COVE_LENGTH,
    COVE_Z,
    ARCH_X,
    ARCH_RADIUS_SPAN,
    ARCH_Y,
    RUNWAY_LENGTH,
    TRAMLINE_Z,
    TICK_X,
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
          cube-map reason given below.

          The frame is now a bezel: near-black, slightly metallic, and read only
          by the rim of light around it. Mounting a print in a heavy frame is what
          a gallery does; a showroom mounts it in a housing, and the difference is
          entirely in how much of the frame you are meant to notice. */}
      <mesh>
        <boxGeometry args={[width, height, GALLERY_FRAME_DEPTH]} />
        <meshStandardMaterial
          color={t.artworkFrame}
          roughness={0.5}
          metalness={0.55}
        />
      </mesh>

      {/* The rim: the bezel's own face, left showing as a border around the board
          laid over it. One plane instead of four edge bars — the same trick the
          portrait display's bezel uses, and the same reason. */}
      <mesh position={[0, 0, faceZ + 0.005]}>
        <planeGeometry
          args={[
            width - GALLERY_REVEAL * 2 + 0.06,
            height - GALLERY_REVEAL * 2 + 0.06,
          ]}
        />
        <meshStandardMaterial
          color={t.accent}
          emissive={t.accent}
          emissiveIntensity={lit ? 1.1 : 0.24}
          roughness={0.4}
        />
      </mesh>

      <mesh position={[0, 0, faceZ + 0.01]}>
        <planeGeometry
          args={[width - GALLERY_REVEAL * 2, height - GALLERY_REVEAL * 2]}
        />
        <meshStandardMaterial
          color={t.artworkPanel}
          emissive={t.artworkPanelEmissive}
          emissiveIntensity={lit ? 0.35 : 0.1}
          roughness={0.6}
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

      {/* The caption, now in the accent rather than in the sign's dark outline
          colour. That swap is not a preference: the board behind it went from
          near-white to near-black, and dark type on a dark board is not a subtle
          caption, it is an invisible one. */}
      {item.caption && (
        <Text
          position={[0, captionY, faceZ + 0.03]}
          fontSize={0.19}
          letterSpacing={0.22}
          maxWidth={width - GALLERY_REVEAL * 2 - 0.2}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color={t.accent}
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
      {/* The slab the building stands on. Its top face used to BE the hall floor;
          now it is only the substrate under one, and it is drawn dead matte on
          purpose — everything it does is hidden by the glossy plane laid over it,
          except at the edges, where a matte skirt is what stops the building
          looking like it is floating on its own reflection. */}
      <mesh position={[0, -BASE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[l.HALF_DEPTH * 2, BASE_THICKNESS, l.HALF_WIDTH * 2]} />
        <meshStandardMaterial color={t.base} metalness={0.1} roughness={0.75} />
      </mesh>

      {/* The hall floor, and the one genuinely expensive thing in this building.
          "Strong but controlled floor reflections" is the whole look, and there
          is no cheap way to fake a mirror finish under a car that moves — an
          env-mapped floor reflects a cube map of somewhere else, which is fine
          for a wall and instantly wrong for the ground beneath a vehicle.

          So it is a real planar reflection: drei renders the scene a SECOND time
          each frame, from a camera mirrored through this plane, and samples the
          result. That is a whole extra pass over every object in the world.

          Which is why it is spent only while someone is standing in the room.
          When the hall is empty the same plane takes an ordinary glossy material
          — still dark, still shiny, just not reflecting anything — and the pass
          disappears along with the reason for it. Two museums in this scene and
          the occupancy flag is exclusive, so at most one reflector is ever live.

          Resolution and blur are held down for the same reason: a 512 buffer
          blurred this hard cannot resolve detail, but a showroom floor is not
          meant to be a mirror — it is meant to smear the lights into long
          verticals, and blur is what does that. */}
      <mesh
        position={[0, 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[l.INNER_X * 2, l.INNER_Z * 2]} />
        {lit ? (
          <MeshReflectorMaterial
            resolution={FLOOR_REFLECT_RESOLUTION}
            blur={FLOOR_REFLECT_BLUR}
            mixBlur={1}
            /* These four are the whole reflection, and three of them are
               counter-intuitive enough to be worth writing down — the first
               build got all three wrong and produced a floor of pure black.

               The material's shader ends in

                 diffuse = diffuse * ((1 - mirror) + reflection * mixStrength)

               so the reflection is MULTIPLIED BY THE FLOOR'S OWN ALBEDO rather
               than added over it. Three consequences, none of them obvious:

               `color` cannot be the near-black the rest of this room is painted
               in. At #08 the multiplier is about 0.003 and the reflection is
               annihilated — the floor has to be a mid slate for anything to
               survive the multiply, and the DARKNESS then comes from what it is
               reflecting (an almost unlit room) rather than from its own paint.

               `metalness` has to be LOW, which is the opposite of what a glossy
               floor wants everywhere else. Albedo is scaled by (1 - metalness)
               in every PBR shader, so a metalness of 0.7 throws away 70% of the
               reflection before it is ever drawn.

               And `mirror` is not "how reflective" — it is the size of the
               NON-reflective term. High mirror means the parts of the floor with
               nothing above them go dark, which is exactly the controlled half of
               "strong but controlled": bright streaks under the lit objects,
               black everywhere else. */
            color={t.floor}
            metalness={0.08}
            roughness={0.34}
            mirror={0.82}
            mixStrength={13}
            mixContrast={1.05}
            depthScale={1.05}
            minDepthThreshold={0.35}
            maxDepthThreshold={1.4}
          />
        ) : (
          /* The empty-hall stand-in. Metallic where the reflector is not, on
             purpose: with no reflection to carry, the gloss has to come from the
             specular highlight instead, and that is what metalness buys. */
          <meshStandardMaterial
            color={t.floor}
            metalness={0.65}
            roughness={0.3}
          />
        )}
      </mesh>

      {/* The runway. Two lines flanking the lane you drive, two tramlines further
          out, and ticks between them — which is the arrangement that makes a
          large dark floor read as having a LENGTH. Without the ticks the two
          long lines are just lines; with them the floor has a rate, and the rate
          is what you feel when you drive up it.

          Laid a few millimetres proud of the floor rather than inset into it: the
          reflector needs one unbroken plane, and cutting channels for these would
          mean cutting up the only surface in the room that must stay whole. */}
      {([-1, 1] as const).map((side) => (
        <group key={`runway${side}`}>
          <mesh
            position={[0, RUNWAY_LIFT, side * RUNWAY_HALF_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[l.RUNWAY_LENGTH, RUNWAY_WEIGHT]} />
            <meshStandardMaterial
              color={t.accent}
              emissive={t.accent}
              emissiveIntensity={lit ? 1.9 : 0.6}
              roughness={0.35}
            />
          </mesh>
          <mesh
            position={[0, RUNWAY_LIFT, side * l.TRAMLINE_Z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[l.RUNWAY_LENGTH, RUNWAY_WEIGHT * 0.7]} />
            <meshStandardMaterial
              color={t.accent}
              emissive={t.accent}
              emissiveIntensity={lit ? 1.1 : 0.28}
              roughness={0.35}
            />
          </mesh>
          {l.TICK_X.map((x) => (
            <mesh
              key={x}
              position={[
                x,
                RUNWAY_LIFT,
                (side * (RUNWAY_HALF_Z + l.TRAMLINE_Z)) / 2,
              ]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[RUNWAY_WEIGHT * 0.8, TICK_LENGTH]} />
              <meshStandardMaterial
                color={t.accentAlt}
                emissive={t.accentAlt}
                emissiveIntensity={lit ? 1.4 : 0.35}
                roughness={0.35}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* Forecourt at road height, so the car drives straight in with no ramp. */}
      <mesh
        position={[l.HALF_DEPTH + g.forecourtDepth / 2, -0.1, 0]}
        receiveShadow
      >
        <boxGeometry args={[g.forecourtDepth, 0.2, g.forecourtHalfZ * 2]} />
        <meshStandardMaterial
          color={t.forecourt}
          metalness={0.35}
          roughness={0.55}
        />
      </mesh>

      {/* And the runway continued out across it, aimed at the doors. The lines
          outside are the only invitation the building makes — a black box at the
          end of a dark branch is otherwise indistinguishable from the end of the
          road. They run on the forecourt's own emissive budget, not the hall's,
          so they stay lit whether or not anyone is inside. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={`approach${side}`}
          position={[
            l.HALF_DEPTH + g.forecourtDepth / 2,
            0.006,
            side * (g.doorHalfWidth - 0.4),
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[g.forecourtDepth, RUNWAY_WEIGHT]} />
          <meshStandardMaterial
            color={t.accent}
            emissive={t.accent}
            emissiveIntensity={1.5}
            roughness={0.35}
          />
        </mesh>
      ))}

      {/* Back wall. Matte, and that word is load-bearing: at roughness 0.9 it
          returns almost nothing to the camera, which is what lets the display
          mounted on it a moment later be the only thing there. */}
      <mesh position={[-l.FACADE_X, l.WALL_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[g.wall, l.WALL_HEIGHT, l.HALF_WIDTH * 2]} />
        <meshStandardMaterial color={t.wall} roughness={0.9} metalness={0.15} />
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
          <meshStandardMaterial color={t.wall} roughness={0.9} metalness={0.15} />
        </mesh>
      ))}

      {/* The panelling, and the LED seams between the bays.

          This is the "subtle architectural panels" of the brief, and subtlety
          here is a measurement rather than a taste: PANEL_RELIEF is under two
          centimetres, so no panel is ever seen as a step. What is seen is that
          the wall changes shade at regular intervals — one shade darker in the
          middle of each bay, a thread of light at each joint — and a wall that
          does that is a made thing, where a flat one is a backdrop.

          Slightly more metallic than the wall behind them, which is the other
          half of it. The panels catch the LED line running past at a grazing
          angle and the wall does not, so the articulation shows up as reflected
          light rather than as drawn geometry. */}
      {([-1, 1] as const).map((side) => (
        <group
          key={`panels${side}`}
          position={[0, 0, side * (l.INNER_Z - PANEL_RELIEF / 2)]}
          // The half turn on the +z wall aims the seams' faces back into the
          // room — the same double duty it does on the gallery frames below.
          // Without it the +z wall's light strips face the stone behind them.
          rotation={[0, side > 0 ? Math.PI : 0, 0]}
        >
          {l.PANEL_X.map((x) => (
            <mesh key={x} position={[x, l.PANEL_WALL_Y, 0]} receiveShadow>
              <boxGeometry
                args={[
                  l.PANEL_STEP - PANEL_REVEAL,
                  l.PANEL_HEIGHT_WALL,
                  PANEL_RELIEF,
                ]}
              />
              <meshStandardMaterial
                color={t.panel}
                roughness={0.55}
                metalness={0.45}
              />
            </mesh>
          ))}

          {l.SEAM_X.map((x) => (
            <mesh key={x} position={[x, l.PANEL_WALL_Y, PANEL_RELIEF]}>
              <planeGeometry
                args={[SEAM_WIDTH, l.PANEL_HEIGHT_WALL - SEAM_INSET]}
              />
              <meshStandardMaterial
                color={t.strip}
                emissive={t.stripEmissive}
                emissiveIntensity={lit ? 1.6 : 0.28}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* The ceiling, and the light coves under it.

          The old building had no ceiling at all — the chase camera never looks
          up, so the roof slab was enough. It is not enough any more, because the
          floor is now a mirror: everything hung up here is on screen for the
          whole visit, inverted, in the bottom half of the frame. The coves are
          drawn for their reflection first and for themselves second.

          Capsules, so each strip is continuously curved at both ends with no cap,
          no mitre and no seam — one primitive doing what the brief calls
          "continuous curved LED light strips", and doing it in one draw call. */}
      <mesh position={[0, l.CEILING_Y + 0.15, 0]} receiveShadow>
        <boxGeometry args={[l.INNER_X * 2, 0.3, l.INNER_Z * 2]} />
        <meshStandardMaterial color={t.panel} roughness={0.85} metalness={0.2} />
      </mesh>

      {l.COVE_Z.map((z, i) => (
        <mesh
          key={z}
          position={[0, l.COVE_Y, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <capsuleGeometry args={[COVE_RADIUS, l.COVE_LENGTH, 4, 12]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.stripEmissive}
            // The centre run brighter than its neighbours. Three identical strips
            // read as a grid of fittings; one strong line flanked by two weaker
            // ones reads as indirect lighting with a source, which is the effect
            // the brief asks for and the more expensive-looking of the two.
            emissiveIntensity={(i === 1 ? 2.6 : 1.5) * (lit ? 1 : 0.16)}
            roughness={0.35}
          />
        </mesh>
      ))}

      {/* Transverse ribs of light. These are the curves the brief allows against
          all those sharp edges — and being half-tori they are also the one place
          in the building where a straight line is nowhere to be found. */}
      {l.ARCH_X.map((x) => (
        <mesh
          key={x}
          position={[x, l.ARCH_Y, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry
            args={[l.ARCH_RADIUS_SPAN, ARCH_RADIUS, 6, 40, Math.PI]}
          />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.accentAlt}
            emissiveIntensity={lit ? 1.1 : 0.18}
            roughness={0.4}
          />
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
          <meshStandardMaterial
            color={t.facade}
            roughness={0.65}
            metalness={0.35}
          />
        </mesh>
      ))}
      <mesh
        position={[l.FACADE_X, (g.doorHeight + g.height) / 2, 0]}
        castShadow
      >
        <boxGeometry
          args={[g.wall, g.height - g.doorHeight, g.doorHalfWidth * 2]}
        />
        <meshStandardMaterial
          color={t.facade}
          roughness={0.65}
          metalness={0.35}
        />
      </mesh>

      {/* The portal: a glowing rail up each jamb and one across the head of the
          opening. Three thin bars, and they are the single most valuable piece of
          light on the building — a matte black box at the end of an unlit branch
          has no readable opening at all until something outlines it, and a driver
          who cannot see the door drives into the wall beside it.

          Set a whisker outside the facade's front face so they read as fitted
          INTO the reveal rather than painted on it. */}
      {([-1, 1] as const).map((side) => (
        <mesh
          key={`jamb${side}`}
          position={[
            l.HALF_DEPTH + 0.02,
            g.doorHeight / 2,
            side * (g.doorHalfWidth + 0.09),
          ]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[0.09, g.doorHeight]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.stripEmissive}
            emissiveIntensity={2.2}
            roughness={0.35}
          />
        </mesh>
      ))}
      <mesh
        position={[l.HALF_DEPTH + 0.02, g.doorHeight + 0.045, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[g.doorHalfWidth * 2 + 0.27, 0.09]} />
        <meshStandardMaterial
          color={t.strip}
          emissive={t.stripEmissive}
          emissiveIntensity={2.2}
          roughness={0.35}
        />
      </mesh>

      {/* Entrance wings, standing on their own footing down to the base. */}
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
            <meshStandardMaterial
              color={t.facade}
              roughness={0.65}
              metalness={0.35}
            />
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
            <meshStandardMaterial
              color={t.cornice}
              roughness={0.6}
              metalness={0.4}
            />
          </mesh>

          {/* Entrance fins, standing off the wing's front face.

              These were engaged classical columns, and swapping them is what
              settles the building's argument at the door. A column is a tapered
              cylinder that reads as carrying the roof; a fin is a blade of
              brushed aluminium, too thin to be carrying anything, with a line of
              light down its leading edge. Same rhythm, same count, same spacing —
              the whole change is the section and the material, and it is enough
              to move the building nineteen hundred years.

              They stop short of the cornice. A fin that reached it would be a
              pilaster again, and the strip of dark wall left above is what makes
              them read as applied to the facade rather than part of it. */}
          {l.FIN_OFFSETS.map((offset) => (
            <group key={offset} position={[0, 0, offset]}>
              <mesh position={[l.FIN_X, l.FIN_Y, 0]} castShadow>
                <boxGeometry
                  args={[FIN_PROJECTION, l.FIN_HEIGHT, FIN_WIDTH]}
                />
                <meshStandardMaterial
                  color={t.metal}
                  roughness={0.42}
                  metalness={0.85}
                />
              </mesh>
              {/* The light in its leading edge. */}
              <mesh
                position={[l.FIN_X + FIN_PROJECTION / 2 + 0.004, l.FIN_Y, 0]}
                rotation={[0, Math.PI / 2, 0]}
              >
                <planeGeometry args={[FIN_WIDTH * 0.34, l.FIN_HEIGHT - 0.5]} />
                <meshStandardMaterial
                  color={t.strip}
                  emissive={t.stripEmissive}
                  emissiveIntensity={1.7}
                  roughness={0.35}
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Roof slab, oversized so it reads as an overhang. */}
      <mesh position={[0, g.height + 0.25, 0]} castShadow>
        <boxGeometry args={[l.ROOF_EDGE_X * 2, 0.7, (l.HALF_WIDTH + EAVES) * 2]} />
        <meshStandardMaterial
          color={t.cornice}
          roughness={0.6}
          metalness={0.4}
        />
      </mesh>

      {/* A line of light under the eaves, all the way along the front. It is what
          gives the roof an edge in the dark — without it the slab and the night
          sky behind it are the same colour, and the building has no top. */}
      <mesh
        position={[l.ROOF_EDGE_X - 0.05, g.height - 0.12, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry args={[(l.HALF_WIDTH + EAVES) * 2 - 0.6, 0.06]} />
        <meshStandardMaterial
          color={t.strip}
          emissive={t.stripEmissive}
          emissiveIntensity={1.4}
          roughness={0.4}
        />
      </mesh>

      {/* Sign across the lintel. Sized to the flat facade BETWEEN the wings, and
          set just above the door — the chase camera looks slightly downward, so
          anything high on the facade leaves frame before the car arrives.

          The heavy outline is gone. An outlined face is how you keep dark type
          legible on a bright stone wall; on a black wall the type is the bright
          thing, and an outline around it only muddies the glow. */}
      <Text
        position={[l.HALF_DEPTH + 0.06, g.doorHeight + 1.15, 0]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.8}
        letterSpacing={0.34}
        maxWidth={l.WING_INNER_Z * 2 - 1}
        textAlign="center"
        lineHeight={1.4}
        anchorX="center"
        anchorY="middle"
        color={t.sign}
        outlineWidth={0.004}
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
            <meshStandardMaterial
              color={t.plinth}
              roughness={0.45}
              metalness={0.5}
            />
          </mesh>

          {/* A light let into the plinth's front face, running its whole length.
              This is the kerb of the runway: it is at roughly the height of a
              driver's eye, it is the first thing that tells you where the floor
              stops, and it is the longest continuous line in the building. */}
          <mesh
            position={[
              0,
              g.plinthHeight * 0.58,
              -side * (g.plinthDepth / 2 + 0.006),
            ]}
            rotation={[0, side > 0 ? Math.PI : 0, 0]}
          >
            <planeGeometry args={[l.INNER_X * 2 - 0.8, 0.055]} />
            <meshStandardMaterial
              color={t.strip}
              emissive={t.stripEmissive}
              emissiveIntensity={lit ? 1.7 : 0.4}
              roughness={0.35}
            />
          </mesh>

          {l.EXHIBIT_X.map((x, i) => {
            const exhibit = exhibits(i, side);

            return (
              <group key={x} position={[x, 0, 0]}>
                {/* The pedestal, rebuilt as a piece of equipment rather than a
                    block of stone.

                    A stone pedestal is a cube because a cube is what stone does
                    cheaply. This one is a slim dark shaft under a brushed
                    aluminium cap, with a light ring on the deck at its foot and a
                    line up the face you see it from — narrower than the thing
                    standing on it, which is the detail that makes a mark look
                    PRESENTED rather than parked. Minimal, per the brief: four
                    small pieces, and three of them are barely there. */}
                <mesh
                  position={[0, g.plinthHeight + PEDESTAL_HEIGHT / 2, 0]}
                  castShadow
                >
                  <boxGeometry args={[0.62, PEDESTAL_HEIGHT, 0.62]} />
                  <meshStandardMaterial
                    color={t.glass}
                    roughness={0.34}
                    metalness={0.62}
                  />
                </mesh>

                {/* The cap it stands on. The only brushed aluminium inside the
                    hall, and there is one per exhibit — which is exactly as much
                    of a light material as a dark room can carry. */}
                <mesh
                  position={[0, g.plinthHeight + PEDESTAL_HEIGHT + 0.03, 0]}
                  castShadow
                >
                  <boxGeometry args={[0.82, 0.06, 0.82]} />
                  <meshStandardMaterial
                    color={t.metal}
                    roughness={0.4}
                    metalness={0.9}
                  />
                </mesh>

                {/* The ring on the deck at its foot: a halo of light on the
                    plinth, which is what makes the shaft look like it is standing
                    ON something powered instead of glued to it. */}
                <mesh
                  position={[0, g.plinthHeight + 0.005, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                >
                  <ringGeometry args={[0.44, 0.5, 28]} />
                  <meshStandardMaterial
                    color={t.accent}
                    emissive={t.accent}
                    emissiveIntensity={lit ? 1.8 : 0.42}
                    roughness={0.4}
                  />
                </mesh>

                {/* And a line up the face turned toward the lane. */}
                <mesh
                  position={[
                    0,
                    g.plinthHeight + PEDESTAL_HEIGHT / 2,
                    -side * 0.316,
                  ]}
                  rotation={[0, side > 0 ? Math.PI : 0, 0]}
                >
                  <planeGeometry args={[0.05, PEDESTAL_HEIGHT - 0.3]} />
                  <meshStandardMaterial
                    color={t.strip}
                    emissive={t.stripEmissive}
                    emissiveIntensity={lit ? 1.5 : 0.3}
                    roughness={0.4}
                  />
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
                        /* Raised from the 0.9 the sandstone hall used, and it
                           had to be: the lamp above is now a third of what it
                           was, so a mark lit only by the room would go black in
                           the dark it needs to be standing in. The brief asks
                           for glowing symbols and this is where that is paid
                           for — the marks carry their own light now, and the
                           lamp only picks out their edges. */
                        emissiveIntensity={lit ? 1.9 : 0.7}
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

      {/* The intelligent wall. What used to be a framed panel in the middle of
          the back wall is now the back wall — near enough its full inner width
          and most of its height, with no frame, no mat and no border. It lives in
          museumHolo.tsx, which is where everything made of light rather than of
          material lives; all this end has to do is turn it to face down the hall.

          A quarter turn about y aims its +z at the door. Everything inside it is
          then laid out in an ordinary x-across / y-up frame, which is a good deal
          easier to reason about than the y/z gymnastics the portrait display
          does — and the reason it can afford to be simple is that it is flat
          against a wall, where the portrait has to work from every angle. */}
      <group
        position={[-l.INNER_X + 0.06, l.HOLO_Y, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <HoloWall
          width={l.HOLO_WIDTH}
          height={l.HOLO_HEIGHT}
          theme={t}
          lit={lit}
          /* A wall with a monitor bolted to the middle of it has to stop being
             the thing you look at. `quiet` drops its arcs and its watermark —
             the two composed elements, both of them dead centre and both of them
             behind eight tonnes of housing — and leaves the grid, the sweeps and
             the data strip, which is exactly the ambient surface a mounted
             instrument wants to be seen against. */
          quiet={portrait !== undefined}
          label={portrait ? undefined : name}
          status={
            portrait
              ? undefined
              : lit
                ? "SYSTEMS NOMINAL · VISITOR PRESENT"
                : "STANDBY"
          }
        />

        {/* The portfolio monitor, on the same wall and in the same frame — so
            its whole depth is spent standing OUT into the hall without a single
            sign flip. It is drawn from z = 0 at the wall face outward, which is
            why the group below only has to say how high up the wall it hangs.

            Mounted only where there is somebody to be about: a museum with no
            portrait gets the intelligent wall on its own, which is what the
            second hall down the road is still showing. */}
        {portrait && (
          <group position={[0, l.MONITOR_Y - l.HOLO_Y, 0.07]}>
            <MuseumMonitor
              width={l.MONITOR_WIDTH}
              height={l.MONITOR_HEIGHT}
              theme={t}
              lit={lit}
              profile={{
                name: portrait.caption ?? name,
                role: portrait.role,
                portrait: portrait.src,
                portraitAspect: portrait.aspect,
                about: portrait.about,
                availability: portrait.availability,
                stats: portrait.stats,
                tech: portrait.tech ?? portrait.tags,
                skills: portrait.skills,
                achievements: portrait.achievements,
                focus: portrait.focus,
                telemetry: portrait.telemetry,
                philosophy: portrait.philosophy,
                timeline: portrait.timeline,
                techGroups: portrait.techGroups,
                milestones: portrait.milestones,
                learning: portrait.learning,
                projects: portrait.projects,
              }}
            />
          </group>
        )}
      </group>

      {/* The side walls' LED line, above the exhibits and running the length of
          the room. Thinner than the backlit box it replaces by a factor of five:
          the old one was a lamp with a visible bulb, and this is a line let into
          a wall. In a room this dark the thin one actually reads as brighter —
          there is less of it, so what there is has to be hotter, and a hot thin
          line is what an LED strip looks like.

          Two of them per wall now, close together and unequal. A single line is a
          light fitting; a pair with a gap is a detail somebody drew. */}
      {([-1, 1] as const).map((side) => (
        <group
          key={`strip${side}`}
          position={[0, 0, side * (l.INNER_Z - 0.05)]}
          rotation={[0, side > 0 ? Math.PI : 0, 0]}
        >
          {/* Held at 2, not higher, and this is the ceiling every LED in the
              building is tuned against. Emissive output is colour × intensity
              and then clipped: cyan is (0.13, 0.83, 0.93), so anything past
              about 1.2 pins green and blue at 1 while red keeps climbing — and
              a strip driven to 3 is not a brighter cyan, it is a WHITE strip
              with a cyan halo. Past that point the palette the whole room is
              built on is being thrown away in exchange for glare. Two is about
              as hot as a line can run and still be a colour. */}
          <mesh position={[0, l.STRIP_Y, 0]}>
            <planeGeometry args={[l.INNER_X * 2 - 1.4, 0.055]} />
            <meshStandardMaterial
              color={t.strip}
              emissive={t.stripEmissive}
              emissiveIntensity={lit ? 2 : 0.4}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, l.STRIP_Y - 0.16, 0]}>
            <planeGeometry args={[l.INNER_X * 2 - 1.4, 0.02]} />
            <meshStandardMaterial
              color={t.strip}
              emissive={t.stripEmissive}
              emissiveIntensity={lit ? 1.4 : 0.2}
              roughness={0.35}
            />
          </mesh>
        </group>
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
      

      {/* Two interfaces hanging in the air near the back of the room, angled in
          toward the lane so they are readable on the drive up rather than only
          from a stop. Held well above the drivable floor and well inside the
          plinths — they pass through nothing, and nothing passes through them.

          They are also the room's depth cue. A dark hall with everything stuck to
          its surfaces reads flat however long it is; two objects floating at a
          known height, at a known distance, are what let the eye measure it. */}
      {lit &&
        ([-1, 1] as const).map((side) => (
          <group
            key={`hud${side}`}
            position={[-l.INNER_X * 0.42, g.height * 0.46, side * (g.hallHalfZ - 1.6)]}
            rotation={[0, Math.PI / 2 + side * 0.42, 0]}
          >
            <HoloPanel
              width={2.4}
              height={1.7}
              theme={t}
              lit={lit}
              rows={5}
              phase={side > 0 ? 0 : Math.PI}
              accent={side > 0 ? t.accentAlt : t.holo}
            />
          </group>
        ))}

      {/* And the air itself. One draw call for the whole field, and mounted only
          while someone is in the room — an empty hall should be still, and having
          the air come alive as you cross the threshold is most of what makes the
          building feel like it noticed you arrive. */}
      {lit && (
        <group position={[0, g.height * 0.45, 0]}>
          <HoloMotes
            scale={[l.INNER_X * 2 * 0.9, g.height * 0.8, l.INNER_Z * 2 * 0.85]}
            color={t.accent}
          />
        </group>
      )}

      {/* The hall's only real light, and only while someone is here — every
          light in a forward renderer is evaluated for every lit fragment. No
          castShadow: a shadow-casting pointLight renders a six-face cube map.

          It is a THIRD of the lamp the stone hall had, which looks like a
          downgrade and is the opposite. Every glowing thing in this room is
          emissive, and emissive brightness is absolute — it does not scale with
          the room's exposure. So the dimmer this lamp is, the further ahead of
          the walls the LEDs sit, and "mostly dark with electric blue lighting" is
          a description of that GAP rather than of any single colour in it. Turn
          this back up and the neon does not get brighter; the room around it
          does, and the whole effect flattens out. */}
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