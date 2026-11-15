import { Menu, Tray, nativeImage, app, BrowserWindow } from 'electron'
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

function trayIcon(): Electron.NativeImage {
  const svgPath = path.join(app.getAppPath(), 'resources', 'trayTemplate.svg')
  // Fallback: empty template; electron-vite may pack resources differently
  try {
    const img = nativeImage.createFromPath(svgPath)
    if (!img.isEmpty()) {
      img.setTemplateImage(true)
      return img
    }
  } catch {
    /* fall through */
  }
  const fallback = nativeImage.createEmpty()
  // 16x16 black rabbit-ish template via data URL PNG is heavy; use empty + title
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
    { label: 'Quit grabbit-swiftui', click: () => app.quit() }
  ])

  tray.setContextMenu(menu)
}

export function createTray(): Tray {
  tray = new Tray(trayIcon())
  tray.setToolTip('grabbit-swiftui')
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
