"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { ColorRepresentation, Group, SpotLight } from "three";
import {
  CAR_MAX_SPEED,
  CAR_TURN_RATE,
  isOnPavement,
} from "./worldGeometry";
import { useDrivingControls } from "./useDrivingControls";
import { CarWheel } from "./CarWheel";
import {
  ARCH_OFFSET_X,
  bodyFlankX,
  bodySurfaceY,
  carArchGeometry,
  carBodyGeometry,
  carCanopyGeometry,
  carWingGeometry,
  CAR_HALF_WIDTH,
  WHEEL_BASE,
  WHEEL_RADIUS,
  WHEEL_TRACK,
  WING_SPAN,
} from "./carShell";
import { useCarMaterials } from "./carMaterials";
import { useCarEnvMap } from "./useCarEnvMap";

type CarProps = {
  /** Body paint. Trim, glass, wheels and lights are fixed. */
  color?: ColorRepresentation;
  /** The underbody LED wash, and the tint the headlights lean toward. */
  accent?: ColorRepresentation;
  /** Where the car's tyres touch down: [x, roadSurfaceY, z]. */
  position?: [number, number, number];
  /** Yaw in radians. 0 faces +z; Math.PI turns it around. */
  rotation?: [number, number, number];
  /** Units per second along the car's own forward axis. 0 parks it. */
  speed?: number;
  /** Let arrow keys / WASD drive this car. Only enable it on one car. */
  controllable?: boolean;
  /** Top speed under keyboard control, in units per second. */
  maxSpeed?: number;
  /** Real <spotLight> beams out of the headlights. On by default — the scene is
   *  lit for night, and a car with no beams looks switched off. Two more lights
   *  in the scene is the cost, so a second parked car should turn them off. */
  headlights?: boolean;
  /** Lets a parent (e.g. the chase camera) read this car's live transform. */
  bodyRef?: RefObject<Group | null>;
};

/** Driving feel, all in units (or radians) per second. */
const ACCELERATION = 14;
const BRAKE_STRENGTH = 22;
/** Passive slowdown when no key is held — this is what makes it coast. */
const FRICTION = 6;
/** Turn rate lives in worldGeometry: the junction has to be sized around the
 *  turning circle it produces, so both this file and the road agree on it. */
const TURN_RATE = CAR_TURN_RATE;

/* ---------------------------------------------------------------------------
 * How the car carries itself
 *
 * None of this moves the car. It moves the BODY relative to the wheels, which
 * is the whole trick: the wheels stay pinned to the road while everything above
 * them dives, leans and shivers, and the eye reads the gap between the two as
 * suspension. Bolt the body rigidly to the wheels and the same drive at the
 * same speed looks like a sprite being slid across the screen.
 *
 * Every number here is small. They are meant to be felt rather than seen —
 * anything you can actually point at while driving is already too much.
 * ------------------------------------------------------------------------ */

/** How far the front wheels turn, in radians. Nothing to do with how sharply
 *  the car corners — that is TURN_RATE, and the junction is sized around it.
 *  This is only what the wheels LOOK like they're doing. */
const MAX_STEER = 0.44;
/** How fast the wheels reach that angle, and settle back. */
const STEER_RESPONSE = 9;

/** Radians of nose-down pitch per unit of deceleration. At full braking the
 *  nose drops about 5 degrees, at full throttle it lifts about 3. */
const DIVE_PER_ACCEL = 0.004;
/** How quickly the body follows a change in acceleration. Low, because the raw
 *  frame-to-frame difference is far too noisy to steer bodywork with. */
const DIVE_RESPONSE = 6;
/** Radians of body roll at full lock and full speed. */
const ROLL = 0.13;
/** How far the body settles onto its springs at top speed. */
const SQUAT = 0.014;

/** Engine shiver: amplitude parked, and how much top speed adds. Three
 *  frequencies that don't divide into each other, so the shake never settles
 *  into a visible beat the way two would. */
const IDLE_SHAKE = 0.0016;
const SPEED_SHAKE = 0.0042;

/** Where each wheel goes, and which two of them steer. */
const WHEELS = [
  { x: WHEEL_TRACK, z: WHEEL_BASE, side: 1, steers: true },
  { x: -WHEEL_TRACK, z: WHEEL_BASE, side: -1, steers: true },
  { x: WHEEL_TRACK, z: -WHEEL_BASE, side: 1, steers: false },
  { x: -WHEEL_TRACK, z: -WHEEL_BASE, side: -1, steers: false },
] as const;

/* ---------------------------------------------------------------------------
 * Trim, placed against the bodywork rather than guessed at
 *
 * The shell is a curved loft, so there is no such thing as "0.85 out from the
 * centre" — the flank is at a different x for every height, and the bonnet at a
 * different height for every point across it. bodyFlankX and bodySurfaceY read
 * the real surface back, so every part below is positioned by asking where the
 * panel is. Reshape a station in carShell and the trim follows it.
 * ------------------------------------------------------------------------ */

/** Side skirt: a blade along the sill. Low down the body has tucked well inside
 *  its widest point, which is why this can't just be CAR_HALF_WIDTH. */
const SKIRT_Y = 0.185;
const SKIRT_X = bodyFlankX(-0.05, SKIRT_Y) + 0.022;

/** Side intake, ahead of the rear wheel and at the flank's widest height. */
const INTAKE_Z = -0.52;
const INTAKE_Y = 0.44;
const INTAKE_X = bodyFlankX(INTAKE_Z, INTAKE_Y);

/** Wing mirrors, on stalks off the shoulder line. */
const MIRROR_Z = 0.42;
const MIRROR_Y = 0.66;
const MIRROR_X = bodyFlankX(MIRROR_Z, MIRROR_Y);

/** Rear deck, where the wing's pylons stand. */
const PYLON_X = 0.46;
const PYLON_Z = -1.78;
const DECK_Y = bodySurfaceY(PYLON_Z, PYLON_X);

/**
 * A run of small tiles stepped across the car at one z, each dropped onto the
 * bonnet where the bonnet actually is.
 *
 * One long box can't do this. Laid flat across a panel curved in two axes it
 * either floats off the paint at its ends or sinks into it in the middle, and
 * there is no single height that avoids both. A row of short ones follows the
 * crown exactly.
 *
 * Each tile comes back with the `width` it needs to reach its neighbour and
 * then some. Spaced tiles read as a row of teeth rather than as a light — the
 * overlap is what fuses them into one bar that happens to be bent.
 */
function acrossBody(z: number, fromX: number, toX: number, count: number) {
  const step = Math.abs(toX - fromX) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const x = fromX + ((toX - fromX) * i) / (count - 1);
    return { key: i, x, y: bodySurfaceY(z, x), width: step * 1.35 };
  });
}

/** The light strip across the nose, and one headlight cluster's worth of tiles
 *  (mirrored to the other side at render time). */
const NOSE_STRIP = acrossBody(1.79, -0.4, 0.4, 11);
const HEAD_LAMP = acrossBody(1.54, 0.3, 0.62, 5);

/** The tail light shapes: a full-width bar and a blade wrapping each corner.
 *  Written once because they are rendered twice — see the tail lights below. */
const TAIL_LIGHTS: {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
}[] = [
  { key: "bar", position: [0, 0.6, -2.01], size: [1.24, 0.05, 0.05] },
  { key: "left", position: [-0.62, 0.53, -2.01], size: [0.05, 0.19, 0.05] },
  { key: "right", position: [0.62, 0.53, -2.01], size: [0.05, 0.19, 0.05] },
];

export function Car({
  color = "#16181e",
  accent = "#7dd3fc",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  speed = 80,
  controllable = false,
  maxSpeed = CAR_MAX_SPEED,
  headlights = true,
  bodyRef,
}: CarProps) {
  // Handle on the whole car. Grabbing the <group> rather than any single mesh
  // means body, cabin, wheels and lights all move together.
  const ownRef = useRef<Group>(null);
  // If a parent passed a ref, write into that one instead so both can read it.
  const groupRef = bodyRef ?? ownRef;

  const controls = useDrivingControls();

  const envMap = useCarEnvMap();
  const materials = useCarMaterials(envMap, color, accent);

  // The sprung mass: everything above the wheels. Pitched, rolled and shaken
  // every frame, which is why it is a group of its own and not the car itself —
  // leaning the car would lean the wheels off the road with it.
  const shellRef = useRef<Group>(null);
  // The brake filaments, shown and hidden as a set.
  const brakeRef = useRef<Group>(null);
  // Per wheel, indexed to match WHEELS. Spin groups roll; steer groups yaw, and
  // only the front two are ever filled.
  const spinGroups = useRef<Array<Group | null>>([null, null, null, null]);
  const steerGroups = useRef<Array<Group | null>>([null, null, null, null]);

  // The headlights' aim. A spotLight points at its `target`, and a target that
  // is never added to the scene keeps its identity matrix and leaves the beam
  // shining at the world origin — so this is a real object parked down the road
  // ahead, inside the shell, which means the beams dip with the nose under
  // braking for free.
  const aimRef = useRef<Group>(null);
  const beamRefs = useRef<Array<SpotLight | null>>([null, null]);

  useEffect(() => {
    const aim = aimRef.current;
    if (!aim) return;
    for (const beam of beamRefs.current) {
      if (beam) beam.target = aim;
    }
  }, [headlights]);

  // useFrame owns position and rotation from frame 0, so these props are only
  // the starting pose. Freezing them to a stable reference stops a parent
  // re-render from handing R3F a fresh array and teleporting the car back.
  const [startPosition] = useState(position);
  const [startRotation] = useState(rotation);

  // Current speed, in a ref so the frame loop can read and write it without
  // re-rendering. Starts at the `speed` prop so uncontrolled cars still cruise.
  const velocity = useRef(speed);

  // Presentation state, all per-frame and all smoothed. Kept in refs for the
  // same reason velocity is: sixty writes a second is not React's business.
  const wheelRoll = useRef(0);
  const steerAngle = useRef(0);
  const dive = useRef(0);
  const lastVelocity = useRef(speed);

  // translateZ moves along the car's OWN forward axis, so steering just changes
  // rotation.y and the car follows wherever its nose points.
  // From here on the `position` prop is only the starting point — useFrame owns it.
  useFrame((state, delta) => {
    const car = groupRef.current;
    if (!car) return;

    // What the driver is asking for this frame, hoisted out of the block below
    // so the bodywork can react to it further down.
    let steerInput = 0;
    let braking = false;

    if (controllable) {
      const { forward, back, left, right } = controls.current;

      // Throttle and brake change speed; nothing held lets friction bleed it off.
      if (forward) {
        velocity.current += ACCELERATION * delta;
      } else if (back) {
        velocity.current -= BRAKE_STRENGTH * delta;
      } else {
        // Coast toward zero from whichever side we're on, without overshooting
        // into a reverse crawl.
        const drop = FRICTION * delta;
        velocity.current =
          velocity.current > 0
            ? Math.max(0, velocity.current - drop)
            : Math.min(0, velocity.current + drop);
      }

      // Reverse is capped lower than forward, as in a real gearbox.
      velocity.current = Math.max(
        -maxSpeed * 0.4,
        Math.min(maxSpeed, velocity.current),
      );

      // Steering only bites while rolling — a parked car can't turn on the spot.
      // Scaling by velocity also makes the wheel feel heavier at low speed, and
      // the sign flip means reversing steers the way it does in a real car.
      if (left || right) {
        const steer = (left ? 1 : -1) * TURN_RATE * delta;
        car.rotation.y += steer * (velocity.current / maxSpeed);
      }

      steerInput = left ? 1 : right ? -1 : 0;
      // The brake lights are the pedal, not the deceleration: they come on when
      // the driver asks for retardation while still moving forward, and stay
      // off while reversing, which is what that key does once stopped.
      braking = back && velocity.current > 0.05;
    }

    if (velocity.current !== 0) {
      const fromX = car.position.x;
      const fromZ = car.position.z;
      car.translateZ(delta * velocity.current);

      // The kerb is solid: a move that would end off the asphalt is undone rather
      // than allowed. Tested after the move so the check reads the pose the car
      // would actually hold, against the union of both roads — cutting the corner
      // at the junction stays legal. CAR_HALF_WIDTH is the outer edge of the
      // arch flares, not the centre, so a wheel over the verge is already too far.
      if (controllable && !isOnPavement(car.position.x, car.position.z, CAR_HALF_WIDTH)) {
        // Blocked. Retry the move one axis at a time and keep whichever half still
        // lands on asphalt, so a car meeting the kerb at an angle scrapes along it
        // instead of stopping dead — undoing the whole move would pin it to the edge
        // and force a reverse out of every glancing touch.
        const toX = car.position.x;
        const toZ = car.position.z;

        if (isOnPavement(toX, fromZ, CAR_HALF_WIDTH)) {
          car.position.z = fromZ;
        } else if (isOnPavement(fromX, toZ, CAR_HALF_WIDTH)) {
          car.position.x = fromX;
        } else {
          // Square-on into a wall, or into a corner. Nothing survives, so the car
          // stops where it stood and the driver has to back out.
          car.position.x = fromX;
          car.position.z = fromZ;
          velocity.current = 0;
        }
      }
    }

    /* --- from here down, nothing moves the car; it only carries itself --- */

    const v = velocity.current;
    // Signed, so reverse leans and dives the right way round; the load on the
    // springs doesn't care which gear you're in.
    const pace = v / maxSpeed;

    // Wheels roll at v / r, whatever put the car in motion — so an uncontrolled
    // car cruising on its `speed` prop gets turning wheels for free. Wrapped at
    // a full turn: this is the one value that would otherwise climb all day and
    // lose its precision to the size of its own integer part.
    wheelRoll.current =
      (wheelRoll.current + (v / WHEEL_RADIUS) * delta) % (Math.PI * 2);
    for (const wheel of spinGroups.current) {
      if (wheel) wheel.rotation.x = wheelRoll.current;
    }

    // The front wheels turn whether or not the car is moving, unlike the car
    // itself — a stationary car with a key held should visibly be on lock, and
    // then pull away in that direction. Eased rather than snapped, because
    // steering is the one input here with real weight behind it.
    steerAngle.current +=
      (steerInput * MAX_STEER - steerAngle.current) *
      Math.min(1, delta * STEER_RESPONSE);
    for (const wheel of steerGroups.current) {
      if (wheel) wheel.rotation.y = steerAngle.current;
    }

    if (brakeRef.current) brakeRef.current.visible = braking;

    const shell = shellRef.current;
    if (!shell) return;

    // Weight transfer. The raw frame-to-frame difference in speed is far too
    // spiky to point bodywork with — one long frame and the car flinches — so
    // it feeds a smoothed value and the body follows that instead.
    const accel = (v - lastVelocity.current) / delta;
    lastVelocity.current = v;
    dive.current += (accel - dive.current) * Math.min(1, delta * DIVE_RESPONSE);

    const shake = IDLE_SHAKE + SPEED_SHAKE * Math.abs(pace);
    const t = state.clock.elapsedTime;

    // Negative pitch lifts the nose, so accelerating squats and braking dives.
    shell.rotation.x = -dive.current * DIVE_PER_ACCEL + Math.sin(t * 63.1) * shake * 0.7;
    // Leaning away from the corner: a left turn is +y yaw, and the body has to
    // roll onto its right-hand springs, which is -z.
    shell.rotation.z =
      -steerAngle.current * ROLL * pace + Math.sin(t * 41.7) * shake * 0.9;
    // Hunkers down with speed, and shivers about it either way.
    shell.position.y =
      -SQUAT * Math.abs(pace) +
      Math.sin(t * 57.3) * shake +
      Math.sin(t * 31.1) * shake * 0.6;
  });

  return (
    <group ref={groupRef} position={startPosition} rotation={startRotation}>
      {/* --- unsprung: pinned to the road, so the shell can move against it --- */}

      {WHEELS.map((wheel, i) => (
        <group
          key={`${wheel.x},${wheel.z}`}
          position={[wheel.x, WHEEL_RADIUS, wheel.z]}
          ref={(group) => {
            if (wheel.steers) steerGroups.current[i] = group;
          }}
        >
          <CarWheel
            side={wheel.side}
            materials={materials}
            spinRef={(group) => {
              spinGroups.current[i] = group;
            }}
          />
        </group>
      ))}

      {/* Underbody LEDs. The strips are the fitting you can see; the light is
          what puts a pool of it on the asphalt. One light and not two — it is
          meant to be a wash under the car, and the emissive strips are already
          doing the work of showing where it comes from. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`glow${side}`}
          position={[side * (SKIRT_X - 0.06), 0.115, -0.05]}
          material={materials.accent}
        >
          <boxGeometry args={[0.055, 0.02, 2.3]} />
        </mesh>
      ))}
      <pointLight
        position={[0, 0.09, -0.1]}
        color={accent}
        intensity={0.9}
        distance={4}
        decay={2}
      />

      {/* --- sprung: the whole car above the springs --- */}
      <group ref={shellRef}>
        {/* The shell. One lofted surface from nose to tail — see carShell for
            why it isn't a stack of boxes. */}
        <mesh
          geometry={carBodyGeometry}
          material={materials.paint}
          castShadow
          receiveShadow
        />

        {/* Panoramic canopy: a second loft sunk into the first, so glass meets
            paint at an overlap rather than at coplanar faces. */}
        <mesh geometry={carCanopyGeometry} material={materials.glass} castShadow />

        {/* Wheel arch flares. The widest bodywork on the car — CAR_HALF_WIDTH is
            measured to their outer face, and the tyres sit flush inside them. */}
        {WHEELS.map((wheel) => (
          <mesh
            key={`arch${wheel.x},${wheel.z}`}
            geometry={carArchGeometry}
            material={materials.paint}
            position={[
              Math.sign(wheel.x) * ARCH_OFFSET_X,
              WHEEL_RADIUS - 0.02,
              wheel.z,
            ]}
            castShadow
          />
        ))}

        {/* Front splitter, reaching out past the nose and out past the flanks —
            which is the entire point of a splitter, and reads as one from any
            angle where you can see the ground. */}
        <mesh position={[0, 0.115, 1.72]} material={materials.carbon} castShadow>
          <boxGeometry args={[1.66, 0.05, 0.6]} />
        </mesh>

        {/* Dive planes on the bumper corners, canted out of the airflow. */}
        {[-1, 1].map((side) => (
          <mesh
            key={`canard${side}`}
            position={[side * 0.72, 0.25, 1.68]}
            rotation={[0, 0, side * -0.22]}
            material={materials.carbon}
          >
            <boxGeometry args={[0.18, 0.022, 0.24]} />
          </mesh>
        ))}

        {/* Nose light strip: tiles laid onto the bonnet's leading edge, each
            sitting where the panel is rather than where a straight bar wishes
            it were. The taper front-to-back is what keeps it from reading as a
            row of identical dots. */}
        {NOSE_STRIP.map(({ key, x, y, width }) => (
          <mesh
            key={`strip${key}`}
            position={[x, y - 0.012, 1.79]}
            material={materials.headLight}
          >
            <boxGeometry args={[width, 0.032, 0.1]} />
          </mesh>
        ))}

        {/* Headlights: a swept blade over each front fender, running outboard
            into the arch. Mirrored rather than listed twice. */}
        {[-1, 1].map((side) =>
          HEAD_LAMP.map(({ key, x, y, width }) => (
            <mesh
              key={`lamp${side}.${key}`}
              position={[side * x, y - 0.014, 1.54]}
              material={materials.headLight}
            >
              <boxGeometry args={[width, 0.038, 0.2]} />
            </mesh>
          )),
        )}

        {/* Bonnet extractor vents, sunk into the valley between the fenders. */}
        {[-1, 1].map((side) => (
          <mesh
            key={`vent${side}`}
            position={[side * 0.34, bodySurfaceY(1.02, 0.34) - 0.006, 1.02]}
            material={materials.shadow}
          >
            <boxGeometry args={[0.17, 0.02, 0.4]} />
          </mesh>
        ))}

        {/* Side skirts, standing just proud of the sill. */}
        {[-1, 1].map((side) => (
          <mesh
            key={`skirt${side}`}
            position={[side * SKIRT_X, SKIRT_Y, -0.05]}
            material={materials.carbon}
            castShadow
          >
            <boxGeometry args={[0.09, 0.07, 1.74]} />
          </mesh>
        ))}

        {/* Side intakes. There is no hole to cut in a lofted shell, so the duct
            is faked the way it reads: a near-black panel that catches no
            highlight, a lip above it that catches a hard one, and two vanes
            standing in front of the dark. The eye supplies the depth. */}
        {[-1, 1].map((side) => (
          <group key={`intake${side}`}>
            <mesh
              position={[side * (INTAKE_X + 0.008), INTAKE_Y, INTAKE_Z]}
              material={materials.shadow}
            >
              <boxGeometry args={[0.03, 0.24, 0.62]} />
            </mesh>
            <mesh
              position={[side * (INTAKE_X + 0.014), INTAKE_Y + 0.15, INTAKE_Z]}
              material={materials.carbon}
            >
              <boxGeometry args={[0.045, 0.05, 0.66]} />
            </mesh>
            {[-0.16, 0.14].map((dz) => (
              <mesh
                key={`vane${side}${dz}`}
                position={[side * (INTAKE_X + 0.02), INTAKE_Y, INTAKE_Z + dz]}
                material={materials.carbon}
              >
                <boxGeometry args={[0.03, 0.21, 0.035]} />
              </mesh>
            ))}
          </group>
        ))}

        {/* Wing mirrors on stalks. Small, and mostly there for scale — without
            something door-sized to measure against, a car this low reads as a
            model of itself. */}
        {[-1, 1].map((side) => (
          <group key={`mirror${side}`}>
            <mesh
              position={[side * (MIRROR_X + 0.06), MIRROR_Y + 0.03, MIRROR_Z]}
              rotation={[0, 0, side * -0.4]}
              material={materials.alloy}
            >
              <boxGeometry args={[0.14, 0.022, 0.05]} />
            </mesh>
            <mesh
              position={[side * 0.79, MIRROR_Y + 0.08, MIRROR_Z - 0.02]}
              material={materials.carbon}
              castShadow
            >
              <boxGeometry args={[0.11, 0.055, 0.12]} />
            </mesh>
          </group>
        ))}

        {/* Rear wing. A real aerofoil section on two pylons off the deck, raked
            leading-edge-down so it looks like it is pushing the tail into the
            road rather than lifting it. It stops just under the roofline, which
            is where a wing has to sit to look integrated instead of bolted on. */}
        <mesh
          geometry={carWingGeometry}
          material={materials.carbon}
          position={[0, 1, -1.84]}
          rotation={[0.17, 0, 0]}
          castShadow
        />
        {[-1, 1].map((side) => (
          <mesh
            key={`endplate${side}`}
            position={[side * (WING_SPAN / 2), 1, -1.84]}
            material={materials.carbon}
            castShadow
          >
            <boxGeometry args={[0.028, 0.3, 0.56]} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh
            key={`pylon${side}`}
            position={[side * PYLON_X, (DECK_Y + 1) / 2, PYLON_Z]}
            material={materials.carbon}
          >
            <boxGeometry args={[0.07, 1 - DECK_Y + 0.06, 0.16]} />
          </mesh>
        ))}

        {/* Tail lights: a bar straight across the chopped-off rear panel — the
            one face on this car flat enough to take a single unbroken box — and
            a blade wrapping each corner.

            Rendered twice. The running set is always on; the brake set is the
            same three shapes a hair further back and a hair larger, and the
            frame loop shows it by flipping one group's `visible`. That is more
            meshes than turning the emissive up would cost, and it is what lets
            the whole change happen through a ref — the frame loop here never
            writes to anything it didn't reach through one. */}
        {TAIL_LIGHTS.map(({ key, position, size }) => (
          <mesh key={`tail${key}`} position={position} material={materials.tailLight}>
            <boxGeometry args={size} />
          </mesh>
        ))}
        <group ref={brakeRef} visible={false}>
          {TAIL_LIGHTS.map(({ key, position, size }) => (
            <mesh
              key={`brake${key}`}
              position={[position[0], position[1], position[2] - 0.014]}
              material={materials.brakeLight}
            >
              <boxGeometry args={[size[0] + 0.012, size[1] + 0.012, size[2]]} />
            </mesh>
          ))}
        </group>

        {/* Diffuser: fins under the tail, where the underbody kicks up. */}
        {[-0.5, -0.25, 0, 0.25, 0.5].map((x) => (
          <mesh
            key={`fin${x}`}
            position={[x, 0.19, -1.85]}
            material={materials.carbon}
          >
            <boxGeometry args={[0.04, 0.2, 0.5]} />
          </mesh>
        ))}
        <mesh position={[0, 0.14, -1.86]} material={materials.carbon} castShadow>
          <boxGeometry args={[1.06, 0.04, 0.44]} />
        </mesh>

        {/* Twin exhausts, high and inboard between the diffuser fins. Each is a
            bright ring around a dark bore: a plain cylinder end-on is a disc,
            and a disc doesn't look like a pipe you could see down. */}
        {[-1, 1].map((side) => (
          <group key={`pipe${side}`} position={[side * 0.27, 0.4, -2.03]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={materials.alloy}>
              <cylinderGeometry args={[0.085, 0.085, 0.16, 18]} />
            </mesh>
            <mesh
              position={[0, 0, 0.012]}
              rotation={[Math.PI / 2, 0, 0]}
              material={materials.shadow}
            >
              <cylinderGeometry args={[0.062, 0.062, 0.16, 16]} />
            </mesh>
          </group>
        ))}

        {/* Where the beams point: down the road and into the asphalt, so they
            land as pools rather than firing off over the horizon. Inside the
            shell, so braking dips them. */}
        <group ref={aimRef} position={[0, -0.45, 14]} />

        {headlights &&
          [-1, 1].map((side, i) => (
            <spotLight
              key={`beam${side}`}
              ref={(light) => {
                beamRefs.current[i] = light;
              }}
              position={[side * 0.55, 0.5, 1.7]}
              color="#eaf2ff"
              intensity={220}
              distance={34}
              angle={0.42}
              penumbra={0.65}
              decay={2}
            />
          ))}
      </group>
    </group>
  );
}
