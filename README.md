# Notch

<div align="center">
  <img src="src-tauri/icons/icon.png" alt="Notch Logo" width="128" height="128">
  
  **Dynamic Island-style notch for Windows 10/11**
  
  Built with Tauri 2 · React · TypeScript · Motion
  
  [![Release](https://img.shields.io/github/v/release/amitbaniya/notch?include_prereleases&cacheSeconds=0)](https://github.com/amitbaniya/notch/releases)
  [![License](https://img.shields.io/github/license/amitbaniya/notch?cacheSeconds=0)](https://github.com/amitbaniya/notch/blob/main/LICENSE)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-orange)](https://tauri.app)
  <br><br>
  <a href="https://buymemomo.com/amitbaniya" target="_blank">
    <img src="https://img.shields.io/badge/Buy%20Me%20Momo-C25223?style=for-the-badge&logo=data:image/png;base64,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..." alt="Buy Me Momo">
  </a>
</div>

---

## Preview

<div align="center">
  <!-- Replace with actual screenshot/GIF when available -->
  <img src="https://via.placeholder.com/800x400/1a1a2e/ffffff?text=Notch+Preview+Screenshot+or+GIF+Here" alt="Notch Preview" width="800">
  <p><em>Add a screenshot or GIF of Notch in action here</em></p>
</div>

---

## Features

| Feature | Description |
|---------|-------------|
| **Dynamic Island** | Hover top-center to expand, auto-collapses |
| **Music** | Album art, seek bar, color glow from artwork |
| **Sites** | Pinned web apps in own windows, stay signed in |
| **Notifications** | Read from Windows toast database (WhatsApp, Discord, Telegram, etc.) |
| **Clipboard** | History with text, links, images, files, snippets |
| **Shelf** | Drag & drop files, send to phone via QR code |
| **Controls** | Brightness, volume, Wi-Fi, Bluetooth, power plan |
| **Call** | Mic mute with live level, speaker volume, camera check |
| **Audio Mixer** | Per-app volume with real app icons |
| **Gaming Bar** | FPS counter (via PresentMon), appears in fullscreen games |
| **Settings** | Shape (Island/Notch/Hole punch), themes, startup, visualizers |

---

## Installation

### For Users (Recommended)

Download the latest installer from the [Releases page](https://github.com/amitbaniya/notch/releases):

1. Download `Notch_<version>_x64-setup.exe`
2. Run the installer (per-user, no admin required)
3. WebView2 will be installed automatically if needed (requires internet)
4. Launch Notch from Start Menu

### For Developers

#### Prerequisites
- **Rust** (latest stable) — [Install Rust](https://rustup.rs)
- **Node.js 18+** — [Download Node](https://nodejs.org)
- **WebView2 Runtime** — [Download WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (or let the installer handle it)

#### Setup
```bash
# Clone the repository
git clone https://github.com/amitbaniya/notch.git
cd notch

# Install dependencies
npm install

# Start development server
npm run tauri dev

# Build installer
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/Notch_<version>_x64-setup.exe
```

#### Development Commands
```bash
npm run dev          # Vite dev server only
npm run build        # TypeScript + Vite production build
npm run tauri dev    # Full Tauri dev (Rust + Vite)
npm run tauri build  # Full Tauri build (creates installer)
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Hover top-center` | Open/expand Notch |
| `Ctrl + Alt + N` | Hide Notch (shows handle) |
| `Click handle` | Restore Notch |
| `Alt + F4` | Blocked (quit from Settings) |
| `Hover tab icon` | Switch tabs (configurable) |

Volume/brightness/mute keys show feedback on the island (configurable in Settings).

---

## Configuration

Settings are persisted and include:
- **Appearance**: Shape (Island/Notch/Hole punch), surface themes, progress bar styles, visualizer
- **Behavior**: Open at startup, hover-to-switch tabs, shortcut feedback
- **Sizes**: Separate Notch size and Open size sliders
- **Gaming**: FPS counter size, notification peek
- **Notifications**: Test button, size slider

---

## Third-Party Components

- **PresentMon** (Intel, MIT License) — FPS counter for gaming bar
  - Bundled: `src-tauri/resources/PresentMon.exe` v2.6.0
  - Source: [GameTechDev/PresentMon](https://github.com/GameTechDev/PresentMon)
  - License: `src-tauri/resources/PresentMon-LICENSE.txt`
  - Requires "Performance Log Users" group membership (one-time admin setup)

---

## Project Structure

```
notch/
├── src/                    # React frontend
│   ├── components/         # UI components (Tabs, Bubbles, etc.)
│   ├── hooks/              # Custom React hooks
│   ├── types.ts            # TypeScript types
│   └── main.tsx            # Entry point
├── src-tauri/              # Tauri/Rust backend
│   ├── src/main.rs         # Rust entry point
│   ├── resources/          # Bundled binaries (PresentMon)
│   ├── icons/              # App icons
│   └── tauri.conf.json     # Tauri configuration
├── dist/                   # Built frontend (generated)
└── package.json            # Node scripts & dependencies
```

---

## License

MIT License — see [LICENSE](https://github.com/amitbaniya/notch/blob/main/LICENSE) for details.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/amitbaniya">amitbaniya</a>
  <br>
  <sub>Inspired by <a href="https://notchpixel.com/">NotchPixel</a> — Dynamic Island for Windows</sub>
</div>