import {
  APRON_FAR_X,
  APRON_HALF_Z,
  APRON_NEAR_X,
  BRANCH_Z,
} from "./worldGeometry";

type JunctionApronProps = {
  /** Top of the road slab. */
  surfaceY?: number;
  /** The x bound at the main road, and the one down the branch. Either may be
   *  the greater — the right-hand junction flares the opposite way. */
  nearX?: number;
  farX?: number;
  /** Centerline of the branch this apron serves. */
  centerZ?: number;
};

/**
 * The flared corner where a branch meets the main road.
 *
 * Plain asphalt, no markings. Its extents come from worldGeometry, the same
 * constants isOnPavement tests against, so what you can see is exactly what you
 * can drive on — the widened corner is what makes the turn takeable at speed
 * rather than decoration.
 *
 * Defaults describe the left-hand junction, the one the museum branch leaves
 * from; the right-hand junction passes its own mirrored bounds.
 */
export function JunctionApron({
  surfaceY = -1.5,
  nearX = APRON_NEAR_X,
  farX = APRON_FAR_X,
  centerZ = BRANCH_Z,
}: JunctionApronProps) {
  return (
    <mesh position={[(nearX + farX) / 2, surfaceY, centerZ]} receiveShadow>
      {/* Absolute: a mirrored junction has farX greater than nearX, and a
          negative box extent renders as nothing at all. */}
      <boxGeometry args={[Math.abs(nearX - farX), 0.2, APRON_HALF_Z * 2]} />
      <meshStandardMaterial color="#3f3f46" />
    </mesh>
  );
}
