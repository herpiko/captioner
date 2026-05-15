# Captioner

A minimal linear video editor for adding text captions to video, with local
AI-powered auto-captioning. Built with Tauri 2, React, TypeScript, and
`whisper.cpp`. Captions are burned into the exported MP4 via FFmpeg.

## Features

- Open any common video file (mp4, mov, mkv, avi, webm, m4v).
- HTML5 preview with overlay captions — instant playback, no transcoding while editing.
- Single-track caption timeline with draggable / resizable blocks, swap-on-cross behaviour, and non-overlapping inserts.
- Per-caption text, position (drag in preview), font, size, color, stroke, optional background box.
- Settings dialog: caption defaults + Whisper model picker + cache management. Light / dark theme toggle.
- Undo / redo (⌘Z / ⇧⌘Z) covering all caption edits.
- Smooth playback with auto-scrolling timeline that follows the playhead.
- **Auto Caption** (local) — transcribes with Whisper, splits captions on token-level timestamps and punctuation, filters non-speech and hallucinations, supports English and Bahasa Indonesia. Caches transcripts by audio content hash so re-runs are instant.
- Export to MP4 with captions rendered via FFmpeg + libass.

## Requirements

- macOS (Windows / Linux later).
- For development: Node 18+, Rust toolchain, `cmake` (`brew install cmake`).
- FFmpeg / FFprobe binaries are bundled into the released `.app`; no host install needed for end users.

## Installing the released DMG

Captioner is not yet signed with an Apple Developer ID. macOS Gatekeeper
will quarantine the download and may show:

> "Captioner is damaged and can't be opened. You should eject the disk image."

The app is **not actually damaged** — Gatekeeper applies this label to any
unsigned app downloaded from the internet. To run it, remove the quarantine
attribute after copying the app to `/Applications`:

```bash
xattr -dr com.apple.quarantine /Applications/Captioner.app
```

You only need to do this once per install. Subsequent launches work normally.

Alternatively, in **System Settings → Privacy & Security**, after the first
blocked launch attempt you'll see an "Open Anyway" button for Captioner —
clicking it permits future launches.

Proper code-signing and notarization will be added in a future release.

## Build & run

A `Makefile` wraps the common tasks:

```bash
make run              # dev mode (npm run tauri dev)
make build-macos      # .app + .dmg for the host architecture
make build-macos-arm  # Apple Silicon
make build-macos-intel
make build-macos-universal
make check            # tsc --noEmit + cargo check
```

The first `make run` / `make build-*` automatically fetches the bundled FFmpeg
and FFprobe binaries into `src-tauri/binaries/` via `make fetch-binaries`.
These binaries are gitignored.

## How it works

- Editor preview uses HTML5 `<video>` with DOM overlay captions — playhead and captions update at refresh rate via a `requestAnimationFrame` loop.
- Each caption stores text, time range, normalized position (x/y in 0..1 so any aspect ratio works), font, size, color, stroke, optional background box.
- Timeline supports cursor-anchored zoom (Cmd / Ctrl + scroll wheel or pinch), draggable playhead, and smooth auto-scroll that keeps the playhead near 25 % of the viewport while playing.
- Export builds an ASS subtitle file with `\pos`-anchored events (two styles: outline mode and boxed mode), wraps long text against ~92 % of the video width, then burns it into the video via `ffmpeg -vf subtitles=…`.
- Auto Caption pipeline: FFmpeg extracts mono 16 kHz audio → whisper.cpp (via `whisper-rs`) returns token-level segments → JS-side chunker groups tokens into captions respecting sentence boundaries, silence gaps, and a soft duration target. Results are cached at `<app-data>/cache/whisper/{audio-hash}-{language}-{model}.json` so re-running on the same audio is instant.

## License

This project is licensed under the **GNU General Public License v3.0 or
later** — see [LICENSE](LICENSE).

In short: you are free to use, modify, and redistribute the source. Any
derivative work that is distributed must also be released under GPLv3, and
the corresponding source code must be made available to the recipients.

## Credits & third-party software

This software uses several third-party components. The application bundles
the FFmpeg binaries; other libraries are linked at build time. See each
project's website for full license texts.

| Component | License | Use |
| --- | --- | --- |
| [FFmpeg](https://ffmpeg.org/) | GPL v3 (build with `--enable-gpl` `--enable-libx264`) | Audio extraction, MP4 transcoding, subtitle burn-in. Binaries are pre-built and signed by [OSXExperts](https://www.osxexperts.net/). |
| [whisper.cpp](https://github.com/ggerganov/whisper.cpp) (via [whisper-rs](https://github.com/tazz4843/whisper-rs)) | MIT | Local speech-to-text for Auto Caption. |
| Whisper models (`ggml-small/medium/large-v3.bin`) | MIT (model weights by OpenAI, repackaged by ggerganov) | Downloaded on demand by the user from HuggingFace. |
| [libass](https://github.com/libass/libass) | ISC | Subtitle rendering inside FFmpeg's `subtitles` filter. |
| [Tauri 2](https://tauri.app/) | Apache-2.0 / MIT | Desktop runtime / packaging. |
| [React](https://react.dev/), [Vite](https://vitejs.dev/) | MIT | Frontend framework + build. |
| [Tailwind CSS](https://tailwindcss.com/) | MIT | Styling. |
| [Zustand](https://github.com/pmndrs/zustand) | MIT | App state management. |
| [hound](https://github.com/ruuda/hound), [serde](https://serde.rs/), [ureq](https://github.com/algesten/ureq), [sha2](https://github.com/RustCrypto/hashes) | MIT / Apache-2.0 (each) | Rust utilities used inside the Auto Caption pipeline. |

### FFmpeg notice (per GPL distribution requirements)

The bundled `ffmpeg` and `ffprobe` executables are licensed under
**GNU General Public License version 3** and contain GPL-licensed
components (notably `libx264`, `libx265`).

Source for FFmpeg can be obtained from <https://ffmpeg.org/download.html>.
The exact build configuration of the bundled binaries is preserved in
the binary's banner — run `ffmpeg -version` after a build to view it.

## Contributing

This project uses trunk-based development. Before opening a pull request:

```bash
make check
```

This runs the TypeScript type-checker and `cargo check` on the Rust side.

---

© 2026 Captioner contributors. Released under GPL-3.0-or-later.
