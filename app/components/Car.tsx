"use client";

import { useRef, useState } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { ColorRepresentation, Group } from "three";
import {
  CAR_MAX_SPEED,
  CAR_TURN_RATE,
  isOnPavement,
} from "./worldGeometry";
import { useDrivingControls } from "./useDrivingControls";

type CarProps = {
  /** Body paint. Cabin, wheels and lights are fixed. */
  color?: ColorRepresentation;
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

/** Wheel radius, and how far the wheels sit apart along x and z. */
const WHEEL_RADIUS = 0.32;
const WHEEL_TRACK = 0.78;
const WHEEL_BASE = 1.0;

/** Half the car's width. The kerb test uses the outer edge of the tyres, not
 *  the group origin, so a wheel hanging over the verge already counts. */
const CAR_HALF_WIDTH = WHEEL_TRACK + 0.11;

export function Car({
  color = "#ef4444",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  speed = 0,
  controllable = false,
  maxSpeed = CAR_MAX_SPEED,
  bodyRef,
}: CarProps) {
  // Handle on the whole car. Grabbing the <group> rather than any single mesh
  // means body, cabin, wheels and lights all move together.
  const ownRef = useRef<Group>(null);
  // If a parent passed a ref, write into that one instead so both can read it.
  const groupRef = bodyRef ?? ownRef;

  const controls = useDrivingControls();

  // useFrame owns position and rotation from frame 0, so these props are only
  // the starting pose. Freezing them to a stable reference stops a parent
  // re-render from handing R3F a fresh array and teleporting the car back.
  const [startPosition] = useState(position);
  const [startRotation] = useState(rotation);

  // Current speed, in a ref so the frame loop can read and write it without
  // re-rendering. Starts at the `speed` prop so uncontrolled cars still cruise.
  const velocity = useRef(speed);

  // translateZ moves along the car's OWN forward axis, so steering just changes
  // rotation.y and the car follows wherever its nose points.
  // From here on the `position` prop is only the starting point — useFrame owns it.
  useFrame((_state, delta) => {
    const car = groupRef.current;
    if (!car) return;

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
    }

    if (velocity.current === 0) return;

    const fromX = car.position.x;
    const fromZ = car.position.z;
    car.translateZ(delta * velocity.current);

    // The kerb is solid: a move that would end off the asphalt is undone rather
    // than allowed. Tested after the move so the check reads the pose the car
    // would actually hold, against the union of both roads — cutting the corner
    // at the junction stays legal. CAR_HALF_WIDTH is the outer edge of the
    // tyres, not the center, so a wheel over the verge is already too far.
    if (
      !controllable ||
      isOnPavement(car.position.x, car.position.z, CAR_HALF_WIDTH)
    ) {
      return;
    }

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
  });

  return (
    <group ref={groupRef} position={startPosition} rotation={startRotation}>
      {/* Lower body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.5, 0.5, 3]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* Cabin, set back a little so the bonnet is longer than the boot. Its
          base sinks 0.05 into the body — flush would make the two faces
          coplanar and set them z-fighting. */}
      <mesh position={[0, 1, -0.2]} castShadow>
        <boxGeometry args={[1.28, 0.5, 1.5]} />
        <meshStandardMaterial color={color} metalness={0.3} roughness={0.4} />
      </mesh>

      {/* Glass band: a slab buried inside the cabin but 0.02 wider and longer,
          so only a thin dark stripe pokes out the sides, front and back. */}
      <mesh position={[0, 1.08, -0.2]}>
        <boxGeometry args={[1.32, 0.26, 1.54]} />
        <meshStandardMaterial color="#18181b" metalness={0.6} roughness={0.1} />
      </mesh>

      {/* Four wheels. A cylinder's axis is y by default, so rotating it a
          quarter turn on z lays the axle along x. */}
      {[
        [-WHEEL_TRACK, WHEEL_BASE],
        [WHEEL_TRACK, WHEEL_BASE],
        [-WHEEL_TRACK, -WHEEL_BASE],
        [WHEEL_TRACK, -WHEEL_BASE],
      ].map(([x, z]) => (
        <mesh
          key={`${x},${z}`}
          position={[x, WHEEL_RADIUS, z]}
          rotation={[0, 0, Math.PI / 2]}
          castShadow
        >
          <cylinderGeometry args={[WHEEL_RADIUS, WHEEL_RADIUS, 0.22, 20]} />
          <meshStandardMaterial color="#27272a" roughness={0.8} />
        </mesh>
      ))}

      {/* Headlights (front, +z) and tail lights (rear, -z). emissive makes them
          glow on their own instead of relying on the scene lights. */}
      {[-0.45, 0.45].map((x) => (
        <mesh key={`head${x}`} position={[x, 0.6, 1.48]}>
          <boxGeometry args={[0.3, 0.14, 0.08]} />
          <meshStandardMaterial
            color="#fef9c3"
            emissive="#fde68a"
            emissiveIntensity={1.5}
          />
        </mesh>
      ))}
      {[-0.45, 0.45].map((x) => (
        <mesh key={`tail${x}`} position={[x, 0.6, -1.48]}>
          <boxGeometry args={[0.3, 0.14, 0.08]} />
          <meshStandardMaterial
            color="#7f1d1d"
            emissive="#ef4444"
            emissiveIntensity={1.2}
          />
        </mesh>
      ))}
    </group>
  );
}
