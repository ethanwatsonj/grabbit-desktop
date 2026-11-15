import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, systemPreferences } from 'electron'
import fs from 'fs'
import { IPC } from '../shared/ipc'
import type { AppSettings, CaptureRecord, OrganizeSuggestion } from '../shared/types'
import { getSettings, setSettings, setOrganizeProvider } from './storage/settings'
import {
  deleteCapture,
  getCapture,
  listCaptures,
  moveCaptureToProject,
  updateCapture
} from './storage/history'
import { getGeminiApiKey, setGeminiApiKey } from './storage/secrets'
import { takeScreenshot, listWindowsForPicker } from './capture/captureService'
import {
  beginRecording,
  cancelRecording,
  finalizeRecording,
  getRecordingState,
  recordingTempPath
} from './capture/recordingService'
import {
  getHelperStatus,
  openAccessibilityPrefs,
  openScreenRecordingPrefs
} from './helper/nativeHelper'
import { applyOrganize, suggestOrganize } from './organize/organizeService'
import {
  closeWindowByKey,
  getRoutePayload,
  resolveRegionSelection,
  revealInFinder,
  showAnnotate,
  showCaptureBar,
  showLibrary,
  showOnboarding,
  showRegionPicker,
  showSettings,
  showWindowPicker
} from './windows/windowManager'
import { refreshTrayMenu } from './tray'

export function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, partial: Partial<AppSettings>) => {
    const next = setSettings(partial)
    refreshTrayMenu()
    return next
  })
  ipcMain.handle(IPC.settingsPickFolder, async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return getSettings()
    return setSettings({ destinationFolder: res.filePaths[0] })
  })

  ipcMain.handle(IPC.historyList, () => listCaptures())
  ipcMain.handle(IPC.historyGet, (_e, id: string) => getCapture(id))
  ipcMain.handle(IPC.historyUpdate, (_e, id: string, patch: Partial<CaptureRecord>) => {
    if (patch.projectTag !== undefined) {
      return moveCaptureToProject(id, patch.projectTag || undefined)
    }
    return updateCapture(id, patch)
  })
  ipcMain.handle(IPC.historyDelete, (_e, id: string) => {
    const ok = deleteCapture(id)
    refreshTrayMenu()
    return ok
  })
  ipcMain.handle(IPC.historyReveal, (_e, id: string) => {
    const item = getCapture(id)
    if (item) revealInFinder(item.path)
  })

  ipcMain.handle(IPC.captureFullscreen, async () => takeScreenshot('fullscreen'))
  ipcMain.handle(IPC.captureRegion, async () => {
    const region = await showRegionPicker()
    if (!region || region.width < 2 || region.height < 2) return null
    return takeScreenshot('region', { region })
  })
  ipcMain.handle(IPC.captureWindow, async () => {
    showWindowPicker()
    return null
  })
  ipcMain.handle(IPC.captureBarShow, () => {
    showCaptureBar()
  })

  ipcMain.handle(IPC.recordStart, async (_e, opts: { mode: 'fullscreen' | 'region' | 'window'; micEnabled: boolean }) => {
    return beginRecording(opts)
  })
  ipcMain.handle(IPC.recordStop, async (_e, tempPath?: string) => {
    if (tempPath) return finalizeRecording(tempPath)
    cancelRecording()
    return null
  })
  ipcMain.handle(IPC.recordStatus, () => getRecordingState())
  ipcMain.handle('record:temp-path', () => recordingTempPath())
  ipcMain.handle('record:write-and-finalize', async (_e, base64: string) => {
    const tempPath = recordingTempPath()
    fs.writeFileSync(tempPath, Buffer.from(base64, 'base64'))
    return finalizeRecording(tempPath)
  })
  ipcMain.handle('capture:list-windows', () => listWindowsForPicker())

  ipcMain.handle(IPC.annotateOpen, (_e, captureId: string) => {
    const item = getCapture(captureId)
    if (!item) return false
    showAnnotate({ captureId: item.id, path: item.path, kind: item.kind })
    return true
  })
  ipcMain.handle(IPC.annotateSave, async (_e, captureId: string, dataUrl: string) => {
    const item = getCapture(captureId)
    if (!item) return false
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(item.path, Buffer.from(base64, 'base64'))
    try {
      clipboard.writeImage(nativeImage.createFromPath(item.path))
    } catch {
      /* ignore */
    }
    return true
  })

  ipcMain.handle(IPC.libraryShow, () => showLibrary())
  ipcMain.handle(IPC.settingsShow, () => showSettings())
  ipcMain.handle(IPC.onboardingShow, () => showOnboarding())
  ipcMain.handle(IPC.onboardingComplete, () => {
    setSettings({ onboardingComplete: true })
    closeWindowByKey('onboarding')
    return getSettings()
  })

  ipcMain.handle(IPC.permissionsScreen, () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.getMediaAccessStatus('screen') === 'granted'
  })
  ipcMain.handle(IPC.permissionsAccessibility, () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.isTrustedAccessibilityClient(false)
  })
  ipcMain.handle(IPC.permissionsOpenScreen, () => openScreenRecordingPrefs())
  ipcMain.handle(IPC.permissionsOpenAccessibility, () => openAccessibilityPrefs())

  ipcMain.handle(IPC.aiStatus, async () => {
    const helper = await getHelperStatus()
    return {
      geminiConnected: Boolean(getGeminiApiKey()),
      appleFMAvailable: helper.appleFMAvailable,
      provider: getSettings().organizeProvider,
      helper
    }
  })
  ipcMain.handle(IPC.aiConnectGemini, (_e, apiKey: string) => {
    setGeminiApiKey(apiKey)
    return { geminiConnected: Boolean(getGeminiApiKey()) }
  })
  ipcMain.handle(IPC.aiDisconnectGemini, () => {
    setGeminiApiKey(null)
    return { geminiConnected: false }
  })
  ipcMain.handle(IPC.aiSetProvider, (_e, provider: 'appleFM' | 'gemini') => {
    setOrganizeProvider(provider)
    return getSettings()
  })

  ipcMain.handle(IPC.organizeSuggest, async (_e, captureId: string) => suggestOrganize(captureId))
  ipcMain.handle(IPC.organizeApply, (_e, suggestion: OrganizeSuggestion) => {
    const ok = applyOrganize(suggestion)
    refreshTrayMenu()
    return ok
  })
  ipcMain.handle(IPC.organizeDismiss, () => true)

  ipcMain.handle(IPC.toastOpenAnnotate, (_e, captureId: string) => {
    closeWindowByKey('toast')
    const item = getCapture(captureId)
    if (item) showAnnotate({ captureId: item.id, path: item.path, kind: item.kind })
  })
  ipcMain.handle(IPC.toastDismiss, () => closeWindowByKey('toast'))

  ipcMain.on(IPC.regionSelected, (_e, region) => {
    resolveRegionSelection(region)
  })
  ipcMain.on(IPC.regionCancel, () => {
    resolveRegionSelection(null)
  })
  ipcMain.handle(IPC.windowSelected, async (_e, _sourceId: string) => {
    closeWindowByKey('window-pick')
    // Window-specific crop still relies on helper; fallback to fullscreen
    return takeScreenshot('window')
  })
  ipcMain.on(IPC.windowCancel, () => closeWindowByKey('window-pick'))

  ipcMain.handle(IPC.helperStatus, () => getHelperStatus())
  ipcMain.handle(IPC.appQuit, () => app.quit())
  ipcMain.handle(IPC.getRoutePayload, (e) => getRoutePayload(e.sender.id))

  ipcMain.handle('file:read-data-url', (_e, filePath: string) => {
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    const ext = filePath.toLowerCase().endsWith('.png')
      ? 'png'
      : filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')
        ? 'jpeg'
        : filePath.toLowerCase().endsWith('.webm')
          ? 'webm'
          : filePath.toLowerCase().endsWith('.mp4')
            ? 'mp4'
            : 'png'
    if (ext === 'webm' || ext === 'mp4') {
      return `data:video/${ext};base64,${buf.toString('base64')}`
    }
    return `data:image/${ext};base64,${buf.toString('base64')}`
  })

  // Forward stop requests already handled via webContents.send
  void BrowserWindow
}
