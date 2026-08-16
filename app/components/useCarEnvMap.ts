"use client";

/**
 * The environment the car's paint reflects.
 *
 * Glossy black is not a colour, it is a mirror. A metallic material with nothing
 * to reflect renders as a flat black cutout no matter how the lights are set —
 * every highlight you read as "polished" is the surface showing you something
 * else in the room. So the car needs an environment map, and this builds one.
 *
 * Built in code rather than loaded. An HDRI would be sharper, but it is a file
 * fetched over the network at a size that dwarfs the rest of this app, and a
 * night scene wants a handful of hard sources against near-black — which is a
 * few gaussians, not a photograph.
 *
 * It is attached to the car's materials directly and NOT set as
 * `scene.environment`, which would light every other material in the world with
 * it. The museums, the road and the lamps are lit the way they are on purpose;
 * this is the car's mirror, and nothing else should be looking into it.
 */

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import {
  DataTexture,
  DataUtils,
  EquirectangularReflectionMapping,
  HalfFloatType,
  PMREMGenerator,
  RGBAFormat,
  type Texture,
} from "three";

/** Equirectangular, so twice as wide as tall. Small on purpose: PMREM blurs it
 *  into roughness levels anyway, and every reflection here is either a soft
 *  gradient or a source big enough to survive at this resolution. */
const WIDTH = 128;
const HEIGHT = 64;

/**
 * One light in the reflected world: a gaussian blob at (u, v), `du` and `dv`
 * wide, `i` bright.
 *
 * u wraps 0..1 around the horizon; v runs 0 straight down to 1 straight up.
 *
 * Values above 1 are the reason this texture is half-float rather than bytes.
 * A source clamped to white reflects as a grey smudge; one at 7 blows out into
 * a hard clipped streak with a falloff around it, which is what a highlight on
 * polished paint looks like.
 */
type Emitter = {
  u: number;
  v: number;
  du: number;
  dv: number;
  i: number;
  /** 0 = cold white, 1 = sodium orange. */
  warm: number;
};

/**
 * The lighting rig, borrowed wholesale from how cars are actually photographed.
 *
 * The overhead panel is the important one: it is what draws the long soft
 * highlight down the middle of the bonnet and across the roof, and without it
 * the upper surfaces have nothing to catch. The two tall strips off each
 * shoulder do the same job for the flanks, and because they are narrow in u
 * they sweep as the car turns — that travelling streak down the door is most of
 * what sells the paint as wet-looking.
 *
 * The three sodium blobs at the horizon are the scene's own street lamps,
 * roughly. They are what stops the reflections reading as a studio shot pasted
 * onto a night road.
 */
const EMITTERS: Emitter[] = [
  { u: 0.5, v: 0.99, du: 1, dv: 0.19, i: 2.6, warm: 0.15 },
  { u: 0.17, v: 0.66, du: 0.035, dv: 0.26, i: 7, warm: 0.1 },
  { u: 0.68, v: 0.64, du: 0.03, dv: 0.24, i: 5.5, warm: 0.05 },
  { u: 0.02, v: 0.545, du: 0.02, dv: 0.03, i: 6, warm: 1 },
  { u: 0.42, v: 0.55, du: 0.025, dv: 0.035, i: 4.5, warm: 1 },
  { u: 0.88, v: 0.54, du: 0.02, dv: 0.03, i: 5, warm: 1 },
];

const COLD: [number, number, number] = [0.86, 0.92, 1];
const SODIUM: [number, number, number] = [1, 0.72, 0.42];

/** Paints the equirectangular source: a dim sky, a near-black ground, a band of
 *  haze where they meet, and the emitters on top. */
function paintEnvironment(): DataTexture {
  const data = new Uint16Array(WIDTH * HEIGHT * 4);

  for (let y = 0; y < HEIGHT; y++) {
    // Rows run bottom-up. DataTexture leaves flipY off, and three samples an
    // equirect map with v = 0.5 + asin(dir.y) / PI — so v = 1 is straight up,
    // and the LAST row is the sky. Get this backwards and the car reflects the
    // road above it and the sky below, which looks subtly, unplaceably wrong.
    const v = (y + 0.5) / HEIGHT;

    for (let x = 0; x < WIDTH; x++) {
      const u = (x + 0.5) / WIDTH;

      // Base gradient. The ground is darker than the sky by more than seems
      // reasonable, because asphalt at night genuinely is — and the contrast
      // between the two halves is what draws the horizon line across the flanks.
      const sky = v > 0.5;
      let r = sky ? 0.02 + (1 - v) * 0.05 : 0.006;
      let g = sky ? 0.026 + (1 - v) * 0.06 : 0.008;
      let b = sky ? 0.045 + (1 - v) * 0.09 : 0.012;

      // Haze along the horizon, squared so it stays tight to the line.
      const horizon = Math.max(0, 1 - Math.abs(v - 0.5) * 7) ** 2 * 0.3;
      r += horizon;
      g += horizon * 0.82;
      b += horizon * 0.6;

      for (const e of EMITTERS) {
        // u is an angle, so the short way round the circle — an emitter at 0.02
        // is next to one at 0.98, not most of a turn away.
        const raw = Math.abs(u - e.u);
        const du = Math.min(raw, 1 - raw) / e.du;
        const dv = (v - e.v) / e.dv;
        const fall = Math.exp(-(du * du + dv * dv));
        if (fall < 0.002) continue;

        const strength = fall * e.i;
        r += strength * (COLD[0] + (SODIUM[0] - COLD[0]) * e.warm);
        g += strength * (COLD[1] + (SODIUM[1] - COLD[1]) * e.warm);
        b += strength * (COLD[2] + (SODIUM[2] - COLD[2]) * e.warm);
      }

      const i = (y * WIDTH + x) * 4;
      data[i] = DataUtils.toHalfFloat(r);
      data[i + 1] = DataUtils.toHalfFloat(g);
      data[i + 2] = DataUtils.toHalfFloat(b);
      data[i + 3] = DataUtils.toHalfFloat(1);
    }
  }

  const texture = new DataTexture(
    data,
    WIDTH,
    HEIGHT,
    RGBAFormat,
    HalfFloatType,
  );
  texture.mapping = EquirectangularReflectionMapping;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the map once and hands back its texture.
 *
 * PMREM is what turns a flat panorama into something a rough material can use:
 * it pre-blurs the map into a chain of roughness levels, so the clearcoat gets
 * a mirror and the tyres get a dim wash from the same source. Doing it by hand
 * is the alternative, and the alternative is worse.
 *
 * Only callable from inside a <Canvas> — it needs the renderer to prefilter
 * with, which is also why the work can't happen at module scope.
 */
export function useCarEnvMap(): Texture {
  const renderer = useThree((state) => state.gl);

  const target = useMemo(() => {
    const source = paintEnvironment();
    const pmrem = new PMREMGenerator(renderer);
    const prefiltered = pmrem.fromEquirectangular(source);
    // Both inputs are spent the moment the render target exists; only the
    // target's texture is read from here on.
    pmrem.dispose();
    source.dispose();
    return prefiltered;
  }, [renderer]);

  useEffect(() => () => target.dispose(), [target]);

  return target.texture;
}
