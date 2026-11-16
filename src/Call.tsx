import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Audio = { out_vol: number; out_mute: boolean; in_mute: boolean; in_level: number; has_mic: boolean };

export function useAudio(ms: number) {
  const [a, setA] = useState<Audio | null>(null);
  useEffect(() => {
    const p = () => invoke<Audio>("get_audio").then(setA).catch(() => {});
    p(); const i = setInterval(p, ms); return () => clearInterval(i);
  }, [ms]);
  return [a, setA] as const;
}

export function Call() {
  const [a, setA] = useAudio(120);
  if (!a) return <div className="empty">Reading audio devices…</div>;
  if (!a.has_mic) return <div className="empty">No microphone found</div>;
  const lvl = a.in_mute ? 0 : Math.min(1, a.in_level * 1.6);
  const col = a.in_mute ? "#ff453a" : "#34c759";
  const toggle = () => { invoke("set_mute", { mic: true, m: !a.in_mute }); setA({ ...a, in_mute: !a.in_mute }); };
  return (
    <div className="call">
      <div className="micside">
        <button className="mic" onClick={toggle} aria-label="Toggle microphone mute"
          style={{ borderColor: col, boxShadow: `0 0 0 ${4 + lvl * 16}px ${col}${Math.round(30 + lvl * 70).toString(16).padStart(2, "0")}` }}>
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4" />{a.in_mute && <path d="M4 4l16 16" />}
          </svg>
        </button>
        <b style={{ color: col }}>{a.in_mute ? "Muted" : "Hearing you"}</b>
        <span className="sub">Click to {a.in_mute ? "unmute" : "mute"}</span>
      </div>
      <div className="devs">
        <div className="dev"><span>🎧 Speakers</span><span className="bar"><i style={{ width: `${a.out_mute ? 0 : a.out_vol * 100}%`, background: "#8ab4ff" }} /></span>
          <button className="pill2" onClick={() => invoke("test_sound")}>Test</button></div>
        <div className="dev"><span>🎙 Microphone</span><span className="bar"><i style={{ width: `${lvl * 100}%`, background: col }} /></span></div>
        <button className="pill2 wide" onClick={() => invoke("open_uri", { uri: "microsoft.windows.camera:" })}>📷 Check camera</button>
      </div>
    </div>
  );
}
