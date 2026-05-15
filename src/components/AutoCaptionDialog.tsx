import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Caption, useStore } from "../store";

type ModelStatus = {
  name: string;
  label: string;
  description: string;
  downloaded: boolean;
  path: string;
  expected_size: number;
  downloaded_size: number;
};

type Token = {
  start: number;
  end: number;
  text: string;
};

type Segment = {
  start: number;
  end: number;
  text: string;
  tokens: Token[];
};

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
];

export function AutoCaptionDialog({ onClose }: { onClose: () => void }) {
  const videoPath = useStore((s) => s.videoPath);
  const defaults = useStore((s) => s.defaults);
  const replaceCaptions = useStore((s) => s.replaceCaptions);
  const clearCaptions = useStore((s) => s.clearCaptions);
  const setZoom = useStore((s) => s.setZoom);
  const setTranscribing = useStore((s) => s.setTranscribing);
  const activeModel = useStore((s) => s.activeModel);

  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [language, setLanguage] = useState<string>("en");
  const [error, setError] = useState<string | null>(null);

  // Reload the active model's status when the dialog opens or the active model changes.
  useEffect(() => {
    invoke<ModelStatus>("model_status", { name: activeModel })
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, [activeModel]);

  const onRun = async () => {
    if (!videoPath || !status?.downloaded) return;
    setError(null);
    onClose();
    // Wipe any existing captions before starting so the user sees a clean
    // track while we transcribe and the new captions land into an empty
    // timeline (not on top of stale ones).
    clearCaptions();
    setTranscribing(true);
    try {
      const segments = await invoke<Segment[]>("transcribe", {
        req: { videoPath, language, model: activeModel },
      });
      const maxDur = defaults.autoCaptionDurationSec;
      const allTokens: Token[] = segments
        .filter((s) => s.text.trim().length > 0 && s.end > s.start)
        .filter((s) => !isHallucination(s.text))
        .flatMap((s) =>
          // If a segment has no usable tokens, fall back to a synthetic
          // single-token covering the whole segment.
          s.tokens.filter((t) => t.text.trim().length > 0).length > 0
            ? s.tokens
            : [{ start: s.start, end: s.end, text: s.text }]
        )
        .filter((t) => t.end > t.start);
      const expanded = chunkTokens(allTokens, maxDur).filter(
        (c) => !isHallucination(c.text)
      );
      const now = Date.now();
      const captions: Caption[] = expanded.map((s, i) => ({
        id: `auto-${now}-${i}`,
        text: s.text,
        start: s.start,
        end: s.end,
        x: defaults.x,
        y: defaults.y,
        fontFamily: defaults.fontFamily,
        fontSize: defaults.fontSize,
        color: defaults.color,
        strokeColor: defaults.strokeColor,
        strokeWidth: defaults.strokeWidth,
        bgColor: defaults.bgColor,
        bgEnabled: defaults.bgEnabled,
      }));
      replaceCaptions(captions);
      // Autozoom so the user can see the dense auto-generated captions.
      setZoom(6);
    } catch (e) {
      setError(String(e));
    } finally {
      setTranscribing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 dialog-backdrop flex items-center justify-center z-40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface border border-line rounded-lg dialog-shadow p-5 w-[440px] max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Auto Caption</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-default text-xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-xs text-muted mb-4">
          Transcribe the video's audio with Whisper (runs locally on this machine).
          Auto-generated captions will replace any existing captions on the track —
          you can edit them after.
        </p>

        <div className="mb-4">
          <label className="block text-xs text-muted mb-1">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 p-3 surface-2 border border-line rounded">
          <div className="text-xs text-muted mb-1">Model</div>
          {status ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{status.label}</div>
                {status.downloaded ? (
                  <div className="text-[11px] text-green-600">Ready</div>
                ) : (
                  <div className="text-[11px] text-red-500">
                    Not downloaded — open Settings to download.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted">Checking model status…</div>
          )}
        </div>

        {error && (
          <div className="mb-3 text-xs text-red-500 break-words">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-line">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded btn-soft text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onRun}
            disabled={!status?.downloaded || !videoPath}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-40"
          >
            Auto Caption
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Walk tokens chronologically and group them into caption-sized chunks.
 *
 *  - `maxDur` is the soft target. If the running chunk has already passed a
 *    natural break (punctuation) and would otherwise exceed it, we cut there.
 *  - A hard ceiling of `maxDur * 1.25` forces a break even mid-sentence.
 *  - Chunks shorter than `minDur` (0.5s) are merged forward to avoid flashy
 *    one-frame captions.
 *  - Timestamps are taken from the actual token times, so captions stay glued
 *    to the audio regardless of speech rate.
 */
/**
 * Whisper occasionally emits canned hallucinations during music or non-speech
 * audio — most famously "Thank you for watching", "Please subscribe", music
 * symbols, etc. Catch the common ones here as a safety net (the Rust side
 * already drops most via no_speech_thold + suppress_non_speech_tokens).
 */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /^\s*[♪♫🎵🎶]\s*[^a-z0-9]*\s*$/i,
  /thank(s)?\s+(you\s+)?(for\s+)?(watching|listening)/i,
  /(please\s+)?(like\s+(and\s+)?)?subscribe/i,
  /(don'?t\s+forget\s+to\s+)?(like|hit)\s+(and\s+)?(the\s+)?(like|subscribe|bell)/i,
  /turn\s+on\s+(the\s+)?notification/i,
  /see\s+you\s+(in\s+the\s+)?next\s+(video|one)/i,
  /^\s*[\.\-_,\s]*\s*$/, // pure punctuation / dashes / dots
  /^\s*\(.*\)\s*$/, // entire caption is parenthetical, like "(music)"
  /^\s*\[.*\]\s*$/, // entire caption is bracketed, like "[Music]"
];

function isHallucination(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  for (const re of HALLUCINATION_PATTERNS) {
    if (re.test(t)) return true;
  }
  // Highly repetitive same-word output ("you you you you you").
  const words = t.toLowerCase().split(/\s+/);
  if (words.length >= 4) {
    const unique = new Set(words);
    if (unique.size === 1) return true;
  }
  return false;
}

const MIN_CHUNK = 0.5;
const HARD_MULT = 1.25;
// If a token starts more than this many seconds after the previous token ends,
// treat it as a silence gap and break the chunk.
const SILENCE_GAP = 0.4;
// Hard cap on how far past the last token's end we'll extend a chunk to fill
// to the next token's start. Keeps captions from hanging during silence.
const TRAILING_PAD = 0.15;
// Strong break (end-of-sentence): always prefer to break here.
const STRONG_BREAK = /[.?!]["')\]]?$/;
// Weak break (mid-sentence pause): break here if we're close to maxDur.
const WEAK_BREAK = /[,;:—]["')\]]?$/;

function chunkTokens(
  tokens: Token[],
  maxDur: number
): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  if (tokens.length === 0) return out;
  const hardDur = maxDur * HARD_MULT;

  let buf: Token[] = [];
  let bufStart = tokens[0].start;

  const flush = (i: number) => {
    if (buf.length === 0) return;
    const text = buf.map((t) => t.text).join("").trim();
    if (text.length === 0) {
      buf = [];
      return;
    }
    const start = bufStart;
    const lastTok = buf[buf.length - 1];
    let end = lastTok.end;

    // Trim trailing silence: never let the caption extend more than TRAILING_PAD
    // past the last spoken token. Also cap end before the next token starts
    // (with a tiny pad) so we don't bleed into the next caption either.
    const next = tokens[i + 1];
    const cap = lastTok.end + TRAILING_PAD;
    if (next) {
      end = Math.min(end, cap, next.start - 0.02);
    } else {
      end = Math.min(end, cap);
    }
    // Guard against pathological zero/negative duration after capping.
    if (end <= start) end = start + 0.05;

    // Merge tiny chunks into the previous one if possible.
    if (end - start < MIN_CHUNK && out.length > 0) {
      out[out.length - 1].end = end;
      out[out.length - 1].text = (out[out.length - 1].text + " " + text).trim();
    } else {
      out.push({ start, end, text });
    }
    buf = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (buf.length === 0) bufStart = tok.start;
    buf.push(tok);
    const dur = tok.end - bufStart;
    const trailing = tok.text.trim();
    const next = tokens[i + 1];

    // Silence gap ahead → flush here so the caption doesn't hang over the
    // upcoming silence.
    if (next && next.start - tok.end >= SILENCE_GAP) {
      flush(i);
      continue;
    }

    // Strong break + already long enough → flush.
    if (STRONG_BREAK.test(trailing) && dur >= MIN_CHUNK) {
      flush(i);
      continue;
    }
    // Hit hard ceiling → break now (at this token, even mid-sentence).
    if (dur >= hardDur) {
      flush(i);
      continue;
    }
    // Past soft target → break at the next weak punctuation boundary.
    if (dur >= maxDur && WEAK_BREAK.test(trailing)) {
      flush(i);
      continue;
    }
    // Past soft target with no punctuation in sight: break at the next
    // token-level whitespace boundary.
    if (dur >= maxDur) {
      if (next && /^\s/.test(next.text)) {
        flush(i);
        continue;
      }
    }
  }
  flush(tokens.length - 1);
  return out;
}
