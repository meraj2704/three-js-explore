/**
 * The supercar's bodywork, as geometry.
 *
 * Boxes can't make this shape. A body that is pointed and low at the nose, wide
 * and tall over the rear haunches, and rounded on top but nearly square along
 * the sills is a *lofted* surface: a run of cross-sections down the length of
 * the car with a skin stretched over them. That's what this module builds, and
 * why the numbers below are a table of stations rather than a pile of
 * `boxGeometry args`.
 *
 * Everything here is module-level and built once. Geometry is immutable and
 * shared between every <Car> in the scene, which is the point — the loft is a
 * few thousand triangles and there is no reason to pay for it per instance.
 */

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  RingGeometry,
  Shape,
  TorusGeometry,
} from "three";

/* ---------------------------------------------------------------------------
 * Dimensions
 *
 * These are the facts the component and the geometry both need. Proportions are
 * a real supercar's, scaled to a 4-unit car: 4.0 long, 1.78 wide, 1.06 tall —
 * which is more than twice as long as it is wide and barely taller than the
 * wheels. That ratio is the whole "low and wide" look; nothing else in this file
 * matters as much.
 * ------------------------------------------------------------------------ */

/** Nose to tail. Half of it is ROAD_START_Z's clearance from the end of the
 *  asphalt, so a longer car would spawn with its tail over the edge. */
export const CAR_LENGTH = 4;

/** Big wheels, low-profile tyres: the rim is nearly the whole diameter, leaving
 *  a sidewall of 0.085. That thin band of rubber is what reads as "performance
 *  tyre" from outside — on a taller sidewall the same wheel looks like an SUV's. */
export const WHEEL_RADIUS = 0.34;
export const TYRE_WIDTH = 0.3;
export const RIM_RADIUS = 0.255;

/** How far the wheels sit from the centreline, and from the middle of the car.
 *  The wheelbase is deliberately long against the overhangs (2.6 between the
 *  axles, 0.7 hanging off each end) — cab-backward proportions, the thing that
 *  separates a mid-engined silhouette from a hatchback's. */
export const WHEEL_TRACK = 0.74;
export const WHEEL_BASE = 1.3;

/** Half the car's width, and the margin the kerb test is run with.
 *
 *  It is deliberately the SAME 0.89 the boxy car used, so none of the world
 *  tuning around it had to move — the doorway's clear lane, the branch widths,
 *  the apron flare. What changed is which part of the car reaches it: it used to
 *  be the outer face of a tyre, and is now the outer face of the wheel arch
 *  flare, with the tyre sitting flush inside it. WHEEL_TRACK + TYRE_WIDTH / 2
 *  lands on the same number, which is what keeps the two honest. Widen the
 *  arches in ARCH_* below and this has to grow with them. */
export const CAR_HALF_WIDTH = WHEEL_TRACK + TYRE_WIDTH / 2;

/** Wheel arch flares: a half-ring standing proud of the flank over each wheel.
 *  Their outer face is the widest point on the car, so ARCH_X + ARCH_TUBE must
 *  come to exactly CAR_HALF_WIDTH or the bodywork reaches past what the kerb
 *  test is holding back. */
const ARCH_X = 0.812;
const ARCH_TUBE = 0.078;

/* ---------------------------------------------------------------------------
 * The loft
 * ------------------------------------------------------------------------ */

/**
 * One cross-section of the car, taken at a point along its length.
 *
 * The outline is a superellipse — a shape that is an ellipse at `corner` = 1 and
 * squares off toward a rectangle as it drops toward 0. One number therefore
 * carries the whole "smooth curves AND sharp edges" brief: the nose and tail
 * stay round and soft, the doors and sills square up hard, and the transition
 * between them happens along the length of the car without a seam.
 */
type Station = {
  /** Where along the car this section sits. +z is the nose. */
  z: number;
  /** Half the section's width. */
  halfWidth: number;
  /** Height of the underside and of the upper surface, above the road. */
  bottom: number;
  top: number;
  /** 1 = a pure ellipse. Lower squares the corners off; ~0.4 is a hard crease. */
  corner: number;
};

/**
 * The lower body: everything below the glass.
 *
 * Read top to bottom and it is the side profile. The nose is the lowest section
 * on the car AND the narrowest, so it reads as pointed downward from every
 * angle. The upper line climbs steadily from there to the rear haunch, which is
 * both the widest and the tallest station — that rearward wedge is what makes
 * the car look like it's braced against the road rather than sitting on it.
 *
 * `corner` runs the other way: round at both tips, hard through the middle
 * where the doors and sills are. Lights, vents and intakes are placed against
 * these numbers by the helpers below rather than being guessed at, so editing a
 * station drags its trim along with it instead of leaving it hanging in the air.
 */
const BODY_STATIONS: Station[] = [
  { z: 2.0, halfWidth: 0.5, bottom: 0.19, top: 0.4, corner: 0.8 }, // nose tip
  { z: 1.8, halfWidth: 0.7, bottom: 0.15, top: 0.49, corner: 0.62 }, // bumper
  { z: 1.52, halfWidth: 0.8, bottom: 0.14, top: 0.58, corner: 0.52 },
  { z: 1.3, halfWidth: 0.83, bottom: 0.14, top: 0.62, corner: 0.48 }, // front axle
  { z: 0.98, halfWidth: 0.81, bottom: 0.14, top: 0.6, corner: 0.44 }, // hood valley
  { z: 0.55, halfWidth: 0.82, bottom: 0.14, top: 0.68, corner: 0.42 }, // cowl
  { z: 0.0, halfWidth: 0.84, bottom: 0.14, top: 0.72, corner: 0.4 },
  { z: -0.62, halfWidth: 0.86, bottom: 0.14, top: 0.76, corner: 0.38 }, // intake
  { z: -1.3, halfWidth: 0.86, bottom: 0.15, top: 0.8, corner: 0.4 }, // rear axle
  { z: -1.74, halfWidth: 0.84, bottom: 0.2, top: 0.78, corner: 0.44 },
  { z: -2.0, halfWidth: 0.74, bottom: 0.3, top: 0.72, corner: 0.55 }, // tail
];

/**
 * The greenhouse: a second, smaller loft that sits ON the first one.
 *
 * Every section's `bottom` is buried below the body's upper surface at the same
 * z — checked, not eyeballed — so the two shells overlap rather than meeting.
 * Coplanar faces are what z-fighting is made of, and glass against paint is the
 * pairing where it shows worst.
 *
 * It tapers to almost nothing by the last station: that's the fastback, the
 * roofline running down into the rear deck instead of stopping at a rear
 * window. Rounder than the body throughout (`corner` never drops below 0.65),
 * because a canopy with hard edges reads as a greenhouse on a saloon.
 */
const CANOPY_STATIONS: Station[] = [
  { z: 0.62, halfWidth: 0.55, bottom: 0.56, top: 0.66, corner: 0.85 },
  { z: 0.28, halfWidth: 0.64, bottom: 0.58, top: 0.9, corner: 0.8 },
  { z: -0.1, halfWidth: 0.69, bottom: 0.6, top: 1.04, corner: 0.7 },
  { z: -0.5, halfWidth: 0.7, bottom: 0.62, top: 1.06, corner: 0.65 }, // roof
  { z: -0.95, halfWidth: 0.66, bottom: 0.64, top: 1.0, corner: 0.68 },
  { z: -1.35, halfWidth: 0.54, bottom: 0.66, top: 0.88, corner: 0.78 },
  { z: -1.62, halfWidth: 0.38, bottom: 0.68, top: 0.8, corner: 0.88 },
];

/** Roof height. Read off the tallest canopy station rather than written down
 *  twice, so the mirrors and the wing can be placed against the real roofline. */
export const CAR_ROOF_Y = Math.max(...CANOPY_STATIONS.map((s) => s.top));

/** One point on a station's outline, at angle `t` around it.
 *
 *  The `sign * |v| ** corner` pair is the superellipse: at corner = 1 it is just
 *  cos/sin and you get an ellipse, and as corner falls the value is pushed
 *  toward ±1 across most of the sweep, which flattens the sides and pinches the
 *  turns into corners. */
function outline(s: Station, t: number): [number, number] {
  const c = Math.cos(t);
  const n = Math.sin(t);
  const midY = (s.top + s.bottom) / 2;
  const halfHeight = (s.top - s.bottom) / 2;
  return [
    s.halfWidth * Math.sign(c) * Math.abs(c) ** s.corner,
    midY + halfHeight * Math.sign(n) * Math.abs(n) ** s.corner,
  ];
}

/**
 * Skins a run of stations into a closed shell.
 *
 * Rings are joined with quads and both ends are capped with a fan. The nose cap
 * shares the first ring's vertices so `computeVertexNormals` averages across the
 * seam and the tip comes out rounded; the tail cap gets its OWN copies of the
 * last ring, which leaves the normals free to disagree there and cuts the back
 * of the car off square. That one difference is the whole reason the rear looks
 * chopped and the front looks moulded.
 *
 * Winding is (a, d, b) / (b, d, c) with `d` on the ring BEHIND `a` — the order
 * that puts the face normals outward given rings ordered nose-first and angles
 * running counterclockwise seen from the front. Get it backwards and the car
 * turns inside out: back-face culling hides the near side and you look straight
 * through it at the far one.
 */
function loft(stations: Station[], segments: number): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (const s of stations) {
    for (let k = 0; k < segments; k++) {
      const [x, y] = outline(s, (k / segments) * Math.PI * 2);
      positions.push(x, y, s.z);
    }
  }

  for (let i = 0; i < stations.length - 1; i++) {
    const ring = i * segments;
    const next = (i + 1) * segments;
    for (let k = 0; k < segments; k++) {
      const k2 = (k + 1) % segments;
      const a = ring + k;
      const b = ring + k2;
      const c = next + k2;
      const d = next + k;
      indices.push(a, d, b, b, d, c);
    }
  }

  // Nose cap: a fan onto the first ring's own vertices, so the tip rounds off.
  const nose = stations[0];
  const noseHub = positions.length / 3;
  positions.push(0, (nose.top + nose.bottom) / 2, nose.z);
  for (let k = 0; k < segments; k++) {
    indices.push(noseHub, k, (k + 1) % segments);
  }

  // Tail cap: duplicated vertices, so the crease between the flank and the rear
  // panel survives normal averaging and stays a hard edge.
  const tail = stations[stations.length - 1];
  const tailRing = positions.length / 3;
  for (let k = 0; k < segments; k++) {
    const [x, y] = outline(tail, (k / segments) * Math.PI * 2);
    positions.push(x, y, tail.z);
  }
  const tailHub = positions.length / 3;
  positions.push(0, (tail.top + tail.bottom) / 2, tail.z);
  for (let k = 0; k < segments; k++) {
    indices.push(tailHub, tailRing + ((k + 1) % segments), tailRing + k);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export const carBodyGeometry = loft(BODY_STATIONS, 32);
export const carCanopyGeometry = loft(CANOPY_STATIONS, 26);

/* ---------------------------------------------------------------------------
 * Reading the surface back
 *
 * Trim has to sit ON the paint. A straight box laid across a curved panel
 * either floats off it at the ends or sinks into it in the middle, and there is
 * no constant offset that fixes both. So instead of guessing coordinates for
 * every vent and light strip, the component asks these two functions where the
 * surface actually is and puts the part there.
 *
 * Both invert the same superellipse. From x / halfWidth = |cos t| ** corner and
 * the matching y, cos² + sin² = 1 gives
 *
 *     (x / halfWidth) ** (2 / corner) + (yn) ** (2 / corner) = 1
 *
 * which solves for either coordinate given the other.
 * ------------------------------------------------------------------------ */

/** The station at any z, interpolated between the two it falls between. The
 *  loft's skin is straight between rings, so this is very slightly inside the
 *  real surface mid-span — by thousandths, which is the right direction to be
 *  wrong in: trim that sinks a hair is invisible, trim that floats is not. */
function stationAt(z: number): Station {
  const first = BODY_STATIONS[0];
  if (z >= first.z) return first;

  for (let i = 0; i < BODY_STATIONS.length - 1; i++) {
    const a = BODY_STATIONS[i];
    const b = BODY_STATIONS[i + 1];
    if (z > b.z) {
      const t = (a.z - z) / (a.z - b.z);
      const mix = (from: number, to: number) => from + (to - from) * t;
      return {
        z,
        halfWidth: mix(a.halfWidth, b.halfWidth),
        bottom: mix(a.bottom, b.bottom),
        top: mix(a.top, b.top),
        corner: mix(a.corner, b.corner),
      };
    }
  }

  return BODY_STATIONS[BODY_STATIONS.length - 1];
}

/** Solves the superellipse for the far coordinate given the near one, both
 *  normalised to 0..1. Clamped at both ends because callers ask about points
 *  past the edge of the section and should get the edge, not a NaN. */
function superellipse(near: number, corner: number): number {
  const u = Math.min(1, Math.abs(near));
  return Math.max(0, 1 - u ** (2 / corner)) ** (corner / 2);
}

/** Height of the body's upper surface directly above (x, z). Use it to lay
 *  bonnet vents and light bars flat onto a panel that is curved in both axes. */
export function bodySurfaceY(z: number, x: number): number {
  const s = stationAt(z);
  const midY = (s.top + s.bottom) / 2;
  return midY + ((s.top - s.bottom) / 2) * superellipse(x / s.halfWidth, s.corner);
}

/** How far out the flank stands at (z, y) — always positive; mirror it yourself
 *  for the left side. Use it to sit intakes, skirts and side blades against the
 *  door rather than a guessed distance from the centreline. */
export function bodyFlankX(z: number, y: number): number {
  const s = stationAt(z);
  const midY = (s.top + s.bottom) / 2;
  const halfHeight = (s.top - s.bottom) / 2;
  return s.halfWidth * superellipse((y - midY) / halfHeight, s.corner);
}

/* ---------------------------------------------------------------------------
 * Parts
 *
 * Everything below is bolted on rather than lofted: wheels, arches, the wing.
 * They want hard machined edges, which is exactly what the primitives give for
 * free — and the contrast against the moulded shell is what stops the car
 * reading as one soft blob.
 * ------------------------------------------------------------------------ */

/** Concatenates geometries into one, so a part built from a dozen primitives
 *  still costs a single draw call. Everything is de-indexed first, which makes
 *  this a straight buffer append with no index rebasing to get wrong — the
 *  parts here are a few hundred triangles, so the duplicated vertices are
 *  cheaper than the arithmetic would be to maintain. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = new BufferGeometry();

  for (const name of ["position", "normal", "uv"]) {
    const itemSize = flat[0].getAttribute(name).itemSize;
    const total = flat.reduce((n, g) => n + g.getAttribute(name).count, 0);
    const array = new Float32Array(total * itemSize);
    let offset = 0;
    for (const g of flat) {
      const attribute = g.getAttribute(name);
      array.set(attribute.array as Float32Array, offset);
      offset += attribute.count * itemSize;
    }
    merged.setAttribute(name, new BufferAttribute(array, itemSize));
  }

  return merged;
}

/** Cylinders stand on their own y axis. Every wheel part is turned a quarter
 *  turn on z here, once, so the axle lies along x and <CarWheel> can spin the
 *  whole assembly on rotation.x without carrying a correction of its own. */
function onAxle(g: BufferGeometry): BufferGeometry {
  g.rotateZ(Math.PI / 2);
  return g;
}

/**
 * The tyre: a band of tread with a flat sidewall ring at each end.
 *
 * A plain cylinder would be one mesh instead of three and look identical from
 * outside — right up until you notice the wheel has no wheel in it. A cylinder
 * is capped, and its cap is a disc of solid rubber across the whole face, which
 * sits in front of the rim, the spokes, the brake disc and the caliper and
 * hides every one of them. The rings leave the middle open, which is what makes
 * everything below this line worth building at all.
 */
export const carTyreGeometry = merge([
  new CylinderGeometry(
    WHEEL_RADIUS,
    WHEEL_RADIUS,
    TYRE_WIDTH,
    36,
    1,
    true,
  ).rotateZ(Math.PI / 2),
  // Rings face +z where they are built, so a quarter turn each way stands them
  // on the axle looking outward — one per side, hence the two signs.
  new RingGeometry(RIM_RADIUS - 0.004, WHEEL_RADIUS, 36)
    .rotateY(Math.PI / 2)
    .translate(TYRE_WIDTH / 2, 0, 0),
  new RingGeometry(RIM_RADIUS - 0.004, WHEEL_RADIUS, 36)
    .rotateY(-Math.PI / 2)
    .translate(-TYRE_WIDTH / 2, 0, 0),
]);

/**
 * Rim, lip, hub and seven spokes as one part. Seven and not eight on purpose:
 * an odd count never lines a spoke up with its opposite number, so the wheel
 * never looks momentarily symmetrical as it turns. The gaps between them are
 * what the brake caliper is seen through — so the barrel is open-ended too, for
 * the same reason the tyre is.
 *
 * `outboard` says which way is out, and the wheel is DISHED that way: the spoke
 * face sits near the outer rim rather than on the centreline, exactly as a real
 * wheel's does. That is not decoration, it is the only reason a caliper is ever
 * visible on a real car. The barrel is an opaque cylinder a third of a unit
 * long, and at any three-quarter angle its near wall covers the interior to a
 * depth of roughly (how deep the part sits) x tan(angle). A caliper behind a
 * centred spoke face is buried 0.2 deep and disappears by about 35 degrees off
 * the axle — which is every angle this car is ever seen from. Behind a dished
 * face it is buried 0.1, and stays visible.
 *
 * Two geometries rather than one mirrored at render time: a negative scale
 * inverts the winding and turns the rim inside out. This costs a few hundred
 * extra vertices, once, at module load.
 */
function buildRim(outboard: 1 | -1): BufferGeometry {
  return merge([
    new CylinderGeometry(
      RIM_RADIUS,
      RIM_RADIUS,
      TYRE_WIDTH * 0.9,
      28,
      1,
      true,
    ).rotateZ(Math.PI / 2),
    // Lip around the outer face of the barrel.
    new TorusGeometry(RIM_RADIUS - 0.012, 0.022, 8, 30)
      .rotateY(Math.PI / 2)
      .translate(outboard * TYRE_WIDTH * 0.42, 0, 0),
    new CylinderGeometry(0.062, 0.062, TYRE_WIDTH * 0.6, 14)
      .rotateZ(Math.PI / 2)
      .translate(outboard * TYRE_WIDTH * 0.18, 0, 0),
    ...Array.from({ length: 7 }, (_, i) => {
      const length = RIM_RADIUS - 0.05;
      return new BoxGeometry(0.042, length, 0.078)
        .translate(0, length / 2 + 0.05, 0)
        .rotateX((i / 7) * Math.PI * 2)
        .translate(outboard * TYRE_WIDTH * 0.3, 0, 0);
    }),
  ]);
}

/** One per side of the car, keyed by which way is outboard. */
export const carRimGeometry = {
  right: buildRim(1),
  left: buildRim(-1),
};

/** Small enough that the caliper clamped over it clearly overhangs its edge.
 *  Sized to the caliper rather than to the rim: a disc drawn out to the rim
 *  leaves the caliper with nothing to stand against, and the two read as one
 *  dark smudge behind the spokes. */
export const carBrakeDiscGeometry = onAxle(
  new CylinderGeometry(RIM_RADIUS - 0.08, RIM_RADIUS - 0.08, 0.026, 26),
);

/** The back of the wheel well, parked behind the brake disc. With the barrel
 *  and the tyre both open you can now see straight through the spokes and out
 *  the far side of the car, which is a worse problem than the one that fixed.
 *  A closed disc rather than an open face so it works whichever side it is on,
 *  and dark, because what is behind a wheel is never anything but shadow. */
export const carWheelWellGeometry = onAxle(
  new CylinderGeometry(RIM_RADIUS + 0.005, RIM_RADIUS + 0.005, 0.02, 28),
);

/**
 * The caliper: an arc of torus clamped over the edge of the disc. Built as its
 * own part because it must NOT turn with the wheel — see <CarWheel>.
 *
 * Chunky, and only just inside the rim. It is being viewed at night, through
 * the gaps between seven spokes, from outside a wheel arch — a scale-accurate
 * caliper survives none of that, and "visible through the wheels" was the brief.
 *
 * Mounted at the FRONT of the wheel, which is the half of this that isn't
 * styling. The rim barrel is an open cylinder drawn front-faces-only: from any
 * three-quarter view its NEAR wall is solid and its far wall is culled away, so
 * you see into the far half of the wheel and not the near one. The camera on
 * this car lives behind it. A caliper at the rear — where most road cars put
 * theirs — sits behind the one piece of the wheel that is never transparent,
 * and is invisible from every angle the game is actually played at.
 *
 * Its RADIUS is a squeeze between the same problem and its opposite. The wheel
 * is a well 0.3 deep and its outer lip eats into the opening by roughly (depth
 * from the lip) x tan(viewing angle), so a caliper out near the rim spends most
 * of its arc hidden behind that lip. Pull it in toward the hub to escape and
 * the spokes and the hub cover it instead. Here — just inside the rim, arcing
 * across the top of the wheel — is the band that clears both, and what shows
 * through the spokes is a red glint rather than a slab. Which is also what a
 * caliper looks like on a black car at night.
 */
export const carCaliperGeometry = new TorusGeometry(
  RIM_RADIUS - 0.05,
  0.05,
  8,
  20,
  1.6,
)
  .rotateZ(1.556)
  .rotateY(Math.PI / 2);

/** Half a ring, standing over a wheel: the arch flare. A torus arc of PI is the
 *  top half in its own xy plane, and the quarter turn on y stands that plane
 *  across the car so the arc runs front-to-back over the tyre. Scaled long in z
 *  because a wheel arch is an ellipse, not a circle. */
export const carArchGeometry = new TorusGeometry(
  WHEEL_RADIUS + 0.105,
  ARCH_TUBE,
  8,
  20,
  Math.PI,
)
  .rotateY(Math.PI / 2)
  .scale(1, 1, 1.28);

/** Where to stand the arches: the outermost bodywork on the car. */
export const ARCH_OFFSET_X = ARCH_X;

/* --- Rear wing ---------------------------------------------------------- */

/** Span between the endplates. */
export const WING_SPAN = 1.54;

/** A real aerofoil section rather than a flat plate: blunt round leading edge,
 *  long taper to a thin trailing edge. At this size nobody reads the profile,
 *  but they do read the highlight rolling along the leading edge, and a plate
 *  has no roll to it — it flashes on and off as one flat facet instead. */
const wingProfile = new Shape();
wingProfile.moveTo(0.34, 0);
wingProfile.bezierCurveTo(0.28, 0.072, 0.03, 0.076, -0.34, 0.014);
wingProfile.lineTo(-0.34, -0.012);
wingProfile.bezierCurveTo(0.03, -0.056, 0.28, -0.06, 0.34, 0);

/** Extruded along its own z and then stood up: the quarter turn on -y puts the
 *  chord on the car's z with the leading edge forward, and the span on x. */
export const carWingGeometry = new ExtrudeGeometry(wingProfile, {
  depth: WING_SPAN,
  bevelEnabled: false,
  curveSegments: 14,
})
  .translate(0, 0, -WING_SPAN / 2)
  .rotateY(-Math.PI / 2);
