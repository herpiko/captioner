import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { DefaultsDialog } from "./DefaultsDialog";
import { AutoCaptionDialog } from "./AutoCaptionDialog";
import { useOpenVideo } from "../hooks/useOpenVideo";

export function Toolbar() {
  const {
    videoPath,
    addCaption,
    captions,
    videoWidth,
    videoHeight,
    exporting,
    setExporting,
  } = useStore();
  const clearCaptions = useStore((s) => s.clearCaptions);
  const onOpen = useOpenVideo();
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const pastLen = useStore((s) => s._past.length);
  const futureLen = useStore((s) => s._future.length);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  const [showDefaults, setShowDefaults] = useState(false);
  const [showAutoCaption, setShowAutoCaption] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const onAddCaption = () => {
    const id = addCaption();
    if (id === null) {
      alert("No room for another caption — the timeline is full.");
    }
  };

  const onClearCaptions = () => {
    if (captions.length === 0) return;
    if (
      confirm(
        `Delete all ${captions.length} caption${
          captions.length === 1 ? "" : "s"
        }? This can be undone with ⌘Z.`
      )
    ) {
      clearCaptions();
    }
  };

  const onExport = async () => {
    if (!videoPath) return;
    const dest = await save({
      defaultPath: "captioned.mp4",
      filters: [{ name: "MP4", extensions: ["mp4"] }],
    });
    if (!dest) return;
    setExporting(true);
    try {
      await invoke("export_video", {
        req: {
          videoPath,
          outputPath: dest,
          width: videoWidth,
          height: videoHeight,
          captions,
        },
      });
      setToast("Export complete");
      setTimeout(() => setToast(null), 3000);
      try {
        await revealItemInDir(dest);
      } catch {
        // best-effort; ignore if reveal fails
      }
    } catch (err) {
      setToast(`Export failed: ${err}`);
      setTimeout(() => setToast(null), 5000);
    } finally {
      setExporting(false);
    }
  };

  const softBtn =
    "px-3 py-1.5 rounded btn-soft text-sm disabled:opacity-40";

  return (
    <>
      <header className="flex items-center gap-2 px-3 py-2 border-b border-line surface">
        <button onClick={onOpen} className={softBtn}>
          Open video
        </button>
        <button
          onClick={onAddCaption}
          disabled={!videoPath}
          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-40"
        >
          + Caption
        </button>
        <button
          onClick={() => setShowAutoCaption(true)}
          disabled={!videoPath}
          className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white text-sm disabled:opacity-40"
          title="Auto-generate captions with Whisper (local)"
        >
          Auto Caption
        </button>
        <button
          onClick={onClearCaptions}
          disabled={captions.length === 0}
          className={softBtn}
          title="Delete all captions"
        >
          Clear All
        </button>
        <button
          onClick={() => setShowDefaults(true)}
          className={softBtn}
          title="Default caption settings"
        >
          Settings
        </button>
        <div className="w-px h-6 mx-1 border-l border-line" />
        <button
          onClick={undo}
          disabled={pastLen === 0}
          title="Undo (⌘Z)"
          className="px-2 py-1.5 rounded btn-soft text-sm disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={futureLen === 0}
          title="Redo (⌘Y or ⇧⌘Z)"
          className="px-2 py-1.5 rounded btn-soft text-sm disabled:opacity-40"
        >
          Redo
        </button>
        <div className="flex-1" />
        {videoPath && (
          <span className="text-xs text-muted truncate max-w-[40ch]">
            {videoPath.split("/").pop()} · {videoWidth}×{videoHeight}
          </span>
        )}
        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className="px-2 py-1.5 rounded btn-soft text-sm"
          title="Toggle light/dark theme"
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        <button
          onClick={onExport}
          disabled={!videoPath || exporting}
          className="px-3 py-1.5 rounded bg-green-700 hover:bg-green-600 text-white text-sm disabled:opacity-40"
        >
          {exporting ? "Exporting…" : "Export MP4"}
        </button>
      </header>
      {showDefaults && <DefaultsDialog onClose={() => setShowDefaults(false)} />}
      {showAutoCaption && (
        <AutoCaptionDialog onClose={() => setShowAutoCaption(false)} />
      )}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] surface border border-line text-sm px-4 py-2 rounded dialog-shadow">
          {toast}
        </div>
      )}
    </>
  );
}
