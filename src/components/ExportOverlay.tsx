import { useStore } from "../store";

export function ExportOverlay() {
  const exporting = useStore((s) => s.exporting);
  if (!exporting) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-neutral-700 border-t-blue-500 animate-spin" />
        <div className="text-sm text-neutral-300">Exporting video…</div>
      </div>
    </div>
  );
}
