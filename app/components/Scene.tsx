"use client";

import { Canvas } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";

import { Car } from "./Car";
import { ChaseCamera } from "./ChaseCamera";
import { CrashOverlay } from "./CrashOverlay";
import { Gate } from "./Gate";
import { JunctionApron } from "./JunctionApron";
import { Museum } from "./Museum";
import { Road } from "./Road";
import { StreetLamps } from "./StreetLamps";
import {
  BRANCH_LENGTH,
  BRANCH_WIDTH,
  BRANCH_Z,
  ROAD_START_Z,
  ROAD_SURFACE_Y,
  ROAD_WIDTH,
} from "./worldGeometry";

/**
 * Root scene. <Canvas> creates the WebGL renderer, scene and camera,
 * and must live in a Client Component because it touches browser APIs.
 *
 * Everything here is composition: each object owns its own geometry, and the
 * dimensions they share live in worldGeometry.
 */
export default function Scene() {
  // Lives here so both the car and the chase camera can reach it.
  const playerCar = useRef<Group>(null);

  // Crash state IS worth putting in React state, unlike per-frame values —
  // it changes rarely and drives the HTML overlay.
  const [crashed, setCrashed] = useState(false);

  return (
    <div className="relative h-full w-full">
      <Canvas shadows camera={{ position: [4.5, 3, 9], fov: 45 }}>
        {/* Matches the page's bg-zinc-950 so the far end of the road dissolves
            into the background instead of stopping dead in mid-air. */}
        <fog attach="fog" args={["#09090b", 8, 40]} />

        {/* Dim ambient + a weak, cool directional stand in for moonlight. Both
            are kept low on purpose: the lamps can only read as the light source
            if the scene is dark to begin with. */}
        <ambientLight intensity={0.18} />
        <directionalLight
          position={[5, 6, 5]}
          color="#93c5fd"
          intensity={0.45}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0005}
        />

        {/* Lamp posts down both roads; only those near the car are lit. */}
        <StreetLamps target={playerCar} />

        {/* Main road, centered on the origin and running along z. */}
        <Road position={[0, -1.5, 0]} />

        <JunctionApron />

        {/* Left branch. Rotated a quarter turn so its length runs along x, and
            positioned so its near end overlaps the main road at the junction
            rather than leaving a gap. Edge lines are off: they'd otherwise paint
            a solid stripe across the mouth of the turn, reading as a kerb. */}
        <Road
          length={BRANCH_LENGTH}
          width={BRANCH_WIDTH}
          position={[-(ROAD_WIDTH / 2 + BRANCH_LENGTH / 2), -1.5, BRANCH_Z]}
          rotation={[0, Math.PI / 2, 0]}
          edgeLines={false}
        />

        <Road
          length={BRANCH_LENGTH}
          width={BRANCH_WIDTH}
          position={[ROAD_WIDTH / 2 + BRANCH_LENGTH  / 2, -1.5, BRANCH_Z - 17]}
          rotation={[0, Math.PI / 2, 0]}
          edgeLines={false}
        />

        <Museum
          position={[-52, -1.5, 26]}
          rotation={[0, Math.PI / 2, 0]}
          width={14}
          depth={10}
          height={6}
        />

        {/* Entrance arch, a few units down-road from the start line so the car
            drives under it rather than starting on top of it. */}
        <Gate position={[0, ROAD_SURFACE_Y, ROAD_START_Z - 8]} />

        {/* Drivable: arrow keys or WASD. Starts parked, yawed 180° so it faces
            away from the camera and drives up the road rather than off-screen.
            Centered on x so there's equal room to drift either way before the
            crash bounds bite. */}
        <Car
          color="#ef4444"
          position={[0, ROAD_SURFACE_Y, ROAD_START_Z]}
          rotation={[0, Math.PI, 0]}
          controllable
          bodyRef={playerCar}
          crashed={crashed}
          onCrash={() => setCrashed(true)}
        />

        {/* Rides behind the car. Must come after <Car> so the car's transform
            for this frame is already up to date when the camera reads it. */}
        <ChaseCamera target={playerCar} />

        {/* No <OrbitControls>: it writes camera.position and camera.quaternion
            every frame, which would fight the chase camera for control. */}
      </Canvas>

      {crashed && <CrashOverlay onReset={() => setCrashed(false)} />}
    </div>
  );
}
