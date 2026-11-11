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

#[cfg(windows)]
mod audio {
    use windows::core::Result;
    use windows::Win32::Media::Audio::{eConsole, Endpoints::{IAudioEndpointVolume, IAudioMeterInformation}, EDataFlow, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    fn dev(flow: EDataFlow) -> Result<IMMDevice> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let e: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            e.GetDefaultAudioEndpoint(flow, eConsole)
        }
    }
    pub fn vol(flow: EDataFlow) -> Result<IAudioEndpointVolume> { unsafe { dev(flow)?.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) } }
    pub fn meter(flow: EDataFlow) -> Result<IAudioMeterInformation> { unsafe { dev(flow)?.Activate::<IAudioMeterInformation>(CLSCTX_ALL, None) } }
}

#[cfg(windows)]
fn run(cmd: &str, args: &[&str]) -> String {
    use std::os::windows::process::CommandExt;
    std::process::Command::new(cmd).args(args).creation_flags(0x08000000).output()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()).unwrap_or_default()
}

#[derive(Serialize, Default)]
struct Audio { out_vol: f32, out_mute: bool, in_mute: bool, in_level: f32, has_mic: bool }

#[tauri::command]
async fn get_audio() -> Audio {
    #[cfg(windows)]
    {
        use windows::Win32::Media::Audio::{eCapture, eRender};
        let mut a = Audio::default();
        if let Ok(v) = audio::vol(eRender) {
            a.out_vol = unsafe { v.GetMasterVolumeLevelScalar() }.unwrap_or(0.0);
            a.out_mute = unsafe { v.GetMute() }.map(|b| b.as_bool()).unwrap_or(false);
        }
        if let Ok(v) = audio::vol(eCapture) {
            a.has_mic = true;
            a.in_mute = unsafe { v.GetMute() }.map(|b| b.as_bool()).unwrap_or(false);
        }
        if let Ok(m) = audio::meter(eCapture) { a.in_level = unsafe { m.GetPeakValue() }.unwrap_or(0.0); }
        return a;
    }
    #[cfg(not(windows))]
    Audio::default()
}

#[tauri::command]
async fn set_out_vol(v: f32) {
    #[cfg(windows)]
    if let Ok(e) = audio::vol(windows::Win32::Media::Audio::eRender) {
        unsafe { let _ = e.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), std::ptr::null()); }
    }
    #[cfg(not(windows))]
    let _ = v;
}

#[tauri::command]
async fn set_mute(mic: bool, m: bool) {
    #[cfg(windows)]
    {
        use windows::Win32::{Foundation::BOOL, Media::Audio::{eCapture, eRender}};
        if let Ok(e) = audio::vol(if mic { eCapture } else { eRender }) { unsafe { let _ = e.SetMute(BOOL::from(m), std::ptr::null()); } }
    }
    #[cfg(not(windows))]
    let _ = (mic, m);
}

#[tauri::command]
async fn test_sound() {
    #[cfg(windows)]
    { run("powershell", &["-NoProfile", "-Command", "[System.Media.SystemSounds]::Asterisk.Play(); Start-Sleep -Milliseconds 800"]); }
}

#[derive(Serialize, Default)]
struct Radios { wifi: Option<bool>, bt: Option<bool> }

#[tauri::command]
async fn get_radios() -> Radios {
    #[cfg(windows)]
    {
        use windows::Devices::Radios::{Radio, RadioKind, RadioState};
        let r = (|| -> windows::core::Result<Radios> {
            let mut o = Radios::default();
            for r in Radio::GetRadiosAsync()?.get()? {
                let on = r.State()? == RadioState::On;
                match r.Kind()? { RadioKind::WiFi => o.wifi = Some(on), RadioKind::Bluetooth => o.bt = Some(on), _ => {} }
            }
            Ok(o)
        })();
        return r.unwrap_or_default();
    }
    #[cfg(not(windows))]
    Radios::default()
}

#[tauri::command]
async fn set_radio(bt: bool, on: bool) {
    #[cfg(windows)]
    {
        use windows::Devices::Radios::{Radio, RadioKind, RadioState};
        let _ = (|| -> windows::core::Result<()> {
            let _ = Radio::RequestAccessAsync()?.get();
            for r in Radio::GetRadiosAsync()?.get()? {
                if r.Kind()? == if bt { RadioKind::Bluetooth } else { RadioKind::WiFi } {
                    r.SetStateAsync(if on { RadioState::On } else { RadioState::Off })?.get()?;
                }
            }
            Ok(())
        })();
    }
    #[cfg(not(windows))]
    let _ = (bt, on);
}

// Brightness only works on built-in laptop displays (WMI). Returns -1 when unsupported.
#[tauri::command]
async fn get_brightness() -> i32 {
    #[cfg(windows)]
    return run("powershell", &["-NoProfile", "-Command", "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness"]).parse().unwrap_or(-1);
    #[cfg(not(windows))]
    -1
}

#[tauri::command]
async fn set_brightness(v: i32) {
    #[cfg(windows)]
    {
        let s = format!("Invoke-CimMethod -InputObject (Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods) -MethodName WmiSetBrightness -Arguments @{{Timeout=1;Brightness={}}}", v.clamp(0, 100));
        run("powershell", &["-NoProfile", "-Command", &s]);
    }
    #[cfg(not(windows))]
    let _ = v;
}

const PLANS: [(&str, &str); 3] = [("battery", "a1841308-3541-4fab-bc81-f71556f20b4a"), ("balanced", "381b4222-f694-41f0-9685-ff5bb260df2e"), ("perf", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c")];

#[tauri::command]
async fn get_power() -> String {
    #[cfg(windows)]
    {
        let o = run("powercfg", &["/getactivescheme"]).to_lowercase();
        return PLANS.iter().find(|(_, g)| o.contains(g)).map(|(k, _)| k.to_string()).unwrap_or_default();
    }
    #[cfg(not(windows))]
    String::new()
}

#[tauri::command]
async fn set_power(mode: String) {
    #[cfg(windows)]
    if let Some((_, g)) = PLANS.iter().find(|(k, _)| *k == mode) { run("powercfg", &["/setactive", g]); }
    #[cfg(not(windows))]
    let _ = mode;
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(Expanded(Arc::new(AtomicBool::new(false)), Arc::new(AtomicU32::new(280))))
        .manage(Arc::new(Share::default()))
        .invoke_handler(tauri::generate_handler![set_expanded, get_media, get_art, media_control, open_uri, get_clip_files, start_share, stop_share, get_audio, set_out_vol, set_mute, test_sound, get_radios, set_radio, get_brightness, set_brightness, get_power, set_power])
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
                    let (w, h) = if exp.load(Ordering::Relaxed) { (640.0, 270.0) } else { (cwv.load(Ordering::Relaxed) as f64, 56.0) };
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
