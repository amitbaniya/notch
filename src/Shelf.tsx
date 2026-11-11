import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { I, IconName } from "./icons";

const base = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;
const icon = (p: string): IconName => {
  const e = base(p).split(".").pop()?.toLowerCase() || "";
  return /^(png|jpe?g|gif|webp|svg)$/.test(e) ? "image" : /^(mp4|mov|mkv|webm)$/.test(e) ? "video" : /^(mp3|wav|flac|m4a)$/.test(e) ? "music"
    : /^(zip|rar|7z)$/.test(e) ? "archive" : "doc";
};

export function Shelf({ files, setFiles }: { files: string[]; setFiles: (f: string[]) => void }) {
  const [url, setUrl] = useState(""), [qr, setQr] = useState("");
  const share = async () => {
    const u = await invoke<string>("start_share", { paths: files });
    setUrl(u); setQr(u ? await QRCode.toDataURL(u, { margin: 1, width: 170 }) : "");
  };
  useEffect(() => { if (url) invoke("start_share", { paths: files }); }, [files]); // keep the phone list in sync
  const stop = () => { invoke("stop_share"); setUrl(""); setQr(""); };
  return (
    <div className="shelf">
      <div className="row">
        <span>Shelf <span className="sub">· {files.length} file{files.length === 1 ? "" : "s"}</span></span>
        <span className="chips">
          {url ? <button className="on" onClick={stop}>Stop sharing</button> : <button className="on" disabled={!files.length} onClick={share}><I n="phone" s={16} /> Send to phone</button>}
          <button onClick={() => { setFiles([]); if (url) stop(); }} aria-label="Clear shelf"><I n="trash" s={16} /></button>
        </span>
      </div>
      <div className="shbody">
        {files.length === 0 ? <div className="empty">Drag files here to keep them on the shelf</div> : (
          <div className="tiles">
            {files.map((p) => (
              <div key={p} className="tile" onClick={() => invoke("open_uri", { uri: p })} onContextMenu={(e) => { e.preventDefault(); setFiles(files.filter((x) => x !== p)); }} title="Click to open, right-click to remove">
                <span className="ti"><I n={icon(p)} s={42} /></span><span className="tn">{base(p)}</span>
              </div>
            ))}
          </div>
        )}
        {qr && <div className="qr"><img src={qr} alt="QR code" /><span className="sub">Scan on the same Wi-Fi</span></div>}
      </div>
    </div>
  );
}
