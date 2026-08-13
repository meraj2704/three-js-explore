"use client";

/**
 * The stack, as things you can drive past.
 *
 * Seven marks standing on the pedestals down the project walls — MongoDB,
 * Express, React, Node, Next, Nest and PostgreSQL — in place of the abstract
 * solids the museum ships with. The first four were the MERN set this file
 * started as; the last three are the rest of what the portrait's tag list claims,
 * which is the only reason a hall of six pedestals a side now has seven marks to
 * deal from.
 *
 * They are EXTRUDED SILHOUETTES rather than modelled objects, which is the one
 * decision here worth explaining. A logo is a flat drawing; the honest way to
 * put one in a room is to cut it out of a plate and stand it up, and that also
 * happens to be the only way to get a MongoDB leaf or a React atom out of
 * primitives at all. The cost is that a plate seen edge-on is a sliver — paid
 * for twice over, by extruding them deep enough to stay solid and by having the
 * museum turn each one to face the lane you drive down.
 *
 * What makes them read as LOGOS rather than as green and grey ornaments is two
 * things beyond the outline, and both were missing from the first cut:
 *
 *   Colour BREAKS. A MongoDB leaf is two greens meeting at a fold; a Node
 *   hexagon is a pale face on a dark body; Express is light type on a dark tile.
 *   One mesh carries one material, so each of those is built here as several
 *   parts sharing a frame — which is what <Museum>'s ExhibitPart list is for.
 *
 *   Material. The museum's abstract solids are half metal at 0.3 roughness,
 *   which is right for a glowing icosahedron and wrong for everything here: it
 *   made four boiled sweets. These are painted board — no metal, matte — and
 *   their emissive is a DARK version of their own colour rather than a bright
 *   one, so the hall's lamp lights them instead of them lighting themselves.
 *   That single change is most of the difference between a toy and an object.
 *
 * Built once, at module scope. Six pedestals a side and seven marks means every
 * geometry here is shared by two or three meshes across the hall, which is
 * exactly what sharing a BufferGeometry is for.
 */

import { Box3, ExtrudeGeometry, Path, Shape } from "three";
import type { BufferGeometry, ExtrudeGeometryOptions } from "three";

import { EXHIBIT_SEAT } from "./Museum";
import type { Exhibit } from "./Museum";

/** Every mark gets the same extrusion. Deep, because these are looked at from a
 *  moving car and a thin plate turns into a line the moment you are past it;
 *  bevelled, because the hall has exactly one lamp and a bevel is what gives a
 *  flat face an edge for it to catch.
 *
 *  The bevel is SMALL, and that is a correction rather than a preference. A
 *  bevel eats its own size out of every edge in the shape, from both sides — so
 *  at 0.035 it was wider than half of React's orbit rings, which closed their
 *  holes and turned the atom into a cyan pebble, and it rounded Node's hexagon
 *  off into an octagon. Whatever the thinnest limb in any mark here is, the
 *  bevel has to stay well under half of it. */
const MARK_DEPTH = 0.26;
const EXTRUDE: ExtrudeGeometryOptions = {
  depth: MARK_DEPTH,
  bevelEnabled: true,
  bevelThickness: 0.018,
  bevelSize: 0.018,
  bevelSegments: 2,
  curveSegments: 20,
};

/** How tall each mark is drawn, tip to toe. Matched to the ~0.9 the museum's own
 *  solids span so the two sets could stand in the same hall without one looking
 *  like a scale model of the other. */
const MARK_HEIGHT = 0.9;
const HALF = MARK_HEIGHT / 2;

/** Painted board, not chrome. The museum's default is metalness 0.5 / roughness
 *  0.3, which is a lacquered ornament; a logo is a flat colour on a matte
 *  surface, and reading as one is the entire job here. */
const PAINT = { metalness: 0.04, roughness: 0.58 } as const;

/**
 * Shape groups to a set of seated, registered geometries.
 *
 * Two different centrings, for two different reasons, and getting them the wrong
 * way round is the whole trap in a multi-part mark:
 *
 *   Z is centred PER PART. Parts are extruded to different depths so that a face
 *   laid over a body stands proud of it on both sides — coplanar faces z-fight,
 *   and a face that is merely inset would fight on the back. Centring each part
 *   on its own depth is what makes "thicker" mean "proud at both ends".
 *
 *   X and Y are centred ONCE, over the union. These are pieces of one drawing:
 *   centre a leaf's dark fold on its own bounding box and it slides into the
 *   middle of the leaf. They have to move together or not at all.
 *
 * The Y half of that is also the seating. <Museum> puts every exhibit at one
 * fixed height above its pedestal — EXHIBIT_SEAT — which works out for a sphere
 * because a sphere is drawn around its own centre. A leaf is not: it is drawn
 * tip-up with its mass low, and centring it would leave it hovering. So this
 * measures what was actually drawn and drops the BOTTOM of the union onto the
 * pedestal, which lets every mark below be drawn at whatever proportions suit it
 * and still stand on the same shelf.
 */
function markParts(
  groups: { shapes: Shape[]; depth?: number }[],
): BufferGeometry[] {
  const geometries = groups.map(
    (group) =>
      new ExtrudeGeometry(group.shapes, {
        ...EXTRUDE,
        depth: group.depth ?? MARK_DEPTH,
      }),
  );

  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box) geometry.translate(0, 0, -(box.min.z + box.max.z) / 2);
  }

  const union = new Box3();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    if (geometry.boundingBox) union.union(geometry.boundingBox);
  }

  const dx = -(union.min.x + union.max.x) / 2;
  const dy = -union.min.y - EXHIBIT_SEAT;
  for (const geometry of geometries) geometry.translate(dx, dy, 0);

  return geometries;
}

/** A stroke of given weight laid along an angle — the primitive both letterforms
 *  below are built out of. */
function stroke(
  cx: number,
  cy: number,
  angle: number,
  length: number,
  weight: number,
): Shape {
  const ax = (Math.cos(angle) * length) / 2;
  const ay = (Math.sin(angle) * length) / 2;
  const bx = (-Math.sin(angle) * weight) / 2;
  const by = (Math.cos(angle) * weight) / 2;

  const bar = new Shape();
  bar.moveTo(cx - ax + bx, cy - ay + by);
  bar.lineTo(cx + ax + bx, cy + ay + by);
  bar.lineTo(cx + ax - bx, cy + ay - by);
  bar.lineTo(cx - ax - bx, cy - ay - by);
  bar.closePath();

  return bar;
}

/** A disc. Its own helper because three marks below want one — as a body, as a
 *  nucleus and as a pair of eyes — and only the last of those is at the origin. */
function circle(radius: number, cx = 0, cy = 0): Shape {
  const disc = new Shape();
  disc.absarc(cx, cy, radius, 0, Math.PI * 2, false);
  return disc;
}

/** A triangle with its corners taken off, drawn point-DOWN.
 *
 *  The rounding is a quadratic through the true vertex from a point `corner` back
 *  along each edge, which is the cheap way to round a polygon and the only one
 *  that keeps the flat of every edge exactly where the straight triangle put it.
 *
 *  `reverse` walks the vertices the other way round. That is what makes one of
 *  these usable as a HOLE: three.js triangulates a hole from its winding, and a
 *  hole wound the same way as its shape comes out filled in. */
function roundedTriangle(radius: number, corner: number, reverse = false): Shape {
  const points = Array.from({ length: 3 }, (_, k) => {
    const angle = -Math.PI / 2 + (k * Math.PI * 2) / 3;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
  if (reverse) points.reverse();

  /** `corner` units from one vertex toward the next. */
  const toward = (
    from: readonly [number, number],
    to: readonly [number, number],
  ) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const span = Math.hypot(dx, dy) || 1;
    return [
      from[0] + (dx / span) * corner,
      from[1] + (dy / span) * corner,
    ] as const;
  };

  const shape = new Shape();
  for (let k = 0; k < 3; k++) {
    const here = points[k];
    const from = toward(here, points[(k + 2) % 3]);
    const to = toward(here, points[(k + 1) % 3]);

    if (k === 0) shape.moveTo(from[0], from[1]);
    else shape.lineTo(from[0], from[1]);
    shape.quadraticCurveTo(here[0], here[1], to[0], to[1]);
  }

  shape.closePath();
  return shape;
}

function roundedRect(width: number, height: number, radius: number): Shape {
  const w = width / 2;
  const h = height / 2;

  const rect = new Shape();
  rect.moveTo(-w + radius, -h);
  rect.lineTo(w - radius, -h);
  rect.quadraticCurveTo(w, -h, w, -h + radius);
  rect.lineTo(w, h - radius);
  rect.quadraticCurveTo(w, h, w - radius, h);
  rect.lineTo(-w + radius, h);
  rect.quadraticCurveTo(-w, h, -w, h - radius);
  rect.lineTo(-w, -h + radius);
  rect.quadraticCurveTo(-w, -h, -w + radius, -h);
  rect.closePath();

  return rect;
}

/* ------------------------------------------------------------------ *
 * MongoDB — the leaf
 * ------------------------------------------------------------------ */

/** The leaf is drawn as TWO halves meeting at a seam rather than as one outline
 *  with a dark shape laid over it. That is what the real mark is — a fold, with
 *  the light face turned toward you and the shaded one away — and building it
 *  that way means the two greens meet edge to edge at full depth, so the fold
 *  reads from behind as well and there is no overlap to z-fight.
 *
 *  The seam bulges left of centre, which is what makes the leaf look folded
 *  rather than merely striped. */
const MONGO_TIP = HALF;
const MONGO_BASE = -0.3;

const [MONGO_LIGHT, MONGO_DARK, MONGO_STEM] = markParts([
  {
    shapes: [
      (() => {
        const face = new Shape();
        face.moveTo(0, MONGO_TIP);
        face.bezierCurveTo(0.3, 0.1, 0.28, -0.16, 0, MONGO_BASE);
        face.bezierCurveTo(-0.07, -0.16, -0.09, 0.1, 0, MONGO_TIP);
        return face;
      })(),
    ],
  },
  {
    shapes: [
      (() => {
        const fold = new Shape();
        fold.moveTo(0, MONGO_TIP);
        fold.bezierCurveTo(-0.09, 0.1, -0.07, -0.16, 0, MONGO_BASE);
        fold.bezierCurveTo(-0.25, -0.16, -0.26, 0.1, 0, MONGO_TIP);
        return fold;
      })(),
    ],
  },
  {
    shapes: [
      (() => {
        const stem = new Shape();
        stem.moveTo(-0.05, -0.26);
        stem.lineTo(0.05, -0.26);
        stem.lineTo(0.032, -HALF);
        stem.lineTo(-0.032, -HALF);
        stem.closePath();
        return stem;
      })(),
    ],
  },
]);

/* ------------------------------------------------------------------ *
 * Express — the wordmark
 * ------------------------------------------------------------------ */

/** The odd one out, and it has to be. Express has no pictorial mark at all — its
 *  logo is type — so a symbol invented for it would be the least realistic thing
 *  in the hall however well drawn. What it gets instead is what an icon set
 *  gives it: a dark tile with light "ex" on it.
 *
 *  The tile is not decoration, it is doing structural work. A wordmark is short
 *  and wide, and "ex" on its own would stand about half as tall as a leaf or a
 *  hexagon and read as an afterthought beside them. Set into a tile it carries
 *  the same mass as the rest of the set.
 *
 *  The 'e' is an arc ring with a bar across it: a 300° sweep leaves the aperture
 *  at the lower right where a real 'e' has it, and the bar spans the full width
 *  because at this stroke weight a short one closes up. */
const EXPRESS_TILE = 0.9;
const EXPRESS_WEIGHT = 0.062;
const EXPRESS_E_X = -0.2;
const EXPRESS_E_R = 0.18;
const EXPRESS_X_X = 0.2;

const [EXPRESS_PLATE, EXPRESS_TYPE] = markParts([
  { shapes: [roundedRect(EXPRESS_TILE, EXPRESS_TILE, 0.16)], depth: 0.22 },
  {
    depth: 0.3,
    shapes: [
      (() => {
        const bowl = new Shape();
        bowl.absarc(EXPRESS_E_X, 0, EXPRESS_E_R, 0, (Math.PI * 5) / 3, false);
        bowl.absarc(
          EXPRESS_E_X,
          0,
          EXPRESS_E_R - EXPRESS_WEIGHT,
          (Math.PI * 5) / 3,
          0,
          true,
        );
        bowl.closePath();
        return bowl;
      })(),
      stroke(EXPRESS_E_X, 0, 0, EXPRESS_E_R * 2, EXPRESS_WEIGHT),
      stroke(EXPRESS_X_X, 0, 0.87, 0.46, EXPRESS_WEIGHT),
      stroke(EXPRESS_X_X, 0, -0.87, 0.46, EXPRESS_WEIGHT),
    ],
  },
]);

/* ------------------------------------------------------------------ *
 * React — the atom
 * ------------------------------------------------------------------ */

/** Fatter and rounder than the logo is actually drawn, on purpose. This mark is
 *  90cm of geometry lit by one lamp thirty metres away and looked at from a
 *  moving car: at the logo's true proportions the orbits come out as hairlines,
 *  the holes close under the bevel and the whole thing reads as a cyan pebble.
 *  A heavier ring and a taller bore survive the trip. */
const REACT_ORBIT_RX = 0.45;
const REACT_ORBIT_RY = 0.205;
const REACT_ORBIT_WEIGHT = 0.085;

/** Three orbits and a nucleus. The orbits overlap, and that is not a problem to
 *  solve: ExtrudeGeometry takes a LIST of shapes and unions them into one
 *  geometry, and the overlap is what the logo is. Sixty degrees apart, which is
 *  what makes the union's envelope come out round rather than lozenge-shaped.
 *
 *  The nucleus is a part of its own only so it can stand proud — same cyan, but
 *  a logo whose middle catches the light differently from its rings stops
 *  looking like a sticker. */
const [REACT_ORBITS, REACT_NUCLEUS] = markParts([
  {
    shapes: Array.from({ length: 3 }, (_, k) => {
      const spin = (k * Math.PI) / 3;

      const orbit = new Shape();
      orbit.absellipse(
        0,
        0,
        REACT_ORBIT_RX,
        REACT_ORBIT_RY,
        0,
        Math.PI * 2,
        false,
        spin,
      );

      const bore = new Path();
      bore.absellipse(
        0,
        0,
        REACT_ORBIT_RX - REACT_ORBIT_WEIGHT,
        REACT_ORBIT_RY - REACT_ORBIT_WEIGHT,
        0,
        Math.PI * 2,
        true,
        spin,
      );
      orbit.holes.push(bore);

      return orbit;
    }),
  },
  { depth: 0.34, shapes: [circle(0.115)] },
]);

/* ------------------------------------------------------------------ *
 * Node — the hexagon
 * ------------------------------------------------------------------ */

/** Point-up, which is the orientation the logo is always drawn in and the one
 *  that stops it reading as a bolt head. Circumradius is half the mark height,
 *  so a point-up hexagon spans the full height and about 0.78 across.
 *
 *  Two of them: a dark body and a pale face standing proud of it. A single flat
 *  hexagon is a hexagon; a hexagon with an inset face is the Node mark, and it
 *  is also the difference between a slab and something that looks machined. */
function hexagon(circumradius: number): Shape {
  const hex = new Shape();

  for (let k = 0; k < 6; k++) {
    const angle = Math.PI / 2 + (k * Math.PI) / 3;
    const x = Math.cos(angle) * circumradius;
    const y = Math.sin(angle) * circumradius;
    if (k === 0) hex.moveTo(x, y);
    else hex.lineTo(x, y);
  }

  hex.closePath();
  return hex;
}

const [NODE_BODY, NODE_FACE] = markParts([
  { shapes: [hexagon(HALF)] },
  { shapes: [hexagon(HALF * 0.66)], depth: 0.3 },
]);

/* ------------------------------------------------------------------ *
 * Next.js — the disc
 * ------------------------------------------------------------------ */

/** A dark disc with a white N in it, which is the mark as it is actually drawn.
 *
 *  The N is three separate strokes rather than one outline, and the right-hand
 *  one is a SHORT bar at the top rather than a full stem — that clipped stem is
 *  the whole character of the mark, and an N with two full legs in a circle is
 *  just a letter in a circle.
 *
 *  Every stroke has to finish inside the disc, bevel included: the plate is cut
 *  to the circle, so anything drawn past it hangs in the air with nothing behind
 *  it. The diagonal is the one that gets close, which is why it stops at 0.22,
 *  −0.28 rather than running to the rim the way the drawn logo does. */
const NEXT_WEIGHT = 0.078;

const [NEXT_DISC, NEXT_LETTER] = markParts([
  { shapes: [circle(HALF)], depth: 0.22 },
  {
    depth: 0.3,
    shapes: [
      // Left stem, full height.
      stroke(-0.16, 0, Math.PI / 2, 0.48, NEXT_WEIGHT),
      // The diagonal, from the top of that stem down toward the rim.
      stroke(0.03, -0.02, -0.94, 0.64, NEXT_WEIGHT),
      // Right stem, cut off a third of the way down.
      stroke(0.17, 0.145, Math.PI / 2, 0.19, NEXT_WEIGHT),
    ],
  },
]);

/* ------------------------------------------------------------------ *
 * NestJS — the ribbon
 * ------------------------------------------------------------------ */

/** The one approximation in the set, and worth saying so plainly: the real Nest
 *  mark is a ribbon that loops and crosses OVER itself, and a crossing is exactly
 *  what a single extruded plate cannot express — the strand in front and the
 *  strand behind would be the same flat face.
 *
 *  What survives the reduction is what makes it recognisable at 90cm across a
 *  dark hall: the crimson, and a band that closes on itself.
 *
 *  So the middle is left OPEN. Filled, it came out a solid rounded triangle —
 *  which is a yield sign, not a ribbon, and no amount of colour on top fixes
 *  that. A hole is what makes a band read as a band, and it costs nothing: the
 *  museum is behind it either way.
 *
 *  The deeper crimson bar laid across the lower-left run is where the ribbon
 *  crosses over itself in the real mark. It is the one place a flat plate can
 *  admit that a crossing exists — as a change of colour rather than of depth —
 *  and it is also this mark's colour break, which every other mark in the set
 *  has and a bare ring would not. */
const NEST_RADIUS = 0.52;
const NEST_HOLE = NEST_RADIUS * 0.5;

/** The crossing, placed on the ring rather than typed in: it sits halfway along
 *  the band, on the normal of the lower-left edge, lying across it. Apothem is
 *  half the circumradius for a triangle, so the band spans that to half of it
 *  again, and the bar is set at the middle of that span and drawn long enough to
 *  overhang both edges. */
const NEST_CROSS_ANGLE = (Math.PI * 7) / 6;
const NEST_BAND_MID = (NEST_RADIUS / 2 + NEST_HOLE / 2) / 2;

const NEST_RIBBON_SHAPE = roundedTriangle(NEST_RADIUS, 0.15);
NEST_RIBBON_SHAPE.holes.push(roundedTriangle(NEST_HOLE, 0.075, true));

const [NEST_RIBBON, NEST_CROSSING] = markParts([
  { shapes: [NEST_RIBBON_SHAPE] },
  {
    depth: 0.32,
    shapes: [
      stroke(
        Math.cos(NEST_CROSS_ANGLE) * NEST_BAND_MID,
        Math.sin(NEST_CROSS_ANGLE) * NEST_BAND_MID,
        NEST_CROSS_ANGLE,
        0.3,
        0.12,
      ),
    ],
  },
]);

/* ------------------------------------------------------------------ *
 * PostgreSQL — the elephant
 * ------------------------------------------------------------------ */

/** Slonik, head on.
 *
 *  Drawn facing FORWARD rather than in the logo's three-quarter view, and that is
 *  the trade this mark makes on purpose. In profile an elephant head is a blue
 *  blob with a hook on it unless the trunk, tusk and eye all land exactly right;
 *  head on, two ears and a trunk are unmistakable from across a room, at any
 *  angle you happen to drive past it. Nobody who knows the database will miss a
 *  blue elephant, and that is the whole job.
 *
 *  The ears carry it. The outline pinches in at the cheeks and again above the
 *  trunk, so the silhouette has two waists in it — without those it comes out as
 *  a shield, which is the failure mode of every simplified animal head. */
function elephantHead(): Shape {
  const head = new Shape();

  head.moveTo(-0.055, -HALF);
  // Left side of the trunk, up to where it meets the face.
  head.bezierCurveTo(-0.09, -0.34, -0.1, -0.27, -0.1, -0.2);
  // Cheek, flaring out from the trunk.
  head.bezierCurveTo(-0.18, -0.19, -0.22, -0.11, -0.22, -0.02);
  // Left ear: out, up and over.
  head.bezierCurveTo(-0.37, 0.0, -0.46, 0.14, -0.42, 0.28);
  head.bezierCurveTo(-0.4, 0.41, -0.27, 0.46, -0.15, 0.41);
  // Crown between the ears.
  head.bezierCurveTo(-0.09, HALF, 0.09, HALF, 0.15, 0.41);
  // Right ear, mirrored.
  head.bezierCurveTo(0.27, 0.46, 0.4, 0.41, 0.42, 0.28);
  head.bezierCurveTo(0.46, 0.14, 0.37, 0.0, 0.22, -0.02);
  // Right cheek, and back down the trunk.
  head.bezierCurveTo(0.22, -0.11, 0.18, -0.19, 0.1, -0.2);
  head.bezierCurveTo(0.1, -0.27, 0.09, -0.34, 0.055, -HALF);
  head.closePath();

  return head;
}

const [POSTGRES_HEAD, POSTGRES_EYES] = markParts([
  { shapes: [elephantHead()] },
  { depth: 0.32, shapes: [circle(0.05, -0.12, 0.13), circle(0.05, 0.12, 0.13)] },
]);

/* ------------------------------------------------------------------ *
 * The set
 * ------------------------------------------------------------------ */

/** The MERN four first, in the order that spells them, then the three the stack
 *  actually runs on.
 *
 *  Brand colours, which is the whole reason <Museum> lets an exhibit override
 *  the theme at all — the museum's own pink-and-blue pair would make seven
 *  differently-shaped ornaments out of seven logos. Each `emissive` is a heavily
 *  darkened version of its own colour rather than a bright one: the museum
 *  multiplies it by 0.9 in a lit hall, and at full brightness these stopped
 *  looking like painted objects and started looking like light fittings.
 *
 *  Next's disc is the exception that proves it. Its true colour is black, and a
 *  black disc in an unlit hall is a hole in the wall rather than an object — so
 *  it is lifted to a charcoal, exactly as far as it takes for the rim to catch
 *  the hall's one lamp. */
const STACK: Exhibit[] = [
  [
    { geometry: null, color: "#4faa41", emissive: "#0d2b0a", ...PAINT },
    { geometry: null, color: "#0f5c46", emissive: "#04170f", ...PAINT },
    { geometry: null, color: "#0f5c46", emissive: "#04170f", ...PAINT },
  ],
  [
    { geometry: null, color: "#22282e", emissive: "#070a0c", ...PAINT },
    { geometry: null, color: "#e6ebf1", emissive: "#2b3138", ...PAINT },
  ],
  [
    { geometry: null, color: "#61dafb", emissive: "#0d323c", ...PAINT },
    { geometry: null, color: "#61dafb", emissive: "#0d323c", ...PAINT },
  ],
  [
    { geometry: null, color: "#33682f", emissive: "#0a1a09", ...PAINT },
    { geometry: null, color: "#8cc84b", emissive: "#243611", ...PAINT },
  ],
  [
    { geometry: null, color: "#1b1d23", emissive: "#06070a", ...PAINT },
    { geometry: null, color: "#f2f5f8", emissive: "#2f343b", ...PAINT },
  ],
  [
    { geometry: null, color: "#e0234e", emissive: "#380a17", ...PAINT },
    { geometry: null, color: "#9c1436", emissive: "#26060f", ...PAINT },
  ],
  [
    { geometry: null, color: "#336791", emissive: "#0c1a25", ...PAINT },
    { geometry: null, color: "#eef4f8", emissive: "#2c3a44", ...PAINT },
  ],
];

/** The geometries, in the same order as the skins above. Kept as a parallel list
 *  rather than written into STACK so the colours stay readable as a palette. */
const STACK_GEOMETRY: BufferGeometry[][] = [
  [MONGO_LIGHT, MONGO_DARK, MONGO_STEM],
  [EXPRESS_PLATE, EXPRESS_TYPE],
  [REACT_ORBITS, REACT_NUCLEUS],
  [NODE_BODY, NODE_FACE],
  [NEXT_DISC, NEXT_LETTER],
  [NEST_RIBBON, NEST_CROSSING],
  [POSTGRES_HEAD, POSTGRES_EYES],
];

const MARKS: Exhibit[] = STACK.map((parts, m) =>
  parts.map((part, p) => ({
    ...part,
    // attach="geometry" is what puts the shared BufferGeometry on the mesh the
    // museum wraps this in — the declarative <extrudeGeometry> form would build a
    // fresh one per pedestal and none of them could be pre-seated.
    geometry: <primitive attach="geometry" object={STACK_GEOMETRY[m][p]} />,
  })),
);

/**
 * The stack, dealt along a plinth.
 *
 * `side` shifts the starting mark, so the two walls run out of step: the −z
 * plinth opens on MongoDB and the +z plinth opens on Node. Without the shift both
 * walls deal the identical hand, and a hall that repeats itself across its own
 * centreline looks like a mistake even when every object in it is right.
 *
 * Seven marks over six pedestals means each wall is one short of the full set —
 * the −z wall never reaches PostgreSQL, the +z wall never reaches React — and
 * that is the better half of the bargain: there is something on the other side of
 * the hall that isn't on this one, which is a reason to drive back down it.
 */
export const stackExhibits = (i: number, side: 1 | -1): Exhibit =>
  MARKS[(i + (side > 0 ? 3 : 0)) % MARKS.length];
