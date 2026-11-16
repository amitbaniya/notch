import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Notif, useNotifs, service, isChat, hue } from "./Notifs";

const ls = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const COLORS: Record<string, string> = { WhatsApp: "#25d366", Instagram: "#e1306c", Messenger: "#0084ff", Telegram: "#2aabee", Discord: "#5865f2" };
type Group = { key: string; svc: string; n: Notif; unread: number };

// Lives in its own small always-on-top window at the bottom-right of the screen.
export function Bubbles() {
  const [on, setOn] = useState<boolean>(() => ls("chatOn", false));
  const items = useNotifs(on, 3000);
  const [dis, setDis] = useState<Record<string, number>>(() => ls("bubble_dis", {}));
  const [read, setRead] = useState<Record<string, number>>(() => ls("bubble_read", {}));
  useEffect(() => { // the main window flips chatOn; localStorage is shared, so a storage event tells us
    const h = () => setOn(ls("chatOn", false));
    window.addEventListener("storage", h); return () => window.removeEventListener("storage", h);
  }, []);
  const put = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const groups = new Map<string, Group>();
  if (on) for (const n of items.filter(isChat)) { // newest first
    const svc = service(n), key = `${svc}|${n.title}`;
    if (n.at <= (dis[key] ?? 0)) continue;
    const g = groups.get(key) ?? { key, svc, n, unread: 0 };
    if (n.at > (read[key] ?? 0)) g.unread++;
    groups.set(key, g);
  }
  const list = [...groups.values()].slice(0, 4);
  useEffect(() => { invoke("set_bubbles", { n: list.length }); }, [list.length]);

  const open = (g: Group) => {
    invoke("open_chat", { service: g.svc });
    const r = { ...read, [g.key]: Date.now() }; setRead(r); put("bubble_read", r);
  };
  const dismiss = (g: Group) => { const d = { ...dis, [g.key]: Date.now() }; setDis(d); put("bubble_dis", d); };

  return (
    <div className="bub">
      {list.map((g) => (
        <button key={g.key} className="bb" style={{ background: `hsl(${hue(g.n.title)} 55% 42%)` }} title={`${g.n.title}: ${g.n.body}`}
          onClick={() => open(g)} onContextMenu={(e) => { e.preventDefault(); dismiss(g); }}>
          {g.n.title.charAt(0).toUpperCase()}
          <span className="svc" style={{ background: COLORS[g.svc] }}>{g.svc.charAt(0)}</span>
          {g.unread > 0 && <span className="cnt">{g.unread > 9 ? "9+" : g.unread}</span>}
          <span className="x" onClick={(e) => { e.stopPropagation(); dismiss(g); }}>✕</span>
        </button>
      ))}
    </div>
  );
}
