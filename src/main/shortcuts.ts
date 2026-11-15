import { globalShortcut, app, BrowserWindow } from 'electron'
import { takeScreenshot } from './capture/captureService'
import { getRecordingState, cancelRecording } from './capture/recordingService'
import {
  showCaptureBar,
  showLibrary,
  showRegionPicker,
  showSettings
} from './windows/windowManager'
import { getSettings } from './storage/settings'
import { showOnboarding } from './windows/windowManager'

export function registerShortcuts(): void {
  const settings = getSettings()
  if (!settings.onboardingComplete) {
    // Still register; onboarding may complete mid-session
  }

  const bind = (accel: string, fn: () => void) => {
    try {
      globalShortcut.register(accel, fn)
    } catch (err) {
      console.warn('Failed to register shortcut', accel, err)
    }
  }

  bind('Command+Shift+3', () => {
    void takeScreenshot('fullscreen')
  })

  bind('Command+Shift+4', () => {
    void (async () => {
      const region = await showRegionPicker()
      if (region && region.width > 2 && region.height > 2) {
        await takeScreenshot('region', { region })
      }
    })()
  })

  bind('Command+Shift+5', () => {
    showCaptureBar()
  })

  bind('Command+7', () => {
    showLibrary()
  })

  bind('Command+,', () => {
    showSettings()
  })

  bind('Escape', () => {
    if (getRecordingState().active) {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('record:request-stop')
      }
      cancelRecording()
    }
  })
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}

export function ensureOnboarding(): void {
  const settings = getSettings()
  if (!settings.onboardingComplete) {
    showOnboarding()
  }
}

app.on('will-quit', () => {
  unregisterShortcuts()
})
