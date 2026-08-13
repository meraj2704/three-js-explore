import { Tree } from "./Tree";
import {
  APRON_FAR_X,
  APRON_HALF_Z,
  BRANCH_FAR_X,
  BRANCH_WIDTH,
  BRANCH_Z,
  FORECOURT_HALF_Z,
  MUSEUM_DEPTH,
  MUSEUM_FRONT_X,
  MUSEUM_WING_PROJECTION,
  RIGHT_APRON_FAR_X,
  RIGHT_BRANCH_FAR_X,
  RIGHT_BRANCH_Z,
  RIGHT_MUSEUM_FRONT_X,
  ROAD_LENGTH,
  ROAD_SURFACE_Y,
  ROAD_WIDTH,
} from "./worldGeometry";

/** How far the ground sits below the road surface. Small on purpose: it only has
 *  to be enough for the asphalt to read as laid ON something rather than
 *  floating in it, and every unit of it is a unit the kerb has to reach down to
 *  cover. 0.02 clear of the road slab's underside (the slab is 0.2 thick), so no
 *  two faces in the whole scene end up coplanar here. */
const GROUND_DROP = 0.22;
const GROUND_Y = ROAD_SURFACE_Y - GROUND_DROP;

/** How far the ground runs past the furthest thing standing on it. This only has
 *  to beat the fog, which is opaque 40 units out — see <SceneFog> — so ground
 *  further than that from any drivable point is never seen. The plane is two
 *  triangles whatever its size, so generous is free. */
const GROUND_MARGIN = 60;
const GROUND_HALF_X = RIGHT_MUSEUM_FRONT_X + MUSEUM_DEPTH + GROUND_MARGIN;
const GROUND_HALF_Z = ROAD_LENGTH / 2 + GROUND_MARGIN;

/** Darker than the asphalt, and much darker than it wants to be.
 *
 *  A plausible verge colour reads lighter than #3f3f46 under these lights, and
 *  the moment the ground out-values the road, the road stops being the thing you
 *  are looking at and the middle distance turns into a lit empty field with a
 *  visible fog band across it. Near-black keeps the lamps as the only source of
 *  brightness — which is the whole night look. */
const GROUND_COLOR = "#101418";

/** The kerb. WIDTH is not a styling choice: it is the width of the strip that
 *  has to carry everything standing off the asphalt, and those are what set it.
 *  The main road's lamps stand 0.4 out, the branch and forecourt lamps 0.4 and
 *  0.6, and the gate's pillar bases reach 1.5 out from the kerb line — the
 *  widest of them, so the gate is what 1.6 is measured from. Narrow it and the
 *  gate's feet hang over a hole in the ground.
 *
 *  RISE is the lip above the asphalt: enough to catch lamplight along its top
 *  edge and mark where the drivable surface stops, low enough not to read as a
 *  wall in a scene whose camera sits two metres up. */
const KERB_WIDTH = 1.6;
const KERB_RISE = 0.2;

const KERB_TOP_Y = ROAD_SURFACE_Y + KERB_RISE;
/** Sunk 0.1 into the ground rather than sat exactly on it, so the kerb's
 *  underside and the ground's top face can't fight over the same plane. */
const KERB_HEIGHT = KERB_TOP_Y - (GROUND_Y - 0.1);
const KERB_CENTER_Y = KERB_TOP_Y - KERB_HEIGHT / 2;

/** Pale concrete: light enough to separate from both the asphalt below it and
 *  the ground beyond it, dull enough not to glow when a lamp passes over. */
const KERB_COLOR = "#5f636c";

/** One kerb run, as its two opposite corners in plan.
 *
 *  Corners rather than centre + size because every run below is derived from the
 *  two edges it sits between, and either corner may be the greater one — the
 *  right-hand branch group is the left one mirrored, so its x runs the other way. */
type KerbRun = { x: [number, number]; z: [number, number] };

/** Which way a branch leaves the main road: -1 for the Mahfuz Islam museum's, +1
 *  for the Meraj museum's. Everything about a branch group can be picked with
 *  it, which is what lets one function below describe both. */
type Side = -1 | 1;

/** The four placements that differ between the two branch groups. Every other
 *  number in `kerbRuns` is shared, which is the point: the two sides can only
 *  differ where this picks, so a kerb can't drift away from the asphalt it
 *  edges. */
const branchGroup = (side: Side) =>
  side < 0
    ? {
        centerZ: BRANCH_Z,
        apronFarX: APRON_FAR_X,
        branchFarX: BRANCH_FAR_X,
        museumFrontX: MUSEUM_FRONT_X,
      }
    : {
        centerZ: RIGHT_BRANCH_Z,
        apronFarX: RIGHT_APRON_FAR_X,
        branchFarX: RIGHT_BRANCH_FAR_X,
        museumFrontX: RIGHT_MUSEUM_FRONT_X,
      };

/**
 * Every kerb run on one side of the world, walked from the main road out to a
 * museum's forecourt.
 *
 * The rule they all follow: a kerb's INNER face sits exactly on a drivable edge
 * — the same numbers isOnPavement tests — and it grows outward from there. That
 * is what makes the kerb honest rather than decorative. The car's flank is
 * already stopped on that line, so the lip you can see is the wall you can feel,
 * and isOnPavement needs no changes at all.
 *
 * The runs are laid end to end, never overlapping: two boxes of the same height
 * that overlap share a top face, and coplanar faces z-fight. Where two runs meet
 * they butt, which is fine — the shared faces point away from each other.
 */
function kerbRuns(side: Side): KerbRun[] {
  const g = branchGroup(side);

  /** x of the main road's kerb, inner face on the asphalt edge. */
  const roadKerbX: [number, number] = [
    side * (ROAD_WIDTH / 2),
    side * (ROAD_WIDTH / 2 + KERB_WIDTH),
  ];

  /** Where the apron's kerb starts and the branch's begins, one kerb-width past
   *  the apron's far edge — the gap between them is the step face, below. */
  const stepX = g.apronFarX + side * KERB_WIDTH;

  return [
    /* The main road, in two segments with the junction mouth left open between
       them. Kerbing across the mouth would wall off the turn — and it is a real
       wall, not just a look: the apron is drivable right up to this line, so a
       driver swinging in would be stopped by something that isn't there on the
       far side of the junction. Only THIS side opens; the junction on the
       opposite kerb of the road is the other branch's, and this one runs
       straight past it. */
    { x: roadKerbX, z: [-ROAD_LENGTH / 2, g.centerZ - APRON_HALF_Z] },
    { x: roadKerbX, z: [g.centerZ + APRON_HALF_Z, ROAD_LENGTH / 2] },

    /* The rest comes in pairs, one per side of the branch's centerline. */
    ...([-1, 1] as const).flatMap((zSide): KerbRun[] => {
      const edge = (offset: number) => g.centerZ + zSide * offset;

      return [
        /* Along the flared junction, from the main road's kerb out to where the
           flare ends. It stops at the main kerb's OUTER edge rather than the
           asphalt, because the main run already covers that corner. */
        {
          x: [side * (ROAD_WIDTH / 2 + KERB_WIDTH), g.apronFarX],
          z: [edge(APRON_HALF_Z), edge(APRON_HALF_Z + KERB_WIDTH)],
        },

        /* The step, where the flare drops back to branch width. This edge faces
           along x rather than z — it is the one bit of the junction that is a
           wall across the direction of travel — and without it the corner
           between the apron kerb and the branch kerb is an open hole. */
        {
          x: [g.apronFarX, stepX],
          z: [edge(BRANCH_WIDTH / 2), edge(APRON_HALF_Z + KERB_WIDTH)],
        },

        /* Down the branch to the end of its asphalt. */
        {
          x: [stepX, g.branchFarX],
          z: [edge(BRANCH_WIDTH / 2), edge(BRANCH_WIDTH / 2 + KERB_WIDTH)],
        },

        /* Up the museum forecourt, which is wider than the branch — so this
           picks up where the branch kerb left off and steps out with it.
           It stops at the entrance wings rather than at the facade: they project
           into the forecourt from exactly this edge, and a kerb run further
           would be buried inside one with its inner face on the same plane.

           "Exactly this edge" is an assumption worth naming: <Museum> seats its
           wings at its own `forecourtHalfZ`, which is the FORECOURT_HALF_Z read
           here only because both museums take it from the default geometry. A
           museum given a forecourt of its own width would move its wings without
           moving this kerb, and the two faces would meet again. */
        {
          x: [g.branchFarX, g.museumFrontX - side * MUSEUM_WING_PROJECTION],
          z: [edge(FORECOURT_HALF_Z), edge(FORECOURT_HALF_Z + KERB_WIDTH)],
        },
      ];
    }),
  ];
}

const KERB_RUNS: KerbRun[] = [...kerbRuns(-1), ...kerbRuns(1)];

/* ---------------------------------------------------------------------------
 * The verge: low scrub on the ground beyond the kerb.
 *
 * The kerb finishes the road, but a finished road with nothing past it still
 * reads as a strip laid on a table. These are what give the darkness something
 * in it — a few shapes catching the edge of a lamp's pool as you pass, which is
 * all it takes for the black beyond to read as land rather than as nothing.
 * ------------------------------------------------------------------------ */

/** Along the verge, and out from the kerb's outer face. The stride is a stranger
 *  to LAMP_SPACING's 7 on purpose: land on a multiple of it and every bush sits
 *  in the same place in every pool of light, which is when a scatter starts
 *  reading as a fence. */
const BUSH_STRIDE = 9;
const BUSH_OFFSET = 1.2;

/** Clearance kept from a junction mouth, past the flare itself. Inside this the
 *  verge line is apron — asphalt you can drive on — so a bush there would be
 *  standing in the road. */
const BUSH_CLEAR = 2;

/** Nothing here is tall. The chase camera swings freely around the car when the
 *  canvas is dragged, and it sits about 2 up: anything roadside with real height
 *  would sweep through frame every time you looked sideways. Scrub stays under
 *  the sightline, which is also what it does in life. */
const BUSH_RADIUS = 1.05;
const BUSH_SQUASH = 0.55;

/** Cold and almost black, like everything else out here. It only ever shows the
 *  face a lamp is on, which is the whole intent. */
const BUSH_COLOR = "#25302a";

/** A deterministic 0..1 from an integer — the fract(sin(n)) hash, borrowed from
 *  shaders. Not Math.random: this list is built once at module scope and has to
 *  come out identical on every load, or a refresh would rearrange the roadside. */
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

type Bush = {
  position: [number, number, number];
  radius: number;
  spin: number;
};

/** One clump, sunk far enough into the ground that its underside never shows. */
function bush(x: number, z: number, seed: number): Bush {
  // Two thirds to full size, so a row of them doesn't read as one shape
  // stamped down the verge.
  const radius = BUSH_RADIUS * (0.65 + 0.35 * hash(seed));
  return {
    position: [x, GROUND_Y + radius * BUSH_SQUASH * 0.8, z],
    radius,
    spin: hash(seed + 101) * Math.PI * 2,
  };
}

/** Scrub down one side of the world: the main road's verge, then both verges of
 *  the branch that leaves from it. Everything is stepped from the same edges the
 *  kerb was, one bush-width further out, so the scatter can't drift onto asphalt
 *  if a road is ever resized. */
function vergeBushes(side: Side): Bush[] {
  const g = branchGroup(side);
  const out: Bush[] = [];

  /** How far out from a kerb's outer face a clump stands, wobbled per index so
   *  the line of them isn't ruler-straight. */
  const stand = (seed: number) => BUSH_OFFSET + hash(seed + 17) * 1.3;

  // Main road, stepping along z.
  for (let i = 0; i < Math.floor(ROAD_LENGTH / BUSH_STRIDE); i++) {
    const z = -ROAD_LENGTH / 2 + BUSH_STRIDE * (i + 0.5);
    // The junction mouth, where this side's verge is apron instead of ground.
    if (Math.abs(z - g.centerZ) < APRON_HALF_Z + BUSH_CLEAR) continue;

    const seed = i + (side < 0 ? 0 : 500);
    out.push(
      bush(side * (ROAD_WIDTH / 2 + KERB_WIDTH + stand(seed)), z, seed),
    );
  }

  // The branch, stepping along x — the axes swap, as they do for its lamps.
  // Starts clear of the flare's own kerb and stops at the forecourt, which is
  // wider than the branch and has its own kerb standing where these would.
  const from = Math.abs(g.apronFarX) + KERB_WIDTH + BUSH_CLEAR;
  const to = Math.abs(g.branchFarX);
  // max(0) rather than trusting the subtraction: a branch shorter than its own
  // junction flare would make this negative, and a negative count is a silently
  // empty verge rather than an error anyone would notice.
  const count = Math.max(0, Math.floor((to - from) / BUSH_STRIDE));
  for (let i = 0; i < count; i++) {
    const x = side * (from + BUSH_STRIDE * (i + 0.5));

    for (const zSide of [-1, 1] as const) {
      const seed = i * 7 + (zSide + 2) * 60 + (side < 0 ? 0 : 900);
      out.push(
        bush(
          x,
          g.centerZ + zSide * (BRANCH_WIDTH / 2 + KERB_WIDTH + stand(seed)),
          seed,
        ),
      );
    }
  }

  return out;
}

const VERGE_BUSHES: Bush[] = [...vergeBushes(-1), ...vergeBushes(1)];

/* ---------------------------------------------------------------------------
 * The treeline, standing back behind the scrub.
 * ------------------------------------------------------------------------ */

/** How far back a tree stands, measured from a road's CENTERLINE rather than its
 *  kerb — because what sets this is the camera, not the road.
 *
 *  The chase camera orbits the car on a 7-unit arm and the drag swings it all the
 *  way round, so on the main road the seat can reach about 9.5 out from the
 *  centerline, and on a branch — which is wider, and which a car can sit further
 *  off the middle of — about 11.5. A tree inside that sweeps through frame every
 *  time you look sideways, and worse, the camera ends up inside a cone. These
 *  clear both, with the crown's own radius still to spare.
 *
 *  The scrub can be close precisely because it is low: nothing that stands up has
 *  any business near the road. */
const TREE_SETBACK = 13;
const TREE_BRANCH_SETBACK = 15;

/** Along the verge. Wider than the scrub's stride and a stranger to it, so the
 *  two rows don't pair up into repeating clumps. */
const TREE_STRIDE = 15;
const TREE_BRANCH_STRIDE = 10;

/** Kept clear of a junction flare, past the flare itself: at these setbacks a
 *  tree beside a mouth would be standing on the apron. */
const TREE_CLEAR = 3;

/** The size a tree comes out at before its own variation is applied. */
const TREE_HEIGHT = 6.4;

type TreeStand = {
  position: [number, number, number];
  height: number;
  tiers: number;
  spin: number;
};

/** One tree, varied from its seed. Height carries most of it — a row of equal
 *  trees is a fence whatever you do to the crowns — and the fourth tier only
 *  turns up on some of them, which is what keeps the taller ones from reading as
 *  the same tree scaled up. */
function tree(x: number, z: number, seed: number): TreeStand {
  return {
    // Sunk a little, so the trunk's bottom cap is never coplanar with the ground.
    position: [x, GROUND_Y - 0.08, z],
    height: TREE_HEIGHT * (0.8 + 0.45 * hash(seed)),
    tiers: hash(seed + 41) > 0.6 ? 4 : 3,
    spin: hash(seed + 211) * Math.PI * 2,
  };
}

/** The treeline down one side of the world, walked the same way the scrub was:
 *  along the main road, then along both verges of the branch that leaves from
 *  it. Same skips, for the same reason — the mouth of a junction is asphalt. */
function treeStands(side: Side): TreeStand[] {
  const g = branchGroup(side);
  const out: TreeStand[] = [];

  /** Jitter on the setback, so the row is a verge rather than an avenue. */
  const back = (seed: number) => hash(seed + 29) * 3.5;

  for (let i = 0; i < Math.floor(ROAD_LENGTH / TREE_STRIDE); i++) {
    const z = -ROAD_LENGTH / 2 + TREE_STRIDE * (i + 0.5);
    if (Math.abs(z - g.centerZ) < APRON_HALF_Z + TREE_CLEAR) continue;

    const seed = i * 3 + (side < 0 ? 0 : 300);
    out.push(tree(side * (TREE_SETBACK + back(seed)), z, seed));
  }

  const from = Math.abs(g.apronFarX) + TREE_CLEAR;
  const to = Math.abs(g.branchFarX);
  const count = Math.max(0, Math.floor((to - from) / TREE_BRANCH_STRIDE));
  for (let i = 0; i < count; i++) {
    const x = side * (from + TREE_BRANCH_STRIDE * (i + 0.5));

    for (const zSide of [-1, 1] as const) {
      const seed = i * 11 + (zSide + 2) * 130 + (side < 0 ? 0 : 700);
      out.push(
        tree(x, g.centerZ + zSide * (TREE_BRANCH_SETBACK + back(seed)), seed),
      );
    }
  }

  return out;
}

const TREE_STANDS: TreeStand[] = [...treeStands(-1), ...treeStands(1)];

/** One run, as a box. Absolute extents, and the midpoint of the two corners:
 *  either may be the greater, and a negative box dimension renders as nothing —
 *  the same trap <JunctionApron> sidesteps for the same reason. */
function Kerb({ x, z }: KerbRun) {
  return (
    <mesh
      position={[(x[0] + x[1]) / 2, KERB_CENTER_Y, (z[0] + z[1]) / 2]}
      receiveShadow
    >
      <boxGeometry
        args={[Math.abs(x[1] - x[0]), KERB_HEIGHT, Math.abs(z[1] - z[0])]}
      />
      <meshStandardMaterial color={KERB_COLOR} roughness={0.9} />
    </mesh>
  );
}

/**
 * The ground the whole world stands on, and the kerb that finishes every edge of
 * the asphalt against it.
 *
 * Without this the roads float in the void: the far end of one dissolves into
 * fog, which is intended, but its SIDES stop dead a few metres from the car,
 * which reads as the road running out rather than the night closing in.
 *
 * One ground plane, not a verge strip per road. The strips would have to overlap
 * wherever two roads pass near each other, and two coplanar surfaces at the same
 * height is precisely the case the depth buffer cannot resolve.
 *
 * Nothing here is lit on its own account and nothing casts a shadow — the ground
 * is a single plane and the kerbs are boxes with one material each, so the whole
 * roadside costs the frame nothing measurable. That is deliberate: this
 * scene's budget is spent on the lamps, and a pointLight here would cost more
 * than every box below put together.
 */
export function Roadside() {
  return (
    <group>
      {/* The ground. A plane, so it is two triangles: nothing ever gets under it
          to see it edge-on, and the museums' foundations run deeper than it
          does, so they punch through rather than perch on it. */}
      <mesh
        position={[0, GROUND_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[GROUND_HALF_X * 2, GROUND_HALF_Z * 2]} />
        <meshStandardMaterial color={GROUND_COLOR} roughness={1} />
      </mesh>

      {KERB_RUNS.map((run) => (
        <Kerb key={`${run.x[0]},${run.x[1]},${run.z[0]},${run.z[1]}`} {...run} />
      ))}

      {/* Scrub along the verge. An icosahedron at detail 0 is twenty triangles,
          flat-shaded so those twenty faces are the look rather than something to
          be smoothed away — and squashed on y, because a sphere on the ground
          reads as a ball and a squashed one reads as a bush.

          No shadows, cast or received: the directional light's shadow camera
          only covers 12 units either side of the origin, so all but a couple of
          these would pay for a map they never appear in. */}
      {VERGE_BUSHES.map(({ position, radius, spin }) => (
        <mesh
          key={`${position[0]},${position[2]}`}
          position={position}
          rotation={[0, spin, 0]}
          scale={[1, BUSH_SQUASH, 1]}
        >
          <icosahedronGeometry args={[radius, 0]} />
          <meshStandardMaterial color={BUSH_COLOR} roughness={1} flatShading />
        </mesh>
      ))}

      {/* The treeline. <Tree> owns what a tree looks like; all this decides is
          where they stand and how each one differs — which is the split that
          lets the same component be planted anywhere else later. */}
      {TREE_STANDS.map(({ position, height, tiers, spin }) => (
        <Tree
          key={`${position[0]},${position[2]}`}
          position={position}
          rotation={[0, spin, 0]}
          height={height}
          tiers={tiers}
        />
      ))}
    </group>
  );
}
