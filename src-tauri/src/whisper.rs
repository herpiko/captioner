use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const MODEL_FILENAME: &str = "ggml-small.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";
// Expected size in bytes (~466 MB). Used only as a sanity hint for the UI.
pub const MODEL_EXPECTED_SIZE: u64 = 487_601_968;

#[derive(Debug, Serialize)]
pub struct ModelStatus {
    pub downloaded: bool,
    pub path: String,
    pub expected_size: u64,
    pub downloaded_size: u64,
}

#[derive(Clone, Debug, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

#[derive(Debug, Deserialize)]
pub struct TranscribeRequest {
    #[serde(rename = "videoPath")]
    pub video_path: String,
    pub language: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Token {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub tokens: Vec<Token>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CacheEntry {
    /// Format version — bump when the cache schema or whisper params change in a
    /// way that would invalidate old entries.
    version: u32,
    language: String,
    segments: Vec<Segment>,
}

const CACHE_VERSION: u32 = 1;

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {}", e))?
        .join("models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create models dir: {}", e))?;
    Ok(dir)
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolve app data dir: {}", e))?
        .join("cache")
        .join("whisper");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create cache dir: {}", e))?;
    Ok(dir)
}

fn cache_key_path(app: &AppHandle, audio_hash: &str, language: &str) -> Result<PathBuf, String> {
    Ok(cache_dir(app)?.join(format!("{}-{}.json", audio_hash, language)))
}

fn hash_audio(samples: &[f32]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    // Hash the raw f32 bytes — deterministic, fast, no allocation.
    let bytes: &[u8] = unsafe {
        std::slice::from_raw_parts(
            samples.as_ptr() as *const u8,
            std::mem::size_of_val(samples),
        )
    };
    h.update(bytes);
    format!("{:x}", h.finalize())
}

fn read_cache(path: &Path) -> Option<CacheEntry> {
    let bytes = std::fs::read(path).ok()?;
    let entry: CacheEntry = serde_json::from_slice(&bytes).ok()?;
    if entry.version != CACHE_VERSION {
        return None;
    }
    Some(entry)
}

fn write_cache(path: &Path, entry: &CacheEntry) -> Result<(), String> {
    let bytes = serde_json::to_vec(entry).map_err(|e| format!("serialize cache: {}", e))?;
    // Atomic write via a tmp sibling.
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes).map_err(|e| format!("write cache tmp: {}", e))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("rename cache: {}", e))?;
    Ok(())
}

/// Delete every cached transcript. Returns the number of files removed.
pub fn clear_cache(app: &AppHandle) -> Result<usize, String> {
    let dir = cache_dir(app)?;
    let mut removed = 0usize;
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if std::fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(models_dir(app)?.join(MODEL_FILENAME))
}

pub fn model_status(app: &AppHandle) -> Result<ModelStatus, String> {
    let path = model_path(app)?;
    let (downloaded, size) = match std::fs::metadata(&path) {
        Ok(m) => (m.len() >= MODEL_EXPECTED_SIZE - 1_000_000, m.len()),
        Err(_) => (false, 0),
    };
    Ok(ModelStatus {
        downloaded,
        path: path.to_string_lossy().to_string(),
        expected_size: MODEL_EXPECTED_SIZE,
        downloaded_size: size,
    })
}

/// Stream the model file to disk, emitting `model-download-progress` events.
/// Writes to a `.part` file and renames on success so partial downloads can't
/// be mistaken for complete ones.
pub fn download_model(app: AppHandle) -> Result<(), String> {
    let final_path = model_path(&app)?;
    let part_path = final_path.with_extension("part");

    let resp = ureq::get(MODEL_URL)
        .timeout(Duration::from_secs(600))
        .call()
        .map_err(|e| format!("HTTP error: {}", e))?;

    let total: u64 = resp
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(MODEL_EXPECTED_SIZE);

    let mut reader = resp.into_reader();
    let mut writer = BufWriter::new(
        File::create(&part_path).map_err(|e| format!("create part file: {}", e))?,
    );

    let mut buf = vec![0u8; 1 << 16];
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now();
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress { downloaded: 0, total },
    );

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("download read: {}", e))?;
        if n == 0 {
            break;
        }
        writer
            .write_all(&buf[..n])
            .map_err(|e| format!("download write: {}", e))?;
        downloaded += n as u64;
        if last_emit.elapsed() >= Duration::from_millis(150) {
            let _ = app.emit(
                "model-download-progress",
                DownloadProgress { downloaded, total },
            );
            last_emit = Instant::now();
        }
    }
    writer
        .flush()
        .map_err(|e| format!("flush part file: {}", e))?;
    drop(writer);

    std::fs::rename(&part_path, &final_path)
        .map_err(|e| format!("rename part file: {}", e))?;

    let _ = app.emit(
        "model-download-progress",
        DownloadProgress {
            downloaded: total,
            total,
        },
    );
    Ok(())
}

/// Cache the loaded whisper context so we don't re-load the 466 MB model
/// every transcription.
struct CachedContext {
    path: PathBuf,
    ctx: WhisperContext,
}
static CONTEXT_CACHE: Mutex<Option<CachedContext>> = Mutex::new(None);

fn load_context(path: &Path) -> Result<(), String> {
    let mut guard = CONTEXT_CACHE.lock().unwrap();
    if let Some(c) = guard.as_ref() {
        if c.path == path {
            return Ok(());
        }
    }
    let ctx = WhisperContext::new_with_params(
        path.to_string_lossy().as_ref(),
        WhisperContextParameters::default(),
    )
    .map_err(|e| format!("load whisper model: {}", e))?;
    *guard = Some(CachedContext {
        path: path.to_path_buf(),
        ctx,
    });
    Ok(())
}

fn extract_audio(video_path: &str, wav_path: &Path) -> Result<(), String> {
    let output = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            wav_path.to_string_lossy().as_ref(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg not found: {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "ffmpeg audio extraction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn read_wav_f32(path: &Path) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("open wav: {}", e))?;
    let spec = reader.spec();
    if spec.sample_rate != 16000 || spec.channels != 1 {
        return Err(format!(
            "unexpected wav format: {} Hz, {} ch",
            spec.sample_rate, spec.channels
        ));
    }
    let samples: Result<Vec<i16>, _> = reader.samples::<i16>().collect();
    let samples = samples.map_err(|e| format!("read wav samples: {}", e))?;
    Ok(samples.iter().map(|&s| s as f32 / 32768.0).collect())
}

pub fn transcribe(app: AppHandle, req: TranscribeRequest) -> Result<Vec<Segment>, String> {
    let path = model_path(&app)?;
    if !path.exists() {
        return Err("Model not downloaded yet — open Settings to download it.".into());
    }

    let tmp_dir = std::env::temp_dir();
    let wav_path = tmp_dir.join(format!("captioner_audio_{}.wav", std::process::id()));

    let result = (|| -> Result<Vec<Segment>, String> {
        extract_audio(&req.video_path, &wav_path)?;
        let audio = read_wav_f32(&wav_path)?;

        // Cache lookup: hash the actual audio samples, key by (hash, language).
        // Same audio in a re-encoded video → same hash → instant return.
        let audio_hash = hash_audio(&audio);
        let cache_file = cache_key_path(&app, &audio_hash, &req.language)?;
        if let Some(entry) = read_cache(&cache_file) {
            return Ok(entry.segments);
        }

        load_context(&path)?;
        let guard = CONTEXT_CACHE.lock().unwrap();
        let cached = guard.as_ref().ok_or("context not loaded")?;
        let mut state = cached
            .ctx
            .create_state()
            .map_err(|e| format!("create whisper state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(req.language.as_str()));
        params.set_translate(false);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        // Token-level timestamps so the JS side can split segments accurately.
        params.set_token_timestamps(true);
        // Use available CPU threads to speed up.
        let threads = std::thread::available_parallelism()
            .map(|n| n.get() as i32)
            .unwrap_or(4);
        params.set_n_threads(threads);

        state
            .full(params, &audio)
            .map_err(|e| format!("whisper full: {}", e))?;

        let n_segments = state
            .full_n_segments()
            .map_err(|e| format!("n_segments: {}", e))?;
        let mut segs = Vec::with_capacity(n_segments as usize);
        for i in 0..n_segments {
            let text = state
                .full_get_segment_text_lossy(i)
                .map_err(|e| format!("segment text: {}", e))?;
            let t0 = state
                .full_get_segment_t0(i)
                .map_err(|e| format!("segment t0: {}", e))?;
            let t1 = state
                .full_get_segment_t1(i)
                .map_err(|e| format!("segment t1: {}", e))?;

            let n_tokens = state
                .full_n_tokens(i)
                .map_err(|e| format!("n_tokens: {}", e))?;
            let mut tokens = Vec::with_capacity(n_tokens as usize);
            for j in 0..n_tokens {
                let tok_text = state
                    .full_get_token_text_lossy(i, j)
                    .map_err(|e| format!("token text: {}", e))?;
                // Skip whisper's special tokens (e.g. "[_BEG_]", "<|...|>").
                if tok_text.starts_with('[') || tok_text.starts_with("<|") {
                    continue;
                }
                let data = state
                    .full_get_token_data(i, j)
                    .map_err(|e| format!("token data: {}", e))?;
                tokens.push(Token {
                    start: data.t0 as f64 / 100.0,
                    end: data.t1 as f64 / 100.0,
                    text: tok_text,
                });
            }

            segs.push(Segment {
                start: t0 as f64 / 100.0,
                end: t1 as f64 / 100.0,
                text: text.trim().to_string(),
                tokens,
            });
        }

        // Persist to cache. Failures are non-fatal — the transcription still
        // succeeds even if disk is full or the path is unwritable.
        let entry = CacheEntry {
            version: CACHE_VERSION,
            language: req.language.clone(),
            // Clone the segments into the cache so we can still return `segs`.
            segments: segs
                .iter()
                .map(|s| Segment {
                    start: s.start,
                    end: s.end,
                    text: s.text.clone(),
                    tokens: s
                        .tokens
                        .iter()
                        .map(|t| Token {
                            start: t.start,
                            end: t.end,
                            text: t.text.clone(),
                        })
                        .collect(),
                })
                .collect(),
        };
        let _ = write_cache(&cache_file, &entry);

        Ok(segs)
    })();

    let _ = std::fs::remove_file(&wav_path);
    result
}
