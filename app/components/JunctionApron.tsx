import {
  APRON_FAR_X,
  APRON_HALF_Z,
  APRON_NEAR_X,
  BRANCH_Z,
} from "./worldGeometry";

/**
 * The flared corner where the branch meets the main road.
 *
 * Plain asphalt, no markings. Its extents come from worldGeometry, the same
 * constants isOnPavement tests against, so what you can see is exactly what you
 * can drive on — the widened corner is what makes the left turn takeable at
 * speed rather than decoration.
 */
export function JunctionApron({ surfaceY = -1.5 }: { surfaceY?: number }) {
  return (
    <mesh
      position={[(APRON_NEAR_X + APRON_FAR_X) / 2, surfaceY, BRANCH_Z]}
      receiveShadow
    >
      <boxGeometry args={[APRON_NEAR_X - APRON_FAR_X, 0.2, APRON_HALF_Z * 2]} />
      <meshStandardMaterial color="#3f3f46" />
    </mesh>
  );
}
