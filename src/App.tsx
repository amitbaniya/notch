import { CSSProperties, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipView, useClipHistory, Clip } from "./Clip";
import { Shelf } from "./Shelf";
import { Call } from "./Call";
import { Progress, Bar } from "./Progress";
import { Settings } from "./Settings";
import type { Cfg } from "./types";
import { Controls } from "./Controls";

type Media = { title: string; artist: string; playing: boolean; active: boolean; pos: number; dur: number };
type Tab = "music" | "sites" | "notify" | "chat" | "shelf" | "clip" | "widgets" | "controls" | "tools" | "call" | "settings";
type Item = { t: string; d: boolean };

const SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 } as const;
const ICONS: Record<Tab, string> = {
  music: "M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z",
  sites: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  notify: "M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20h4",
  chat: "M4 5h16v11H9l-5 4z",
  shelf: "M3 6h6l2 2h10v11H3z",
  clip: "M8 4h8v3H8zM6 5h12v16H6z",
  widgets: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  controls: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4",
  tools: "M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01",
  call: "M4 14v-2a8 8 0 0116 0v2M4 14h3v5H4zM17 14h3v5h-3z",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
};
const TABS = Object.keys(ICONS) as Tab[];
const SOON: Partial<Record<Tab, string>> = {
  sites: "Sites arrive in phase 4", notify: "Notifications arrive in phase 4",
};

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const avgColor = (src: string) => new Promise<string>((res) => {
  const im = new Image();
  im.onload = () => {
    const c = document.createElement("canvas"); c.width = c.height = 8;
    const x = c.getContext("2d")!; x.drawImage(im, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; res(`rgb(${r / n | 0},${g / n | 0},${b / n | 0})`);
  };
  im.onerror = () => res(""); im.src = src;
});

function useSmoothPos(m: Media, at: number) {
  const base = useRef({ pos: 0, t: Date.now(), title: "", until: 0 });
  const [pos, setPos] = useState(0);
  // Resync to the player's reported position only when it really differs (seek, new track, resume),
  // so the 1s polling never makes the bar jump.
  useEffect(() => {
    const b = base.current, now = Date.now();
    if (now < b.until) return;
    const predicted = b.pos + (m.playing ? (now - b.t) / 1000 : 0);
    if (!m.playing || m.title !== b.title || Math.abs(m.pos - predicted) > 2.5) base.current = { pos: m.pos, t: at, title: m.title, until: 0 };
  }, [m.pos, m.playing, m.title, at]);
  useEffect(() => {
    const read = () => Math.min(m.dur || Infinity, base.current.pos + (m.playing ? (Date.now() - base.current.t) / 1000 : 0));
    if (!m.playing) { setPos(read()); return; }
    let raf = 0;
    const loop = () => { setPos(read()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [m.playing, m.dur, m.pos, m.title, at]);
  const jump = (s: number) => { base.current = { pos: s, t: Date.now(), title: m.title, until: Date.now() + 1500 }; setPos(s); };
  return [pos, jump] as const;
}

function Music({ m, at, art, bar }: { m: Media; at: number; art: string; bar: Bar }) {
  const [pos, jump] = useSmoothPos(m, at);
  const c = (a: string) => invoke("media_control", { action: a });
  if (!m.active) return <div className="empty">Nothing playing. Start music in any app.</div>;
  const f = m.dur ? Math.min(1, pos / m.dur) : 0;
  return (
    <div className="music">
      <div className="art">{art ? <img src={art} alt="" /> : <span>♪</span>}</div>
      <div className="meta"><div className="title">{m.title || "Unknown"}</div><div className="sub">{m.artist || "Unknown artist"}</div></div>
      <div className="ctrls">
        <button onClick={() => c("prev")} aria-label="Previous">⏮</button>
        <button className="big" onClick={() => c("toggle")} aria-label="Play or pause">{m.playing ? "⏸" : "▶"}</button>
        <button onClick={() => c("next")} aria-label="Next">⏭</button>
      </div>
      <Progress kind={bar} frac={f} seed={m.title} onSeek={(x) => { if (m.dur) { jump(x * m.dur); c(`seek:${x * m.dur}`); } }} />
      <div className="times"><span>{mmss(pos)}</span><span>-{mmss(m.dur - pos)}</span></div>
    </div>
  );
}

const WX = (c: number) => (c === 0 ? ["☀️", "Clear"] : c < 4 ? ["⛅", "Cloudy"] : c < 50 ? ["🌫️", "Fog"] : c < 70 ? ["🌧️", "Rain"] : c < 80 ? ["❄️", "Snow"] : c < 90 ? ["🌦️", "Showers"] : ["⛈️", "Storm"]);

function Widgets({ cfg }: { cfg: Cfg }) {
  const [now, setNow] = useState(new Date());
  const [items, setItems] = useState<Item[]>(() => load("todo", []));
  const [v, setV] = useState("");
  const [wx, setWx] = useState<{ t: number; c: number; hi: number; lo: number } | null>(null);
  const [bat, setBat] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(i); }, []);
  useEffect(() => save("todo", items), [items]);
  useEffect(() => {
    let dead = false;
    const run = async () => {
      try {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cfg.city)}&count=1`)).json();
        const p = g.results?.[0]; if (!p) return;
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`)).json();
        if (!dead) setWx({ t: w.current.temperature_2m, c: w.current.weather_code, hi: w.daily.temperature_2m_max[0], lo: w.daily.temperature_2m_min[0] });
      } catch {}
    };
    run(); const i = setInterval(run, 900000); return () => { dead = true; clearInterval(i); };
  }, [cfg.city]);
  useEffect(() => {
    (navigator as any).getBattery?.().then((b: any) => {
      const u = () => setBat({ level: Math.round(b.level * 100), charging: b.charging });
      u(); b.addEventListener("levelchange", u); b.addEventListener("chargingchange", u);
    }).catch(() => {});
  }, []);
  let tzTime = "—"; try { tzTime = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: cfg.tz }); } catch {}
  const [icon, label] = wx ? WX(wx.c) : ["", ""];
  return (
    <div className="grid">
      <div className="card2"><div className="row"><span className="bigt">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span><span className="acc">{now.toLocaleDateString([], { weekday: "short" })}</span></div>
        <div className="row sub"><span>{cfg.tz.split("/").pop()?.replace("_", " ")}</span><span>{tzTime}</span></div></div>
      <div className="card2"><div className="row"><span>To do <b className="acc">{items.filter((i) => !i.d).length}</b></span></div>
        <ul>{items.slice(0, 2).map((it, i) => (
          <li key={i} className={it.d ? "done" : ""} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, d: !x.d } : x)))}
            onContextMenu={(e) => { e.preventDefault(); setItems(items.filter((_, j) => j !== i)); }}><i />{it.t}</li>))}</ul>
        <input value={v} placeholder="Add task" onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { setItems([{ t: v.trim(), d: false }, ...items]); setV(""); } }} /></div>
      <div className="card2 wx">{wx ? <><div className="row"><span className="bigt">{icon} {Math.round(wx.t)}°</span></div>
        <div className="row sub"><span>{label} · {cfg.city}</span><span>H {Math.round(wx.hi)}° L {Math.round(wx.lo)}°</span></div></> : <div className="sub">Weather for {cfg.city}…</div>}</div>
      <div className="card2"><div className="row"><span className="sub">This PC</span>{bat ? <><span className="bar"><i style={{ width: `${bat.level}%` }} /></span><b className="ok">{bat.level}%{bat.charging ? " ⚡" : ""}</b></> : <span className="sub">No battery</span>}</div></div>
    </div>
  );
}

function Tools() {
  const [slots, setSlots] = useState<string[]>(() => load("slots", Array(6).fill("")));
  const [edit, setEdit] = useState(-1); const [v, setV] = useState("");
  const open = (u: string) => invoke("open_uri", { uri: u });
  const set = (i: number, val: string) => { const n = slots.slice(); n[i] = val; setSlots(n); save("slots", n); };
  return (
    <div className="tools">
      <div className="trow">
        <button onClick={() => open("ms-screenclip:")}>📷 Screenshot</button>
        <button onClick={() => open("ms-screenclip:")}>✂️ Snip</button>
        <button onClick={() => open("ms-gamebar:")}>🔴 Record</button>
      </div>
      <div className="slots">{slots.map((s, i) => edit === i ? (
        <input key={i} autoFocus value={v} placeholder="URL or app path" onChange={(e) => setV(e.target.value)} onBlur={() => setEdit(-1)}
          onKeyDown={(e) => { if (e.key === "Enter") { set(i, v.trim()); setEdit(-1); } if (e.key === "Escape") setEdit(-1); }} />
      ) : s ? (
        <button key={i} className="slot" onClick={() => open(s)} onContextMenu={(e) => { e.preventDefault(); set(i, ""); }} title="Right-click to remove">
          {s.replace(/^https?:\/\/(www\.)?/, "").split(/[\\/]/).filter(Boolean).pop()?.slice(0, 12)}</button>
      ) : <button key={i} className="slot add" onClick={() => { setV(""); setEdit(i); }}>+<small>Add</small></button>)}</div>
    </div>
  );
}

export default function App() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("music");
  const [cfg, setCfg] = useState<Cfg>(() => ({ city: "London", tz: "Asia/Tokyo", style: "pill", surface: "peach", bar: "wave", viz: "bars", bg: "album", ...load<Partial<Cfg>>("cfg", {}) }));
  const [m, setM] = useState<Media>({ title: "", artist: "", playing: false, active: false, pos: 0, dur: 0 });
  const [at, setAt] = useState(Date.now());
  const [art, setArt] = useState(""); const [col, setCol] = useState("");
  const clip = useClipHistory();
  const [snips, setSnips] = useState<Clip[]>(() => load("snips", []));
  const [shelf, setShelf] = useState<string[]>(() => load("shelf", []));
  const t = useRef<number>();

  useEffect(() => { save("cfg", cfg); document.documentElement.dataset.surface = cfg.surface; }, [cfg]);
  useEffect(() => {
    const un = listen<boolean>("hover", (e) => { clearTimeout(t.current); t.current = window.setTimeout(() => setOpen(e.payload), e.payload ? 120 : 300); });
    return () => { un.then((f) => f()); };
  }, []);
  useEffect(() => { invoke("set_expanded", { v: open, cw: cfg.style === "dot" ? 44 : cfg.style === "full" ? 360 : 280, top: cfg.style === "pill" ? 0 : 10 }); }, [open, cfg.style]);
  useEffect(() => {
    const poll = () => invoke<Media>("get_media").then((x) => { setM(x); setAt(Date.now()); }).catch(() => {});
    poll(); const i = setInterval(poll, open ? 1000 : 2500); return () => clearInterval(i);
  }, [open]);
  useEffect(() => {
    if (!m.title) { setArt(""); setCol(""); return; }
    invoke<string>("get_art").then((a) => { setArt(a); if (a) avgColor(a).then(setCol); else setCol(""); }).catch(() => {});
  }, [m.title, m.artist]);
  useEffect(() => save("snips", snips), [snips]);
  useEffect(() => save("shelf", shelf), [shelf]);
  useEffect(() => {
    const un = listen<{ paths: string[] }>("tauri://drag-drop", (e) => { setShelf((s) => Array.from(new Set([...s, ...e.payload.paths]))); setTab("shelf"); });
    return () => { un.then((f) => f()); };
  }, []);

  const dot = cfg.style === "dot", full = cfg.style === "full", float = dot || full;
  let body: JSX.Element;
  if (tab === "music") body = <Music m={m} at={at} art={art} bar={cfg.bar} />;
  else if (tab === "widgets") body = <Widgets cfg={cfg} />;
  else if (tab === "tools") body = <Tools />;
  else if (tab === "settings") body = <Settings cfg={cfg} set={setCfg} />;
  else if (tab === "chat") body = (
    <div className="chatbox"><div className="card2">Chat overlay is stopped. It needs Windows notification access to read WhatsApp, Instagram and Messenger chats, which isn't built in yet.</div>
      <button className="pill" disabled>▷ Start</button></div>);
  else if (tab === "clip") body = <ClipView items={clip.items} clear={clip.clear} snips={snips} setSnips={setSnips} />;
  else if (tab === "shelf") body = <Shelf files={shelf} setFiles={setShelf} />;
  else if (tab === "call") body = <Call />;
  else if (tab === "controls") body = <Controls />;
  else body = <div className="empty">{SOON[tab]}</div>;

  return (
    <motion.div className="island" initial={false}
      animate={{ width: open ? 640 : dot ? 34 : full ? 360 : 280, height: open ? 270 : full ? 44 : 34, marginTop: float ? (open ? 10 : dot ? 6 : 8) : 0, borderTopLeftRadius: float ? (open ? 34 : dot ? 17 : 22) : 0, borderTopRightRadius: float ? (open ? 34 : dot ? 17 : 22) : 0, borderBottomLeftRadius: open ? 34 : dot ? 17 : full ? 22 : 18, borderBottomRightRadius: open ? 34 : dot ? 17 : full ? 22 : 18 }}
      transition={SPRING}>
      <div className="glow" style={{ "--art": col || "transparent", opacity: col && cfg.bg === "album" && ((open && tab === "music") || (!open && full)) ? 0.55 : 0 } as CSSProperties} />
      {!open && (
        <div className={"collapsed" + (dot ? " dot" : full ? " full" : "")}>
          {!dot && (art ? <img src={art} alt="" /> : <span />)}
          {m.playing && <div className={"bars" + (cfg.viz === "pixels" ? " px" : "")}><i /><i /><i /><i /></div>}
        </div>
      )}
      <AnimatePresence>
        {open && (
          <motion.div className="card" key="card" initial={{ opacity: 0, y: -8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: 0.08, duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            <nav className="tabs">
              {TABS.map((k) => (
                <span key={k} style={{ display: "contents" }}>
                  {k === "settings" && <b className="sep" />}
                  <button className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)} aria-label={k}><Icon d={ICONS[k]} /></button>
                </span>
              ))}
            </nav>
            <div className="body">{body}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
