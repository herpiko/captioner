import { useEffect, useRef } from "react";
import { useStore, Caption } from "../store";
import { resolveDrag } from "../lib/layout";

const TRACK_HEIGHT = 44;
const RULER_HEIGHT = 24;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 50;

export function Timeline() {
  // Outer scroll viewport (the visible window)
  const viewportRef = useRef<HTMLDivElement>(null);
  // Inner content (its width = viewportWidth * zoom)
  const innerRef = useRef<HTMLDivElement>(null);

  const {
    duration,
    currentTime,
    captions,
    selectedId,
    zoom,
    setZoom,
    setCurrentTime,
    selectCaption,
    setCaptions,
    beginTransaction,
    commitTransaction,
  } = useStore();

  // Cursor-anchored Ctrl/Cmd + wheel zoom (trackpad pinch fires this too on macOS)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (!duration) return;
      e.preventDefault();

      const rect = viewport.getBoundingClientRect();
      const cursorX = e.clientX - rect.left + viewport.scrollLeft;
      const oldInnerWidth = rect.width * zoom;
      const cursorRatio = cursorX / oldInnerWidth; // 0..1 along the inner content

      // Negative deltaY = zoom in. ~10% per notch.
      const factor = Math.exp(-e.deltaY * 0.01);
      const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (newZoom === zoom) return;

      const newInnerWidth = rect.width * newZoom;
      const newScrollLeft = cursorRatio * newInnerWidth - (e.clientX - rect.left);
      setZoom(newZoom);
      // Apply scroll after the state update lands.
      requestAnimationFrame(() => {
        if (viewportRef.current) {
          viewportRef.current.scrollLeft = Math.max(0, newScrollLeft);
        }
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [zoom, duration, setZoom]);

  if (!duration) {
    return (
      <div className="h-40 border-t border-line surface flex items-center justify-center text-faint text-sm">
        Timeline appears after loading a video
      </div>
    );
  }

  const startScrub = (e: React.PointerEvent) => {
    e.preventDefault();
    const inner = innerRef.current!;
    const rect = inner.getBoundingClientRect();
    const seek = (clientX: number) => {
      const t = ((clientX - rect.left) / rect.width) * duration;
      setCurrentTime(Math.max(0, Math.min(duration, t)));
    };
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onBlockDrag = (
    e: React.PointerEvent,
    c: Caption,
    mode: "move" | "left" | "right"
  ) => {
    e.stopPropagation();
    selectCaption(c.id);
    const inner = innerRef.current!;
    const rect = inner.getBoundingClientRect();
    let dragStartX = e.clientX;
    let origRange = { start: c.start, end: c.end };
    beginTransaction();

    const resolveMode =
      mode === "move" ? "move" : mode === "left" ? "resize-left" : "resize-right";

    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - dragStartX) / rect.width) * duration;
      let proposedStart = origRange.start;
      let proposedEnd = origRange.end;
      if (mode === "move") {
        proposedStart = origRange.start + dx;
        proposedEnd = origRange.end + dx;
      } else if (mode === "left") {
        proposedStart = origRange.start + dx;
      } else {
        proposedEnd = origRange.end + dx;
      }
      const current = useStore.getState().captions;
      const result = resolveDrag(
        current,
        c.id,
        { start: proposedStart, end: proposedEnd },
        origRange,
        duration,
        resolveMode
      );
      setCaptions(result.captions);
      if (
        result.origRange.start !== origRange.start ||
        result.origRange.end !== origRange.end
      ) {
        origRange = result.origRange;
        dragStartX = ev.clientX;
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitTransaction();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Density-adjusted ruler step: aim for one major label every ~80px.
  const innerWidthGuess =
    (viewportRef.current?.clientWidth || 800) * zoom;
  const pxPerSec = innerWidthGuess / duration;
  const step = niceStep(80 / pxPerSec);
  const marks: number[] = [];
  for (let t = 0; t <= duration + 0.0001; t += step) {
    marks.push(t);
  }

  return (
    <div className="relative border-t border-line surface select-none">
      <div
        ref={viewportRef}
        className="overflow-x-auto overflow-y-hidden"
        style={{ overscrollBehavior: "contain" }}
      >
        <div
          ref={innerRef}
          className="relative"
          style={{
            width: `${zoom * 100}%`,
            height: RULER_HEIGHT + TRACK_HEIGHT + 8,
          }}
        >
          {/* Ruler — pointerdown scrubs the playhead */}
          <div
            className="absolute top-0 left-0 right-0 border-b border-line cursor-ew-resize"
            style={{ height: RULER_HEIGHT }}
            onPointerDown={startScrub}
          >
            {marks.map((t) => (
              <div
                key={t}
                className="absolute top-0 text-[10px] text-muted"
                style={{ left: `${(t / duration) * 100}%` }}
              >
                <div className="h-2 w-px" style={{ background: "var(--border-line-strong)" }} />
                <div className="px-1 whitespace-nowrap">{formatTime(t)}</div>
              </div>
            ))}
          </div>

          {/* Track */}
          <div
            className="absolute left-0 right-0 surface-2"
            style={{ top: RULER_HEIGHT + 4, height: TRACK_HEIGHT }}
          >
            {captions.map((c) => {
              const left = (c.start / duration) * 100;
              const width = ((c.end - c.start) / duration) * 100;
              const selected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  onPointerDown={(e) => onBlockDrag(e, c, "move")}
                  className={`absolute top-1 bottom-1 rounded text-xs px-2 flex items-center overflow-hidden ${
                    selected ? "caption-block-selected" : "caption-block"
                  }`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    cursor: "grab",
                  }}
                >
                  <div
                    onPointerDown={(e) => onBlockDrag(e, c, "left")}
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-black/20"
                  />
                  <span className="truncate pointer-events-none">{c.text}</span>
                  <div
                    onPointerDown={(e) => onBlockDrag(e, c, "right")}
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-black/20"
                  />
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div
              onPointerDown={startScrub}
              className="absolute -top-1 -left-2 w-4 h-4 bg-red-500 rotate-45 pointer-events-auto cursor-ew-resize"
              title="Drag to scrub"
            />
          </div>
        </div>
      </div>

      {/* Zoom controls (bottom-right of timeline) */}
      <ZoomControls />
    </div>
  );
}

function ZoomControls() {
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);

  const step = (factor: number) =>
    setZoom(clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM));

  return (
    <div className="absolute right-2 bottom-2 flex items-center gap-1 surface border border-line rounded px-1 py-0.5 text-xs dialog-shadow">
      <button
        onClick={() => step(1 / 1.4)}
        className="w-6 h-6 rounded btn-soft disabled:opacity-40"
        disabled={zoom <= MIN_ZOOM + 1e-6}
        title="Zoom out"
      >
        −
      </button>
      <button
        onClick={() => setZoom(1)}
        className="px-1.5 h-6 rounded btn-soft tabular-nums"
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => step(1.4)}
        className="w-6 h-6 rounded btn-soft disabled:opacity-40"
        disabled={zoom >= MAX_ZOOM - 1e-6}
        title="Zoom in"
      >
        +
      </button>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function formatTime(s: number): string {
  if (s < 60) {
    // Sub-second precision when zoomed in.
    return s < 10 && s % 1 !== 0 ? s.toFixed(1) + "s" : Math.round(s) + "s";
  }
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Pick a "nice" step (1, 2, 5 × 10^n) close to `target` seconds.
function niceStep(target: number): number {
  if (target <= 0) return 1;
  const exp = Math.floor(Math.log10(target));
  const base = Math.pow(10, exp);
  const f = target / base;
  let mult: number;
  if (f < 1.5) mult = 1;
  else if (f < 3.5) mult = 2;
  else if (f < 7.5) mult = 5;
  else mult = 10;
  return mult * base;
}
