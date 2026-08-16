"use client";

/**
 * The portfolio monitor: the one object in the hall that is a MACHINE.
 *
 * Everything else made of light in this building (museumHolo.tsx) is a surface
 * pretending to be a volume — flat emissive planes stuck to walls, with nothing
 * behind them. This is the opposite. It is a physical instrument bolted to the
 * back wall: a mount plate, a machined housing in two slabs with a lit gasket
 * between them, a bezel with a real aperture cut through it, and a display
 * RECESSED almost three centimetres inside that aperture. You can see the depth
 * from the side, and the interface inside it is stacked through that depth
 * rather than painted onto one plane.
 *
 * Three rules hold the whole thing together:
 *
 * 1. DEPTH IS THE POINT. The screen is not a picture of an interface, it is a
 *    stack: substrate, etched grid, glass panes, instruments, portrait chamber,
 *    typography, motes, cover glass. Each layer is a real z step inside the
 *    well, so driving past the thing parallaxes it. Flatten the ladder and this
 *    stops being a hologram and becomes a website screenshot on a wall — which
 *    is precisely the failure mode the design is fighting.
 *
 * 2. FINE DETAIL IS PAINTED, NOT BUILT. Twenty-three grid lines, edge circuitry,
 *    a hundred micro data points, tick rings, panel borders, chip frames and
 *    achievement glyphs are ONE draw call each because they are drawn into a
 *    canvas at mount and used as a texture. Built as meshes they would be four
 *    hundred objects, and this hall renders TWICE a frame (the floor is a real
 *    planar mirror — see <Museum>'s floor). A texture is free by comparison and
 *    can hold detail no reasonable number of planes could.
 *
 * 3. WHAT MOVES IS A MESH. Anything animated, anything that has to sit at its
 *    own depth, and anything big enough to be read as type stays real geometry:
 *    the meters, the activity bars, the chamber rings, the name. Painting those
 *    would freeze them or blur them.
 *
 * It costs no lights. Not one — see the note on the room glow near the bottom.
 * In a forward renderer every light is evaluated against every lit fragment, and
 * this hall is already down to a single pointLight on purpose; a monitor that
 * bought its glow with lamps would cost more than the entire building it hangs
 * in. Everything here is emissive, additive, or painted.
 *
 * Like everything in museumHolo.tsx it takes no position. It is drawn in its own
 * frame, facing +z, with z = 0 ON THE WALL and the whole assembly standing out
 * into the room from there. The caller places and turns it.
 */

import { Sparkles, Text, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  DataTexture,
  DataUtils,
  DoubleSide,
  EquirectangularReflectionMapping,
  HalfFloatType,
  Matrix4,
  PMREMGenerator,
  Path,
  Quaternion,
  RGBAFormat,
  SRGBColorSpace,
  Shape,
  Vector3,
  type Texture,
  type WebGLRenderer,
} from "three";
import type {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
} from "three";

import type { MuseumTheme } from "./Museum";
import { FocusField, focusLayer } from "./museumFocus";
import { DetailView, readableScale } from "./museumMonitorViews";
import type { SectionId } from "./museumMonitorViews";

import {
  makeBrushedTexture,
  makeDialTexture,
  makeGlassTexture,
  makeGlowTexture,
  makePanelTexture,
  makeRimTexture,
  makeScreenTexture,
  makeVignetteTexture,
} from "./museumMonitorPaint";
import type {
  MonitorAchievement,
  MonitorProfile,
  MonitorProject,
  MonitorSkill,
  MonitorStat,
} from "./museumMonitorPaint";

/* The content types are defined next to the paint that renders them; they are
 * re-exported here because <Museum> and <Scene> reach for them through the
 * monitor, which is the thing they actually know about. */
export type { SectionId } from "./museumMonitorViews";
export type {
  MonitorAchievement,
  MonitorIcon,
  MonitorProfile,
  MonitorProject,
  MonitorSkill,
  MonitorStat,
} from "./museumMonitorPaint";


/* ------------------------------------------------------------------ *
 * The object
 * ------------------------------------------------------------------ *
 * Every dimension below is in metres and measured from the WALL outward, so the
 * z ladder reads top to bottom as the order you would assemble it in.
 */

/** The four slabs, back to front. The mount plate is smaller than the housing so
 *  it disappears behind it and leaves a shadow gap — that gap is most of what
 *  makes a wall-mounted object look mounted rather than glued.
 *
 *  The gasket between the two housing slabs is the single most valuable 6mm in
 *  this file: a lit seam running all the way round the machine, seen edge-on
 *  from every angle you drive past at. It is the "thin illuminated outer frame"
 *  of the brief, and it works because it is structural — light escaping from
 *  between two plates, not a glowing outline drawn on one. */
const MOUNT_DEPTH = 0.1;
const REAR_DEPTH = 0.24;
const GASKET_DEPTH = 0.06;
const FRONT_DEPTH = 0.22;
const BEZEL_DEPTH = 0.28;

const MOUNT_Z = 0;
const REAR_Z = MOUNT_Z + MOUNT_DEPTH;
const GASKET_Z = REAR_Z + REAR_DEPTH;
const FRONT_Z = GASKET_Z + GASKET_DEPTH;
/** The front housing's face — the floor of the screen well, and the datum every
 *  UI layer below is measured from. */
const SCREEN_Z = FRONT_Z + FRONT_DEPTH;
const BEZEL_FACE_Z = SCREEN_Z + BEZEL_DEPTH;

/** How far the mount plate and the rear slab are inset from the outline, so the
 *  machine steps back toward the wall instead of being one brick. */
const MOUNT_INSET = 0.55;
const REAR_INSET = 0.16;

/** The bezel band, and the corner cuts. A chamfer rather than a radius: a
 *  rounded corner is consumer electronics, a 45° cut is aerospace, and the whole
 *  design language here is the second one. The aperture's cut is smaller than
 *  the housing's so the two chamfers read as concentric rather than as one thick
 *  diagonal. */
const BEZEL_BAND = 0.3;
const OUTER_CHAMFER = 0.42;
const APERTURE_CHAMFER = 0.26;
const BEVEL = 0.028;

/** Margin between the aperture and the interface inside it. */
const SCREEN_PAD = 0.28;

/** The well the interface is stacked through: from the substrate on the housing
 *  face up to the cover glass just inside the bezel lip. Everything positional
 *  in the UI is a fraction of this, so the whole stack compresses or opens up
 *  with one number. */
const WELL = BEZEL_DEPTH - 0.04;
/** `z(0)` is the substrate, `z(1)` is the underside of the cover glass. */
const z = (f: number) => SCREEN_Z + WELL * f;

/* The depth ladder itself, named rather than numbered at the call sites — the
 * order of these lines IS the design, and a raw 0.42 in the middle of a JSX
 * block tells you nothing about what it is meant to be behind. */
const Z_SUBSTRATE = z(0.01);
const Z_GRID = z(0.08);
const Z_WATERMARK = z(0.14);
const Z_BLOOM = z(0.2);
const Z_CHAMBER_BACK = z(0.24);
const Z_PORTRAIT = z(0.34);
const Z_PANE = z(0.46);
const Z_PANE_CONTENT = z(0.56);
const Z_RING_INNER = z(0.5);
const Z_RING_MID = z(0.62);
const Z_RING_OUTER = z(0.72);
const Z_TYPE = z(0.66);
const Z_SWEEP = z(0.82);
const Z_RETICLE = z(0.83);

/* The interactive layers. The overview scrim hangs in front of every overview
 * surface, so dimming everything you are leaving is one opacity on one pane
 * rather than a write on every material behind it.
 *
 * The opened view is no longer on this ladder at all. It is docked in front of
 * the viewer — see THE CONSOLE below — and Z_DOCK is only where it STARTS: flat
 * on the screen, in the plane the panel it grew out of was sitting in, before it
 * leaves the building. */
const Z_OVERVIEW_SCRIM = z(0.845);
const Z_DOCK = z(0.865);
const Z_MOTES = z(0.88);
const Z_VIGNETTE = z(0.975);
const Z_GLASS = z(0.99);

/** The bold grid's pitch, in METRES — the one grid on this display that is
 *  ruled in world units rather than in cells, so its lines stay the same size
 *  however big the machine is. Deliberately the same numbers as the hall wall's
 *  own grid in museumHolo.tsx: the two are meant to be seen meeting across the
 *  reveal as a single ruling the display happens to be a lit part of. Retune one
 *  and retune the other. */
const BOLD_GRID_PITCH_X = 2.6;
const BOLD_GRID_PITCH_Y = 1.9;
const BOLD_GRID_WEIGHT = 0.014;

/* ------------------------------------------------------------------ *
 * Motion
 * ------------------------------------------------------------------ */

/** The refresh sweeps. Coprime-ish periods for the same reason the wall behind
 *  uses them: two bars that cross at the same spot every cycle read as a loop. */
const SCAN_PERIOD = 7.3;
const SWEEP_PERIOD = 11;
const SCAN_PEAK = 0.16;

/** How long the meters take to charge from nothing when the room wakes up. The
 *  monitor is asleep until someone drives in, and instruments that are ALREADY
 *  at their reading when the lights come up look painted on. */
const BOOT_SECONDS = 1.6;

/** Activity bars. Sixteen, not the wall's twenty-two: this strip is a third of
 *  the width and bars thinner than their own gap stop reading as data. */
const ACTIVITY_BARS = 16;


/* ------------------------------------------------------------------ *
 * What the metal reflects
 * ------------------------------------------------------------------ *
 * A black metallic housing with nothing to reflect renders as a flat black
 * cutout, exactly as <useCarEnvMap> says of the car's paint — and for the same
 * reason it needs its own environment. It cannot borrow the car's: that map is a
 * road at night, and this object is indoors under three strips of cove light.
 *
 * So this paints a HALL instead: near-black everywhere, a bright band overhead
 * where the coves run, a wide cool patch in front standing in for the monitor's
 * own screen bouncing back off the far wall, and a dim floor. Six emitters would
 * be extravagant; three gradients are enough for a surface this rough.
 *
 * Cached against the renderer so two museums with monitors prefilter one map
 * between them rather than one each.
 */
/* Keyed by renderer AND by accent, not by renderer alone. The two halls down
 * this road run opposite palettes — one cyan, one violet — so a cache that
 * remembered only "this renderer already has a map" would hand the second
 * museum the first one's colour, and the wash in the housing's reflections
 * would be the wrong hue in whichever building happened to mount second. Two
 * 64×32 prefilters is the entire cost of not having that bug.
 *
 * Never disposed, deliberately: it outlives any one monitor by design, so there
 * is no unmount at which throwing it away would be correct. It is a few hundred
 * kilobytes for the life of the page. */
const ENV_CACHE = new WeakMap<WebGLRenderer, Map<string, Texture>>();

function useMonitorEnvMap(accent: string): Texture {
  const renderer = useThree((state) => state.gl);

  return useMemo(() => {
    let byAccent = ENV_CACHE.get(renderer);
    if (!byAccent) {
      byAccent = new Map();
      ENV_CACHE.set(renderer, byAccent);
    }
    const cached = byAccent.get(accent);
    if (cached) return cached;

    const W = 64;
    const H = 32;
    const data = new Uint16Array(W * H * 4);
    const tint = [
      parseInt(accent.slice(1, 3), 16) / 255,
      parseInt(accent.slice(3, 5), 16) / 255,
      parseInt(accent.slice(5, 7), 16) / 255,
    ];

    for (let y = 0; y < H; y++) {
      // Rows run bottom-up: three samples an equirect map with v = 0 straight
      // down, so the LAST row is the ceiling. Backwards and the housing reflects
      // the floor above itself, which reads as unplaceably wrong.
      const v = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / W;

        let r = 0.004;
        let g = 0.005;
        let b = 0.008;

        // The ceiling coves: a hot band across the top of the sphere.
        const cove = Math.max(0, 1 - Math.abs(v - 0.9) * 9) ** 2 * 2.4;
        r += cove * 0.62;
        g += cove * 0.78;
        b += cove;

        // The room's own glow at eye level, strongest ahead and behind.
        const room = Math.max(0, 1 - Math.abs(v - 0.55) * 5) ** 2;
        const facing = 0.45 + 0.55 * Math.cos(u * Math.PI * 2) ** 2;
        const wash = room * facing * 0.5;
        r += wash * tint[0];
        g += wash * tint[1];
        b += wash * tint[2];

        // Floor bounce — dim, and cooler than the source, as a dark polished
        // floor's bounce always is.
        const floor = Math.max(0, 1 - v * 2.6) * 0.05;
        r += floor * 0.4;
        g += floor * 0.6;
        b += floor;

        const i = (y * W + x) * 4;
        data[i] = DataUtils.toHalfFloat(r);
        data[i + 1] = DataUtils.toHalfFloat(g);
        data[i + 2] = DataUtils.toHalfFloat(b);
        data[i + 3] = DataUtils.toHalfFloat(1);
      }
    }

    const source = new DataTexture(data, W, H, RGBAFormat, HalfFloatType);
    source.mapping = EquirectangularReflectionMapping;
    source.flipY = false;
    source.needsUpdate = true;

    const pmrem = new PMREMGenerator(renderer);
    const prefiltered = pmrem.fromEquirectangular(source);
    pmrem.dispose();
    source.dispose();

    byAccent.set(accent, prefiltered.texture);
    return prefiltered.texture;
  }, [renderer, accent]);
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/** The chamfered outline every slab of this machine is cut from. Points run
 *  counter-clockwise, which is what a Shape wants; a hole wants the reverse. */
function chamferPoints(w: number, h: number, cut: number): [number, number][] {
  const x = w / 2;
  const y = h / 2;
  const c = Math.min(cut, x, y);
  return [
    [-x + c, -y],
    [x - c, -y],
    [x, -y + c],
    [x, y - c],
    [x - c, y],
    [-x + c, y],
    [-x, y - c],
    [-x, -y + c],
  ];
}

function chamferShape(w: number, h: number, cut: number): Shape {
  const shape = new Shape();
  chamferPoints(w, h, cut).forEach(([x, y], i) =>
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y),
  );
  shape.closePath();
  return shape;
}

/** The bezel: the same outline with the aperture cut out of it, so the display
 *  is seen THROUGH a real hole in a real plate rather than being a bright
 *  rectangle with a dark rectangle drawn around it. */
function apertureShape(
  w: number,
  h: number,
  cut: number,
  band: number,
  innerCut: number,
): Shape {
  const shape = chamferShape(w, h, cut);
  const hole = new Path();
  chamferPoints(w - band * 2, h - band * 2, innerCut)
    .reverse()
    .forEach(([x, y], i) => (i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
  hole.closePath();
  shape.holes.push(hole);
  return shape;
}

const EXTRUDE = (depth: number) => ({
  depth,
  bevelEnabled: true,
  bevelThickness: BEVEL,
  bevelSize: BEVEL,
  bevelOffset: 0,
  bevelSegments: 1,
  curveSegments: 1,
});

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ *
 * Pure arithmetic on the monitor's own width and height, so the same interface
 * composes itself onto a bigger or smaller machine instead of being a set of
 * numbers that happened to suit the first one. Memoised on the two dimensions.
 *
 * It composes into TWO different machines, and the choice is made from the
 * aspect alone. That is not generality for its own sake — a display bolted to
 * one third of a wall and a display that IS the wall are genuinely different
 * objects, and the same three-column composition cannot serve both:
 *
 *   under 3:1  — one column of modules each side of the identity. The columns
 *                are tall and narrow, which is the shape a module wants.
 *   3:1 and up — TWO columns each side. Stretching two columns across a wall
 *                nearly five times wider than it is tall gives seven panels the
 *                proportions of letterbox slots, and a wall of letterbox slots
 *                is a spreadsheet. Splitting them keeps every module roughly
 *                the shape it was designed at, and fills the width with more
 *                instruments instead of wider ones — which is what an actual
 *                command wall does.
 *
 * Every module carries its own x and w for the same reason: with a variable
 * number of columns there is no longer one mirrored offset that describes where
 * a panel is, so the layout says outright where each one goes.
 */
const WIDE_ASPECT = 3;

function deriveMonitorLayout(width: number, height: number) {
  const screenW = width - BEZEL_BAND * 2;
  const screenH = height - BEZEL_BAND * 2;
  const contentW = screenW - SCREEN_PAD * 2;
  const contentH = screenH - SCREEN_PAD * 2;

  const wide = width / height >= WIDE_ASPECT;
  const perSide = wide ? 2 : 1;
  const colW = contentW * (wide ? 0.176 : 0.265);
  const gutter = contentW * (wide ? 0.02 : 0.028);
  const centerW = contentW - (colW + gutter) * perSide * 2;
  const top = contentH / 2;
  const gap = contentH * 0.024;

  /** The centre of outer column `i`, counted left to right across the whole
   *  screen — 0 (and 1) to the left of the identity, the rest to its right.
   *
   *  Measured OUTWARD from the edge of the centre region rather than inward
   *  from the screen edge: the identity block is the thing that has to stay
   *  centred, and letting the columns hang off it means the two sides can never
   *  drift apart by a rounding error. */
  const columnX = (i: number) => {
    const side = i < perSide ? -1 : 1;
    const rank = i < perSide ? perSide - i : i - perSide + 1;
    return side * (centerW / 2 + gutter * rank + colW * (rank - 0.5));
  };

  /** Stack modules down one column from the top of the content area. */
  const stack = (column: number, fractions: number[]) => {
    const x = columnX(column);
    let cursor = top;
    return fractions.map((f) => {
      const h = contentH * f;
      const y = cursor - h / 2;
      cursor -= h + gap;
      return { x, y, w: colW, h };
    });
  };

  /* Which module lands in which column. On the narrow machine all four of the
   * left-hand modules share one column and all three of the right-hand ones
   * share the other; on the wide machine they split, and CORE SKILLS gets a
   * column to itself because five meters and their labels are the tallest
   * content on the display. */
  const [about, stats, tech, activity] = wide
    ? [...stack(0, [0.556, 0.42]), ...stack(1, [0.496, 0.48])]
    : stack(0, [0.284, 0.147, 0.25, 0.247]);

  /* CORE SKILLS shared its column in the first wide build and it was wrong in
     both directions: five meters stretched down a full-height column are five
     hairlines with a hand's width of nothing between them, and ACHIEVEMENTS
     squeezed under them had four tiles the shape of letterboxes. Swapping which
     one gets the whole column fixes both — four achievement tiles in a 2x2 over
     full height come out very nearly square, which is the shape a tile wants,
     and the meters get a panel proportioned like the instrument they are. */
  /* On a wall-sized machine there is room for an eighth instrument, and the
     work is what a portfolio is FOR — so PROJECTS gets a panel of its own next
     to the diagnostics. The narrow machine cannot spare the height for it and
     shows seven; the PROJECT DETAIL environment behind it is still reachable
     from the projects panel wherever that panel is. */
  const right = wide
    ? [...stack(2, [0.44, 0.264, 0.248]), ...stack(3, [1])]
    : stack(1, [0.3, 0.22, 0.2, 0.2]);
  // Wide deals column 2 as skills / focus / projects and column 3 as
  // achievements alone; narrow runs all four down one column in reading order.
  const [skills, focus, projects, achievements] = wide
    ? right
    : [right[0], right[2], right[3], right[1]];

  // The chamber, sized to whichever runs out first — the centre column's width
  // or the screen's height. On anything wider than square it is always height.
  const chamberR = Math.min(centerW / 2, contentH * (wide ? 0.34 : 0.29));
  const chamberY = top - contentH * 0.02 - chamberR;
  const portraitR = chamberR * 0.55;

  // Type below the chamber. The reflection is a real mirrored copy rather than a
  // gradient trick, which is the only way it stays a reflection of THIS name
  // when the name changes.
  const nameSize = Math.min(centerW * 0.088, contentH * 0.1);
  /** Cleared past chamberR * 1.05, not past chamberR: the outermost thing in
   *  the chamber is the dial, and the dial quad is 2.1 radii across. Measuring
   *  the gap from the radius alone put the cap-heights of the name straight
   *  through the tick ring. */
  const nameY = chamberY - chamberR * 1.1 - nameSize * 0.75;
  const reflectionY = nameY - nameSize * 1.02;
  const roleY = reflectionY - nameSize * 1.02;
  const dividerY = roleY - contentH * 0.048;
  const telemetryY = dividerY - contentH * 0.048;

  return {
    screenW,
    screenH,
    contentW,
    contentH,
    wide,
    colW,
    centerW,
    top,
    about,
    stats,
    tech,
    activity,
    skills,
    achievements,
    focus,
    projects,
    chamberR,
    chamberY,
    portraitR,
    nameSize,
    nameY,
    reflectionY,
    roleY,
    dividerY,
    telemetryY,
  };
}

/* ------------------------------------------------------------------ *
 * Touching it
 * ------------------------------------------------------------------ *
 * The display is not a picture of an interface, it is one — every module on it
 * is a real object in the world that can be pointed at and opened. Three things
 * make that work, and each of them is a decision rather than a default.
 *
 * WHAT IS HOVERED IS LIFTED, NOT LIT. The obvious hover is to brighten the panel
 * and dim its neighbours, which means writing an opacity on every material in
 * every other module, every frame. Instead the hovered module is pushed a
 * centimetre TOWARD the viewer, past a dark pane that hangs across the whole
 * screen — so the one in front stays bright and the rest fall behind a scrim,
 * for exactly one material write. It is also more honest: the panel is nearer,
 * so of course it is brighter.
 *
 * A DRAG IS NOT A CLICK. The canvas this lives in is also the one you turn the
 * view with, and the browser fires `click` after any press-release on the same
 * element however far the pointer travelled in between. Every module therefore
 * remembers where the press landed and refuses the click if it moved — without
 * that, looking around the room opens a panel.
 *
 * THE TRANSITION IS THE SAME OBJECT MOVING. Opening a panel does not swap the
 * screen's contents; it takes that panel's own painted glass, flies it off the
 * wall and cross-dissolves the detail into it as it arrives. Two dark panes do
 * the fading — one over the overview, one over the detail — so the whole
 * cinematic costs two opacity writes and a handful of transforms per frame
 * rather than a fade on every material.
 *
 * AND IT ARRIVES IN FRONT OF YOU, NOT ON THE WALL. See THE CONSOLE, below.
 */

/** The cursor, written on whatever element the pointer event came from — which
 *  is the canvas. Reached through the event rather than through the renderer
 *  because the page sets `cursor-grab` on the wrapper for the drag-to-look, and
 *  only an inline style on the canvas itself outranks it. */
function setCursor(event: { nativeEvent: Event }, cursor: string) {
  const target = event.nativeEvent.target;
  if (target instanceof HTMLElement) target.style.cursor = cursor;
}

/** One module's rectangle on the screen, in the content area's own frame. */
export type SectionRect = { x: number; y: number; w: number; h: number };

/** How far a hovered module rises, grows and turns. All three are small: this
 *  is a machined instrument reacting to being pointed at, not a web card. The
 *  lift is the important one — it is what carries the panel past the scrim. */
const HOVER_LIFT = 0.03;
const HOVER_SCALE = 0.028;
const HOVER_TILT = 0.05;
/** Frame-rate independent easing, the same 1 - e^(-k·dt) curve the chase camera
 *  uses, so a hover feels identical at 30fps and 144fps. */
const HOVER_STIFFNESS = 12;

/** How long the open and close cinematics run. Slow enough to read as travel
 *  rather than as a cut; fast enough that it is not a loading screen. */
const TRANSITION_SECONDS = 0.85;

/** How far into the transition the incoming view starts arriving. The overlap
 *  matters more than either number: no overlap is a fade to black and back,
 *  which reads as two separate events rather than one movement. */
const ARRIVE_AT = 0.42;

/* ------------------------------------------------------------------ *
 * THE CONSOLE
 * ------------------------------------------------------------------ *
 * Where an opened panel actually goes.
 *
 * It used to grow until it filled the display and stop there, which meant
 * reading a case study off a wall thirty metres wide from a car parked in front
 * of it — legible, and completely inert. A machine that can compose an interface
 * anywhere in the room should hand it to you: the panel leaves the wall, flies
 * out into the hall, and stops an arm's length from your face, at which point it
 * is no longer part of the building at all. Everything behind it goes out of
 * focus (museumFocus.tsx does that half), and this half is the object itself.
 *
 * Three decisions, and none of them is decoration.
 *
 * IT IS RECOMPOSED, NOT ZOOMED. The wall is nearly six times wider than it is
 * tall. Bring that shape to your face and it is a letterbox slot: full width,
 * a fifth of the height, type no larger than it was. So the console takes its
 * own aspect — the height of the display, and only as much of its width as
 * DOCK_ASPECT allows — and the views compose into that instead. Everything in
 * museumMonitorViews is a fraction of the box it is handed, so this costs
 * nothing but the number, and it is what actually makes the type bigger: the
 * same fraction of the same height, filling most of the screen instead of a
 * fifth of it.
 *
 * IT FOLLOWS YOUR HEAD, LATE. Locked rigidly to the camera it is a HUD, and a
 * HUD is flat by definition — nothing that can never be seen from an angle reads
 * as an object. So the console chases a lagging copy of the camera: turn, and it
 * swings after you, showing its edge, its thickness and the shadow gap behind
 * it before it settles square again. The lag IS the third dimension.
 *
 * IT IS A MACHINED SLAB, NOT A PANE. Cut from the same chamfered outline as the
 * monitor's own housing, with a lit gasket between its back plate and its frame,
 * and its interface RECESSED in the well the frame makes. It has to survive
 * being looked at from a metre away, which nothing on the wall ever does.
 */

/** The console's shape, as a multiple of the WINDOW's.
 *
 *  A fixed aspect is what "not responsive" looks like: composed at a shade over
 *  two to one it fills a 16:9 window and leaves a third of a 4:3 one empty,
 *  with type shrunk to match. So the console takes the window's own proportions
 *  and stretches them a fifth wider — a console slightly wider than its frame
 *  fills the width and still leaves the defocused room visible above and below,
 *  which is the composition the whole effect is built on.
 *
 *  The clamps are where the views' own tolerance runs out. Under about 1.6 the
 *  two-column layouts have nowhere to put a second column; over about 2.6 the
 *  reading measure gets long enough that the eye loses the line. Outside that
 *  range the console stops matching the window and the type scale takes over —
 *  see `readableScale`. */
const DOCK_ASPECT_BIAS = 1.2;
const DOCK_ASPECT_MIN = 1.6;
const DOCK_ASPECT_MAX = 2.6;

/** The frame around the console's aperture, as a fraction of its height. Shared
 *  by the body that draws it and the fit that has to allow for it. */
const DOCK_BAND = 0.042;

/** How far in front of the viewer it parks, in metres. Near enough to be the
 *  only thing you are looking at; far enough that the perspective across a
 *  two-metre panel stays gentle. */
const DOCK_DISTANCE = 2.6;

/** How much of the frame it fills at that distance, across and down. Both under
 *  one on purpose: a panel that reaches the edges of the window has nowhere to
 *  be seen against, and the defocused room around it is half the effect. */
const DOCK_FILL_W = 0.93;
const DOCK_FILL_H = 0.85;

/** How hard the console chases the camera. Low — this is the lag that makes it
 *  an object rather than an overlay, and at much above 8 it stops being
 *  visible at all. */
const DOCK_FOLLOW = 5;

/** The console's own depth ladder, as fractions of its HEIGHT so the whole slab
 *  holds its proportions at any size. Negative is behind the interface, toward
 *  the back plate; positive is out toward the viewer. */
const C_BACK = -0.056;
const C_GASKET = -0.022;
const C_FRAME = -0.014;
const C_SUBSTRATE = 0;
const C_CONTENT = 0.012;
const C_SCRIM = 0.03;
const C_EXPANDER = 0.042;
const C_GLASS = 0.052;
const C_CONTROL = 0.058;
/** How far the frame stands proud of the substrate — the depth of the well the
 *  interface is recessed in, and the thickness you see when it swings. */
const C_FRAME_DEPTH = 0.076;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Ease-in-out. Instruments accelerate and settle; they do not jump and stop. */
const ease = (v: number) => (v < 0.5 ? 4 * v ** 3 : 1 - (-2 * v + 2) ** 3 / 2);

type SectionWiring = {
  theme: MuseumTheme;
  lit: boolean;
  hovered: SectionId | null;
  interactive: boolean;
  onHover: (id: SectionId | null) => void;
  onOpen: (id: SectionId) => void;
};

/**
 * One module of the overview, as a thing you can point at.
 *
 * The pane is its own hit target rather than carrying an invisible plane in
 * front of it: the pane is already exactly the rectangle a user thinks they are
 * clicking, and an extra quad would be one more object in a scene the floor
 * renders twice.
 */
function Section({
  id,
  rect,
  map,
  depth,
  theme: t,
  lit,
  hovered,
  interactive,
  onHover,
  onOpen,
  children,
}: SectionWiring & {
  id: SectionId;
  rect: SectionRect;
  map: CanvasTexture | null;
  depth: number;
  children?: ReactNode;
}) {
  const group = useRef<Group>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const level = useRef(0);
  /** Where the press landed, so a drag across this panel can be told from a
   *  click on it. */
  const pressed = useRef<{ x: number; y: number } | null>(null);

  const on = interactive && hovered === id;
  // Panels turn TOWARD the middle of the screen, so a wall of them reads as
  // angled to face one viewer rather than as a row of independently tilted
  // cards.
  const turn = rect.x < 0 ? 1 : -1;

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-HOVER_STIFFNESS * delta);
    level.current += ((on ? 1 : 0) - level.current) * k;
    const v = level.current;

    if (group.current) {
      group.current.position.z = depth + v * HOVER_LIFT;
      group.current.scale.setScalar(1 + v * HOVER_SCALE);
      group.current.rotation.y = v * HOVER_TILT * turn;
      group.current.rotation.x = -v * HOVER_TILT * 0.35;
    }
    if (material.current) {
      material.current.opacity = (lit ? 1 : 0.45) * (1 + v * 0.55);
    }
  });

  return (
    <group ref={group} position={[rect.x, rect.y, depth]}>
      {map && (
        <mesh
          onPointerOver={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  setCursor(e, "pointer");
                  onHover(id);
                }
              : undefined
          }
          onPointerOut={
            interactive
              ? (e) => {
                  setCursor(e, "");
                  onHover(null);
                }
              : undefined
          }
          onPointerDown={
            interactive
              ? (e) => {
                  pressed.current = { x: e.clientX, y: e.clientY };
                }
              : undefined
          }
          onClick={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  const from = pressed.current;
                  pressed.current = null;
                  // Six pixels of slop: enough to forgive a shaky hand, far
                  // less than any deliberate drag of the view.
                  if (!from || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) {
                    return;
                  }
                  // The panel is about to unmount, taking its pointer-out with
                  // it, so the cursor has to be handed back here or it sticks.
                  setCursor(e, "");
                  onOpen(id);
                }
              : undefined
          }
        >
          <planeGeometry args={[rect.w, rect.h]} />
          <meshBasicMaterial
            ref={material}
            map={map}
            transparent
            opacity={lit ? 1 : 0.45}
            depthWrite={false}
          />
        </mesh>
      )}
      <group position={[0, 0, Z_PANE_CONTENT - Z_PANE]}>{children}</group>
      {/* A hairline along the top of a hovered panel — the one piece of feedback
          that is a colour rather than a movement, because movement alone at the
          far end of a hall is easy to miss. */}
      <mesh position={[0, rect.h / 2, 0.002]} visible={on}>
        <planeGeometry args={[rect.w, 0.012]} />
        <meshStandardMaterial
          color={t.strip}
          emissive={t.accent}
          emissiveIntensity={lit ? 1.9 : 0.5}
          roughness={0.35}
        />
      </mesh>
    </group>
  );
}

/**
 * The pointer's mark on the screen: four corner brackets that fly to whatever
 * module is under the cursor.
 *
 * One of these for the whole display rather than one per module. Eight tiny
 * planes hidden inside every panel would be sixty-four objects waiting to be
 * used four at a time — and a single reticle that TRAVELS between panels reads
 * far better anyway, because the movement itself says the machine is tracking
 * you rather than merely responding.
 */
function Reticle({
  rect,
  theme: t,
  lit,
  visible,
}: {
  rect: SectionRect | null;
  theme: MuseumTheme;
  lit: boolean;
  visible: boolean;
}) {
  const group = useRef<Group>(null);
  const corners = useRef<Group>(null);
  const shown = useRef(0);
  const arm = 0.16;

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-HOVER_STIFFNESS * delta);
    shown.current += ((visible && rect ? 1 : 0) - shown.current) * k;
    if (!group.current) return;
    group.current.visible = shown.current > 0.02;
    if (rect) {
      group.current.position.x += (rect.x - group.current.position.x) * k;
      group.current.position.y += (rect.y - group.current.position.y) * k;
      // The brackets sit at the panel's corners, so the reticle has to reshape
      // as it travels rather than just move.
      const half = corners.current;
      if (half) {
        half.children.forEach((corner, i) => {
          const sx = i % 2 === 0 ? -1 : 1;
          const sy = i < 2 ? 1 : -1;
          corner.position.x += (sx * (rect.w / 2) - corner.position.x) * k;
          corner.position.y += (sy * (rect.h / 2) - corner.position.y) * k;
        });
      }
    }
    // Contracts onto the panel as it appears — an expanding reticle reads as an
    // explosion, a contracting one reads as a lock.
    group.current.scale.setScalar(1 + (1 - shown.current) * 0.06);
  });

  return (
    <group ref={group} position={[0, 0, Z_RETICLE]}>
      <group ref={corners}>
        {[0, 1, 2, 3].map((i) => {
          const sx = i % 2 === 0 ? -1 : 1;
          const sy = i < 2 ? 1 : -1;
          return (
            <group key={i}>
              <mesh position={[(sx * arm) / 2, 0, 0]}>
                <planeGeometry args={[arm, 0.014]} />
                <meshStandardMaterial
                  color={t.strip}
                  emissive={t.accent}
                  emissiveIntensity={lit ? 2 : 0.5}
                  roughness={0.35}
                />
              </mesh>
              <mesh position={[0, (sy * arm) / 2, 0]}>
                <planeGeometry args={[0.014, arm]} />
                <meshStandardMaterial
                  color={t.strip}
                  emissive={t.accent}
                  emissiveIntensity={lit ? 2 : 0.5}
                  roughness={0.35}
                />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/** The way out of a detail view. Deliberately the only control on the display
 *  that looks like a control — everything else is an instrument you happen to
 *  be able to touch, and one unmistakable affordance is worth more than seven
 *  ambiguous ones. */
function BackControl({
  x,
  y,
  z: depth,
  size,
  theme: t,
  lit,
  onBack,
}: {
  x: number;
  y: number;
  z: number;
  size: number;
  theme: MuseumTheme;
  lit: boolean;
  onBack: () => void;
}) {
  const [over, setOver] = useState(false);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const w = size * 7.2;
  const h = size * 2.1;

  return (
    <group position={[x, y, depth]}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setCursor(e, "pointer");
          setOver(true);
        }}
        onPointerOut={(e) => {
          setCursor(e, "");
          setOver(false);
        }}
        onPointerDown={(e) => {
          pressed.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          e.stopPropagation();
          const from = pressed.current;
          pressed.current = null;
          if (!from || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return;
          setCursor(e, "");
          onBack();
        }}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial
          color={t.accent}
          transparent
          opacity={(lit ? 0.14 : 0.06) * (over ? 2.2 : 1)}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -h / 2, 0.002]}>
        <planeGeometry args={[w, 0.01]} />
        <meshStandardMaterial
          color={t.strip}
          emissive={t.accent}
          emissiveIntensity={(lit ? 1.6 : 0.4) * (over ? 1.5 : 1)}
          roughness={0.35}
        />
      </mesh>
      <Text
        position={[0, 0, 0.004]}
        fontSize={size}
        letterSpacing={0.24}
        anchorX="center"
        anchorY="middle"
        color={over ? t.panelText : t.accent}
        fillOpacity={lit ? 1 : 0.4}
      >
        {"‹  BACK TO OVERVIEW"}
      </Text>
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * The console's body
 * ------------------------------------------------------------------ */

/**
 * The slab the docked interface is set into.
 *
 * Everything here exists for one reason: at an arm's length a bright rectangle
 * is a poster, and a poster hanging in mid-air is a screenshot. So the console
 * is built the way the machine on the wall is built — a back plate, a lit gasket
 * escaping from between two pieces, a chamfered frame with a real aperture, and
 * the interface RECESSED behind that frame's lip. When it swings after your head
 * you see the thickness, the gasket edge-on and the shadow the frame casts into
 * its own well, and none of those things can be faked with a border.
 *
 * It fades in on the same clock the flight runs on rather than being there from
 * the first frame — at the start of the movement the console is still lying flat
 * inside the monitor's screen, and a frame appearing around a slice of the
 * display before the panel has left the wall is the one beat that would give
 * the trick away.
 *
 * The fade is a traverse rather than a rack of refs. Nine materials all reading
 * one number is the exact case where naming each of them costs more than it
 * buys, and each mesh carries its own full-strength opacity in `userData.base`
 * so the traverse stays a multiply and never a table of special cases.
 */
function ConsoleShell({
  w,
  h,
  theme: t,
  lit,
  env,
  brushed,
  screen,
  glow,
  vignette,
  reveal,
}: {
  w: number;
  h: number;
  theme: MuseumTheme;
  lit: boolean;
  env: Texture;
  brushed: CanvasTexture | null;
  screen: CanvasTexture | null;
  glow: CanvasTexture | null;
  vignette: CanvasTexture | null;
  /** How far the console has flown, 0 to 1. */
  reveal: RefObject<number>;
}) {
  const shell = useRef<Group>(null);

  const band = h * DOCK_BAND;
  const cut = h * 0.08;
  const shapes = useMemo(
    () => ({
      back: chamferShape(w + band * 1.4, h + band * 1.4, cut),
      gasket: chamferShape(w + band * 2, h + band * 2, cut),
      frame: apertureShape(w + band * 2, h + band * 2, cut, band, cut * 0.72),
      substrate: chamferShape(w, h, cut * 0.72),
    }),
    [w, h, band, cut],
  );

  useFrame(() => {
    const group = shell.current;
    if (!group) return;
    const v = clamp01(reveal.current ?? 0);
    // Below a percent there is nothing to see and nine materials not to write.
    group.visible = v > 0.01;
    if (!group.visible) return;
    group.traverse((object) => {
      const material = (object as Mesh).material as MeshStandardMaterial | undefined;
      if (!material || Array.isArray(material)) return;
      material.opacity = v * ((object.userData.base as number | undefined) ?? 1);
    });
  });

  const halfH = h / 2;

  return (
    <group ref={shell} visible={false}>
      {/* What it throws on the room behind it. Additive and enormous, so it has
          no edge to find — the defocused hall picks up the console's own light
          exactly as the wall behind the monitor picks up the display's. */}
      {glow && (
        <mesh position={[0, 0, h * C_BACK - h * 0.02]} userData={{ base: 0.22 }}>
          <planeGeometry args={[w * 1.9, h * 2.6]} />
          <meshBasicMaterial
            map={glow}
            color={t.holo}
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Back plate — inset inside the gasket's outline, so the console steps
          back toward its own shadow instead of being one brick. */}
      <mesh position={[0, 0, h * C_BACK + BEVEL]} userData={{ base: 1 }}>
        <extrudeGeometry
          args={[shapes.back, EXTRUDE(h * (C_GASKET - C_BACK) - BEVEL * 2)]}
        />
        <meshStandardMaterial
          color={t.panelShell}
          metalness={0.9}
          roughness={0.5}
          roughnessMap={brushed}
          envMap={env}
          envMapIntensity={1.1}
          transparent
          opacity={0}
        />
      </mesh>

      {/* The gasket: the same six millimetres of escaped light that runs round
          the machine on the wall, and the one part of this object that tells you
          it is powered rather than printed. */}
      <mesh position={[0, 0, h * C_GASKET]} userData={{ base: 1 }}>
        <extrudeGeometry
          args={[shapes.gasket, { depth: h * (C_FRAME - C_GASKET), bevelEnabled: false }]}
        />
        <meshStandardMaterial
          color={t.strip}
          emissive={t.accent}
          emissiveIntensity={lit ? 1.6 : 0.4}
          roughness={0.35}
          metalness={0.2}
          transparent
          opacity={0}
        />
      </mesh>

      {/* The frame, with the aperture cut through it. Deeper than it is wide, so
          the interface sits at the bottom of a well and the frame's inner wall
          is a visible face rather than an outline. */}
      <mesh position={[0, 0, h * C_FRAME + BEVEL]} userData={{ base: 1 }}>
        <extrudeGeometry
          args={[shapes.frame, EXTRUDE(h * (C_FRAME_DEPTH - C_FRAME) - BEVEL * 2)]}
        />
        <meshStandardMaterial
          color={t.deckCap}
          metalness={0.94}
          roughness={0.3}
          roughnessMap={brushed}
          envMap={env}
          envMapIntensity={1.1}
          transparent
          opacity={0}
        />
      </mesh>

      {/* Two lit lines let into the frame's face, unequal — a frame lit evenly
          all the way round is a lightbox. */}
      {(
        [
          [halfH + band * 0.55, w * 0.72, t.accent, 1],
          [-halfH - band * 0.55, w * 0.44, t.accentAlt, 0.7],
        ] as const
      ).map(([y, width, color, strength]) => (
        <mesh
          key={y}
          position={[0, y, h * C_FRAME_DEPTH + 0.004]}
          userData={{ base: 1 }}
        >
          <planeGeometry args={[width, h * 0.006]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={color}
            emissiveIntensity={(lit ? 1.9 : 0.45) * strength}
            roughness={0.35}
            transparent
            opacity={0}
          />
        </mesh>
      ))}

      {/* The dark the interface is read against. Not quite opaque: a couple of
          percent of the defocused room coming through is what keeps the console
          in the hall rather than pasted over a photograph of it. */}
      <mesh position={[0, 0, h * C_SUBSTRATE]} userData={{ base: 0.94 }}>
        <shapeGeometry args={[shapes.substrate]} />
        <meshBasicMaterial color={t.holoScreen} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* And the machine's own ruling over it, faint. The console is the same
          instrument as the wall it came off; this is the cheapest possible way
          of saying so. */}
      {screen && (
        <mesh position={[0, 0, h * C_SUBSTRATE + 0.004]} userData={{ base: 0.5 }}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial
            map={screen}
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* The corners of the well, in shadow — the layer whose whole job is to
          subtract, and what makes the aperture read as having sides. */}
      {vignette && (
        <mesh position={[0, 0, h * C_GLASS]} userData={{ base: 0.85 }}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={vignette} transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * The portrait
 * ------------------------------------------------------------------ */

/**
 * The face, matted into the chamber's circle.
 *
 * Split out because loading a texture SUSPENDS, and the machine around it must
 * not blink out of the hall while the file is in flight.
 *
 * COVER, not contain — the opposite of what the wall frames do. A frame with
 * margins around a photo is a gallery; a chamber is a porthole, and a porthole
 * that letterboxes its subject is a screen. The crop happens in the texture's
 * own repeat/offset so no geometry knows about it.
 */
function ChamberPortrait({
  src,
  aspect = 1,
  radius,
  lit,
  rim,
}: {
  src: string;
  aspect?: number;
  radius: number;
  lit: boolean;
  rim: CanvasTexture | null;
}) {
  const loaded = useTexture(src);

  const map = useMemo(() => {
    // On a clone: useLoader caches by URL and hands the same Texture to every
    // caller, so writing to it would reach back through the cache into anything
    // else that ever loads this file. The clone shares its `source`, so the
    // pixels are still uploaded once.
    const texture = loaded.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    if (aspect > 1) {
      texture.repeat.set(1 / aspect, 1);
      texture.offset.set((1 - 1 / aspect) / 2, 0);
    } else if (aspect < 1) {
      texture.repeat.set(1, aspect);
      texture.offset.set(0, (1 - aspect) / 2);
    }
    texture.needsUpdate = true;
    return texture;
  }, [loaded, aspect]);

  return (
    <group position={[0, 0, Z_PORTRAIT]}>
      {/* The picture. Emissive from its own map rather than lit by a lamp — a
          spotlight on a face is one more light in a forward renderer, and on
          something meant to read as a backlit display it is also the wrong
          look. */}
      <mesh>
        <circleGeometry args={[radius, 64]} />
        <meshStandardMaterial
          map={map}
          emissiveMap={map}
          emissive="#ffffff"
          emissiveIntensity={lit ? 0.9 : 0.3}
          roughness={0.7}
          metalness={0}
        />
      </mesh>

      {/* The lighting rig, laid over the face. Additive, so it only ever adds
          light to the picture — it can brighten a cheekbone but never smear a
          coloured wash across one. */}
      {rim && (
        <mesh position={[0, 0, 0.004]}>
          <planeGeometry args={[radius * 2, radius * 2]} />
          <meshBasicMaterial
            map={rim}
            transparent
            opacity={lit ? 0.95 : 0.4}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * The monitor
 * ------------------------------------------------------------------ */

export type MuseumMonitorProps = {
  /** The machine's outline. 2:1 is what the interface is composed for — the
   *  three columns stop working much outside 1.8 : 1 and 2.3 : 1. */
  width: number;
  height: number;
  theme: MuseumTheme;
  /** Someone is in the room. Drives brightness and charges the meters; the
   *  animation runs either way, because it costs the same and a dark hall with a
   *  dead monitor in it looks broken rather than asleep. */
  lit: boolean;
  profile: MonitorProfile;
};

/** One shared empty list, so an absent section defaults to a STABLE reference —
 *  see the note where it is used. */
const EMPTY: never[] = [];

const DEFAULT_TELEMETRY = [
  "SYSTEM: ONLINE",
  "NETWORK: STABLE",
  "DATABASE: CONNECTED",
  "API: ACTIVE",
  "SECURITY: VERIFIED",
];

export function MuseumMonitor({
  width,
  height,
  theme: t,
  lit,
  profile,
}: MuseumMonitorProps) {
  const l = useMemo(() => deriveMonitorLayout(width, height), [width, height]);

  /* The window, in CSS pixels. The one piece of the page the monitor knows
     about, and it is here for the console: an interface that parks itself in
     front of a viewer has to be composed for the frame that viewer is actually
     looking through. R3F re-renders this component when it changes, which is
     about as often as somebody drags a window edge. */
  const windowSize = useThree((state) => state.size);

  /**
   * The console's content box — what an opened view composes into once it has
   * left the wall — and the type scale it is set at.
   *
   * Its height is the display's, so type keyed to that height stays the size it
   * was authored at. Its WIDTH follows the window, which is the whole of being
   * responsive here: a console shaped like the frame it is seen through fills
   * that frame, and a console that fills the frame is a console whose type is
   * as big as the window can make it. What is left over — a window too narrow
   * for the layouts, or simply too small — is handed to the type scale.
   */
  const dock = useMemo(() => {
    const windowAspect = windowSize.width / Math.max(1, windowSize.height);
    const aspect = Math.min(
      DOCK_ASPECT_MAX,
      Math.max(DOCK_ASPECT_MIN, windowAspect * DOCK_ASPECT_BIAS),
    );
    const h = l.contentH;
    const w = Math.min(l.contentW, h * aspect);

    /* How far down the window the console will actually land, allowing for its
       frame — the same arithmetic the flight does every frame, done once here
       because the type has to be chosen before anything is drawn. */
    const outerAspect = (w + h * DOCK_BAND * 2) / (h * (1 + DOCK_BAND * 2));
    const fill = Math.min((DOCK_FILL_W * windowAspect) / outerAspect, DOCK_FILL_H);

    return { w, h, scale: readableScale(fill, windowSize.height) };
  }, [l.contentW, l.contentH, windowSize.width, windowSize.height]);

  /* The bold grid's lines. A PITCH rounded to a whole number of cells, never a
     count: that is what keeps the ruling closing on the screen's own edges
     instead of ending on a part cell, and it is why a wider machine gets more
     cells rather than the same few stretched. Interior lines only — a line ON
     the edge is half under the bezel, which reads as a seam. */
  const boldGrid = useMemo(() => {
    const columns = Math.max(2, Math.round(l.screenW / BOLD_GRID_PITCH_X));
    const rows = Math.max(2, Math.round(l.screenH / BOLD_GRID_PITCH_Y));
    return {
      verticals: Array.from(
        { length: columns - 1 },
        (_, i) => -l.screenW / 2 + ((i + 1) * l.screenW) / columns,
      ),
      horizontals: Array.from(
        { length: rows - 1 },
        (_, i) => -l.screenH / 2 + ((i + 1) * l.screenH) / rows,
      ),
    };
  }, [l.screenW, l.screenH]);
  const env = useMonitorEnvMap(t.accent);

  /* Defaulted against ONE shared empty array rather than a fresh `?? []` each
     time. That looks like pedantry and is not: every panel texture below
     memoises on the list it is painted from, and a literal `[]` is a new
     identity on every render — which would repaint six canvases each time
     anything above this component so much as blinked. */
  const stats: MonitorStat[] = profile.stats ?? EMPTY;
  const tech: string[] = profile.tech ?? EMPTY;
  const skills: MonitorSkill[] = profile.skills ?? EMPTY;
  const achievements: MonitorAchievement[] = profile.achievements ?? EMPTY;
  const telemetry = profile.telemetry ?? DEFAULT_TELEMETRY;
  const projects: MonitorProject[] = profile.projects ?? EMPTY;

  /* Textures. Every one of these is built once and never touched again, so they
     are memoised on the things they are drawn FROM — not on `lit`, which changes
     twice a visit and would otherwise repaint the entire interface each time
     somebody drove through the door. */
  const screenMap = useMemo(
    () => makeScreenTexture(t.accent, t.accentAlt),
    [t.accent, t.accentAlt],
  );
  const dialMap = useMemo(
    () => makeDialTexture(t.accent, t.accentAlt),
    [t.accent, t.accentAlt],
  );
  const rimMap = useMemo(
    () => makeRimTexture(t.accent, t.accentAlt),
    [t.accent, t.accentAlt],
  );
  const glowMap = useMemo(() => makeGlowTexture(), []);
  const brushed = useMemo(() => makeBrushedTexture(), []);
  const glassMap = useMemo(() => makeGlassTexture(), []);
  const vignetteMap = useMemo(() => makeVignetteTexture(), []);

  // Meter rails, chip frames, stat cells and achievement tiles are all painted
  // INTO their module's own texture, which is why these depend on the content:
  // five skills means five rails, and a sixth would need a repaint rather than a
  // sixth mesh.
  const aboutMap = useMemo(
    () =>
      makePanelTexture(l.about.w, l.about.h, {
        tint: t.holo,
        glow: t.accent,
        header: l.about.h * 0.2,
      }),
    [l.about.w, l.about.h, t.holo, t.accent],
  );

  const statsMap = useMemo(() => {
    const cellW = (l.stats.w - 0.16) / Math.max(1, stats.length) - 0.06;
    return makePanelTexture(l.stats.w, l.stats.h, {
      tint: t.holo,
      glow: t.accent,
      cells: stats.map((_, i) => ({
        x: (i - (stats.length - 1) / 2) * (cellW + 0.06),
        y: 0,
        w: cellW,
        h: l.stats.h - 0.12,
      })),
    });
  }, [l.stats.w, l.stats.h, stats, t.holo, t.accent]);

  // Four across then three: seven markers in one row would be 4mm wide, and in
  // two even rows one of them would be alone.
  const techGrid = useMemo(() => {
    const perRow = 4;
    const cellW = (l.tech.w - 0.2) / perRow;
    const cellH = 0.34;
    return tech.map((name, i) => {
      const row = Math.floor(i / perRow);
      const rows = Math.ceil(tech.length / perRow);
      const inRow = Math.min(perRow, tech.length - row * perRow);
      const col = i % perRow;
      return {
        name,
        x: (col - (inRow - 1) / 2) * cellW,
        y: -l.tech.h * 0.1 - (row - (rows - 1) / 2) * (cellH + 0.09),
        w: cellW - 0.06,
        h: cellH,
      };
    });
  }, [tech, l.tech.w, l.tech.h]);

  const techMap = useMemo(
    () =>
      makePanelTexture(l.tech.w, l.tech.h, {
        tint: t.holo,
        glow: t.accent,
        header: l.tech.h * 0.16,
        cells: techGrid.map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
      }),
    [l.tech.w, l.tech.h, techGrid, t.holo, t.accent],
  );

  const activityMap = useMemo(
    () =>
      makePanelTexture(l.activity.w, l.activity.h, {
        tint: t.accentAlt,
        glow: t.accentAlt,
        header: l.activity.h * 0.19,
        grid: {
          cols: 8,
          rows: 4,
          x: 0,
          y: -l.activity.h * 0.13,
          w: l.activity.w - 0.24,
          h: l.activity.h * 0.54,
        },
      }),
    [l.activity.w, l.activity.h, t.accentAlt],
  );

  // Meter rows, shared by the painted rails and the meshes that fill them —
  // derived once so a rail can never end up somewhere its fill is not.
  const meters = useMemo(() => {
    /* Capped, not just inset. A meter is read by comparing the lit part
       against the rail, and past a couple of metres of rail there is nothing
       left to compare — 95% and 90% land a hand's width apart on a five-metre
       bar and the panel stops being an instrument. So the rails hold their
       length on a wall-sized machine and centre themselves in the column
       instead of growing with it. */
    const first = l.skills.h / 2 - l.skills.h * 0.28;
    const step = (l.skills.h * 0.72) / Math.max(1, skills.length);
    /* Both derived from the ROW rather than from the screen. A meter is a label
       over a rail, and the two only stay clear of each other if they are
       measured against the space between them — size the type off the display
       instead and a panel that gets shorter runs its labels through its own
       bars. The rail is capped at nine row-heights for the same reason it is
       capped at all: past that there is too much rail to compare a reading
       against. */
    const rowSize = Math.min(l.contentH * 0.026, step * 0.3);
    const railW = Math.min(l.skills.w - 0.28, step * 9);
    const railH = step * 0.16;
    return skills.map((skill, i) => ({
      ...skill,
      y: first - i * step - step * 0.64,
      labelY: first - i * step - step * 0.26,
      x: -railW / 2,
      w: railW,
      h: railH,
      size: rowSize,
    }));
  }, [skills, l.skills.w, l.skills.h, l.contentH]);

  const skillsMap = useMemo(
    () =>
      makePanelTexture(l.skills.w, l.skills.h, {
        tint: t.holo,
        glow: t.accent,
        header: l.skills.h * 0.1,
        tracks: meters.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h })),
      }),
    [l.skills.w, l.skills.h, meters, t.holo, t.accent],
  );

  const achievementGrid = useMemo(() => {
    const cellW = (l.achievements.w - 0.26) / 2;
    const cellH = (l.achievements.h - 0.46) / 2;
    return achievements.map((a, i) => ({
      ...a,
      x: (i % 2 === 0 ? -1 : 1) * (cellW / 2 + 0.04),
      y: -l.achievements.h * 0.12 - (Math.floor(i / 2) - 0.5) * (cellH + 0.07),
      w: cellW,
      h: cellH,
    }));
  }, [achievements, l.achievements.w, l.achievements.h]);

  const achievementsMap = useMemo(
    () =>
      makePanelTexture(l.achievements.w, l.achievements.h, {
        tint: t.holo,
        glow: t.accent,
        header: l.achievements.h * 0.14,
        cells: achievementGrid.map((c) => ({
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
          icon: c.icon,
        })),
      }),
    [l.achievements.w, l.achievements.h, achievementGrid, t.holo, t.accent],
  );

  /* PROJECTS. Its rows are painted into the panel like every other module's
     cells — but unlike the others each row is also its own hit target, so a
     click can open ONE project rather than the list of them. */
  const projectRows = useMemo(() => {
    const list = projects.slice(0, 4);
    const rowH = (l.projects.h - 0.42) / Math.max(1, list.length);
    return list.map((project, i) => ({
      ...project,
      y: l.projects.h / 2 - 0.34 - rowH * (i + 0.5),
      w: l.projects.w - 0.24,
      h: rowH * 0.86,
    }));
  }, [projects, l.projects.h, l.projects.w]);

  const projectsMap = useMemo(
    () =>
      makePanelTexture(l.projects.w, l.projects.h, {
        tint: t.holo,
        glow: t.accent,
        header: l.projects.h * 0.19,
        cells: projectRows.map((row) => ({ x: 0, y: row.y, w: row.w, h: row.h })),
      }),
    [l.projects.w, l.projects.h, projectRows, t.holo, t.accent],
  );

  const focusMap = useMemo(
    () =>
      makePanelTexture(l.focus.w, l.focus.h, {
        tint: t.accentAlt,
        glow: t.accentAlt,
        header: l.focus.h * 0.18,
      }),
    [l.focus.w, l.focus.h, t.accentAlt],
  );

  // Textures hold GPU memory until told otherwise, and this component unmounts
  // whenever a museum is reconfigured. One effect for all of them, keyed on the
  // set — nothing here is recreated on a re-render, so it runs about once.
  const maps = [
    screenMap,
    dialMap,
    rimMap,
    glowMap,
    brushed,
    glassMap,
    vignetteMap,
    aboutMap,
    statsMap,
    techMap,
    activityMap,
    skillsMap,
    achievementsMap,
    focusMap,
    projectsMap,
  ];
  useEffect(
    () => () => maps.forEach((m) => m?.dispose()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    maps,
  );

  /* ---------------------------------------------------------------- *
   * Motion. Every line below is a property write on something that already
   * exists: no geometry is built, no material is swapped, and nothing here
   * allocates. That budget is what makes it affordable for the busiest object in
   * the building to also be the one the room is rendered twice for.
   * ---------------------------------------------------------------- */
  const scan = useRef<Mesh>(null);
  const scanMat = useRef<MeshBasicMaterial>(null);
  const sweep = useRef<Mesh>(null);
  const sweepMat = useRef<MeshBasicMaterial>(null);
  const dialOuter = useRef<Mesh>(null);
  const dialInner = useRef<Mesh>(null);
  const ringSegments = useRef<Group>(null);
  const ringEnergy = useRef<Group>(null);
  const ringScan = useRef<Group>(null);
  const orbit = useRef<Group>(null);
  const reactor = useRef<Group>(null);
  const coreMat = useRef<MeshBasicMaterial>(null);
  const liveMat = useRef<MeshStandardMaterial>(null);
  const gasketMat = useRef<MeshStandardMaterial>(null);
  const bars = useRef<Mesh[]>([]);
  const fills = useRef<Mesh[]>([]);

  /** When the meters started charging. Set on the rising edge of `lit` rather
   *  than on mount, so the boot happens when somebody arrives — which is the
   *  only moment there is anyone there to see it. */
  const bootAt = useRef<number | null>(null);
  const wasLit = useRef(lit);

  const barLayout = useMemo(() => {
    const span = l.activity.w - 0.3;
    const step = span / ACTIVITY_BARS;
    return {
      w: step * 0.55,
      max: l.activity.h * 0.46,
      base: -l.activity.h * 0.4,
      x: Array.from(
        { length: ACTIVITY_BARS },
        (_, i) => -span / 2 + (i + 0.5) * step,
      ),
      // Irrational-ish rates so the row never cycles as a unit — a strip of bars
      // that visibly repeats is a progress meter, and a progress meter that
      // never finishes is worse scenery than no bars at all.
      rate: Array.from({ length: ACTIVITY_BARS }, (_, i) => 0.7 + (i % 7) * 0.19),
      phase: Array.from({ length: ACTIVITY_BARS }, (_, i) => i * 0.81),
    };
  }, [l.activity.w, l.activity.h]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    if (lit !== wasLit.current) {
      wasLit.current = lit;
      bootAt.current = lit ? time : null;
    }
    const boot =
      bootAt.current === null
        ? lit
          ? 1
          : 0
        : Math.min(1, (time - bootAt.current) / BOOT_SECONDS);
    // Ease-out cubic: instruments settle, they do not arrive.
    const charge = 1 - (1 - boot) ** 3;

    const s = (time % SCAN_PERIOD) / SCAN_PERIOD;
    if (scan.current) scan.current.position.y = l.screenH / 2 - s * l.screenH;
    if (scanMat.current) {
      scanMat.current.opacity = (lit ? SCAN_PEAK : SCAN_PEAK * 0.35) * Math.sin(Math.PI * s);
    }

    const w = (time % SWEEP_PERIOD) / SWEEP_PERIOD;
    if (sweep.current) sweep.current.position.x = -l.screenW / 2 + w * l.screenW;
    if (sweepMat.current) {
      sweepMat.current.opacity = (lit ? 0.1 : 0.04) * Math.sin(Math.PI * w);
    }

    // Counter-rotation at unequal rates. Same-direction rings read as one
    // slipping instrument; opposed, they read as several.
    if (dialOuter.current) dialOuter.current.rotation.z = time * 0.055;
    if (dialInner.current) dialInner.current.rotation.z = -time * 0.09;
    if (ringSegments.current) ringSegments.current.rotation.z = time * 0.22;
    if (ringEnergy.current) ringEnergy.current.rotation.z = -time * 0.31;
    if (ringScan.current) ringScan.current.rotation.z = time * 0.85;
    if (orbit.current) orbit.current.rotation.z = -time * 0.14;
    if (reactor.current) reactor.current.rotation.z = -time * 0.5;

    if (coreMat.current) {
      coreMat.current.opacity = (lit ? 0.5 : 0.16) * (0.7 + 0.3 * Math.sin(time * 2.1));
    }
    if (liveMat.current) {
      // A heartbeat, not a blink: sin² spends most of its time near zero, which
      // is what a status LED actually looks like.
      liveMat.current.emissiveIntensity =
        (lit ? 1.9 : 0.45) * (0.35 + 0.65 * Math.sin(time * 1.9) ** 2);
    }
    if (gasketMat.current) {
      gasketMat.current.emissiveIntensity = (lit ? 1.5 : 0.35) * (0.92 + 0.08 * Math.sin(time * 0.7));
    }

    // Bars grow from their baseline, not about their middle: a plane scales
    // about its own centre, so the position has to travel half as far as the
    // scale to keep every foot planted on the grid.
    for (let i = 0; i < bars.current.length; i++) {
      const bar = bars.current[i];
      if (!bar) continue;
      const level =
        charge *
        (0.16 +
          0.84 * (0.5 + 0.5 * Math.sin(time * barLayout.rate[i] + barLayout.phase[i])));
      bar.scale.y = Math.max(0.001, level);
      bar.position.y = barLayout.base + (barLayout.max * level) / 2;
    }

    // Meters charge on the same clock, then breathe by a percent or two so they
    // read as live readings rather than as a printed chart.
    for (let i = 0; i < fills.current.length; i++) {
      const fill = fills.current[i];
      const meter = meters[i];
      if (!fill || !meter) continue;
      const level =
        charge *
        (meter.level / 100) *
        (0.985 + 0.015 * Math.sin(time * 1.3 + i * 1.7));
      fill.scale.x = Math.max(0.001, level);
      fill.position.x = meter.x + (meter.w * level) / 2;
    }
  });

  /* ---------------------------------------------------------------- *
   * The operating system
   * ---------------------------------------------------------------- *
   * Five states, and the two that look redundant are the ones earning their
   * keep. `arming` mounts the incoming view a frame BEFORE the animation
   * starts: a detail view paints its own canvas textures on mount, and doing
   * that on the first frame of a transition drops the frame the movement begins
   * on — which is the one frame nobody forgives. `closing` exists because a
   * reversal has to be a real animation and not a jump back.
   *
   * React state, not refs, because these change about twice per interaction —
   * and they change WHAT IS MOUNTED, which is the whole reason a closed monitor
   * costs nothing for the six environments behind it.
   */
  const [phase, setPhase] = useState<
    "overview" | "arming" | "opening" | "detail" | "closing"
  >("overview");
  const [view, setView] = useState<{ section: SectionId; project: number }>({
    section: "overview",
    project: 0,
  });
  const [hovered, setHovered] = useState<SectionId | null>(null);

  /** How far through the open cinematic we are: 0 is the overview, 1 is the
   *  opened view. A ref, not state — it changes sixty times a second. */
  const travel = useRef(0);
  /** The same number eased, which is what the console's body fades on and what
   *  the room is defocused by. Shared with <FocusField> and <ConsoleShell>
   *  rather than each recomputing it, so the blur, the flight and the frame can
   *  never disagree about where in the movement they are. */
  const flight = useRef(0);
  /** What the opened view's instruments are charging on, so its meters and bars
   *  come up AS the environment materialises rather than arriving already full. */
  const viewCharge = useRef(0);

  const open = (section: SectionId) => {
    setView({ section, project: 0 });
    setPhase("arming");
  };
  const back = () => setPhase((p) => (p === "detail" || p === "opening" ? "closing" : p));

  // One frame of warm-up, then go. See the note on `arming` above.
  useEffect(() => {
    if (phase !== "arming") return;
    const id = requestAnimationFrame(() => setPhase("opening"));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  /* Escape closes it. The console is modal in every way that matters — it is
     in front of your face and the room behind it is out of focus — and a modal
     with exactly one way out, in one corner, is a modal you can get stuck in. */
  useEffect(() => {
    if (phase === "overview") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPhase((p) => (p === "detail" || p === "opening" ? "closing" : p));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);


  const interactive = phase === "overview";
  const wiring = {
    theme: t,
    lit,
    hovered,
    interactive,
    onHover: setHovered,
    onOpen: open,
  };

  /** Every module's rectangle, by id — what the flying panel and the reticle
   *  need and the only thing they need. Kept as one object so a module can
   *  never be openable without something to fly. */
  const rects: Partial<Record<SectionId, { rect: SectionRect; map: CanvasTexture | null }>> = {
    about: { rect: l.about, map: aboutMap },
    stats: { rect: l.stats, map: statsMap },
    tech: { rect: l.tech, map: techMap },
    activity: { rect: l.activity, map: activityMap },
    skills: { rect: l.skills, map: skillsMap },
    achievements: { rect: l.achievements, map: achievementsMap },
    focus: { rect: l.focus, map: focusMap },
    ...(projects.length > 0
      ? { projects: { rect: l.projects, map: projectsMap } }
      : {}),
  };
  const opened = rects[view.section];

  const overviewScrim = useRef<MeshBasicMaterial>(null);
  const detailScrim = useRef<MeshBasicMaterial>(null);
  const expander = useRef<Mesh>(null);
  const expanderMat = useRef<MeshBasicMaterial>(null);
  const detailGroup = useRef<Group>(null);
  const screenTilt = useRef<Group>(null);
  const motes = useRef<Group>(null);
  const dockGroup = useRef<Group>(null);

  /* The console's flight, as working memory. Every one of these is written and
     read again inside a single frame; they live out here because a Vector3 built
     per frame in the busiest object in the building is a Vector3 the collector
     has to come back for. `head` is the lagging copy of the camera the console
     actually chases — see DOCK_FOLLOW.

     A ref rather than a memo because all of it is written during the frame, and
     a memo is a promise that nothing is. */
  const flightMemo = useRef({
    headPos: new Vector3(),
    headQuat: new Quaternion(),
    camPos: new Vector3(),
    camQuat: new Quaternion(),
    forward: new Vector3(),
    wall: new Vector3(),
    dock: new Vector3(),
    target: new Vector3(),
    aim: new Quaternion(),
    wallQuat: new Quaternion(),
    inverse: new Matrix4(),
    seated: false,
  });

  useFrame((state, delta) => {
    /* Driving out of the building closes whatever is open. Here rather than in
       an effect on `lit`: this is a state change caused by the world moving,
       which is what the frame loop is, and an effect that calls setState the
       moment it runs is a cascading render by another name. Without it you
       would leave the hall with a console still bolted to your face and the
       road behind it out of focus — the panel follows the camera, so it has no
       reason of its own to notice the room it belongs to is a hundred metres
       back. */
    if (!lit && (phase === "detail" || phase === "opening")) setPhase("closing");

    const running = phase === "opening" || phase === "closing";
    if (running) {
      const step = delta / TRANSITION_SECONDS;
      travel.current = clamp01(travel.current + (phase === "opening" ? step : -step));
      if (phase === "opening" && travel.current >= 1) setPhase("detail");
      if (phase === "closing" && travel.current <= 0) {
        setPhase("overview");
        setView({ section: "overview", project: 0 });
      }
    } else if (phase === "detail") {
      travel.current = 1;
    } else if (phase === "overview") {
      travel.current = 0;
    }

    const p = travel.current;
    const e = ease(p);
    flight.current = e;

    // The overview goes dark first, the opened view arrives second, and the two
    // overlap — which is what makes it one movement instead of a fade to black
    // followed by a fade up.
    if (overviewScrim.current) {
      overviewScrim.current.opacity = ease(clamp01(p / ARRIVE_AT)) * 0.96;
    }
    const arrive = clamp01((p - ARRIVE_AT) / (1 - ARRIVE_AT));
    /* The veil over the incoming view: shut in the first tenth of a second,
       open again as the console lands.
       Shut FAST but not instantly, and that tenth of a second is the whole
       reason it is written this way. The view behind it is mounted before the
       movement starts (see `arming`), so something has to hide it from frame
       one — but a black card that simply EXISTS across the middle of a lit
       display on the frame you click reads as a glitch, where the same card
       arriving over five frames reads as the slab peeling off the wall. */
    const veil = Math.min(1, p * 8);
    if (detailScrim.current) {
      detailScrim.current.opacity = Math.min(veil, 1 - ease(arrive));
    }
    viewCharge.current = ease(arrive);

    // The panel itself, flying from where it sat to the front of the console.
    // Position and scale are lerped on the SAME curve, so the glass stretches
    // into place instead of sliding and then growing. Both are in the console's
    // frame, which is itself moving — so this is the panel's travel ACROSS the
    // console while the console travels across the room.
    if (expander.current && opened) {
      const { rect } = opened;
      expander.current.position.x = rect.x * (1 - e);
      expander.current.position.y = rect.y * (1 - e);
      expander.current.position.z = (Z_PANE - Z_DOCK) * (1 - e) + dock.h * C_EXPANDER * e;
      expander.current.scale.set(
        1 + (dock.w / rect.w - 1) * e,
        1 + (dock.h / rect.h - 1) * e,
        1,
      );
    }
    if (expanderMat.current) {
      // Brightest at the moment it leaves, gone by the time the view it turned
      // into has finished arriving.
      expanderMat.current.opacity = Math.sin(Math.PI * clamp01(p * 1.15)) * 0.9;
    }

    if (detailGroup.current) {
      // Not drawn at all until the veil is shut over it — the alternative is a
      // single frame of a finished interface flashing across the wall before
      // the transition it belongs to has begun.
      detailGroup.current.visible = veil >= 1;
      detailGroup.current.scale.setScalar(0.9 + 0.1 * ease(arrive));
    }

    // The whole display leans a few degrees through the middle of the movement
    // and comes back level. Tiny — it is the difference between the interface
    // changing and the viewer being moved through it.
    if (screenTilt.current) {
      const swing = Math.sin(Math.PI * p);
      screenTilt.current.rotation.y = swing * 0.024;
      screenTilt.current.rotation.x = -swing * 0.012;
    }
    // Motes blow outward as the panel opens, and settle again on the way back.
    if (motes.current) motes.current.scale.setScalar(1 + e * 0.5);

    /* ---- THE FLIGHT ---------------------------------------------------- *
     * Two transforms and one number between them: where the console lies on the
     * wall, where it belongs in front of the viewer, and how far along it is.
     *
     * All of it is computed in WORLD space and only converted back at the last
     * line, which is what lets the console be a child of a machine bolted to a
     * wall in a rotated building and still park itself square to a camera that
     * knows nothing about any of them. The conversion assumes the chain above it
     * has no scale in it — nothing in this building does, and a scaled museum
     * would need the parent's world scale divided out here. */
    const group = dockGroup.current;
    const parent = group?.parent;
    if (!group || !parent) return;

    const f = flightMemo.current;
    const camera = state.camera as PerspectiveCamera;
    camera.getWorldPosition(f.camPos);
    camera.getWorldQuaternion(f.camQuat);

    if (!f.seated) {
      // Snapped rather than eased on the first frame of an opening: the head
      // starts wherever the camera is, or the console spends its entire flight
      // catching up with a lag that was never real.
      f.headPos.copy(f.camPos);
      f.headQuat.copy(f.camQuat);
      f.seated = true;
    } else {
      const k = 1 - Math.exp(-DOCK_FOLLOW * delta);
      f.headPos.lerp(f.camPos, k);
      f.headQuat.slerp(f.camQuat, k);
    }
    if (p <= 0) f.seated = false;

    // Where it is going: straight out along the lagging head's own axis, far
    // enough forward to fill the frame and no further.
    f.forward.set(0, 0, -1).applyQuaternion(f.headQuat);
    f.dock.copy(f.headPos).addScaledVector(f.forward, DOCK_DISTANCE);

    // Where it started: flat on the display, in the plane the panel was in.
    f.wall.set(0, 0, Z_DOCK).applyMatrix4(parent.matrixWorld);
    parent.getWorldQuaternion(f.wallQuat);

    // And how big it has to be to land where it is aimed. Off the camera's own
    // frustum rather than a typed size, so the console fills the same share of
    // a phone and an ultrawide instead of overflowing one and swimming in the
    // other.
    const visibleH = 2 * DOCK_DISTANCE * Math.tan((camera.fov * Math.PI) / 360);
    const visibleW = visibleH * camera.aspect;
    const outerW = dock.w + dock.h * DOCK_BAND * 2;
    const outerH = dock.h * (1 + DOCK_BAND * 2);
    const fit = Math.min(
      (visibleW * DOCK_FILL_W) / outerW,
      (visibleH * DOCK_FILL_H) / outerH,
    );

    f.target.lerpVectors(f.wall, f.dock, e);
    f.aim.copy(f.wallQuat).slerp(f.headQuat, e);

    f.inverse.copy(parent.matrixWorld).invert();
    group.position.copy(f.target).applyMatrix4(f.inverse);
    group.quaternion.copy(f.wallQuat).invert().multiply(f.aim);
    group.scale.setScalar(1 + (fit - 1) * e);

    // Everything docked belongs to the focus pass, not to the room — see
    // museumFocus.tsx. Done here, every frame, because the subtree grows text
    // meshes on its own schedule.
    focusLayer(group);
  });

  /* ---------------------------------------------------------------- *
   * Shared material recipes. Spelled out once because the machine has to look
   * like ONE object — three slightly different blacks is what makes a render
   * look assembled from parts.
   * ---------------------------------------------------------------- */
  const metal = {
    color: t.deck,
    metalness: 0.94,
    roughness: 0.34,
    roughnessMap: brushed,
    envMap: env,
    envMapIntensity: 1.1,
  } as const;

  const shapes = useMemo(
    () => ({
      mount: chamferShape(width - MOUNT_INSET * 2, height - MOUNT_INSET * 2, OUTER_CHAMFER * 0.6),
      rear: chamferShape(width - REAR_INSET * 2, height - REAR_INSET * 2, OUTER_CHAMFER * 0.85),
      gasket: chamferShape(width, height, OUTER_CHAMFER),
      front: chamferShape(width, height, OUTER_CHAMFER),
      bezel: apertureShape(width, height, OUTER_CHAMFER, BEZEL_BAND, APERTURE_CHAMFER),
      screen: chamferShape(l.screenW, l.screenH, APERTURE_CHAMFER * 0.9),
    }),
    [width, height, l.screenW, l.screenH],
  );

  const halfScreenW = l.screenW / 2;
  const halfScreenH = l.screenH / 2;

  const muted = lit ? 0.72 : 0.3;

  /** The CURRENT FOCUS dial's outer radius, off the module rather than typed —
   *  capped so it stays a readout and never becomes the module. */
  const reactorR = Math.min(l.focus.h * 0.26, l.focus.w * 0.1);

  return (
    <group>
      {/* ---------------------------------------------------------------- *
          THE MACHINE
          Four slabs and a bezel, each cut from the same chamfered outline and
          each stood off the one behind it. Nothing here is emissive except the
          gasket — a housing that glows is a prop, and this one is meant to be
          the dark, heavy, unlit object that the display is set into.
          ---------------------------------------------------------------- */}

      {/* Mount plate. Inset well inside the housing so it is never actually
          seen — what IS seen is the shadow it leaves the housing floating on. */}
      <mesh position={[0, 0, MOUNT_Z + BEVEL]}>
        <extrudeGeometry args={[shapes.mount, EXTRUDE(MOUNT_DEPTH - BEVEL * 2)]} />
        <meshStandardMaterial color={t.base} metalness={0.6} roughness={0.8} />
      </mesh>

      {/* Rear housing, stepped in from the outline.

          No castShadow on any slab of this machine, and that is a measurement
          rather than an oversight: the scene's one shadow-casting light is a
          directionalLight whose shadow camera is twelve units either side of the
          WORLD origin, and this museum is nearly sixty units down the road. It
          is not in the map. Flagging these would render four extra depth passes
          a frame to produce nothing at all. */}
      <mesh position={[0, 0, REAR_Z + BEVEL]}>
        <extrudeGeometry args={[shapes.rear, EXTRUDE(REAR_DEPTH - BEVEL * 2)]} />
        <meshStandardMaterial {...metal} color={t.panelShell} roughness={0.5} />
      </mesh>

      {/* The lit gasket: light escaping from between two plates, running the
          whole way round the machine including the corner cuts. Seen edge-on
          from every angle in the hall, and the one part of the housing that
          announces the thing is powered. */}
      <mesh position={[0, 0, GASKET_Z]}>
        <extrudeGeometry args={[shapes.gasket, { depth: GASKET_DEPTH, bevelEnabled: false }]} />
        <meshStandardMaterial
          ref={gasketMat}
          color={t.strip}
          emissive={t.accent}
          emissiveIntensity={lit ? 1.5 : 0.35}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>

      {/* Front housing — the body. */}
      <mesh position={[0, 0, FRONT_Z + BEVEL]}>
        <extrudeGeometry args={[shapes.front, EXTRUDE(FRONT_DEPTH - BEVEL * 2)]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* The bezel, with the aperture cut through it. This is the piece that
          makes the display RECESSED: its inner wall is 28cm of real geometry
          between the glass and the room, and you can see down into it. */}
      <mesh position={[0, 0, SCREEN_Z + BEVEL]}>
        <extrudeGeometry args={[shapes.bezel, EXTRUDE(BEZEL_DEPTH - BEVEL * 2)]} />
        <meshStandardMaterial {...metal} color={t.deckCap} roughness={0.28} />
      </mesh>

      {/* The bezel's illuminated strips: two thin cyan lines let into the face
          above and below the aperture, and two shorter ones down the sides.
          Unequal on purpose — a frame lit evenly all round is a lightbox. */}
      {(
        [
          [0, halfScreenH + 0.11, l.screenW * 0.86, 0.022, t.accent, 1],
          [0, -halfScreenH - 0.11, l.screenW * 0.62, 0.016, t.accent, 0.75],
          [-halfScreenW - 0.12, 0, 0.014, l.screenH * 0.5, t.holo, 0.6],
          [halfScreenW + 0.12, 0, 0.014, l.screenH * 0.5, t.holo, 0.6],
        ] as const
      ).map(([x, y, w, h, color, strength]) => (
        <mesh key={`${x},${y}`} position={[x, y, BEZEL_FACE_Z + 0.004]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={color}
            emissiveIntensity={(lit ? 1.9 : 0.4) * strength}
            roughness={0.35}
          />
        </mesh>
      ))}

      {/* The purple accent segments, sitting on the four corner chamfers. This
          is the palette's whole allowance of magenta on the hardware, and it is
          spent on the four cuts because that is the detail the corners exist to
          show off. */}
      {(
        [
          [1, 1, -Math.PI / 4],
          [-1, 1, Math.PI / 4],
          [-1, -1, -Math.PI / 4],
          [1, -1, Math.PI / 4],
        ] as const
      ).map(([sx, sy, rot]) => (
        <mesh
          key={`${sx},${sy}`}
          position={[
            sx * (width / 2 - OUTER_CHAMFER / 2 - 0.02),
            sy * (height / 2 - OUTER_CHAMFER / 2 - 0.02),
            BEZEL_FACE_Z + 0.004,
          ]}
          rotation={[0, 0, rot]}
        >
          <planeGeometry args={[OUTER_CHAMFER * 1.1, 0.026]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.accentAlt}
            emissiveIntensity={lit ? 1.7 : 0.4}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Fasteners. Eight of them, on the bezel face where a real plate would be
          bolted to the housing behind it — the cheapest possible proof that this
          object was manufactured rather than modelled. */}
      {(
        [
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
          [-0.42, 1],
          [0.42, 1],
          [-0.42, -1],
          [0.42, -1],
        ] as const
      ).map(([fx, fy], i) => (
        <mesh
          key={i}
          position={[
            fx * (width / 2 - BEZEL_BAND / 2),
            fy * (height / 2 - BEZEL_BAND / 2),
            BEZEL_FACE_Z + 0.012,
          ]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.022, 0.026, 0.024, 8]} />
          <meshStandardMaterial color={t.metal} metalness={0.95} roughness={0.42} envMap={env} />
        </mesh>
      ))}

      {/* Ventilation, along the underside of the front housing. Painted rather
          than cut: a grille is a hundred slots, and from every angle you can
          actually stand at, a slotted texture on a downward face is
          indistinguishable from a hundred slots that cost a hundred draws. */}
      <mesh
        position={[0, -height / 2 + 0.001, FRONT_Z + FRONT_DEPTH / 2]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[width * 0.55, FRONT_DEPTH * 0.7]} />
        <meshStandardMaterial color="#05070a" roughness={0.9} metalness={0.3} side={DoubleSide} />
      </mesh>

      {/* ---------------------------------------------------------------- *
          THE DISPLAY
          Wrapped in one group because the whole screen leans a couple of
          degrees through the middle of a transition and comes back level — the
          part of the cinematic that moves the VIEWER rather than the interface.
          The housing above stays put, which is what makes the lean read as a
          perspective shift inside a fixed machine.
          ---------------------------------------------------------------- */}
      <group ref={screenTilt}>

      {/* ---------------------------------------------------------------- *
          THE DISPLAY GROUND — present in every mode, because it is the screen
          rather than anything shown on it.
          Everything from here is inside the aperture, stacked through the well
          from the substrate at the back to the cover glass at the front.
          ---------------------------------------------------------------- */}

      {/* Substrate. Deep navy-black, barely emissive: this is the DARK that the
          whole interface is bright against, and at any real glow the floor's
          mirror floods the hall teal. Cut to the same chamfer as the aperture so
          its glow stops where the bezel does. */}
      <mesh position={[0, 0, Z_SUBSTRATE]}>
        <shapeGeometry args={[shapes.screen]} />
        <meshStandardMaterial
          color={t.holoScreen}
          emissive={t.holo}
          /* Barely on. This is the DARK the interface is bright against, and
             every one of the dozen additive layers in front of it is measured
             against this number — lift it and they all have to be lifted with
             it, at which point the display is a lightbox rather than a screen
             with a deep navy-black ground. */
          emissiveIntensity={lit ? 0.055 : 0.02}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>

      {/* Grid, circuitry, nodes, micro data, coordinates, scan lines — one draw
          call. Additive, so the black it was drawn on contributes nothing and
          the panes stacked in front are never occluded by it. */}
      {screenMap && (
        <mesh position={[0, 0, Z_GRID]}>
          <planeGeometry args={[l.screenW, l.screenH]} />
          <meshBasicMaterial
            map={screenMap}
            transparent
            opacity={lit ? 0.8 : 0.3}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* The BOLD grid — the wall's own, brought inside the machine.

          The fine grid above is painted at 23 x 14 cells over whatever size the
          screen happens to be, which means its cells shrink as the display grows
          and on a full-wall machine they land under half a metre. That reads as
          texture, and texture is all it was ever meant to be. What it does not
          do is give the screen SCALE, and scale is the entire reason the room
          around it looks like a room: the hall's back wall is ruled at a fixed
          world pitch, so its cells stay the same size however big the wall is,
          and the eye reads that as architecture.

          So this one is ruled in METRES, not in fractions. It is the same pitch
          as the wall behind, drawn in geometry rather than paint because a fixed
          world pitch cannot be baked into a texture that stretches. Line them up
          and the display stops looking like a picture hung on a ruled wall and
          starts looking like a lit section OF one. */}
      {boldGrid.verticals.map((x) => (
        <mesh key={`bv${x}`} position={[x, 0, Z_GRID + 0.004]}>
          <planeGeometry args={[BOLD_GRID_WEIGHT, l.screenH]} />
          <meshStandardMaterial
            color={t.holo}
            emissive={t.holo}
            emissiveIntensity={lit ? 0.55 : 0.16}
            roughness={0.6}
          />
        </mesh>
      ))}
      {boldGrid.horizontals.map((y) => (
        <mesh key={`bh${y}`} position={[0, y, Z_GRID + 0.004]}>
          <planeGeometry args={[l.screenW, BOLD_GRID_WEIGHT]} />
          <meshStandardMaterial
            color={t.holo}
            emissive={t.holo}
            emissiveIntensity={lit ? 0.55 : 0.16}
            roughness={0.6}
          />
        </mesh>
      ))}

      {/* ---------------------------------------------------------------- *
          THE OVERVIEW
          Unmounted outright once a detail view has finished arriving, not just
          hidden: this is around a hundred and forty objects, and the hall
          renders twice a frame. It costs one reconciliation on each of the two
          frames an interaction actually turns on.
          ---------------------------------------------------------------- */}
      {phase !== "detail" && (
      <group>

      {/* The name, oversized and nearly invisible, printed into the surface
          behind everything. This is the "behind and around the portrait" half of
          the brief: the crisp name below the chamber is the label, and this is
          the thing the label is a label OF. */}
      <Text
        position={[0, l.chamberY, Z_WATERMARK]}
        fontSize={height * 0.135}
        letterSpacing={0.3}
        maxWidth={width * 0.75}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={t.holo}
        fillOpacity={lit ? 0.055 : 0.025}
      >
        {profile.name}
      </Text>

      {/* Bloom, faked. There is no post-processing pass in this app, so every
          halo in the room is a quad of soft falloff held behind something
          bright. Three of them: the chamber, and a wash under each column. */}
      {glowMap &&
        (
          [
            [0, l.chamberY, l.chamberR * 3.2, t.accent, 0.1],
            [l.about.x, 0, l.colW * 2.6, t.holo, 0.05],
            [l.focus.x, 0, l.colW * 2.6, t.accentAlt, 0.05],
          ] as const
        ).map(([x, y, size, color, strength]) => (
          <mesh key={`${x},${y}`} position={[x, y, Z_BLOOM]}>
            <planeGeometry args={[size, size]} />
            <meshBasicMaterial
              map={glowMap}
              color={color}
              transparent
              opacity={lit ? strength : strength * 0.3}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        ))}

      {/* ---------------------------------------------------------------- *
          THE SCANNING CHAMBER
          A well, not a circle. The dark disc sinks it, the open cylinder gives
          it a wall you can see the inside of, and the rings climb forward out of
          it — so the face is genuinely BEHIND the instruments reading it.
          ---------------------------------------------------------------- */}
      <group position={[0, l.chamberY, 0]}>
        {/* The floor of the well. */}
        <mesh position={[0, 0, Z_CHAMBER_BACK]}>
          <circleGeometry args={[l.chamberR * 1.02, 64]} />
          <meshBasicMaterial color={t.holoScreen} transparent opacity={0.88} depthWrite={false} />
        </mesh>

        {/* Its wall: an open cylinder turned to lie along z, so it is a tube
            sunk into the screen rather than a ring drawn on it. DoubleSide
            because the only face you ever see is the inside. */}
        <mesh
          position={[0, 0, Z_CHAMBER_BACK + (Z_RING_MID - Z_CHAMBER_BACK) / 2]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry
            args={[l.chamberR, l.chamberR * 0.94, Z_RING_MID - Z_CHAMBER_BACK, 48, 1, true]}
          />
          <meshBasicMaterial
            color={t.accent}
            transparent
            opacity={lit ? 0.12 : 0.05}
            side={DoubleSide}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* The instrument face, twice, counter-rotating at different scales. */}
        {dialMap && (
          <>
            <mesh ref={dialOuter} position={[0, 0, Z_RING_OUTER]}>
              <planeGeometry args={[l.chamberR * 2.1, l.chamberR * 2.1]} />
              <meshBasicMaterial
                map={dialMap}
                color={t.accent}
                transparent
                opacity={lit ? 0.8 : 0.28}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <mesh ref={dialInner} position={[0, 0, Z_RING_INNER]}>
              <planeGeometry args={[l.chamberR * 1.5, l.chamberR * 1.5]} />
              <meshBasicMaterial
                map={dialMap}
                color={t.accentAlt}
                transparent
                opacity={lit ? 0.45 : 0.15}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </>
        )}

        {/* The portrait, deep in the well. */}
        {profile.portrait && (
          <Suspense fallback={null}>
            <ChamberPortrait
              src={profile.portrait}
              aspect={profile.portraitAspect}
              radius={l.portraitR}
              lit={lit}
              rim={rimMap}
            />
          </Suspense>
        )}

        {/* The collar around the picture — a hard thin edge, so the face is
            SEATED in the chamber rather than floating in it. */}
        <mesh position={[0, 0, Z_PORTRAIT + 0.008]}>
          <ringGeometry args={[l.portraitR, l.portraitR * 1.035, 64]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.accent}
            emissiveIntensity={lit ? 2 : 0.5}
            roughness={0.35}
          />
        </mesh>

        {/* Segmented blue ring. Six sectors with gaps rather than a solid ring,
            because the gaps are the only thing on a circle that can be SEEN to
            turn — a complete ring spun about its own axis is indistinguishable
            from a still one and costs exactly as much. */}
        <group ref={ringSegments} position={[0, 0, Z_RING_INNER]}>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i}>
              <ringGeometry
                args={[
                  l.portraitR * 1.14,
                  l.portraitR * 1.19,
                  32,
                  1,
                  (i / 6) * Math.PI * 2,
                  Math.PI * 0.24,
                ]}
              />
              <meshStandardMaterial
                color={t.holo}
                emissive={t.holo}
                emissiveIntensity={lit ? 1.6 : 0.4}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>

        {/* A continuous cyan hairline between the moving rings, so the group
            reads as one assembly rather than as three unrelated spinners. */}
        <mesh position={[0, 0, Z_RING_INNER + 0.004]}>
          <ringGeometry args={[l.portraitR * 1.3, l.portraitR * 1.315, 64]} />
          <meshStandardMaterial
            color={t.accent}
            emissive={t.accent}
            emissiveIntensity={lit ? 1.1 : 0.28}
            roughness={0.45}
          />
        </mesh>

        {/* The purple energy ring, the other way. */}
        <group ref={ringEnergy} position={[0, 0, Z_RING_MID]}>
          {[0, Math.PI * 0.72, Math.PI * 1.32].map((start) => (
            <mesh key={start}>
              <ringGeometry
                args={[
                  l.portraitR * 1.44,
                  l.portraitR * 1.5,
                  40,
                  1,
                  start,
                  Math.PI * 0.42,
                ]}
              />
              <meshStandardMaterial
                color={t.accentAlt}
                emissive={t.accentAlt}
                emissiveIntensity={lit ? 1.5 : 0.38}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>

        {/* Orbital markers: three small blocks riding a circle at their own
            rate. The only element in the chamber with a silhouette rather than a
            radius, which is what makes the rotation legible at a glance. */}
        <group ref={orbit} position={[0, 0, Z_RING_MID + 0.006]}>
          {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => (
            <mesh
              key={a}
              position={[Math.cos(a) * l.portraitR * 1.62, Math.sin(a) * l.portraitR * 1.62, 0]}
              rotation={[0, 0, a]}
            >
              <planeGeometry args={[0.07, 0.03]} />
              <meshStandardMaterial
                color={t.strip}
                emissive={t.accent}
                emissiveIntensity={lit ? 1.8 : 0.45}
                roughness={0.35}
              />
            </mesh>
          ))}
        </group>

        {/* The scanning indicator — one short, hot arc going round much faster
            than anything else. This is the element that says the chamber is
            READING something rather than merely idling. */}
        <group ref={ringScan} position={[0, 0, Z_RING_OUTER + 0.004]}>
          <mesh>
            <ringGeometry
              args={[l.portraitR * 1.7, l.portraitR * 1.76, 32, 1, 0, Math.PI * 0.16]}
            />
            <meshStandardMaterial
              color={t.strip}
              emissive={t.accent}
              emissiveIntensity={lit ? 2.1 : 0.5}
              roughness={0.3}
            />
          </mesh>
        </group>
      </group>

      {/* ---------------------------------------------------------------- *
          IDENTITY
          ---------------------------------------------------------------- */}
      <Text
        position={[0, l.nameY, Z_TYPE]}
        fontSize={l.nameSize}
        letterSpacing={0.26}
        anchorX="center"
        anchorY="middle"
        color={t.panelText}
        /* troika renders a blurred outline behind the fill, which is the one
           place in this file where a genuine bloom is available without a post
           pass — so the biggest piece of type in the room is the one that gets
           it. */
        outlineWidth={l.nameSize * 0.02}
        outlineBlur={l.nameSize * 0.35}
        outlineColor={t.accent}
        outlineOpacity={lit ? 0.5 : 0.18}
      >
        {profile.name}
      </Text>

      {/* Its reflection in the glass. A real mirrored copy rather than a painted
          smudge — it has to be a reflection of THIS name, whatever the name is. */}
      <Text
        position={[0, l.reflectionY, Z_TYPE - 0.004]}
        rotation={[Math.PI, 0, 0]}
        fontSize={l.nameSize}
        letterSpacing={0.26}
        anchorX="center"
        anchorY="middle"
        color={t.accent}
        fillOpacity={lit ? 0.11 : 0.04}
      >
        {profile.name}
      </Text>

      {profile.role && (
        <Text
          position={[0, l.roleY, Z_TYPE]}
          fontSize={l.nameSize * 0.33}
          letterSpacing={0.62}
          anchorX="center"
          anchorY="middle"
          color={t.accent}
          fillOpacity={lit ? 0.95 : 0.4}
        >
          {profile.role}
        </Text>
      )}

      {/* A rule under the identity block, fading out at both ends so it reads as
          a horizon rather than as a box side. */}
      <mesh position={[0, l.dividerY, Z_TYPE]}>
        <planeGeometry args={[l.centerW * 0.9, 0.008]} />
        <meshStandardMaterial
          color={t.accent}
          emissive={t.accent}
          emissiveIntensity={lit ? 0.9 : 0.22}
          roughness={0.5}
        />
      </mesh>

      {/* System metadata. One line, faint, centred — atmosphere rather than
          information, which is exactly what the brief asks these for. */}
      <Text
        position={[0, l.telemetryY, Z_TYPE]}
        fontSize={l.contentH * 0.026}
        letterSpacing={0.28}
        maxWidth={l.centerW}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={t.panelMuted}
        fillOpacity={muted * 0.8}
      >
        {telemetry.join("   ·   ")}
      </Text>

      {/* ---------------------------------------------------------------- *
          LEFT COLUMN
          ---------------------------------------------------------------- */}

      {/* ABOUT ME */}
      <Section
        id="about"
        rect={l.about}
        map={aboutMap}
        depth={Z_PANE}
        {...wiring}
      >
        <Text
          position={[-l.about.w / 2 + 0.14, l.about.h / 2 - l.about.h * 0.115, 0]}
          fontSize={l.contentH * 0.032}
          letterSpacing={0.34}
          anchorX="left"
          anchorY="middle"
          color={t.accent}
        >
          ABOUT ME
        </Text>
        {profile.about && (
          <Text
            position={[-l.about.w / 2 + 0.14, l.about.h * 0.09, 0]}
            fontSize={l.contentH * 0.031}
            lineHeight={1.55}
            maxWidth={l.about.w - 0.28}
            anchorX="left"
            anchorY="middle"
            color={t.panelText}
            fillOpacity={muted}
          >
            {profile.about}
          </Text>
        )}
        {profile.availability && (
          <>
            {/* The indicator, as geometry rather than as a bullet character: it
                has to pulse on its own, and nothing has to measure text to place
                it. */}
            <mesh position={[-l.about.w / 2 + 0.17, -l.about.h * 0.32, 0.002]}>
              <circleGeometry args={[Math.min(0.055, l.about.h * 0.022), 16]} />
              <meshStandardMaterial
                ref={liveMat}
                color={t.panelLive}
                emissive={t.panelLive}
                emissiveIntensity={lit ? 1.9 : 0.45}
                roughness={0.4}
              />
            </mesh>
            <Text
              position={[-l.about.w / 2 + 0.26, -l.about.h * 0.32, 0]}
              fontSize={l.contentH * 0.026}
              letterSpacing={0.16}
              maxWidth={l.about.w - 0.42}
              anchorX="left"
              anchorY="middle"
              color={t.panelLive}
              fillOpacity={lit ? 0.95 : 0.4}
            >
              {profile.availability}
            </Text>
          </>
        )}
            </Section>

      {/* STATS — three cells, painted; the numbers in them are type. */}
      <Section
        id="stats"
        rect={l.stats}
        map={statsMap}
        depth={Z_PANE + 0.004}
        {...wiring}
      >
        {stats.map((stat, i) => {
          const cellW = (l.stats.w - 0.16) / Math.max(1, stats.length);
          const x = (i - (stats.length - 1) / 2) * cellW;
          return (
            <group key={stat.label} position={[x, 0, 0]}>
              <Text
                position={[0, l.stats.h * 0.16, 0]}
                fontSize={l.contentH * 0.052}
                anchorX="center"
                anchorY="middle"
                color={t.panelText}
                outlineWidth={0}
                outlineBlur={l.contentH * 0.03}
                outlineColor={t.accent}
                outlineOpacity={lit ? 0.5 : 0.15}
              >
                {stat.value}
              </Text>
              <Text
                position={[0, -l.stats.h * 0.19, 0]}
                fontSize={l.contentH * 0.021}
                letterSpacing={0.14}
                maxWidth={cellW - 0.06}
                textAlign="center"
                anchorX="center"
                anchorY="middle"
                color={t.panelMuted}
                fillOpacity={muted}
              >
                {stat.label}
              </Text>
            </group>
          );
        })}
            </Section>

      {/* TECH STACK — chip frames painted into the pane, labels as type. */}
      <Section
        id="tech"
        rect={l.tech}
        map={techMap}
        depth={Z_PANE + 0.008}
        {...wiring}
      >
        <Text
          position={[-l.tech.w / 2 + 0.14, l.tech.h / 2 - l.tech.h * 0.095, 0]}
          fontSize={l.contentH * 0.032}
          letterSpacing={0.34}
          anchorX="left"
          anchorY="middle"
          color={t.accent}
        >
          TECH STACK
        </Text>
        {techGrid.map((chip) => (
          <group key={chip.name} position={[chip.x, chip.y, 0]}>
            {/* A hairline across the top of each marker, in geometry rather than
                in the painted frame: it is the one part of a chip that is meant
                to look lit, and paint cannot be brighter than white. */}
            <mesh position={[0, chip.h * 0.5 - 0.012, 0.002]}>
              <planeGeometry args={[chip.w * 0.5, 0.01]} />
              <meshStandardMaterial
                color={t.strip}
                emissive={t.accent}
                emissiveIntensity={lit ? 1.8 : 0.4}
                roughness={0.4}
              />
            </mesh>
            <Text
              position={[0, -chip.h * 0.06, 0]}
              fontSize={l.contentH * 0.023}
              letterSpacing={0.08}
              maxWidth={chip.w - 0.03}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              color={t.panelText}
              fillOpacity={lit ? 0.9 : 0.38}
            >
              {chip.name}
            </Text>
          </group>
        ))}
            </Section>

      {/* ACTIVITY — the one module whose content is entirely geometry, because
          the whole point of it is that it moves. */}
      <Section
        id="activity"
        rect={l.activity}
        map={activityMap}
        depth={Z_PANE + 0.012}
        {...wiring}
      >
        <Text
          position={[-l.activity.w / 2 + 0.14, l.activity.h / 2 - l.activity.h * 0.11, 0]}
          fontSize={l.contentH * 0.03}
          letterSpacing={0.34}
          anchorX="left"
          anchorY="middle"
          color={t.accentAlt}
        >
          DEV ACTIVITY
        </Text>
        {barLayout.x.map((x, i) => (
          <mesh
            key={x}
            ref={(mesh) => {
              if (mesh) bars.current[i] = mesh;
            }}
            position={[x, barLayout.base, 0]}
          >
            <planeGeometry args={[barLayout.w, barLayout.max]} />
            <meshStandardMaterial
              color={i % 3 === 0 ? t.accentAlt : t.accent}
              emissive={i % 3 === 0 ? t.accentAlt : t.accent}
              emissiveIntensity={lit ? 1.5 : 0.35}
              roughness={0.45}
            />
          </mesh>
        ))}
            </Section>

      {/* ---------------------------------------------------------------- *
          RIGHT COLUMN
          ---------------------------------------------------------------- */}

      {/* CORE SKILLS — rails painted, fills built, because only one of the two
          ever moves. */}
      <Section
        id="skills"
        rect={l.skills}
        map={skillsMap}
        depth={Z_PANE + 0.002}
        {...wiring}
      >
        <Text
          position={[-l.skills.w / 2 + 0.14, l.skills.h / 2 - l.skills.h * 0.055, 0]}
          fontSize={l.contentH * 0.032}
          letterSpacing={0.34}
          anchorX="left"
          anchorY="middle"
          color={t.accent}
        >
          CORE SKILLS
        </Text>
        {meters.map((meter, i) => (
          <group key={meter.label}>
            <Text
              position={[meter.x, meter.labelY, 0]}
              fontSize={meter.size}
              letterSpacing={0.14}
              maxWidth={meter.w * 0.74}
              anchorX="left"
              anchorY="middle"
              color={t.panelText}
              fillOpacity={muted}
            >
              {meter.label}
            </Text>
            <Text
              position={[meter.x + meter.w, meter.labelY, 0]}
              fontSize={meter.size}
              anchorX="right"
              anchorY="middle"
              color={t.accent}
              fillOpacity={lit ? 0.95 : 0.4}
            >
              {`${meter.level}%`}
            </Text>
            {/* The fill, grown from the rail's left end — scale about the centre
                is why the position moves half as far as the scale does. */}
            <mesh
              ref={(mesh) => {
                if (mesh) fills.current[i] = mesh;
              }}
              position={[meter.x, meter.y, 0.002]}
            >
              <planeGeometry args={[meter.w, meter.h * 0.72]} />
              <meshStandardMaterial
                color={t.accent}
                emissive={t.accent}
                /* Held under the clipping ceiling on purpose — see the note on
                   the hall's wall strips in <Museum>. Cyan driven past about 1.4
                   pins green and blue and comes back as a WHITE bar, which is
                   the one thing a cyan energy meter must not be. */
                emissiveIntensity={lit ? 1.35 : 0.35}
                roughness={0.35}
              />
            </mesh>
          </group>
        ))}
            </Section>

      {/* ACHIEVEMENTS — four tiles, glyphs painted into the pane. */}
      <Section
        id="achievements"
        rect={l.achievements}
        map={achievementsMap}
        depth={Z_PANE + 0.006}
        {...wiring}
      >
        <Text
          position={[-l.achievements.w / 2 + 0.14, l.achievements.h / 2 - l.achievements.h * 0.085, 0]}
          fontSize={l.contentH * 0.032}
          letterSpacing={0.34}
          anchorX="left"
          anchorY="middle"
          color={t.accent}
        >
          ACHIEVEMENTS
        </Text>
        {achievementGrid.map((cell) => (
          <group key={cell.label} position={[cell.x, cell.y, 0]}>
            <Text
              position={[0, -cell.h * 0.06, 0]}
              fontSize={l.contentH * 0.038}
              anchorX="center"
              anchorY="middle"
              color={t.panelText}
            >
              {cell.value}
            </Text>
            <Text
              position={[0, -cell.h * 0.32, 0]}
              fontSize={l.contentH * 0.019}
              letterSpacing={0.14}
              maxWidth={cell.w - 0.06}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              color={t.panelMuted}
              fillOpacity={muted}
            >
              {cell.label}
            </Text>
          </group>
        ))}
            </Section>

      {/* CURRENT FOCUS — the reactor. */}
      {profile.focus && (
        <Section
          id="focus"
          rect={l.focus}
          map={focusMap}
          depth={Z_PANE + 0.01}
          {...wiring}
        >
          <Text
            position={[-l.focus.w / 2 + 0.14, l.focus.h / 2 - l.focus.h * 0.11, 0]}
            fontSize={l.contentH * 0.03}
            letterSpacing={0.34}
            anchorX="left"
            anchorY="middle"
            color={t.accentAlt}
          >
            CURRENT FOCUS
          </Text>

          {/* The code mark. Type, not a painted glyph — it is the only icon here
              that IS a piece of typography. */}
          <Text
            position={[-l.focus.w / 2 + 0.2, -l.focus.h * 0.08, 0]}
            fontSize={l.contentH * 0.05}
            anchorX="center"
            anchorY="middle"
            color={t.accent}
            outlineWidth={0}
            outlineBlur={l.contentH * 0.035}
            outlineColor={t.accent}
            outlineOpacity={lit ? 0.6 : 0.2}
          >
            {"</>"}
          </Text>

          <Text
            position={[-l.focus.w / 2 + 0.36, -l.focus.h * 0.08, 0]}
            fontSize={l.contentH * 0.026}
            lineHeight={1.5}
            maxWidth={l.focus.w - reactorR * 4 - 0.5}
            anchorX="left"
            anchorY="middle"
            color={t.panelText}
            fillOpacity={muted}
          >
            {profile.focus.text}
          </Text>

          {/* The progress core: a static arc at the real reading, a pair of
              counter-turning inner arcs, and a breathing centre. Static because
              85% is a fact — it is the ROTATION around it that has to say the
              instrument is live, not the reading itself. */}
          {/* Sized off the module rather than typed. A reactor core is the
              one element here whose whole job is to be a DIAL you can read at a
              glance, and a dial that stays 19cm across while its panel grows to
              five metres is a full stop. */}
          <group position={[l.focus.w / 2 - reactorR * 1.8, -l.focus.h * 0.08, 0]}>
            <mesh>
              <ringGeometry args={[reactorR, reactorR * 1.13, 48]} />
              <meshBasicMaterial color={t.holoScreen} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 0, 0.002]}>
              <ringGeometry
                args={[
                  reactorR,
                  reactorR * 1.13,
                  48,
                  1,
                  Math.PI / 2 - Math.PI * 2 * profile.focus.progress,
                  Math.PI * 2 * profile.focus.progress,
                ]}
              />
              <meshStandardMaterial
                color={t.strip}
                emissive={t.accent}
                emissiveIntensity={lit ? 1.8 : 0.45}
                roughness={0.35}
              />
            </mesh>
            <group ref={reactor} position={[0, 0, 0.004]}>
              {[0, Math.PI].map((start) => (
                <mesh key={start}>
                  <ringGeometry
                    args={[reactorR * 0.79, reactorR * 0.86, 32, 1, start, Math.PI * 0.5]}
                  />
                  <meshStandardMaterial
                    color={t.accentAlt}
                    emissive={t.accentAlt}
                    emissiveIntensity={lit ? 1.6 : 0.4}
                    roughness={0.4}
                  />
                </mesh>
              ))}
            </group>
            <mesh position={[0, 0, 0.003]}>
              <circleGeometry args={[reactorR * 0.74, 32]} />
              <meshBasicMaterial
                ref={coreMat}
                color={t.accent}
                transparent
                opacity={0.3}
                blending={AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
            <Text
              position={[0, 0, 0.008]}
              fontSize={l.contentH * 0.032}
              anchorX="center"
              anchorY="middle"
              color={t.panelText}
            >
              {`${Math.round(profile.focus.progress * 100)}%`}
            </Text>
          </group>
                </Section>
      )}

      {/* PROJECTS — the manifest. Each row is separately clickable, so the
          panel opens the list and a row opens the work. */}
      {projects.length > 0 && (
        <Section
          id="projects"
          rect={l.projects}
          map={projectsMap}
          depth={Z_PANE + 0.014}
          {...wiring}
        >
          <Text
            position={[-l.projects.w / 2 + 0.14, l.projects.h / 2 - l.projects.h * 0.11, 0]}
            fontSize={l.contentH * 0.03}
            letterSpacing={0.34}
            anchorX="left"
            anchorY="middle"
            color={t.accent}
          >
            SELECTED WORK
          </Text>
          {projectRows.map((row, i) => (
            <group key={row.name} position={[0, row.y, 0]}>
              {/* Its own hit plane. Transparent rather than absent: the row is
                  painted into the panel behind, and paint cannot be pointed
                  at. */}
              <mesh
                onPointerDown={(e) => e.stopPropagation()}
                onClick={
                  interactive
                    ? (e) => {
                        e.stopPropagation();
                        setCursor(e, "");
                        setView({ section: "project", project: i });
                        setPhase("arming");
                      }
                    : undefined
                }
              >
                <planeGeometry args={[row.w, row.h]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              <Text
                position={[-row.w / 2 + 0.12, row.h * 0.16, 0.002]}
                fontSize={l.contentH * 0.024}
                letterSpacing={0.14}
                maxWidth={row.w - 0.24}
                anchorX="left"
                anchorY="middle"
                color={t.panelText}
                fillOpacity={lit ? 0.92 : 0.38}
              >
                {row.name}
              </Text>
              <Text
                position={[-row.w / 2 + 0.12, -row.h * 0.2, 0.002]}
                fontSize={l.contentH * 0.018}
                letterSpacing={0.08}
                maxWidth={row.w - 0.6}
                anchorX="left"
                anchorY="middle"
                color={t.panelMuted}
                fillOpacity={muted * 0.9}
              >
                {(row.tech ?? []).slice(0, 3).join(" · ")}
              </Text>
              {/* The chevron that says a row goes somewhere. */}
              <Text
                position={[row.w / 2 - 0.14, 0, 0.002]}
                fontSize={l.contentH * 0.026}
                anchorX="right"
                anchorY="middle"
                color={t.accent}
                fillOpacity={lit ? 0.8 : 0.3}
              >
                {"›"}
              </Text>
            </group>
          ))}
        </Section>
      )}

      </group>
      )}

      {/* The pointer's mark, travelling between panels. */}
      {interactive && (
        <Reticle
          rect={hovered ? (rects[hovered]?.rect ?? null) : null}
          theme={t}
          lit={lit}
          visible={hovered !== null}
        />
      )}

      {/* ---------------------------------------------------------------- *
          THE TRANSITION
          Two scrims and one flying panel. Between them they do all ten beats
          of the cinematic, and together they cost two opacity writes and three
          transforms a frame — which is the only reason a display with seven
          openable environments behind it can live in a room that is rendered
          twice for the floor.
          ---------------------------------------------------------------- */}

      {/* The overview's scrim: what everything you are leaving falls behind. */}
      {phase !== "overview" && (
        <mesh position={[0, 0, Z_OVERVIEW_SCRIM]}>
          <planeGeometry args={[l.screenW, l.screenH]} />
          <meshBasicMaterial
            ref={overviewScrim}
            color={t.holoScreen}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* THE CONSOLE.

          One group, whose transform is the entire cinematic: it starts as the
          identity, lying in the plane the panel was in, and ends an arm's length
          in front of the viewer, square to them and scaled to their window. See
          THE FLIGHT in the frame loop above.

          Everything inside it is therefore laid out in ONE fixed frame — the
          console's own content box, origin at its centre — and never has to know
          whether it is currently on a wall thirty metres wide or in somebody's
          face. That is the whole reason the transition can be this cheap: no
          layout is recomputed as it travels, and nothing is rebuilt when it
          arrives. */}
      {phase !== "overview" && (
        <group ref={dockGroup} position={[0, 0, Z_DOCK]}>
          {/* The body it is set into — back plate, gasket, frame, substrate. */}
          <ConsoleShell
            w={dock.w}
            h={dock.h}
            theme={t}
            lit={lit}
            env={env}
            brushed={brushed}
            screen={screenMap}
            glow={glowMap}
            vignette={vignetteMap}
            reveal={flight}
          />

          {/* The opened environment. Mounted a frame early so its canvases are
              painted before the movement starts. */}
          <group ref={detailGroup} position={[0, 0, dock.h * C_CONTENT]}>
            <DetailView
              section={view.section}
              width={dock.w}
              height={dock.h}
              scale={dock.scale}
              profile={profile}
              theme={t}
              lit={lit}
              project={view.project}
              onProject={(index) => setView((v) => ({ ...v, project: index }))}
              charge={viewCharge}
            />
          </group>

          {/* The scrim the opened view materialises out of, exactly the size of
              the console's aperture. It fades IN over the first third of the
              movement and out over the rest, rather than being opaque from the
              first frame: at the first frame the console is still lying inside
              the monitor's screen, and a black card appearing across the middle
              of a lit display is the one beat that would read as a glitch
              instead of as a movement. */}
          <mesh position={[0, 0, dock.h * C_SCRIM]}>
            <planeGeometry args={[dock.w, dock.h]} />
            <meshBasicMaterial
              ref={detailScrim}
              color={t.holoScreen}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>

          {/* The panel in flight — the module's OWN painted glass, not a
              stand-in. That it is literally the same texture is what makes the
              transition read as the thing you touched opening rather than as a
              screen being replaced. In FRONT of the scrim, which is the only
              place it can be and still be seen crossing the room. */}
          {opened?.map && (
            <mesh ref={expander} position={[0, 0, dock.h * C_EXPANDER]}>
              <planeGeometry args={[opened.rect.w, opened.rect.h]} />
              <meshBasicMaterial
                ref={expanderMat}
                map={opened.map}
                transparent
                opacity={0}
                depthWrite={false}
              />
            </mesh>
          )}

          {/* And the way out, once you have arrived. */}
          {phase === "detail" && (
            <BackControl
              x={dock.w / 2 - dock.h * 0.028 * dock.scale * 4}
              y={dock.h / 2 - dock.h * 0.028 * dock.scale * 1.6}
              z={dock.h * C_CONTROL}
              size={dock.h * 0.028 * dock.scale}
              theme={t}
              lit={lit}
              onBack={back}
            />
          )}
        </group>
      )}

      {/* And the room, put behind it. Mounted with the console and unmounted
          with it — while this exists it owns the frame. */}
      {phase !== "overview" && <FocusField amount={flight} tint={t.holo} />}

      {/* ---------------------------------------------------------------- *
          ATMOSPHERE — the layers in front of everything
          ---------------------------------------------------------------- */}

      {/* The two refresh sweeps. Basic materials: these are the only things on
          the display that move every frame, so they are the only ones the
          renderer does no lighting work for. A flat alpha tint rather than
          additive — additive saturates to white the instant it crosses anything
          already bright, which would make one bar look like two effects
          depending on where it was. */}
      <mesh ref={scan} position={[0, halfScreenH, Z_SWEEP]}>
        <planeGeometry args={[l.screenW, l.screenH * 0.014]} />
        <meshBasicMaterial ref={scanMat} color={t.holo} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={sweep} position={[-halfScreenW, 0, Z_SWEEP]}>
        <planeGeometry args={[l.screenW * 0.004, l.screenH]} />
        <meshBasicMaterial
          ref={sweepMat}
          color={t.accentAlt}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      {/* Motes in the well, between the interface and the cover glass. One draw
          call for the field, and mounted only when someone is here — a display
          nobody is standing at should be still. This is what finally sells the
          well as VOLUME: dust cannot float inside a flat picture. */}
      {lit && (
        <group ref={motes} position={[0, 0, Z_MOTES]}>
          <Sparkles
            count={48}
            scale={[l.screenW * 0.94, l.screenH * 0.9, WELL * 0.3]}
            size={1.5}
            speed={0.16}
            opacity={0.5}
            noise={0.35}
            color={t.accent}
          />
        </group>
      )}

      {/* The corners of the well, in shadow. Normal blending: this is the one
          layer whose job is to subtract, and it is what makes the aperture read
          as something with sides. */}
      {vignetteMap && (
        <mesh position={[0, 0, Z_VIGNETTE]}>
          <planeGeometry args={[l.screenW, l.screenH]} />
          <meshBasicMaterial map={vignetteMap} transparent depthWrite={false} />
        </mesh>
      )}

      {/* Cover glass. Faint enough to be deniable — the moment you can read the
          streaks as a texture it stops being glass and becomes a dirty window. */}
      {glassMap && (
        <mesh position={[0, 0, Z_GLASS]}>
          <planeGeometry args={[l.screenW, l.screenH]} />
          <meshBasicMaterial
            map={glassMap}
            transparent
            opacity={lit ? 0.85 : 0.5}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      )}

      </group>

      {/* ---------------------------------------------------------------- *
          THE ROOM GLOW
          The brief asks for the screen to light the wall around it, and this is
          how it is paid for: NOT with a light. A pointLight here would be
          evaluated against every lit fragment in the hall, twice a frame,
          because the floor below is a real planar mirror — see the note on
          LIGHT_INTENSITY in <Museum>, where the whole 30-metre room is held to
          one lamp for exactly this reason.
          So the spill is a soft additive wash on the wall behind the machine,
          and the floor's own mirror does the rest for free: the monitor is the
          brightest thing in the hall, and the reflection under it is a genuine
          second image of it rather than a fake.
          ---------------------------------------------------------------- */}
      {glowMap && (
        <>
          {/* Big and faint, in that order. A wash this size has no edge you can
              find, which is what light spilling onto a wall looks like; the same
              energy in a smaller quad is a headlamp pointed at the plaster. */}
          <mesh position={[0, 0, 0.02]}>
            <planeGeometry args={[width * 3.4, height * 4]} />
            <meshBasicMaterial
              map={glowMap}
              color={t.holo}
              transparent
              opacity={lit ? 0.1 : 0.03}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, -height * 0.55, 0.022]}>
            <planeGeometry args={[width * 2.2, height * 2]} />
            <meshBasicMaterial
              map={glowMap}
              color={t.accentAlt}
              transparent
              opacity={lit ? 0.06 : 0.02}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
    </group>
  );
}
