import { Menu, Tray, nativeImage, app, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { listCaptures } from './storage/history'
import { takeScreenshot } from './capture/captureService'
import {
  beginRecording,
  cancelRecording,
  getRecordingState
} from './capture/recordingService'
import {
  showAnnotate,
  showCaptureBar,
  showLibrary,
  showRegionPicker,
  showSettings,
  showWindowPicker,
  setTrayRecordingHandler
} from './windows/windowManager'
import { getSettings } from './storage/settings'

let tray: Tray | null = null
let timer: NodeJS.Timeout | null = null

/** Resolve tray rabbit PNG (Swift MenuBarIcon) across dev + packaged layouts. */
function trayIconCandidates(): string[] {
  const roots = [
    path.join(__dirname, '../../resources'),
    path.join(__dirname, '../resources'),
    path.join(app.getAppPath(), 'resources'),
    path.join(process.resourcesPath || '', 'resources'),
    path.join(process.cwd(), 'resources')
  ]
  const names = ['trayTemplate.png', 'MenuBarIcon.png', 'trayTemplate.svg']
  const out: string[] = []
  for (const root of roots) {
    for (const name of names) {
      out.push(path.join(root, name))
    }
  }
  return out
}

function trayIcon(): Electron.NativeImage {
  for (const candidate of trayIconCandidates()) {
    try {
      if (!fs.existsSync(candidate)) continue
      if (candidate.endsWith('.svg')) continue // Electron tray SVG often yields empty
      const img = nativeImage.createFromPath(candidate)
      if (img.isEmpty()) continue
      // Menu bar template: black glyph → system tints for light/dark
      const sized = img.resize({ width: 22, height: 11, quality: 'best' })
      sized.setTemplateImage(true)
      return sized
    } catch {
      /* try next */
    }
  }
  // Last resort: 16×16 filled template so the item still appears
  const fallback = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6aAAAAAElFTkSuQmCC'
  )
  fallback.setTemplateImage(true)
  return fallback
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function rebuildMenu(): void {
  if (!tray) return
  const recents = listCaptures().slice(0, 3)
  const recording = getRecordingState().active

  const recentItems = recents.map((r) => ({
    label: r.displayName || path.basename(r.path),
    click: () => {
      showAnnotate({ captureId: r.id, path: r.path, kind: r.kind })
    }
  }))

  const menu = Menu.buildFromTemplate([
    {
      label: recording ? 'Stop Recording' : 'Capture Bar',
      click: () => {
        if (recording) {
          for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('record:request-stop')
          }
          cancelRecording()
          rebuildMenu()
        } else {
          showCaptureBar()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Grab Full Screen',
      accelerator: 'Command+Shift+3',
      click: () => void takeScreenshot('fullscreen')
    },
    {
      label: 'Grab Region',
      accelerator: 'Command+Shift+4',
      click: async () => {
        const region = await showRegionPicker()
        if (region && region.width > 2 && region.height > 2) {
          await takeScreenshot('region', { region })
        }
      }
    },
    {
      label: 'Grab Window',
      click: () => showWindowPicker()
    },
    {
      label: 'Record Screen',
      click: async () => {
        const settings = getSettings()
        await beginRecording({ mode: 'fullscreen', micEnabled: settings.micEnabledDefault })
        showCaptureBar()
        rebuildMenu()
      }
    },
    { type: 'separator' },
    ...(recentItems.length
      ? ([{ label: 'Recents', enabled: false }, ...recentItems, { type: 'separator' as const }] as const)
      : []),
    {
      label: 'Show All',
      accelerator: 'Command+7',
      click: () => showLibrary()
    },
    {
      label: 'Settings…',
      accelerator: 'Command+,',
      click: () => showSettings()
    },
    { type: 'separator' },
    { label: 'Quit Grabbit', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
}

export function createTray(): Tray {
  tray = new Tray(trayIcon())
  tray.setToolTip('Grabbit')
  tray.on('click', () => {
    if (getRecordingState().active) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('record:request-stop')
      }
    } else {
      showCaptureBar()
    }
  })
  rebuildMenu()

  setTrayRecordingHandler((active) => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    if (active) {
      timer = setInterval(() => {
        const st = getRecordingState()
        if (st.active && st.startedAt && tray) {
          tray.setTitle(formatElapsed(Date.now() - st.startedAt))
        }
      }, 500)
    } else if (tray) {
      tray.setTitle('')
    }
    rebuildMenu()
  })

  return tray
}

export function refreshTrayMenu(): void {
  rebuildMenu()
}
