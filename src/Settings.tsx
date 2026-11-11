import { ReactNode, useState } from "react";
import type { Cfg } from "./types";

function Seg<T extends string>({ v, opts, set }: { v: T; opts: [T, string][]; set: (v: T) => void }) {
  return <div className="seg2">{opts.map(([k, l]) => <button key={k} className={k === v ? "on" : ""} onClick={() => set(k)}>{l}</button>)}</div>;
}
const Row = ({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) => (
  <div className="sr"><b>{title}</b>{desc && <p>{desc}</p>}{children}</div>
);

export function Settings({ cfg, set }: { cfg: Cfg; set: (c: Cfg) => void }) {
  const [city, setCity] = useState(cfg.city), [tz, setTz] = useState(cfg.tz);
  const commit = () => set({ ...cfg, city: city.trim() || cfg.city, tz: tz.trim() || cfg.tz });
  const up = <K extends keyof Cfg>(k: K) => (v: Cfg[K]) => set({ ...cfg, [k]: v });
  return (
    <div className="set">
      <div className="sh">APPEARANCE</div>
      <Row title="Shape" desc="A floating island under the top edge, a notch that hangs from it, or a small hole punch.">
        <Seg v={cfg.style} set={up("style")} opts={[["full", "Island"], ["pill", "Notch"], ["dot", "Hole punch"]]} />
      </Row>
      <Row title="Surface" desc="The island's colour. Each theme brings its own accent and edge.">
        <Seg v={cfg.surface} set={up("surface")} opts={[["black", "Black"], ["graphite", "Graphite"], ["rose", "Rosé"], ["lavender", "Lavender"], ["peach", "Peach"], ["sakura", "Sakura"]]} />
      </Row>
      <Row title="Progress bar" desc="How the card shows how far the song has played.">
        <Seg v={cfg.bar} set={up("bar")} opts={[["wave", "Wave"], ["pixels", "Pixels"], ["comet", "Comet"], ["song", "Song shape"], ["simple", "Simple"], ["hearts", "Hearts"]]} />
      </Row>
      <Row title="Visualizer" desc="What plays beside the artwork on the pill.">
        <Seg v={cfg.viz} set={up("viz")} opts={[["pixels", "Pixels"], ["bars", "Bars"]]} />
      </Row>
      <Row title="Background" desc="Behind the music card: the cover's colours, or the plain surface.">
        <Seg v={cfg.bg} set={up("bg")} opts={[["album", "Album colours"], ["plain", "Plain"]]} />
      </Row>
      <div className="sh" style={{ marginTop: 8 }}>GENERAL</div>
      <Row title="Weather city"><input value={city} onChange={(e) => setCity(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} /></Row>
      <Row title="Second clock" desc="An IANA time zone, for example Asia/Tokyo."><input value={tz} onChange={(e) => setTz(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} /></Row>
    </div>
  );
}
