import { BrowserWindow, screen, shell } from 'electron'
import path from 'path'
import type { AnnotatePayload, RendererRoute, ToastPayload } from '../../shared/types'
import { getSettings } from '../storage/settings'

const routePayloads = new Map<number, unknown>()
const windows = new Map<string, BrowserWindow>()

let trayRecording = false
let onTrayRecording: ((active: boolean) => void) | null = null

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

export function showLibrary(): BrowserWindow {
  const settings = getSettings()
  return createWindow('library', 'library', {
    width: settings.libraryWidth || 1024,
    height: settings.libraryHeight || 720,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0f0f10'
  })
}

export function showSettings(): BrowserWindow {
  return createWindow('settings', 'settings', {
    width: 520,
    height: 640,
    resizable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#121214'
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
  const width = 420
  const height = 72
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + 24)
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
