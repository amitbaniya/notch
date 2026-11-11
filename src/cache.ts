import { invoke } from "@tauri-apps/api/core";

// Brightness is slow to read (PowerShell/WMI), so keep the last known value and refresh it in the background.
const K = "notch_br";
export const brCache = { v: (() => { try { const x = localStorage.getItem(K); return x === null ? -2 : Number(x); } catch { return -2; } })() };
export const saveBr = (v: number) => { brCache.v = v; try { localStorage.setItem(K, String(v)); } catch {} };
export const refreshBr = () => invoke<number>("get_brightness").then((v) => { saveBr(v); return v; });
