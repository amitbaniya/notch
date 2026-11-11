import { ReactNode, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAudio } from "./Call";

type Radios = { wifi: boolean | null; bt: boolean | null };
const MODES = [["battery", "Battery"], ["balanced", "Balanced"], ["perf", "Performance"]] as const;

function VSlider({ v, set, commit, icon, off }: { v: number; set: (n: number) => void; commit: (n: number) => void; icon: ReactNode; off?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const f = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) * 100); };
  return (
    <div ref={ref} className="vs" style={off ? { opacity: 0.4 } : undefined}
      onPointerDown={(e) => { if (!off) { e.currentTarget.setPointerCapture(e.pointerId); set(f(e)); } }}
      onPointerMove={(e) => { if (e.buttons && !off) set(f(e)); }}
      onPointerUp={(e) => { if (!off) commit(f(e)); }}>
      <i style={{ height: `${v}%` }} /><span className="vt">{off ? "—" : `${v}%`}</span><span className="vi">{icon}</span>
    </div>
  );
}

const Tile = ({ icon, label, sub, on, click }: { icon: string; label: string; sub: string; on?: boolean; click?: () => void }) => (
  <button className={"tl" + (on ? " on" : "")} onClick={click}><span className="tic">{icon}</span><b>{label}</b><small>{sub}</small></button>
);

export function Controls() {
  const [a] = useAudio(1000);
  const [vol, setVol] = useState<number | null>(null);
  const [br, setBr] = useState(-1);
  const [rad, setRad] = useState<Radios>({ wifi: null, bt: null });
  const [mode, setMode] = useState("");
  const [bat, setBat] = useState<{ level: number; charging: boolean } | null>(null);
  const drag = useRef(false);

  useEffect(() => { if (a && !drag.current) setVol(Math.round(a.out_vol * 100)); }, [a]);
  useEffect(() => {
    invoke<number>("get_brightness").then(setBr).catch(() => {});
    invoke<Radios>("get_radios").then(setRad).catch(() => {});
    invoke<string>("get_power").then(setMode).catch(() => {});
    (navigator as any).getBattery?.().then((b: any) => {
      const u = () => setBat({ level: Math.round(b.level * 100), charging: b.charging });
      u(); b.addEventListener("levelchange", u); b.addEventListener("chargingchange", u);
    }).catch(() => {});
  }, []);

  const radio = (bt: boolean) => { const cur = bt ? rad.bt : rad.wifi; if (cur === null) return; const on = !cur;
    setRad({ ...rad, [bt ? "bt" : "wifi"]: on }); invoke("set_radio", { bt, on }).then(() => invoke<Radios>("get_radios").then(setRad)).catch(() => {}); };
  const st = (r: boolean | null) => (r === null ? "N/A" : r ? "On" : "Off");
  const open = (u: string) => invoke("open_uri", { uri: u });

  return (
    <div className="controls">
      <div className="ctop">
        <VSlider v={Math.max(br, 0)} off={br < 0} icon="☀" set={setBr} commit={(n) => invoke("set_brightness", { v: n })} />
        <VSlider v={vol ?? 0} off={vol === null} icon={a?.out_mute ? "🔇" : "🔊"}
          set={(n) => { drag.current = true; setVol(n); }} commit={(n) => { drag.current = false; invoke("set_out_vol", { v: n / 100 }); }} />
        <div className="tiles3">
          <Tile icon="📶" label="Wi-Fi" sub={st(rad.wifi)} on={!!rad.wifi} click={() => radio(false)} />
          <Tile icon="ᛒ" label="Bluetooth" sub={st(rad.bt)} on={!!rad.bt} click={() => radio(true)} />
          <Tile icon="🌙" label="Night light" sub="Settings ›" click={() => open("ms-settings:nightlight")} />
          <Tile icon="🔕" label="Focus" sub="Settings ›" click={() => open("ms-settings:quietmomentshome")} />
          <Tile icon={a?.out_mute ? "🔇" : "🔈"} label="Mute" sub={a?.out_mute ? "Sound off" : "Sound on"} on={!!a?.out_mute}
            click={() => a && invoke("set_mute", { mic: false, m: !a.out_mute })} />
          <Tile icon={bat?.charging ? "⚡" : "🔋"} label={bat ? `${bat.level}%` : "—"} sub={bat ? (bat.charging ? "Plugged in" : "On battery") : "No battery"} />
        </div>
      </div>
      <div className="seg">{MODES.map(([k, l]) => (
        <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); invoke("set_power", { mode: k }); }}>{l}</button>))}</div>
    </div>
  );
}
