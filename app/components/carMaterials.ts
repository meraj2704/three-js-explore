"use client";

/**
 * The car's materials, built once and shared across every mesh that wants one.
 *
 * The rest of this codebase writes materials inline as JSX, which is right when
 * a component has two of them. This car has sixty-odd meshes drawing from a
 * dozen finishes, and inline would mean sixty material objects — sixty uniform
 * blocks uploaded per frame for what is really twelve.
 *
 * None of them is ever written to after it is built. The brake lights change,
 * but they change by <Car> switching a whole group of meshes on rather than by
 * anyone reaching in and turning `tailLight` up: materials come back from a
 * hook, and a value from a hook is not the frame loop's to mutate. That rule is
 * why `brakeLight` exists as its own finish instead of being a number.
 */

import { useEffect, useMemo } from "react";
import {
  Color,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type ColorRepresentation,
  type Texture,
} from "three";

export type CarMaterials = {
  /** Body paint: metallic, under clearcoat. */
  paint: MeshPhysicalMaterial;
  /** Exposed carbon and matte black trim — splitter, skirts, diffuser, wing. */
  carbon: MeshStandardMaterial;
  /** Smoked glass. */
  glass: MeshPhysicalMaterial;
  /** Dark machined alloy: wheels, mirror stalks, exhaust tips. */
  alloy: MeshStandardMaterial;
  tyre: MeshStandardMaterial;
  brakeDisc: MeshStandardMaterial;
  caliper: MeshStandardMaterial;
  /** Voids: intake mouths and vent slots, where light goes in and doesn't come
   *  back. Nearly matte and nearly black, so a hole reads as depth rather than
   *  as a dark sticker. */
  shadow: MeshStandardMaterial;
  headLight: MeshStandardMaterial;
  /** Running tail lights: on whenever the car is. */
  tailLight: MeshStandardMaterial;
  /** The brake filament — same housing, four times the glow. A separate finish
   *  on a separate set of meshes that <Car> makes visible under braking. */
  brakeLight: MeshStandardMaterial;
  /** Underbody LED accent. */
  accent: MeshStandardMaterial;
};

/**
 * @param envMap what the reflective finishes mirror — see useCarEnvMap.
 * @param paint  body colour.
 * @param accent the underbody LED colour, which the headlights also warm toward.
 */
export function useCarMaterials(
  envMap: Texture,
  paint: ColorRepresentation,
  accent: ColorRepresentation,
): CarMaterials {
  const materials = useMemo<CarMaterials>(
    () => ({
      // Nearly full metalness over a nearly black colour, which is what makes
      // this read as paint rather than as plastic: at metalness 1 the base
      // colour tints the REFLECTION instead of showing through it, so the body
      // is lit almost entirely by the environment. The clearcoat on top is the
      // lacquer — a second, sharper specular layer that survives even where the
      // paint under it goes rough, and the reason the highlights have that
      // doubled wet edge.
      paint: new MeshPhysicalMaterial({
        color: paint,
        metalness: 0.9,
        roughness: 0.24,
        clearcoat: 1,
        clearcoatRoughness: 0.045,
        envMap,
        envMapIntensity: 1.7,
      }),

      carbon: new MeshStandardMaterial({
        color: "#0a0a0c",
        metalness: 0.55,
        roughness: 0.42,
        envMap,
        envMapIntensity: 0.7,
      }),

      // Smoked, not tinted: dark enough to hide that there is no interior, but
      // reflective enough to catch the overhead panel across the roof. Kept
      // transparent so the bodywork underneath shows through at glancing angles
      // — with front faces only, that's the paint below the glass and not the
      // inside of the canopy, so there is nothing to sort against.
      glass: new MeshPhysicalMaterial({
        color: "#05070b",
        metalness: 0.25,
        roughness: 0.055,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        transparent: true,
        opacity: 0.84,
        envMap,
        envMapIntensity: 1.7,
      }),

      // Black alloy, and the one place on this car where near-full metalness is
      // wrong. A metal has almost no diffuse response — it shows you the
      // environment and nothing else — and the inside of a wheel arch at night
      // faces an environment that is, correctly, black. At 0.95 the spokes
      // vanished into the tyre and the wheels rendered as holes. Half metal
      // instead: enough to catch a rim highlight, enough diffuse left over that
      // the scene's own lamps still model the spokes as solid objects.
      alloy: new MeshStandardMaterial({
        color: "#3c3f47",
        metalness: 0.5,
        roughness: 0.48,
        envMap,
        envMapIntensity: 0.8,
      }),

      tyre: new MeshStandardMaterial({
        color: "#0c0c0e",
        metalness: 0,
        roughness: 0.94,
      }),

      // Cast iron, not chrome: dull enough that it stays the backdrop the
      // caliper is read against rather than competing with it.
      brakeDisc: new MeshStandardMaterial({
        color: "#54555f",
        metalness: 0.35,
        roughness: 0.66,
        envMap,
        envMapIntensity: 0.4,
      }),

      // Emissive, and not by a little. This is the one bright colour on an
      // otherwise black car, and it lives in the deepest shadow on it — inside
      // a wheel, behind the spokes, under an arch, in a scene lit at 0.18
      // ambient. Lit like the paint it would be the darkest thing on the car
      // rather than the only red on it.
      caliper: new MeshStandardMaterial({
        color: "#e01b1b",
        emissive: new Color("#e01b1b"),
        emissiveIntensity: 3.2,
        metalness: 0.3,
        roughness: 0.4,
      }),

      shadow: new MeshStandardMaterial({
        color: "#050506",
        metalness: 0.2,
        roughness: 0.9,
      }),

      headLight: new MeshStandardMaterial({
        color: "#dbeafe",
        emissive: new Color("#cfe4ff"),
        emissiveIntensity: 3.2,
      }),

      // The gap between these two is deliberately more than a doubling —
      // emissive is tonemapped along with everything else, so a subtle
      // difference in the number is no difference at all on screen.
      //
      // The brake filament is a PURER red than the running light rather than a
      // brighter one. Push the same warm red harder and the red channel clips
      // first, the other two keep climbing, and the lamps come on white: the
      // car reads as having switched its reversing lights on. Taking green and
      // blue out of the emissive leaves nothing to clip toward.
      tailLight: new MeshStandardMaterial({
        color: "#3f0a0a",
        emissive: new Color("#ff2d2d"),
        emissiveIntensity: 1.4,
      }),

      brakeLight: new MeshStandardMaterial({
        color: "#7f0000",
        emissive: new Color("#ff0400"),
        emissiveIntensity: 2.6,
      }),

      accent: new MeshStandardMaterial({
        color: accent,
        emissive: new Color(accent),
        emissiveIntensity: 2.6,
      }),
    }),
    [envMap, paint, accent],
  );

  // Materials hold GPU programs and uniforms; React will happily drop this
  // object on a colour change and leave the old one resident otherwise.
  useEffect(
    () => () => {
      for (const material of Object.values(materials)) material.dispose();
    },
    [materials],
  );

  return materials;
}
