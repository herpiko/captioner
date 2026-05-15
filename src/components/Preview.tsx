import { useEffect, useRef } from "react";
import { useStore, Caption } from "../store";
import { useOpenVideo } from "../hooks/useOpenVideo";

export function Preview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    videoSrc,
    videoWidth,
    videoHeight,
    playing,
    currentTime,
    captions,
    setCurrentTime,
    setPlaying,
    selectedId,
    updateCaption,
    selectCaption,
    beginTransaction,
    commitTransaction,
  } = useStore();

  // Sync external play state -> video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [playing, setPlaying]);

  // Seek when currentTime changes from external source (timeline scrub)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - currentTime) > 0.15) {
      v.currentTime = currentTime;
    }
  }, [currentTime]);

  // While playing, drive currentTime from a rAF loop so the playhead moves
  // every frame instead of every ~250 ms when the <video> fires `timeupdate`.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setCurrentTime(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, setCurrentTime]);

  const onTimeUpdate = () => {
    // Still fire on the native event so paused-state seeks (e.g. user clicked
    // a frame inside the video) reflect in the store. While playing, the rAF
    // loop above is the authoritative source.
    if (playing) return;
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
  };

  const visible = captions.filter(
    (c) => currentTime >= c.start && currentTime <= c.end
  );

  const onDragStart = (e: React.PointerEvent, c: Caption) => {
    e.stopPropagation();
    selectCaption(c.id);
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = c.x;
    const origY = c.y;
    beginTransaction();

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / rect.width;
      const dy = (ev.clientY - startY) / rect.height;
      updateCaption(c.id, {
        x: Math.max(0, Math.min(1, origX + dx)),
        y: Math.max(0, Math.min(1, origY + dy)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitTransaction();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const openVideo = useOpenVideo();
  if (!videoSrc) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <button
          onClick={openVideo}
          className="px-5 py-2.5 rounded btn-soft text-sm"
        >
          Open a video to begin
        </button>
      </div>
    );
  }

  const aspect = videoWidth / videoHeight || 16 / 9;

  return (
    <div className="flex-1 flex items-center justify-center preview-bg p-4 overflow-hidden">
      <div
        ref={containerRef}
        className="relative max-w-full max-h-full"
        style={{ aspectRatio: aspect }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          className="block w-full h-full object-contain bg-black"
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setCurrentTime(v.currentTime);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onClick={() => setPlaying(!playing)}
        />
        {/* Caption overlays */}
        {visible.map((c) => (
          <CaptionOverlay
            key={c.id}
            caption={c}
            selected={selectedId === c.id}
            onPointerDown={(e) => onDragStart(e, c)}
            containerW={containerRef.current?.clientWidth || videoWidth}
            videoW={videoWidth}
          />
        ))}
      </div>
    </div>
  );
}

function CaptionOverlay({
  caption: c,
  selected,
  onPointerDown,
  containerW,
  videoW,
}: {
  caption: Caption;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  containerW: number;
  videoW: number;
}) {
  // Scale font from video px to preview px
  const scale = containerW / videoW;
  const fs = c.fontSize * scale;
  const sw = c.strokeWidth * scale;

  const textShadow = sw > 0
    ? `
      -${sw}px -${sw}px 0 ${c.strokeColor},
      ${sw}px -${sw}px 0 ${c.strokeColor},
      -${sw}px ${sw}px 0 ${c.strokeColor},
      ${sw}px ${sw}px 0 ${c.strokeColor},
      0 -${sw}px 0 ${c.strokeColor},
      0 ${sw}px 0 ${c.strokeColor},
      -${sw}px 0 0 ${c.strokeColor},
      ${sw}px 0 0 ${c.strokeColor}
    `
    : "none";

  return (
    <div
      onPointerDown={onPointerDown}
      className="absolute select-none"
      style={{
        left: `${c.x * 100}%`,
        top: `${c.y * 100}%`,
        transform: "translate(-50%, -50%)",
        maxWidth: "96%",
        fontFamily: c.fontFamily,
        fontSize: `${fs}px`,
        color: c.color,
        textShadow,
        background: c.bgEnabled ? c.bgColor : "transparent",
        padding: c.bgEnabled ? "0.1em 0.4em" : 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        textAlign: "center",
        lineHeight: 1.2,
        cursor: "move",
        outline: selected ? "1px dashed #6aa9ff" : "none",
        outlineOffset: 2,
      }}
    >
      {c.text}
    </div>
  );
}
