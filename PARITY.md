# Parity checklist (Swift archive → Electron)

Reference: `archive/swiftui/` · branch `archive/swiftui` · tag `swiftui-archive`

## Shell & storage
- [x] Menu bar / tray accessory app (`LSUIElement`)
- [x] Onboarding: Screen Recording → Accessibility → save folder
- [x] Settings: destination, AI connect, shortcuts list, permissions
- [x] History manifest under Application Support `Grabbit`
- [x] Gemini key in encrypted local storage (safeStorage)
- [x] Destination folder mirror file migration

## Capture & record
- [x] Full screen screenshot (+ clipboard)
- [x] Region screenshot (overlay + crop / helper)
- [x] Window picker UI
- [x] Capture Bar
- [x] Recording via desktopCapturer + MediaRecorder (WebM)
- [x] Mic toggle
- [x] Esc / tray stop recording
- [x] Post-capture toast → annotate
- [x] Native helper ScreenCaptureKit path when built
- [ ] System audio mux parity with AVAssetWriter (helper follow-up)
- [ ] Recording backgrounds live composite (UI toggle present; encode path TBD)

## Annotate
- [x] Screenshot tools: select, spotlight, crop, text, stickers, draw, arrow, rect
- [x] Ship It export (overwrite PNG)
- [x] Backgrounds + side-by-side
- [x] Video annotate: timeline, zoom markers, text overlays
- [ ] Full AnnotatedVideoExporter re-encode via helper

## Library
- [x] Show All grid, search, rename, project tags
- [x] Reveal in Finder, delete
- [x] Drag capture id / project assignment
- [x] Intro modal
- [x] Tray recents (3)

## Auto Organize
- [x] Suggest → accept/dismiss only
- [x] Gemini BYOK path
- [x] Helper OCR + frontmost window signature
- [x] Apple FM provider toggle + helper hook
- [ ] Full FoundationModels content tagging on supported OS

## Hotkeys & packaging
- [x] ⌘⇧3 / ⌘⇧4 / ⌘⇧5 / ⌘7 / ⌘,
- [x] electron-builder mac DMG (`grabbit-swiftui.dmg`)
- [x] Entitlements + usage description strings
- [ ] Notarization automation in CI
