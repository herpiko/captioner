import { useStore } from "../store";

export function ExportOverlay() {
  const exporting = useStore((s) => s.exporting);
  const transcribing = useStore((s) => s.transcribing);
  if (!exporting && !transcribing) return null;
  const label = exporting ? "Exporting video…" : "Transcribing audio…";
  return (
    <div className="fixed inset-0 z-50 overlay-bg flex items-center justify-center backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 surface px-6 py-5 rounded-lg dialog-shadow border border-line">
        <div className="w-10 h-10 rounded-full border-4 border-line-strong border-t-blue-500 animate-spin" />
        <div className="text-sm text-default">{label}</div>
      </div>
    </div>
  );
}
