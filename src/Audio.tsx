import { ReactNode, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { I } from "./icons";
import { AppIcon } from "./AppIcon";

export type Audio = { out_vol: number; out_mute: boolean; in_mute: boolean; in_level: number; has_mic: boolean };
type Sess = { pid: number; name: string; vol: number; mute: boolean };

export function useAudio(ms: number) {
  const [a, setA] = useState<Audio | null>(null);
  useEffect(() => {
    const p = () => invoke<Audio>("get_audio").then(setA).catch(() => {});
    p(); const i = setInterval(p, ms); return () => clearInterval(i);
  }, [ms]);
  return [a, setA] as const;
}

// Sends the latest slider value while dragging, never queueing more than one call at a time.
export function useLive(cmd: string, map: (n: number) => Record<string, unknown>) {
  const busy = useRef(false), pending = useRef<number | null>(null);
  return (n: number) => {
    pending.current = n;
    if (busy.current) return;
    busy.current = true;
    const go = () => {
      const v = pending.current; pending.current = null;
      if (v === null) { busy.current = false; return; }
      invoke(cmd, map(v)).catch(() => {}).finally(go);
    };
    go();
  };
}

function Row({ icon, label, value, muted, live, mute, mIcon, meter }: {
  icon: ReactNode; label: string; value?: number; muted: boolean; live?: (n: number) => void; mute: () => void; mIcon: ReactNode; meter?: number;
}) {
  const [v, setV] = useState(Math.round(value ?? 0));
  const drag = useRef(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!drag.current && value !== undefined) setV(Math.round(value)); }, [value]);
  const f = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100); };
  return (
    <div className="mr">
      <span className="mi">{icon}</span><span className="mn">{label}</span>
      {live ? (
        <div ref={ref} className="hs" onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); const n = f(e); setV(n); live(n); }}
          onPointerMove={(e) => { if (e.buttons) { const n = f(e); setV(n); live(n); } }}
          onPointerUp={(e) => { drag.current = false; live(f(e)); }}
          onWheel={(e) => { const n = Math.max(0, Math.min(100, v + (e.deltaY < 0 ? 3 : -3))); setV(n); live(n); }}><i style={{ width: `${muted ? 0 : v}%` }} /><b className="knob2" style={{ left: `${muted ? 0 : v}%` }} /></div>
      ) : <div className="hs meter"><i style={{ width: `${(meter ?? 0) * 100}%` }} /></div>}
      <span className="mp">{live ? `${muted ? 0 : v}%` : ""}</span>
      <button className="mb" onClick={mute} aria-label="Mute">{mIcon}</button>
    </div>
  );
}

function AppRow({ s }: { s: Sess }) {
  const live = useLive("set_app_volume", (n) => ({ pid: s.pid, v: n / 100 }));
  const [m, setM] = useState(s.mute);
  useEffect(() => setM(s.mute), [s.mute]);
  const name = s.name.charAt(0).toUpperCase() + s.name.slice(1);
  return <Row icon={s.pid === 0 ? <I n="volume" s={20} /> : <AppIcon cacheKey={"n:" + s.name.toLowerCase()} kind="pid" arg={String(s.pid)} label={name} size={26} />} label={name}
    value={s.vol * 100} muted={m} live={live} mute={() => { setM(!m); invoke("set_app_mute", { pid: s.pid, m: !m }); }} mIcon={<I n={m ? "volumeOff" : "volume"} s={18} />} />;
}

export function AudioTab() {
  const [a, setA] = useAudio(300);
  const [ss, setSs] = useState<Sess[]>([]);
  const liveVol = useLive("set_out_vol", (n) => ({ v: n / 100 }));
  useEffect(() => {
    const p = () => invoke<Sess[]>("get_sessions").then(setSs).catch(() => {});
    p(); const i = setInterval(p, 1500); return () => clearInterval(i);
  }, []);
  if (!a) return <div className="empty">Reading audio…</div>;
  return (
    <div className="mix">
      <Row icon={<I n="volume" s={20} />} label="System" value={a.out_vol * 100} muted={a.out_mute} live={liveVol}
        mute={() => { setA({ ...a, out_mute: !a.out_mute }); invoke("set_mute", { mic: false, m: !a.out_mute }); }} mIcon={<I n={a.out_mute ? "volumeOff" : "volume"} s={18} />} />
      {a.has_mic && <Row icon={<I n="mic" s={20} />} label="Microphone" muted={a.in_mute} meter={a.in_mute ? 0 : Math.min(1, a.in_level * 1.6)}
        mute={() => { setA({ ...a, in_mute: !a.in_mute }); invoke("set_mute", { mic: true, m: !a.in_mute }); }} mIcon={<I n={a.in_mute ? "micOff" : "mic"} s={18} />} />}
      <div className="msep">Apps</div>
      {ss.length === 0 ? <div className="sub" style={{ padding: "6px 4px" }}>No app is playing sound right now.</div> : ss.map((s) => <AppRow key={s.pid} s={s} />)}
    </div>
  );
}
