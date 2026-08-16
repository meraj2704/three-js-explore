"use client";

/**
 * What the portfolio monitor is made of, below the level of "a monitor".
 *
 * Two things live here and they are here for the same reason: BOTH the overview
 * interface and the full-screen detail views need them, and neither of those two
 * files should own something the other imports.
 *
 * 1. The CONTENT TYPES. What a portfolio is, as data — no geometry, no layout,
 *    no colour. A view decides how a skill looks; this decides what a skill is.
 *
 * 2. The PAINT. Every canvas texture the display is built from. The rule the
 *    machine is designed around is that fine, static detail is PAINTED rather
 *    than built: twenty-three grid lines, edge circuitry, a hundred micro data
 *    points, tick rings, panel borders, chip frames and achievement glyphs are
 *    one draw call each because they are drawn into a canvas at mount. Built as
 *    meshes they would be several hundred objects, and this hall renders TWICE a
 *    frame — the floor is a real planar mirror. A texture is free by comparison
 *    and can hold detail no reasonable number of planes could.
 *
 * Nothing in this file knows what a monitor is. It draws rectangles and returns
 * textures.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

/* ------------------------------------------------------------------ *
 * What the monitor is showing
 * ------------------------------------------------------------------ *
 * Content, not layout. Every field is optional except the name because a
 * showroom gets built before it gets filled, and a monitor with a name and
 * nothing else should still light up rather than throw.
 */

export type MonitorStat = { value: string; label: string };
export type MonitorSkill = { label: string; level: number };
export type MonitorIcon = "project" | "client" | "tech" | "award";
export type MonitorAchievement = {
  value: string;
  label: string;
  icon: MonitorIcon;
};

/** One piece of work, as the full-screen PROJECT DETAIL view needs it. Every
 *  field but the name is optional and each simply doesn't render when missing —
 *  a wall hung before the work is finished should show the work it has. */
export type MonitorProject = {
  name: string;
  summary?: string;
  tech?: string[];
  architecture?: string;
  features?: string[];
  challenge?: string;
  solution?: string;
  /** Shown as text, not as a link: there is no browser inside a museum. */
  demo?: string;
  repo?: string;
  stats?: MonitorStat[];
};

export type MonitorProfile = {
  name: string;
  role?: string;
  /** Path under public/, loaded as a texture and matted into the chamber. */
  portrait?: string;
  /** Width : height of the SOURCE file, so a non-square photo is cropped to the
   *  chamber's circle instead of being squashed into it. */
  portraitAspect?: number;
  about?: string;
  /** Next to the green indicator. Present tense — it is a status, not a slogan. */
  availability?: string;
  stats?: MonitorStat[];
  tech?: string[];
  skills?: MonitorSkill[];
  achievements?: MonitorAchievement[];
  focus?: { text: string; progress: number };
  /** The atmospheric readouts scattered into the corners. Kept faint on purpose;
   *  these are texture, not information. */
  telemetry?: string[];

  /* ---------------------------------------------------------------- *
   * Everything below is read ONLY by the full-screen detail views.
   * ---------------------------------------------------------------- *
   * The overview is a summary and stays one; these are what a summary is a
   * summary OF, and they are separate fields rather than longer versions of the
   * existing ones so that opening a panel can show something genuinely new
   * instead of the same eight words at twice the size.
   */
  /** The career, for ABOUT ME's timeline. */
  timeline?: { year: string; label: string }[];
  /** How they work, as opposed to what they know. */
  philosophy?: string;
  /** The stack, grouped, for the TECH STACK graph. Falls back to one ring of
   *  everything in `tech` when absent. */
  techGroups?: { label: string; items: string[] }[];
  /** Milestones for the ACHIEVEMENTS timeline. */
  milestones?: { year: string; label: string }[];
  /** What is being learned right now, for CURRENT FOCUS. */
  learning?: string[];
  projects?: MonitorProject[];
};
/* ------------------------------------------------------------------ *
 * Painting
 * ------------------------------------------------------------------ *
 * Canvas helpers. All of these run once, at mount, and hand back a texture.
 */

/** Canvas pixels per world metre for the panel textures. At 150 a 2px border is
 *  13mm of glowing edge — thin enough to read as an etched line at the distance
 *  the hall is actually driven, and oversampled about four times against the
 *  pixels this ever occupies on screen. */
export const PANEL_PX = 150;

type Ctx = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };

/** Guarded because these are called from useMemo, which runs during render — and
 *  render can happen on the server, where there is no document. R3F does not
 *  mount its children server-side, so this branch should never be taken; it
 *  costs one line to be sure. */
export function surface(w: number, h: number): Ctx | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

export function finish(canvas: HTMLCanvasElement, srgb = true): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  // Authored as colours, so they have to be tagged as such or three reads the
  // bytes as linear and everything comes out washed out and pale — the same trap
  // <FittedPicture> documents for loaded images.
  if (srgb) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/** "#rrggbb" + alpha → a canvas fill string. */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Deterministic noise. Random detail that RESHUFFLES on a re-render is worse
 *  than no detail at all — the wall would twitch every time React decided to
 *  rebuild anything above it. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A chamfered rectangle as a canvas path, in pixels. The same silhouette the
 *  extruded housing uses, so the painted panes and the machined metal share one
 *  corner language. */
export function chamferPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cut: number,
) {
  const c = Math.min(cut, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

/* ------------------------------------------------------------------ *
 * The screen substrate: grid, circuitry, and the dust of a working display
 * ------------------------------------------------------------------ */

/** Deliberately at the brief's own counts. More than this and the grid starts
 *  reading as graph paper; fewer and it reads as a window frame. */
const GRID_COLUMNS = 23;
const GRID_ROWS = 14;


/**
 * Everything on the display that never moves and is too small to build.
 *
 * Drawn on transparent black and used ADDITIVELY, which is why the background
 * colour is absent here: the substrate plane behind supplies the deep navy, and
 * anything painted black in this texture simply contributes nothing. That is
 * also what keeps the grid from ever occluding the panes stacked in front of it.
 */
export function makeScreenTexture(accent: string, alt: string): CanvasTexture | null {
  const s = surface(2048, 1024);
  if (!s) return null;
  const { canvas, ctx } = s;
  const W = canvas.width;
  const H = canvas.height;
  const rand = seeded(0x5eed);

  // The grid. Every fifth line a shade stronger, which is the difference between
  // a mesh and a measured one.
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_COLUMNS; i++) {
    const x = Math.round((i * W) / GRID_COLUMNS) + 0.5;
    ctx.strokeStyle = rgba(accent, i % 5 === 0 ? 0.1 : 0.045);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let i = 1; i < GRID_ROWS; i++) {
    const y = Math.round((i * H) / GRID_ROWS) + 0.5;
    ctx.strokeStyle = rgba(accent, i % 4 === 0 ? 0.1 : 0.045);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // Circuit traces, hugging the four edges and walking inward in right angles
  // the way a board is actually routed. Held inside a fifth of the panel so the
  // middle — where the interface lives — stays clean.
  const bandX = W * 0.2;
  const bandY = H * 0.22;
  ctx.lineCap = "square";
  for (let i = 0; i < 34; i++) {
    const edge = i % 4;
    let x = edge === 0 ? rand() * W : edge === 1 ? W - 2 : edge === 2 ? rand() * W : 2;
    let y = edge === 0 ? 2 : edge === 1 ? rand() * H : edge === 2 ? H - 2 : rand() * H;
    let horizontal = edge === 1 || edge === 3;

    ctx.strokeStyle = rgba(i % 7 === 0 ? alt : accent, 0.16);
    ctx.lineWidth = i % 7 === 0 ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);

    const legs = 2 + Math.floor(rand() * 3);
    for (let leg = 0; leg < legs; leg++) {
      const reach = 30 + rand() * (horizontal ? bandX : bandY) * 0.7;
      if (horizontal) x += x < W / 2 ? reach : -reach;
      else y += y < H / 2 ? reach : -reach;
      // Clamped into the edge band; a trace that wandered into the middle would
      // be a stripe across the interface rather than a detail behind it.
      x = Math.min(Math.max(x, 4), W - 4);
      y = Math.min(Math.max(y, 4), H - 4);
      if (x > bandX && x < W - bandX && y > bandY && y < H - bandY) break;
      ctx.lineTo(x, y);
      horizontal = !horizontal;
    }
    ctx.stroke();

    // The node the trace terminates in: a filled core with a ring around it.
    ctx.fillStyle = rgba(accent, 0.5);
    ctx.beginPath();
    ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Micro data points — the dust that makes a surface look like it is doing
  // something. Individually invisible; collectively the difference between a
  // rendered plane and a live one.
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * H;
    ctx.fillStyle = rgba(rand() > 0.85 ? alt : accent, 0.06 + rand() * 0.2);
    ctx.fillRect(x, y, 1 + Math.round(rand()), 1);
  }

  // Technical coordinates. Barely legible by design — at the distance this is
  // read from they are texture, and anyone close enough to resolve them finds
  // real numbers rather than lorem squiggle.
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = rgba(accent, 0.22);
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = rand() * H;
    if (x > bandX && x < W - bandX && y > bandY && y < H - bandY) continue;
    const tag = [
      `X:${(rand() * 9999).toFixed(2)}`,
      `Y:${(rand() * 9999).toFixed(2)}`,
      `SEC-${Math.floor(rand() * 99)
        .toString()
        .padStart(2, "0")}`,
      `0x${Math.floor(rand() * 65535)
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}`,
      `NODE.${Math.floor(rand() * 999)}`,
    ][i % 5];
    ctx.fillText(tag, x, y);
  }

  // Registration marks in the corners: the bracket a real instrument puts at the
  // limits of its usable area.
  ctx.strokeStyle = rgba(accent, 0.3);
  ctx.lineWidth = 2;
  const m = 26;
  const arm = 40;
  for (const [cx, cy, sx, sy] of [
    [m, m, 1, 1],
    [W - m, m, -1, 1],
    [m, H - m, 1, -1],
    [W - m, H - m, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * arm);
    ctx.stroke();
  }

  // Scan lines over everything. Two pixels in four, at 2% — invisible as lines,
  // visible as the faint horizontal texture of a display that has a raster.
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  return finish(canvas);
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

export type PanelCell = { x: number; y: number; w: number; h: number; icon?: MonitorIcon | "code" };

export type PanelDecor = {
  tint: string;
  glow: string;
  /** A rule under the module's title, at this height down from the top. */
  header?: number;
  /** Sub-frames inside the pane — stat cells, tech chips, achievement tiles.
   *  Painted rather than built: they are static, and thirty extra planes for
   *  thirty static rectangles is how a scene dies by a thousand draw calls. */
  cells?: PanelCell[];
  /** Empty meter rails, for the diagnostics panel. The FILLS are meshes — those
   *  move — but the tracks they run in never do. */
  tracks?: { x: number; y: number; w: number; h: number }[];
  /** A faint technical grid, for the activity strip's backdrop. */
  grid?: { cols: number; rows: number; x: number; y: number; w: number; h: number };
};

/**
 * One glassmorphic module, as a single textured plane.
 *
 * The alternative is a fill plane plus four edge bars plus a bracket at each
 * corner, times seven modules — around eighty objects for something that never
 * changes. Painted, each module is one, and the canvas can do things geometry
 * cannot: a real blurred halo around the border (shadowBlur), a gradient in the
 * glass so the pane reads as a sheet catching light from above, and hairline
 * corner brackets that would be sub-millimetre planes.
 *
 * Normal blending, not additive — this is GLASS. It has to tint and lift what is
 * behind it, and additive can only ever add, which makes every pane a lamp.
 */
export function makePanelTexture(w: number, h: number, o: PanelDecor): CanvasTexture | null {
  const s = surface(w * PANEL_PX, h * PANEL_PX);
  if (!s) return null;
  const { canvas, ctx } = s;
  const W = canvas.width;
  const H = canvas.height;
  // World (origin centre, y up) → canvas (origin top-left, y down).
  const X = (x: number) => (x + w / 2) * PANEL_PX;
  const Y = (y: number) => (h / 2 - y) * PANEL_PX;
  const cut = 0.13 * PANEL_PX;

  // The glass itself: brighter at the top, because every pane in the room is
  // lit from the ceiling coves and a flat fill is the giveaway that it is not.
  const fill = ctx.createLinearGradient(0, 0, 0, H);
  fill.addColorStop(0, rgba(o.tint, 0.075));
  fill.addColorStop(0.55, rgba(o.tint, 0.032));
  fill.addColorStop(1, rgba(o.tint, 0.012));
  ctx.fillStyle = fill;
  chamferPath(ctx, 1, 1, W - 2, H - 2, cut);
  ctx.fill();

  // Its edge, with a real halo around it. The halo is the whole reason this is
  // painted: a mesh border is a hard line, and a hard line on a dark screen
  // reads as a sticker rather than as something emitting.
  ctx.shadowColor = rgba(o.glow, 0.9);
  ctx.shadowBlur = 12;
  ctx.strokeStyle = rgba(o.glow, 0.5);
  ctx.lineWidth = 2;
  chamferPath(ctx, 1.5, 1.5, W - 3, H - 3, cut);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Corner brackets, heavier than the border they sit on — the detail that says
  // an interface was ENGINEERED rather than styled.
  ctx.strokeStyle = rgba(o.glow, 0.95);
  ctx.lineWidth = 3;
  const arm = 22;
  for (const [cx, cy, sy] of [
    [4, cut + 4, 1],
    [W - 4, cut + 4, 1],
    [4, H - cut - 4, -1],
    [W - 4, H - cut - 4, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx, cy + sy * arm);
    ctx.stroke();
  }

  if (o.header !== undefined) {
    const y = Y(h / 2 - o.header);
    const rule = ctx.createLinearGradient(0, 0, W, 0);
    rule.addColorStop(0, rgba(o.glow, 0.55));
    rule.addColorStop(0.45, rgba(o.glow, 0.12));
    rule.addColorStop(1, rgba(o.glow, 0));
    ctx.fillStyle = rule;
    ctx.fillRect(14, y, W - 28, 1.5);
    // The tick that starts the rule — a title bar with a terminal on it.
    ctx.fillStyle = rgba(o.glow, 0.9);
    ctx.fillRect(14, y - 5, 3, 12);
  }

  for (const cell of o.cells ?? []) {
    const cw = cell.w * PANEL_PX;
    const ch = cell.h * PANEL_PX;
    const cx = X(cell.x) - cw / 2;
    const cy = Y(cell.y) - ch / 2;
    ctx.fillStyle = rgba(o.tint, 0.07);
    chamferPath(ctx, cx, cy, cw, ch, 8);
    ctx.fill();
    ctx.strokeStyle = rgba(o.glow, 0.3);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    if (cell.icon) drawIcon(ctx, cell.icon, cx + cw / 2, cy + ch * 0.3, ch * 0.22, o.glow);
  }

  for (const track of o.tracks ?? []) {
    const tw = track.w * PANEL_PX;
    const th = track.h * PANEL_PX;
    const tx = X(track.x);
    const ty = Y(track.y) - th / 2;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = rgba(o.glow, 0.22);
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);
    // Ten graduations down the rail, so a meter reads AGAINST a scale rather
    // than floating in a box.
    ctx.fillStyle = rgba(o.glow, 0.16);
    for (let i = 1; i < 10; i++) ctx.fillRect(tx + (i * tw) / 10, ty, 1, th);
  }

  if (o.grid) {
    const gx = X(o.grid.x - o.grid.w / 2);
    const gy = Y(o.grid.y + o.grid.h / 2);
    const gw = o.grid.w * PANEL_PX;
    const gh = o.grid.h * PANEL_PX;
    ctx.strokeStyle = rgba(o.glow, 0.12);
    ctx.lineWidth = 1;
    for (let i = 0; i <= o.grid.cols; i++) {
      const x = gx + (i * gw) / o.grid.cols;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x, gy + gh);
      ctx.stroke();
    }
    for (let i = 0; i <= o.grid.rows; i++) {
      const y = gy + (i * gh) / o.grid.rows;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + gw, y);
      ctx.stroke();
    }
    // The baseline the bars stand on, brighter than the grid behind it.
    ctx.fillStyle = rgba(o.glow, 0.5);
    ctx.fillRect(gx, gy + gh - 1, gw, 1.5);
  }

  return finish(canvas);
}

/**
 * The pictograms.
 *
 * Drawn as paths rather than typed as characters: the default SDF font is not
 * guaranteed to carry ▣ or ⬢ or ★, and a missing glyph is an empty box on the
 * centrepiece of the room. Four shapes, stripped to the fewest strokes that
 * still say project / person / technology / award.
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  kind: MonitorIcon | "code",
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = rgba(color, 0.85);
  ctx.fillStyle = rgba(color, 0.85);
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.lineJoin = "round";
  ctx.shadowColor = rgba(color, 0.8);
  ctx.shadowBlur = r * 0.5;

  if (kind === "project") {
    // Two offset plates: a stack of work.
    ctx.strokeRect(cx - r, cy - r * 0.75, r * 1.5, r * 1.2);
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(cx - r * 0.5, cy - r * 0.2, r * 1.5, r * 1.2);
  } else if (kind === "client") {
    // Head and shoulders.
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.35, r * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.95, r * 0.85, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (kind === "tech") {
    // A hexagon — the universal mark for a component.
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (kind === "award") {
    // Cup, stem, base.
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.6, cy - r * 0.7);
    ctx.lineTo(cx + r * 0.6, cy - r * 0.7);
    ctx.lineTo(cx + r * 0.42, cy + r * 0.15);
    ctx.lineTo(cx - r * 0.42, cy + r * 0.15);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.15);
    ctx.lineTo(cx, cy + r * 0.6);
    ctx.moveTo(cx - r * 0.5, cy + r * 0.6);
    ctx.lineTo(cx + r * 0.5, cy + r * 0.6);
    ctx.stroke();
  } else {
    // </> — the only glyph here that is genuinely typographic.
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.3, cy - r * 0.7);
    ctx.lineTo(cx - r, cy);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.7);
    ctx.moveTo(cx + r * 0.3, cy - r * 0.7);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * The chamber's instrument face
 * ------------------------------------------------------------------ */

/**
 * The technical dial behind and around the portrait: tick rings, dashed orbits,
 * bearing numerals, brackets.
 *
 * One texture used on two counter-rotating quads at different scales, which is
 * how a handful of pixels becomes a machined instrument. Built as geometry this
 * would be several hundred tick meshes; here it is two.
 */
export function makeDialTexture(accent: string, alt: string): CanvasTexture | null {
  const s = surface(1024, 1024);
  if (!s) return null;
  const { canvas, ctx } = s;
  const C = 512;

  // 120 ticks, every tenth long. A dial's resolution is what makes it read as
  // an instrument rather than as decoration.
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const major = i % 10 === 0;
    const r0 = major ? 400 : 424;
    const r1 = 440;
    ctx.strokeStyle = rgba(major ? accent : accent, major ? 0.7 : 0.25);
    ctx.lineWidth = major ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0);
    ctx.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1);
    ctx.stroke();
  }

  // Bearing numerals every 45°.
  ctx.font = "600 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = rgba(accent, 0.5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.fillText(
      `${i * 45}`.padStart(3, "0"),
      C + Math.cos(a) * 370,
      C + Math.sin(a) * 370,
    );
  }

  // Dashed orbits at two radii, and one solid hairline between them.
  ctx.setLineDash([14, 22]);
  ctx.strokeStyle = rgba(alt, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(C, C, 330, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([4, 10]);
  ctx.strokeStyle = rgba(accent, 0.3);
  ctx.beginPath();
  ctx.arc(C, C, 286, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Four corner brackets on the diagonals — the "acquired target" language every
  // spacecraft HUD ever drawn is built from.
  ctx.strokeStyle = rgba(accent, 0.75);
  ctx.lineWidth = 3.5;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
    ctx.save();
    ctx.translate(C + Math.cos(a) * 466, C + Math.sin(a) * 466);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-26, -10);
    ctx.lineTo(-26, 10);
    ctx.lineTo(26, 10);
    ctx.lineTo(26, -10);
    ctx.stroke();
    ctx.restore();
  }

  return finish(canvas);
}

/**
 * The portrait's lighting, as a texture laid over the face.
 *
 * Cyan down one edge, magenta down the other, a soft neutral key from above —
 * the three-light rig every cinematic portrait since about 2015 has used, and
 * the thing that makes a flat 200px headshot sit INSIDE a holographic chamber
 * rather than on top of it.
 *
 * Per pixel rather than by compositing gradients because the rim has to be a
 * band that follows the circle, and canvas has no primitive for that. 512² is
 * a quarter of a million iterations, once, at mount.
 */
export function makeRimTexture(accent: string, alt: string): CanvasTexture | null {
  const s = surface(512, 512);
  if (!s) return null;
  const { canvas, ctx } = s;
  const N = canvas.width;
  const image = ctx.createImageData(N, N);
  const data = image.data;

  const cool = [
    parseInt(accent.slice(1, 3), 16),
    parseInt(accent.slice(3, 5), 16),
    parseInt(accent.slice(5, 7), 16),
  ];
  const warm = [
    parseInt(alt.slice(1, 3), 16),
    parseInt(alt.slice(3, 5), 16),
    parseInt(alt.slice(5, 7), 16),
  ];

  for (let y = 0; y < N; y++) {
    const ny = 1 - (2 * (y + 0.5)) / N;
    for (let x = 0; x < N; x++) {
      const nx = (2 * (x + 0.5)) / N - 1;
      const r = Math.hypot(nx, ny);
      const i = (y * N + x) * 4;
      data[i + 3] = 255;
      if (r > 1) continue;

      // A band hugging the edge, faded out again right at the rim so the light
      // stops on the silhouette instead of spilling off it.
      const band =
        Math.max(0, Math.min(1, (r - 0.58) / 0.34)) ** 2 *
        Math.max(0, Math.min(1, (0.99 - r) / 0.07));
      const left = Math.max(0, -nx) ** 1.4;
      const right = Math.max(0, nx) ** 1.4;
      const key = Math.max(0, ny) ** 2 * (1 - r * 0.55) * 0.14;

      const cyan = band * left * 0.95;
      const purple = band * right * 0.8;
      data[i] = Math.min(255, cool[0] * cyan + warm[0] * purple + 255 * key);
      data[i + 1] = Math.min(255, cool[1] * cyan + warm[1] * purple + 255 * key);
      data[i + 2] = Math.min(255, cool[2] * cyan + warm[2] * purple + 255 * key);
    }
  }

  ctx.putImageData(image, 0, 0);
  return finish(canvas);
}

/** A soft round falloff, tinted per use. This is the file's stand-in for bloom:
 *  there is no post-processing pass in this app, so every halo in the room is a
 *  quad of this held behind something bright. */
export function makeGlowTexture(): CanvasTexture | null {
  const s = surface(256, 256);
  if (!s) return null;
  const { canvas, ctx } = s;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.32)");
  g.addColorStop(0.7, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return finish(canvas);
}

/** Brushed metal, as a roughness map. Horizontal streaks from a random walk per
 *  row: a metal that is uniformly rough is plastic, and the one thing that reads
 *  as MACHINED is a highlight that smears along the grain. */
export function makeBrushedTexture(): CanvasTexture | null {
  const s = surface(512, 512);
  if (!s) return null;
  const { canvas, ctx } = s;
  const image = ctx.createImageData(512, 512);
  const rand = seeded(0xb00c);
  for (let y = 0; y < 512; y++) {
    let v = 0.5;
    for (let x = 0; x < 512; x++) {
      v += (rand() - 0.5) * 0.12;
      v = Math.min(0.85, Math.max(0.35, v * 0.94 + 0.5 * 0.06));
      const i = (y * 512 + x) * 4;
      const c = Math.round(v * 255);
      image.data[i] = c;
      image.data[i + 1] = c;
      image.data[i + 2] = c;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  // Not a colour — it is data three multiplies into a roughness value, so it
  // must NOT be tagged sRGB or every reading comes back wrong.
  const texture = finish(canvas, false);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(6, 3);
  return texture;
}

/** Cover glass: the diagonal streaks a sheet of glass in front of a dark screen
 *  always shows, plus a corner sheen. Additive and very faint — this is the
 *  layer that tells you there IS glass, and the moment you can read it as a
 *  texture it becomes a dirty window. */
export function makeGlassTexture(): CanvasTexture | null {
  const s = surface(1024, 512);
  if (!s) return null;
  const { canvas, ctx } = s;
  ctx.save();
  ctx.translate(512, 256);
  ctx.rotate(-0.34);
  for (const [offset, width, alpha] of [
    [-420, 90, 0.05],
    [-250, 26, 0.075],
    [190, 150, 0.032],
    [300, 40, 0.05],
  ]) {
    const g = ctx.createLinearGradient(offset - width, 0, offset + width, 0);
    g.addColorStop(0, "rgba(150,205,255,0)");
    g.addColorStop(0.5, `rgba(190,225,255,${alpha})`);
    g.addColorStop(1, "rgba(150,205,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(offset - width, -700, width * 2, 1400);
  }
  ctx.restore();
  // A brighter smear in the top-left, where a ceiling cove would land on it.
  const corner = ctx.createRadialGradient(180, 60, 0, 180, 60, 420);
  corner.addColorStop(0, "rgba(190,230,255,0.075)");
  corner.addColorStop(1, "rgba(190,230,255,0)");
  ctx.fillStyle = corner;
  ctx.fillRect(0, 0, 1024, 512);
  return finish(canvas);
}

/** The dark that gathers in the corners of a recessed screen. Normal blending,
 *  because it is the one layer here whose job is to SUBTRACT — and it is what
 *  makes the aperture read as a well rather than as a hole. */
export function makeVignetteTexture(): CanvasTexture | null {
  const s = surface(512, 256);
  if (!s) return null;
  const { canvas, ctx } = s;
  const g = ctx.createRadialGradient(256, 128, 60, 256, 128, 300);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.65, "rgba(0,0,0,0.18)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  return finish(canvas);
}
