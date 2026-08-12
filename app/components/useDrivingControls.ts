"use client";

import { useEffect, useRef } from "react";

/** Which physical keys drive the car, mapped to an intent. Using event.code
 *  rather than event.key means the layout is keyboard-independent. */
const KEY_BINDINGS: Record<string, "forward" | "back" | "left" | "right"> = {
  ArrowUp: "forward",
  KeyW: "forward",
  ArrowDown: "back",
  KeyS: "back",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

export type Controls = Record<
  "forward" | "back" | "left" | "right",
  boolean
>;

const IDLE: Controls = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

/**
 * Tracks which driving keys are held down.
 *
 * The flags live in a ref, not state: useFrame reads them 60x/second, and
 * storing them in state would re-render the whole component on every keypress
 * for no visual benefit.
 */
export function useDrivingControls() {
  const controls = useRef<Controls>({ ...IDLE });

  useEffect(() => {
    const setKey = (event: KeyboardEvent, pressed: boolean) => {
      const intent = KEY_BINDINGS[event.code];
      if (!intent) return;
      // Stop the arrow keys from scrolling the page while driving.
      event.preventDefault();
      controls.current[intent] = pressed;
    };

    const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => setKey(event, false);

    // If the tab loses focus mid-press the keyup never arrives, so the car
    // would drive off on its own. Clear everything when that happens.
    const onBlur = () => {
      controls.current = { ...IDLE };
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return controls;
}
