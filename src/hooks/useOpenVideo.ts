import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { useStore } from "../store";

type VideoInfo = { width: number; height: number; duration: number };

/**
 * Pick a video file via the OS dialog, probe it for dimensions and duration,
 * and push it into the store. Shared by the Toolbar's "Open video" button and
 * the empty-state CTA in the preview.
 */
export function useOpenVideo() {
  const setVideo = useStore((s) => s.setVideo);
  return async () => {
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
}
