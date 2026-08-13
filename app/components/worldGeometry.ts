/**
 * Dimensions and layout of the world, plus the one function that decides where
 * a car may drive.
 *
 * This module exists to break a dependency cycle. <Car> needs to know the shape
 * of the roads to stay on them, and the roads need to know the car's turning
 * circle to size the junction. Neither can import the other, so the facts they
 * share live here and both import from this file.
 */

/** Road dimensions live here rather than only as component defaults, because
 *  the drivable bounds are derived from them — if the two drifted apart the car
 *  would stop dead in mid-asphalt or roll straight off the edge. */
export const ROAD_LENGTH = 100;
export const ROAD_WIDTH = 7;

/** Start line: the +z end of the road, pulled in by half the car's length so
 *  it sits fully on the asphalt instead of straddling the edge. */
export const ROAD_START_Z = ROAD_LENGTH / 2 - 2;

/** The branch heading off to the left (-x), a little past the gate. This is the
 *  one the museum sits at the end of, which is why it gets the unprefixed
 *  names — the right-hand branch below has to say so. */
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
 * The second branch, heading off to the right (+x).
 *
 * It borrows BRANCH_LENGTH and BRANCH_WIDTH — it's the same kind of road, and
 * the width is set by the car's turning circle, which hasn't changed — so only
 * the numbers that place it need naming here.
 * ------------------------------------------------------------------------ */

/** Where it meets the main road. Set back from the left branch rather than
 *  opposite it: two mouths facing each other would read as a crossroads, and a
 *  car swinging its fixed arc out of one would be halfway into the other before
 *  the yaw came off. Staggering them makes each turn a decision on its own. */
export const RIGHT_BRANCH_Z = BRANCH_Z - 17;

/** Where its asphalt ends. Positive, because it runs in +x. Like the left
 *  branch it hands over to a museum forecourt here rather than stopping. */
export const RIGHT_BRANCH_FAR_X = ROAD_WIDTH / 2 + BRANCH_LENGTH;

/** Its junction flare, mirrored about the main road's centerline. Same turning
 *  circle, same problem, so the same amount of run-off: from the road's far
 *  kerb out to well down the branch, where a car exiting the turn has finally
 *  settled onto the centerline. */
export const RIGHT_APRON_NEAR_X = -ROAD_WIDTH / 2;
export const RIGHT_APRON_FAR_X = 22;

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

/** Footprint, measured across the OUTER faces of the walls.
 *
 *  Sized as a gallery, not a lobby: each project on show wants a bay of its own,
 *  and the bays run down the side plinths — so DEPTH is what buys display slots.
 *  <Museum> fits one case per EXHIBIT_SPACING of inner length, per side, which
 *  at 30 is six a side. Shortening this silently deletes exhibits.
 *
 *  Depth is also the axis fog charges for: it measures from the CAMERA, so with
 *  the camera at the door every unit of depth is a unit of haze on the back
 *  wall. That is what <SceneFog> is for — the road's fog is opaque by 40, which
 *  would leave this hall a black void from the fourth case back, so the far
 *  plane eases outward while the car is on museum grounds. Deepen the hall and
 *  that indoor range has to follow it.
 *
 *  Width is cheaper: the camera looks ALONG the depth axis, so the side walls
 *  stay close to it however far apart they are. Still wider than it is deep,
 *  because width is also the shape that drives well — the room has to swallow a
 *  2 x TURN_RADIUS circle for the car to turn around in, and it is the narrow
 *  axis that decides whether it can. */
export const MUSEUM_DEPTH = 30;
export const MUSEUM_HALF_WIDTH = 18;
export const MUSEUM_CENTER_X = MUSEUM_FRONT_X - MUSEUM_DEPTH / 2;
export const MUSEUM_CENTER_Z = BRANCH_Z;

/** Wall thickness, and floor-to-ceiling height of the hall. Height is free of
 *  the collision rules — nothing is clamped against it and the chase camera
 *  never looks up — but a floor this size needs it, or the ceiling reads as a
 *  lid. It is not free of the LIGHT: the hall lamp hangs from it, and <Museum>
 *  pays for the extra drop by inverse-square. Everything vertical in <Museum> is
 *  derived from this, so it is the only place to change it. */
export const MUSEUM_WALL = 0.7;
export const MUSEUM_HEIGHT = 11;

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

/** The centrepiece portrait's footprint — the first thing in this world that
 *  stands IN the drivable floor rather than around its edge, so it is the first
 *  that has to be cut back out of it below.
 *
 *  Offset toward the door, not dead centre: the hall is nearly 29 deep, and from
 *  the threshold a portrait at the midpoint is a stamp on the far wall for most
 *  of the approach. A couple of units forward is where it starts filling frame
 *  while there is still room to swing around behind it.
 *
 *  These are the WIDEST part of the exhibit — the plinth's cap, which overhangs
 *  its body — not the frame standing on it. A collision box drawn to the frame
 *  would let the car's nose under the lip it can plainly see. */
export const PORTRAIT_OFFSET_X = 2.6;
export const PORTRAIT_HALF_DEPTH = 1.25;
export const PORTRAIT_HALF_Z = 2.35;

/** Which halls actually have one standing in them. The collision hole and the
 *  <Museum portrait> prop both read these, which is the only thing keeping an
 *  invisible block from being left behind in a hall with nothing in it — the
 *  same bargain the rest of this file makes between walls you see and walls you
 *  hit. Give the Meraj museum a portrait and this flag flips with it. */
export const MUSEUM_HAS_PORTRAIT = true;
export const RIGHT_MUSEUM_HAS_PORTRAIT = false;

/* ---------------------------------------------------------------------------
 * The second museum, closing off the right-hand branch.
 *
 * The same building, mirrored: it reuses every dimension above — depth, height,
 * door, plinths, forecourt — so only the four numbers that PLACE it are named
 * here. That reuse is the point. HALL_HALF_DEPTH and HALL_HALF_Z are shared, so
 * the two halls cannot drift into needing different collision rules.
 *
 * Mirrored means its facade looks down -x, back wall at +x — the opposite of the
 * left museum. Every x test below therefore reads the other way round, which is
 * the one thing to keep straight when editing these.
 * ------------------------------------------------------------------------ */

/** Outer face of its front wall: a forecourt out from the end of the branch. */
export const RIGHT_MUSEUM_FRONT_X = RIGHT_BRANCH_FAR_X + FORECOURT_DEPTH;

export const RIGHT_MUSEUM_CENTER_X = RIGHT_MUSEUM_FRONT_X + MUSEUM_DEPTH / 2;
export const RIGHT_MUSEUM_CENTER_Z = RIGHT_BRANCH_Z;

/** Its grounds boundary. Same hysteresis as the left museum's, mirrored: the
 *  car arrives with x INCREASING, so the exit line sits 2.5 back in -x. */
export const RIGHT_MUSEUM_GROUNDS_ENTER_X = RIGHT_BRANCH_FAR_X;
export const RIGHT_MUSEUM_GROUNDS_EXIT_X = RIGHT_BRANCH_FAR_X - 2.5;

/** Height of the road surface — where cars stand. The slab is 0.2 thick and
 *  centered at y = -1.5, so its top face is here. The forecourt and the museum
 *  floor are laid at the same height, so driving inside needs no ramp and the
 *  car never changes its y. */
export const ROAD_SURFACE_Y = -1.4;

/**
 * Is this point on asphalt? The drivable area is the UNION of the two roads,
 * the junction apron and the museum, which is what lets the car cut the corner
 * and drive through the doors — a per-surface test would block it the instant
 * it left the main strip.
 *
 * `margin` is how far the car's edge sticks out from the point being tested.
 *
 * Where `margin` is applied is the whole game here. It belongs on an edge the
 * car must be held back from, and must be left off an edge that hands over to
 * the next surface — subtracting it on both sides of a seam opens a margin-wide
 * dead band between two surfaces that visibly touch.
 */
export function isOnPavement(x: number, z: number, margin: number): boolean {
  // The portrait exhibit, as a hole in a hall floor rather than part of it.
  // `toward` is the museum's own +door direction, so one helper serves both
  // buildings the way the mirrored tests below do.
  //
  // Note the margin ADDS here where every other rule subtracts. That is not a
  // slip: the rules below fence the car IN and so shrink by its reach, while
  // this one fences it OUT and has to grow by the same amount. Subtracting it
  // here would let the bodywork overlap the plinth by a full half-width before
  // anything stopped it.
  const clearOfPortrait = (cx: number, cz: number, toward: 1 | -1) =>
    Math.abs(x - (cx + toward * PORTRAIT_OFFSET_X)) > PORTRAIT_HALF_DEPTH + margin ||
    Math.abs(z - cz) > PORTRAIT_HALF_Z + margin;

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

  // The right-hand branch, mirrored. z is lateral here too, so it takes the
  // margin; both ends are seams — the main road's far kerb at one, the second
  // museum's forecourt at the other — so neither takes it.
  const onRightBranch =
    Math.abs(z - RIGHT_BRANCH_Z) + margin <= BRANCH_WIDTH / 2 &&
    x >= -ROAD_WIDTH / 2 &&
    x <= RIGHT_BRANCH_FAR_X;

  const onRightApron =
    x >= RIGHT_APRON_NEAR_X &&
    x <= RIGHT_APRON_FAR_X &&
    Math.abs(z - RIGHT_BRANCH_Z) + margin <= APRON_HALF_Z;

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
    Math.abs(z - MUSEUM_CENTER_Z) + margin <= HALL_HALF_Z &&
    (!MUSEUM_HAS_PORTRAIT ||
      clearOfPortrait(MUSEUM_CENTER_X, MUSEUM_CENTER_Z, 1));

  // The second museum: the three tests above, mirrored about its own facade.
  // Every `<=`/`>=` on x is flipped and every `- margin` becomes `+ margin`,
  // because "further into the building" is now +x. The z tests are untouched —
  // the mirror is only along x.
  const onRightForecourt =
    x >= RIGHT_BRANCH_FAR_X &&
    x <= RIGHT_MUSEUM_FRONT_X &&
    Math.abs(z - RIGHT_MUSEUM_CENTER_Z) + margin <= FORECOURT_HALF_Z;

  const inRightDoorway =
    x >= RIGHT_MUSEUM_FRONT_X &&
    x <= RIGHT_MUSEUM_CENTER_X - HALL_HALF_DEPTH + margin &&
    Math.abs(z - RIGHT_MUSEUM_CENTER_Z) + margin <= MUSEUM_DOOR_HALF_WIDTH;

  const inRightHall =
    Math.abs(x - RIGHT_MUSEUM_CENTER_X) + margin <= HALL_HALF_DEPTH &&
    Math.abs(z - RIGHT_MUSEUM_CENTER_Z) + margin <= HALL_HALF_Z &&
    (!RIGHT_MUSEUM_HAS_PORTRAIT ||
      clearOfPortrait(RIGHT_MUSEUM_CENTER_X, RIGHT_MUSEUM_CENTER_Z, -1));

  return (
    onMain ||
    onBranch ||
    onApron ||
    onRightBranch ||
    onRightApron ||
    onForecourt ||
    inDoorway ||
    inHall ||
    onRightForecourt ||
    inRightDoorway ||
    inRightHall
  );
}
