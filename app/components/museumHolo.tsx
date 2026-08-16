"use client";

/**
 * The things in the hall that are made of light rather than of material.
 *
 * Split out of <Museum> because they answer to a different question. Everything
 * left in that file is ARCHITECTURE — it has a size, it casts a shadow, and in
 * two cases the car can hit it. Everything here is a SURFACE PRETENDING TO BE A
 * VOLUME: flat planes, emissive, animated by writing a handful of numbers a
 * frame. None of it is lit, none of it lights anything, and none of it can be
 * collided with.
 *
 * That distinction is also the performance rule the whole museum is built on.
 * three.js renders forward, so every real light is evaluated against every lit
 * fragment — which is why a thirty-metre hall gets exactly ONE pointLight (see
 * the note on LIGHT_INTENSITY in Museum.tsx). A room that has to read as "mostly
 * dark, lit by electric blue" cannot buy that with lights. It buys it with
 * emissive faces, and this file is where the expensive-looking half of that
 * lives: the wall display, the floating interfaces, the motes in the air.
 *
 * Nothing in here takes a position. Every component is drawn in its own local
 * frame, facing +z, and the caller places and turns it — which is what lets the
 * same wall display serve a museum facing either way down the road.
 */

import { Sparkles, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";

import type { MuseumTheme } from "./Museum";

/** Coplanar faces z-fight, so each layer of a display stands one step proud of
 *  the one behind it — the same ladder the portrait exhibit climbs, and for the
 *  same reason. Small enough to be invisible edge-on at the angles you actually
 *  drive past these at. */
const LAYER = 0.014;
const layerZ = (step: number) => LAYER * step;

/* ------------------------------------------------------------------ *
 * The intelligent wall
 * ------------------------------------------------------------------ */

/** One pass of the horizontal refresh bar, and one pass of the vertical one.
 *  Deliberately coprime-ish: at 6.5 and 9 seconds the two sweeps drift in and
 *  out of phase over a minute or so instead of crossing at the same place every
 *  time, which is the difference between a wall that is running and a wall
 *  playing a two-second loop. */
const SCAN_PERIOD = 6.5;
const SWEEP_PERIOD = 9;

/** How faint the sweeps are at their strongest. Faint on purpose, twice over: a
 *  bright bar on a 30-metre wall is a searchlight rather than a refresh, and
 *  this wall is also the brightest thing in the floor's reflection — so
 *  everything here is seen twice and reads about twice as strong as it measures. */
const SCAN_PEAK = 0.34;
const SWEEP_PEAK = 0.22;

/** The data strip along the bottom. Bars rather than a readout because this is
 *  scenery seen from a moving car: at thirty metres a number is a smudge, but
 *  something CHANGING is legible as activity at any distance. */
const BAR_COUNT = 22;
const BAR_BAND = 0.16;
const BAR_GAP = 0.35;

/** Grid pitch — roughly this far apart, then rounded to a whole number of cells
 *  so the grid always closes on the panel's edges instead of ending on a part
 *  cell. A pitch and not a count, so a wider hall gets more cells rather than a
 *  coarser grid stretched over it. */
const GRID_PITCH_X = 2.6;
const GRID_PITCH_Y = 1.9;
const GRID_WEIGHT = 0.012;

/** The HUD arcs at the centre of the wall, as fractions of its height. Arcs and
 *  not full rings, and that is the whole reason they work: a complete circle
 *  spun about its own axis is indistinguishable from a still one, so a ring
 *  would cost the same per frame and show nothing. */
const ARC_OUTER = 0.34;
const ARC_INNER = 0.24;
const ARC_WEIGHT = 0.012;

export type HoloWallProps = {
  /** The panel's full extents in its own frame: x across, y up. */
  width: number;
  height: number;
  theme: MuseumTheme;
  /** Someone is in the room. Drives brightness only — the animation runs either
   *  way, because it costs the same and a dark hall with a dead wall in it looks
   *  broken rather than asleep. */
  lit: boolean;
  /** Watermarked across the middle, behind the arcs. Optional: a wall with
   *  nothing to say is a better wall than one captioned "MUSEUM". */
  label?: string;
  /** The small line under it — present tense, so the wall reads as running. */
  status?: string;
  /** Something is mounted on this wall, so stop competing with it.
   *
   *  Drops the arcs — the wall's only composed element, and the one thing on it
   *  placed dead centre, which is precisely where anything hung on a wall goes.
   *  The grid, the sweeps and the data strip stay: those run off all four edges
   *  and read as the SURFACE, which is what an instrument wants behind it.
   *
   *  It also takes the whole panel down to about a third of its brightness, and
   *  that is the half that actually matters. This wall glows enough to read as
   *  the brightest thing in the hall, which is exactly right when it IS the
   *  display — and exactly wrong once a real one is bolted to it, because a
   *  monitor can only look lit against something darker than itself. Two
   *  displays at the same brightness is one flat teal wall with a rectangle
   *  drawn on it. */
  quiet?: boolean;
};

/**
 * The back wall, as a single seamless display.
 *
 * This replaced a framed picture on a stone wall, and the brief for it was one
 * word: SEAMLESS. So there is no frame, no border and no mat — the panel is
 * simply the inner face of the wall, from near the floor to near the ceiling,
 * and the architecture stops at its edges. What sells it as an intelligent
 * surface rather than as a very large monitor is that nothing on it is centred
 * in a box: the grid runs off all four sides, the sweeps cross the entire span,
 * and the only composed element — the arcs and the watermark — sits in the
 * middle of that field rather than in a rectangle of its own.
 */
export function HoloWall({
  width,
  height,
  theme: t,
  lit,
  label,
  status,
  quiet = false,
}: HoloWallProps) {
  const scanBar = useRef<Mesh>(null);
  const scanMaterial = useRef<MeshBasicMaterial>(null);
  const sweepBar = useRef<Mesh>(null);
  const sweepMaterial = useRef<MeshBasicMaterial>(null);
  const groundMaterial = useRef<MeshStandardMaterial>(null);
  const arcs = useRef<Group>(null);
  const innerArc = useRef<Group>(null);
  const bars = useRef<Mesh[]>([]);

  const halfWidth = width / 2;
  const halfHeight = height / 2;

  /** How much of itself the wall is allowed to be when something is mounted on
   *  it. Read by every emissive surface below, so the panel can never end up
   *  half-dimmed by accident.
   *
   *  Two numbers, not one, and the split is the whole point. What has to give
   *  way is the wall's own GLOW — the lit ground, the sweeps, the data strip —
   *  because those are the wall behaving like a display, and a display cannot
   *  look lit in front of another one at the same brightness. What has to stay
   *  is the GRID: that is the wall behaving like architecture, it is ruled at
   *  the same world pitch as the monitor's own bold grid, and the two are meant
   *  to be seen meeting across the reveal. Dim that with everything else and the
   *  machine ends up floating on a black rectangle. */
  const level = quiet ? 0.32 : 1;
  const gridLevel = quiet ? 0.85 : 1;

  // Grid, arcs and bars all derive from the panel's size, so the wall is drawn
  // to whatever hall it is hung in rather than to numbers that happened to suit
  // the first one.
  const grid = useMemo(() => {
    const columns = Math.max(2, Math.round(width / GRID_PITCH_X));
    const rows = Math.max(2, Math.round(height / GRID_PITCH_Y));

    return {
      // Interior lines only — a line ON the edge is half off the panel, which
      // reads as a seam in the wall rather than as a rule on the display.
      verticals: Array.from(
        { length: columns - 1 },
        (_, i) => -halfWidth + ((i + 1) * width) / columns,
      ),
      horizontals: Array.from(
        { length: rows - 1 },
        (_, i) => -halfHeight + ((i + 1) * height) / rows,
      ),
    };
  }, [width, height, halfWidth, halfHeight]);

  // The data strip: a run of bars across the bottom, each with its own phase and
  // rate so the row never pulses in unison. Both are irrational multiples of the
  // index rather than a repeating pattern — a row of bars that visibly cycles is
  // a progress meter, and a progress meter that never finishes is worse scenery
  // than no bars at all.
  const barLayout = useMemo(() => {
    const span = width * 0.34;
    const step = span / BAR_COUNT;

    return {
      width: step * (1 - BAR_GAP),
      // Ranged left, in from the panel's edge — the arcs own the middle, and a
      // strip that ran the full width would cut the wall in half.
      x: Array.from(
        { length: BAR_COUNT },
        (_, i) => -halfWidth + width * 0.06 + (i + 0.5) * step,
      ),
      phase: Array.from({ length: BAR_COUNT }, (_, i) => i * 0.7),
      rate: Array.from({ length: BAR_COUNT }, (_, i) => 0.9 + (i % 5) * 0.23),
      maxHeight: height * BAR_BAND,
      baseY: -halfHeight + height * 0.06,
    };
  }, [width, height, halfWidth, halfHeight]);

  // Two sweeps, two counter-rotating arcs, a breath on the ground plane and the
  // data strip. Every one of them is a property write on something that already
  // exists — no geometry is built, no material is swapped, and nothing here
  // allocates. That budget is what makes it affordable to have the biggest
  // surface in the room be the busiest one.
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    // Top to bottom, faded in and out across the pass. Without the fade the bar
    // teleports back to the top at full strength once a cycle, which reads as a
    // dropped frame rather than as a refresh.
    const scan = (time % SCAN_PERIOD) / SCAN_PERIOD;
    if (scanBar.current) {
      scanBar.current.position.y = halfHeight - scan * height;
    }
    if (scanMaterial.current) {
      scanMaterial.current.opacity =
        (lit ? SCAN_PEAK : SCAN_PEAK * 0.4) * level * Math.sin(Math.PI * scan);
    }

    // And one across it, the other way, on its own clock.
    const sweep = (time % SWEEP_PERIOD) / SWEEP_PERIOD;
    if (sweepBar.current) {
      sweepBar.current.position.x = -halfWidth + sweep * width;
    }
    if (sweepMaterial.current) {
      sweepMaterial.current.opacity =
        (lit ? SWEEP_PEAK : SWEEP_PEAK * 0.4) * level * Math.sin(Math.PI * sweep);
    }

    if (groundMaterial.current) {
      groundMaterial.current.emissiveIntensity =
        (lit ? 0.09 : 0.03) * level * (0.85 + 0.15 * Math.sin(time * 0.5));
    }

    // Opposite directions and different rates. Same-direction arcs read as one
    // slipping ring; opposed, they read as two instruments.
    if (arcs.current) arcs.current.rotation.z = time * 0.16;
    if (innerArc.current) innerArc.current.rotation.z = -time * 0.27;

    // Grown from the baseline, not about the centre: a plane scales about its
    // own middle, so the position has to travel half as far as the scale to keep
    // the foot of every bar planted on the strip.
    for (let i = 0; i < bars.current.length; i++) {
      const bar = bars.current[i];
      if (!bar) continue;

      const level =
        0.18 +
        0.82 *
          (0.5 +
            0.5 * Math.sin(time * barLayout.rate[i] + barLayout.phase[i]));

      bar.scale.y = level;
      bar.position.y = barLayout.baseY + (barLayout.maxHeight * level) / 2;
    }
  });

  return (
    <group>
      {/* The display's ground. Barely emissive — this is the dark that
          everything else on the wall is bright against, and at any real glow it
          floods the whole room teal through the floor reflection. */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          ref={groundMaterial}
          color={t.holoScreen}
          emissive={t.holo}
          emissiveIntensity={(lit ? 0.09 : 0.03) * level}
          roughness={0.55}
          metalness={0.1}
        />
      </mesh>

      {/* Grid. Standard material rather than basic so it dims with the room:
          these are meant to be etched into the surface, and something that stays
          at full strength in an empty hall reads as an overlay instead. */}
      {grid.verticals.map((x) => (
        <mesh key={`v${x}`} position={[x, 0, layerZ(1)]}>
          <planeGeometry args={[GRID_WEIGHT, height]} />
          <meshStandardMaterial
            color={t.holo}
            emissive={t.holo}
            emissiveIntensity={(lit ? 0.5 : 0.14) * gridLevel}
            roughness={0.6}
          />
        </mesh>
      ))}
      {grid.horizontals.map((y) => (
        <mesh key={`h${y}`} position={[0, y, layerZ(1)]}>
          <planeGeometry args={[width, GRID_WEIGHT]} />
          <meshStandardMaterial
            color={t.holo}
            emissive={t.holo}
            emissiveIntensity={(lit ? 0.5 : 0.14) * gridLevel}
            roughness={0.6}
          />
        </mesh>
      ))}

      {/* The watermark, and the line under it. Set BEHIND the arcs in the ladder
          so the instruments read as sitting on top of the surface the type is
          printed into — the other order makes the type look like a sticker. */}
      {label && (
        <Text
          position={[0, height * 0.06, layerZ(2)]}
          fontSize={height * 0.14}
          letterSpacing={0.4}
          maxWidth={width * 0.8}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color={t.holo}
          fillOpacity={0.16}
        >
          {label}
        </Text>
      )}
      {status && (
        <Text
          position={[0, -height * 0.09, layerZ(2)]}
          fontSize={height * 0.036}
          letterSpacing={0.55}
          anchorX="center"
          anchorY="middle"
          color={t.accent}
          fillOpacity={0.5}
        >
          {status}
        </Text>
      )}

      {/* Counter-rotating arcs. Broken into three sectors with gaps rather than
          drawn as one ring for the same reason they turn at all: the gaps are
          the only thing on a circle that can be seen to move. */}
      <group ref={arcs} position={[0, 0, layerZ(3)]} visible={!quiet}>
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((start) => (
          <mesh key={start}>
            <ringGeometry
              args={[
                height * ARC_OUTER - height * ARC_WEIGHT,
                height * ARC_OUTER,
                48,
                1,
                start,
                Math.PI * 0.5,
              ]}
            />
            <meshStandardMaterial
              color={t.accent}
              emissive={t.accent}
              emissiveIntensity={lit ? 1.5 : 0.45}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>
      <group ref={innerArc} position={[0, 0, layerZ(3)]} visible={!quiet}>
        {[0, Math.PI].map((start) => (
          <mesh key={start}>
            <ringGeometry
              args={[
                height * ARC_INNER - height * ARC_WEIGHT,
                height * ARC_INNER,
                48,
                1,
                start,
                Math.PI * 0.72,
              ]}
            />
            <meshStandardMaterial
              color={t.accentAlt}
              emissive={t.accentAlt}
              emissiveIntensity={lit ? 1.3 : 0.4}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>

      {/* The data strip. */}
      {barLayout.x.map((x, i) => (
        <mesh
          key={x}
          ref={(mesh) => {
            if (mesh) bars.current[i] = mesh;
          }}
          position={[x, barLayout.baseY, layerZ(2)]}
        >
          <planeGeometry args={[barLayout.width, barLayout.maxHeight]} />
          <meshStandardMaterial
            color={t.accent}
            emissive={t.accent}
            emissiveIntensity={(lit ? 0.8 : 0.22) * level}
            roughness={0.5}
          />
        </mesh>
      ))}

      {/* The two sweeps. Basic materials: these are the only things on the wall
          that move every frame, so they are also the only ones the renderer does
          no lighting work for. A flat alpha tint rather than additive light —
          additive saturates to white the instant it crosses anything already
          bright, so one bar would look like two different effects depending on
          where it was. */}
      <mesh ref={scanBar} position={[0, halfHeight, layerZ(4)]}>
        <planeGeometry args={[width, height * 0.012]} />
        <meshBasicMaterial
          ref={scanMaterial}
          color={t.holo}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={sweepBar} position={[-halfWidth, 0, layerZ(4)]}>
        <planeGeometry args={[width * 0.006, height]} />
        <meshBasicMaterial
          ref={sweepMaterial}
          color={t.accentAlt}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * Floating interfaces
 * ------------------------------------------------------------------ */

/** How far a panel drifts up and down, and how long one breath takes. Small and
 *  slow: these hang in mid-air with nothing holding them, and the only thing
 *  that makes that read as deliberate rather than as a physics bug is that they
 *  move like something being held in place rather than something falling. */
const HUD_DRIFT = 0.09;
const HUD_PERIOD = 5.5;

export type HoloPanelProps = {
  width: number;
  height: number;
  theme: MuseumTheme;
  lit: boolean;
  /** Text rows down the panel. Rendered as bars, not type — see below. */
  rows?: number;
  /** Which way this one breathes, so a pair of them never bobs in unison. */
  phase?: number;
  accent?: string;
};

/**
 * A transparent interface hanging in the air.
 *
 * The rows are BARS rather than text, and that is a decision rather than a
 * shortcut. This is glanced at from a car doing twelve units a second at the
 * other end of a thirty-metre hall; real type at that distance is a grey smear
 * with a font's worth of troika geometry behind it, and a smear that resolves
 * into nothing when you finally get close is worse than an honest abstraction.
 * Bars read as "an interface with information on it" at every distance, and the
 * one thing here worth reading — the museum's actual content — is on the walls
 * and the pedestals where you can stop in front of it.
 */
export function HoloPanel({
  width,
  height,
  theme: t,
  lit,
  rows = 5,
  phase = 0,
  accent,
}: HoloPanelProps) {
  const drift = useRef<Group>(null);
  const glow = useRef<MeshStandardMaterial>(null);
  const tint = accent ?? t.holo;

  // Rows down the panel under a heavier header, each a different length. The
  // ragged right edge is the tell: uniform bars read as a loading skeleton,
  // varied ones read as content.
  const layout = useMemo(() => {
    const top = height / 2 - height * 0.22;
    const step = (height * 0.62) / rows;

    return Array.from({ length: rows }, (_, i) => ({
      y: top - i * step,
      // Deterministic, not random: a re-render must not reshuffle the panel.
      width: width * (0.34 + ((i * 37) % 11) / 22),
      height: step * 0.3,
    }));
  }, [width, height, rows]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (drift.current) {
      drift.current.position.y =
        Math.sin((time / HUD_PERIOD) * Math.PI * 2 + phase) * HUD_DRIFT;
    }
    if (glow.current) {
      glow.current.emissiveIntensity =
        (lit ? 0.7 : 0.2) * (0.8 + 0.2 * Math.sin(time * 1.3 + phase));
    }
  });

  return (
    <group ref={drift}>
      {/* The pane. Transparent and depthWrite off, so it tints whatever is
          behind it instead of punching a hole in the room — a holographic
          interface that occludes the wall behind it is a sheet of plastic. */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          color={tint}
          transparent
          opacity={lit ? 0.09 : 0.04}
          depthWrite={false}
        />
      </mesh>

      {/* Its border, which is what gives the pane an edge to be seen by. The top
          rail is split out rather than mapped with the rest only because it is
          the one that breathes — a panel whose whole outline pulsed would read
          as an alert, where one lit rail reads as a title bar. */}
      <mesh position={[0, height / 2, layerZ(1)]}>
        <planeGeometry args={[width, 0.02]} />
        <meshStandardMaterial
          ref={glow}
          color={tint}
          emissive={tint}
          emissiveIntensity={lit ? 0.7 : 0.2}
          roughness={0.5}
        />
      </mesh>
      {(
        [
          [0, -height / 2, width, 0.018],
          [-width / 2, 0, 0.018, height],
          [width / 2, 0, 0.018, height],
        ] as const
      ).map(([x, y, w, h]) => (
        <mesh key={`${x},${y}`} position={[x, y, layerZ(1)]}>
          <planeGeometry args={[w, h]} />
          <meshStandardMaterial
            color={tint}
            emissive={tint}
            emissiveIntensity={lit ? 0.45 : 0.13}
            roughness={0.5}
          />
        </mesh>
      ))}

      {/* Header, then the rows. */}
      <mesh position={[-width * 0.16, height / 2 - height * 0.1, layerZ(2)]}>
        <planeGeometry args={[width * 0.55, height * 0.05]} />
        <meshStandardMaterial
          color={tint}
          emissive={tint}
          emissiveIntensity={lit ? 0.9 : 0.26}
          roughness={0.5}
        />
      </mesh>
      {layout.map((row, i) => (
        <mesh
          key={i}
          position={[-width / 2 + row.width / 2 + width * 0.07, row.y, layerZ(2)]}
        >
          <planeGeometry args={[row.width, row.height]} />
          <meshStandardMaterial
            color={tint}
            emissive={tint}
            emissiveIntensity={lit ? 0.42 : 0.12}
            roughness={0.6}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * The air itself
 * ------------------------------------------------------------------ */

export type HoloMotesProps = {
  /** The box they fill: [depth, height, width] in the hall's own axes. */
  scale: [number, number, number];
  color: string;
  count?: number;
};

/**
 * Motes suspended in the room.
 *
 * drei's <Sparkles> and not a particle system of our own: it is a single
 * THREE.Points with one shader material, so the whole field is ONE draw call and
 * the motion happens on the GPU. A hundred of these cost less than one of the
 * meshes above.
 *
 * Mounted only when the hall is occupied, unlike everything else in this file.
 * That is not only thrift — an empty room should be still, and having the air
 * come alive as you cross the threshold is most of what makes the building feel
 * like it noticed you.
 */
export function HoloMotes({ scale, color, count = 90 }: HoloMotesProps) {
  return (
    <Sparkles
      count={count}
      scale={scale}
      // Small and slow. Big, fast sparkles are snow; this wants to read as dust
      // caught in a beam, which is a much quieter effect than the name suggests.
      size={2.4}
      speed={0.22}
      opacity={0.45}
      noise={0.4}
      color={color}
    />
  );
}
