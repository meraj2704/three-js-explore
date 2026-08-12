"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { RefObject } from "react";
import type { Group } from "three";
import { StreetLamp } from "./StreetLamp";
import {
  BRANCH_LENGTH,
  BRANCH_WIDTH,
  BRANCH_Z,
  ROAD_LENGTH,
  ROAD_SURFACE_Y,
  ROAD_WIDTH,
} from "./worldGeometry";

/** Gap between consecutive lamps along a road. They alternate sides, so each
 *  verge actually gets one every 2x this. Must stay under the pointLight
 *  `distance` or dark gaps open up between the pools of light. */
const LAMP_SPACING = 7;

/** One lamp post: where it stands and which way its arm reaches. */
type LampPlacement = {
  position: [number, number, number];
  reach: number;
};

/** Lamps down both roads, generated from their dimensions so the two can't
 *  drift. Inset by half a spacing to avoid a lamp balanced on the very end,
 *  and alternating sides so the pools of light stagger. */
const LAMP_PLACEMENTS: LampPlacement[] = [
  // Main road: lamps sit either side of the asphalt, spaced along z.
  ...Array.from({ length: Math.floor(ROAD_LENGTH / LAMP_SPACING) }, (_, i) => {
    const z = -ROAD_LENGTH / 2 + LAMP_SPACING * (i + 0.5);
    const onLeft = i % 2 === 0;
    const verge = ROAD_WIDTH / 2 + 0.4;
    return {
      position: [onLeft ? -verge : verge, ROAD_SURFACE_Y, z] as [
        number,
        number,
        number,
      ],
      reach: onLeft ? 1.2 : -1.2,
    };
  }),

  // Branch: the axes swap. Lamps space along x and stand either side in z.
  ...Array.from({ length: Math.floor(BRANCH_LENGTH / LAMP_SPACING) }, (_, i) => {
    const x = -(ROAD_WIDTH / 2) - LAMP_SPACING * (i + 0.5);
    const onNear = i % 2 === 0;
    const verge = BRANCH_WIDTH / 2 + 0.4;
    return {
      position: [x, ROAD_SURFACE_Y, BRANCH_Z + (onNear ? verge : -verge)] as [
        number,
        number,
        number,
      ],
      // Arms reach along z here, so the lamp must be yawed — see below.
      reach: onNear ? -1.2 : 1.2,
    };
  }),
];

/** Index of the first branch lamp, so we know which ones to yaw. */
const FIRST_BRANCH_LAMP = Math.floor(ROAD_LENGTH / LAMP_SPACING);

/** How many lamps around the car actually get a pointLight.
 *
 * This is the single most important number for frame rate. three.js renders
 * forward, so EVERY light is evaluated for every lit fragment — measured on
 * this scene, each extra pointLight costs ~10ms/frame regardless of shadows or
 * how far away it is. Lighting all 14 lamps took the frame from 32ms to 176ms.
 * The rest still show their glowing heads, which sells the illusion for free. */
const LIT_LAMP_COUNT = 4;

/**
 * Decides which lamps are lit as the car drives, and re-renders only when that
 * set actually changes — not every frame.
 */
function useNearbyLamps(target: RefObject<Group | null>) {
  const [litIndices, setLitIndices] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3]),
  );
  // Compared against the next candidate set so we can skip the state update
  // when the car hasn't moved far enough to change anything.
  const litKey = useRef("");

  useFrame(() => {
    const car = target.current;
    if (!car) return;

    // True 2D distance, not just along one axis: with an L-shaped layout the
    // nearest lamps can be on either arm. Squared distance is enough to rank.
    const nearest = LAMP_PLACEMENTS.map(({ position }, i) => {
      const dx = position[0] - car.position.x;
      const dz = position[2] - car.position.z;
      return { i, d: dx * dx + dz * dz };
    })
      .sort((a, b) => a.d - b.d)
      .slice(0, LIT_LAMP_COUNT)
      .map((entry) => entry.i);

    const key = nearest
      .slice()
      .sort((a, b) => a - b)
      .join(",");
    if (key === litKey.current) return;

    litKey.current = key;
    setLitIndices(new Set(nearest));
  });

  return litIndices;
}

/**
 * All the lamp posts down both roads, staggered so the pools of light
 * alternate. Only the handful nearest the car carry a real light.
 *
 * Lives in its own component because useFrame only works inside <Canvas>.
 */
export function StreetLamps({ target }: { target: RefObject<Group | null> }) {
  const litIndices = useNearbyLamps(target);

  return (
    <>
      {LAMP_PLACEMENTS.map(({ position, reach }, i) => {
        // Branch lamps stand beside an east-west road, so yaw them a quarter
        // turn to swing their arms out over that road instead of the main one.
        const onBranch = i >= FIRST_BRANCH_LAMP;
        return (
          <StreetLamp
            key={`${position[0]},${position[2]}`}
            position={position}
            rotation={onBranch ? [0, Math.PI / 2, 0] : [0, 0, 0]}
            reach={reach}
            lit={litIndices.has(i)}
          />
        );
      })}
    </>
  );
}
