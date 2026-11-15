import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { createTray, refreshTrayMenu } from './tray'
import { ensureOnboarding, registerShortcuts } from './shortcuts'
import { getSettings } from './storage/settings'

// Menu-bar style: hide dock icon on macOS
if (process.platform === 'darwin') {
  app.dock?.hide()
}

app.whenReady().then(() => {
  registerIpc()
  createTray()
  registerShortcuts()
  refreshTrayMenu()

  const settings = getSettings()
  if (!settings.onboardingComplete) {
    ensureOnboarding()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      ensureOnboarding()
    }
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
