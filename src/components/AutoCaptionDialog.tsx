import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Caption, useStore } from "../store";

type ModelStatus = {
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
  const setTranscribing = useStore((s) => s.setTranscribing);

  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [language, setLanguage] = useState<string>("en");
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{
    downloaded: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load model status when the dialog opens.
  useEffect(() => {
    invoke<ModelStatus>("model_status")
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, []);

  // Listen to download progress events from Rust.
  useEffect(() => {
    const unlisten = listen<{ downloaded: number; total: number }>(
      "model-download-progress",
      (event) => setProgress(event.payload)
    );
    return () => {
      unlisten.then((u) => u());
    };
  }, []);

  const onDownload = async () => {
    setError(null);
    setDownloading(true);
    setProgress({ downloaded: 0, total: status?.expected_size ?? 0 });
    try {
      await invoke("download_model");
      const fresh = await invoke<ModelStatus>("model_status");
      setStatus(fresh);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(false);
    }
  };

  const onRun = async () => {
    if (!videoPath || !status?.downloaded) return;
    setError(null);
    onClose();
    setTranscribing(true);
    try {
      const segments = await invoke<Segment[]>("transcribe", {
        req: { videoPath, language },
      });
      const maxDur = defaults.autoCaptionDurationSec;
      const allTokens: Token[] = segments
        .filter((s) => s.text.trim().length > 0 && s.end > s.start)
        .flatMap((s) =>
          // If a segment has no usable tokens, fall back to a synthetic
          // single-token covering the whole segment.
          s.tokens.filter((t) => t.text.trim().length > 0).length > 0
            ? s.tokens
            : [{ start: s.start, end: s.end, text: s.text }]
        )
        .filter((t) => t.end > t.start);
      const expanded = chunkTokens(allTokens, maxDur);
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
    } catch (e) {
      setError(String(e));
    } finally {
      setTranscribing(false);
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.min(100, (progress.downloaded / progress.total) * 100)
      : 0;

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
            disabled={downloading}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 p-3 surface-2 border border-line rounded">
          <div className="text-xs text-muted mb-1">Whisper model (small, ~466 MB)</div>
          {status?.downloaded ? (
            <div className="text-xs text-green-600">Model ready</div>
          ) : downloading ? (
            <div>
              <div className="text-xs text-default mb-1">
                Downloading… {pct.toFixed(0)}%
                {progress && progress.total > 0 && (
                  <span className="text-muted ml-1">
                    ({fmtMB(progress.downloaded)} / {fmtMB(progress.total)})
                  </span>
                )}
              </div>
              <div
                className="w-full h-1.5 rounded overflow-hidden"
                style={{ background: "var(--border-line)" }}
              >
                <div
                  className="h-full bg-blue-500 transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={onDownload}
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
            >
              Download model
            </button>
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
            disabled={!status?.downloaded || !videoPath || downloading}
            className="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm disabled:opacity-40"
          >
            Auto Caption
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtMB(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(0)} MB`;
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
