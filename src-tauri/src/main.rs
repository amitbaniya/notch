#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use serde::Serialize;
use std::hash::{BuildHasher, Hasher};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{atomic::{AtomicBool, AtomicI32, AtomicU32, Ordering}, Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, PhysicalPosition, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

struct Expanded(Arc<AtomicBool>, Arc<AtomicU32>, Arc<AtomicU32>, Arc<AtomicU32>, Arc<AtomicU32>, Arc<AtomicI32>);

#[derive(Serialize, Default)]
struct Media { title: String, artist: String, playing: bool, active: bool, pos: f64, dur: f64 }

#[tauri::command]
fn set_expanded(state: State<Expanded>, v: bool, cw: f64, ch: f64, ox: f64, top: f64, s: f64) { state.4.store(ch as u32, Ordering::Relaxed); state.5.store(ox as i32, Ordering::Relaxed); state.0.store(v, Ordering::Relaxed); state.1.store(cw as u32, Ordering::Relaxed); state.2.store(top as u32, Ordering::Relaxed); state.3.store((s * 100.0) as u32, Ordering::Relaxed); }

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
            let mut pos = tl.Position()?.Duration as f64 / 1e7;
            let dur = (tl.EndTime()?.Duration - tl.StartTime()?.Duration) as f64 / 1e7;
            if playing {
                // The reported position is as of LastUpdatedTime, not now: add the time since then.
                let last = tl.LastUpdatedTime()?.UniversalTime as f64 / 1e7 - 11_644_473_600.0;
                let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64()).unwrap_or(0.0);
                let age = now - last;
                if (0.0..15.0).contains(&age) { pos += age; }
                if dur > 0.0 { pos = pos.min(dur); }
            }
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
            let kind = match (b.first(), b.get(1)) { (Some(0x89), _) => "png", (Some(0xFF), Some(0xD8)) => "jpeg", (Some(b'G'), _) => "gif", (Some(b'B'), Some(b'M')) => "bmp", (Some(b'R'), _) => "webp", _ => "jpeg" };
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
fn start_share(app: tauri::AppHandle, st: State<Arc<Share>>, paths: Vec<String>) -> String {
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
        std::thread::spawn(move || {
            for s in l.incoming().flatten() {
                let (sh, t, app) = (sh.clone(), t.clone(), app.clone());
                std::thread::spawn(move || serve(s, &sh, &t, &app));
            }
        });
    }
    url.clone()
}

#[tauri::command]
fn stop_share(st: State<Arc<Share>>) { st.files.lock().unwrap().clear(); }

const SHARE_PAGE: &str = r##"<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1b1210"><title>Notch Shelf</title><style>
:root{color-scheme:dark;--card:#ffffff12;--fg:#f4e9e4;--dim:#b9a39a;--acc:#ffb38a}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;color:var(--fg);font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;
background:radial-gradient(120% 70% at 50% -10%,#3d2621,#150d0b);padding:calc(10px + env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom))}
header{padding:20px 4px 6px}h1{margin:0;font-size:28px;letter-spacing:-.5px}.sub{color:var(--dim)}
.sec{margin:22px 0 10px;font-size:12px;letter-spacing:.12em;color:var(--dim);text-transform:uppercase}
a.card{display:flex;align-items:center;gap:14px;background:var(--card);border-radius:18px;padding:12px;text-decoration:none;color:inherit;margin-bottom:10px;border:1px solid #ffffff10}
a.card:active{background:#ffffff22}
.th{width:54px;height:54px;border-radius:13px;background:#ffffff14;display:grid;place-items:center;overflow:hidden;flex:none;font-size:11px;font-weight:700;color:var(--acc)}
.th img{width:100%;height:100%;object-fit:cover}
.meta{min-width:0;flex:1}.name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.size{color:var(--dim);font-size:13px}
.dl{flex:none;width:42px;height:42px;border-radius:50%;background:#ffffff1f;display:grid;place-items:center}
.btn{display:block;width:100%;border:0;border-radius:16px;padding:15px;font:inherit;font-weight:600;text-align:center;background:#ffffff26;color:var(--fg);margin-top:6px}
.btn.pri{background:var(--acc);color:#2a1a16}.btn:active{filter:brightness(.9)}
.empty{color:var(--dim);padding:12px 4px}
.up{background:var(--card);border-radius:14px;padding:10px 12px;margin-top:8px;font-size:14px;word-break:break-all}
.bar{height:6px;background:#ffffff1f;border-radius:3px;margin-top:6px;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--acc);transition:width .1s}
</style></head><body>
<header><h1>Notch Shelf</h1><div class="sub">__COUNT__ on your PC</div></header>
<div class="sec">On your PC</div>
__FILES__
__ALL__
<div class="sec">Send to your PC</div>
<label class="btn pri">Choose files to send<input id="pick" type="file" multiple hidden></label>
<div id="ups"></div>
<div class="sub" style="margin-top:10px;font-size:13px">Files you send are saved in Downloads\Notch and appear on your shelf.</div>
<script>
const base=location.pathname;
async function send(files){for(const f of files){const row=document.createElement("div");row.className="up";
row.innerHTML="<div></div><div class='bar'><i></i></div>";row.firstChild.textContent=f.name;document.getElementById("ups").prepend(row);
await new Promise(res=>{const x=new XMLHttpRequest();x.open("POST",base+"u?name="+encodeURIComponent(f.name));
x.upload.onprogress=e=>{if(e.lengthComputable)row.querySelector("i").style.width=(e.loaded/e.total*100)+"%"};
x.onload=()=>{row.firstChild.textContent=f.name+(x.status==200?"  - sent":"  - failed");res()};
x.onerror=()=>{row.firstChild.textContent=f.name+"  - failed";res()};x.send(f)})}}
document.getElementById("pick").onchange=e=>send(e.target.files);
async function dlAll(){for(const l of document.querySelectorAll("a.card")){const t=document.createElement("a");t.href=l.href;t.download="";document.body.appendChild(t);t.click();t.remove();await new Promise(r=>setTimeout(r,700))}}
</script></body></html>"##;

fn http(s: &mut TcpStream, status: &str, ctype: &str, extra: &str, body: &[u8]) {
    let h = format!("HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n{}\r\n", status, ctype, body.len(), extra);
    let _ = s.write_all(h.as_bytes()).and_then(|_| s.write_all(body));
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) { out.push(v); i += 3; continue; }
        }
        out.push(if b[i] == b'+' { b' ' } else { b[i] });
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn pct_encode(s: &str) -> String {
    s.bytes().map(|c| if c.is_ascii_alphanumeric() || b"-_.~".contains(&c) { (c as char).to_string() } else { format!("%{:02X}", c) }).collect()
}

fn esc(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;") }

fn human(n: u64) -> String {
    if n >= 1 << 30 { format!("{:.1} GB", n as f64 / (1u64 << 30) as f64) }
    else if n >= 1 << 20 { format!("{:.1} MB", n as f64 / (1u64 << 20) as f64) }
    else if n >= 1 << 10 { format!("{:.0} KB", n as f64 / 1024.0) }
    else { format!("{} B", n) }
}

fn send_file(s: &mut TcpStream, p: Option<&String>, attach: bool) {
    let Some(p) = p else { return http(s, "404 Not Found", "text/plain", "", b"Not found") };
    let Ok(mut f) = std::fs::File::open(p) else { return http(s, "404 Not Found", "text/plain", "", b"Not found") };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let path = std::path::Path::new(p);
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let ctype = if attach { "application/octet-stream" } else {
        match ext.as_str() { "png" => "image/png", "jpg" | "jpeg" => "image/jpeg", "gif" => "image/gif", "webp" => "image/webp", "bmp" => "image/bmp", _ => "application/octet-stream" }
    };
    let ascii: String = name.chars().map(|c| if c.is_ascii() && c != '"' && !c.is_control() { c } else { '_' }).collect();
    let extra = if attach { format!("Content-Disposition: attachment; filename=\"{}\"; filename*=UTF-8''{}\r\n", ascii, pct_encode(&name)) } else { String::new() };
    let h = format!("HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n", ctype, len, extra);
    if s.write_all(h.as_bytes()).is_ok() { let _ = std::io::copy(&mut f, s); }
}

// Phone -> PC: the page POSTs the raw file body; it is saved in Downloads\Notch and added to the shelf.
fn upload(s: &mut TcpStream, query: &str, clen: u64, already: &[u8], tmp: &mut [u8], app: &tauri::AppHandle) {
    let raw = query.split('&').find_map(|kv| kv.strip_prefix("name=")).map(pct_decode).unwrap_or_default();
    let mut name: String = raw.rsplit(|c: char| c == '/' || c == '\\').next().unwrap_or("").chars()
        .filter(|c| !c.is_control() && !"<>:\"|?*".contains(*c)).take(120).collect();
    name = name.trim().trim_matches('.').to_string();
    if name.is_empty() { name = "upload".into(); }
    if clen == 0 || clen > 8_000_000_000 { return http(s, "400 Bad Request", "text/plain", "", b"Bad size"); }
    let dir = std::env::var("USERPROFILE").map(|p| std::path::PathBuf::from(p).join("Downloads")).unwrap_or_else(|_| std::env::temp_dir()).join("Notch");
    if std::fs::create_dir_all(&dir).is_err() { return http(s, "500 Internal Server Error", "text/plain", "", b"Cannot create folder"); }
    let (stem, ext) = match name.rsplit_once('.') { Some((a, b)) if !a.is_empty() => (a.to_string(), format!(".{}", b)), _ => (name.clone(), String::new()) };
    let mut path = dir.join(&name);
    let mut k = 1;
    while path.exists() { path = dir.join(format!("{} ({}){}", stem, k, ext)); k += 1; }
    let Ok(mut f) = std::fs::File::create(&path) else { return http(s, "500 Internal Server Error", "text/plain", "", b"Cannot save") };
    let mut left = clen;
    let take = (already.len() as u64).min(left) as usize;
    let mut ok = f.write_all(&already[..take]).is_ok();
    left -= take as u64;
    while ok && left > 0 {
        let n = match s.read(tmp) { Ok(0) | Err(_) => break, Ok(n) => n };
        let m = (n as u64).min(left) as usize;
        ok = f.write_all(&tmp[..m]).is_ok();
        left -= m as u64;
    }
    drop(f);
    if ok && left == 0 {
        let _ = app.emit("shelf-add", path.to_string_lossy().to_string());
        http(s, "200 OK", "text/plain", "", b"ok");
    } else {
        let _ = std::fs::remove_file(&path);
        http(s, "400 Bad Request", "text/plain", "", b"Upload incomplete");
    }
}

fn serve(mut s: TcpStream, sh: &Share, token: &str, app: &tauri::AppHandle) {
    let _ = s.set_read_timeout(Some(Duration::from_secs(30)));
    let mut buf: Vec<u8> = Vec::new();
    let mut tmp = vec![0u8; 65536];
    let head_end = loop {
        let n = match s.read(&mut tmp) { Ok(0) | Err(_) => return, Ok(n) => n };
        buf.extend_from_slice(&tmp[..n]);
        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") { break p + 4; }
        if buf.len() > 32768 { return; }
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.lines();
    let first = lines.next().unwrap_or("").to_string();
    let clen: u64 = lines.filter_map(|l| { let (k, v) = l.split_once(':')?; if k.trim().eq_ignore_ascii_case("content-length") { v.trim().parse().ok() } else { None } }).next().unwrap_or(0);
    let mut parts = first.split_whitespace();
    let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    let Some(rest) = route.strip_prefix(&format!("/{}/", token)) else { return http(&mut s, "404 Not Found", "text/plain", "", b"Not found") };
    let files = sh.files.lock().map(|f| f.clone()).unwrap_or_default();
    if method == "POST" && rest == "u" { return upload(&mut s, query, clen, &buf[head_end..], &mut tmp, app); }
    let idx = |pre: &str| rest.strip_prefix(pre).and_then(|x| x.parse::<usize>().ok());
    if let Some(i) = idx("f/") { return send_file(&mut s, files.get(i), true); }
    if let Some(i) = idx("p/") { return send_file(&mut s, files.get(i), false); }
    let mut cards = String::new();
    for (i, p) in files.iter().enumerate() {
        let path = std::path::Path::new(p);
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        let size = std::fs::metadata(p).map(|m| human(m.len())).unwrap_or_else(|_| "missing".into());
        let thumb = if ["png", "jpg", "jpeg", "gif", "webp", "bmp"].contains(&ext.as_str()) { format!("<img src=\"p/{}\" loading=\"lazy\" alt=\"\">", i) }
            else { format!("<span>{}</span>", esc(&ext.chars().take(4).collect::<String>().to_uppercase())) };
        cards.push_str(&format!("<a class=\"card\" href=\"f/{}\" download><span class=\"th\">{}</span><span class=\"meta\"><div class=\"name\">{}</div><div class=\"size\">{}</div></span><span class=\"dl\"><svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 4v12M6 11l6 6 6-6M5 20h14\"/></svg></span></a>", i, thumb, esc(&name), size));
    }
    if cards.is_empty() { cards = "<div class=\"empty\">Nothing on the shelf yet. Drag files onto Notch on your PC.</div>".into(); }
    let all = if files.len() > 1 { "<button class=\"btn\" onclick=\"dlAll()\">Download all</button>" } else { "" };
    let page = SHARE_PAGE.replace("__COUNT__", &format!("{} file{}", files.len(), if files.len() == 1 { "" } else { "s" })).replace("__FILES__", &cards).replace("__ALL__", all);
    http(&mut s, "200 OK", "text/html; charset=utf-8", "", page.as_bytes());
}

#[cfg(windows)]
mod audio {
    use windows::core::Result;
    use windows::Win32::Media::Audio::{eConsole, Endpoints::{IAudioEndpointVolume, IAudioMeterInformation}, EDataFlow, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    pub fn dev(flow: EDataFlow) -> Result<IMMDevice> {
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

// One long-lived PowerShell process, so brightness can change in real time while dragging
// (starting a new process per change would take ~1s each).
#[cfg(windows)]
fn ps_send(line: &str) {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    static PS: std::sync::OnceLock<Mutex<Option<std::process::ChildStdin>>> = std::sync::OnceLock::new();
    let mut g = PS.get_or_init(|| Mutex::new(None)).lock().unwrap();
    for _ in 0..2 {
        if g.is_none() {
            let child = Command::new("powershell").args(["-NoProfile", "-NoLogo", "-NonInteractive", "-Command", "-"])
                .stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000).spawn();
            if let Ok(mut c) = child {
                if let Some(mut i) = c.stdin.take() {
                    let _ = writeln!(i, "$m = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods");
                    *g = Some(i);
                }
            }
        }
        if let Some(i) = g.as_mut() {
            if writeln!(i, "{}", line).and_then(|_| i.flush()).is_ok() { return; }
        }
        *g = None; // pipe broke: respawn once and retry
    }
}

#[tauri::command]
async fn set_brightness(v: i32) {
    #[cfg(windows)]
    ps_send(&format!("Invoke-CimMethod -InputObject $m -MethodName WmiSetBrightness -Arguments @{{Timeout=1;Brightness={}}} | Out-Null", v.clamp(0, 100)));
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

// Opens a site in its own window. The WebView2 profile is persistent, so logins survive restarts.
// Only the "main" window has IPC access (see capabilities), so remote pages can't call the app.
#[tauri::command]
async fn open_site(app: tauri::AppHandle, label: String, url: String, title: String) {
    if !(url.starts_with("https://") || url.starts_with("http://")) { return; }
    if let Some(w) = app.get_webview_window(&label) { let _ = w.show(); let _ = w.set_focus(); return; }
    if let Ok(u) = url.parse::<tauri::Url>() {
        let _ = tauri::WebviewWindowBuilder::new(&app, label, tauri::WebviewUrl::External(u)).title(title).inner_size(1100.0, 760.0).build();
    }
}

#[derive(Serialize, Clone)]
struct Notif { id: i64, app: String, title: String, body: String, at: i64 }

#[tauri::command]
async fn get_notifications() -> Vec<Notif> {
    #[cfg(windows)]
    return read_notifs().unwrap_or_default();
    #[cfg(not(windows))]
    Vec::new()
}

// Reads Windows' own toast database (a copy of it, read-only use). No package identity needed.
#[cfg(windows)]
fn read_notifs() -> Option<Vec<Notif>> {
    use rusqlite::types::ValueRef;
    let dir = std::path::PathBuf::from(std::env::var("LOCALAPPDATA").ok()?).join("Microsoft\\Windows\\Notifications");
    // Cheap change check: only copy and parse the database when Windows has modified it.
    static CACHE: Mutex<Option<(((u128, u64), (u128, u64)), Vec<Notif>)>> = Mutex::new(None);
    let sig = |f: &str| std::fs::metadata(dir.join(f)).ok()
        .map(|m| (m.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_nanos()).unwrap_or(0), m.len())).unwrap_or((0, 0));
    let key = (sig("wpndatabase.db"), sig("wpndatabase.db-wal"));
    if let Ok(g) = CACHE.lock() { if let Some((k, v)) = g.as_ref() { if *k == key { return Some(v.clone()); } } }
    let tmp = std::env::temp_dir().join("notch-wpn");
    std::fs::create_dir_all(&tmp).ok()?;
    for f in ["wpndatabase.db", "wpndatabase.db-wal", "wpndatabase.db-shm"] {
        let _ = std::fs::remove_file(tmp.join(f));
        let _ = std::fs::copy(dir.join(f), tmp.join(f));
    }
    let c = rusqlite::Connection::open(tmp.join("wpndatabase.db")).ok()?;
    let mut st = c.prepare("SELECT n.Id, h.PrimaryId, n.Payload, n.ArrivalTime FROM Notification n JOIN NotificationHandler h ON h.RecordId = n.HandlerId WHERE n.Type = 'toast' ORDER BY n.ArrivalTime DESC LIMIT 60").ok()?;
    let rows = st.query_map([], |r| {
        let p = match r.get_ref(2)? { ValueRef::Blob(b) | ValueRef::Text(b) => b.to_vec(), _ => Vec::new() };
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1).unwrap_or_default(), p, r.get::<_, i64>(3).unwrap_or(0)))
    }).ok()?;
    let mut out = Vec::new();
    for (id, app, payload, ft) in rows.flatten() {
        let xml = if payload.contains(&0) {
            String::from_utf16_lossy(&payload.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect::<Vec<_>>())
        } else { String::from_utf8_lossy(&payload).to_string() };
        let t = toast_texts(&xml);
        if t.is_empty() { continue; }
        out.push(Notif { id, app, title: t[0].clone(), body: t[1..].join(" "), at: ft / 10_000 - 11_644_473_600_000 });
    }
    if let Ok(mut c) = CACHE.lock() { *c = Some((key, out.clone())); }
    Some(out)
}

#[cfg(windows)]
fn toast_texts(xml: &str) -> Vec<String> {
    let mut v = Vec::new();
    let mut rest = xml;
    while let Some(i) = rest.find("<text") {
        rest = &rest[i + 5..];
        let Some(g) = rest.find('>') else { break };
        let head = &rest[..g];
        if !(head.is_empty() || head.starts_with(' ')) { continue; } // e.g. <textblock>
        let self_closed = head.ends_with('/');
        rest = &rest[g + 1..];
        if self_closed { continue; }
        let Some(e) = rest.find("</text>") else { break };
        let t = rest[..e].replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&");
        if !t.trim().is_empty() { v.push(t.trim().to_string()); }
        rest = &rest[e + 7..];
    }
    v
}

#[cfg(windows)]
use windows::core::Interface;
#[cfg(windows)]
use windows::Win32::Media::Audio::ISimpleAudioVolume;

#[cfg(windows)]
fn proc_name(pid: u32) -> String {
    use windows::core::PWSTR;
    use windows::Win32::{Foundation::CloseHandle, System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION}};
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return String::new() };
        let mut buf = [0u16; 520];
        let mut n = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut n);
        let _ = CloseHandle(h);
        if ok.is_err() { return String::new(); }
        let p = String::from_utf16_lossy(&buf[..n as usize]);
        std::path::Path::new(&p).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    }
}

// Calls f for every audio session (one per app/stream) on the default speakers.
#[cfg(windows)]
fn each_session(mut f: impl FnMut(u32, &ISimpleAudioVolume)) -> windows::core::Result<()> {
    use windows::Win32::Media::Audio::{eRender, IAudioSessionControl2, IAudioSessionManager2};
    use windows::Win32::System::Com::CLSCTX_ALL;
    unsafe {
        let m = audio::dev(eRender)?.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None)?;
        let e = m.GetSessionEnumerator()?;
        for i in 0..e.GetCount()? {
            let c = e.GetSession(i)?;
            let pid = c.cast::<IAudioSessionControl2>()?.GetProcessId()?;
            let v = c.cast::<ISimpleAudioVolume>()?;
            f(pid, &v);
        }
    }
    Ok(())
}

#[derive(Serialize)]
struct Sess { pid: u32, name: String, vol: f32, mute: bool }

#[tauri::command]
async fn get_sessions() -> Vec<Sess> {
    #[cfg(windows)]
    {
        let mut out: Vec<Sess> = Vec::new();
        let _ = each_session(|pid, v| {
            if out.iter().any(|s| s.pid == pid) { return; }
            let name = if pid == 0 { "System sounds".to_string() } else { proc_name(pid) };
            if name.is_empty() { return; }
            let vol = unsafe { v.GetMasterVolume() }.unwrap_or(1.0);
            let mute = unsafe { v.GetMute() }.map(|b| b.as_bool()).unwrap_or(false);
            out.push(Sess { pid, name, vol, mute });
        });
        out.sort_by_key(|s| s.name.to_lowercase());
        return out;
    }
    #[cfg(not(windows))]
    Vec::new()
}

#[tauri::command]
async fn set_app_volume(pid: u32, v: f32) {
    #[cfg(windows)]
    { let _ = each_session(|p, s| if p == pid { unsafe { let _ = s.SetMasterVolume(v.clamp(0.0, 1.0), std::ptr::null()); } }); }
    #[cfg(not(windows))]
    let _ = (pid, v);
}

#[tauri::command]
async fn set_app_mute(pid: u32, m: bool) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::BOOL;
        let _ = each_session(|p, s| if p == pid { unsafe { let _ = s.SetMute(BOOL::from(m), std::ptr::null()); } });
    }
    #[cfg(not(windows))]
    let _ = (pid, m);
}

// True when the foreground window covers its whole monitor and isn't the desktop, a browser or a video player.
#[cfg(windows)]
fn fullscreen_game() -> bool {
    use windows::Win32::{Foundation::RECT, Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
        UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId, IsZoomed, GWL_STYLE, WS_CAPTION, WS_THICKFRAME}};
    unsafe {
        let h = GetForegroundWindow();
        if h.is_invalid() { return false; }
        let mut r = RECT::default();
        if GetWindowRect(h, &mut r).is_err() { return false; }
        // Normal apps (Spotify, browsers...) keep a resizable frame even when maximized; fullscreen games are borderless pop-ups.
        let style = GetWindowLongPtrW(h, GWL_STYLE) as u32;
        if style & WS_CAPTION.0 == WS_CAPTION.0 || style & WS_THICKFRAME.0 != 0 || IsZoomed(h).as_bool() { return false; }
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mut mi).as_bool() { return false; }
        let m = mi.rcMonitor;
        if !(r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom) { return false; }
        let mut cls = [0u16; 64];
        let n = GetClassNameW(h, &mut cls).max(0) as usize;
        let c = String::from_utf16_lossy(&cls[..n]);
        if c == "Progman" || c == "WorkerW" || c == "Shell_TrayWnd" { return false; }
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid as *mut u32));
        let name = proc_name(pid).to_lowercase();
        !["chrome", "msedge", "firefox", "brave", "opera", "vlc", "mpv", "explorer", "notch", "applicationframehost", "code", "spotify", "discord", "slack", "teams", "ms-teams", "whatsapp", "telegram", "notion", "obsidian", "figma", "zoom", "devenv", "photoshop", "winword", "excel", "powerpnt"].contains(&name.as_str())
    }
}

struct HudWant(Arc<AtomicBool>);
#[tauri::command]
fn set_hud_want(s: State<HudWant>, v: bool) { s.0.store(v, Ordering::Relaxed); }

#[derive(Serialize, Clone)]
struct Stats { cpu: f32, ram: f32, net: f32, gpu: Option<f32>, gpu_t: Option<f32>, fps: Option<f32> }

// Every second: tell the UI whether a game is fullscreen; while the gaming bar is shown, also send stats.
// GPU numbers come from nvidia-smi (NVIDIA only). FPS isn't available yet.
fn stats_loop(app: tauri::AppHandle, want: Arc<AtomicBool>, status: Arc<Mutex<String>>) {
    #[cfg(windows)]
    {
        let mut sys = sysinfo::System::new();
        let exe = presentmon_path(&app);
        let mut fpsmon = FpsMon::new();
        let (mut last_rx, mut last_g, mut streak) = (0u64, false, 0u32);
        loop {
            std::thread::sleep(Duration::from_secs(1));
            streak = if fullscreen_game() { streak + 1 } else { 0 };
            let g = streak >= 2; // must hold for 2 seconds, so brief fullscreen windows don't flash the bar
            if g != last_g { last_g = g; let _ = app.emit("gaming", g); }
            if !want.load(Ordering::Relaxed) {
                last_rx = 0;
                fpsmon.stop();
                if exe.is_none() { if let Ok(mut s) = status.lock() { *s = "missing".into(); } }
                continue;
            }
            sys.refresh_cpu_usage();
            sys.refresh_memory();
            let ram = if sys.total_memory() > 0 { sys.used_memory() as f32 / sys.total_memory() as f32 * 100.0 } else { 0.0 };
            let rx: u64 = sysinfo::Networks::new_with_refreshed_list().iter().map(|(_, d)| d.total_received()).sum();
            let net = if last_rx > 0 { rx.saturating_sub(last_rx) as f32 * 8.0 / 1e6 } else { 0.0 };
            last_rx = rx;
            let o = run("nvidia-smi", &["--query-gpu=utilization.gpu,temperature.gpu", "--format=csv,noheader,nounits"]);
            let mut p = o.split(',').map(|x| x.trim().parse::<f32>().ok());
            let (gpu, gpu_t) = (p.next().flatten(), p.next().flatten());
            // FPS is only measured while a fullscreen game is detected, so there is no cost on the desktop.
            let (fps, st) = fpsmon.tick(exe.as_deref(), if last_g { foreground_pid() } else { None });
            if let Ok(mut s) = status.lock() { *s = st.to_string(); }
            let _ = app.emit("stats", Stats { cpu: sys.global_cpu_usage(), ram, net, gpu, gpu_t, fps });
        }
    }
    #[cfg(not(windows))]
    { let _ = (app, want, status); }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) { app.exit(0); }

// Windows' clipboard change counter: lets the app skip reading the clipboard when nothing was copied.
#[tauri::command]
fn clip_seq() -> u32 {
    #[cfg(windows)]
    return clipboard_win::seq_num().map(|n| n.get()).unwrap_or(0);
    #[cfg(not(windows))]
    0
}

struct FpsStatus(Arc<Mutex<String>>);

#[cfg(windows)]
static FPS_ACCESS: Mutex<Option<(std::time::Instant, String)>> = Mutex::new(None);

// Whether this account may read frame timings: "active" (already works), "pending" (added to the group, needs sign-out/in) or "none".
#[tauri::command]
async fn fps_access() -> String {
    #[cfg(windows)]
    {
        if let Ok(g) = FPS_ACCESS.lock() { if let Some((t, v)) = g.as_ref() { if t.elapsed() < Duration::from_secs(20) { return v.clone(); } } }
        let groups = run("whoami", &["/groups", "/fo", "csv", "/nh"]);
        let v: String = (if groups.contains("S-1-5-32-559") || groups.contains("S-1-16-12288") { "active" } else {
            let me = run("whoami", &[]).to_lowercase();
            let members = run("powershell", &["-NoProfile", "-Command", "(Get-LocalGroupMember -SID S-1-5-32-559 -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ';'"]).to_lowercase();
            if !me.is_empty() && members.split(';').any(|m| m.trim() == me) { "pending" } else { "none" }
        }).to_string();
        if let Ok(mut g) = FPS_ACCESS.lock() { *g = Some((std::time::Instant::now(), v.clone())); }
        return v;
    }
    #[cfg(not(windows))]
    String::from("none")
}

// "ok" | "idle" | "denied" | "missing"
#[tauri::command]
fn fps_status(s: State<FpsStatus>) -> String { s.0.lock().map(|x| x.clone()).unwrap_or_default() }

// Reading frame timings needs permission to Windows' graphics event trace. One-time fix: add this user to the
// "Performance Log Users" group (asks for administrator once; takes effect after signing out and in).
#[tauri::command]
async fn enable_fps_access() {
    #[cfg(windows)]
    {
        let me = run("whoami", &[]);
        if me.is_empty() { return; }
        let inner = format!("Add-LocalGroupMember -SID S-1-5-32-559 -Member '{}' -ErrorAction SilentlyContinue", me.replace('\'', ""));
        let outer = format!("Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoProfile','-Command','{}'", inner.replace('\'', "''"));
        run("powershell", &["-NoProfile", "-Command", &outer]);
        if let Ok(mut g) = FPS_ACCESS.lock() { *g = None; }
    }
}

#[cfg(windows)]
fn presentmon_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    let mut c: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(r) = app.path().resource_dir() { c.push(r.join("resources").join("PresentMon.exe")); c.push(r.join("PresentMon.exe")); }
    if let Ok(e) = std::env::current_exe() {
        if let Some(d) = e.parent() { c.push(d.join("PresentMon.exe")); c.push(d.join("resources").join("PresentMon.exe")); }
    }
    c.push(std::path::PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/PresentMon.exe")));
    c.into_iter().find(|p| p.exists())
}

#[cfg(windows)]
fn foreground_pid() -> Option<u32> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};
    unsafe {
        let h = GetForegroundWindow();
        if h.is_invalid() { return None; }
        let mut pid = 0u32;
        GetWindowThreadProcessId(h, Some(&mut pid as *mut u32));
        if pid == 0 { return None; }
        let n = proc_name(pid).to_lowercase();
        if ["explorer", "notch", "searchhost", "shellexperiencehost", "startmenuexperiencehost", "textinputhost", "applicationframehost", "dwm"].contains(&n.as_str()) { None } else { Some(pid) }
    }
}

// Runs Intel's PresentMon for the game that is in front and counts the frames it reports per second.
#[cfg(windows)]
struct FpsMon {
    child: Option<std::process::Child>,
    pid: u32,
    denied: bool,
    frames: Arc<Mutex<std::collections::VecDeque<std::time::Instant>>>,
}

#[cfg(windows)]
impl FpsMon {
    fn new() -> Self { FpsMon { child: None, pid: 0, denied: false, frames: Arc::new(Mutex::new(std::collections::VecDeque::new())) } }

    fn stop(&mut self) {
        if let Some(mut c) = self.child.take() { let _ = c.kill(); let _ = c.wait(); }
        self.pid = 0;
        self.denied = false;
        if let Ok(mut f) = self.frames.lock() { f.clear(); }
    }

    fn tick(&mut self, exe: Option<&std::path::Path>, pid: Option<u32>) -> (Option<f32>, &'static str) {
        use std::io::BufRead;
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};
        let Some(exe) = exe else { return (None, "missing") };
        let Some(pid) = pid else { self.stop(); return (None, "idle") };
        if pid != self.pid {
            self.stop();
            let spawned = Command::new(exe)
                .args(["--process_id", &pid.to_string(), "--output_stdout", "--stop_existing_session", "--terminate_on_proc_exit", "--session_name", "notch_fps"])
                .stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).creation_flags(0x08000000).spawn();
            self.pid = pid;
            match spawned {
                Ok(mut c) => {
                    if let Some(out) = c.stdout.take() {
                        let frames = self.frames.clone();
                        std::thread::spawn(move || {
                            for line in std::io::BufReader::new(out).lines().map_while(Result::ok) {
                                // one CSV row per presented frame; the first line is the header
                                if line.matches(',').count() >= 3 && !line.starts_with("Application") {
                                    if let Ok(mut f) = frames.lock() { f.push_back(std::time::Instant::now()); while f.len() > 2000 { f.pop_front(); } }
                                }
                            }
                        });
                    }
                    self.child = Some(c);
                }
                Err(_) => self.denied = true,
            }
        }
        let mut exited = false;
        if let Some(c) = self.child.as_mut() { if let Ok(Some(_)) = c.try_wait() { exited = true; } }
        let now = std::time::Instant::now();
        let n = match self.frames.lock() {
            Ok(mut f) => { while f.front().map_or(false, |t| now.duration_since(*t) > Duration::from_secs(1)) { f.pop_front(); } f.len() }
            Err(_) => 0,
        };
        if exited { self.child = None; if n == 0 { self.denied = true; } }
        if n > 0 { (Some(n as f32), "ok") } else if self.denied { (None, "denied") } else { (None, "idle") }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed { let _ = app.emit("toggle-notch", ()); }
        }).build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(Expanded(Arc::new(AtomicBool::new(false)), Arc::new(AtomicU32::new(280)), Arc::new(AtomicU32::new(0)), Arc::new(AtomicU32::new(100)), Arc::new(AtomicU32::new(56)), Arc::new(AtomicI32::new(0))))
        .manage(Arc::new(Share::default()))
        .manage(HudWant(Arc::new(AtomicBool::new(false))))
        .manage(FpsStatus(Arc::new(Mutex::new(String::from("idle")))))
        .invoke_handler(tauri::generate_handler![set_expanded, get_media, get_art, media_control, open_uri, get_clip_files, start_share, stop_share, get_audio, set_out_vol, set_mute, test_sound, get_radios, set_radio, get_brightness, set_brightness, get_power, set_power, open_site, get_notifications, get_sessions, set_app_volume, set_app_mute, set_hud_want, quit_app, clip_seq, fps_status, enable_fps_access, fps_access])
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
            let topv = app.state::<Expanded>().2.clone();
            let sv = app.state::<Expanded>().3.clone();
            let chv = app.state::<Expanded>().4.clone();
            let oxv = app.state::<Expanded>().5.clone();
            let _ = app.global_shortcut().register("ctrl+alt+n");
            // The window is click-through; poll the cursor to detect hover over the island.
            std::thread::spawn(move || {
                let mut last = false;
                let mut nap = 30u64;
                loop {
                    std::thread::sleep(Duration::from_millis(nap));
                    let (Ok(c), Ok(p), Ok(sz)) = (win.cursor_position(), win.outer_position(), win.outer_size()) else { continue };
                    let sf = win.scale_factor().unwrap_or(1.0);
                    let lx = (c.x - p.x as f64) / sf;
                    let ly = (c.y - p.y as f64) / sf;
                    let ww = sz.width as f64 / sf;
                    let (w, h) = if exp.load(Ordering::Relaxed) { (640.0 * sv.load(Ordering::Relaxed) as f64 / 100.0, 270.0 * sv.load(Ordering::Relaxed) as f64 / 100.0 + topv.load(Ordering::Relaxed) as f64) } else { (cwv.load(Ordering::Relaxed) as f64, chv.load(Ordering::Relaxed) as f64) };
                    let ox = if exp.load(Ordering::Relaxed) { 0.0 } else { oxv.load(Ordering::Relaxed) as f64 };
                    let inside = lx >= (ww - w) / 2.0 + ox && lx <= (ww + w) / 2.0 + ox && ly >= 0.0 && ly <= h;
                    nap = if inside || (ly > -80.0 && ly < 340.0) { 30 } else { 100 };
                    if inside != last {
                        last = inside;
                        let _ = win.set_ignore_cursor_events(!inside);
                        let _ = win.emit("hover", inside);
                    }
                }
            });
            let (h2, want, fst) = (app.handle().clone(), app.state::<HudWant>().0.clone(), app.state::<FpsStatus>().0.clone());
            std::thread::spawn(move || stats_loop(h2, want, fst));
            Ok(())
        })
        // Alt+F4 (or any close request) must not quit the main island; Settings > Quit exits instead. Site windows close normally.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event { api.prevent_close(); }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Notch");
}
