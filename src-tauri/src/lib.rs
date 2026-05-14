use serde::{Deserialize, Serialize};
use std::process::Command;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Caption {
    pub id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub x: f64,
    pub y: f64,
    #[serde(rename = "fontFamily")]
    pub font_family: String,
    #[serde(rename = "fontSize")]
    pub font_size: f64,
    pub color: String,
    #[serde(rename = "strokeColor")]
    pub stroke_color: String,
    #[serde(rename = "strokeWidth")]
    pub stroke_width: f64,
    #[serde(rename = "bgColor")]
    pub bg_color: String,
    #[serde(rename = "bgEnabled")]
    pub bg_enabled: bool,
}

#[derive(Debug, Deserialize)]
pub struct ExportRequest {
    #[serde(rename = "videoPath")]
    pub video_path: String,
    #[serde(rename = "outputPath")]
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub captions: Vec<Caption>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub duration: f64,
}

fn format_ass_time(seconds: f64) -> String {
    let h = (seconds / 3600.0) as u32;
    let m = ((seconds % 3600.0) / 60.0) as u32;
    let s = seconds % 60.0;
    format!("{}:{:02}:{:05.2}", h, m, s)
}

fn hex_to_ass_color(hex: &str) -> String {
    let h = hex.trim_start_matches('#');
    if h.len() != 6 {
        return "&H00FFFFFF".to_string();
    }
    let r = u8::from_str_radix(&h[0..2], 16).unwrap_or(255);
    let g = u8::from_str_radix(&h[2..4], 16).unwrap_or(255);
    let b = u8::from_str_radix(&h[4..6], 16).unwrap_or(255);
    format!("&H00{:02X}{:02X}{:02X}", b, g, r)
}

fn escape_ass_text(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('{', "\\{")
        .replace('}', "\\}")
        .replace('\n', "\\N")
}

fn build_ass(width: u32, height: u32, captions: &[Caption]) -> String {
    let mut out = String::new();
    out.push_str("[Script Info]\n");
    out.push_str("ScriptType: v4.00+\n");
    out.push_str(&format!("PlayResX: {}\n", width));
    out.push_str(&format!("PlayResY: {}\n", height));
    out.push_str("ScaledBorderAndShadow: yes\n");
    out.push_str("WrapStyle: 2\n\n");

    out.push_str("[V4+ Styles]\n");
    out.push_str("Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n");
    // Outline style (BorderStyle 1): text with stroke outline, no box.
    out.push_str("Style: Outline,Arial,48,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,5,10,10,10,1\n");
    // Boxed style (BorderStyle 3): text with opaque background box.
    out.push_str("Style: Boxed,Arial,48,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,3,8,0,5,10,10,10,1\n\n");

    out.push_str("[Events]\n");
    out.push_str("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");

    for c in captions {
        let px = (c.x * width as f64) as i32;
        let py = (c.y * height as f64) as i32;
        let primary = hex_to_ass_color(&c.color);
        let outline = hex_to_ass_color(&c.stroke_color);
        let back = hex_to_ass_color(&c.bg_color);
        let font = c.font_family.replace(',', " ");

        // BorderStyle is a style-line setting (not overridable inline), so we
        // pick a style depending on whether the background box is enabled.
        // \an5 = anchor at the \pos point (centred).
        let (style, overrides) = if c.bg_enabled {
            // With BorderStyle 3, \bord is the padding around the text and
            // \3c is the box colour. We want a visible padding even when
            // strokeWidth is 0 — bump to a sensible minimum.
            let pad = (c.stroke_width as i32).max(8);
            (
                "Boxed",
                format!(
                    "{{\\an5\\pos({},{})\\fn{}\\fs{}\\c{}\\3c{}\\4c{}\\bord{}\\shad0}}",
                    px, py, font, c.font_size as i32, primary, back, back, pad
                ),
            )
        } else {
            (
                "Outline",
                format!(
                    "{{\\an5\\pos({},{})\\fn{}\\fs{}\\c{}\\3c{}\\bord{}\\shad0}}",
                    px,
                    py,
                    font,
                    c.font_size as i32,
                    primary,
                    outline,
                    c.stroke_width as i32
                ),
            )
        };

        out.push_str(&format!(
            "Dialogue: 0,{},{},{},,0,0,0,,{}{}\n",
            format_ass_time(c.start),
            format_ass_time(c.end),
            style,
            overrides,
            escape_ass_text(&c.text),
        ));
    }

    out
}

#[tauri::command]
async fn probe_video(path: String) -> Result<VideoInfo, String> {
    tauri::async_runtime::spawn_blocking(move || probe_video_blocking(&path))
        .await
        .map_err(|e| format!("spawn_blocking join: {}", e))?
}

fn probe_video_blocking(path: &str) -> Result<VideoInfo, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height:format=duration",
            "-of", "json",
            path,
        ])
        .output()
        .map_err(|e| format!("ffprobe not found: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let parsed: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse ffprobe: {}", e))?;

    let stream = parsed["streams"][0].clone();
    let width = stream["width"].as_u64().unwrap_or(0) as u32;
    let height = stream["height"].as_u64().unwrap_or(0) as u32;
    let duration = parsed["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(VideoInfo { width, height, duration })
}

#[tauri::command]
async fn export_video(req: ExportRequest) -> Result<String, String> {
    // ffmpeg is a blocking child process; run it on a blocking thread so the
    // Tauri main thread (which drives the webview) is never stalled.
    tauri::async_runtime::spawn_blocking(move || {
        let ass_content = build_ass(req.width, req.height, &req.captions);

        let tmp_dir = std::env::temp_dir();
        let ass_path =
            tmp_dir.join(format!("captioner_{}.ass", std::process::id()));
        std::fs::write(&ass_path, ass_content)
            .map_err(|e| format!("write ass: {}", e))?;

        let ass_path_str = ass_path.to_string_lossy().to_string();
        let escaped = ass_path_str
            .replace('\\', "\\\\")
            .replace(':', "\\:")
            .replace('\'', "\\'");
        let filter = format!("subtitles='{}'", escaped);

        let output = Command::new("ffmpeg")
            .args([
                "-y",
                "-i", &req.video_path,
                "-vf", &filter,
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "20",
                "-c:a", "copy",
                "-movflags", "+faststart",
                &req.output_path,
            ])
            .output()
            .map_err(|e| format!("ffmpeg not found: {}", e))?;

        let _ = std::fs::remove_file(&ass_path);

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        Ok(req.output_path)
    })
    .await
    .map_err(|e| format!("spawn_blocking join: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![probe_video, export_video])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
