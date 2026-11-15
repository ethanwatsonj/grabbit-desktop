# grabbit-swiftui (Electron)

A free, native-feel macOS capture tool — screenshots, screen recording, annotations, Capture Library, and Auto Organize.

This repo’s **product on `main` is Electron** (Vite + React + TypeScript), with a **Swift/macOS helper** for ScreenCaptureKit, Vision OCR, and frontmost-window metadata.

## SwiftUI archive

The previous native SwiftUI/AppKit app is preserved for reference:

| Kind | Location |
|------|----------|
| Git branch | `archive/swiftui` |
| Git tag | `swiftui-archive` |
| In-repo copy | [`archive/swiftui/`](archive/swiftui/) |

Restore the old app tree:

```bash
git checkout archive/swiftui
```

## Requirements

- macOS 13+ (helper uses ScreenCaptureKit; Apple FM parity targets newer macOS)
- Node.js 20+
- Xcode / Swift toolchain (for `native/helper`)

## Build & run

```bash
npm install
make helper    # builds native/helper → grabbit-helper
npm run dev    # electron-vite
```

Or:

```bash
make install
make dev
```

The app is menu-bar only (`LSUIElement`) — look for the rabbit / tray icon.

## Permissions

On first launch, onboarding walks through:

1. **Screen Recording** — screenshots and recordings
2. **Accessibility** — global keyboard shortcuts
3. **Save folder** — where captures are written

## Default shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘⇧3 | Grab full screen |
| ⌘⇧4 | Grab region |
| ⌘⇧5 | Capture Bar |
| ⌘7 | Show All (Capture Library) |
| ⌘, | Settings |
| Esc | Stop recording |

## Architecture

- **Electron main** — tray, shortcuts, IPC, history, settings, Gemini BYOK (`safeStorage`)
- **React renderers** — library, settings, annotate, video annotate, capture bar, region/window overlays, toast, onboarding
- **`grabbit-helper`** — ScreenCaptureKit screenshots, Vision OCR, frontmost window signature; Apple FM hook point

History continues to use `~/Library/Application Support/Grabbit/` so existing manifests and destination mirrors migrate from the Swift app.

## Distribution

```bash
make dist
```

Produces `dist/grabbit-swiftui.dmg` via electron-builder (`appId`: `ewew.design.grabbit-swiftui`).

Notarize with your Developer ID flow after export.

## Version

Marketing version: **0.1.0**
