import type { ColorRepresentation } from "three";

type StreetLampProps = {
  /** Base of the pole: [x, roadSurfaceY, z]. */
  position?: [number, number, number];
  /** Yaw in radians. The arm reaches along x by default; a quarter turn points
   *  it along z instead, for lamps beside a road that runs east-west. */
  rotation?: [number, number, number];
  /** Pole height from base to the arm. */
  height?: number;
  /** How far the arm reaches over the road. Negative reaches the other way. */
  reach?: number;
  /** Brightness of the cast pool of light. */
  intensity?: number;
  /** Lamp color — warm sodium by default. */
  color?: ColorRepresentation;
  /** Cast real shadows. Off by default: a shadow-casting pointLight renders the
   *  scene to a cube map — six passes each — so a road full of them tanks the
   *  frame rate. Enable it on the couple nearest the camera, not all of them. */
  castShadow?: boolean;
  /** Attach a real pointLight. When false the lamp is geometry only: the head
   *  still glows (emissive costs nothing) but it lights nothing around it. */
  lit?: boolean;
};

/**
 * A lamp post: pole + arm + glowing head, with a real <pointLight> inside the head.
 * The geometry alone doesn't light anything — the emissive material only makes the
 * bulb look bright; it's the pointLight that actually spills onto the asphalt.
 */
export function StreetLamp({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  height = 4.5,
  reach = 1.2,
  intensity = 100,
  color = "#ffd9a0",
  castShadow = false,
  lit = true,
}: StreetLampProps) {
  // The arm reaches horizontally from the pole top; the head hangs at its end.
  const headX = reach;
  const headY = height - 0.15;

  return (
    <group position={position} rotation={rotation}>
      {/* Pole. Cylinder geometry is centered on its own origin, so lifting it by
          height/2 puts its foot exactly on the group's base. */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, height, 12]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Horizontal arm, rotated a quarter turn so the cylinder lies along x. */}
      <mesh
        position={[reach / 2, height, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.06, 0.06, Math.abs(reach), 10]} />
        <meshStandardMaterial color="#52525b" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Lamp head — emissive so it reads as the source, not a lit grey box. */}
      <mesh position={[headX, headY, 0]}>
        <boxGeometry args={[0.5, 0.16, 0.32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2}
        />
      </mesh>

      {/* The actual light. decay=2 is physically correct inverse-square falloff,
          which means intensity has to be large to survive the ~6 unit drop to the
          road; distance caps its reach so it fades out instead of washing the scene. */}
      {lit && (
        <pointLight
          position={[headX, headY - 0.2, 0]}
          color={color}
          intensity={intensity}
          distance={16}
          decay={2}
          castShadow={castShadow}
          shadow-mapSize={[512, 512]}
          shadow-bias={-0.005}
        />
      )}
    </group>
  );
}
