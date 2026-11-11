import type { Bar } from "./Progress";
export type Surface = "black" | "graphite" | "rose" | "lavender" | "peach" | "sakura";
export type Cfg = {
  style: "pill" | "full" | "dot";   // pill = Notch (hangs from the edge), full = Island (floats), dot = Hole punch
  surface: Surface; bar: Bar; viz: "pixels" | "bars"; bg: "album" | "plain";
  see: number; /* transparency 0-85 (%) */ sizeNotch: number; sizeOpen: number; sizeHud: number; /* scale (%) of the collapsed notch and of the open card */ hud: "auto" | "off" | "always"; peek: "on" | "off";
};
