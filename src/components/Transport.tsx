import { useStore } from "../store";

export function Transport() {
  const videoSrc = useStore((s) => s.videoSrc);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);
  const currentTime = useStore((s) => s.currentTime);
  const duration = useStore((s) => s.duration);

  if (!videoSrc) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-3 py-2 border-t border-line surface select-none">
      <button
        onClick={() => setPlaying(!playing)}
        className="w-10 h-10 rounded-full btn-soft flex items-center justify-center text-base"
        title={playing ? "Pause (Space)" : "Play (Space)"}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="text-xs tabular-nums text-muted">
        {fmt(currentTime)} / {fmt(duration)}
      </span>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path d="M4 2.5 13 8 4 13.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <rect x="3.5" y="2.5" width="3" height="11" rx="0.5" />
      <rect x="9.5" y="2.5" width="3" height="11" rx="0.5" />
    </svg>
  );
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${ms}`;
}
