# Captioner

A minimal linear video editor for burning text captions into video. Built with Tauri 2 + React + TypeScript.

## Requirements

- macOS (Windows/Linux later)
- Node 18+, Rust toolchain
- `ffmpeg` and `ffprobe` on PATH (`brew install ffmpeg`)

## Run

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## How it works

- Editor preview uses HTML5 `<video>` with DOM overlay captions — instant playback, no transcoding while editing.
- Each caption stores text, time range, normalized position (x/y), font, size, color, stroke, and optional background box.
- Caption block in the timeline is draggable (move) and has left/right edges for resizing duration.
- Caption overlay in the preview is draggable to reposition (writes back to x/y in 0..1 range — works for both vertical and horizontal video).
- Export builds an ASS subtitle file with `\pos`-anchored events and burns it into the video via `ffmpeg -vf subtitles=...`.

## Roadmap

Phase 2: AI auto-captioning via bundled `whisper.cpp` sidecar — produce a `Caption[]` from the video's audio, then let the user fine-tune in the same UI.
