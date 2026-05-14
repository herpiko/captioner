import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { DefaultsDialog } from "./DefaultsDialog";

type VideoInfo = { width: number; height: number; duration: number };

export function Toolbar() {
  const {
    videoPath,
    playing,
    setPlaying,
    addCaption,
    captions,
    videoWidth,
    videoHeight,
    exporting,
    setExporting,
  } = useStore();
  const setVideo = useStore((s) => s.setVideo);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const pastLen = useStore((s) => s._past.length);
  const futureLen = useStore((s) => s._future.length);

  const [showDefaults, setShowDefaults] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const onOpen = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"],
        },
      ],
    });
    if (!selected || typeof selected !== "string") return;
    try {
      const info = await invoke<VideoInfo>("probe_video", { path: selected });
      const src = convertFileSrc(selected);
      setVideo(selected, src, info.width, info.height, info.duration);
    } catch (err) {
      alert(`Failed to load video: ${err}`);
    }
  };

  const onAddCaption = () => {
    const id = addCaption();
    if (id === null) {
      alert("No room for another caption — the timeline is full.");
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

  return (
    <>
      <header className="flex items-center gap-2 px-3 py-2 border-b border-neutral-800 bg-neutral-950">
        <button
          onClick={onOpen}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
        >
          Open video
        </button>
        <button
          onClick={() => setPlaying(!playing)}
          disabled={!videoPath}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-40"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={onAddCaption}
          disabled={!videoPath}
          className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm disabled:opacity-40"
        >
          + Caption
        </button>
        <button
          onClick={() => setShowDefaults(true)}
          className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
          title="Default caption settings"
        >
          Settings
        </button>
        <div className="w-px h-6 bg-neutral-800 mx-1" />
        <button
          onClick={undo}
          disabled={pastLen === 0}
          title="Undo (⌘Z)"
          className="px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-40"
        >
          Undo
        </button>
        <button
          onClick={redo}
          disabled={futureLen === 0}
          title="Redo (⌘Y or ⇧⌘Z)"
          className="px-2 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm disabled:opacity-40"
        >
          Redo
        </button>
        <div className="flex-1" />
        {videoPath && (
          <span className="text-xs text-neutral-500 truncate max-w-[40ch]">
            {videoPath.split("/").pop()} · {videoWidth}×{videoHeight}
          </span>
        )}
        <button
          onClick={onExport}
          disabled={!videoPath || exporting}
          className="px-3 py-1.5 rounded bg-green-700 hover:bg-green-600 text-sm disabled:opacity-40"
        >
          {exporting ? "Exporting…" : "Export MP4"}
        </button>
      </header>
      {showDefaults && <DefaultsDialog onClose={() => setShowDefaults(false)} />}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] bg-neutral-800 border border-neutral-700 text-sm px-4 py-2 rounded shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
