"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Fog } from "three";

/** Linear fog as [near, far]: untouched up to `near`, fog colour by `far`. */
type FogRange = [number, number];

/** Outdoors. Bites early and is opaque well before the end of the road, so the
 *  far end dissolves into the page's background instead of stopping dead in
 *  mid-air. This is the number the whole night look is built on — the lamps only
 *  read as light sources because everything past them is gone. */
const OUTDOOR_FOG: FogRange = [8, 40];

/** Indoors. The same haze, pushed back past the far wall.
 *
 *  A hall is MUSEUM_DEPTH deep and the camera sits several units BEHIND the car,
 *  so at the road's 40 the back of the gallery — the last exhibits, the artwork
 *  wall — would already be solid fog while you were still on the threshold. That
 *  is the whole hall gone at exactly the moment you drive in to look at it.
 *
 *  Not switched off, though: some haze down the length of the room is what makes
 *  it read as long. Keep `far` comfortably past the deepest hall plus the camera
 *  seat, and no further. */
const INDOOR_FOG: FogRange = [10, 90];

/** Matches the page's bg-zinc-950, so what the fog dissolves into is the page. */
const FOG_COLOR = "#09090b";

type SceneFogProps = {
  /** Is the car in a building? Drives which range the fog eases toward. */
  indoors?: boolean;
  outdoor?: FogRange;
  indoor?: FogRange;
  /** How fast the change happens, per second. Deliberately slacker than the
   *  chase camera's: the swap fires a full forecourt from the doors, out in the
   *  open, and a fog plane that snapped would be seen as the world behind you
   *  popping into view. Slow enough and it reads as your eyes adjusting. */
  stiffness?: number;
};

/**
 * The scene's fog, and the one thing that changes about it: it lifts while the
 * car is on museum grounds and settles back on the way out.
 *
 * Its own component because it needs useFrame, which only works inside <Canvas>,
 * and the state it follows lives in the component that RENDERS the canvas.
 * Nothing here is React state — the fog object is mutated in place, so easing it
 * costs no renders.
 */
export function SceneFog({
  indoors = false,
  outdoor = OUTDOOR_FOG,
  indoor = INDOOR_FOG,
  stiffness = 1.1,
}: SceneFogProps) {
  const fog = useRef<Fog>(null);

  useFrame((_, delta) => {
    const f = fog.current;
    if (!f) return;

    const [near, far] = indoors ? indoor : outdoor;

    // Same frame-rate independent easing as the chase camera: 1 - e^(-k·dt),
    // so the transition takes the same wall-clock time at 30fps and 144fps.
    const alpha = 1 - Math.exp(-stiffness * delta);
    f.near += (near - f.near) * alpha;
    f.far += (far - f.far) * alpha;
  });

  // `args` is only the starting state — after mount the ref above owns near and
  // far, so changing the props re-creates the fog rather than animating it.
  return <fog ref={fog} attach="fog" args={[FOG_COLOR, ...outdoor]} />;
}
