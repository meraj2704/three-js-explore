"use client";

/**
 * What the monitor shows when you open one of its panels.
 *
 * The overview is a SUMMARY — seven instruments reporting at a glance, sized to
 * be read from a car at the other end of a thirty-metre hall. These are what
 * each of those instruments is a summary OF, and the distinction is the whole
 * design of this file: a detail view that is the same eight words at twice the
 * size is a zoom, not a mode. Every view here shows something the overview
 * cannot — a career rather than a paragraph, a dependency graph rather than a
 * row of chips, a project rather than a count of them.
 *
 * They are drawn to the same contract as everything else on this display:
 *
 *   - Local frame, origin at the centre of the CONTENT area, x across, y up,
 *     z from 0 forward. The caller places, scales and fades the whole thing.
 *   - Fine static detail is painted into a canvas, not built from planes. One
 *     draw call per panel, however much is written on it.
 *   - Nothing here allocates per frame. The two things that move — the tech
 *     graph's pulses and the meters' charge — are property writes on materials
 *     and transforms that already exist.
 *
 * Nothing here knows how it was opened, how it will close, or that it lives
 * inside a machine at all. It is handed a size and some data and it composes.
 */

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";

import type { MuseumTheme } from "./Museum";
import { makePanelTexture } from "./museumMonitorPaint";
import type { MonitorProfile } from "./museumMonitorPaint";

/** Which panel was opened. `overview` is the closed state and never reaches a
 *  view; it is here because it is one of the states the machine can be in and
 *  splitting it out would mean two enums that have to agree. */
export type SectionId =
  | "overview"
  | "about"
  | "stats"
  | "tech"
  | "activity"
  | "skills"
  | "achievements"
  | "focus"
  | "projects"
  | "project";

/* ------------------------------------------------------------------ *
 * Type
 * ------------------------------------------------------------------ *
 * One ramp, six steps, and every word on the console is one of them.
 *
 * What was here before was four constants and a dozen ad-hoc multipliers hung
 * off them — BODY × 1.35 in one view, MICRO × 1.15 in another, MICRO × 0.9 in a
 * third. That is not a type scale, it is twelve of them, and on a display read
 * from the far end of a hall it did not matter: nothing was legible enough for
 * the differences to register as hierarchy in the first place. An arm's length
 * from your face the hierarchy is the FIRST thing read, and hierarchy is built
 * out of a small number of steps that are obviously different from each other,
 * not out of a continuum.
 *
 * Every size is a fraction of the box's HEIGHT — never its width, never a mix —
 * so a wider or a narrower console re-flows its columns without touching the
 * type. Each step is about 1.25 times the one below it, which is the smallest
 * ratio two sizes can differ by and still be told apart. `display` is a jump
 * rather than a step, because a headline figure is not part of the reading
 * sequence: it is the thing you look at INSTEAD of reading.
 */
const RAMP = {
  /** Chips, tick labels, node names — the smallest thing that has to survive. */
  micro: 0.021,
  /** Eyebrows and field labels. Always uppercase and always letter-spaced. */
  caption: 0.026,
  /** Running text. Everything else is defined by how far it is from this. */
  body: 0.032,
  /** The one paragraph a view opens with. */
  lead: 0.04,
  /** The view's name. The only element allowed to shout. */
  title: 0.07,
  /** A number you are meant to see rather than read. */
  display: 0.115,
} as const;

/** Line height for anything that wraps. Loose — this is emissive type on a dark
 *  ground, which blooms into the line below it far more than ink on paper. */
const LINE = 1.55;

/** The gap between two stacked blocks, in ems of the SMALLER of the two. Type
 *  spacing keyed to type rather than to the panel is the whole reason a block
 *  that grows a line pushes what follows down instead of landing on top of it. */
const STACK_GAP = 0.85;

/** Roughly how wide one character is, as a fraction of the font size.
 *
 *  Everything that flows on this console is laid out from this number, and it
 *  is an estimate on purpose. Troika measures text on a worker and reports back
 *  a frame or two later — a frame or two after everything below it has already
 *  been positioned — so laying out against the truth means a visible reflow
 *  every single time a view opens. An estimate a few percent generous costs a
 *  few percent of a panel and never moves. */
const ADVANCE = 0.53;

/** What share of a window's height the console lands on when the window is the
 *  shape the type was composed for — a bit over three quarters, on 16:9. Below
 *  that the type is drawn bigger to compensate; above it, nothing happens. */
const REFERENCE_FILL = 0.78;

/** The smallest body size worth calling text, in CSS pixels. Anything under
 *  this and the console is a picture of an interface rather than one. */
const MIN_BODY_PX = 17;

/** How far the type may be pushed past the composed design. Past this the
 *  layouts stop being the layouts — a third bigger is about what a column can
 *  absorb by re-wrapping before the columns themselves have to change. */
const MAX_TYPE_SCALE = 1.35;

/**
 * How much bigger than composed the console's type has to be drawn.
 *
 * Two failures to catch, and they are not the same failure. A window that is
 * WIDE for its height squeezes the console into a band — it still fills the
 * frame across, but its height, and therefore all of its type, comes out a
 * fraction of what the design assumed. And a window that is simply SMALL gives
 * a console that fills it perfectly and still puts eleven-pixel body copy in
 * front of somebody. The first is a shape problem, the second a size one; this
 * takes whichever is worse and refuses to make either better than composed.
 *
 * It lives here rather than in the monitor because it is a typographic decision
 * — what counts as readable — and the monitor's business is where the console
 * goes, not what is set on it.
 */
export function readableScale(fill: number, windowPixels: number) {
  const bodyPx = RAMP.body * fill * windowPixels;
  const needed = Math.max(REFERENCE_FILL / fill, MIN_BODY_PX / Math.max(1, bodyPx));
  return Math.min(MAX_TYPE_SCALE, Math.max(1, needed));
}

/** The ramp resolved against one box at one scale. */
type Type = Record<keyof typeof RAMP, number>;

function typeFor(height: number, scale: number): Type {
  return {
    micro: height * RAMP.micro * scale,
    caption: height * RAMP.caption * scale,
    body: height * RAMP.body * scale,
    lead: height * RAMP.lead * scale,
    title: height * RAMP.title * scale,
    display: height * RAMP.display * scale,
  };
}

/** How tall a wrapped block will come out, given the width it has to wrap in.
 *  Newlines in the source count as lines of their own, which is what makes a
 *  bulleted list measure as a list rather than as one long sentence. */
function blockHeight(text: string, size: number, maxWidth: number, line = LINE) {
  const perLine = Math.max(8, Math.floor(maxWidth / (size * ADVANCE)));
  const lines = text
    .split("\n")
    .reduce((total, para) => total + Math.max(1, Math.ceil(para.length / perLine)), 0);
  return lines * size * line;
}

/**
 * How much to shrink a column of copy so it lands inside the space it has.
 *
 * `measure` is the column's own height as a function of the type scale, which
 * the caller knows and nothing else does. The floor matters as much as the
 * fit: past about four fifths the type stops being the same design and starts
 * being small print, and a view whose copy cannot be made to fit at that size
 * is a view with too much copy in it — a problem for whoever wrote the profile,
 * not one this can solve by going to six point.
 *
 * Measured twice rather than solved, because shrinking type also re-wraps it:
 * the second measurement is nearly always shorter than the ratio predicted, and
 * taking the first answer would leave a column that fits with room to spare.
 *
 * Callers divide their floor by the responsive type scale, which is what keeps
 * the two mechanisms from fighting: `readableScale` says "this window is small,
 * draw everything bigger", the fitter says "this column is full" — and a column
 * that is already full simply does not take the offer.
 */
function fitColumn(measure: (scale: number) => number, available: number, floor = 0.8) {
  const full = measure(1);
  if (full <= available || full <= 0) return 1;
  const first = Math.max(floor, available / full);
  const second = measure(first);
  if (second <= available) return first;
  return Math.max(floor, first * (available / second));
}

/** A top-down cursor. Blocks are anchored by their TOP edge and the cursor
 *  carries the bottom of the last one, so a column of text is laid out in the
 *  order it is read and nothing below it has to know what is above it. */
function stack(top: number) {
  let y = top;
  return {
    get y() {
      return y;
    },
    /** Place a block of `height`, then leave the cursor below it. */
    take(height: number, gap = 0) {
      const at = y;
      y -= height + gap;
      return at;
    },
  };
}

/** Depth inside a view. Small numbers — the caller has already spent the well's
 *  real depth getting here, and these only have to keep coplanar faces apart. */
const L = 0.008;

export type ViewProps = {
  /** The content area this view composes into. */
  width: number;
  height: number;
  profile: MonitorProfile;
  theme: MuseumTheme;
  lit: boolean;
  /** How much bigger than composed the type is drawn. 1 on a window the console
   *  fills comfortably; up over one when the window's shape has squeezed the
   *  console into a band and its type would otherwise go with it. Set by the
   *  monitor from the live viewport — see the dock in museumMonitor.tsx. */
  scale: number;
  /** Which project the PROJECT view is showing, and how to change it. */
  project: number;
  onProject: (index: number) => void;
};

/* ------------------------------------------------------------------ *
 * Shared parts
 * ------------------------------------------------------------------ */

/** A panel, at an explicit rect inside the view. Same painted-glass recipe the
 *  overview modules use, so an opened view is unmistakably the same machine. */
function Panel({
  x,
  y,
  w,
  h,
  theme: t,
  lit,
  tint,
  header,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  theme: MuseumTheme;
  lit: boolean;
  tint?: string;
  header?: number;
  children?: React.ReactNode;
}) {
  const glow = tint ?? t.accent;
  const map = useMemo(
    () => makePanelTexture(w, h, { tint: t.holo, glow, header }),
    [w, h, t.holo, glow, header],
  );

  return (
    <group position={[x, y, 0]}>
      {map && (
        <mesh>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial
            map={map}
            transparent
            opacity={lit ? 1 : 0.5}
            depthWrite={false}
          />
        </mesh>
      )}
      <group position={[0, 0, L]}>{children}</group>
    </group>
  );
}

/** The heading block. Every view has one, in the same place, at the same size —
 *  which is what makes six different environments read as six rooms in one
 *  building rather than as six screens. */
function Header({
  title,
  subtitle,
  width,
  height,
  type,
  theme: t,
  lit,
}: {
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  type: Type;
  theme: MuseumTheme;
  lit: boolean;
}) {
  const x = -width / 2 + width * 0.06;
  const { titleY, subY, ruleY } = headerLayout(height, type, Boolean(subtitle));

  return (
    <group>
      <Text
        position={[x, titleY, L]}
        fontSize={type.title}
        letterSpacing={0.24}
        anchorX="left"
        anchorY="middle"
        color={t.panelText}
        outlineWidth={0}
        outlineBlur={type.title * 0.45}
        outlineColor={t.accent}
        outlineOpacity={lit ? 0.45 : 0.15}
      >
        {title}
      </Text>
      {subtitle && (
        <Text
          position={[x, subY, L]}
          fontSize={type.caption}
          letterSpacing={0.4}
          anchorX="left"
          anchorY="middle"
          color={t.accent}
          fillOpacity={lit ? 0.8 : 0.35}
        >
          {subtitle}
        </Text>
      )}
      {/* The rule under it, the full width of the box so it reads as a horizon
          rather than as the top of a card. */}
      <mesh position={[0, ruleY, L]}>
        <planeGeometry args={[width * 0.98, height * 0.0016]} />
        <meshStandardMaterial
          color={t.accent}
          emissive={t.accent}
          emissiveIntensity={lit ? 0.9 : 0.22}
          roughness={0.5}
        />
      </mesh>
    </group>
  );
}

/**
 * Where the header's three lines sit, and where a view may start underneath
 * them.
 *
 * Measured off the TYPE, not off the box. The block used to be pinned at fixed
 * fractions of the height — title at 0.055, subtitle 0.055 below it, rule 0.095
 * below that — which holds exactly as long as the type never changes size. Draw
 * it at scale 1.3 on a narrow window and the subtitle climbs into the title's
 * descenders. Leading is a property of type, not of the panel it is set in.
 *
 * One function for all four numbers so the header and the view under it cannot
 * drift apart: `bodyTop` is the rule's own position plus a gap, by construction.
 */
function headerLayout(height: number, type: Type, subtitle: boolean) {
  const titleY = height / 2 - height * 0.035 - type.title / 2;
  const subY = titleY - type.title * 0.62 - type.caption * 0.9;
  const ruleY =
    (subtitle ? subY - type.caption : titleY - type.title * 0.7) - height * 0.022;
  return { titleY, subY, ruleY, bodyTop: ruleY - height * 0.04 };
}

/** One diagnostic meter, at whatever size it is given. Shared by CORE SKILLS
 *  and by the project view's statistics, because they are the same instrument
 *  reading different things. */
function Meter({
  x,
  y,
  w,
  label,
  level,
  note,
  size,
  theme: t,
  lit,
  charge,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  level: number;
  note?: string;
  size: number;
  theme: MuseumTheme;
  lit: boolean;
  charge: React.RefObject<number>;
}) {
  const fill = useRef<Mesh>(null);
  const railH = size * 0.62;

  useFrame(({ clock }) => {
    if (!fill.current) return;
    // The same charge the whole view runs on, so five meters fill as one
    // instrument coming up rather than as five independent bars.
    const l =
      (charge.current ?? 1) *
      (level / 100) *
      (0.985 + 0.015 * Math.sin(clock.elapsedTime * 1.3 + x + y));
    fill.current.scale.x = Math.max(0.001, l);
    fill.current.position.x = -w / 2 + (w * l) / 2;
  });

  return (
    <group position={[x, y, 0]}>
      <Text
        position={[-w / 2, size * 0.95, L]}
        fontSize={size}
        letterSpacing={0.16}
        anchorX="left"
        anchorY="middle"
        color={t.panelText}
        fillOpacity={lit ? 0.85 : 0.35}
      >
        {label}
      </Text>
      <Text
        position={[w / 2, size * 0.95, L]}
        fontSize={size}
        anchorX="right"
        anchorY="middle"
        color={t.accent}
        fillOpacity={lit ? 0.95 : 0.4}
      >
        {`${level}%`}
      </Text>
      {/* The rail. Dead black rather than tinted: a meter is read by the
          contrast between the lit part and the empty part, and a rail that
          glows on its own halves that contrast. */}
      <mesh position={[0, 0, L]}>
        <planeGeometry args={[w, railH]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.55} />
      </mesh>
      <mesh ref={fill} position={[-w / 2, 0, L * 2]}>
        <planeGeometry args={[w, railH * 0.66]} />
        <meshStandardMaterial
          color={t.accent}
          emissive={t.accent}
          /* Held under the clipping ceiling — cyan driven past about 1.4 pins
             green and blue and comes back white, and a white energy meter is
             not an energy meter. */
          emissiveIntensity={lit ? 1.35 : 0.35}
          roughness={0.35}
        />
      </mesh>
      {note && (
        <Text
          position={[-w / 2, -size * 1.05, L]}
          fontSize={size * 0.78}
          letterSpacing={0.1}
          maxWidth={w}
          anchorX="left"
          anchorY="middle"
          color={t.panelMuted}
          fillOpacity={lit ? 0.6 : 0.25}
        >
          {note}
        </Text>
      )}
    </group>
  );
}

/** A horizontal run of dated nodes. Used by ABOUT ME for a career and by
 *  ACHIEVEMENTS for milestones — one component, because a timeline is a
 *  timeline and giving them separate ones guarantees they drift apart. */
function Timeline({
  y,
  width,
  entries,
  size,
  theme: t,
  lit,
  tint,
}: {
  y: number;
  width: number;
  entries: { year: string; label: string }[];
  size: number;
  theme: MuseumTheme;
  lit: boolean;
  tint?: string;
}) {
  const color = tint ?? t.accent;
  if (entries.length === 0) return null;
  const step = width / entries.length;

  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0, L]}>
        <planeGeometry args={[width, 0.006]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={lit ? 0.7 : 0.2}
          roughness={0.5}
        />
      </mesh>
      {entries.map((entry, i) => {
        const x = -width / 2 + step * (i + 0.5);
        // Alternating above and below the line: a run of labels all on one side
        // is a list with a rule over it, not a timeline.
        const up = i % 2 === 0 ? 1 : -1;
        return (
          <group key={entry.year + entry.label} position={[x, 0, 0]}>
            <mesh position={[0, 0, L * 2]}>
              <circleGeometry args={[size * 0.42, 16]} />
              <meshStandardMaterial
                color={t.strip}
                emissive={color}
                emissiveIntensity={lit ? 1.8 : 0.45}
                roughness={0.35}
              />
            </mesh>
            <mesh position={[0, up * size * 0.9, L]}>
              <planeGeometry args={[0.005, size * 1.5]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={lit ? 0.5 : 0.15}
                roughness={0.5}
              />
            </mesh>
            <Text
              position={[0, up * size * 2.1, L]}
              fontSize={size}
              letterSpacing={0.08}
              anchorX="center"
              anchorY="middle"
              color={color}
              fillOpacity={lit ? 0.95 : 0.4}
            >
              {entry.year}
            </Text>
            {/* Anchored at the edge nearest the line rather than centred, so a
                caption that wraps to two lines grows AWAY from the timeline
                instead of through the year above it. */}
            <Text
              position={[0, up * size * 3, L]}
              fontSize={size * 0.82}
              letterSpacing={0.08}
              lineHeight={1.3}
              maxWidth={step * 0.86}
              textAlign="center"
              anchorX="center"
              anchorY={up > 0 ? "bottom" : "top"}
              color={t.panelMuted}
              fillOpacity={lit ? 0.7 : 0.3}
            >
              {entry.label}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

/** A number and its caption, at display size. The overview's stat cells at four
 *  times the scale — this is the one place a detail view IS allowed to just be
 *  bigger, because the whole point of a headline figure is its size. */
function Figure({
  x,
  y,
  value,
  label,
  size,
  labelSize,
  maxWidth,
  theme: t,
  lit,
  tint,
}: {
  x: number;
  y: number;
  value: string;
  label: string;
  size: number;
  /** The caption under it. Off the ramp rather than off the figure — a quarter
   *  of a display number is not a size anybody chose, and at four figures across
   *  a narrow console it is the size that decides whether the captions collide. */
  labelSize: number;
  /** The column the caption may use. It wraps to two lines rather than running
   *  into its neighbour, which is what a caption under a number has to do when
   *  the box narrows. */
  maxWidth: number;
  theme: MuseumTheme;
  lit: boolean;
  tint?: string;
}) {
  const color = tint ?? t.accent;
  return (
    <group position={[x, y, 0]}>
      <Text
        position={[0, size * 0.35, L]}
        fontSize={size}
        anchorX="center"
        anchorY="middle"
        color={t.panelText}
        outlineWidth={0}
        outlineBlur={size * 0.5}
        outlineColor={color}
        outlineOpacity={lit ? 0.5 : 0.16}
      >
        {value}
      </Text>
      <Text
        position={[0, -size * 0.32 - labelSize, L]}
        fontSize={labelSize}
        letterSpacing={0.18}
        lineHeight={1.3}
        maxWidth={maxWidth}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={t.panelMuted}
        fillOpacity={lit ? 0.75 : 0.3}
      >
        {label}
      </Text>
    </group>
  );
}

/** A labelled holographic node — the atom the TECH STACK graph is built from. */
function Node({
  x,
  y,
  r,
  label,
  theme: t,
  lit,
  tint,
}: {
  x: number;
  y: number;
  r: number;
  label: string;
  theme: MuseumTheme;
  lit: boolean;
  tint?: string;
}) {
  const color = tint ?? t.accent;
  return (
    <group position={[x, y, L * 3]}>
      <mesh>
        <circleGeometry args={[r, 24]} />
        <meshBasicMaterial color={t.holoScreen} transparent opacity={0.85} />
      </mesh>
      <mesh position={[0, 0, L * 0.5]}>
        <ringGeometry args={[r * 0.92, r, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={lit ? 1.3 : 0.35}
          roughness={0.4}
        />
      </mesh>
      {/* A second, broken ring outside the first. Two rings read as a component
          with a state; one ring reads as a dot. */}
      <mesh position={[0, 0, L * 0.5]}>
        <ringGeometry args={[r * 1.18, r * 1.24, 24, 1, 0.4, Math.PI * 1.2]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={lit ? 0.8 : 0.2}
          roughness={0.4}
        />
      </mesh>
      <Text
        position={[0, 0, L]}
        fontSize={r * 0.3}
        letterSpacing={0.04}
        lineHeight={1.15}
        maxWidth={r * 1.7}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        color={t.panelText}
        fillOpacity={lit ? 0.95 : 0.4}
      >
        {label}
      </Text>
    </group>
  );
}

/** A glowing line between two points. A plane rotated onto the bearing rather
 *  than a Line primitive: line width in world units is what makes a connection
 *  read as a conduit instead of a hairline, and only geometry gives you that. */
function Link({
  from,
  to,
  weight,
  theme: t,
  lit,
  tint,
}: {
  from: [number, number];
  to: [number, number];
  weight: number;
  theme: MuseumTheme;
  lit: boolean;
  tint?: string;
}) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return (
    <mesh
      position={[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, L]}
      rotation={[0, 0, Math.atan2(dy, dx)]}
    >
      <planeGeometry args={[length, weight]} />
      <meshStandardMaterial
        color={tint ?? t.holo}
        emissive={tint ?? t.holo}
        emissiveIntensity={lit ? 0.5 : 0.14}
        roughness={0.6}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ *
 * ABOUT ME
 * ------------------------------------------------------------------ */

function AboutView({
  width,
  height,
  profile,
  theme: t,
  lit,
  scale,
  charge,
}: ViewProps & { charge: React.RefObject<number> }) {
  const type = typeFor(height, scale);
  const stats = profile.stats ?? [];
  const skills = (profile.skills ?? []).slice(0, 3);

  /* Two columns and a rule, and every number below is derived rather than
     typed. The left column is the reading; the right is the instrumentation;
     the timeline runs under both. What used to be here was a set of fixed
     fractions of the height that happened to work at the aspect the wall gave
     it — at any other shape the philosophy paragraph wrapped to two more lines
     and ran straight out through the bottom of its own panel. */
  const top = headerLayout(height, type, true).bodyTop;
  const railY = -height * 0.5 + height * 0.14;
  /* Down to where the TIMELINE's captions reach, not down to the timeline: it
     alternates its labels above and below its own line, so the rail is not the
     top of it. Measuring to the line put the panel's bottom corner through the
     first, third and fifth captions. */
  const columnH = top - (railY + type.micro * 5.5);

  const padding = width * 0.022;
  const panelW = width * 0.46;
  const panelX = -width / 2 + panelW / 2 + width * 0.03;
  const textW = panelW - padding * 2;
  const textX = -panelW / 2 + padding;

  /* The left column: measured, fitted, then flowed.
     Measured, because the only thing that decides how tall a paragraph is is
     how many lines it wraps to, and that depends on a column width that now
     changes with the window. Fitted, because a bio long enough to overrun its
     panel should come down a step rather than through the bottom edge — the
     alternative is either clipping somebody's writing or forbidding them from
     writing it. And flowed, because a block that grows has to push what follows
     down: this column used to be four pinned fractions of the height, which is
     four blocks all convinced they are the only one on the panel. */
  const copy = (s: number) => {
    const caption = type.caption * s;
    const body = type.body * s;
    const lead = type.lead * s;
    return (
      caption * (1 + STACK_GAP) +
      (profile.about ? blockHeight(profile.about, lead, textW, 1.5) : 0) +
      body * STACK_GAP +
      (profile.philosophy ? blockHeight(profile.philosophy, body, textW) : 0) +
      body * STACK_GAP * 1.4 +
      caption
    );
  };
  const fit = fitColumn(copy, columnH - padding * 2, 0.8 / scale);
  const caption = type.caption * fit;
  const body = type.body * fit;
  const lead = type.lead * fit;

  const column = stack(0);
  const captionY = column.take(caption, caption * STACK_GAP);
  const aboutY = column.take(
    profile.about ? blockHeight(profile.about, lead, textW, 1.5) : 0,
    body * STACK_GAP,
  );
  const philosophyY = column.take(
    profile.philosophy ? blockHeight(profile.philosophy, body, textW) : 0,
    body * STACK_GAP * 1.4,
  );
  const availabilityY = column.take(caption);
  /* And the panel is as tall as what went into it. A panel sized independently
     of its contents is either too big or too small, and on a console that
     recomposes itself for the window it is always one of the two. */
  const panelH = Math.min(columnH, -column.y + padding * 2);
  const panelY = top - panelH / 2;

  // The right column: figures over meters, both hung off the same left edge.
  const rightX = width * 0.175;
  const rightW = width * 0.38;
  const figureStep = rightW / Math.max(1, stats.length);
  const figuresY = top - type.display * 0.7;
  const metersTop = figuresY - type.display * 0.5 - type.micro * 2.5;
  const meterStep = Math.min(
    type.caption * 4.4,
    (metersTop - railY - type.micro * 6) / Math.max(1, skills.length),
  );

  return (
    <group>
      <Header
        title="ABOUT ME"
        subtitle={profile.role}
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      {/* The introduction, given room to be read rather than to be glanced at.
          This is the one thing the overview's panel genuinely could not do: at
          overview size the same words are three lines of 11cm type seen from
          twenty metres, which is a texture that says "there is a bio here". */}
      <Panel
        x={panelX}
        y={panelY}
        w={panelW}
        h={panelH}
        theme={t}
        lit={lit}
        header={caption * 2.4}
      >
        {/* The flow's own origin, put at the panel's top edge — which is the
            one line that lets the column above be measured without knowing how
            tall the panel it lands in will turn out to be. */}
        <group position={[0, panelH / 2 - padding, 0]}>
          <Text
            position={[textX, captionY, 0]}
            fontSize={caption}
            letterSpacing={0.3}
            anchorX="left"
            anchorY="top"
            color={t.accent}
          >
            PROFILE
          </Text>
          {profile.about && (
            <Text
              position={[textX, aboutY, 0]}
              fontSize={lead}
              lineHeight={1.5}
              maxWidth={textW}
              anchorX="left"
              anchorY="top"
              color={t.panelText}
              fillOpacity={lit ? 0.92 : 0.35}
            >
              {profile.about}
            </Text>
          )}
          {profile.philosophy && (
            <Text
              position={[textX, philosophyY, 0]}
              fontSize={body}
              lineHeight={LINE}
              maxWidth={textW}
              anchorX="left"
              anchorY="top"
              color={t.panelMuted}
              fillOpacity={lit ? 0.72 : 0.3}
            >
              {profile.philosophy}
            </Text>
          )}
          {profile.availability && (
            <>
              <mesh
                position={[textX + caption * 0.4, availabilityY - caption * 0.5, 0.002]}
              >
                <circleGeometry args={[caption * 0.32, 16]} />
                <meshStandardMaterial
                  color={t.panelLive}
                  emissive={t.panelLive}
                  emissiveIntensity={lit ? 1.9 : 0.45}
                  roughness={0.4}
                />
              </mesh>
              <Text
                position={[textX + caption * 1.2, availabilityY, 0]}
                fontSize={caption}
                letterSpacing={0.18}
                maxWidth={textW - caption * 1.2}
                anchorX="left"
                anchorY="top"
                color={t.panelLive}
                fillOpacity={lit ? 0.95 : 0.4}
              >
                {profile.availability}
              </Text>
            </>
          )}
        </group>
      </Panel>

      {/* The figures, at headline size. Spread across the right column rather
          than at a fixed pitch, so three of them and five of them both fill it
          and neither overlaps. */}
      {stats.map((stat, i) => (
        <Figure
          key={stat.label}
          x={rightX + (i - (stats.length - 1) / 2) * figureStep}
          y={figuresY}
          value={stat.value}
          label={stat.label}
          size={type.display * 0.82}
          labelSize={type.micro}
          maxWidth={figureStep * 0.92}
          theme={t}
          lit={lit}
        />
      ))}

      {/* Experience as meters rather than as another list of numbers — the
          right-hand half of this view is the same diagnostics language the rest
          of the machine speaks. */}
      {skills.map((skill, i) => (
        <Meter
          key={skill.label}
          x={rightX}
          y={metersTop - i * meterStep}
          w={rightW}
          label={skill.label}
          level={skill.level}
          size={type.micro}
          theme={t}
          lit={lit}
          charge={charge}
        />
      ))}

      {profile.timeline && profile.timeline.length > 0 && (
        <Timeline
          y={railY}
          width={width * 0.88}
          entries={profile.timeline}
          size={type.micro}
          theme={t}
          lit={lit}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * TECH STACK
 * ------------------------------------------------------------------ */

/**
 * The stack as a graph rather than as a list.
 *
 * Groups are laid out as hubs across the width and their members ringed around
 * them, every member wired back to its hub and every hub wired to its
 * neighbours. That shape is the argument the view is making: a stack is not
 * seven logos, it is four concerns that have to talk to each other, and the
 * lines are the part the overview's row of chips cannot show.
 */
function TechView({ width, height, profile, theme: t, lit, scale }: ViewProps) {
  const pulse = useRef<Group>(null);
  const type = typeFor(height, scale);
  const top = headerLayout(height, type, true).bodyTop;

  const graph = useMemo(() => {
    const groups =
      profile.techGroups && profile.techGroups.length > 0
        ? profile.techGroups
        : [{ label: "STACK", items: profile.tech ?? [] }];

    const span = width * 0.82;
    const step = span / groups.length;
    /* The ring the members sit on, and the single most load-bearing number in
       this view. It used to be a third of the step, which is fine on a display
       five times wider than it is tall and disastrous on a console: at four
       groups in a two-to-one box, two neighbouring orbits plus their node radii
       reached further than the gap between their hubs, and the graph read as
       one cloud rather than four concerns. Everything here is now capped by the
       step FIRST and by the height second, so groups can crowd but can never
       interleave, at any shape of window. */
    const orbit = Math.min(step * 0.33, height * 0.23);
    const nodeR = Math.min(orbit * 0.42, height * 0.075);
    const hubR = nodeR * 1.15;

    return groups.map((group, g) => {
      const hx = -span / 2 + step * (g + 0.5);
      const hy = top - height * 0.29;
      const count = Math.max(1, group.items.length);
      return {
        label: group.label,
        hub: [hx, hy] as [number, number],
        hubR,
        nodeR,
        // Started at the top and swept a whole turn, so a group of two sits
        // above and below its hub rather than both to one side.
        items: group.items.map((name, i) => {
          const a = Math.PI / 2 + (i / count) * Math.PI * 2;
          return {
            name,
            at: [hx + Math.cos(a) * orbit, hy + Math.sin(a) * orbit * 0.78] as [
              number,
              number,
            ],
          };
        }),
      };
    });
  }, [profile.techGroups, profile.tech, width, height, top]);

  // One slow sweep of brightness across the hubs, so the graph reads as
  // carrying something rather than as a diagram of what could be carried.
  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const time = clock.elapsedTime;
    pulse.current.children.forEach((child, i) => {
      const phase = (Math.sin(time * 0.9 - i * 0.8) + 1) / 2;
      child.scale.setScalar(0.92 + phase * 0.16);
    });
  });

  return (
    <group>
      <Header
        title="TECH STACK"
        subtitle="ARCHITECTURE · DEPENDENCIES · TOOLING"
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      {/* Trunk lines between the hubs first, so they sit behind everything. */}
      {graph.slice(0, -1).map((group, i) => (
        <Link
          key={`trunk${group.label}`}
          from={group.hub}
          to={graph[i + 1].hub}
          weight={height * 0.003}
          theme={t}
          lit={lit}
          tint={t.accentAlt}
        />
      ))}

      {graph.map((group, g) => (
        <group key={group.label}>
          {group.items.map((item) => (
            <Link
              key={`l${item.name}`}
              from={group.hub}
              to={item.at}
              weight={height * 0.0018}
              theme={t}
              lit={lit}
            />
          ))}
          {group.items.map((item) => (
            <Node
              key={item.name}
              x={item.at[0]}
              y={item.at[1]}
              r={group.nodeR}
              label={item.name}
              theme={t}
              lit={lit}
              tint={g % 2 === 0 ? t.accent : t.holo}
            />
          ))}
          {/* The group's name, hung off the hub rather than off the bottom of
              the box — a caption pinned to the floor of a view whose graph
              moves with the header is a caption that eventually parts company
              with the thing it names. */}
          <Text
            position={[group.hub[0], group.hub[1] - group.nodeR - height * 0.185, L]}
            fontSize={type.caption}
            letterSpacing={0.3}
            maxWidth={width * 0.82 / graph.length}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            color={t.accentAlt}
            fillOpacity={lit ? 0.9 : 0.35}
          >
            {group.label}
          </Text>
        </group>
      ))}

      {/* The hubs last and in their own group, because they are the only thing
          on this view that animates and keeping them together means one
          traversal a frame instead of a search. */}
      <group ref={pulse}>
        {graph.map((group) => (
          <group key={`hub${group.label}`} position={[group.hub[0], group.hub[1], L * 4]}>
            <mesh>
              <circleGeometry args={[group.hubR, 28]} />
              <meshBasicMaterial color={t.holoScreen} transparent opacity={0.9} />
            </mesh>
            <mesh position={[0, 0, L * 0.5]}>
              <ringGeometry args={[group.hubR * 0.9, group.hubR, 28]} />
              <meshStandardMaterial
                color={t.accentAlt}
                emissive={t.accentAlt}
                emissiveIntensity={lit ? 1.5 : 0.4}
                roughness={0.35}
              />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * CORE SKILLS
 * ------------------------------------------------------------------ */

function SkillsView({
  width,
  height,
  profile,
  theme: t,
  lit,
  scale,
  charge,
}: ViewProps & { charge: React.RefObject<number> }) {
  const type = typeFor(height, scale);
  const top = headerLayout(height, type, true).bodyTop;
  const skills = profile.skills ?? [];
  const tech = profile.tech ?? [];

  const padding = width * 0.026;
  const panelW = width * 0.5;
  const panelX = -width / 2 + panelW / 2 + width * 0.03;
  const panelH = top - (-height * 0.44);
  const panelY = top - panelH / 2;
  // The rails fill the panel between its own margins, however many there are.
  const step = (panelH - padding * 3) / Math.max(1, skills.length);
  const first = panelH / 2 - padding * 1.5 - step / 2;

  /* The chip grid, centred in what the panel leaves rather than at a typed x —
     which is what stops it from being clear of the panel at one aspect and
     halfway across it at another. */
  const panelRight = panelX + panelW / 2;
  const chipsX = (panelRight + width / 2) / 2;
  const chipW = Math.min(width * 0.11, (width / 2 - panelRight) / 3.2);
  const chipH = Math.max(type.micro * 3, height * 0.075);

  return (
    <group>
      <Header
        title="CORE SKILLS"
        subtitle="SYSTEM DIAGNOSTICS · CAPABILITY REPORT"
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      <Panel
        x={panelX}
        y={panelY}
        w={panelW}
        h={panelH}
        theme={t}
        lit={lit}
      >
        {skills.map((skill, i) => (
          <Meter
            key={skill.label}
            x={0}
            y={first - i * step}
            w={panelW - padding * 2}
            label={skill.label}
            level={skill.level}
            size={type.micro}
            theme={t}
            lit={lit}
            charge={charge}
          />
        ))}
      </Panel>

      {/* What those readings are made OF. The overview says 95%; this says what
          the 95% is in — which is the only reason a percentage is worth
          printing at all. */}
      <group position={[chipsX, 0, 0]}>
        <Text
          position={[0, top - type.caption, L]}
          fontSize={type.caption}
          letterSpacing={0.3}
          anchorX="center"
          anchorY="middle"
          color={t.accent}
        >
          APPLIED ACROSS
        </Text>
        {tech.map((name, i) => {
          const perRow = 3;
          const row = Math.floor(i / perRow);
          const inRow = Math.min(perRow, tech.length - row * perRow);
          const col = i % perRow;
          return (
            <group
              key={name}
              position={[
                (col - (inRow - 1) / 2) * chipW,
                top - type.caption * 3.6 - row * chipH * 1.3,
                0,
              ]}
            >
              <mesh position={[0, 0, L]}>
                <planeGeometry args={[chipW * 0.9, chipH]} />
                <meshBasicMaterial
                  color={t.holo}
                  transparent
                  opacity={lit ? 0.1 : 0.04}
                  depthWrite={false}
                />
              </mesh>
              <mesh position={[0, chipH / 2 - height * 0.002, L * 2]}>
                <planeGeometry args={[chipW * 0.45, height * 0.0018]} />
                <meshStandardMaterial
                  color={t.strip}
                  emissive={t.accent}
                  emissiveIntensity={lit ? 1.3 : 0.35}
                  roughness={0.4}
                />
              </mesh>
              <Text
                position={[0, 0, L * 3]}
                fontSize={type.micro}
                letterSpacing={0.06}
                lineHeight={1.2}
                maxWidth={chipW * 0.82}
                textAlign="center"
                anchorX="center"
                anchorY="middle"
                color={t.panelText}
                fillOpacity={lit ? 0.85 : 0.35}
              >
                {name}
              </Text>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * ACHIEVEMENTS
 * ------------------------------------------------------------------ */

function AchievementsView({ width, height, profile, theme: t, lit, scale }: ViewProps) {
  const type = typeFor(height, scale);
  const top = headerLayout(height, type, true).bodyTop;
  const items = profile.achievements ?? [];

  /* The figures share the width out between themselves rather than sitting at a
     typed pitch, so four of them and six of them both fill the row and neither
     runs off the end of a console that has narrowed to suit the window. */
  const step = (width * 0.86) / Math.max(1, items.length);
  const figureY = top - type.display * 0.85;
  const ruleY = figureY - type.display * 0.45 - type.micro * 3;

  return (
    <group>
      <Header
        title="ACHIEVEMENTS"
        subtitle="RECORD · MILESTONES"
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      {items.map((item, i) => (
        <Figure
          key={item.label}
          x={(i - (items.length - 1) / 2) * step}
          y={figureY}
          value={item.value}
          label={item.label}
          size={type.display}
          labelSize={type.micro}
          maxWidth={step * 0.88}
          theme={t}
          lit={lit}
          tint={i % 2 === 0 ? t.accent : t.accentAlt}
        />
      ))}

      {/* A rule under the figures. Cheap, and it turns four numbers standing in
          a row into one instrument with four readings. */}
      <mesh position={[0, ruleY, L]}>
        <planeGeometry args={[width * 0.86, height * 0.0014]} />
        <meshStandardMaterial
          color={t.accent}
          emissive={t.accent}
          emissiveIntensity={lit ? 0.6 : 0.16}
          roughness={0.5}
        />
      </mesh>

      {profile.milestones && profile.milestones.length > 0 && (
        <Timeline
          // Centred in what the figures left, so the milestone captions have
          // the same room above and below the line whatever shape the box is.
          y={(ruleY + (-height * 0.5 + type.micro * 5)) / 2}
          width={width * 0.86}
          entries={profile.milestones}
          size={type.micro}
          theme={t}
          lit={lit}
          tint={t.accentAlt}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * CURRENT FOCUS
 * ------------------------------------------------------------------ */

function FocusView({ width, height, profile, theme: t, lit, scale }: ViewProps) {
  const spin = useRef<Group>(null);
  const counterSpin = useRef<Group>(null);
  const core = useRef<MeshBasicMaterial>(null);
  const type = typeFor(height, scale);
  const top = headerLayout(height, type, true).bodyTop;
  const progress = profile.focus?.progress ?? 0;
  const learning = profile.learning ?? [];

  /* The reactor takes whichever runs out first — half the space under the
     header, or a quarter of the column it shares with the copy. On the wall it
     was a flat fraction of the height, which on a narrower console put a
     dial the size of a dinner plate against a paragraph the width of a
     receipt. */
  const r = Math.min((top + height * 0.42) / 2.3, width * 0.13);
  const dialY = top - r * 1.15;

  // The right column, flowed: the focus line, then the learning chips under it.
  const columnW = width * 0.46;
  const focusH = profile.focus ? blockHeight(profile.focus.text, type.lead, columnW, 1.5) : 0;
  const column = stack(top - height * 0.02);
  const focusY = column.take(focusH, type.lead * STACK_GAP * 1.6);
  const learningY = column.take(type.caption, type.caption * STACK_GAP * 1.4);
  const chipW = columnW / Math.max(3, learning.length);
  const chipH = Math.max(type.micro * 3, height * 0.08);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (spin.current) spin.current.rotation.z = time * 0.3;
    if (counterSpin.current) counterSpin.current.rotation.z = -time * 0.46;
    if (core.current) {
      core.current.opacity = (lit ? 0.42 : 0.14) * (0.7 + 0.3 * Math.sin(time * 2.1));
    }
  });

  return (
    <group>
      <Header
        title="CURRENT FOCUS"
        subtitle="ACTIVE WORKLOAD"
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      {/* The reactor, at the size the overview's readout was a thumbnail of. */}
      <group position={[-width * 0.25, dialY, 0]}>
        <mesh position={[0, 0, L]}>
          <ringGeometry args={[r, r * 1.1, 64]} />
          <meshBasicMaterial color={t.holoScreen} transparent opacity={0.9} />
        </mesh>
        <mesh position={[0, 0, L * 2]}>
          <ringGeometry
            args={[
              r,
              r * 1.1,
              64,
              1,
              Math.PI / 2 - Math.PI * 2 * progress,
              Math.PI * 2 * progress,
            ]}
          />
          <meshStandardMaterial
            color={t.accent}
            emissive={t.accent}
            emissiveIntensity={lit ? 1.6 : 0.4}
            roughness={0.35}
          />
        </mesh>
        <group ref={spin} position={[0, 0, L * 3]}>
          {[0, Math.PI * 0.7, Math.PI * 1.35].map((start) => (
            <mesh key={start}>
              <ringGeometry args={[r * 0.84, r * 0.89, 48, 1, start, Math.PI * 0.36]} />
              <meshStandardMaterial
                color={t.accentAlt}
                emissive={t.accentAlt}
                emissiveIntensity={lit ? 1.4 : 0.35}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>
        <group ref={counterSpin} position={[0, 0, L * 3]}>
          {[0, Math.PI].map((start) => (
            <mesh key={start}>
              <ringGeometry args={[r * 0.68, r * 0.71, 48, 1, start, Math.PI * 0.55]} />
              <meshStandardMaterial
                color={t.holo}
                emissive={t.holo}
                emissiveIntensity={lit ? 1.1 : 0.3}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0, L * 2.5]}>
          <circleGeometry args={[r * 0.62, 40]} />
          <meshBasicMaterial
            ref={core}
            color={t.accent}
            transparent
            opacity={0.3}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <Text
          position={[0, 0, L * 5]}
          fontSize={r * 0.42}
          anchorX="center"
          anchorY="middle"
          color={t.panelText}
        >
          {`${Math.round(progress * 100)}%`}
        </Text>
      </group>

      {/* What the reading is about. Anchored top-left and flowed down, so a
          longer sentence takes another line off the space below it instead of
          growing through the row of chips. */}
      <group position={[width * 0.16, 0, 0]}>
        {profile.focus && (
          <Text
            position={[-columnW / 2, focusY, L]}
            fontSize={type.lead}
            lineHeight={1.5}
            maxWidth={columnW}
            textAlign="left"
            anchorX="left"
            anchorY="top"
            color={t.panelText}
            fillOpacity={lit ? 0.9 : 0.35}
          >
            {profile.focus.text}
          </Text>
        )}
        {learning.length > 0 && (
          <>
            <Text
              position={[-columnW / 2, learningY, L]}
              fontSize={type.caption}
              letterSpacing={0.3}
              anchorX="left"
              anchorY="top"
              color={t.accentAlt}
            >
              CURRENTLY LEARNING
            </Text>
            {learning.map((item, i) => (
              <group
                key={item}
                position={[
                  -columnW / 2 + chipW * (i + 0.5),
                  column.y - chipH / 2,
                  0,
                ]}
              >
                <mesh position={[0, 0, L]}>
                  <planeGeometry args={[chipW * 0.9, chipH]} />
                  <meshBasicMaterial
                    color={t.accentAlt}
                    transparent
                    opacity={lit ? 0.12 : 0.05}
                    depthWrite={false}
                  />
                </mesh>
                <Text
                  position={[0, 0, L * 2]}
                  fontSize={type.micro}
                  letterSpacing={0.08}
                  lineHeight={1.2}
                  maxWidth={chipW * 0.82}
                  textAlign="center"
                  anchorX="center"
                  anchorY="middle"
                  color={t.panelText}
                  fillOpacity={lit ? 0.85 : 0.35}
                >
                  {item}
                </Text>
              </group>
            ))}
          </>
        )}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * PROJECTS, and one project
 * ------------------------------------------------------------------ */

/** The project picker, shown along the bottom of both project views so the set
 *  is always visible and switching never means going back first. */
function ProjectStrip({
  y,
  width,
  height,
  type,
  tabH,
  projects,
  active,
  onProject,
  theme: t,
  lit,
}: {
  /** The TOP of the strip. The caller has just finished laying out a column
   *  down to exactly this line and needs the strip to start below it — handing
   *  over a centre instead means the caller has to know how tall a tab is. */
  y: number;
  width: number;
  height: number;
  type: Type;
  /** Sized to the type it holds, with a flat fraction of the box as a floor: a
   *  picker whose hit target shrinks with the window is a picker you stop being
   *  able to hit. */
  tabH: number;
  projects: { name: string }[];
  active: number;
  onProject: (i: number) => void;
  theme: MuseumTheme;
  lit: boolean;
}) {
  const step = (width * 0.9) / Math.max(1, projects.length);
  return (
    <group position={[0, y - tabH / 2, 0]}>
      {projects.map((project, i) => {
        const on = i === active;
        return (
          <group
            key={project.name}
            position={[-((projects.length - 1) / 2) * step + i * step, 0, 0]}
          >
            <mesh
              position={[0, 0, L * 2]}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onProject(i);
              }}
            >
              <planeGeometry args={[step * 0.9, tabH]} />
              <meshBasicMaterial
                color={on ? t.accent : t.holo}
                transparent
                opacity={on ? (lit ? 0.22 : 0.1) : lit ? 0.07 : 0.03}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, -tabH / 2, L * 3]}>
              <planeGeometry args={[step * 0.9, height * 0.0016]} />
              <meshStandardMaterial
                color={on ? t.strip : t.holo}
                emissive={on ? t.accent : t.holo}
                emissiveIntensity={(lit ? 1.4 : 0.35) * (on ? 1 : 0.35)}
                roughness={0.4}
              />
            </mesh>
            <Text
              position={[0, 0, L * 4]}
              fontSize={type.micro}
              letterSpacing={0.14}
              lineHeight={1.2}
              maxWidth={step * 0.82}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              color={on ? t.panelText : t.panelMuted}
              fillOpacity={lit ? (on ? 1 : 0.6) : 0.3}
            >
              {project.name}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

function ProjectView({
  width,
  height,
  profile,
  theme: t,
  lit,
  scale,
  project,
  onProject,
  charge,
}: ViewProps & { charge: React.RefObject<number> }) {
  const projects = profile.projects ?? [];
  const active = projects[Math.min(project, projects.length - 1)];
  const preview = useRef<Mesh>(null);
  const scanline = useRef<MeshStandardMaterial>(null);
  const type = typeFor(height, scale);
  const top = headerLayout(height, type, true).bodyTop;

  // The preview is a HOLOGRAM of a screen, not a screenshot of one, so it
  // breathes and carries a refresh bar. Without that it is a grey rectangle
  // captioned "preview" and everyone can tell.
  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (preview.current) {
      preview.current.position.z = L * 6 + Math.sin(time * 0.7) * 0.012;
    }
    if (scanline.current) {
      scanline.current.emissiveIntensity =
        (lit ? 1.1 : 0.3) * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 1.4)));
    }
  });

  if (!active) {
    return (
      <group>
        <Header
          title="PROJECTS"
          subtitle="NO WORK LOADED"
          width={width}
          height={height}
          type={type}
          theme={t}
          lit={lit}
        />
      </group>
    );
  }

  /* Two columns under the header: the preview and its statistics on the left,
     the write-up on the right, and the picker across the bottom of both. Every
     number is measured off the header's rule and off the type, because this is
     the view with the most words in it and therefore the one that fails first
     when the box changes shape. */
  const strip = projects.length > 1;
  const tabH = Math.max(type.micro * 2.8, height * 0.09);
  /* The floor of both columns: where the picker starts, or the bottom margin if
     there is no picker to make room for. */
  const floorY = strip ? -height * 0.5 + tabH + height * 0.05 : -height * 0.45;
  const columnH = top - floorY;

  /* The narrow column: the preview, what it measures, and where to find it. The
     preview is capped against the COLUMN as well as the width, because it is
     the one element here that would happily take the whole view — and the four
     things stacked under it are the ones that would then have nowhere to go. */
  const leftW = width * 0.32;
  const leftX = -width / 2 + leftW / 2 + width * 0.035;
  const previewH = Math.min(leftW * 0.58, columnH * 0.28);
  const previewW = previewH / 0.58;

  const stats = active.stats ?? [];
  const features = (active.features ?? []).map((f) => `· ${f}`).join("\n");
  const links = [
    active.demo && `LIVE  ${active.demo}`,
    active.repo && `REPO  ${active.repo}`,
  ]
    .filter(Boolean)
    .join("\n");

  /* Fitted against what the preview leaves, and the preview itself deliberately
     left out of the measurement: it is the one thing in this column that is not
     type, so shrinking the type to make room for it would be shrinking the
     wrong thing. */
  const leftCopy = (s: number) => {
    const micro = type.micro * s;
    return (
      stats.length * micro * 3.4 +
      micro * 1.2 +
      (links ? blockHeight(links, micro, leftW, 1.6) : 0) +
      micro * 1.8 +
      (features ? blockHeight(features, micro, leftW, 1.6) : 0)
    );
  };
  const leftFit = fitColumn(leftCopy, columnH - previewH - type.micro * 1.8, 0.72 / scale);
  const micro = type.micro * leftFit;

  const left = stack(top);
  const previewY = left.take(previewH, micro * 1.8) - previewH / 2;
  const statsY = left.take(stats.length * micro * 3.4, micro * 1.2);
  const linksY = left.take(
    links ? blockHeight(links, micro, leftW, 1.6) : 0,
    micro * 1.8,
  );
  const featuresY = left.y;

  /* The wide column: the write-up, measured and fitted like the bio. A summary
     and up to three labelled blocks, each wrapping to however many lines it
     wraps to.
     What was here before stepped them down by a flat twelfth of the height
     apiece — a step that suited exactly one aspect and one length of sentence,
     and which put the solution paragraph through the tech chips the moment
     either changed. It also tried to carry the features list and the chips in
     the same column, which is a third more copy than a column this shape can
     hold at a size worth reading; both now live under the preview, where there
     is room for them and where they belong anyway. */
  const bodyW = width * 0.54;
  const detailX = width * 0.5 - bodyW / 2 - width * 0.035;

  const blocks: [string, string][] = (
    [
      ["ARCHITECTURE", active.architecture],
      ["CHALLENGE", active.challenge],
      ["SOLUTION", active.solution],
    ] as [string, string | undefined][]
  ).flatMap(([label, copy]) => (copy ? [[label, copy] as [string, string]] : []));

  const writeUp = (s: number) => {
    const caption = type.caption * s;
    const body = type.body * s;
    const lead = type.lead * s;
    return (
      (active.summary ? blockHeight(active.summary, lead, bodyW, 1.5) : 0) +
      lead * STACK_GAP +
      blocks.reduce(
        (total, [, copy]) =>
          total +
          caption * 1.5 +
          blockHeight(copy, body, bodyW) +
          body * STACK_GAP * 1.3,
        0,
      )
    );
  };
  const fit = fitColumn(writeUp, columnH - type.micro * 3.4, 0.75 / scale);
  const caption = type.caption * fit;
  const body = type.body * fit;
  const lead = type.lead * fit;

  const column = stack(top);
  const summaryY = column.take(
    active.summary ? blockHeight(active.summary, lead, bodyW, 1.5) : 0,
    lead * STACK_GAP,
  );
  const blockYs = blocks.map(([, copy]) =>
    column.take(caption * 1.5 + blockHeight(copy, body, bodyW), body * STACK_GAP * 1.3),
  );

  return (
    <group>
      <Header
        title={active.name}
        subtitle="PROJECT DETAIL"
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      {/* The preview: a floating holographic screen inside the screen. Framed
          in its own bezel and standing further forward than anything else in
          the view, because a display inside a display only reads if you can see
          that it is a separate object. */}
      <group position={[leftX, previewY, 0]}>
        <mesh position={[0, 0, L * 4]}>
          <planeGeometry args={[previewW * 1.05, previewH * 1.08]} />
          <meshStandardMaterial
            color={t.deckCap}
            metalness={0.9}
            roughness={0.35}
          />
        </mesh>
        <mesh ref={preview}>
          <planeGeometry args={[previewW, previewH]} />
          <meshStandardMaterial
            color={t.holoScreen}
            emissive={t.holo}
            emissiveIntensity={lit ? 0.35 : 0.1}
            roughness={0.4}
            metalness={0.1}
          />
        </mesh>
        {/* A wireframe of an interface on it — a header bar, a sidebar and a
            content grid. Six planes, and enough for the eye to read "an app". */}
        <mesh position={[0, previewH * 0.36, L * 7]}>
          <planeGeometry args={[previewW * 0.88, previewH * 0.1]} />
          <meshStandardMaterial
            ref={scanline}
            color={t.accent}
            emissive={t.accent}
            emissiveIntensity={lit ? 1.1 : 0.3}
            roughness={0.5}
          />
        </mesh>
        {[0, 1, 2].map((row) =>
          [0, 1, 2].map((col) => (
            <mesh
              key={`${row}${col}`}
              position={[
                previewW * (-0.18 + col * 0.24),
                previewH * (0.12 - row * 0.17),
                L * 7,
              ]}
            >
              <planeGeometry args={[previewW * 0.2, previewH * 0.11]} />
              <meshStandardMaterial
                color={t.holo}
                emissive={t.holo}
                emissiveIntensity={lit ? 0.4 : 0.12}
                roughness={0.6}
                transparent
                opacity={0.75}
              />
            </mesh>
          )),
        )}
        <mesh position={[-previewW * 0.38, -previewH * 0.05, L * 7]}>
          <planeGeometry args={[previewW * 0.12, previewH * 0.58]} />
          <meshStandardMaterial
            color={t.accentAlt}
            emissive={t.accentAlt}
            emissiveIntensity={lit ? 0.45 : 0.12}
            roughness={0.6}
            transparent
            opacity={0.7}
          />
        </mesh>
      </group>

      {/* The write-up, flowed from the header's rule down. */}
      <group position={[detailX - bodyW / 2, 0, 0]}>
        {active.summary && (
          <Text
            position={[0, summaryY, L]}
            fontSize={lead}
            lineHeight={1.5}
            maxWidth={bodyW}
            anchorX="left"
            anchorY="top"
            color={t.panelText}
            fillOpacity={lit ? 0.9 : 0.35}
          >
            {active.summary}
          </Text>
        )}

        {/* Architecture, challenge and solution as one labelled block each. The
            labels are what make this a case study rather than a paragraph. */}
        {blocks.map(([label, copy], i) => (
          <group key={label} position={[0, blockYs[i], 0]}>
            <Text
              position={[0, 0, L]}
              fontSize={caption}
              letterSpacing={0.28}
              anchorX="left"
              anchorY="top"
              color={t.accent}
              fillOpacity={lit ? 0.9 : 0.35}
            >
              {label}
            </Text>
            <Text
              position={[0, -caption * 1.5, L]}
              fontSize={body}
              lineHeight={LINE}
              maxWidth={bodyW}
              anchorX="left"
              anchorY="top"
              color={t.panelMuted}
              fillOpacity={lit ? 0.75 : 0.3}
            >
              {copy}
            </Text>
          </group>
        ))}
      </group>

      {/* The stack, as chips across the foot of the write-up column. They share
          the column out between them rather than stepping at a typed pitch, so
          three of them and six of them both come out even. */}
      <group position={[detailX - bodyW / 2, floorY + type.micro * 1.6, 0]}>
        {(active.tech ?? []).map((name, i, all) => {
          const chip = bodyW / Math.max(4, all.length);
          return (
            <group key={name} position={[chip * (i + 0.5), 0, 0]}>
              <mesh position={[0, 0, L]}>
                <planeGeometry args={[chip * 0.9, type.micro * 2.4]} />
                <meshBasicMaterial
                  color={t.holo}
                  transparent
                  opacity={lit ? 0.12 : 0.05}
                  depthWrite={false}
                />
              </mesh>
              <Text
                position={[0, 0, L * 2]}
                fontSize={type.micro * 0.92}
                lineHeight={1.2}
                maxWidth={chip * 0.82}
                textAlign="center"
                anchorX="center"
                anchorY="middle"
                color={t.panelText}
                fillOpacity={lit ? 0.85 : 0.35}
              >
                {name}
              </Text>
            </group>
          );
        })}
      </group>

      {/* And under the preview: what the work measures, where to find it, and
          what is in it. The same instrument the rest of the machine reads
          everything else with, flowed down the narrow column. */}
      <group position={[leftX, 0, 0]}>
        {stats.map((stat, i) => (
          <Meter
            key={stat.label}
            x={0}
            y={statsY - (i + 0.5) * micro * 3.4}
            w={leftW}
            label={stat.label}
            level={Number(stat.value.replace(/[^0-9]/g, "")) || 100}
            size={micro}
            theme={t}
            lit={lit}
            charge={charge}
          />
        ))}
        {links && (
          <Text
            position={[-leftW / 2, linksY, L]}
            fontSize={micro}
            lineHeight={1.6}
            letterSpacing={0.06}
            maxWidth={leftW}
            anchorX="left"
            anchorY="top"
            color={t.accent}
            fillOpacity={lit ? 0.8 : 0.3}
          >
            {links}
          </Text>
        )}
        {features && (
          <Text
            position={[-leftW / 2, featuresY, L]}
            fontSize={micro}
            lineHeight={1.6}
            maxWidth={leftW}
            anchorX="left"
            anchorY="top"
            color={t.panelMuted}
            fillOpacity={lit ? 0.7 : 0.3}
          >
            {features}
          </Text>
        )}
      </group>

      {strip && (
        <ProjectStrip
          y={floorY - height * 0.015}
          width={width}
          height={height}
          type={type}
          tabH={tabH}
          projects={projects}
          active={Math.min(project, projects.length - 1)}
          onProject={onProject}
          theme={t}
          lit={lit}
        />
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * DEV ACTIVITY, and the stats panel
 * ------------------------------------------------------------------ */

/** The two smallest panels share a view, because what they are both a summary
 *  of is the same thing: the shape of the work over time. */
function ActivityView({
  width,
  height,
  profile,
  theme: t,
  lit,
  scale,
  charge,
}: ViewProps & { charge: React.RefObject<number> }) {
  const bars = useRef<Mesh[]>([]);
  const type = typeFor(height, scale);
  const top = headerLayout(height, type, true).bodyTop;
  const stats = profile.stats ?? [];

  const figuresY = top - type.display * 0.85;
  const chartTop = figuresY - type.display * 0.45 - type.micro * 3.5;
  const base = -height * 0.5 + height * 0.08;

  const layout = useMemo(() => {
    /* One bar per column of the space there is, not forty regardless. Forty
       bars in a box a third of the width they were drawn for is a solid block
       of light — the gaps between them are the data. */
    const span = width * 0.88;
    const count = Math.max(16, Math.min(40, Math.round(span / (height * 0.028))));
    const step = span / count;
    return {
      count,
      w: step * 0.6,
      max: chartTop - base,
      base,
      x: Array.from({ length: count }, (_, i) => -span / 2 + (i + 0.5) * step),
      rate: Array.from({ length: count }, (_, i) => 0.55 + (i % 11) * 0.13),
      phase: Array.from({ length: count }, (_, i) => i * 0.63),
    };
  }, [width, height, chartTop, base]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    for (let i = 0; i < bars.current.length; i++) {
      const bar = bars.current[i];
      if (!bar) continue;
      const level =
        (charge.current ?? 1) *
        (0.12 + 0.88 * (0.5 + 0.5 * Math.sin(time * layout.rate[i] + layout.phase[i])));
      bar.scale.y = Math.max(0.001, level);
      bar.position.y = layout.base + (layout.max * level) / 2;
    }
  });

  return (
    <group>
      <Header
        title="DEV ACTIVITY"
        subtitle="THROUGHPUT · COMMIT DENSITY"
        width={width}
        height={height}
        type={type}
        theme={t}
        lit={lit}
      />

      {stats.map((stat, i) => (
        <Figure
          key={stat.label}
          x={(i - (stats.length - 1) / 2) * ((width * 0.72) / Math.max(1, stats.length))}
          y={figuresY}
          value={stat.value}
          label={stat.label}
          size={type.display * 0.9}
          labelSize={type.micro}
          maxWidth={((width * 0.72) / Math.max(1, stats.length)) * 0.9}
          theme={t}
          lit={lit}
          tint={i % 2 === 0 ? t.accent : t.accentAlt}
        />
      ))}

      {/* The baseline the bars stand on. */}
      <mesh position={[0, layout.base, L]}>
        <planeGeometry args={[width * 0.88, height * 0.0014]} />
        <meshStandardMaterial
          color={t.accentAlt}
          emissive={t.accentAlt}
          emissiveIntensity={lit ? 0.7 : 0.2}
          roughness={0.5}
        />
      </mesh>
      {layout.x.map((x, i) => (
        <mesh
          key={x}
          ref={(mesh) => {
            if (mesh) bars.current[i] = mesh;
          }}
          position={[x, layout.base, L * 2]}
        >
          <planeGeometry args={[layout.w, layout.max]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? t.accentAlt : t.accent}
            emissive={i % 3 === 0 ? t.accentAlt : t.accent}
            emissiveIntensity={lit ? 1.2 : 0.3}
            roughness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * The switch
 * ------------------------------------------------------------------ */

/**
 * The opened panel, whichever it was.
 *
 * `charge` is the caller's transition clock, handed down rather than each view
 * keeping its own: meters and bars have to come up as the environment
 * materialises around them, and a view that started its own animation on mount
 * would fill before the door had finished opening.
 */
export function DetailView({
  section,
  charge,
  ...props
}: ViewProps & { section: SectionId; charge: React.RefObject<number> }) {
  switch (section) {
    case "about":
      return <AboutView {...props} charge={charge} />;
    case "tech":
      return <TechView {...props} />;
    case "skills":
      return <SkillsView {...props} charge={charge} />;
    case "achievements":
      return <AchievementsView {...props} />;
    case "focus":
      return <FocusView {...props} />;
    case "projects":
    case "project":
      return <ProjectView {...props} charge={charge} />;
    case "stats":
    case "activity":
      return <ActivityView {...props} charge={charge} />;
    default:
      return null;
  }
}
