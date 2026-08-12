"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { RefObject } from "react";
import type { Group } from "three";

import {
  FORECOURT_DEPTH,
  FORECOURT_HALF_Z,
  HALL_HALF_Z,
  MUSEUM_CENTER_X,
  MUSEUM_CENTER_Z,
  MUSEUM_DEPTH,
  MUSEUM_DOOR_HALF_WIDTH,
  MUSEUM_DOOR_HEIGHT,
  MUSEUM_GROUNDS_ENTER_X,
  MUSEUM_GROUNDS_EXIT_X,
  MUSEUM_HALF_WIDTH,
  MUSEUM_HEIGHT,
  MUSEUM_PLINTH_DEPTH,
  MUSEUM_PLINTH_HEIGHT,
  MUSEUM_WALL,
  ROAD_SURFACE_Y,
} from "./worldGeometry";

type MuseumProps = {
  /** The car, so the museum can tell when someone has driven onto its grounds. */
  target: RefObject<Group | null>;
  /** Bring the hall lights up. Driven by the flag this component reports, which
   *  the parent owns — the museum has no second copy of that state. */
  lit?: boolean;
  /** Fired once on each crossing of the grounds boundary, not every frame. */
  onOccupancyChange?: (occupied: boolean) => void;
};

/* Everything below is in the museum's own frame: the group sits on the middle
 * of the footprint at road height, +x points out through the doors, and y = 0
 * is the floor the car drives on. */
const HALF_DEPTH = MUSEUM_DEPTH / 2;
const HALF_WIDTH = MUSEUM_HALF_WIDTH;

/** Inner face of the front and back walls. */
const INNER_X = HALF_DEPTH - MUSEUM_WALL;

/** Stone base under the building. The scene has no ground plane — roads float
 *  in the dark — so without this the walls would end at a hard edge in mid-air. */
const BASE_THICKNESS = 0.9;

/** Walls run from just under the floor to just under the roof, overlapping both
 *  by a hair. Two boxes that merely touch put their faces at the same depth and
 *  set the depth buffer fighting over which one is in front. */
const WALL_SINK = 0.1;
const WALL_HEIGHT = MUSEUM_HEIGHT + WALL_SINK;
const WALL_Y = WALL_HEIGHT / 2 - WALL_SINK;

/** Pier either side of the doorway: what's left of the facade once the opening
 *  is taken out of it. */
const PIER_WIDTH = HALF_WIDTH - MUSEUM_DOOR_HALF_WIDTH;
const PIER_Z = (HALF_WIDTH + MUSEUM_DOOR_HALF_WIDTH) / 2;
const FACADE_X = HALF_DEPTH - MUSEUM_WALL / 2;

/** The two blocks flanking the entrance, carrying the columns.
 *
 * Their inner faces sit at exactly FORECOURT_HALF_Z. That isn't an aesthetic
 * choice: the crash test lets the car's centre reach FORECOURT_HALF_Z - (half a
 * car), so its flank arrives at FORECOURT_HALF_Z at the same instant. Any
 * further in and the car would visibly clip stone before crashing. */
const WING_INNER_Z = FORECOURT_HALF_Z;
const WING_Z = (WING_INNER_Z + HALF_WIDTH) / 2;
const WING_WIDTH = HALF_WIDTH - WING_INNER_Z;
const WING_PROJECTION = 2.6;
const WING_X = HALF_DEPTH + WING_PROJECTION / 2;

/** Roof overhang, and where the main slab stops. The wing cornices butt against
 *  it rather than overlapping it, for the same depth-buffer reason as above. */
const EAVES = 0.6;
const ROOF_EDGE_X = HALF_DEPTH + EAVES;

/** Exhibit positions along each plinth. */
const EXHIBIT_X = [-4.2, 0, 4.2];
const PLINTH_Z = HALL_HALF_Z + MUSEUM_PLINTH_DEPTH / 2;

/** Pedestal top — where the exhibits themselves stand. */
const PEDESTAL_HEIGHT = 1.1;
const PEDESTAL_TOP = MUSEUM_PLINTH_HEIGHT + PEDESTAL_HEIGHT;

/**
 * The museum at the end of the branch — a building you drive into, not a prop.
 *
 * It takes no position or size props. Its whole footprint comes from
 * worldGeometry, because isOnPavement reads those same numbers to decide where
 * the car may go: the doorway you can see is the doorway you can drive through,
 * and the walls beside it are solid to the car precisely because they look it.
 */
export function Museum({ target, lit = false, onOccupancyChange }: MuseumProps) {
  // Latched here rather than compared against a prop, because the parent's
  // state update lands a render later — without the ref this would fire the
  // callback again on every frame in between.
  const occupied = useRef(false);

  useFrame(() => {
    const car = target.current;
    if (!car) return;

    // x alone is enough: everything drivable out here is museum grounds, so
    // there is nowhere else the car could be. The two thresholds are what stop
    // a car idling on the line from flickering the flag frame to frame.
    const next = occupied.current
      ? car.position.x < MUSEUM_GROUNDS_EXIT_X
      : car.position.x <= MUSEUM_GROUNDS_ENTER_X;

    if (next === occupied.current) return;
    occupied.current = next;
    onOccupancyChange?.(next);
  });

  return (
    <group position={[MUSEUM_CENTER_X, ROAD_SURFACE_Y, MUSEUM_CENTER_Z]}>
      {/* Floor and base in one slab: the top face is the polished hall floor,
          the sides are the plinth the building stands on. */}
      <mesh position={[0, -BASE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[HALF_DEPTH * 2, BASE_THICKNESS, HALF_WIDTH * 2]} />
        <meshStandardMaterial color="#2e2b33" metalness={0.35} roughness={0.28} />
      </mesh>

      {/* Forecourt, laid at road height so the car drives straight off the
          branch and in through the doors with no ramp and no change in y. */}
      <mesh
        position={[HALF_DEPTH + FORECOURT_DEPTH / 2, -0.1, 0]}
        receiveShadow
      >
        <boxGeometry args={[FORECOURT_DEPTH, 0.2, FORECOURT_HALF_Z * 2]} />
        <meshStandardMaterial color="#46434c" roughness={0.85} />
      </mesh>

      {/* Back wall */}
      <mesh position={[-FACADE_X, WALL_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[MUSEUM_WALL, WALL_HEIGHT, HALF_WIDTH * 2]} />
        <meshStandardMaterial color="#ddd5c6" roughness={0.75} />
      </mesh>

      {/* Side walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={`side${side}`}
          position={[0, WALL_Y, side * (HALF_WIDTH - MUSEUM_WALL / 2)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[HALF_DEPTH * 2, WALL_HEIGHT, MUSEUM_WALL]} />
          <meshStandardMaterial color="#ddd5c6" roughness={0.75} />
        </mesh>
      ))}

      {/* Facade: a pier either side of the opening, and a lintel across it. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`pier${side}`}
          position={[FACADE_X, WALL_Y, side * PIER_Z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[MUSEUM_WALL, WALL_HEIGHT, PIER_WIDTH]} />
          <meshStandardMaterial color="#e7e0d2" roughness={0.7} />
        </mesh>
      ))}
      <mesh
        position={[
          FACADE_X,
          (MUSEUM_DOOR_HEIGHT + MUSEUM_HEIGHT) / 2,
          0,
        ]}
        castShadow
      >
        <boxGeometry
          args={[
            MUSEUM_WALL,
            MUSEUM_HEIGHT - MUSEUM_DOOR_HEIGHT,
            MUSEUM_DOOR_HALF_WIDTH * 2,
          ]}
        />
        <meshStandardMaterial color="#e7e0d2" roughness={0.7} />
      </mesh>

      {/* Entrance wings, standing on their own stone down to the base. */}
      {[-1, 1].map((side) => (
        <group key={`wing${side}`} position={[0, 0, side * WING_Z]}>
          <mesh
            position={[WING_X, (MUSEUM_HEIGHT - BASE_THICKNESS) / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[
                WING_PROJECTION,
                MUSEUM_HEIGHT + BASE_THICKNESS,
                WING_WIDTH,
              ]}
            />
            <meshStandardMaterial color="#e7e0d2" roughness={0.7} />
          </mesh>

          {/* Cornice. Starts where the main roof's overhang stops, so the two
              slabs share an edge instead of overlapping faces. */}
          <mesh
            position={[
              (ROOF_EDGE_X + HALF_DEPTH + WING_PROJECTION + 0.3) / 2,
              MUSEUM_HEIGHT + 0.3,
              0,
            ]}
            castShadow
          >
            <boxGeometry
              args={[
                HALF_DEPTH + WING_PROJECTION + 0.3 - ROOF_EDGE_X,
                0.8,
                WING_WIDTH + 0.6,
              ]}
            />
            <meshStandardMaterial color="#b3a692" roughness={0.75} />
          </mesh>

          {/* Engaged columns, half-sunk into the wing's front face. Cheaper than
              free-standing ones and they can't end up in the car's way. */}
          {[-0.7, 0.7].map((offset) => (
            <mesh
              key={offset}
              position={[
                HALF_DEPTH + WING_PROJECTION,
                MUSEUM_HEIGHT / 2,
                offset,
              ]}
              castShadow
            >
              <cylinderGeometry args={[0.32, 0.36, MUSEUM_HEIGHT, 14]} />
              <meshStandardMaterial color="#f2ece1" roughness={0.65} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Roof slab, oversized so it reads as an overhang. Sunk 0.1 so its
          underside overlaps the wall tops rather than meeting them flush. */}
      <mesh position={[0, MUSEUM_HEIGHT + 0.25, 0]} castShadow>
        <boxGeometry args={[ROOF_EDGE_X * 2, 0.7, (HALF_WIDTH + EAVES) * 2]} />
        <meshStandardMaterial color="#b3a692" roughness={0.75} />
      </mesh>

      {/* Sign across the lintel. drei's <Text> is unlit by default, so it reads
          at full brightness without spending a light on it. */}
      <Text
        position={[HALF_DEPTH + 0.06, MUSEUM_HEIGHT - 1.2, 0]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.9}
        letterSpacing={0.22}
        anchorX="center"
        anchorY="middle"
        color="#fbbf24"
        outlineWidth={0.015}
        outlineColor="#451a03"
      >
        MUSEUM
      </Text>

      {/* Plinths down both side walls. These are the hall's real edges — the
          drivable floor stops exactly where they start. */}
      {[-1, 1].map((side) => (
        <group key={`gallery${side}`} position={[0, 0, side * PLINTH_Z]}>
          <mesh position={[0, MUSEUM_PLINTH_HEIGHT / 2, 0]} receiveShadow>
            <boxGeometry
              args={[INNER_X * 2, MUSEUM_PLINTH_HEIGHT, MUSEUM_PLINTH_DEPTH]}
            />
            <meshStandardMaterial color="#4a4550" roughness={0.6} />
          </mesh>

          {EXHIBIT_X.map((x, i) => (
            <group key={x} position={[x, 0, 0]}>
              {/* Pedestal */}
              <mesh
                position={[0, MUSEUM_PLINTH_HEIGHT + PEDESTAL_HEIGHT / 2, 0]}
                castShadow
              >
                <boxGeometry args={[1, PEDESTAL_HEIGHT, 1]} />
                <meshStandardMaterial color="#e7e0d2" roughness={0.7} />
              </mesh>

              {/* Exhibit. Emissive so each one carries its own glow instead of
                  needing a light over it — a spotlit gallery would cost one
                  pointLight per case. */}
              <mesh position={[0, PEDESTAL_TOP + 0.45, 0]} castShadow>
                {i === 0 ? (
                  <icosahedronGeometry args={[0.45, 0]} />
                ) : i === 1 ? (
                  <torusGeometry args={[0.34, 0.13, 12, 24]} />
                ) : (
                  <octahedronGeometry args={[0.5, 0]} />
                )}
                <meshStandardMaterial
                  color={side > 0 ? "#7dd3fc" : "#fca5a5"}
                  emissive={side > 0 ? "#0ea5e9" : "#ef4444"}
                  emissiveIntensity={lit ? 0.9 : 0.45}
                  metalness={0.5}
                  roughness={0.3}
                />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Artwork on the back wall, so there is something to drive up to. */}
      <mesh position={[-INNER_X + 0.05, 3.4, 0]}>
        <boxGeometry args={[0.08, 3.9, 9.6]} />
        <meshStandardMaterial color="#1c1917" roughness={0.9} />
      </mesh>
      <mesh position={[-INNER_X + 0.12, 3.4, 0]}>
        <boxGeometry args={[0.06, 3.2, 8.8]} />
        <meshStandardMaterial
          color="#312e81"
          emissive="#4338ca"
          emissiveIntensity={lit ? 0.55 : 0.25}
          roughness={0.5}
        />
      </mesh>

      {/* Ceiling strips. Emissive only — they look like the source, but it's the
          single pointLight below that actually lights the hall. */}
      {[-3.6, 3.6].map((z) => (
        <mesh key={z} position={[0, MUSEUM_HEIGHT - 0.12, z]}>
          <boxGeometry args={[10, 0.16, 0.7]} />
          <meshStandardMaterial
            color="#fff7ed"
            emissive="#ffedd5"
            emissiveIntensity={lit ? 2 : 0.15}
          />
        </mesh>
      ))}

      {/* The hall's only real light, and it only exists while someone is here.
          Every light in a forward renderer is evaluated for every lit fragment
          whether or not it reaches — the street lamps budget four for the whole
          scene, so this one does not get to burn a fifth while nobody is inside.
          distance clears the room diagonal; without that the corners go black.
          No castShadow: a shadow-casting pointLight renders a six-face cube map. */}
      {lit && (
        <pointLight
          position={[0, MUSEUM_HEIGHT - 1.4, 0]}
          color="#ffe9c9"
          intensity={150}
          distance={26}
          decay={2}
        />
      )}
    </group>
  );
}
