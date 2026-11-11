import { CSSProperties, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipView, useClipHistory, Clip } from "./Clip";
import { Shelf } from "./Shelf";
import { AudioTab } from "./Audio";
import { Controls } from "./Controls";
import { Progress, Bar } from "./Progress";
import { Settings } from "./Settings";
import { Sites } from "./Sites";
import { Notifications, useNotifs, hue, appName, Notif } from "./Notifs";
import { I, IconName } from "./icons";
import type { Cfg } from "./types";

type Media = { title: string; artist: string; playing: boolean; active: boolean; pos: number; dur: number };
type Stats = { cpu: number; ram: number; net: number; gpu: number | null; gpu_t: number | null; fps: number | null };
type Tab = "music" | "sites" | "notify" | "shelf" | "clip" | "controls" | "tools" | "audio" | "settings";

const SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 } as const;
const TABS: [Tab, IconName][] = [["music", "music"], ["sites", "globe"], ["notify", "bell"], ["shelf", "folder"], ["clip", "clip"], ["controls", "sliders"], ["tools", "grid"], ["audio", "headphones"], ["settings", "gear"]];

const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
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

// The player reports a position that can be stale, so we never jump or run backwards: a small error is
// absorbed by nudging the playback rate (0.7x-1.3x); only a seek or a new track snaps the bar.
function useSmoothPos(m: Media, at: number) {
  const base = useRef({ pos: 0, t: Date.now(), rate: 1, title: "", until: 0 });
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const b = base.current, n = Date.now();
    if (n < b.until) return;
    const predicted = b.pos + (m.playing ? ((n - b.t) / 1000) * b.rate : 0);
    const err = m.pos - predicted;
    if (!m.playing || m.title !== b.title || Math.abs(err) > 1.5) base.current = { pos: m.pos, t: n, rate: 1, title: m.title, until: 0 };
    else base.current = { pos: predicted, t: n, rate: Math.min(1.3, Math.max(0.7, 1 + err * 0.3)), title: m.title, until: 0 };
  }, [m.pos, m.playing, m.title, at]);
  useEffect(() => {
    const read = () => Math.min(m.dur || Infinity, base.current.pos + (m.playing ? ((Date.now() - base.current.t) / 1000) * base.current.rate : 0));
    if (!m.playing) { setPos(read()); return; }
    let raf = 0;
    const loop = () => { setPos(read()); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [m.playing, m.dur, m.pos, m.title, at]);
  const jump = (s: number) => { base.current = { pos: s, t: Date.now(), rate: 1, title: m.title, until: Date.now() + 1500 }; setPos(s); };
  return [pos, jump] as const;
}

function Music({ m, at, art, bar }: { m: Media; at: number; art: string; bar: Bar }) {
  const [pos, jump] = useSmoothPos(m, at);
  const c = (a: string) => invoke("media_control", { action: a });
  if (!m.active) return <div className="empty">Nothing playing. Start music in any app.</div>;
  const f = m.dur ? Math.min(1, pos / m.dur) : 0;
  return (
    <div className="music">
      <div className="art">{art ? <img src={art} alt="" /> : <I n="music" s={38} />}</div>
      <div className="meta"><div className="title">{m.title || "Unknown"}</div><div className="sub">{m.artist || "Unknown artist"}</div></div>
      <div className="ctrls">
        <button onClick={() => c("prev")} aria-label="Previous"><I n="prev" s={24} fill /></button>
        <button className="big" onClick={() => c("toggle")} aria-label="Play or pause"><I n={m.playing ? "pause" : "play"} s={30} fill /></button>
        <button onClick={() => c("next")} aria-label="Next"><I n="next" s={24} fill /></button>
      </div>
      <Progress kind={bar} frac={f} seed={m.title} onSeek={(x) => { if (m.dur) { jump(x * m.dur); c(`seek:${x * m.dur}`); } }} />
      <div className="times"><span>{mmss(pos)}</span><span>-{mmss(m.dur - pos)}</span></div>
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
        <button onClick={() => open("ms-screenclip:")}><I n="camera" s={18} /> Screenshot</button>
        <button onClick={() => open("ms-screenclip:")}><I n="scissors" s={18} /> Snip</button>
        <button onClick={() => open("ms-gamebar:")}><span style={{ color: "#ff453a", display: "flex" }}><I n="record" s={18} fill /></span> Record</button>
      </div>
      <div className="slots">{slots.map((s, i) => edit === i ? (
        <input key={i} autoFocus value={v} placeholder="URL or app path" onChange={(e) => setV(e.target.value)} onBlur={() => setEdit(-1)}
          onKeyDown={(e) => { if (e.key === "Enter") { set(i, v.trim()); setEdit(-1); } if (e.key === "Escape") setEdit(-1); }} />
      ) : s ? (
        <button key={i} className="slot" onClick={() => open(s)} onContextMenu={(e) => { e.preventDefault(); set(i, ""); }} title="Right-click to remove">
          {s.replace(/^https?:\/\/(www\.)?/, "").split(/[\\/]/).filter(Boolean).pop()?.slice(0, 12)}</button>
      ) : <button key={i} className="slot add" onClick={() => { setV(""); setEdit(i); }}><I n="plus" s={20} /><small>Add</small></button>)}</div>
    </div>
  );
}

function Hud({ s }: { s: Stats | null }) {
  const [t, setT] = useState(new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  const item = (k: string, v: string) => <span className="hi"><b>{k}</b> {v}</span>;
  return (
    <div className="hud">
      {s?.fps != null && item("FPS", String(Math.round(s.fps)))}
      {item("CPU", s ? `${Math.round(s.cpu)}%` : "—")}
      {item("GPU", s && s.gpu != null ? `${Math.round(s.gpu)}%${s.gpu_t != null ? ` ${Math.round(s.gpu_t)}°` : ""}` : "—")}
      {item("RAM", s ? `${Math.round(s.ram)}%` : "—")}
      <span className="hi"><I n="down" s={12} /> {s ? s.net.toFixed(1) : "0.0"} Mbps</span>
      <span className="hi">{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

export default function App() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("music");
  const [cfg, setCfg] = useState<Cfg>(() => ({ style: "pill", surface: "peach", bar: "wave", viz: "bars", bg: "album", see: 42, hud: "auto", peek: "on", ...load<Partial<Cfg>>("cfg", {}) }));
  const [m, setM] = useState<Media>({ title: "", artist: "", playing: false, active: false, pos: 0, dur: 0 });
  const [at, setAt] = useState(Date.now());
  const [art, setArt] = useState(""); const [col, setCol] = useState("");
  const clip = useClipHistory();
  const [snips, setSnips] = useState<Clip[]>(() => load("snips", []));
  const [shelf, setShelf] = useState<string[]>(() => load("shelf", []));
  const [gaming, setGaming] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [peek, setPeek] = useState<Notif | null>(null);
  const t = useRef<number>();
  const seen = useRef(new Set<number>()), t0 = useRef(Date.now() - 2000);
  const nots = useNotifs(cfg.peek === "on", 3000);

  const hud = cfg.hud === "always" || (cfg.hud === "auto" && gaming);
  const float = cfg.style !== "pill", dot = cfg.style === "dot", full = cfg.style === "full";
  const mode = open ? "open" : peek ? "peek" : hud ? "hud" : "idle";

  useEffect(() => {
    save("cfg", cfg);
    const r = document.documentElement; r.dataset.surface = cfg.surface; r.style.setProperty("--ap", `${100 - cfg.see}%`);
  }, [cfg]);
  useEffect(() => {
    const un = listen<boolean>("hover", (e) => { clearTimeout(t.current); t.current = window.setTimeout(() => setOpen(e.payload), e.payload ? 120 : 300); });
    return () => { un.then((f) => f()); };
  }, []);
  useEffect(() => {
    const a = listen<boolean>("gaming", (e) => setGaming(e.payload)), b = listen<Stats>("stats", (e) => setStats(e.payload));
    return () => { a.then((f) => f()); b.then((f) => f()); };
  }, []);
  useEffect(() => { invoke("set_hud_want", { v: hud }); }, [hud]);
  useEffect(() => {
    invoke("set_expanded", { v: open, cw: hud ? 660 : dot ? 44 : full ? 300 : 230, top: float ? 10 : 0 });
  }, [open, hud, dot, full, float]);
  useEffect(() => { // peek at notifications that arrive after launch
    const fresh = nots.filter((n) => !seen.current.has(n.id) && n.at > t0.current);
    nots.forEach((n) => seen.current.add(n.id));
    if (fresh.length && !open) setPeek(fresh[0]);
  }, [nots]);
  useEffect(() => { if (!peek) return; const x = setTimeout(() => setPeek(null), 2000); return () => clearTimeout(x); }, [peek]);
  useEffect(() => { if (open) setPeek(null); }, [open]);
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

  let body: JSX.Element;
  if (tab === "music") body = <Music m={m} at={at} art={art} bar={cfg.bar} />;
  else if (tab === "tools") body = <Tools />;
  else if (tab === "settings") body = <Settings cfg={cfg} set={setCfg} />;
  else if (tab === "clip") body = <ClipView items={clip.items} clear={clip.clear} snips={snips} setSnips={setSnips} />;
  else if (tab === "shelf") body = <Shelf files={shelf} setFiles={setShelf} />;
  else if (tab === "audio") body = <AudioTab />;
  else if (tab === "controls") body = <Controls />;
  else if (tab === "sites") body = <Sites />;
  else body = <Notifications />;

  const W = { open: 640, peek: 440, hud: 660, idle: dot ? 34 : full ? 300 : 230 }[mode];
  const H = { open: 270, peek: 64, hud: 30, idle: full ? 44 : 34 }[mode];
  const flush = !float || mode === "hud";
  const mt = flush ? 0 : mode === "open" ? 10 : mode === "idle" && dot ? 6 : 8;
  const rt = flush ? 0 : mode === "open" ? 34 : mode === "peek" ? 28 : dot ? 17 : 22;
  const rb = mode === "open" ? 34 : mode === "peek" ? 28 : mode === "hud" ? 12 : dot ? 17 : full ? 22 : 18;
  const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.1 } } };

  return (
    <motion.div className="island" initial={false}
      animate={{ width: W, height: H, marginTop: mt, borderTopLeftRadius: rt, borderTopRightRadius: rt, borderBottomLeftRadius: rb, borderBottomRightRadius: rb }}
      transition={SPRING}>
      <div className="glow" style={{ "--art": col || "transparent", opacity: col && cfg.bg === "album" && ((open && tab === "music") || (mode === "idle" && full)) ? 0.55 : 0 } as CSSProperties} />
      <AnimatePresence initial={false}>
        {mode === "idle" && (
          <motion.div key="idle" className={"collapsed" + (dot ? " dot" : full ? " full" : "")} {...fade}>
            {!dot && (art ? <img src={art} alt="" /> : <span />)}
            {m.playing && <div className={"bars" + (cfg.viz === "pixels" ? " px" : "")}><i /><i /><i /><i /></div>}
          </motion.div>
        )}
        {mode === "hud" && <motion.div key="hud" className="collapsed hudw" {...fade}><Hud s={stats} /></motion.div>}
        {mode === "peek" && peek && (
          <motion.div key="peek" className="pk" {...fade}>
            <span className="nri" style={{ background: `hsl(${hue(peek.app)} 60% 45%)` }}>{(peek.title || "?").charAt(0).toUpperCase()}</span>
            <div className="pkt"><b>{peek.title}</b><span>{peek.body || appName(peek.app)}</span></div>
          </motion.div>
        )}
        {mode === "open" && (
          <motion.div className="card" key="card" initial={{ opacity: 0, y: -8, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transition: { delay: 0.08, duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
            <nav className="tabs">
              {TABS.map(([k, ic]) => (
                <span key={k} style={{ display: "contents" }}>
                  {k === "settings" && <b className="sep" />}
                  <button className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)} aria-label={k}><I n={ic} s={22} /></button>
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
