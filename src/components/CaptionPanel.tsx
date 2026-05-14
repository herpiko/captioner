import { useEffect, useRef } from "react";
import { useStore } from "../store";

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

export function CaptionPanel() {
  const {
    captions,
    selectedId,
    updateCaption,
    removeCaption,
    beginTransaction,
    commitTransaction,
    recordEdit,
  } = useStore();
  const focusTextForId = useStore((s) => s.focusTextForId);
  const clearFocusText = useStore((s) => s.clearFocusText);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const c = captions.find((x) => x.id === selectedId);

  // When a caption is freshly added, focus its text field and select all so
  // the user can immediately overwrite the placeholder.
  useEffect(() => {
    if (!focusTextForId || focusTextForId !== c?.id) return;
    const ta = textRef.current;
    if (!ta) return;
    ta.focus();
    ta.select();
    clearFocusText();
  }, [focusTextForId, c?.id, clearFocusText]);

  if (!c) {
    return (
      <aside className="w-72 border-l border-line surface p-4 text-sm text-muted">
        Select a caption to edit
      </aside>
    );
  }

  const u = (patch: Partial<typeof c>) => updateCaption(c.id, patch);

  // Text/number: snapshot on focus, commit on blur — one history entry per edit session
  const textProps = {
    onFocus: () => beginTransaction(),
    onBlur: () => commitTransaction(),
  };

  // Sliders / color pickers: snapshot on pointerdown, commit on pointerup
  const dragProps = {
    onPointerDown: () => beginTransaction(),
    onPointerUp: () => commitTransaction(),
  };

  // Discrete change (select/checkbox): single recorded edit
  const discrete = (patch: Partial<typeof c>) => recordEdit(() => u(patch));

  return (
    <aside className="w-72 border-l border-line surface p-4 text-sm overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Caption</h3>
        <button
          onClick={() => removeCaption(c.id)}
          className="text-red-400 hover:text-red-300 text-xs"
        >
          Delete
        </button>
      </div>

      <Field label="Text">
        <textarea
          ref={textRef}
          rows={2}
          value={c.text}
          onChange={(e) => u({ text: e.target.value })}
          {...textProps}
          className="w-full rounded px-2 py-1 resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Start (s)">
          <input
            type="number"
            step="0.1"
            value={c.start.toFixed(2)}
            onChange={(e) => u({ start: parseFloat(e.target.value) || 0 })}
            {...textProps}
          />
        </Field>
        <Field label="End (s)">
          <input
            type="number"
            step="0.1"
            value={c.end.toFixed(2)}
            onChange={(e) => u({ end: parseFloat(e.target.value) || 0 })}
            {...textProps}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="X (0-1)">
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={c.x.toFixed(2)}
            onChange={(e) => u({ x: parseFloat(e.target.value) || 0 })}
            {...textProps}
          />
        </Field>
        <Field label="Y (0-1)">
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={c.y.toFixed(2)}
            onChange={(e) => u({ y: parseFloat(e.target.value) || 0 })}
            {...textProps}
          />
        </Field>
      </div>

      <Field label="Font">
        <select
          value={c.fontFamily}
          onChange={(e) => discrete({ fontFamily: e.target.value })}
          className="w-full"
        >
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </Field>

      <Field label={`Size (${c.fontSize}px)`}>
        <input
          type="range"
          min={12}
          max={200}
          value={c.fontSize}
          onChange={(e) => u({ fontSize: parseInt(e.target.value) })}
          {...dragProps}
          className="w-full"
        />
      </Field>

      <Field label="Color">
        <input
          type="color"
          value={c.color}
          onChange={(e) => u({ color: e.target.value })}
          {...dragProps}
          className="w-full h-8 bg-transparent border-0 p-0"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Stroke">
          <input
            type="color"
            value={c.strokeColor}
            onChange={(e) => u({ strokeColor: e.target.value })}
            {...dragProps}
            className="w-full h-8 bg-transparent border-0 p-0"
          />
        </Field>
        <Field label={`Stroke W (${c.strokeWidth})`}>
          <input
            type="range"
            min={0}
            max={10}
            value={c.strokeWidth}
            onChange={(e) => u({ strokeWidth: parseInt(e.target.value) })}
            {...dragProps}
            className="w-full"
          />
        </Field>
      </div>

      <Field label="Background">
        <label className="flex items-center gap-2 mb-2">
          <input
            type="checkbox"
            checked={c.bgEnabled}
            onChange={(e) => discrete({ bgEnabled: e.target.checked })}
          />
          <span>Enable background box</span>
        </label>
        <input
          type="color"
          value={c.bgColor}
          onChange={(e) => u({ bgColor: e.target.value })}
          {...dragProps}
          disabled={!c.bgEnabled}
          className="w-full h-8 bg-transparent border-0 p-0 disabled:opacity-40"
        />
      </Field>
    </aside>
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
