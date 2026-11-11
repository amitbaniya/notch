const P = {
  music: "M9 18V6l10-2v12M9 18a3 3 0 11-6 0 3 3 0 016 0zM19 16a3 3 0 11-6 0 3 3 0 016 0z",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  bell: "M6 16v-5a6 6 0 0112 0v5l2 2H4zM10 20h4",
  bellOff: "M6 16v-5a6 6 0 019-5M18 11v5l2 2H6M10 20h4M3 3l18 18",
  folder: "M3 6h6l2 2h10v11H3z",
  clip: "M8 4h8v3H8zM6 5h12v16H6z",
  sliders: "M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4M6 15v4",
  grid: "M6 6h.01M12 6h.01M18 6h.01M6 12h.01M12 12h.01M18 12h.01M6 18h.01M12 18h.01M18 18h.01",
  headphones: "M4 14v-2a8 8 0 0116 0v2M4 14h3v5H4zM17 14h3v5h-3z",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  prev: "M19 5v14L8 12zM5 5v14",
  next: "M5 5v14l11-7zM19 5v14",
  volume: "M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11",
  volumeOff: "M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  wifi: "M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01",
  bluetooth: "M7 7l10 10-5 5V2l5 5L7 17",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  battery: "M3 8h15v8H3zM21 11v2M6 11v2",
  bolt: "M13 3L5 13h6l-1 8 8-10h-6z",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 11a3 3 0 100 6 3 3 0 000-6z",
  scissors: "M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM8.1 7.9L20 20M8.1 16.1L20 4",
  record: "M12 5a7 7 0 100 14 7 7 0 000-14z",
  plus: "M12 5v14M5 12h14",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  x: "M6 6l12 12M18 6L6 18",
  phone: "M7 3h10v18H7zM11 18h2",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01",
  video: "M4 5h16v14H4zM10 9l5 3-5 3z",
  doc: "M7 3h7l4 4v14H7zM14 3v4h4",
  archive: "M4 7h16v13H4zM3 4h18v3H3zM10 11h4",
  mic: "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4",
  micOff: "M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4M4 4l16 16",
  down: "M12 4v14M6 12l6 6 6-6",
  chevronDown: "M6 9l6 6 6-6",
} as const;
export type IconName = keyof typeof P;
export function I({ n, s = 20, fill }: { n: IconName; s?: number; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n]} />
    </svg>
  );
}
