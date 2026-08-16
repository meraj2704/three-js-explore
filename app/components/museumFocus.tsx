"use client";

/**
 * What happens to the ROOM when the monitor hands you something.
 *
 * The monitor's detail views used to open on the monitor: the panel you touched
 * grew until it filled the screen on the far wall, and you read it from the
 * driver's seat of a car parked six metres away. That is a website in a museum.
 * A machine that can put an interface anywhere should put it in FRONT of you —
 * and the moment it does, the hall behind it has to stop competing, or you are
 * reading a document through a lit room.
 *
 * So this file is the depth of field. It is a render takeover, not an effect
 * hung on the scene:
 *
 *   1. the world is rendered into a buffer WITHOUT the console (one layer is
 *      held back — see FOCUS_LAYER);
 *   2. that buffer is blurred, drained of colour and dimmed, by however much
 *      the console has arrived;
 *   3. the result is composited to the canvas;
 *   4. and only then is the console drawn, once, on a cleared depth buffer, so
 *      it is crisp, whole, and can never be cut in half by a wall or a car.
 *
 * Four things are worth knowing before touching any of it.
 *
 * IT COSTS ONE PASS, NOT TWO. Step 1 is the pass the renderer was going to make
 * anyway — it is merely aimed at a buffer instead of the canvas. What is added
 * is four quarter-area quads and a fullscreen blit, which is nothing next to a
 * hall that already renders itself twice for the floor's mirror.
 *
 * IT ONLY EXISTS WHILE A PANEL IS OPEN. Mount this and R3F stops rendering the
 * frame itself — that is what a useFrame priority above zero MEANS — so the
 * component is mounted by the monitor for exactly as long as something is open
 * and unmounted the instant it closes, at which point the ordinary render path
 * resumes with nothing patched, wrapped or left behind.
 *
 * THE LAYER IS THE WHOLE MECHANISM. Everything docked in front of the viewer is
 * moved to FOCUS_LAYER, which buys three separate things at once: the console is
 * absent from the blurred pass (so it cannot blur itself), absent from the
 * floor's planar reflection (a head-locked panel reflected in the floor is a
 * bright smear that follows you around the room), and present in the crisp pass
 * that follows. It is the cheapest exclusion mechanism three has: one integer
 * per object, tested during traversal, no material writes at all.
 *
 * TONE MAPPING HAPPENS HERE, ONCE. Render targets are written in the working
 * colour space with no tone mapping — three only tone maps when the destination
 * is the canvas — so the composite shader has to do it, and it does it with
 * three's own chunks rather than a hand-rolled ACES so that the blurred room and
 * the console drawn over it can never drift apart.
 */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import {
  Color,
  HalfFloatType,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from "three";
import type { Object3D } from "three";

/** Where anything docked in front of the viewer lives. Layer 1 is otherwise
 *  unused in this scene, and layer 0 is everything else in the world. */
export const FOCUS_LAYER = 1;

/** Move a subtree onto the focus layer.
 *
 *  Called every frame while a panel is open rather than once on mount, and that
 *  is deliberate: troika builds its text meshes asynchronously and drei's
 *  <Sparkles> and friends mount their objects on their own schedule, so a
 *  one-shot traverse leaves whatever arrived late on layer 0 — where it would be
 *  blurred as part of the room and reflected in the floor. A traverse of a couple
 *  of hundred objects writing one integer each is far below the noise floor of a
 *  frame that is already drawing the hall twice. */
export function focusLayer(root: Object3D) {
  root.traverse(assign);
}
const assign = (object: Object3D) => object.layers.set(FOCUS_LAYER);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------------------------------------------------ *
 * The passes
 * ------------------------------------------------------------------ */

/** Both quads are drawn straight in clip space — the geometry is already a
 *  2×2 square about the origin, so there is nothing for a camera to do. */
const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** One direction of a separable gaussian, sampled with the five-tap linear
 *  trick: the hardware's bilinear filter fetches two neighbouring texels per
 *  tap, so five samples cover the nine-tap kernel exactly. */
const BLUR_FRAGMENT = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
  vec2 inner = uStep * 1.3846153846;
  vec2 outer = uStep * 3.2307692308;
  vec4 c = texture2D(tSrc, vUv) * 0.2270270270;
  c += (texture2D(tSrc, vUv + inner) + texture2D(tSrc, vUv - inner)) * 0.3162162162;
  c += (texture2D(tSrc, vUv + outer) + texture2D(tSrc, vUv - outer)) * 0.0702702703;
  gl_FragColor = c;
}
`;

/** The room, put behind the console.
 *
 *  Blur alone is not enough and never looks right on its own: a blurred image
 *  of a neon hall is still a neon hall, and the eye reads bright colour as
 *  foreground however soft it is. So the fall-off is three effects at once —
 *  defocus, desaturation toward the building's own accent, and a straight loss
 *  of exposure — all driven by the same number, which is how far the console has
 *  travelled toward the viewer. */
const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tSharp;
uniform sampler2D tBlur;
uniform float uAmount;
uniform vec3 uTint;
varying vec2 vUv;

void main() {
  vec4 sharp = texture2D(tSharp, vUv);
  vec4 soft = texture2D(tBlur, vUv);
  vec4 c = mix(sharp, soft, uAmount);

  float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 drained = mix(c.rgb, uTint * luma, 0.55) * 0.42;
  c.rgb = mix(c.rgb, drained, uAmount);

  // And darker at the edges than in the middle, because the middle is where the
  // thing you are meant to be reading is about to be.
  float r = length((vUv - 0.5) * vec2(1.3, 1.0));
  c.rgb *= mix(1.0, 0.45 + 0.55 * smoothstep(1.0, 0.15, r), uAmount);

  gl_FragColor = c;

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** How wide the blur opens, in half-resolution texels per tap. Two passes run,
 *  the second at three times the spread of the first, which is what turns a
 *  nine-tap kernel into something wide enough to read as depth of field rather
 *  than as a soft focus filter. */
const BLUR_SPREAD = 2.6;

/** Below this the blur is invisible and the passes are skipped outright — which
 *  is the whole of the first frame of an opening, where the console is still on
 *  the wall and the room is still the picture. */
const BLUR_FLOOR = 0.01;

type Rig = ReturnType<typeof buildRig>;

function buildRig() {
  /* Full resolution and multisampled, because at the start of an opening this
     buffer IS the picture — anything softer or smaller and the room would visibly
     drop a grade the instant a panel was touched. The blur buffers below can be
     as cheap as they like; nobody can resolve a texel through a gaussian. */
  const sharp = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const ping = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
  const pong = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });

  const blur = new ShaderMaterial({
    uniforms: { tSrc: { value: null }, uStep: { value: new Vector2() } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: BLUR_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });

  /* NoBlending on the composite too, and that matters: the canvas is
     transparent (the page's own background is the sky at the far end of the
     road), and the buffer already holds premultiplied colour because three
     blended into it exactly as it would have blended into the canvas. Writing
     it straight through preserves that alpha; blending it would composite the
     room over itself. */
  const composite = new ShaderMaterial({
    uniforms: {
      tSharp: { value: null },
      tBlur: { value: null },
      uAmount: { value: 0 },
      uTint: { value: new Color() },
    },
    vertexShader: QUAD_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
  });

  const quadScene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), blur);
  quad.frustumCulled = false;
  quadScene.add(quad);

  return {
    sharp,
    ping,
    pong,
    blur,
    composite,
    quad,
    quadScene,
    quadCamera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
    buffer: new Vector2(),
  };
}

export function FocusField({
  amount,
  tint,
}: {
  /** How far into focus mode we are: 0 is an untouched room, 1 is fully behind
   *  the console. A ref, because it changes every frame. */
  amount: RefObject<number>;
  /** The hall's own light, which is what the defocused room drains toward. */
  tint: string;
}) {
  const scene = useThree((state) => state.scene);
  const raycaster = useThree((state) => state.raycaster);

  /* Buffers, materials and the quad they are drawn with.
   *
   * In a ref built by a layout effect rather than a memo, and that is not
   * ceremony: everything in here is written to during the frame — render
   * targets are resized, uniforms are swapped between passes, the quad's
   * material is changed three times — and a value a component MEMOISED is a
   * value the compiler is entitled to assume nobody mutates. A ref is the
   * declaration that this is mutable working memory, which is exactly what it
   * is.
   *
   * Built on the frame the monitor spends "arming" — the deliberate frame of
   * warm-up before the animation starts, which exists precisely so that
   * allocations like these never land on the frame a movement begins on. */
  const rig = useRef<Rig | null>(null);

  useLayoutEffect(() => {
    const built = buildRig();
    rig.current = built;
    return () => {
      rig.current = null;
      built.sharp.dispose();
      built.ping.dispose();
      built.pong.dispose();
      built.blur.dispose();
      built.composite.dispose();
      built.quad.geometry.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    if (rig.current) (rig.current.composite.uniforms.uTint.value as Color).set(tint);
  }, [tint]);

  /* Two pieces of scene-wide bookkeeping the layer split makes necessary, both
     of them undone or harmless on the way out.

     The raycaster tests object layers against its own, and its own are layer 0 —
     so without this the console would be visible and completely untouchable.

     Lights are collected during the same traversal that culls by layer, which
     means the crisp pass (which sees ONLY the focus layer) would otherwise be a
     pass with no lights in it, and every standard material in the console would
     drop to its emissive term alone. Enabling the focus layer on the lights
     costs the room nothing: a light on layers 0 and 1 is still a light on layer
     0 everywhere else. */
  useEffect(() => {
    raycaster.layers.enable(FOCUS_LAYER);
    scene.traverse((object) => {
      if ((object as { isLight?: boolean }).isLight) object.layers.enable(FOCUS_LAYER);
    });
    return () => {
      raycaster.layers.disable(FOCUS_LAYER);
    };
  }, [raycaster, scene]);

  /* Priority 1. Everything below this line is the frame — R3F draws nothing of
     its own while this subscription exists. The floor's reflector runs at
     priority 0, so its buffer is already filled and released by the time we
     get here. */
  useFrame((state) => {
    const parts = rig.current;
    if (!parts) return;
    /* The renderer, the scene and the camera come off the frame's own state
       rather than out of a hook, because half of what happens below is a WRITE
       to the renderer — the clear policy, the shadow map, the camera's layers —
       and those are exactly the writes a component is not allowed to make to
       something a hook handed it. */
    const { gl, scene: world, camera } = state;
    const strength = clamp01(amount.current ?? 0);

    gl.getDrawingBufferSize(parts.buffer);
    const width = Math.max(1, Math.floor(parts.buffer.x));
    const height = Math.max(1, Math.floor(parts.buffer.y));
    if (parts.sharp.width !== width || parts.sharp.height !== height) {
      parts.sharp.setSize(width, height);
      // Half linear resolution, a quarter of the pixels, and the blur is what
      // hides the resample — these are the buffers in the file that can be
      // cheap without anyone being able to tell.
      parts.ping.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
      parts.pong.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
    }

    const autoClear = gl.autoClear;
    const shadowAutoUpdate = gl.shadowMap.autoUpdate;
    const layers = camera.layers.mask;

    // 1. The room, without whatever is docked in front of it.
    camera.layers.disable(FOCUS_LAYER);
    gl.autoClear = true;
    gl.setRenderTarget(parts.sharp);
    gl.render(world, camera);

    gl.autoClear = false;
    // The shadow map was rebuilt by the pass above; the passes below must not
    // rebuild it again for a quad and a console that cast nothing.
    gl.shadowMap.autoUpdate = false;

    // 2. Two separable passes, widening.
    let soft = parts.sharp.texture;
    if (strength > BLUR_FLOOR) {
      const w = parts.ping.width;
      const h = parts.ping.height;
      parts.quad.material = parts.blur;
      parts.blur.uniforms.tSrc.value = parts.sharp.texture;
      for (let pass = 0; pass < 2; pass++) {
        const spread = BLUR_SPREAD * (1 + pass * 2) * strength;
        (parts.blur.uniforms.uStep.value as Vector2).set(spread / w, 0);
        gl.setRenderTarget(parts.pong);
        gl.render(parts.quadScene, parts.quadCamera);

        parts.blur.uniforms.tSrc.value = parts.pong.texture;
        (parts.blur.uniforms.uStep.value as Vector2).set(0, spread / h);
        gl.setRenderTarget(parts.ping);
        gl.render(parts.quadScene, parts.quadCamera);

        parts.blur.uniforms.tSrc.value = parts.ping.texture;
      }
      soft = parts.ping.texture;
    }

    // 3. To the canvas, tone mapped and encoded on the way out.
    parts.quad.material = parts.composite;
    parts.composite.uniforms.tSharp.value = parts.sharp.texture;
    parts.composite.uniforms.tBlur.value = soft;
    parts.composite.uniforms.uAmount.value = strength;
    gl.setRenderTarget(null);
    gl.clear(true, true, true);
    gl.render(parts.quadScene, parts.quadCamera);

    // 4. And the console over the top of it, on a depth buffer that was just
    //    cleared — which is what makes it whole from any angle, at any distance,
    //    with a car or a wall or the far end of the hall behind it.
    camera.layers.set(FOCUS_LAYER);
    gl.render(world, camera);

    camera.layers.mask = layers;
    gl.autoClear = autoClear;
    gl.shadowMap.autoUpdate = shadowAutoUpdate;
  }, 1);

  return null;
}
