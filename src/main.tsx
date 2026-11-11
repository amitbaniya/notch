import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// No browser behaviour inside the island: no right-click menu, no zooming, and (in the installed app) no refresh/print/devtools keys.
window.addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  const zoom = e.ctrlKey && (["+", "-", "=", "0"].includes(k));
  const browser = e.key === "F5" || e.key === "F12" || (e.ctrlKey && ["r", "p", "u", "s", "f", "g"].includes(k)) || (e.ctrlKey && e.shiftKey && ["i", "j", "c", "r"].includes(k));
  if (zoom || (import.meta.env.PROD && browser)) e.preventDefault();
});
createRoot(document.getElementById("root")!).render(<App />);
