"use client";

// TEMPORARY visual probe — delete this folder when done.
// Parks the car at a chosen spot around the museum so the entrance can be
// inspected without driving there. ?pose=0..3

import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";

import { Car } from "../components/Car";
import { ChaseCamera } from "../components/ChaseCamera";
import { Museum } from "../components/Museum";
import { Road } from "../components/Road";
import { SceneFog } from "../components/SceneFog";
import { StreetLamps } from "../components/StreetLamps";
import {
  BRANCH_LENGTH,
  BRANCH_WIDTH,
  BRANCH_Z,
  HALL_HALF_DEPTH,
  HALL_HALF_Z,
  MUSEUM_CENTER_X,
  MUSEUM_CENTER_Z,
  ROAD_SURFACE_Y,
  ROAD_WIDTH,
} from "../components/worldGeometry";

const INDOOR_CHASE_OFFSET: [number, number, number] = [0, 2.5, -4.8];
const HALL_CAMERA_BOUNDS = {
  minX: MUSEUM_CENTER_X - HALL_HALF_DEPTH + 0.3,
  minZ: MUSEUM_CENTER_Z - HALL_HALF_Z + 0.3,
  maxZ: MUSEUM_CENTER_Z + HALL_HALF_Z - 0.3,
};

const POSES: { position: [number, number, number]; rotation: [number, number, number] }[] = [
  // 0 — on the branch, still short of the forecourt
  { position: [-44, ROAD_SURFACE_Y, 26], rotation: [0, -Math.PI / 2, 0] },
  // 1 — mid forecourt, lined up with the doors
  { position: [-51, ROAD_SURFACE_Y, 26], rotation: [0, -Math.PI / 2, 0] },
  // 2 — on the threshold
  { position: [-56, ROAD_SURFACE_Y, 26], rotation: [0, -Math.PI / 2, 0] },
  // 3 — mid hall, turned broadside to test the camera clamp
  {
    position: [MUSEUM_CENTER_X, ROAD_SURFACE_Y, MUSEUM_CENTER_Z],
    rotation: [0, Math.PI, 0],
  },
  // 4 — approach down the branch, to check the sign is legible. Pulled in from
  //     -30: the chase camera looks slightly down, so the sign only enters the
  //     frame inside ~13 units of the facade, and at -30 the fog had it anyway.
  { position: [-38, ROAD_SURFACE_Y, 26], rotation: [0, -Math.PI / 2, 0] },
  // 5 — against the back wall facing out: the seat wants to be behind the wall.
  //     Read off the hall rather than typed, so resizing the museum doesn't
  //     quietly leave these two poses parked in mid-room.
  {
    position: [
      MUSEUM_CENTER_X - HALL_HALF_DEPTH + 2,
      ROAD_SURFACE_Y,
      MUSEUM_CENTER_Z,
    ],
    rotation: [0, Math.PI / 2, 0],
  },
  // 6 — against the +z plinth facing away: the seat wants to be in the wall
  {
    position: [
      MUSEUM_CENTER_X,
      ROAD_SURFACE_Y,
      MUSEUM_CENTER_Z + HALL_HALF_Z - 1.5,
    ],
    rotation: [0, Math.PI, 0],
  },
];

export default function Probe() {
  const playerCar = useRef<Group>(null);
  const [inMuseum, setInMuseum] = useState(false);

  const poseIndex =
    typeof window === "undefined"
      ? 0
      : Number(new URLSearchParams(window.location.search).get("pose") ?? 0);
  const pose = POSES[poseIndex] ?? POSES[0];

  return (
    <main className="h-screen w-full bg-zinc-950">
      <Canvas shadows camera={{ position: [4.5, 3, 9], fov: 45 }}>
        <SceneFog indoors={inMuseum} />
        <ambientLight intensity={0.18} />
        <directionalLight position={[5, 6, 5]} color="#93c5fd" intensity={0.45} />

        <StreetLamps target={playerCar} />
        <Road position={[0, -1.5, 0]} />
        <Road
          length={BRANCH_LENGTH}
          width={BRANCH_WIDTH}
          position={[-(ROAD_WIDTH / 2 + BRANCH_LENGTH / 2), -1.5, BRANCH_Z]}
          rotation={[0, Math.PI / 2, 0]}
          edgeLines={false}
        />

        <Museum target={playerCar} lit={inMuseum} onOccupancyChange={setInMuseum} />

        <Car
          color="#ef4444"
          position={pose.position}
          rotation={pose.rotation}
          controllable
          bodyRef={playerCar}
        />

        <ChaseCamera
          target={playerCar}
          offset={inMuseum ? INDOOR_CHASE_OFFSET : undefined}
          bounds={inMuseum ? HALL_CAMERA_BOUNDS : undefined}
        />
      </Canvas>
    </main>
  );
}
