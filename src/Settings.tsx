import { ReactNode, useEffect, useState } from "react";
import { isEnabled, enable, disable } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import type { Cfg } from "./types";

function Seg<T extends string>({ v, opts, set }: { v: T; opts: [T, string][]; set: (v: T) => void }) {
  return <div className="seg2">{opts.map(([k, l]) => <button key={k} className={k === v ? "on" : ""} onClick={() => set(k)}>{l}</button>)}</div>;
}
const Row = ({ title, desc, children, inline }: { title: string; desc?: string; children: ReactNode; inline?: boolean }) => (
  inline
    ? <div className="sr inl"><div><b>{title}</b>{desc && <p>{desc}</p>}</div>{children}</div>
    : <div className="sr"><b>{title}</b>{desc && <p>{desc}</p>}{children}</div>
);
const Slider = ({ v, min, max, set, label }: { v: number; min: number; max: number; set: (n: number) => void; label: string }) => (
  <div className="rg">
    <input type="range" min={min} max={max} value={v} style={{ "--v": `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties}
      onChange={(e) => set(Number(e.target.value))} aria-label={label} />
    <span className="mp">{v}%</span>
  </div>
);
const FPS_TEXT: Record<string, string> = {
  ok: "Working. FPS shows in the gaming bar while a game is the active window.",
  idle: "Ready. FPS appears in the gaming bar once a game is running. If it never does, set up access below.",
  denied: "Windows is blocking the FPS reader. Set up access (asks for administrator once), then sign out and back in.",
  missing: "This build doesn't include the FPS reader (PresentMon), so FPS is unavailable.",
};
const Toggle = ({ on, set, label }: { on: boolean; set: () => void; label: string }) => (
  <button role="switch" aria-checked={on} aria-label={label} className={"tg" + (on ? " on" : "")} onClick={set}><i /></button>
);

export function Settings({ cfg, set, enabled, setEnabled, onTestPeek }: { cfg: Cfg; set: (c: Cfg) => void; enabled: boolean; setEnabled: (b: boolean) => void; onTestPeek: () => void }) {
  const up = <K extends keyof Cfg>(k: K) => (v: Cfg[K]) => set({ ...cfg, [k]: v });
  const [auto, setAuto] = useState(false);
  const [sure, setSure] = useState(false);
  const [fps, setFps] = useState("idle");
  const [access, setAccess] = useState("");
  useEffect(() => { // is FPS access already set up? re-check every 6s until it is
    let dead = false, t = 0;
    const check = () => invoke<string>("fps_access").then((v) => { if (dead) return; setAccess(v); t = window.setTimeout(check, v === "active" ? 60000 : 6000); }).catch(() => {});
    check(); return () => { dead = true; clearTimeout(t); };
  }, []);
  useEffect(() => {
    const p = () => invoke<string>("fps_status").then(setFps).catch(() => {});
    p(); const i = setInterval(p, 2000); return () => clearInterval(i);
  }, []);
  useEffect(() => { isEnabled().then(setAuto).catch(() => {}); }, []);
  const toggleAuto = async () => { try { if (auto) await disable(); else await enable(); setAuto(!auto); } catch {} };
  return (
    <div className="set">
      <div className="sh">GENERAL</div>
      <Row inline title="Show island" desc="Shortcut: Ctrl+Alt+N. When off, only a small handle stays at the top edge; click it to bring the island back."><Toggle on={enabled} set={() => setEnabled(!enabled)} label="Show island" /></Row>
      <Row inline title="Open at startup" desc="Start Notch when you sign in to Windows."><Toggle on={auto} set={toggleAuto} label="Open at startup" /></Row>
      <Row inline title="Quit Notch" desc="Alt+F4 is blocked so you can't close Notch by accident. Use this to exit.">
        <button className="qbtn" onClick={() => { if (sure) invoke("quit_app"); else { setSure(true); setTimeout(() => setSure(false), 3000); } }}>{sure ? "Click again to quit" : "Quit"}</button>
      </Row>
      <div className="sh" style={{ marginTop: 8 }}>APPEARANCE</div>
      <Row title="Shape" desc="A floating island under the top edge, a notch that hangs from it, or a small hole punch.">
        <Seg v={cfg.style} set={up("style")} opts={[["full", "Island"], ["pill", "Notch"], ["dot", "Hole punch"]]} />
      </Row>
      <Row title="Notch size" desc="Scales the small collapsed island. Smaller covers less of your screen, e.g. browser tabs.">
        <Slider v={cfg.sizeNotch} min={40} max={100} set={up("sizeNotch")} label="Notch size" />
      </Row>
      <Row title="Open size" desc="Scales the island when it is fully open. Proportions never change.">
        <Slider v={cfg.sizeOpen} min={50} max={110} set={up("sizeOpen")} label="Open size" />
      </Row>
      <Row title="Transparency" desc="Slide right to see more of what's behind the island.">
        <div className="rg">
          <input type="range" min={0} max={85} value={cfg.see} style={{ "--v": `${(cfg.see / 85) * 100}%` } as React.CSSProperties}
            onChange={(e) => up("see")(Number(e.target.value))} aria-label="Transparency" />
          <span className="mp">{cfg.see}%</span>
        </div>
      </Row>
      <Row title="Surface" desc="The island's tint. Each theme brings its own accent and edge.">
        <Seg v={cfg.surface} set={up("surface")} opts={[["black", "Black"], ["graphite", "Graphite"], ["rose", "Rosé"], ["lavender", "Lavender"], ["peach", "Peach"], ["sakura", "Sakura"]]} />
      </Row>
      <Row title="Progress bar" desc="How the card shows how far the song has played.">
        <Seg v={cfg.bar} set={up("bar")} opts={[["wave", "Wave"], ["pixels", "Pixels"], ["comet", "Comet"], ["song", "Song shape"], ["simple", "Simple"], ["hearts", "Hearts"]]} />
      </Row>
      <Row title="Visualizer" desc="What plays beside the artwork on the pill.">
        <Seg v={cfg.viz} set={up("viz")} opts={[["pixels", "Pixels"], ["bars", "Bars"]]} />
      </Row>
      <Row title="Background" desc="Behind the music card: the cover's colours, or the plain surface.">
        <Seg v={cfg.bg} set={up("bg")} opts={[["album", "Album colours"], ["plain", "Plain"]]} />
      </Row>
      <div className="sh" style={{ marginTop: 8 }}>BEHAVIOUR</div>
      <Row title="Notification peek" desc="New notifications slide out for 2 seconds, without you hovering.">
        <Seg v={cfg.peek} set={up("peek")} opts={[["on", "On"], ["off", "Off"]]} />
      </Row>
      <Row title="Shortcut feedback" desc="Volume, mute and brightness changes from keyboard shortcuts show on the island: a slider on the notch and island, just an icon on the hole punch.">
        <Seg v={cfg.osd} set={up("osd")} opts={[["on", "On"], ["off", "Off"]]} />
      </Row>
      <Row title="Notification size" desc="Scales the notification that slides out. Press Test to preview it.">
        <Slider v={cfg.sizePeek} min={60} max={150} set={up("sizePeek")} label="Notification size" />
        <button className="pill2" style={{ marginTop: 8 }} onClick={onTestPeek}>Test</button>
      </Row>
      <Row title="Switch tabs on hover" desc="Rest the pointer on a tab icon for a moment to open that tab. Clicking still works.">
        <Seg v={cfg.tabHover} set={up("tabHover")} opts={[["on", "On"], ["off", "Off"]]} />
      </Row>
      <Row title="Gaming bar" desc="A stats strip (CPU, GPU, RAM, network, clock) while a game is fullscreen. Hovering never opens the island then; use the arrow at the bar's right end.">
        <Seg v={cfg.hud} set={up("hud")} opts={[["auto", "Auto"], ["always", "Always"], ["off", "Off"]]} />
      </Row>
      <Row title="FPS counter" desc={
        fps === "missing" ? FPS_TEXT.missing
        : fps === "ok" ? FPS_TEXT.ok
        : access === "active" ? "Already set up. FPS appears in the gaming bar once a game is running."
        : access === "pending" ? "Access granted. Sign out and back in to finish setting it up."
        : "FPS needs permission to read Windows' graphics events. Set it up once (asks for administrator), then sign out and back in."}>
        {fps !== "missing" && access === "none" && fps !== "ok" && <button className="pill2" onClick={() => { invoke("enable_fps_access"); window.setTimeout(() => invoke<string>("fps_access").then(setAccess).catch(() => {}), 5000); }}>Set up access (admin, once)</button>}
        {(access === "active" || access === "pending" || fps === "ok") && fps !== "missing" && <span className="okpill">{access === "pending" ? "Sign out and back in" : "Already set up"}</span>}
      </Row>
      <Row title="Gaming bar size" desc="Scales the stats strip, keeping its proportions.">
        <Slider v={cfg.sizeHud} min={40} max={105} set={up("sizeHud")} label="Gaming bar size" />
      </Row>
      <div className="sh" style={{ marginTop: 16 }}>SUPPORT</div>
      <Row title="Support the developer" desc="If you enjoy Notch, consider supporting development.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="pill2" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => invoke("open_uri", { uri: "https://buymemomo.com/amitbaniya" })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            Buy Me Momo
          </button>
          <button className="pill2" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#24292e", color: "#fff" }} onClick={() => invoke("open_uri", { uri: "https://github.com/amitbaniya/notch" })}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.37 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.855 1.23 1.92 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </button>
        </div>
      </Row>
    </div>
  );
}
