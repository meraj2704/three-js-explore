"use client";

import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";

/**
 * Where the driver is looking, as offsets from the camera's default seat.
 *
 * Radians, and in the CAR's frame rather than the world's — so a look holds its
 * angle relative to the car through a corner instead of sliding off the thing
 * you turned to see.
 */
export type CameraLook = {
  /** Around the car. Positive swings the seat toward the car's left, which is
   *  what makes the VIEW turn right — the same handedness as OrbitControls. */
  yaw: number;
  /** Above/below the default seat. Positive lifts the camera and looks down. */
  pitch: number;
  /** True while a drag is in progress. Read by the camera to follow the hand
   *  tightly instead of trailing it. */
  dragging: boolean;
};

/** What the hook hands back: the live angles to read, and the one way to change
 *  them from outside. The angles are deliberately NOT for the caller to write —
 *  the accumulator has a wrap and a clamp on it that only this file applies. */
export type CameraLookControl = {
  angles: RefObject<CameraLook>;
  /** Ease the look back toward the default seat, by `alpha` of what is left.
   *  A no-op while the driver is dragging: a view being actively held is not a
   *  view that has been abandoned. */
  recenter: (alpha: number) => void;
};

/** Radians per pixel dragged. Sized so a drag across a laptop screen is a bit
 *  over a half turn: far enough to swing from the road ahead to the wall behind
 *  without lifting the mouse, slow enough to hold one picture in frame. */
const YAW_PER_PIXEL = 0.005;
const PITCH_PER_PIXEL = 0.004;

/** How far the pitch may be dragged off the default seat. The seat already sits
 *  above the car — around 0.45 rad up from level in both the road and hall
 *  offsets — so this range spans roughly level-with-the-roof to steeply
 *  overhead. Clamped HERE, on the accumulator, not just where it is used:
 *  letting it run to -50 and then clamping on read would mean fifty radians of
 *  dragging back before the camera moved again. */
const MIN_PITCH_OFFSET = -0.4;
const MAX_PITCH_OFFSET = 0.8;

const TWO_PI = Math.PI * 2;

/** Fold an angle back into (-PI, PI]. Three spins of the mouse should leave the
 *  camera where one did — and, more importantly, leave the recentring below
 *  with a fraction of a turn to unwind rather than three of them. */
const wrapAngle = (angle: number) =>
  ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;

/**
 * Drag the canvas to look around.
 *
 * Like <useDrivingControls>, the angles live in a ref and never in state: the
 * camera reads them 60x/second, and re-rendering the scene graph on every mouse
 * move would cost a great deal to show exactly the same objects.
 *
 * Pointer events, not mouse events, so a finger drag on a phone works for free.
 * The pointer is captured on the way down, which is what keeps a fast drag from
 * being lost the moment it leaves the canvas.
 *
 * Two things this hook deliberately does NOT do, because they are the canvas's
 * dress rather than its behaviour, and are set as classes in <Scene> instead:
 * the grab cursor that advertises the control, and the `touch-action: none`
 * without which a finger drag scrolls the page rather than reaching this at all.
 */
export function useCameraLook(): CameraLookControl {
  const look = useRef<CameraLook>({ yaw: 0, pitch: 0, dragging: false });

  // The canvas element itself, so the listeners land on the drawing surface
  // rather than the window — a drag on the page's UI is not a look.
  const canvas = useThree((state) => state.gl.domElement);

  useEffect(() => {
    let pointerId: number | null = null;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      // One finger only. A second touch would otherwise fight the first for the
      // same accumulator and the view would judder between them.
      if (!event.isPrimary) return;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      look.current.dragging = true;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;

      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;

      // Deltas, not absolute positions: the look is relative to wherever it
      // already was, so it survives being released and picked up again.
      look.current.yaw = wrapAngle(look.current.yaw - dx * YAW_PER_PIXEL);
      look.current.pitch = Math.min(
        MAX_PITCH_OFFSET,
        Math.max(MIN_PITCH_OFFSET, look.current.pitch + dy * PITCH_PER_PIXEL),
      );
    };

    const endDrag = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      look.current.dragging = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    // A cancelled pointer (a browser gesture stealing it, a lost capture) never
    // sends pointerup, and without this the drag would stay latched forever.
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("lostpointercapture", endDrag);
    };
  }, [canvas]);

  // The angles are only ever written in this file — which is what keeps the wrap
  // and the clamp above from being some other component's job to remember.
  const recenter = useCallback((alpha: number) => {
    const angles = look.current;
    if (angles.dragging) return;
    angles.yaw -= angles.yaw * alpha;
    angles.pitch -= angles.pitch * alpha;
  }, []);

  return useMemo(() => ({ angles: look, recenter }), [recenter]);
}
