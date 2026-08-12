import { Text } from "@react-three/drei";
import type { ColorRepresentation } from "three";
import { ROAD_WIDTH } from "./worldGeometry";

type GateProps = {
  /** Sign text spanning the crossbar. */
  label?: string;
  /** World-space [x, roadSurfaceY, z] of the gate's center. */
  position?: [number, number, number];
  /** Clearance from the road surface to the underside of the crossbar. The car
   *  is only ~1.3 tall, so this is set by sightlines rather than headroom: the
   *  chase camera pitches down at the car, and anything much higher than this
   *  leaves the frame entirely as you approach. */
  clearance?: number;
  /** Accent color for the sign lettering and its backlight. */
  color?: ColorRepresentation;
};

/** Pillar footprint, and how far the gate straddles the road on each side. */
const GATE_PILLAR_WIDTH = 0.9;
const GATE_SPAN = ROAD_WIDTH / 2 + 0.9;

/**
 * An arch over the road: two pillars, a crossbar, and a sign.
 *
 * The text is drei's <Text>, which renders an SDF glyph atlas on a single quad
 * via troika — sharp at any distance and far cheaper than extruded 3D text.
 */
export function Gate({
  label = "MERN UNIVERSE",
  position = [0, 0, 0],
  clearance = 3.4,
  color = "#38bdf8",
}: GateProps) {
  const barY = clearance + 0.45;

  return (
    <group position={position}>
      {/* Pillars, one either side of the asphalt. */}
      {[-GATE_SPAN, GATE_SPAN].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {/* Shaft. Lifted half its height so its foot sits on the ground. */}
          <mesh position={[0, barY / 2, 0]} castShadow>
            <boxGeometry args={[GATE_PILLAR_WIDTH, barY, GATE_PILLAR_WIDTH]} />
            <meshStandardMaterial
              color="#3f3f46"
              metalness={0.4}
              roughness={0.6}
            />
          </mesh>

          {/* Wider base and cap, so the pillar reads as built rather than
              a bare extrusion. */}
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[1.25, 0.6, 1.25]} />
            <meshStandardMaterial
              color="#27272a"
              metalness={0.4}
              roughness={0.7}
            />
          </mesh>
          <mesh position={[0, barY - 0.1, 0]} castShadow>
            <boxGeometry args={[1.2, 0.24, 1.2]} />
            <meshStandardMaterial
              color="#27272a"
              metalness={0.4}
              roughness={0.7}
            />
          </mesh>
        </group>
      ))}

      {/* Crossbar spanning both pillars. */}
      <mesh position={[0, barY, 0]} castShadow>
        <boxGeometry args={[GATE_SPAN * 2, 1.1, 0.7]} />
        <meshStandardMaterial color="#3f3f46" metalness={0.4} roughness={0.6} />
      </mesh>

      {/* Sign face, sunk into the crossbar so only its front shows. */}
      <mesh position={[0, barY, 0.36]}>
        <boxGeometry args={[GATE_SPAN * 2 - 0.5, 0.82, 0.06]} />
        <meshStandardMaterial color="#18181b" roughness={0.9} />
      </mesh>

      {/* Text on both faces, so the sign reads whichever way you approach.
          anchorX/Y center the glyphs on the mesh origin rather than its corner. */}
      {[
        { z: 0.42, rotation: 0 },
        { z: -0.42, rotation: Math.PI },
      ].map(({ z, rotation }) => (
        <Text
          key={z}
          position={[0, barY, z]}
          rotation={[0, rotation, 0]}
          fontSize={0.62}
          letterSpacing={0.08}
          anchorX="center"
          anchorY="middle"
          color={color}
          outlineWidth={0.012}
          outlineColor="#082f49"
        >
          {label}
        </Text>
      ))}

      {/* Backlight washing the crossbar. Kept tight and tucked just under the
          bar: a wider `distance` reaches down to the road and paints a blue
          blob on the roof of any car passing beneath. */}
      <pointLight
        position={[0, barY - 0.75, 1.1]}
        color={color}
        intensity={12}
        distance={3.6}
        decay={2}
      />
    </group>
  );
}
