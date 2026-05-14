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

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl p-5 w-[420px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-neutral-500 mb-4">
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

        <div className="flex items-center justify-between mt-5 pt-4 border-t border-neutral-800">
          <button
            onClick={resetDefaults}
            className="text-xs text-neutral-400 hover:text-white"
          >
            Reset to factory defaults
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm"
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
      <label className="block text-xs text-neutral-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
