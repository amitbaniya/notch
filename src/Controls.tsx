import { ReactNode, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAudio, useLive } from "./Audio";
import { I } from "./icons";
import { brCache, refreshBr, saveBr } from "./cache";

type Radios = { wifi: boolean | null; bt: boolean | null };
const MODES = [["battery", "Battery"], ["balanced", "Balanced"], ["perf", "Performance"]] as const;

function VSlider({ v, set, commit, icon, off }: { v: number; set: (n: number) => void; commit: (n: number) => void; icon: ReactNode; off?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const f = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)) * 100); };
  return (
    <div ref={ref} className="vs" style={off ? { opacity: 0.4 } : undefined}
      onPointerDown={(e) => { if (!off) { e.currentTarget.setPointerCapture(e.pointerId); set(f(e)); } }}
      onPointerMove={(e) => { if (e.buttons && !off) set(f(e)); }}
      onPointerUp={(e) => { if (!off) commit(f(e)); }}
      onWheel={(e) => { if (off) return; const n = Math.max(0, Math.min(100, v + (e.deltaY < 0 ? 3 : -3))); set(n); commit(n); }}>
      <i style={{ height: `${v}%` }} /><span className="vt">{off ? "—" : `${v}%`}</span><span className="vi">{icon}</span>
    </div>
  );
}

const Tile = ({ icon, label, sub, on, click }: { icon: ReactNode; label: string; sub: string; on?: boolean; click?: () => void }) => (
  <button className={"tl" + (on ? " on" : "")} onClick={click}><span className="tic">{icon}</span><b>{label}</b><small>{sub}</small></button>
);

export function Controls() {
  const [a] = useAudio(1000);
  const [vol, setVol] = useState<number | null>(null);
  const [br, setBr] = useState(brCache.v);
  const [rad, setRad] = useState<Radios>({ wifi: null, bt: null });
  const [mode, setMode] = useState("");
  const [bat, setBat] = useState<{ level: number; charging: boolean } | null>(null);
  const drag = useRef(false);
  const liveVol = useLive("set_out_vol", (n) => ({ v: n / 100 }));
  const liveBr = useLive("set_brightness", (n) => ({ v: n }));

  useEffect(() => { if (a && !drag.current) setVol(Math.round(a.out_vol * 100)); }, [a]);
  useEffect(() => {
    refreshBr().then(setBr).catch(() => {});
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
        <VSlider v={Math.max(br, 0)} off={br < 0} icon={<I n="sun" />} set={(n) => { setBr(n); saveBr(n); liveBr(n); }} commit={(n) => liveBr(n)} />
        <VSlider v={vol ?? 0} off={vol === null} icon={<I n={a?.out_mute ? "volumeOff" : "volume"} />}
          set={(n) => { drag.current = true; setVol(n); liveVol(n); }} commit={(n) => { drag.current = false; liveVol(n); }} />
        <div className="tiles3">
          <Tile icon={<I n="wifi" />} label="Wi-Fi" sub={st(rad.wifi)} on={!!rad.wifi} click={() => radio(false)} />
          <Tile icon={<I n="bluetooth" />} label="Bluetooth" sub={st(rad.bt)} on={!!rad.bt} click={() => radio(true)} />
          <Tile icon={<I n="moon" />} label="Night light" sub="Settings ›" click={() => open("ms-settings:nightlight")} />
          <Tile icon={<I n="bellOff" />} label="Focus" sub="Settings ›" click={() => open("ms-settings:quietmomentshome")} />
          <Tile icon={<I n={a?.out_mute ? "volumeOff" : "volume"} />} label="Mute" sub={a?.out_mute ? "Sound off" : "Sound on"} on={!!a?.out_mute}
            click={() => a && invoke("set_mute", { mic: false, m: !a.out_mute })} />
          <Tile icon={<I n={bat?.charging ? "bolt" : "battery"} />} label={bat ? `${bat.level}%` : "—"} sub={bat ? (bat.charging ? "Plugged in" : "On battery") : "No battery"} />
        </div>
      </div>
      <div className="seg">{MODES.map(([k, l]) => (
        <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); invoke("set_power", { mode: k }); }}>{l}</button>))}</div>
    </div>
  );
}
