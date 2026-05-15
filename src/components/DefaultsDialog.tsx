import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useStore, CaptionDefaults } from "../store";

type ModelStatus = {
  name: string;
  label: string;
  description: string;
  downloaded: boolean;
  path: string;
  expected_size: number;
  downloaded_size: number;
};

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

type Tab = "captions" | "models";

export function DefaultsDialog({ onClose }: { onClose: () => void }) {
  const defaults = useStore((s) => s.defaults);
  const setDefaults = useStore((s) => s.setDefaults);
  const resetDefaults = useStore((s) => s.resetDefaults);

  const u = (patch: Partial<CaptionDefaults>) => setDefaults(patch);

  const [tab, setTab] = useState<Tab>("captions");
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
        className="surface border border-line rounded-lg dialog-shadow w-[560px] h-[760px] max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-default text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div
          className="mx-5 flex gap-1 p-1 rounded surface-2 border border-line"
          role="tablist"
        >
          <TabButton
            active={tab === "captions"}
            onClick={() => setTab("captions")}
          >
            Captions
          </TabButton>
          <TabButton
            active={tab === "models"}
            onClick={() => setTab("models")}
          >
            Models &amp; cache
          </TabButton>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4">
        {tab === "captions" && (
          <>
        <p className="text-xs text-muted mb-4">
          New captions you add will use these settings.
        </p>

        <div className="grid grid-cols-2 gap-3">
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
            label={`Auto caption (${defaults.autoCaptionDurationSec.toFixed(1)}s)`}
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
          </Field>
        </div>
        <div className="text-[10px] text-muted -mt-2 mb-3">
          Auto-generated captions longer than the auto-caption value are split
          into multiple captions.
        </div>

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

        <div className="grid grid-cols-2 gap-3">
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
        </div>

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

          </>
        )}

        {tab === "models" && (
          <>
            <ModelsSection />

            <div className="mt-5 pt-4 border-t border-line">
              <div className="text-xs text-muted mb-2 font-semibold">
                Auto Caption cache
              </div>
              <p className="text-[11px] text-muted mb-2">
                Transcripts are cached by audio content. Re-running Auto Caption
                on the same video is instant.
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
          </>
        )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-line">
          {tab === "captions" ? (
            <button
              onClick={resetDefaults}
              className="text-xs text-muted hover:text-default"
            >
              Reset to factory defaults
            </button>
          ) : (
            <span />
          )}
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

function ModelsSection() {
  const activeModel = useStore((s) => s.activeModel);
  const setActiveModel = useStore((s) => s.setActiveModel);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [downloadingName, setDownloadingName] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    model: string;
    downloaded: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const list = await invoke<ModelStatus[]>("list_models");
      setModels(list);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const unlisten = listen<{ model: string; downloaded: number; total: number }>(
      "model-download-progress",
      (event) => setProgress(event.payload)
    );
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  const onDownload = async (name: string) => {
    setError(null);
    setDownloadingName(name);
    setProgress({ model: name, downloaded: 0, total: 0 });
    try {
      await invoke("download_model", { name });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloadingName(null);
      setProgress(null);
    }
  };

  const onDelete = async (name: string, label: string) => {
    if (!confirm(`Delete the ${label} model from disk? You can re-download it later.`)) {
      return;
    }
    try {
      await invoke("delete_model", { name });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="mt-5 pt-4 border-t border-line">
      <div className="text-xs text-muted mb-2 font-semibold">Auto Caption models</div>
      <p className="text-[11px] text-muted mb-3">
        Bigger models are more accurate but slower and take more disk space.
        The Active model is used for Auto Caption.
      </p>
      <div className="flex flex-col gap-2">
        {models.map((m) => {
          const isActive = activeModel === m.name;
          const isDownloading = downloadingName === m.name;
          const pct =
            isDownloading && progress && progress.total > 0
              ? Math.min(100, (progress.downloaded / progress.total) * 100)
              : 0;
          return (
            <div
              key={m.name}
              className={`p-3 rounded border ${
                isActive ? "border-blue-500" : "border-line"
              } surface-2`}
            >
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="radio"
                    name="active-model"
                    checked={isActive}
                    onChange={() => setActiveModel(m.name)}
                    disabled={!m.downloaded}
                    title={
                      m.downloaded
                        ? "Use this model for Auto Caption"
                        : "Download this model first"
                    }
                  />
                  <span className="text-sm font-medium truncate">{m.label}</span>
                  <span className="text-[11px] text-muted">
                    {fmtMB(m.expected_size)}
                  </span>
                  {m.downloaded && (
                    <span className="text-[11px] text-green-600">downloaded</span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {m.downloaded ? (
                    <button
                      onClick={() => onDelete(m.name, m.label)}
                      className="text-[11px] text-red-500 hover:text-red-400 px-1"
                      title="Delete model from disk"
                    >
                      Delete
                    </button>
                  ) : isDownloading ? (
                    <span className="text-[11px] text-muted">
                      {pct.toFixed(0)}%
                    </span>
                  ) : (
                    <button
                      onClick={() => onDownload(m.name)}
                      disabled={downloadingName !== null}
                      className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] disabled:opacity-40"
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted">{m.description}</div>
              {isDownloading && (
                <div
                  className="w-full h-1 mt-2 rounded overflow-hidden"
                  style={{ background: "var(--border-line)" }}
                >
                  <div
                    className="h-full bg-blue-500 transition-[width]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 text-[11px] text-red-500 break-words">{error}</div>
      )}
    </div>
  );
}

function fmtMB(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
        active
          ? "surface text-default font-medium"
          : "text-muted hover:text-default"
      }`}
    >
      {children}
    </button>
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
