import { create } from "zustand";
import { findFreeSlot } from "./lib/layout";

export type Caption = {
  id: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  bgColor: string;
  bgEnabled: boolean;
};

export type CaptionDefaults = Omit<Caption, "id" | "text" | "start" | "end"> & {
  durationSec: number;
  autoCaptionDurationSec: number;
};

const FACTORY_DEFAULTS: CaptionDefaults = {
  durationSec: 3,
  autoCaptionDurationSec: 2,
  x: 0.5,
  y: 0.85,
  fontFamily: "Arial",
  fontSize: 24,
  color: "#000000",
  strokeColor: "#000000",
  strokeWidth: 0,
  bgColor: "#ffffff",
  bgEnabled: true,
};

const DEFAULTS_KEY = "captioner.defaults.v1";
const THEME_KEY = "captioner.theme.v1";

export type Theme = "light" | "dark";

function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // ignore
  }
  return "light";
}

function saveTheme(t: Theme) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // ignore
  }
}

function loadDefaults(): CaptionDefaults {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return { ...FACTORY_DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...FACTORY_DEFAULTS, ...parsed };
  } catch {
    return { ...FACTORY_DEFAULTS };
  }
}

function saveDefaults(d: CaptionDefaults) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(d));
  } catch {
    // ignore
  }
}

type Snapshot = {
  captions: Caption[];
  selectedId: string | null;
};

const HISTORY_LIMIT = 100;

type State = {
  videoPath: string | null;
  videoSrc: string | null;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  currentTime: number;
  playing: boolean;
  captions: Caption[];
  selectedId: string | null;
  /** Set transiently when a caption is freshly added so the panel can focus its text field. */
  focusTextForId: string | null;
  exporting: boolean;
  transcribing: boolean;
  zoom: number;

  defaults: CaptionDefaults;
  theme: Theme;

  _past: Snapshot[];
  _future: Snapshot[];
  _txnBase: Snapshot | null;

  setVideo: (
    path: string,
    src: string,
    width: number,
    height: number,
    duration: number
  ) => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setExporting: (e: boolean) => void;
  setTranscribing: (t: boolean) => void;
  setZoom: (z: number) => void;
  replaceCaptions: (captions: Caption[]) => void;
  clearCaptions: () => void;
  addCaption: () => string | null;
  updateCaption: (id: string, patch: Partial<Caption>) => void;
  setCaptions: (next: Caption[]) => void;
  removeCaption: (id: string) => void;
  selectCaption: (id: string | null) => void;
  clearFocusText: () => void;

  setDefaults: (patch: Partial<CaptionDefaults>) => void;
  resetDefaults: () => void;
  setTheme: (t: Theme) => void;

  beginTransaction: () => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  recordEdit: (fn: () => void) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

const newId = () => Math.random().toString(36).slice(2, 10);

const snapshot = (s: State): Snapshot => ({
  captions: s.captions.map((c) => ({ ...c })),
  selectedId: s.selectedId,
});

const samePositions = (a: Snapshot, b: Snapshot): boolean => {
  if (a.captions.length !== b.captions.length) return false;
  for (let i = 0; i < a.captions.length; i++) {
    const x = a.captions[i];
    const y = b.captions[i];
    if (
      x.id !== y.id ||
      x.text !== y.text ||
      x.start !== y.start ||
      x.end !== y.end ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.fontFamily !== y.fontFamily ||
      x.fontSize !== y.fontSize ||
      x.color !== y.color ||
      x.strokeColor !== y.strokeColor ||
      x.strokeWidth !== y.strokeWidth ||
      x.bgColor !== y.bgColor ||
      x.bgEnabled !== y.bgEnabled
    ) {
      return false;
    }
  }
  return true;
};

export const useStore = create<State>((set, get) => ({
  videoPath: null,
  videoSrc: null,
  videoWidth: 1920,
  videoHeight: 1080,
  duration: 0,
  currentTime: 0,
  playing: false,
  captions: [],
  selectedId: null,
  focusTextForId: null,
  exporting: false,
  transcribing: false,
  zoom: 1,

  defaults: loadDefaults(),
  theme: loadTheme(),

  _past: [],
  _future: [],
  _txnBase: null,

  setVideo: (path, src, width, height, duration) =>
    set({
      videoPath: path,
      videoSrc: src,
      videoWidth: width,
      videoHeight: height,
      duration,
      currentTime: 0,
      playing: false,
      captions: [],
      selectedId: null,
      focusTextForId: null,
      zoom: 1,
      _past: [],
      _future: [],
      _txnBase: null,
    }),

  setCurrentTime: (t) => set({ currentTime: t }),
  setPlaying: (p) => set({ playing: p }),
  setExporting: (e) => set({ exporting: e }),
  setTranscribing: (t) => set({ transcribing: t }),
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(50, z)) }),

  replaceCaptions: (next) =>
    get().recordEdit(() => {
      set({ captions: next, selectedId: null, focusTextForId: null });
    }),

  clearCaptions: () =>
    get().recordEdit(() => {
      set({ captions: [], selectedId: null, focusTextForId: null });
    }),

  addCaption: () => {
    const { currentTime, duration, captions, defaults } = get();
    const len = Math.min(defaults.durationSec, duration || defaults.durationSec);
    const slot = findFreeSlot(captions, currentTime, len, duration || len);
    if (!slot) return null;

    const id = newId();
    const cap: Caption = {
      id,
      text: "New caption",
      start: slot.start,
      end: slot.end,
      x: defaults.x,
      y: defaults.y,
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      color: defaults.color,
      strokeColor: defaults.strokeColor,
      strokeWidth: defaults.strokeWidth,
      bgColor: defaults.bgColor,
      bgEnabled: defaults.bgEnabled,
    };
    get().recordEdit(() => {
      set({ captions: [...captions, cap], selectedId: id });
    });
    set({ focusTextForId: id });
    return id;
  },

  updateCaption: (id, patch) =>
    set((s) => ({
      captions: s.captions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    })),

  setCaptions: (next) => set({ captions: next }),

  removeCaption: (id) =>
    get().recordEdit(() => {
      set((s) => ({
        captions: s.captions.filter((c) => c.id !== id),
        selectedId: s.selectedId === id ? null : s.selectedId,
      }));
    }),

  selectCaption: (id) => set({ selectedId: id }),

  clearFocusText: () => set({ focusTextForId: null }),

  setDefaults: (patch) => {
    const next = { ...get().defaults, ...patch };
    saveDefaults(next);
    set({ defaults: next });
  },

  resetDefaults: () => {
    saveDefaults(FACTORY_DEFAULTS);
    set({ defaults: { ...FACTORY_DEFAULTS } });
  },

  setTheme: (t) => {
    saveTheme(t);
    set({ theme: t });
  },

  beginTransaction: () => {
    const s = get();
    if (s._txnBase) return;
    set({ _txnBase: snapshot(s) });
  },

  commitTransaction: () => {
    const s = get();
    if (!s._txnBase) return;
    const base = s._txnBase;
    const now = snapshot(s);
    if (samePositions(base, now)) {
      set({ _txnBase: null });
      return;
    }
    const past = [...s._past, base];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ _past: past, _future: [], _txnBase: null });
  },

  cancelTransaction: () => set({ _txnBase: null }),

  recordEdit: (fn) => {
    get().beginTransaction();
    fn();
    get().commitTransaction();
  },

  undo: () => {
    const s = get();
    if (s._past.length === 0) return;
    const past = s._past.slice();
    const prev = past.pop()!;
    const current = snapshot(s);
    set({
      captions: prev.captions.map((c) => ({ ...c })),
      selectedId: prev.selectedId,
      _past: past,
      _future: [...s._future, current],
    });
  },

  redo: () => {
    const s = get();
    if (s._future.length === 0) return;
    const future = s._future.slice();
    const next = future.pop()!;
    const current = snapshot(s);
    set({
      captions: next.captions.map((c) => ({ ...c })),
      selectedId: next.selectedId,
      _past: [...s._past, current],
      _future: future,
    });
  },

  canUndo: () => get()._past.length > 0,
  canRedo: () => get()._future.length > 0,
}));
