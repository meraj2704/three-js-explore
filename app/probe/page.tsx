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
import { MAHFUZ_PORTRAIT } from "../components/Scene";
import { stackExhibits } from "../components/stackExhibits";
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
  PORTRAIT_HALF_DEPTH,
  PORTRAIT_OFFSET_X,
  ROAD_SURFACE_Y,
  ROAD_WIDTH,
} from "../components/worldGeometry";

const INDOOR_CHASE_OFFSET: [number, number, number] = [0, 2.5, -4.8];
const HALL_CAMERA_BOUNDS = {
  minX: MUSEUM_CENTER_X - HALL_HALF_DEPTH + 0.3,
  minZ: MUSEUM_CENTER_Z - HALL_HALF_Z + 0.3,
  maxZ: MUSEUM_CENTER_Z + HALL_HALF_Z - 0.3,
};

/** Imported from Scene rather than copied. It used to be a hand-kept duplicate
 *  with a note admitting as much, which was survivable while it was a name and a
 *  photo — it stopped being survivable when the same object started driving an
 *  entire wall-mounted display. A probe that shows a DIFFERENT portfolio to the
 *  one the app ships is worse than no probe. */
const PORTRAIT = MAHFUZ_PORTRAIT;

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
  // 7 — the approach to the display, from about where the doorway leaves you
  {
    position: [
      MUSEUM_CENTER_X + PORTRAIT_OFFSET_X + 8,
      ROAD_SURFACE_Y,
      MUSEUM_CENTER_Z,
    ],
    rotation: [0, -Math.PI / 2, 0],
  },
  // 8 — pulled up at it, close enough to read the readout
  {
    position: [
      MUSEUM_CENTER_X + PORTRAIT_OFFSET_X + 4.5,
      ROAD_SURFACE_Y,
      MUSEUM_CENTER_Z,
    ],
    rotation: [0, -Math.PI / 2, 0],
  },
  // 9 — driven round the back, where the stack chips are
  {
    position: [
      MUSEUM_CENTER_X + PORTRAIT_OFFSET_X - 5.5,
      ROAD_SURFACE_Y,
      MUSEUM_CENTER_Z,
    ],
    rotation: [0, Math.PI / 2, 0],
  },
  // 10 — nose-on against the display's deck, at the exact x the kerb test stops
  //      the car at: PORTRAIT_HALF_DEPTH + CAR_HALF_WIDTH out from the middle of
  //      the exhibit. The margin is the car's WIDTH whichever way it is pointing,
  //      so a car facing the deck reaches closest — this is the worst case for
  //      bodywork clipping the deck, and the pose to check after any change to
  //      how tall or how wide that deck is.
  {
    position: [
      MUSEUM_CENTER_X + PORTRAIT_OFFSET_X + PORTRAIT_HALF_DEPTH + 0.89,
      ROAD_SURFACE_Y,
      MUSEUM_CENTER_Z,
    ],
    rotation: [0, -Math.PI / 2, 0],
  },
  // 11 — pulled up square to a pedestal on the +z plinth, to read one mark
  {
    position: [MUSEUM_CENTER_X - 2.1, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 12],
    rotation: [0, 0, 0],
  },
  // 12 — the same spot turned down the hall, so several marks line up at once
  //      and the run reads as a sequence rather than as one ornament
  {
    position: [MUSEUM_CENTER_X - 2.1, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 12],
    rotation: [0, -Math.PI / 3, 0],
  },
  // 13 — square to the FIRST pedestal on the +z plinth. The side offset makes it
  //      the Next mark now that the set is eight and the offset is half of it;
  //      it used to be React, which is still the finest shape in the set and
  //      still the one that decides how heavy the others have to be drawn — see
  //      pose 17.
  {
    position: [MUSEUM_CENTER_X - 10.5, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 12],
    rotation: [0, 0, 0],
  },
  // 14-16 — square to the second, third and fourth pedestals of that plinth,
  //      which the offset makes Nest, PostgreSQL and TypeScript. Pedestals are
  //      EXHIBIT_SPACING apart, hence the 4.2 steps. Between them and pose 13
  //      these cover the marks drawn from shapes rather than from primitives, so
  //      they are the ones to look at after any change to how a mark is cut: the
  //      N has to stay inside its disc, the ribbon has to read as a band and not
  //      a triangle, the elephant has to keep both of its waists, and the S has
  //      to stay an S rather than closing up into an 8.
  {
    position: [MUSEUM_CENTER_X - 6.3, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 12],
    rotation: [0, 0, 0],
  },
  {
    position: [MUSEUM_CENTER_X - 2.1, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 12],
    rotation: [0, 0, 0],
  },
  {
    position: [MUSEUM_CENTER_X + 2.1, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 12],
    rotation: [0, 0, 0],
  },
  // 17 — the React atom, which the offset has moved to the −z plinth's third
  //      pedestal. Turned to face it across the hall.
  {
    position: [MUSEUM_CENTER_X - 2.1, ROAD_SURFACE_Y, MUSEUM_CENTER_Z - 12],
    rotation: [0, Math.PI, 0],
  },
  // 18-20 — the portfolio monitor on the back wall, from the three distances it
  //      has to work at: the far end of the hall, mid-room, and pulled right up
  //      under it. The chase camera looks DOWN — about five degrees of sky above
  //      the horizon — so the far pose is the one that decides how much of the
  //      machine is ever in frame without dragging the view, and the near pose is
  //      the one that decides whether the housing's depth reads as depth.
  {
    position: [MUSEUM_CENTER_X + 12, ROAD_SURFACE_Y, MUSEUM_CENTER_Z],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    position: [MUSEUM_CENTER_X - 2, ROAD_SURFACE_Y, MUSEUM_CENTER_Z],
    rotation: [0, -Math.PI / 2, 0],
  },
  {
    position: [MUSEUM_CENTER_X - 10, ROAD_SURFACE_Y, MUSEUM_CENTER_Z + 3],
    rotation: [0, -Math.PI / 2.4, 0],
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

        <Museum
          target={playerCar}
          portrait={PORTRAIT}
          exhibits={stackExhibits}
          lit={inMuseum}
          onOccupancyChange={setInMuseum}
        />

        <Car
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
