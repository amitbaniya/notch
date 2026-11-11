import type { Bar } from "./Progress";
export type Surface = "black" | "graphite" | "rose" | "lavender" | "peach" | "sakura";
export type Cfg = {
  city: string; tz: string;
  style: "pill" | "full" | "dot";   // pill = Notch (hangs from the edge), full = Island (floats), dot = Hole punch
  surface: Surface; bar: Bar; viz: "pixels" | "bars"; bg: "album" | "plain";
};
