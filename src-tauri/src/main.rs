#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Serialize;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{atomic::{AtomicBool, AtomicU32, Ordering}, Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, PhysicalPosition, State};

struct Expanded(Arc<AtomicBool>, Arc<AtomicU32>);

#[derive(Serialize, Default)]
struct Media { title: String, artist: String, playing: bool, active: bool, pos: f64, dur: f64 }

#[tauri::command]
fn set_expanded(state: State<Expanded>, v: bool, cw: f64) { state.0.store(v, Ordering::Relaxed); state.1.store(cw as u32, Ordering::Relaxed); }

#[tauri::command]
async fn get_media() -> Media {
    #[cfg(windows)]
    {
        use windows::Media::Control::{GlobalSystemMediaTransportControlsSessionManager as Mgr,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as St};
        let r = (|| -> windows::core::Result<Media> {
            let s = Mgr::RequestAsync()?.get()?.GetCurrentSession()?;
            let p = s.TryGetMediaPropertiesAsync()?.get()?;
            let playing = s.GetPlaybackInfo()?.PlaybackStatus()? == St::Playing;
            let tl = s.GetTimelineProperties()?;
            let pos = tl.Position()?.Duration as f64 / 1e7;
            let dur = (tl.EndTime()?.Duration - tl.StartTime()?.Duration) as f64 / 1e7;
            Ok(Media { title: p.Title()?.to_string(), artist: p.Artist()?.to_string(), playing, active: true, pos, dur })
        })();
        return r.unwrap_or_default();
    }
    #[cfg(not(windows))]
    Media::default()
}

#[tauri::command]
async fn get_art() -> String {
    #[cfg(windows)]
    {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use windows::{Media::Control::GlobalSystemMediaTransportControlsSessionManager as Mgr, Storage::Streams::DataReader};
        let r = (|| -> windows::core::Result<String> {
            let s = Mgr::RequestAsync()?.get()?.GetCurrentSession()?;
            let p = s.TryGetMediaPropertiesAsync()?.get()?;
            let st = p.Thumbnail()?.OpenReadAsync()?.get()?;
            let n = st.Size()? as u32;
            let rd = DataReader::CreateDataReader(&st.GetInputStreamAt(0)?)?;
            rd.LoadAsync(n)?.get()?;
            let mut b = vec![0u8; n as usize];
            rd.ReadBytes(&mut b)?;
            let kind = if b.first() == Some(&0x89) { "png" } else { "jpeg" };
            Ok(format!("data:image/{};base64,{}", kind, STANDARD.encode(b)))
        })();
        return r.unwrap_or_default();
    }
    #[cfg(not(windows))]
    String::new()
}

#[tauri::command]
async fn media_control(action: String) {
    #[cfg(windows)]
    {
        use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Mgr;
        let _ = (|| -> windows::core::Result<()> {
            let s = Mgr::RequestAsync()?.get()?.GetCurrentSession()?;
            if let Some(v) = action.strip_prefix("seek:") {
                if let Ok(sec) = v.parse::<f64>() { s.TryChangePlaybackPositionAsync((sec * 1e7) as i64)?.get()?; }
                return Ok(());
            }
            match action.as_str() {
                "toggle" => { s.TryTogglePlayPauseAsync()?.get()?; }
                "next" => { s.TrySkipNextAsync()?.get()?; }
                "prev" => { s.TrySkipPreviousAsync()?.get()?; }
                _ => {}
            }
            Ok(())
        })();
    }
    #[cfg(not(windows))]
    let _ = action;
}

// Opens a URL, URI scheme (ms-screenclip:) or file path with Windows' default handler.
#[tauri::command]
fn open_uri(uri: String) {
    if uri.trim().is_empty() || uri.len() > 500 { return; }
    #[cfg(windows)]
    let _ = std::process::Command::new("explorer").arg(uri).spawn();
    #[cfg(not(windows))]
    let _ = uri;
}

// Files currently copied in Explorer (CF_HDROP).
#[tauri::command]
fn get_clip_files() -> Vec<String> {
    #[cfg(windows)]
    {
        use clipboard_win::{formats, get_clipboard};
        return get_clipboard(formats::FileList).unwrap_or_default();
    }
    #[cfg(not(windows))]
    Vec::new()
}

// "Send to phone": a tiny LAN-only HTTP server. The URL contains a random token; only shelf files are served.
#[derive(Default)]
struct Share { files: Mutex<Vec<String>>, url: Mutex<String> }

#[tauri::command]
fn start_share(st: State<Arc<Share>>, paths: Vec<String>) -> String {
    *st.files.lock().unwrap() = paths;
    let mut url = st.url.lock().unwrap();
    if url.is_empty() {
        let Ok(l) = TcpListener::bind("0.0.0.0:0") else { return String::new() };
        let port = l.local_addr().map(|a| a.port()).unwrap_or(0);
        let token = format!("{:x}", std::collections::hash_map::RandomState::new().build_hasher().finish());
        let ip = UdpSocket::bind("0.0.0.0:0").and_then(|s| { s.connect("8.8.8.8:80")?; s.local_addr() })
            .map(|a| a.ip().to_string()).unwrap_or_else(|_| "127.0.0.1".into());
        *url = format!("http://{}:{}/{}/", ip, port, token);
        let (sh, t) = (st.inner().clone(), token);
        std::thread::spawn(move || { for s in l.incoming().flatten() { serve(s, &sh, &t); } });
    }
    url.clone()
}

#[tauri::command]
fn stop_share(st: State<Arc<Share>>) { st.files.lock().unwrap().clear(); }

fn serve(mut s: TcpStream, sh: &Share, token: &str) {
    let _ = s.set_read_timeout(Some(Duration::from_secs(2)));
    let mut buf = [0u8; 2048];
    let n = s.read(&mut buf).unwrap_or(0);
    let req = String::from_utf8_lossy(&buf[..n]).to_string();
    let path = req.split_whitespace().nth(1).unwrap_or("");
    let Some(rest) = path.strip_prefix(&format!("/{}/", token)) else {
        let _ = s.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
        return;
    };
    let files = sh.files.lock().unwrap().clone();
    if let Some(i) = rest.strip_prefix("f/").and_then(|x| x.parse::<usize>().ok()) {
        if let Some(p) = files.get(i) {
            if let Ok(data) = std::fs::read(p) {
                let name = std::path::Path::new(p).file_name().map(|n| n.to_string_lossy().replace('"', "")).unwrap_or_default();
                let h = format!("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=\"{}\"\r\nContent-Length: {}\r\n\r\n", name, data.len());
                let _ = s.write_all(h.as_bytes()).and_then(|_| s.write_all(&data));
                return;
            }
        }
        let _ = s.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
        return;
    }
    let mut html = String::from("<meta name=viewport content='width=device-width,initial-scale=1'><body style='font:18px system-ui;padding:20px'><h2>Shelf</h2>");
    for (i, p) in files.iter().enumerate() {
        let n = std::path::Path::new(p).file_name().map(|n| n.to_string_lossy().replace('<', "&lt;")).unwrap_or_default();
        html.push_str(&format!("<p><a href='f/{}'>{}</a></p>", i, n));
    }
    let h = format!("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}", html.len(), html);
    let _ = s.write_all(h.as_bytes());
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Expanded(Arc::new(AtomicBool::new(false)), Arc::new(AtomicU32::new(280))))
        .manage(Arc::new(Share::default()))
        .invoke_handler(tauri::generate_handler![set_expanded, get_media, get_art, media_control, open_uri, get_clip_files, start_share, stop_share])
        .setup(|app| {
            let win = app.get_webview_window("main").unwrap();
            if let Ok(Some(mon)) = win.primary_monitor() {
                let w = win.outer_size()?.width as i32;
                let x = mon.position().x + (mon.size().width as i32 - w) / 2;
                win.set_position(PhysicalPosition::new(x, mon.position().y))?;
            }
            win.set_ignore_cursor_events(true)?;
            let exp = app.state::<Expanded>().0.clone();
            let cwv = app.state::<Expanded>().1.clone();
            // The window is click-through; poll the cursor to detect hover over the island.
            std::thread::spawn(move || {
                let mut last = false;
                loop {
                    std::thread::sleep(Duration::from_millis(30));
                    let (Ok(c), Ok(p), Ok(sz)) = (win.cursor_position(), win.outer_position(), win.outer_size()) else { continue };
                    let sf = win.scale_factor().unwrap_or(1.0);
                    let lx = (c.x - p.x as f64) / sf;
                    let ly = (c.y - p.y as f64) / sf;
                    let ww = sz.width as f64 / sf;
                    let (w, h) = if exp.load(Ordering::Relaxed) { (640.0, 270.0) } else { (cwv.load(Ordering::Relaxed) as f64, 44.0) };
                    let inside = lx >= (ww - w) / 2.0 && lx <= (ww + w) / 2.0 && ly >= 0.0 && ly <= h;
                    if inside != last {
                        last = inside;
                        let _ = win.set_ignore_cursor_events(!inside);
                        let _ = win.emit("hover", inside);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Notch");
}
