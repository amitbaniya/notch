export type Bar = "wave" | "pixels" | "comet" | "song" | "simple" | "hearts";

export function Progress({ kind, frac, seed, onSeek }: { kind: Bar; frac: number; seed: string; onSeek: (f: number) => void }) {
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
  };
  let body: JSX.Element;
  if (kind === "wave") {
    const W = 520, x = frac * W; let d = "";
    for (let i = 0; i <= x; i += 3) d += `${i ? "L" : "M"}${i} ${8 + 3 * Math.sin(i / 4)}`;
    body = (
      <svg viewBox={`0 0 ${W} 16`} preserveAspectRatio="none">
        <path d={`M${x} 8L${W} 8`} stroke="#ffffff30" strokeWidth="3" strokeLinecap="round" />
        <path d={d || "M0 8"} stroke="var(--accent)" strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
    );
  } else if (kind === "pixels") {
    body = <div className="pxbar">{Array.from({ length: 40 }, (_, i) => <i key={i} className={i < frac * 40 ? "on" : ""} />)}</div>;
  } else if (kind === "hearts") {
    body = <div className="hearts">{Array.from({ length: 16 }, (_, i) => <span key={i} className={i < frac * 16 ? "on" : ""}>♥</span>)}</div>;
  } else if (kind === "song") {
    const s = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
    body = <div className="song">{Array.from({ length: 48 }, (_, i) => (
      <i key={i} className={i < frac * 48 ? "on" : ""} style={{ height: `${30 + 70 * Math.abs(Math.sin(i * 0.9 + s) * Math.cos(i * 0.37))}%` }} />))}</div>;
  } else if (kind === "comet") {
    const l = `${frac * 100}%`;
    body = <div className="cometbar"><i className="tail" style={{ width: l }} /><b className="knob" style={{ left: l }} /></div>;
} else {
    body = <div className="simplebar"><i style={{ width: `${frac * 100}%` }} /></div>;
  }
  return <div className={"prog" + (kind === "comet" ? " comet" : "")} onClick={click}>{body}</div>;
}
