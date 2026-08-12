/**
 * Dimensions and layout of the world, plus the one function that decides where
 * a car may drive.
 *
 * This module exists to break a dependency cycle. <Car> needs to know the shape
 * of the roads to detect crashes, and the roads need to know the car's turning
 * circle to size the junction. Neither can import the other, so the facts they
 * share live here and both import from this file.
 */

/** Road dimensions live here rather than only as component defaults, because
 *  the crash bounds are derived from them — if the two drifted apart the car
 *  would crash in mid-asphalt or sail off the edge unharmed. */
export const ROAD_LENGTH = 100;
export const ROAD_WIDTH = 7;

/** Start line: the +z end of the road, pulled in by half the car's length so
 *  it sits fully on the asphalt instead of straddling the edge. */
export const ROAD_START_Z = ROAD_LENGTH / 2 - 2;

/** The branch heading off to the left (-x), a little past the gate. */
export const BRANCH_Z = ROAD_START_Z - 22;
export const BRANCH_LENGTH = 44;

/** Wider than the main road on purpose. The car has no steering-angle memory —
 *  it yaws only while a key is held — so it exits a corner on a straight line
 *  rather than settling onto the centerline. A 7-wide branch demands
 *  frame-perfect counter-steering; this gives an ordinary driver room. */
export const BRANCH_WIDTH = 11;

/** Where the branch's asphalt ends, measured from the world origin. Negative
 *  because it runs in -x. The junction is the overlap with the main road. */
export const BRANCH_FAR_X = -(ROAD_WIDTH / 2 + BRANCH_LENGTH);

/** Car handling, kept here because the junction is sized from it. */
export const CAR_MAX_SPEED = 12;
export const CAR_TURN_RATE = 3.4;

/**
 * The car's turn radius, in world units.
 *
 * Steering scales with velocity (`rotation.y += steer * v / maxSpeed`), so the
 * yaw rate is CAR_TURN_RATE·v/maxSpeed while forward speed is v — the v cancels
 * and the radius is CONSTANT at maxSpeed / turnRate, whatever the speed.
 * Braking before a corner therefore does nothing; only the turn rate moves it.
 */
export const TURN_RADIUS = CAR_MAX_SPEED / CAR_TURN_RATE;

/** The junction flares wider than either road. This isn't decoration: the car
 *  sweeps a fixed TURN_RADIUS arc that a square-cornered junction cannot
 *  contain. Real junctions flare for exactly this reason.
 *
 *  It has to hold the quarter-circle AND run far enough down the branch for the
 *  car to settle onto the centerline afterwards. Measured: a car exiting the
 *  turn is still ~3 units off-center 12 units along, so an apron that stops at
 *  the arc drops it onto the verge just as the turn completes. */
export const APRON_NEAR_X = ROAD_WIDTH / 2;
export const APRON_FAR_X = -22;
export const APRON_HALF_Z = TURN_RADIUS + 6.5;

/* ---------------------------------------------------------------------------
 * The museum, closing off the far end of the branch.
 *
 * It is modelled on the world axes — facade facing +x, back wall at -x —
 * instead of being built facing +z and rotated into place. The rotation cost
 * nothing to apply but everything to undo: every number below is read by both
 * the geometry and isOnPavement, and they can only agree if neither has to
 * unwind a quarter turn first.
 * ------------------------------------------------------------------------ */

/** Paved forecourt between the end of the branch and the facade. 8 deep clears
 *  the car's turning circle (2 x TURN_RADIUS), so a driver who thinks better of
 *  it at the doors can turn around instead of reversing all the way back. */
export const FORECOURT_DEPTH = 8;

/** Half the forecourt's width. Must stay >= BRANCH_WIDTH / 2, or a car running
 *  wide down the branch would drive off the plaza the instant it arrived. */
export const FORECOURT_HALF_Z = 7;

/** Outer face of the front wall — where the forecourt stops. */
export const MUSEUM_FRONT_X = BRANCH_FAR_X - FORECOURT_DEPTH;

/** Footprint, measured across the OUTER faces of the walls. Deliberately
 *  shallow: the scene's fog is fully opaque by 40 units and starts biting at 8,
 *  so a deep hall would dissolve its own back wall into the background. */
export const MUSEUM_DEPTH = 14;
export const MUSEUM_HALF_WIDTH = 10;
export const MUSEUM_CENTER_X = MUSEUM_FRONT_X - MUSEUM_DEPTH / 2;
export const MUSEUM_CENTER_Z = BRANCH_Z;

/** Wall thickness, and floor-to-ceiling height of the hall. */
export const MUSEUM_WALL = 0.7;
export const MUSEUM_HEIGHT = 7;

/** The doorway, centered on the facade. 3.2 leaves a 4.6-wide lane once the
 *  car's own width is taken off — aimable while still rolling. Anything
 *  tighter turns arriving at the museum into a parking exercise. */
export const MUSEUM_DOOR_HALF_WIDTH = 3.2;
export const MUSEUM_DOOR_HEIGHT = 4.6;

/** Exhibits stand on a raised plinth down each side wall. The plinth is what
 *  keeps them out of the car's way without inventing a collision system: the
 *  drivable floor simply stops where the plinth starts, so what you can drive
 *  on stays exactly what you can see. */
export const MUSEUM_PLINTH_DEPTH = 2;
export const MUSEUM_PLINTH_HEIGHT = 0.45;

/** The drivable hall: inside the walls, between the plinths. Centered on the
 *  museum, so only half-extents are needed. */
export const HALL_HALF_DEPTH = MUSEUM_DEPTH / 2 - MUSEUM_WALL;
export const HALL_HALF_Z =
  MUSEUM_HALF_WIDTH - MUSEUM_WALL - MUSEUM_PLINTH_DEPTH;

/** Where the museum takes the camera over and brings its lights up.
 *
 *  Two thresholds rather than one: with a single line, a car idling on it would
 *  flip the flag frame to frame and the camera would jitter between two seats
 *  several units apart. Entering triggers out at the road's end, a full
 *  forecourt before the doors, which is also the run-up the camera needs to
 *  finish easing into its indoor seat before the wall arrives. */
export const MUSEUM_GROUNDS_ENTER_X = BRANCH_FAR_X;
export const MUSEUM_GROUNDS_EXIT_X = BRANCH_FAR_X + 2.5;

/** Height of the road surface — where cars stand. The slab is 0.2 thick and
 *  centered at y = -1.5, so its top face is here. The forecourt and the museum
 *  floor are laid at the same height, so driving inside needs no ramp and the
 *  car never changes its y. */
export const ROAD_SURFACE_Y = -1.4;

/**
 * Is this point on asphalt? The drivable area is the UNION of the two roads,
 * the junction apron and the museum, which is what lets the car cut the corner
 * and drive through the doors — a per-surface test would crash it the instant
 * it left the main strip.
 *
 * `margin` is how far the car's edge sticks out from the point being tested.
 *
 * Where `margin` is applied is the whole game here. It belongs on an edge the
 * car can fall off, and must be left off an edge that hands over to the next
 * surface — subtracting it on both sides of a seam opens a margin-wide band of
 * crash between two surfaces that visibly touch.
 */
export function isOnPavement(x: number, z: number, margin: number): boolean {
  const onMain =
    Math.abs(x) + margin <= ROAD_WIDTH / 2 && Math.abs(z) <= ROAD_LENGTH / 2;

  // Along the branch the car travels in x, so the roles swap: z is now the
  // lateral axis that needs the margin, and x is the one that runs out.
  const onBranch =
    Math.abs(z - BRANCH_Z) + margin <= BRANCH_WIDTH / 2 &&
    x <= ROAD_WIDTH / 2 &&
    x >= BRANCH_FAR_X;

  // The flared junction, wide enough to actually swing the turn through.
  const onApron =
    x <= APRON_NEAR_X &&
    x >= APRON_FAR_X &&
    Math.abs(z - BRANCH_Z) + margin <= APRON_HALF_Z;

  // The museum forecourt. Margin on z only: both of its x edges hand over to
  // something else — the branch at one end, the doorway at the other.
  const onForecourt =
    x <= BRANCH_FAR_X &&
    x >= MUSEUM_FRONT_X &&
    Math.abs(z - MUSEUM_CENTER_Z) + margin <= FORECOURT_HALF_Z;

  // The doorway. This is the only break in the facade, so arriving off-center
  // means driving into the wall — which is exactly what should happen.
  //
  // It reaches a car's width PAST the inner face of the wall so that it covers
  // the hall's own margin. Stopping it at the wall would leave the threshold
  // uncovered by either rule.
  const inDoorway =
    x <= MUSEUM_FRONT_X &&
    x >= MUSEUM_CENTER_X + HALL_HALF_DEPTH - margin &&
    Math.abs(z - MUSEUM_CENTER_Z) + margin <= MUSEUM_DOOR_HALF_WIDTH;

  // The hall floor. A room, not a corridor: there is no travel axis in here, so
  // the car can end up broadside to any of its edges and the margin applies on
  // both. The +x edge is shared with the doorway above, which already extends
  // far enough inside to cover the seam.
  const inHall =
    Math.abs(x - MUSEUM_CENTER_X) + margin <= HALL_HALF_DEPTH &&
    Math.abs(z - MUSEUM_CENTER_Z) + margin <= HALL_HALF_Z;

  return onMain || onBranch || onApron || onForecourt || inDoorway || inHall;
}
