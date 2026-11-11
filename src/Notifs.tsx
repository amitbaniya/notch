import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type Notif = { id: number; app: string; title: string; body: string; at: number };
const ls = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function useNotifs(active: boolean, ms: number) {
  const [n, setN] = useState<Notif[]>([]);
  useEffect(() => {
    if (!active) return;
    let dead = false;
    const p = () => invoke<Notif[]>("get_notifications").then((x) => { if (!dead) setN(x); }).catch(() => {});
    p(); const i = setInterval(p, ms); return () => { dead = true; clearInterval(i); };
  }, [active, ms]);
  return n;
}

const SERVICES: [RegExp, string][] = [[/whatsapp/i, "WhatsApp"], [/instagram/i, "Instagram"], [/messenger/i, "Messenger"], [/telegram/i, "Telegram"], [/discord/i, "Discord"]];
export const service = (n: Notif) => SERVICES.find(([r]) => r.test(`${n.app} ${n.title} ${n.body}`))?.[1] ?? "";
export const isChat = (n: Notif) => !!service(n);
export const appName = (raw: string) => {
  const last = raw.split("!")[0].replace(/\.exe$/i, "").split("_")[0].split(".").filter(Boolean).pop() || raw;
  return last.charAt(0).toUpperCase() + last.slice(1);
};
export const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
const ago = (t: number) => { const s = (Date.now() - t) / 1000; return s < 60 ? "now" : s < 3600 ? `${Math.round(s / 60)}m` : s < 86400 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`; };

function Row({ label, title, body, at, unread, extra, onClick }: { label: string; title: string; body: string; at: number; unread?: boolean; extra?: string; onClick?: () => void }) {
  return (
    <div className="nr" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      {unread && <i className="dotu" />}
      <span className="nri" style={{ background: `hsl(${hue(label)} 60% 45%)` }}>{label.charAt(0)}</span>
      <div className="nrb">
        <div className="r"><b>{title}{extra && <span className="sub"> {extra}</span>}</b><span className="sub">{ago(at)}</span></div>
        <div className="sub">{body || label}</div>
      </div>
    </div>
  );
}

export function Notifications() {
  const items = useNotifs(true, 3000);
  const [cleared, setCleared] = useState<number>(() => ls("notif_cleared", 0));
  const seen = useRef<number>(ls("notif_seen", 0));
  useEffect(() => () => lsSet("notif_seen", Date.now()), []);
  const list = items.filter((n) => n.at > cleared);
  if (!list.length) return <div className="empty">No notifications. Windows must have app notifications turned on.</div>;
  return (
    <div className="nf">
      <div className="nfl">{list.map((n) => <Row key={n.id} label={service(n) || appName(n.app)} title={n.title} body={n.body} at={n.at} unread={n.at > seen.current} />)}</div>
      <div className="nff"><span>{list.length} notification{list.length === 1 ? "" : "s"}</span><button onClick={() => { const t = Date.now(); setCleared(t); lsSet("notif_cleared", t); }}>Clear all</button></div>
    </div>
  );
}
