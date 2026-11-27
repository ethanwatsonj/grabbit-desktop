import { app, BrowserWindow } from 'electron'
import { registerIpc } from './ipc'
import { createTray, refreshTrayMenu } from './tray'
import { ensureOnboarding, registerShortcuts } from './shortcuts'
import { getSettings } from './storage/settings'
import { showLibrary } from './windows/windowManager'

app.whenReady().then(() => {
  // Menu-bar accessory by default; Show All flips to Dock via presentLibraryInDock()
  if (process.platform === 'darwin') {
    app.dock?.hide()
  }

  registerIpc()
  createTray()
  registerShortcuts()
  refreshTrayMenu()

  const settings = getSettings()
  if (!settings.onboardingComplete) {
    ensureOnboarding()
  } else {
    // Open the file library so the primary rail is visible immediately
    // (also shows Dock icon while library is open — Swift AppDockPresentation)
    showLibrary()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const s = getSettings()
      if (!s.onboardingComplete) ensureOnboarding()
      else showLibrary()
    }
  })
})

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
