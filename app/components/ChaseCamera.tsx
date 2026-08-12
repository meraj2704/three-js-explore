"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import type { RefObject } from "react";
import { Vector3 } from "three";
import type { Group } from "three";

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
   *  Indoors the seat is the problem: it hangs a fixed distance behind the car,
   *  so the moment the car turns to face a wall the seat is shoved straight
   *  through the one behind it and the shot fills with the outside of the
   *  building. Clamping slides the camera along the wall instead. */
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

/**
 * Follows the car from behind.
 *
 * Renders nothing — it just moves state.camera each frame. The lag is the whole
 * point: rather than pinning the camera to the offset, it eases toward it, so
 * accelerating pulls the camera back and cornering lets it swing wide.
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
  // Depends on the tuple's contents, not its identity, so an inline array
  // literal at the call site doesn't rebuild this every render.
  const offsetVector = useMemo(
    () => new Vector3(...offset),
    [offset[0], offset[1], offset[2]], // eslint-disable-line react-hooks/exhaustive-deps
  );

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

    // localToWorld maps the seat offset through the car's own rotation, so the
    // camera stays behind the car no matter which way it is pointing.
    desiredPosition.copy(offsetVector);
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
    const alpha = 1 - Math.exp(-stiffness * delta);
    state.camera.position.lerp(desiredPosition, alpha);

    // Aim slightly above the car's origin — roughly at the roof — so the car
    // sits in the lower half of the frame with the road ahead visible.
    lookAtPoint.set(0, 1, 0);
    car.localToWorld(lookAtPoint);
    state.camera.lookAt(lookAtPoint);
  });

  return null;
}
