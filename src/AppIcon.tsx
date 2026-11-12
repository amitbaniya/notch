import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// Icons are looked up once per app, then kept in memory and in localStorage so they appear instantly next time.
const mem = new Map<string, string>(); // "" = looked up, nothing found (retried next launch)
const pending = new Map<string, Promise<string>>();
let disk: Record<string, string> | null = null;
const loadDisk = () => { if (!disk) { try { disk = JSON.parse(localStorage.getItem("icons") || "{}"); } catch { disk = {}; } } return disk!; };
const saveDisk = (k: string, v: string) => {
  const d = loadDisk(); d[k] = v;
  const keys = Object.keys(d); if (keys.length > 60) delete d[keys[0]];
  try { localStorage.setItem("icons", JSON.stringify(d)); } catch {}
};
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;

export function AppIcon({ cacheKey, kind, arg, label, size = 36 }: { cacheKey: string; kind: "pid" | "aumid"; arg: string; label: string; size?: number }) {
  const [src, setSrc] = useState<string>(() => mem.get(cacheKey) ?? loadDisk()[cacheKey] ?? "");
  useEffect(() => {
    const m = mem.get(cacheKey); if (m !== undefined) { setSrc(m); return; }
    const d = loadDisk()[cacheKey]; if (d) { mem.set(cacheKey, d); setSrc(d); return; }
    if (!arg) return;
    let dead = false;
    let p = pending.get(cacheKey);
    if (!p) { p = invoke<string>("get_icon", { kind, arg }).catch(() => ""); pending.set(cacheKey, p); }
    p.then((v) => { pending.delete(cacheKey); mem.set(cacheKey, v); if (v) saveDisk(cacheKey, v); if (!dead) setSrc(v); });
    return () => { dead = true; };
  }, [cacheKey, kind, arg]);
  return src
    ? <img className="appic" src={src} alt="" width={size} height={size} />
    : <span className="appfb" style={{ width: size, height: size, background: `hsl(${hue(label)} 55% 42%)` }}>{label.charAt(0).toUpperCase()}</span>;
}
