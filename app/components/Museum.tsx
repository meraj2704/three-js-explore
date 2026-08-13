"use client";

import { Text, useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { SRGBColorSpace } from "three";
import type { Group } from "three";

import {
  PORTRAIT_HALF_DEPTH,
  PORTRAIT_HALF_Z,
  PORTRAIT_OFFSET_X,
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

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ *
 * The footprint the building is drawn from — and the footprint the CAR
 * is let onto: isOnPavement reads these same numbers to decide where you
 * can drive. The doorway you see is the doorway you drive through only
 * because both come from one object.
 *
 * That coupling is why the defaults live in worldGeometry. Reskinning a
 * museum (name / theme / exhibits) is free. RELOCATING or RESIZING one is
 * not: if you override `geometry`, you MUST feed the same values to
 * isOnPavement, or the visible walls and the invisible collision walls
 * drift apart and the car clips stone or floats through it.
 */
export type MuseumGeometry = {
  depth: number;
  halfWidth: number;
  height: number;
  wall: number;
  doorHalfWidth: number;
  doorHeight: number;
  plinthDepth: number;
  plinthHeight: number;
  hallHalfZ: number;
  forecourtDepth: number;
  forecourtHalfZ: number;
  centerX: number;
  centerZ: number;
  roadSurfaceY: number;
  groundsEnterX: number;
  groundsExitX: number;
};

/** Defaults = the single museum wired into worldGeometry. Pass nothing and
 *  the component renders exactly as it did before this refactor. */
export const defaultMuseumGeometry: MuseumGeometry = {
  depth: MUSEUM_DEPTH,
  halfWidth: MUSEUM_HALF_WIDTH,
  height: MUSEUM_HEIGHT,
  wall: MUSEUM_WALL,
  doorHalfWidth: MUSEUM_DOOR_HALF_WIDTH,
  doorHeight: MUSEUM_DOOR_HEIGHT,
  plinthDepth: MUSEUM_PLINTH_DEPTH,
  plinthHeight: MUSEUM_PLINTH_HEIGHT,
  hallHalfZ: HALL_HALF_Z,
  forecourtDepth: FORECOURT_DEPTH,
  forecourtHalfZ: FORECOURT_HALF_Z,
  centerX: MUSEUM_CENTER_X,
  centerZ: MUSEUM_CENTER_Z,
  roadSurfaceY: ROAD_SURFACE_Y,
  groundsEnterX: MUSEUM_GROUNDS_ENTER_X,
  groundsExitX: MUSEUM_GROUNDS_EXIT_X,
};

/* ------------------------------------------------------------------ *
 * Theme — every colour the museum wears, so one building can be reskinned
 * into another without touching a single dimension.
 * ------------------------------------------------------------------ */
export type MuseumTheme = {
  base: string;
  forecourt: string;
  wall: string;
  facade: string;
  cornice: string;
  column: string;
  plinth: string;
  sign: string;
  signOutline: string;
  exhibitLeftColor: string;
  exhibitLeftEmissive: string;
  exhibitRightColor: string;
  exhibitRightEmissive: string;
  artworkFrame: string;
  artworkPanel: string;
  artworkPanelEmissive: string;
  strip: string;
  stripEmissive: string;
  light: string;
};

export const defaultMuseumTheme: MuseumTheme = {
  base: "#575263",
  forecourt: "#46434c",
  wall: "#ddd5c6",
  facade: "#e7e0d2",
  cornice: "#b3a692",
  column: "#f2ece1",
  plinth: "#4a4550",
  sign: "#fbbf24",
  signOutline: "#451a03",
  exhibitLeftColor: "#fca5a5",
  exhibitLeftEmissive: "#ef4444",
  exhibitRightColor: "#7dd3fc",
  exhibitRightEmissive: "#0ea5e9",
  artworkFrame: "#1c1917",
  artworkPanel: "#312e81",
  artworkPanelEmissive: "#4338ca",
  strip: "#fff7ed",
  stripEmissive: "#ffedd5",
  light: "#ffe9c9",
};

/** Default exhibit shapes, cycled so a longer hall keeps varying instead of
 *  repeating one form. Return ONLY the geometry element — the mesh and
 *  material stay with the component, so the theme colour and the lit glow
 *  still apply to whatever you return. */
export const defaultExhibitGeometry = (i: number): ReactNode =>
  i % 3 === 0 ? (
    <icosahedronGeometry args={[0.45, 0]} />
  ) : i % 3 === 1 ? (
    <torusGeometry args={[0.34, 0.13, 12, 24]} />
  ) : (
    <octahedronGeometry args={[0.5, 0]} />
  );

/* ------------------------------------------------------------------ *
 * The centrepiece portrait
 * ------------------------------------------------------------------ */

/** Whose museum this is. `src` is a path under public/ — the image is loaded as
 *  a texture, not an <img>, so next/image is no help here and a plain URL is
 *  what the loader wants. */
export type MuseumPortrait = {
  src: string;
  /** Engraved across the nameplate under the picture, and repeated on the back
   *  of the frame for anyone who drives around it. */
  caption?: string;
  /** Width : height of the source file, so a picture that is not square is
   *  matted to fit instead of being stretched to the frame. */
  aspect?: number;
};

/** Sized to stand a person at roughly life scale against an 11-high hall: the
 *  frame's top lands near 6, about eye level from a car, and its footprint is
 *  small enough that the room still reads as a room you drive around in.
 *
 *  PLINTH_CAP_* are the widest parts, and PORTRAIT_HALF_DEPTH / PORTRAIT_HALF_Z
 *  in worldGeometry are drawn to them. Change one of these and the collision box
 *  no longer wraps what you can see — that pair is the whole contract. */
const PORTRAIT_PLINTH_HEIGHT = 1.25;
const PORTRAIT_PLINTH_DEPTH = 2.2;
const PORTRAIT_PLINTH_WIDTH = 4.4;
const PORTRAIT_PLINTH_CAP_DEPTH = PORTRAIT_HALF_DEPTH * 2;
const PORTRAIT_PLINTH_CAP_WIDTH = PORTRAIT_HALF_Z * 2;
const PORTRAIT_PLINTH_CAP_THICKNESS = 0.16;

const PORTRAIT_FRAME_THICKNESS = 0.28;
const PORTRAIT_FRAME_WIDTH = 4;
const PORTRAIT_FRAME_HEIGHT = 4.7;

/** Picture area, and the reveal of frame left around it. The nameplate is
 *  whatever is left below — deriving it that way is what stops the caption from
 *  drifting onto the picture when these are retuned. */
const PORTRAIT_IMAGE_SIZE = 3.3;
const PORTRAIT_IMAGE_TOP_INSET = 0.35;

/* ------------------------------------------------------------------ *
 * The wall gallery
 * ------------------------------------------------------------------ */

/** One hung picture. Everything about it is optional because a gallery gets
 *  hung before it gets filled: a slot with no `src` is a mounted empty frame
 *  with its caption on the board, which is what a wall waiting for prints
 *  actually looks like — and better than a hole that silently isn't there. */
export type GalleryItem = {
  /** Path under public/, loaded as a texture. */
  src?: string;
  caption?: string;
  /** Width : height of the SOURCE file. Wrong values here stretch the picture
   *  rather than raise an error, so it is worth checking the file. */
  aspect?: number;
};

/** How far a frame stands off the wall, the border of frame left around the
 *  board, and the strip of board reserved at the bottom for the caption. */
const GALLERY_FRAME_DEPTH = 0.16;
const GALLERY_REVEAL = 0.22;
const GALLERY_CAPTION_BAND = 0.32;

/** A cap, not a width. Frames are sized to the gap between them so a crowded
 *  wall doesn't overlap itself; without a ceiling, three pictures in a thirty
 *  metre hall would each be hung as a billboard. */
const GALLERY_FRAME_MAX_WIDTH = 3;

/** Clearance the picture rail keeps from what it hangs between: the light strip
 *  above, and the exhibits standing on the plinth below. */
const GALLERY_STRIP_CLEARANCE = 0.35;
const GALLERY_EXHIBIT_CLEARANCE = 0.55;

/* Proportions that describe how ANY of these museums is built rather than
 * which one. Kept internal so the public config stays about size and skin;
 * lift them to props if you ever need to tune the look itself. */
const BASE_THICKNESS = 0.9;
const WALL_SINK = 0.1;
const WING_PROJECTION = 2.6;
const COLUMN_SPACING = 2.3;
const EAVES = 0.6;
const EXHIBIT_SPACING = 4.2;
const PEDESTAL_HEIGHT = 1.1;

/** Column height : diameter, and base radius : top radius. Slenderness rather
 *  than a fixed radius, so a taller portico gets thicker columns instead of
 *  fourteen pencils — 14:1 is about where a stone column still reads as one. */
const COLUMN_SLENDERNESS = 14;
const COLUMN_TAPER = 1.125;

/** What the hall lamp is aimed at: roughly this much light reaching the darkest
 *  point in the room, the far bottom corner. The lamp has decay 2 — inverse
 *  square — so its intensity is this times the SQUARE of that corner's distance,
 *  and a hall that grows by half needs more than twice the lamp. Deriving it
 *  from the corner is what keeps that arithmetic from being done by hand and
 *  forgotten; the pair below reproduce the 310/34 the default hall was tuned to
 *  by eye, which is where both numbers come from. */
const HALL_CORNER_LUX = 0.96;

/** How far past that corner the lamp's `distance` cutoff is pushed. Falloff is
 *  already near-nothing out there, but stopping AT the corner clips it to black
 *  on a hard edge. */
const LIGHT_RANGE_MARGIN = 1.9;

/** Everything positional, derived from one geometry object. Pure, so it
 *  memoises on the geometry reference: the whole layout recomputes only when
 *  you actually hand the museum different dimensions. */
function deriveLayout(g: MuseumGeometry) {
  const HALF_DEPTH = g.depth / 2;
  const HALF_WIDTH = g.halfWidth;
  const INNER_X = HALF_DEPTH - g.wall;

  // Walls run from just under the floor to just under the roof, so touching
  // faces don't fight over the depth buffer.
  const WALL_HEIGHT = g.height + WALL_SINK;
  const WALL_Y = WALL_HEIGHT / 2 - WALL_SINK;

  const PIER_WIDTH = HALF_WIDTH - g.doorHalfWidth;
  const PIER_Z = (HALF_WIDTH + g.doorHalfWidth) / 2;
  const FACADE_X = HALF_DEPTH - g.wall / 2;

  // Wing inner faces sit exactly at the forecourt edge — the pavement test
  // stops the car's flank at that same line, so any further in and it would
  // clip stone before being blocked.
  const WING_INNER_Z = g.forecourtHalfZ;
  const WING_Z = (WING_INNER_Z + HALF_WIDTH) / 2;
  const WING_WIDTH = HALF_WIDTH - WING_INNER_Z;
  const WING_X = HALF_DEPTH + WING_PROJECTION / 2;

  // Columns spaced by a constant, count follows the wing width — a wider wing
  // gets more, not the same pair marooned in the middle.
  const COLUMN_COUNT = Math.max(2, Math.round(WING_WIDTH / COLUMN_SPACING));
  const COLUMN_OFFSETS = Array.from(
    { length: COLUMN_COUNT },
    (_, i) => (i - (COLUMN_COUNT - 1) / 2) * (WING_WIDTH / COLUMN_COUNT),
  );
  const COLUMN_RADIUS = g.height / (2 * COLUMN_SLENDERNESS);

  const ROOF_EDGE_X = HALF_DEPTH + EAVES;

  // Same idea as columns: a longer gallery gets more cases, not wider gaps.
  const EXHIBIT_COUNT = Math.max(
    3,
    Math.round((INNER_X * 2 - 2.5) / EXHIBIT_SPACING),
  );
  const EXHIBIT_X = Array.from(
    { length: EXHIBIT_COUNT },
    (_, i) => (i - (EXHIBIT_COUNT - 1) / 2) * EXHIBIT_SPACING,
  );
  const PLINTH_Z = g.hallHalfZ + g.plinthDepth / 2;
  const PEDESTAL_TOP = g.plinthHeight + PEDESTAL_HEIGHT;

  // Back-wall art and light strips as fractions of the room, so they keep
  // their proportions if the hall height moves.
  const ARTWORK_Y = g.height * 0.49;
  const ARTWORK_HEIGHT = g.height * 0.56;
  const ARTWORK_HALF_Z = g.hallHalfZ * 0.66;
  const STRIP_Y = g.height * 0.43;

  // The picture rail: the band of side wall between the tops of the exhibits and
  // the light strip above them. Derived from both rather than fixed, so a taller
  // hall hangs its pictures higher instead of behind its own sculpture — and so
  // the strip ends up reading as the light the pictures are hung under, which is
  // where a gallery puts it anyway.
  const GALLERY_TOP = STRIP_Y - GALLERY_STRIP_CLEARANCE;
  const GALLERY_BOTTOM = PEDESTAL_TOP + GALLERY_EXHIBIT_CLEARANCE;
  const GALLERY_FRAME_HEIGHT = GALLERY_TOP - GALLERY_BOTTOM;
  const GALLERY_Y = (GALLERY_TOP + GALLERY_BOTTOM) / 2;

  // Hung against the wall's inner face, standing off it by half its own depth so
  // the back of the frame lands flush on the stone.
  const GALLERY_WALL_Z = HALF_WIDTH - g.wall - GALLERY_FRAME_DEPTH / 2;

  // The run of wall the frames are spread over, corners left clear.
  const GALLERY_SPAN = INNER_X * 2 - 3;

  // Inside the frame: mount board, then a caption strip along the bottom and the
  // picture above it. Both offsets fall out of the band's height, which is what
  // keeps the caption off the picture when the hall is resized.
  const GALLERY_INNER_HEIGHT = GALLERY_FRAME_HEIGHT - GALLERY_REVEAL * 2;
  const GALLERY_PICTURE_HEIGHT = GALLERY_INNER_HEIGHT - GALLERY_CAPTION_BAND;
  const GALLERY_PICTURE_Y = GALLERY_CAPTION_BAND / 2;
  const GALLERY_CAPTION_Y =
    -GALLERY_INNER_HEIGHT / 2 + GALLERY_CAPTION_BAND / 2;

  // The hall's one lamp, sized to the room rather than hand-tuned. Its reach is
  // the distance to the far bottom corner of the walled room — not the hall
  // floor: the exhibits stand on the plinths outside that, and they are the
  // things worth lighting.
  //
  // One lamp and not a row of them, however long the hall gets. three.js renders
  // forward, so every light is evaluated for every lit fragment, and each extra
  // pointLight measured ~10ms/frame in this scene (see LIT_LAMP_COUNT in
  // <StreetLamps>). A second one here would cost more than the far end of the
  // room is worth — that end is carried by emissive exhibits and wall strips,
  // which are free.
  const LIGHT_Y = g.height - 1.4;
  const LIGHT_REACH = Math.hypot(INNER_X, HALF_WIDTH - g.wall, LIGHT_Y);
  const LIGHT_INTENSITY = HALL_CORNER_LUX * LIGHT_REACH ** 2;
  const LIGHT_DISTANCE = LIGHT_REACH * LIGHT_RANGE_MARGIN;

  return {
    HALF_DEPTH,
    HALF_WIDTH,
    INNER_X,
    WALL_HEIGHT,
    WALL_Y,
    PIER_WIDTH,
    PIER_Z,
    FACADE_X,
    WING_INNER_Z,
    WING_Z,
    WING_WIDTH,
    WING_X,
    COLUMN_OFFSETS,
    COLUMN_RADIUS,
    ROOF_EDGE_X,
    EXHIBIT_X,
    PLINTH_Z,
    PEDESTAL_TOP,
    ARTWORK_Y,
    ARTWORK_HEIGHT,
    ARTWORK_HALF_Z,
    STRIP_Y,
    GALLERY_FRAME_HEIGHT,
    GALLERY_Y,
    GALLERY_WALL_Z,
    GALLERY_SPAN,
    GALLERY_PICTURE_HEIGHT,
    GALLERY_PICTURE_Y,
    GALLERY_CAPTION_Y,
    LIGHT_Y,
    LIGHT_INTENSITY,
    LIGHT_DISTANCE,
  };
}

/* Derived once, module scope: the frame's front face, and the heights the
 * picture and the nameplate hang at. Written as arithmetic on the constants
 * above rather than as numbers so that retuning the frame moves its contents
 * with it — the nameplate in particular is the leftover strip under the picture,
 * and would otherwise creep onto it. */
const PORTRAIT_FACE_X = PORTRAIT_FRAME_THICKNESS / 2;
const PORTRAIT_FRAME_Y = PORTRAIT_PLINTH_HEIGHT + PORTRAIT_FRAME_HEIGHT / 2;
const PORTRAIT_IMAGE_Y =
  PORTRAIT_PLINTH_HEIGHT +
  PORTRAIT_FRAME_HEIGHT -
  PORTRAIT_IMAGE_TOP_INSET -
  PORTRAIT_IMAGE_SIZE / 2;
const PORTRAIT_PLATE_Y =
  (PORTRAIT_PLINTH_HEIGHT + PORTRAIT_IMAGE_Y - PORTRAIT_IMAGE_SIZE / 2) / 2;

/**
 * Just the picture. Split out because loading a texture SUSPENDS, and the
 * stonework around it must not blink out of the scene while the file is in
 * flight — so only this much sits under the <Suspense> below.
 *
 * It carries its own glow instead of being lit. A spotlight on the frame is the
 * obvious answer and the wrong one: this renderer evaluates every light against
 * every lit fragment, which is why the hall is down to a single pointLight in
 * the first place. An emissiveMap costs nothing, and on something meant to read
 * as a backlit display it is also the more honest look.
 */
function FittedPicture({
  src,
  aspect = 1,
  fitWidth,
  fitHeight,
  lit,
  position,
  rotation,
}: {
  src: string;
  aspect?: number;
  /** The box to fit inside — the picture area of whatever frame holds it. */
  fitWidth: number;
  fitHeight: number;
  lit: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const loaded = useTexture(src);

  // TextureLoader leaves colorSpace unset, so three reads the file's sRGB bytes
  // as if they were linear and the face comes out dark and muddy. drei's
  // useTexture does not do this for you — check its source before believing
  // otherwise.
  //
  // On a clone, not in place: useLoader caches by URL and hands the SAME Texture
  // to every caller, so setting these on it would reach back through the cache
  // and into anything else that ever loads this file. The clone shares its
  // `source`, so the pixels are still uploaded once.
  const map = useMemo(() => {
    const texture = loaded.clone();
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }, [loaded]);

  // Contain, not cover: whichever axis runs out first sets the size and the
  // other is left as mount board. A source that doesn't match its frame gets
  // margins — never a stretched face, and never a cropped one.
  const width = Math.min(fitWidth, fitHeight * aspect);
  const height = width / aspect;

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={lit ? 0.85 : 0.3}
        roughness={0.7}
        metalness={0}
      />
    </mesh>
  );
}

/**
 * The portrait, standing in the middle of the hall on its own plinth.
 *
 * Positioned in the museum's LOCAL frame, at +x — which is always the door,
 * because `facing` turns the whole building rather than mirroring it. That is
 * what lets one offset serve a museum looking either way; the collision hole in
 * isOnPavement is the only place the two signs have to be spelled out.
 */
function PortraitExhibit({
  portrait,
  theme: t,
  lit,
}: {
  portrait: MuseumPortrait;
  theme: MuseumTheme;
  lit: boolean;
}) {
  return (
    <group position={[PORTRAIT_OFFSET_X, 0, 0]}>
      {/* Plinth, and a cap that oversails it. The cap is the widest thing here,
          and PORTRAIT_HALF_DEPTH / PORTRAIT_HALF_Z are drawn to it — a box cut
          to the frame instead would let the car's nose in under a lip it can
          plainly see. */}
      <mesh position={[0, PORTRAIT_PLINTH_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[
            PORTRAIT_PLINTH_DEPTH,
            PORTRAIT_PLINTH_HEIGHT,
            PORTRAIT_PLINTH_WIDTH,
          ]}
        />
        <meshStandardMaterial color={t.plinth} roughness={0.6} />
      </mesh>
      <mesh
        position={[0, PORTRAIT_PLINTH_HEIGHT - PORTRAIT_PLINTH_CAP_THICKNESS / 2, 0]}
        castShadow
      >
        <boxGeometry
          args={[
            PORTRAIT_PLINTH_CAP_DEPTH,
            PORTRAIT_PLINTH_CAP_THICKNESS,
            PORTRAIT_PLINTH_CAP_WIDTH,
          ]}
        />
        <meshStandardMaterial color={t.cornice} roughness={0.7} />
      </mesh>

      {/* Frame, and the mount board inside it. The board is a hair proud of the
          frame's face and the picture a hair proud of the board, which is the
          whole reason the three don't z-fight. */}
      <mesh position={[0, PORTRAIT_FRAME_Y, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[
            PORTRAIT_FRAME_THICKNESS,
            PORTRAIT_FRAME_HEIGHT,
            PORTRAIT_FRAME_WIDTH,
          ]}
        />
        <meshStandardMaterial color={t.artworkFrame} roughness={0.85} />
      </mesh>
      <mesh
        position={[PORTRAIT_FACE_X + 0.01, PORTRAIT_FRAME_Y, 0]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <planeGeometry
          args={[PORTRAIT_FRAME_WIDTH - 0.5, PORTRAIT_FRAME_HEIGHT - 0.5]}
        />
        <meshStandardMaterial
          color={t.facade}
          emissive={t.stripEmissive}
          emissiveIntensity={lit ? 0.28 : 0.08}
          roughness={0.9}
        />
      </mesh>

      <Suspense fallback={null}>
        <FittedPicture
          src={portrait.src}
          aspect={portrait.aspect}
          fitWidth={PORTRAIT_IMAGE_SIZE}
          fitHeight={PORTRAIT_IMAGE_SIZE}
          lit={lit}
          position={[PORTRAIT_FACE_X + 0.02, PORTRAIT_IMAGE_Y, 0]}
          rotation={[0, Math.PI / 2, 0]}
        />
      </Suspense>

      {/* Nameplate on the strip of board left under the picture, and the same
          name on the back — a plinth you can drive all the way around should
          not have a blank side. */}
      {portrait.caption && (
        <>
          <Text
            position={[PORTRAIT_FACE_X + 0.03, PORTRAIT_PLATE_Y, 0]}
            rotation={[0, Math.PI / 2, 0]}
            fontSize={0.32}
            letterSpacing={0.1}
            maxWidth={PORTRAIT_FRAME_WIDTH - 0.8}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            color={t.signOutline}
          >
            {portrait.caption}
          </Text>
          <Text
            position={[-PORTRAIT_FACE_X - 0.03, PORTRAIT_FRAME_Y, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            fontSize={0.4}
            letterSpacing={0.12}
            maxWidth={PORTRAIT_FRAME_WIDTH - 0.6}
            textAlign="center"
            lineHeight={1.4}
            anchorX="center"
            anchorY="middle"
            color={t.sign}
            outlineWidth={0.01}
            outlineColor={t.signOutline}
          >
            {portrait.caption}
          </Text>
        </>
      )}
    </group>
  );
}

/**
 * One picture hung on a side wall.
 *
 * The group carries the placement, so everything inside is measured from the
 * middle of the frame and the wall it hangs on drops out of the arithmetic. The
 * half turn on the +z wall is doing double duty: it aims the frame back into the
 * room AND flips the local x axis, which is what keeps the picture the right way
 * round rather than mirrored — a wall on the far side of the room is not the
 * same as a wall seen from behind.
 */
function GalleryFrame({
  item,
  theme: t,
  lit,
  width,
  height,
  pictureHeight,
  pictureY,
  captionY,
  position,
  side,
}: {
  item: GalleryItem;
  theme: MuseumTheme;
  lit: boolean;
  width: number;
  height: number;
  pictureHeight: number;
  pictureY: number;
  captionY: number;
  position: [number, number, number];
  side: 1 | -1;
}) {
  const faceZ = GALLERY_FRAME_DEPTH / 2;

  return (
    <group position={position} rotation={[0, side > 0 ? Math.PI : 0, 0]}>
      {/* Frame, then mount board a hair proud of it, then the picture a hair
          proud of that — the stagger is the only thing keeping three coplanar
          surfaces out of a depth fight. No castShadow: the one light that could
          cast here is the hall's pointLight, and that has shadows off for the
          cube-map reason given below. */}
      <mesh>
        <boxGeometry args={[width, height, GALLERY_FRAME_DEPTH]} />
        <meshStandardMaterial color={t.artworkFrame} roughness={0.85} />
      </mesh>

      <mesh position={[0, 0, faceZ + 0.01]}>
        <planeGeometry
          args={[width - GALLERY_REVEAL * 2, height - GALLERY_REVEAL * 2]}
        />
        <meshStandardMaterial
          color={t.facade}
          emissive={t.stripEmissive}
          emissiveIntensity={lit ? 0.3 : 0.09}
          roughness={0.9}
        />
      </mesh>

      {item.src && (
        <Suspense fallback={null}>
          <FittedPicture
            src={item.src}
            aspect={item.aspect}
            fitWidth={width - GALLERY_REVEAL * 2}
            fitHeight={pictureHeight}
            lit={lit}
            position={[0, pictureY, faceZ + 0.02]}
            rotation={[0, 0, 0]}
          />
        </Suspense>
      )}

      {item.caption && (
        <Text
          position={[0, captionY, faceZ + 0.03]}
          fontSize={0.19}
          letterSpacing={0.08}
          maxWidth={width - GALLERY_REVEAL * 2 - 0.2}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color={t.signOutline}
        >
          {item.caption}
        </Text>
      )}
    </group>
  );
}

type MuseumProps = {
  /** The car, so the museum can tell when someone has driven onto its grounds. */
  target: RefObject<Group | null>;
  /** Bring the hall lights up. Owned by the parent, driven by the flag this
   *  component reports — the museum keeps no second copy of that state. */
  lit?: boolean;
  /** Fired once on each crossing of the grounds boundary, not every frame. */
  onOccupancyChange?: (occupied: boolean) => void;
  /** Name across the lintel. */
  name?: string;
  /** Which way the facade looks along x: +1 for +x (the default), -1 for -x,
   *  for a museum at the end of a road running the other way.
   *
   *  Implemented as a yaw of the whole group rather than a second set of
   *  mirrored dimensions — the building is symmetric in z, so a half turn is
   *  indistinguishable from a mirror and costs one number instead of twenty.
   *  It also flips the grounds test below, since a car now arrives with x
   *  increasing. The matching isOnPavement rules still have to be mirrored by
   *  hand; nothing here can do that for you. */
  facing?: 1 | -1;
  /** Footprint + placement. Defaults to the museum wired into worldGeometry.
   *  Override ONLY together with the matching isOnPavement config (see the
   *  MuseumGeometry note above), and memoise it if you build it inline, or the
   *  layout recomputes every render. */
  geometry?: MuseumGeometry;
  /** Colour overrides, merged over the defaults — pass only the ones you change. */
  theme?: Partial<MuseumTheme>;
  /** Swap the exhibit forms; return the geometry element only. */
  exhibitGeometry?: (i: number) => ReactNode;
  /** Whose museum this is — a framed picture on a plinth in the middle of the
   *  hall, which is the one thing in here you can collide with.
   *
   *  Passing this is HALF the change. The other half is the matching
   *  MUSEUM_HAS_PORTRAIT / RIGHT_MUSEUM_HAS_PORTRAIT flag in worldGeometry, which
   *  is what cuts its footprint out of the drivable floor. Set one without the
   *  other and you get a picture the car drives straight through, or an invisible
   *  block in the middle of an empty room. */
  portrait?: MuseumPortrait;
  /** Pictures for the side walls — projects, work, whatever this museum is for.
   *
   *  Unlike `portrait` this needs nothing from worldGeometry: the frames hang on
   *  the wall above the plinths, which is already outside the drivable floor, so
   *  there is nothing for the car to hit and nothing to keep in step.
   *
   *  Give it a stable reference (module scope, or memoised) — the wall layout
   *  memoises on it. */
  gallery?: GalleryItem[];
  /** Hall pointLight. Both default to values derived from `geometry` — a bigger
   *  hall lights itself correctly without being retuned — so pass these only to
   *  deliberately over- or under-light a room, not to keep up with its size. */
  lightIntensity?: number;
  lightDistance?: number;
};

/**
 * A building you drive into, not a prop.
 *
 * Reusable along four axes: `name` and `theme` reskin it, `exhibitGeometry`
 * restocks it, `facing` turns it to meet a road from the other side, and
 * `geometry` relocates/resizes it — the last two only in step with
 * isOnPavement, since the two share one source of truth.
 */
export function Museum({
  target,
  lit = false,
  onOccupancyChange,
  name = "MUSEUM",
  facing = 1,
  geometry = defaultMuseumGeometry,
  theme,
  exhibitGeometry = defaultExhibitGeometry,
  portrait,
  gallery,
  lightIntensity,
  lightDistance,
}: MuseumProps) {
  const g = geometry;
  const t = useMemo(() => ({ ...defaultMuseumTheme, ...theme }), [theme]);
  const l = useMemo(() => deriveLayout(g), [g]);

  // Where each picture hangs. Depends on how MANY there are, which is data
  // rather than dimensions, so it can't live in deriveLayout with the rest.
  const gallerySlots = useMemo(() => {
    const items = gallery ?? [];
    if (items.length === 0) return [];

    const step = l.GALLERY_SPAN / items.length;

    return items.map((item, i) => ({
      item,
      x: (i - (items.length - 1) / 2) * step,
      // Alternating walls rather than one wall filled then the other: a drive up
      // the hall should have something on both sides the whole way.
      side: (i % 2 === 0 ? -1 : 1) as 1 | -1,
      // Neighbours on the same wall are two steps apart, so that — less a gap —
      // is how wide a frame can be before they touch. Capped, or four pictures
      // in a thirty-metre hall each get hung as a billboard.
      width: Math.min(GALLERY_FRAME_MAX_WIDTH, step * 2 - 0.6),
    }));
  }, [gallery, l.GALLERY_SPAN]);

  // Latched here rather than compared against a prop, because the parent's
  // state update lands a render later — without the ref this would fire the
  // callback again on every frame in between.
  const occupied = useRef(false);

  useFrame(() => {
    const car = target.current;
    if (!car) return;

    // x alone is enough: everything drivable out here is museum grounds. The
    // two thresholds stop a car idling on the line from flickering the flag.
    //
    // `facing` decides which side of each threshold counts as inside: a museum
    // looking down -x has its grounds out at +x, so both tests invert with it.
    const insideOf = (line: number) =>
      facing > 0 ? car.position.x <= line : car.position.x >= line;

    const next = occupied.current
      ? insideOf(g.groundsExitX)
      : insideOf(g.groundsEnterX);

    if (next === occupied.current) return;
    occupied.current = next;
    onOccupancyChange?.(next);
  });

  return (
    <group
      position={[g.centerX, g.roadSurfaceY, g.centerZ]}
      rotation={[0, facing > 0 ? 0 : Math.PI, 0]}
    >
      {/* Floor and base in one slab: top face is the polished hall floor, the
          sides are the plinth the building stands on. Barely any metalness —
          with no environment map to reflect, more turns the floor black. */}
      <mesh position={[0, -BASE_THICKNESS / 2, 0]} receiveShadow>
        <boxGeometry args={[l.HALF_DEPTH * 2, BASE_THICKNESS, l.HALF_WIDTH * 2]} />
        <meshStandardMaterial color={t.base} metalness={0.08} roughness={0.38} />
      </mesh>

      {/* Forecourt at road height, so the car drives straight in with no ramp. */}
      <mesh
        position={[l.HALF_DEPTH + g.forecourtDepth / 2, -0.1, 0]}
        receiveShadow
      >
        <boxGeometry args={[g.forecourtDepth, 0.2, g.forecourtHalfZ * 2]} />
        <meshStandardMaterial color={t.forecourt} roughness={0.85} />
      </mesh>

      {/* Back wall */}
      <mesh position={[-l.FACADE_X, l.WALL_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[g.wall, l.WALL_HEIGHT, l.HALF_WIDTH * 2]} />
        <meshStandardMaterial color={t.wall} roughness={0.75} />
      </mesh>

      {/* Side walls */}
      {[-1, 1].map((side) => (
        <mesh
          key={`side${side}`}
          position={[0, l.WALL_Y, side * (l.HALF_WIDTH - g.wall / 2)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[l.HALF_DEPTH * 2, l.WALL_HEIGHT, g.wall]} />
          <meshStandardMaterial color={t.wall} roughness={0.75} />
        </mesh>
      ))}

      {/* Facade: a pier either side of the opening, and a lintel across it. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`pier${side}`}
          position={[l.FACADE_X, l.WALL_Y, side * l.PIER_Z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[g.wall, l.WALL_HEIGHT, l.PIER_WIDTH]} />
          <meshStandardMaterial color={t.facade} roughness={0.7} />
        </mesh>
      ))}
      <mesh
        position={[l.FACADE_X, (g.doorHeight + g.height) / 2, 0]}
        castShadow
      >
        <boxGeometry
          args={[g.wall, g.height - g.doorHeight, g.doorHalfWidth * 2]}
        />
        <meshStandardMaterial color={t.facade} roughness={0.7} />
      </mesh>

      {/* Entrance wings, standing on their own stone down to the base. */}
      {[-1, 1].map((side) => (
        <group key={`wing${side}`} position={[0, 0, side * l.WING_Z]}>
          <mesh
            position={[l.WING_X, (g.height - BASE_THICKNESS) / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[WING_PROJECTION, g.height + BASE_THICKNESS, l.WING_WIDTH]}
            />
            <meshStandardMaterial color={t.facade} roughness={0.7} />
          </mesh>

          {/* Cornice — starts where the main roof's overhang stops, so the two
              slabs share an edge instead of overlapping faces. */}
          <mesh
            position={[
              (l.ROOF_EDGE_X + l.HALF_DEPTH + WING_PROJECTION + 0.3) / 2,
              g.height + 0.3,
              0,
            ]}
            castShadow
          >
            <boxGeometry
              args={[
                l.HALF_DEPTH + WING_PROJECTION + 0.3 - l.ROOF_EDGE_X,
                0.8,
                l.WING_WIDTH + 0.6,
              ]}
            />
            <meshStandardMaterial color={t.cornice} roughness={0.75} />
          </mesh>

          {/* Engaged columns, half-sunk into the wing's front face — cheaper
              than free-standing and they can't end up in the car's way. */}
          {l.COLUMN_OFFSETS.map((offset) => (
            <mesh
              key={offset}
              position={[l.HALF_DEPTH + WING_PROJECTION, g.height / 2, offset]}
              castShadow
            >
              <cylinderGeometry
                args={[
                  l.COLUMN_RADIUS,
                  l.COLUMN_RADIUS * COLUMN_TAPER,
                  g.height,
                  14,
                ]}
              />
              <meshStandardMaterial color={t.column} roughness={0.65} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Roof slab, oversized so it reads as an overhang. */}
      <mesh position={[0, g.height + 0.25, 0]} castShadow>
        <boxGeometry args={[l.ROOF_EDGE_X * 2, 0.7, (l.HALF_WIDTH + EAVES) * 2]} />
        <meshStandardMaterial color={t.cornice} roughness={0.75} />
      </mesh>

      {/* Sign across the lintel. Sized to the flat facade BETWEEN the wings, and
          set just above the door — the chase camera looks slightly downward, so
          anything high on the facade leaves frame before the car arrives. */}
      <Text
        position={[l.HALF_DEPTH + 0.06, g.doorHeight + 1, 0]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.85}
        letterSpacing={0.12}
        maxWidth={l.WING_INNER_Z * 2 - 1}
        textAlign="center"
        lineHeight={1.35}
        anchorX="center"
        anchorY="middle"
        color={t.sign}
        outlineWidth={0.015}
        outlineColor={t.signOutline}
      >
        {name}
      </Text>

      {/* Plinths down both side walls — the hall's real edges; the drivable
          floor stops exactly where they start. */}
      {[-1, 1].map((side) => (
        <group key={`gallery${side}`} position={[0, 0, side * l.PLINTH_Z]}>
          <mesh position={[0, g.plinthHeight / 2, 0]} receiveShadow>
            <boxGeometry args={[l.INNER_X * 2, g.plinthHeight, g.plinthDepth]} />
            <meshStandardMaterial color={t.plinth} roughness={0.6} />
          </mesh>

          {l.EXHIBIT_X.map((x, i) => (
            <group key={x} position={[x, 0, 0]}>
              {/* Pedestal */}
              <mesh
                position={[0, g.plinthHeight + PEDESTAL_HEIGHT / 2, 0]}
                castShadow
              >
                <boxGeometry args={[1, PEDESTAL_HEIGHT, 1]} />
                <meshStandardMaterial color={t.facade} roughness={0.7} />
              </mesh>

              {/* Exhibit — emissive, so each carries its own glow instead of
                  needing a spotlight (one pointLight per case). */}
              <mesh position={[0, l.PEDESTAL_TOP + 0.45, 0]} castShadow>
                {exhibitGeometry(i)}
                <meshStandardMaterial
                  color={side > 0 ? t.exhibitRightColor : t.exhibitLeftColor}
                  emissive={
                    side > 0 ? t.exhibitRightEmissive : t.exhibitLeftEmissive
                  }
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
      <mesh position={[-l.INNER_X + 0.05, l.ARTWORK_Y, 0]}>
        <boxGeometry args={[0.08, l.ARTWORK_HEIGHT, l.ARTWORK_HALF_Z * 2]} />
        <meshStandardMaterial color={t.artworkFrame} roughness={0.9} />
      </mesh>
      <mesh position={[-l.INNER_X + 0.12, l.ARTWORK_Y, 0]}>
        <boxGeometry
          args={[0.06, l.ARTWORK_HEIGHT - 0.7, l.ARTWORK_HALF_Z * 2 - 0.8]}
        />
        <meshStandardMaterial
          color={t.artworkPanel}
          emissive={t.artworkPanelEmissive}
          emissiveIntensity={lit ? 0.55 : 0.25}
          roughness={0.5}
        />
      </mesh>

      {/* Backlit strips along the side walls, just above the exhibits. Emissive
          only — they give the pointLight a visible source. On the walls, not
          the ceiling, because the chase camera never looks up. */}
      {[-1, 1].map((side) => (
        <mesh
          key={`strip${side}`}
          position={[0, l.STRIP_Y, side * (l.HALF_WIDTH - g.wall - 0.06)]}
        >
          <boxGeometry args={[l.INNER_X * 2 - 1.4, 0.28, 0.12]} />
          <meshStandardMaterial
            color={t.strip}
            emissive={t.stripEmissive}
            emissiveIntensity={lit ? 2 : 0.15}
          />
        </mesh>
      ))}

      {/* The gallery, hung along both side walls in the band between the
          exhibits and the strips above — which is why the strips end up reading
          as the lights the pictures are hung under. */}
      {gallerySlots.map(({ item, x, side, width }, i) => (
        <GalleryFrame
          key={i}
          item={item}
          theme={t}
          lit={lit}
          width={width}
          height={l.GALLERY_FRAME_HEIGHT}
          pictureHeight={l.GALLERY_PICTURE_HEIGHT}
          pictureY={l.GALLERY_PICTURE_Y}
          captionY={l.GALLERY_CAPTION_Y}
          position={[x, l.GALLERY_Y, side * l.GALLERY_WALL_Z]}
          side={side}
        />
      ))}

      {/* The centrepiece, if this museum has one. Everything above is the room;
          this is what the room is for. */}
      {portrait && (
        <PortraitExhibit portrait={portrait} theme={t} lit={lit} />
      )}

      {/* The hall's only real light, and only while someone is here — every
          light in a forward renderer is evaluated for every lit fragment. No
          castShadow: a shadow-casting pointLight renders a six-face cube map. */}
      {lit && (
        <pointLight
          position={[0, l.LIGHT_Y, 0]}
          color={t.light}
          intensity={lightIntensity ?? l.LIGHT_INTENSITY}
          distance={lightDistance ?? l.LIGHT_DISTANCE}
          decay={2}
        />
      )}
    </group>
  );
}