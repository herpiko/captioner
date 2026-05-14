import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore, CaptionDefaults } from "../store";

const FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Courier New",
  "Georgia",
  "Verdana",
  "Impact",
  "Comic Sans MS",
];

export function DefaultsDialog({ onClose }: { onClose: () => void }) {
  const defaults = useStore((s) => s.defaults);
  const setDefaults = useStore((s) => s.setDefaults);
  const resetDefaults = useStore((s) => s.resetDefaults);

  const u = (patch: Partial<CaptionDefaults>) => setDefaults(patch);

  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  const onClearCaches = async () => {
    if (!confirm("Delete all cached auto-caption transcripts? Future Auto Caption runs will re-transcribe from scratch.")) {
      return;
    }
    setClearing(true);
    setClearMsg(null);
    try {
      const removed = await invoke<number>("clear_transcribe_cache");
      setClearMsg(`Cleared ${removed} cached transcript${removed === 1 ? "" : "s"}.`);
      setTimeout(() => setClearMsg(null), 3000);
    } catch (e) {
      setClearMsg(`Failed: ${e}`);
      setTimeout(() => setClearMsg(null), 5000);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 dialog-backdrop flex items-center justify-center z-40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface border border-line rounded-lg dialog-shadow p-5 w-[420px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-default text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-muted mb-4">
          New captions you add will use these settings.
        </p>

        <Field label={`Duration (${defaults.durationSec.toFixed(1)}s)`}>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={defaults.durationSec}
            onChange={(e) => u({ durationSec: parseFloat(e.target.value) })}
            className="w-full"
          />
        </Field>

        <Field
          label={`Auto caption duration (${defaults.autoCaptionDurationSec.toFixed(1)}s)`}
        >
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={defaults.autoCaptionDurationSec}
            onChange={(e) =>
              u({ autoCaptionDurationSec: parseFloat(e.target.value) })
            }
            className="w-full"
          />
          <div className="text-[10px] text-muted mt-1">
            Auto-generated captions longer than this are split into multiple
            captions.
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Default X (0-1)">
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={defaults.x.toFixed(2)}
              onChange={(e) => u({ x: parseFloat(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Default Y (0-1)">
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={defaults.y.toFixed(2)}
              onChange={(e) => u({ y: parseFloat(e.target.value) || 0 })}
            />
          </Field>
        </div>

        <Field label="Font">
          <select
            value={defaults.fontFamily}
            onChange={(e) => u({ fontFamily: e.target.value })}
            className="w-full"
          >
            {FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Font size (${defaults.fontSize}px)`}>
          <input
            type="range"
            min={12}
            max={200}
            value={defaults.fontSize}
            onChange={(e) => u({ fontSize: parseInt(e.target.value) })}
            className="w-full"
          />
        </Field>

        <Field label="Text colour">
          <input
            type="color"
            value={defaults.color}
            onChange={(e) => u({ color: e.target.value })}
            className="w-full h-8 bg-transparent border-0 p-0"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Stroke">
            <input
              type="color"
              value={defaults.strokeColor}
              onChange={(e) => u({ strokeColor: e.target.value })}
              className="w-full h-8 bg-transparent border-0 p-0"
            />
          </Field>
          <Field label={`Stroke width (${defaults.strokeWidth})`}>
            <input
              type="range"
              min={0}
              max={10}
              value={defaults.strokeWidth}
              onChange={(e) => u({ strokeWidth: parseInt(e.target.value) })}
              className="w-full"
            />
          </Field>
        </div>

        <Field label="Background">
          <label className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={defaults.bgEnabled}
              onChange={(e) => u({ bgEnabled: e.target.checked })}
            />
            <span>Enable background box by default</span>
          </label>
          <input
            type="color"
            value={defaults.bgColor}
            onChange={(e) => u({ bgColor: e.target.value })}
            disabled={!defaults.bgEnabled}
            className="w-full h-8 bg-transparent border-0 p-0 disabled:opacity-40"
          />
        </Field>

        <div className="mt-5 pt-4 border-t border-line">
          <div className="text-xs text-muted mb-2 font-semibold">
            Auto Caption cache
          </div>
          <p className="text-[11px] text-muted mb-2">
            Transcripts are cached by audio content. Re-running Auto Caption on
            the same video is instant.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClearCaches}
              disabled={clearing}
              className="px-3 py-1.5 rounded btn-soft text-xs disabled:opacity-40"
            >
              {clearing ? "Clearing…" : "Clear all caches"}
            </button>
            {clearMsg && (
              <span className="text-[11px] text-muted">{clearMsg}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-line">
          <button
            onClick={resetDefaults}
            className="text-xs text-muted hover:text-default"
          >
            Reset to factory defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
