"use client";

import type { Group } from "three";

import {
  carBrakeDiscGeometry,
  carCaliperGeometry,
  carRimGeometry,
  carTyreGeometry,
  carWheelWellGeometry,
  TYRE_WIDTH,
} from "./carShell";
import type { CarMaterials } from "./carMaterials";

type CarWheelProps = {
  /** Which side of the car this is: +1 for the right, -1 for the left. Only the
   *  caliper cares — it has to sit on the inboard face either way. */
  side: 1 | -1;
  materials: CarMaterials;
  /** Collects the rolling group so <Car> can spin it. A callback ref because
   *  the four wheels are rendered from a list and hand back one ref each. */
  spinRef: (group: Group | null) => void;
};

/**
 * One wheel: tyre, alloy, brake disc and caliper.
 *
 * Built at the origin — the caller parks it at the hub, because on the front
 * axle that same group is also the one that steers, and a wheel that positioned
 * itself would need the steering group to sit inside it and rotate about a
 * point it isn't at.
 *
 * Every part arrives from carShell already turned so the axle lies along x,
 * which is what lets the rolling group below spin on plain rotation.x with no
 * correction of its own — and, more usefully, lets that steering group turn on
 * rotation.y without the two rotations fighting.
 *
 * The split between what turns and what doesn't is the whole point of the
 * component. The caliper is bolted to the upright on a real car and stays put
 * while the disc spins through it; spin it with the wheel and you get a red
 * smear that gives the game away immediately, because nothing on a car is
 * supposed to look like that.
 */
export function CarWheel({ side, materials, spinRef }: CarWheelProps) {
  return (
    <group>
      {/* Both fixed to the upright: neither turns with the wheel. The caliper
          tucks just inboard of the dished spoke face — far enough back to be
          seen THROUGH the spokes, which is the only way a caliper is ever seen,
          and no further, because every unit deeper is a unit the rim barrel's
          near wall hides at anything off a head-on view. The well sits right at
          the back and closes off the view out through the wheel. */}
      <mesh
        geometry={carCaliperGeometry}
        material={materials.caliper}
        position={[-side * TYRE_WIDTH * 0.06, 0, 0]}
      />
      <mesh
        geometry={carWheelWellGeometry}
        material={materials.shadow}
        position={[-side * TYRE_WIDTH * 0.4, 0, 0]}
      />

      <group ref={spinRef}>
        <mesh geometry={carTyreGeometry} material={materials.tyre} castShadow />
        <mesh
          geometry={side === 1 ? carRimGeometry.right : carRimGeometry.left}
          material={materials.alloy}
          castShadow
        />
        <mesh
          geometry={carBrakeDiscGeometry}
          material={materials.brakeDisc}
          position={[-side * TYRE_WIDTH * 0.06, 0, 0]}
        />
      </group>
    </group>
  );
}
