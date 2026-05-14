import { useEffect } from "react";
import { useStore } from "../store";

const isTextInput = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    // color/range/checkbox don't capture typing; allow shortcuts there
    return !["color", "range", "checkbox", "radio", "button"].includes(type);
  }
  if (tag === "TEXTAREA") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
};

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip everything while the user is typing into a text field — let the
      // browser handle space, undo, etc. natively.
      if (isTextInput(e.target)) return;

      // Space = play/pause toggle. Only when a video is loaded.
      if (e.code === "Space" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const s = useStore.getState();
        if (s.videoSrc) {
          e.preventDefault();
          s.setPlaying(!s.playing);
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
