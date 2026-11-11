# Notch (phase 2)
Dynamic Island-style notch for Windows 10/11. Tauri 2 + React + TypeScript + Motion.

Setup: install Rust, Node 18+ and WebView2. Then `npm install` and `npm run tauri dev` (`npm run tauri build` for an installer).

Hover the top-centre of the screen to open.
Phase 2 adds: Clipboard cards (text, links, images, files, snippets), Shelf (drag files in, Send to phone via QR), and a Notch / Full pill / Hole punch collapsed style in Settings.
Working tabs: Music (art, seek, colour glow), Clipboard (in-memory text), Widgets (clock, tasks, weather, battery), Tools (Snip, Record, 6 shortcut slots), Settings.
Chat overlay needs Windows notification access: not built yet. Sites, Notifications, Shelf, Controls and Call come in later phases.
