# Notch (phase 4)
Dynamic Island-style notch for Windows 10/11. Tauri 2 + React + TypeScript + Motion.

Setup: install Rust, Node 18+ and WebView2. Then `npm install` and `npm run tauri dev` (`npm run tauri build` for an installer).

Hover the top-centre of the screen to open.
Tabs: Music, Sites, Notifications, Shelf, Clipboard, Controls, Tools, Audio (per-app mixer), Settings. Hover a tab icon to switch tabs (can be turned off). Ctrl+Alt+N hides Notch (a small handle stays at the top; click it to bring it back). Gaming bar (own size slider; opened with the arrow at its right end, never by hover) while a game is fullscreen; notification peek; glass look with transparency and separate Notch size and Open size sliders; Settings has an open-at-startup switch.
Phase 4 adds: Sites (own windows, stay signed in), Notifications and Chat overlay (read from the Windows toast database; WhatsApp, Instagram, Messenger, Telegram, Discord).
Settings > Appearance: Shape (Island / Notch / Hole punch), Surface themes, Progress bar styles, Visualizer, Background.
Phase 3 adds: Call (mic mute with live level, speaker volume + test, camera check) and Controls (brightness, volume, Wi-Fi, Bluetooth, mute, power plan; Night light and Focus open Windows Settings).
Phase 2 adds: Clipboard cards (text, links, images, files, snippets), Shelf (drag files in, Send to phone via QR), and a Notch / Full pill / Hole punch collapsed style in Settings.
Working tabs: Music (art, seek, colour glow), Clipboard (in-memory text), Widgets (clock, tasks, weather, battery), Tools (Snip, Record, 6 shortcut slots), Settings.
Chat overlay needs Windows notification access: not built yet. Sites, Notifications, Shelf, Controls and Call come in later phases.

## Making an installer
`npm run tauri build` -> `src-tauri/target/release/bundle/nsis/Notch_0.1.0_x64-setup.exe`
Copy that one file to any Windows 10/11 x64 PC and run it. No Rust or Node needed there.
It installs per-user (no admin prompt) and sets up WebView2 if the PC doesn't have it (needs internet).
