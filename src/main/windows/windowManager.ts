import { BrowserWindow, app, nativeImage, screen, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type { AnnotatePayload, RendererRoute, ToastPayload } from '../../shared/types'
import { getSettings, setSettings } from '../storage/settings'

const routePayloads = new Map<number, unknown>()
const windows = new Map<string, BrowserWindow>()

let trayRecording = false
let onTrayRecording: ((active: boolean) => void) | null = null

/**
 * Mirrors Swift AppDockPresentation: accessory (menu-bar only) by default;
 * flip to regular Dock presence while Capture Library (Show All) is open.
 */
function isLibraryPresented(): boolean {
  const win = windows.get('library')
  if (!win || win.isDestroyed()) return false
  return win.isVisible() || win.isMinimized()
}

function dockIcon(): Electron.NativeImage | null {
  // Prefer full-color bunny — never the menu-bar template (reads as blank in Dock).
  const candidates = [
    path.join(__dirname, '../../resources/dockIcon.png'),
    path.join(app.getAppPath(), 'resources/dockIcon.png'),
    path.join(process.cwd(), 'resources/dockIcon.png')
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const img = nativeImage.createFromPath(p)
      if (!img.isEmpty()) return img
    } catch {
      /* try next */
    }
  }
  return null
}

function presentLibraryInDock(): void {
  if (process.platform !== 'darwin') return
  const icon = dockIcon()
  if (icon) app.dock?.setIcon(icon)
  // Electron: dock.show() ↔ NSApp.setActivationPolicy(.regular)
  void app.dock?.show()
}

function hideFromDockIfNeeded(): void {
  if (process.platform !== 'darwin') return
  if (isLibraryPresented()) return
  app.dock?.hide()
}

export function setTrayRecordingHandler(handler: (active: boolean) => void): void {
  onTrayRecording = handler
}

export function updateTrayRecording(active: boolean): void {
  trayRecording = active
  onTrayRecording?.(active)
}

export function isTrayRecording(): boolean {
  return trayRecording
}

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function rendererUrl(route: RendererRoute): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return `${process.env.ELECTRON_RENDERER_URL}#/${route}`
  }
  return `file://${path.join(__dirname, '../renderer/index.html')}#/${route}`
}

function createWindow(
  key: string,
  route: RendererRoute,
  opts: Electron.BrowserWindowConstructorOptions,
  payload?: unknown
): BrowserWindow {
  const existing = windows.get(key)
  if (existing && !existing.isDestroyed()) {
    if (payload !== undefined) routePayloads.set(existing.id, payload)
    existing.show()
    existing.focus()
    existing.webContents.send('route:navigate', route)
    return existing
  }

  const win = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    ...opts
  })

  win.setTitle(`grabbit:${route}`)
  if (payload !== undefined) routePayloads.set(win.id, payload)

  win.on('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('closed', () => {
    routePayloads.delete(win.id)
    windows.delete(key)
  })

  void win.loadURL(rendererUrl(route))
  windows.set(key, win)
  return win
}

export function getRoutePayload(webContentsId: number): unknown {
  const win = BrowserWindow.getAllWindows().find((w) => w.webContents.id === webContentsId)
  if (!win) return null
  return routePayloads.get(win.id) ?? null
}

function bringLibraryFront(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  presentLibraryInDock()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  app.focus({ steal: true })
  win.moveTop()
}

export function showLibrary(): BrowserWindow {
  const settings = getSettings()
  // Show All → appear in Dock like Swift AppDockPresentation.presentLibraryWindow()
  presentLibraryInDock()

  const existing = windows.get('library')
  if (existing && !existing.isDestroyed()) {
    bringLibraryFront(existing)
    // Retries: status-menu untracking often reactivates the prior app (Swift parity)
    setTimeout(() => bringLibraryFront(existing), 50)
    setTimeout(() => bringLibraryFront(existing), 180)
    return existing
  }

  const win = createWindow('library', 'library', {
    width: settings.libraryWidth || 1100,
    height: settings.libraryHeight || 740,
    minWidth: 800,
    minHeight: 520,
    titleBarStyle: 'hiddenInset',
    // Sit traffic lights inside the primary rail
    trafficLightPosition: { x: 20, y: 18 },
    backgroundColor: '#F5F5F5',
    skipTaskbar: false
  })

  win.on('close', () => {
    // Persist size like Swift windowWillClose
    const [width, height] = win.getSize()
    setSettings({ libraryWidth: width, libraryHeight: height })
  })
  win.on('closed', () => {
    // Defer so the map entry is cleared first (createWindow already deletes on closed)
    setTimeout(() => hideFromDockIfNeeded(), 0)
  })
  win.once('ready-to-show', () => {
    bringLibraryFront(win)
    setTimeout(() => bringLibraryFront(win), 50)
    setTimeout(() => bringLibraryFront(win), 180)
  })

  return win
}

export function showSettings(): BrowserWindow {
  return createWindow('settings', 'settings', {
    width: 520,
    height: 640,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F5F5F5'
  })
}

/** DEBUG design-system gallery — mirrors KitchenSinkWindow (780×640). */
export function showKitchenSink(): BrowserWindow {
  return createWindow('kitchen-sink', 'kitchen-sink', {
    width: 780,
    height: 640,
    minWidth: 640,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#F5F5F5',
    alwaysOnTop: true
  })
}

export function showOnboarding(): BrowserWindow {
  return createWindow('onboarding', 'onboarding', {
    width: 480,
    height: 560,
    resizable: false,
    maximizable: false,
    minimizable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#121214'
  })
}

export function showCaptureBar(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  // CaptureBar.swift computeBarLayout(): 8 + 36 + 6×58 + 3×17 + ~82 + 8 ≈ 533
  const width = 533
  // Hover toast (~40) + options (52) + gap (6) + bar (52) + bottom breathing room
  const height = 168
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  // 24pt above the visible frame's bottom edge (CaptureBar.repositionOnScreen)
  const y = Math.round(display.workArea.y + display.workArea.height - height - 24)
  return createWindow(
    'capture-bar',
    'capture-bar',
    {
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: true,
      // Fully clear — frosted fill lives on the two pills (bar + options), like
      // separate NSVisualEffectView .menu layers with a transparent window between.
      backgroundColor: '#00000000'
    }
  )
}

export function showRegionPicker(): Promise<{
  x: number
  y: number
  width: number
  height: number
} | null> {
  return new Promise((resolve) => {
    const display = screen.getPrimaryDisplay()
    const win = createWindow('region', 'region', {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      hasShadow: false,
      backgroundColor: '#00000000'
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setIgnoreMouseEvents(false)

    const finish = (result: { x: number; y: number; width: number; height: number } | null) => {
      if (!win.isDestroyed()) win.close()
      resolve(result)
    }

    win.webContents.once('ipc-message', () => {
      /* handled via ipc main */
    })

    pendingRegionResolve = finish
  })
}

let pendingRegionResolve:
  | ((result: { x: number; y: number; width: number; height: number } | null) => void)
  | null = null

export function resolveRegionSelection(
  result: { x: number; y: number; width: number; height: number } | null
): void {
  pendingRegionResolve?.(result)
  pendingRegionResolve = null
}

export function showWindowPicker(): BrowserWindow {
  return createWindow('window-pick', 'window-pick', {
    width: 640,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#00000000'
  })
}

export function showAnnotate(payload: AnnotatePayload): BrowserWindow {
  const route = payload.kind === 'recording' ? 'video-annotate' : 'annotate'
  return createWindow(
    `annotate-${payload.captureId}`,
    route,
    {
      width: 1100,
      height: 780,
      minWidth: 800,
      minHeight: 560,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#0b0b0c'
    },
    payload
  )
}

export function showToast(payload: ToastPayload): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const width = 280
  const height = 160
  const x = Math.round(display.workArea.x + display.workArea.width - width - 20)
  const y = Math.round(display.workArea.y + 20)
  return createWindow(
    'toast',
    'toast',
    {
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      hasShadow: true,
      backgroundColor: '#00000000'
    },
    payload
  )
}

export function revealInFinder(filePath: string): void {
  shell.showItemInFolder(filePath)
}

export function closeWindowByKey(key: string): void {
  const win = windows.get(key)
  if (win && !win.isDestroyed()) win.close()
}
