import type { ColorRepresentation } from "three";
import { ROAD_LENGTH, ROAD_WIDTH } from "./worldGeometry";

type RoadProps = {
  /** How far the road runs along z. */
  length?: number;
  /** How wide it is across x. */
  width?: number;
  /** Slab thickness along y. */
  thickness?: number;
  /** World-space [x, y, z] of the road's center. */
  position?: [number, number, number];
  /** Asphalt color. */
  color?: ColorRepresentation;
  /** Yaw in radians. Math.PI / 2 turns the road to run along x instead of z. */
  rotation?: [number, number, number];
  /** Draw the dashed centerline. Off for short connectors and junctions. */
  centerLine?: boolean;
  /** Draw the solid edge lines. Off where a road meets another at a junction,
   *  since a painted edge across an open mouth looks like a wall. */
  edgeLines?: boolean;
};

/** Length of one dash in the center line, and the gap after it. */
const DASH_LENGTH = 2;
const DASH_GAP = 2;

/**
 * A road is just a very anisotropic box: wide on x, paper-thin on y, long on z.
 * Slab + markings live in one <group> so the whole thing moves as a unit.
 */
export function Road({
  length = ROAD_LENGTH,
  width = ROAD_WIDTH,
  thickness = 0.2,
  position = [0, 0, 0],
  color = "#3f3f46",
  rotation = [0, 0, 0],
  centerLine = true,
  edgeLines = true,
}: RoadProps) {
  // z offset of each dash, walking from the back of the road to the front.
  const stride = DASH_LENGTH + DASH_GAP;
  const dashCount = Math.floor(length / stride);
  const dashOffsets = Array.from(
    { length: dashCount },
    (_, i) => -length / 2 + stride * (i + 0.5),
  );

  // Markings sit at y = thickness / 2 — the slab's top face — so each marking box
  // is half-buried in the asphalt. No two faces end up coplanar, which is what
  // causes z-fighting (the depth buffer can't decide which surface is in front).
  const markingY = thickness / 2;
  const edgeX = width / 2 - 0.35;

  return (
    <group position={position} rotation={rotation}>
      {/* Asphalt */}
      <mesh receiveShadow>
        <boxGeometry args={[width, thickness, length]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Dashed center line */}
      {centerLine &&
        dashOffsets.map((z) => (
          <mesh key={z} position={[0, markingY, z]}>
            <boxGeometry args={[0.16, 0.02, DASH_LENGTH]} />
            <meshStandardMaterial color="#fafafa" />
          </mesh>
        ))}

      {/* Solid edge lines, one per side */}
      {edgeLines &&
        [-edgeX, edgeX].map((x) => (
          <mesh key={x} position={[x, markingY, 0]}>
            <boxGeometry args={[0.12, 0.02, length]} />
            <meshStandardMaterial color="#fafafa" />
          </mesh>
        ))}
    </group>
  );
}
