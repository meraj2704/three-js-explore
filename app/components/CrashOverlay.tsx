type CrashOverlayProps = {
  /** Called when the player asks to be put back on the road. */
  onReset: () => void;
};

/**
 * Shown when the car leaves the asphalt.
 *
 * Plain HTML layered over the canvas, not a 3D object, so it stays
 * screen-aligned and crisp regardless of where the camera ends up. The wrapper
 * ignores pointer events so it can't swallow clicks meant for the scene; only
 * the button opts back in.
 */
export function CrashOverlay({ onReset }: CrashOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
      <p className="text-4xl font-semibold tracking-tight text-red-500">
        Crashed
      </p>
      <p className="text-sm text-zinc-400">You left the road.</p>
      <button
        type="button"
        onClick={onReset}
        className="pointer-events-auto rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
      >
        Reset
      </button>
    </div>
  );
}
