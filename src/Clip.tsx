import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readText, readImage, writeText } from "@tauri-apps/plugin-clipboard-manager";

export type Clip = { id: number; kind: "text" | "link" | "image" | "file"; text?: string; thumb?: string; w?: number; h?: number; files?: string[]; at: number };
const isLink = (s: string) => /^https?:\/\/\S+$/.test(s);
const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;
const dir = (p: string) => base(p.replace(/[\\/][^\\/]*$/, ""));
const ago = (t: number) => { const s = (Date.now() - t) / 1000; return s < 30 ? "now" : s < 3600 ? `${Math.round(s / 60) || 1}m` : `${Math.round(s / 3600)}h`; };

async function thumbOf(img: Awaited<ReturnType<typeof readImage>>) {
  const { width, height } = await img.size();
  const rgba = await img.rgba();
  const c = document.createElement("canvas"); c.width = width; c.height = height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const s = Math.min(1, 240 / Math.max(width, height));
  const o = document.createElement("canvas"); o.width = Math.round(width * s); o.height = Math.round(height * s);
  o.getContext("2d")!.drawImage(c, 0, 0, o.width, o.height);
  return { thumb: o.toDataURL("image/jpeg", 0.8), w: width, h: height, key: `${width}x${height}:${rgba.length}:${rgba[0]}-${rgba[rgba.length >> 1]}` };
}

// History lives in memory only; nothing you copy is written to disk (except snippets you save).
export function useClipHistory() {
  const [items, setItems] = useState<Clip[]>([]);
  const last = useRef("");
  useEffect(() => {
    let busy = false, n = 0;
    const i = setInterval(async () => {
      if (busy) return; busy = true;
      try {
        let files: string[] = [];
        try { files = await invoke<string[]>("get_clip_files"); } catch {}
        let c: Omit<Clip, "id" | "at"> | null = null, key = "";
        if (files.length) { key = "f:" + files.join("|"); c = { kind: "file", files }; }
        else {
          let t = ""; try { t = ((await readText()) || "").trim(); } catch {}
          if (t) { key = "t:" + t; c = { kind: isLink(t) ? "link" : "text", text: t }; }
          else if (++n % 3 === 0) { // images are heavier, so check every 3s
            try { const img = await readImage(); const r = await thumbOf(img); await img.close(); key = "i:" + r.key; c = { kind: "image", thumb: r.thumb, w: r.w, h: r.h }; } catch {}
          }
        }
        if (c && key !== last.current) { last.current = key; const now = Date.now(); setItems((p) => [{ ...c!, id: now, at: now }, ...p].slice(0, 30)); }
      } catch {}
      busy = false;
    }, 1000);
    return () => clearInterval(i);
  }, []);
  return { items, clear: () => setItems([]) };
}

const FILTERS = ["All", "Text", "Links", "Images", "Files", "Snippets"] as const;
const COL = { text: "#ffb38a", link: "#8ab4ff", image: "#9be58f", file: "#e6a23c" };
const NAME = { text: "Text", link: "Link", image: "Image", file: "File" };

export function ClipView({ items, clear, snips, setSnips }: { items: Clip[]; clear: () => void; snips: Clip[]; setSnips: (s: Clip[]) => void }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>("All");
  const list = f === "Snippets" ? snips : items.filter((x) => f === "All" || (f === "Text" && x.kind === "text") || (f === "Links" && x.kind === "link") || (f === "Images" && x.kind === "image") || (f === "Files" && x.kind === "file"));
  const act = (c: Clip) => { if (c.text) writeText(c.text); else if (c.files) invoke("open_uri", { uri: c.files[0] }); };
  return (
    <div className="clipv">
      <div className="chips">
        {FILTERS.map((x) => <button key={x} className={x === f ? "on" : ""} onClick={() => setF(x)}>{x}</button>)}
        <span style={{ flex: 1 }} />
        <button onClick={clear}>Clear</button>
      </div>
      {list.length === 0 ? <div className="empty">{f === "Snippets" ? "Star a text clip to keep it as a snippet" : "Copy something to see it here"}</div> : (
        <div className="cards">
          {list.map((c) => (
            <div key={c.id} className="cc" onClick={() => act(c)} title={c.kind === "image" ? "" : "Click to copy"}>
              <div className="ch" style={{ color: COL[c.kind], background: COL[c.kind] + "30" }}>
                <span>{c.files && c.files.length > 1 ? "Files" : NAME[c.kind]}</span><span className="sub">{ago(c.at)}</span>
              </div>
              <div className="cb">
                {c.thumb ? <img src={c.thumb} alt="" /> : c.files ? <><b>{c.files.length > 1 ? `${c.files.length} files` : base(c.files[0])}</b><span className="sub">{dir(c.files[0])}</span></> : <span className="ct">{c.text}</span>}
              </div>
              <div className="cf">
                <span className="sub">{c.w ? `${c.w} × ${c.h}` : c.text ? `${c.text.length} chars` : ""}</span>
                {c.text && (f === "Snippets"
                  ? <button onClick={(e) => { e.stopPropagation(); setSnips(snips.filter((s) => s.id !== c.id)); }}>✕</button>
                  : <button onClick={(e) => { e.stopPropagation(); if (!snips.some((s) => s.text === c.text)) setSnips([{ ...c, id: Date.now() }, ...snips]); }}>☆</button>)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
