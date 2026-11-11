import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Site = { name: string; url: string };
const DEFAULT: Site[] = [
  { name: "YT Music", url: "https://music.youtube.com" },
  { name: "YouTube", url: "https://www.youtube.com" },
  { name: "Spotify", url: "https://open.spotify.com" },
];
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const load = (): Site[] => { try { const v = localStorage.getItem("sites"); return v ? JSON.parse(v) : DEFAULT; } catch { return DEFAULT; } };

function Icon({ h, name }: { h: string; name: string }) {
  const [bad, setBad] = useState(false);
  return <span className="sxi">{bad ? name[0] : <img src={`https://www.google.com/s2/favicons?domain=${h}&sz=64`} alt="" onError={() => setBad(true)} />}</span>;
}

export function Sites() {
  const [sites, setSites] = useState<Site[]>(load);
  const [adding, setAdding] = useState(false), [v, setV] = useState("");
  const save = (s: Site[]) => { setSites(s); try { localStorage.setItem("sites", JSON.stringify(s)); } catch {} };
  const go = (s: Site, e: React.MouseEvent) => e.shiftKey
    ? invoke("open_uri", { uri: s.url })
    : invoke("open_site", { label: `site-${hash(s.url).toString(16)}`, url: s.url, title: s.name });
  const add = () => {
    let u = v.trim(); if (!u) { setAdding(false); return; }
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { new URL(u); } catch { setAdding(false); return; }
    const n = host(u).split(".")[0]; save([...sites, { name: n.charAt(0).toUpperCase() + n.slice(1), url: u }]); setV(""); setAdding(false);
  };
  return (
    <div className="sites">
      <div className="sgrid">
        {sites.map((s) => (
          <button key={s.url} className="sx" style={{ background: `hsl(${hash(host(s.url)) % 360} 55% 40% / .35)` }}
            onClick={(e) => go(s, e)} onContextMenu={(e) => { e.preventDefault(); save(sites.filter((x) => x !== s)); }} title="Click to open, Shift-click for your browser, right-click to remove">
            <Icon h={host(s.url)} name={s.name} /><span className="sxt"><b>{s.name}</b><small>{host(s.url)}</small></span>
          </button>
        ))}
        {adding
          ? <input className="sxin" autoFocus value={v} placeholder="youtube.com" onChange={(e) => setV(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false); }} />
          : <button className="sx sxadd" onClick={() => { setV(""); setAdding(true); }}>＋ Add a site</button>}
      </div>
      <div className="hint">Sites open in their own window and stay signed in. Shift-click opens your browser instead.</div>
    </div>
  );
}
