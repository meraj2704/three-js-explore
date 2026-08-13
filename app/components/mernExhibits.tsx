"use client";

/**
 * The MERN stack, as things you can drive past.
 *
 * Four marks standing on the pedestals down the project walls — MongoDB,
 * Express, React, Node — in place of the abstract solids the museum ships with.
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
 * Built once, at module scope. Six pedestals a side and four marks means each
 * geometry is shared by three meshes on each wall, which is exactly what sharing
 * a BufferGeometry is for.
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
  {
    depth: 0.34,
    shapes: [
      (() => {
        const nucleus = new Shape();
        nucleus.absarc(0, 0, 0.115, 0, Math.PI * 2, false);
        return nucleus;
      })(),
    ],
  },
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
 * The set
 * ------------------------------------------------------------------ */

/** In stack order, so the pedestals spell M-E-R-N down the hall.
 *
 *  Brand colours, which is the whole reason <Museum> lets an exhibit override
 *  the theme at all — the museum's own pink-and-blue pair would make four
 *  differently-shaped ornaments out of four logos. Each `emissive` is a heavily
 *  darkened version of its own colour rather than a bright one: the museum
 *  multiplies it by 0.9 in a lit hall, and at full brightness these stopped
 *  looking like painted objects and started looking like light fittings. */
const MERN: Exhibit[] = [
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
];

/** The geometries, in the same order as the skins above. Kept as a parallel list
 *  rather than written into MERN so the colours stay readable as a palette. */
const MERN_GEOMETRY: BufferGeometry[][] = [
  [MONGO_LIGHT, MONGO_DARK, MONGO_STEM],
  [EXPRESS_PLATE, EXPRESS_TYPE],
  [REACT_ORBITS, REACT_NUCLEUS],
  [NODE_BODY, NODE_FACE],
];

const MARKS: Exhibit[] = MERN.map((parts, m) =>
  parts.map((part, p) => ({
    ...part,
    // attach="geometry" is what puts the shared BufferGeometry on the mesh the
    // museum wraps this in — the declarative <extrudeGeometry> form would build a
    // fresh one per pedestal and none of them could be pre-seated.
    geometry: <primitive attach="geometry" object={MERN_GEOMETRY[m][p]} />,
  })),
);

/**
 * The stack, dealt along a plinth.
 *
 * `side` shifts the starting mark by two, so the two walls run out of step: the
 * −z plinth opens on MongoDB and the +z plinth opens on React. With four marks
 * over six pedestals the alternative is both walls dealing the identical hand,
 * and a hall that repeats itself across its own centreline looks like a mistake
 * even when every object in it is right.
 */
export const mernExhibits = (i: number, side: 1 | -1): Exhibit =>
  MARKS[(i + (side > 0 ? 2 : 0)) % MARKS.length];
