"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import type { RefObject } from "react";
import { Vector3 } from "three";
import type { Group } from "three";

import { useCameraLook } from "./useCameraLook";

/** A world-space box to keep the camera seat inside. Every side is optional,
 *  because the useful cases only ever fence off some of them. */
type CameraBounds = {
  minX?: number;
  maxX?: number;
  minZ?: number;
  maxZ?: number;
};

type ChaseCameraProps = {
  /** The car to follow. */
  target: RefObject<Group | null>;
  /** Camera seat in the car's LOCAL space: behind it (-z), up (+y). */
  offset?: [number, number, number];
  /** How quickly the camera catches up, per second. Higher = stiffer. */
  stiffness?: number;
  /** Keep the seat inside these world-space walls.
   *
   *  Indoors the seat is the problem: it hangs a fixed distance out from the
   *  car, so the moment the car turns to face a wall — or the view is dragged
   *  toward one — the seat is shoved straight through it and the shot fills with
   *  the outside of the building. Clamping slides the camera along the wall
   *  instead. */
  bounds?: CameraBounds;
};

/** Default camera seat: behind the car and above it. */
const DEFAULT_CHASE_OFFSET: [number, number, number] = [0, 2.6, -6.5];

/** Pinned against a wall the seat can't step back, so it steps up instead: some
 *  of the travel the clamp took is repaid as height. Without this, a car facing
 *  away from a nearby wall leaves the camera a metre behind it and the whole
 *  frame is bonnet. Capped so it can't climb out through a ceiling. */
const CLAMP_RISE_RATIO = 0.8;
const MAX_CLAMP_RISE = 3;

/** Hard limits on the seat's height angle, whatever the drag asked for and
 *  whatever offset it was added to. The floor is the real constraint: the car
 *  stands ON the ground, so a seat at or below level with it is a camera inside
 *  the road. The ceiling just stops the shot from becoming a plan view. */
const MIN_SEAT_PITCH = 0.06;
const MAX_SEAT_PITCH = 1.3;

/** Driving takes the camera back. Below this speed the car counts as parked and
 *  a look is left exactly where it was put — which is the whole point of being
 *  able to stop in front of a picture and turn to face it. */
const RECENTER_SPEED = 1.5;

/** How briskly the view swings back behind a moving car, per second. Slack
 *  enough that a glance sideways at speed is a slow drift home rather than the
 *  camera being snatched out of your hand. */
const RECENTER_STIFFNESS = 1.6;

/** Follow stiffness while a drag is live — high enough that the view tracks the
 *  hand instead of trailing it. */
const DRAG_STIFFNESS = 14;

/**
 * Follows the car from behind, and lets you look around from there.
 *
 * Renders nothing — it just moves state.camera each frame. The lag is the whole
 * point: rather than pinning the camera to the offset, it eases toward it, so
 * accelerating pulls the camera back and cornering lets it swing wide.
 *
 * The seat is polar around the car rather than a fixed vector, because a drag
 * has to be able to swing it: `offset` is read once as a radius and a pair of
 * angles, and the look adds to the angles. That is what keeps the camera the
 * same distance from the car at every heading — a room seen from a seat that
 * grew and shrank as it went round would swim.
 */
export function ChaseCamera({
  target,
  offset = DEFAULT_CHASE_OFFSET,
  stiffness = 3,
  bounds,
}: ChaseCameraProps) {
  // Scratch vectors, allocated once. Creating them inside useFrame would mean
  // ~120 throwaway objects a second for the garbage collector.
  const desiredPosition = useMemo(() => new Vector3(), []);
  const clampedSeat = useMemo(() => new Vector3(), []);
  const lookAtPoint = useMemo(() => new Vector3(), []);
  const carPosition = useMemo(() => new Vector3(), []);
  const previousCarPosition = useMemo(() => new Vector3(), []);

  // Drag angles, owned here the way <Car> owns its keyboard: the camera is the
  // only thing that ever reads them.
  const look = useCameraLook();

  // The offset, re-read as the polar seat the look swings around. Depends on the
  // tuple's contents, not its identity, so an inline array literal at the call
  // site doesn't rebuild it every render.
  const seat = useMemo(() => {
    const vector = new Vector3(...offset);
    const radius = vector.length() || 1;
    return {
      radius,
      // atan2(x, z), not (z, x): this is three's own spherical convention, so
      // yaw 0 is straight ahead of the car and a seat behind it reads as PI.
      yaw: Math.atan2(vector.x, vector.z),
      pitch: Math.asin(vector.y / radius),
    };
  }, [offset[0], offset[1], offset[2]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vector3.clamp works per component, so an unfenced side is just an infinite
  // one — which is also why y never needs a case of its own. Pass a stable
  // `bounds` object and these are built once.
  const boundsMin = useMemo(
    () =>
      new Vector3(
        bounds?.minX ?? -Infinity,
        -Infinity,
        bounds?.minZ ?? -Infinity,
      ),
    [bounds],
  );
  const boundsMax = useMemo(
    () =>
      new Vector3(bounds?.maxX ?? Infinity, Infinity, bounds?.maxZ ?? Infinity),
    [bounds],
  );

  useFrame((state, delta) => {
    const car = target.current;
    if (!car) return;

    // Is the car actually driving? Measured from how far it moved rather than
    // asked of the controls, so the camera needs no wire to the keyboard — and
    // so a car shoved along by anything else counts too.
    carPosition.setFromMatrixPosition(car.matrixWorld);
    const speed = previousCarPosition.distanceTo(carPosition) / delta;
    // The first frame compares against an unset vector and reads as a leap
    // across the world; it is only ever used to unwind a look that is still zero
    // at that point, so it costs nothing to let through.
    previousCarPosition.copy(carPosition);

    // Drive and the view comes back behind you; stop and it stays where you put
    // it. Eased on the same 1 - e^(-k·dt) curve as the camera itself, so it is
    // frame-rate independent for the same reason.
    if (speed > RECENTER_SPEED) {
      look.recenter(1 - Math.exp(-RECENTER_STIFFNESS * delta));
    }

    // The seat, swung by however far the view has been dragged, then mapped
    // through the car's own rotation by localToWorld — which is what keeps the
    // camera behind the car no matter which way it is pointing, and keeps a look
    // pinned to the car's flank rather than to a compass bearing.
    const angles = look.angles.current;
    const yaw = seat.yaw + angles.yaw;
    const pitch = Math.min(
      MAX_SEAT_PITCH,
      Math.max(MIN_SEAT_PITCH, seat.pitch + angles.pitch),
    );
    const groundReach = Math.cos(pitch) * seat.radius;
    desiredPosition.set(
      Math.sin(yaw) * groundReach,
      Math.sin(pitch) * seat.radius,
      Math.cos(yaw) * groundReach,
    );
    car.localToWorld(desiredPosition);

    // Clamp the seat, not the camera's current position: the easing below still
    // runs, so the camera glides along the wall rather than sticking to it.
    if (bounds) {
      clampedSeat.copy(desiredPosition).clamp(boundsMin, boundsMax);
      const lost = desiredPosition.distanceTo(clampedSeat);
      desiredPosition
        .copy(clampedSeat)
        .setY(
          clampedSeat.y + Math.min(lost * CLAMP_RISE_RATIO, MAX_CLAMP_RISE),
        );
    }

    // Frame-rate independent easing. Using 1 - e^(-k·dt) rather than a plain
    // lerp alpha keeps the feel identical at 30fps and 144fps.
    //
    // Stiffer while a drag is live: the lag that makes the car feel fast makes a
    // hand-dragged view feel broken, because the picture keeps sliding for a
    // third of a second after the mouse has stopped.
    const alpha =
      1 - Math.exp(-(angles.dragging ? DRAG_STIFFNESS : stiffness) * delta);
    state.camera.position.lerp(desiredPosition, alpha);

    // Aim slightly above the car's origin — roughly at the roof — so the car
    // sits in the lower half of the frame with the road ahead visible.
    lookAtPoint.set(0, 1, 0);
    car.localToWorld(lookAtPoint);
    state.camera.lookAt(lookAtPoint);
  });

  return null;
}
