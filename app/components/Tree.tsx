import type { ColorRepresentation } from "three";

type TreeProps = {
  /** World-space [x, y, z] of the trunk's FOOT, not its middle. Everything below
   *  is built upward from y = 0 in local space, so a tree drops onto a surface by
   *  being given that surface's height and nothing else. */
  position?: [number, number, number];
  /** Yaw in radians. Two trees of the same size are the same twenty triangles;
   *  turning them is what stops a row of them reading as one shape stamped out. */
  rotation?: [number, number, number];
  /** Foot to tip. The ONE dimension worth setting: trunk, tiers, taper and
   *  radius are all fractions of it, so a tree stays a tree at any size. */
  height?: number;
  /** Width of the lowest tier, as a fraction of height. Around a half is what
   *  reads as a conifer; much wider becomes a bush and much narrower a spike. */
  spread?: number;
  /** How many cones make the crown. Three is a tree; four is a taller, denser
   *  one — and one is a sapling, which is why the maths below has to survive it. */
  tiers?: number;
  foliage?: ColorRepresentation;
  bark?: ColorRepresentation;
  /** Cast a real shadow. Off by default, and deliberately: the scene's
   *  directional light only covers 12 units either side of the origin, so a tree
   *  on a verge would pay for a shadow map it never appears in. */
  castShadow?: boolean;
};

/** The proportions that make it a tree rather than a stack of cones, all as
 *  fractions of height so they hold at every size.
 *
 *  OVERLAP is the one that matters most: the crown starts PART WAY DOWN the
 *  trunk rather than on top of it. Sat exactly on the trunk's top the two read as
 *  two objects touching, and any gap at all reads as a cone hovering over a
 *  stick. Sinking the first tier into the trunk is what welds them together. */
const TRUNK_HEIGHT = 0.26;
const TRUNK_RADIUS = 0.035;
const CROWN_OVERLAP = 0.7;

/** Each tier's own height, as a fraction of the crown, and how much narrower it
 *  is than the one below. The tiers are therefore deeply overlapped — a tier is
 *  more than half the crown but they are spread across all of it — which is what
 *  gives the silhouette its notched edge instead of three separate hats. */
const TIER_HEIGHT = 0.55;
const TIER_TAPER = 0.26;

/** Sides on every cone and on the trunk. Eight is the lowest count that still
 *  turns: at six a cone shows a flat face square-on and reads as a pyramid.
 *  Flat shading below keeps those eight faces visible rather than smoothing them
 *  into a curve — the facets ARE the look, and they are what catches a lamp. */
const RADIAL_SEGMENTS = 8;

/**
 * A low-poly conifer: a tapered trunk under a stack of cones.
 *
 * Built from one number. Pass a height and the rest follows; pass a colour pair
 * and it belongs to wherever it is standing. Nothing here is animated and
 * nothing is lit on its own account — at night it is a silhouette that a passing
 * lamp picks out one face of, which is the cheapest thing in this scene that
 * still reads as scenery.
 *
 * Its own component rather than geometry inlined into the roadside, because a
 * tree is not a roadside fact: the same one can stand in a forecourt, beside the
 * gate, or in a park later, and only the caller knows which.
 */
export function Tree({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  height = 6.4,
  spread = 0.5,
  tiers = 3,
  foliage = "#2e3b30",
  bark = "#332a22",
  castShadow = false,
}: TreeProps) {
  const trunkHeight = height * TRUNK_HEIGHT;
  const trunkRadius = height * TRUNK_RADIUS;

  // The crown: where it starts, how much of the tree is left for it, and how
  // tall one tier of it is.
  const crownBase = trunkHeight * CROWN_OVERLAP;
  const crownSpan = height - crownBase;
  const tierHeight = crownSpan * TIER_HEIGHT;

  // What is left of the crown once one tier is laid in it, shared between the
  // gaps BETWEEN tiers — so the top tier's tip always lands exactly on `height`,
  // whatever the tier count. Guarded, because a single tier has no gaps and the
  // division would be by zero.
  const tierStep = tiers > 1 ? (crownSpan - tierHeight) / (tiers - 1) : 0;

  const baseRadius = (height * spread) / 2;

  return (
    <group position={position} rotation={rotation}>
      {/* Trunk. Cylinder geometry is centered on its own origin, so lifting it by
          half its height puts its foot on the group's base — the same trick the
          lamp posts use. Narrower at the top than the bottom, which is the whole
          difference between a trunk and a length of pipe. */}
      <mesh position={[0, trunkHeight / 2, 0]} castShadow={castShadow}>
        <cylinderGeometry
          args={[trunkRadius * 0.72, trunkRadius, trunkHeight, RADIAL_SEGMENTS]}
        />
        <meshStandardMaterial color={bark} roughness={0.95} flatShading />
      </mesh>

      {/* The crown, bottom tier first. Each is turned a little further than the
          one below so their facets don't stack into unbroken vertical seams —
          the cheapest way to make eight-sided cones stop looking machined. */}
      {Array.from({ length: tiers }, (_, i) => (
        <mesh
          key={i}
          position={[0, crownBase + tierStep * i + tierHeight / 2, 0]}
          rotation={[0, i * 0.55, 0]}
          castShadow={castShadow}
        >
          <coneGeometry
            args={[
              baseRadius * (1 - TIER_TAPER * i),
              tierHeight,
              RADIAL_SEGMENTS,
            ]}
          />
          <meshStandardMaterial color={foliage} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}
