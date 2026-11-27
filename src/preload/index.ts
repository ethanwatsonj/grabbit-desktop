import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'

const api = {
  settingsGet: () => ipcRenderer.invoke(IPC.settingsGet),
  settingsSet: (partial: unknown) => ipcRenderer.invoke(IPC.settingsSet, partial),
  settingsPickFolder: () => ipcRenderer.invoke(IPC.settingsPickFolder),
  historyList: () => ipcRenderer.invoke(IPC.historyList),
  libraryBrowse: (relativePath: string, view: string) =>
    ipcRenderer.invoke(IPC.libraryBrowse, relativePath, view),
  historyGet: (id: string) => ipcRenderer.invoke(IPC.historyGet, id),
  historyUpdate: (id: string, patch: unknown) => ipcRenderer.invoke(IPC.historyUpdate, id, patch),
  historyDelete: (id: string) => ipcRenderer.invoke(IPC.historyDelete, id),
  historyReveal: (id: string) => ipcRenderer.invoke(IPC.historyReveal, id),
  captureFullscreen: () => ipcRenderer.invoke(IPC.captureFullscreen),
  captureRegion: () => ipcRenderer.invoke(IPC.captureRegion),
  captureWindow: () => ipcRenderer.invoke(IPC.captureWindow),
  captureBarShow: () => ipcRenderer.invoke(IPC.captureBarShow),
  listWindows: () => ipcRenderer.invoke('capture:list-windows'),
  recordStart: (opts: unknown) => ipcRenderer.invoke(IPC.recordStart, opts),
  recordStop: (tempPath?: string) => ipcRenderer.invoke(IPC.recordStop, tempPath),
  recordStatus: () => ipcRenderer.invoke(IPC.recordStatus),
  recordTempPath: () => ipcRenderer.invoke('record:temp-path'),
  recordWriteAndFinalize: (base64: string) => ipcRenderer.invoke('record:write-and-finalize', base64),
  annotateOpen: (id: string) => ipcRenderer.invoke(IPC.annotateOpen, id),
  annotateSave: (id: string, dataUrl: string) => ipcRenderer.invoke(IPC.annotateSave, id, dataUrl),
  libraryShow: () => ipcRenderer.invoke(IPC.libraryShow),
  settingsShow: () => ipcRenderer.invoke(IPC.settingsShow),
  kitchenSinkShow: () => ipcRenderer.invoke(IPC.kitchenSinkShow),
  kitchenSinkToast: (message: string, withAction?: boolean) =>
    ipcRenderer.invoke(IPC.kitchenSinkToast, message, withAction),
  onboardingComplete: () => ipcRenderer.invoke(IPC.onboardingComplete),
  permissionsScreen: () => ipcRenderer.invoke(IPC.permissionsScreen),
  permissionsAccessibility: () => ipcRenderer.invoke(IPC.permissionsAccessibility),
  permissionsOpenScreen: () => ipcRenderer.invoke(IPC.permissionsOpenScreen),
  permissionsOpenAccessibility: () => ipcRenderer.invoke(IPC.permissionsOpenAccessibility),
  aiStatus: () => ipcRenderer.invoke(IPC.aiStatus),
  aiConnectGemini: (key: string) => ipcRenderer.invoke(IPC.aiConnectGemini, key),
  aiDisconnectGemini: () => ipcRenderer.invoke(IPC.aiDisconnectGemini),
  aiSetProvider: (provider: string) => ipcRenderer.invoke(IPC.aiSetProvider, provider),
  organizeSuggest: (id: string) => ipcRenderer.invoke(IPC.organizeSuggest, id),
  organizeApply: (suggestion: unknown) => ipcRenderer.invoke(IPC.organizeApply, suggestion),
  organizeDismiss: () => ipcRenderer.invoke(IPC.organizeDismiss),
  toastOpenAnnotate: (id: string) => ipcRenderer.invoke(IPC.toastOpenAnnotate, id),
  toastDismiss: () => ipcRenderer.invoke(IPC.toastDismiss),
  regionSelected: (region: unknown) => ipcRenderer.send(IPC.regionSelected, region),
  regionCancel: () => ipcRenderer.send(IPC.regionCancel),
  windowSelected: (sourceId: string) => ipcRenderer.invoke(IPC.windowSelected, sourceId),
  windowCancel: () => ipcRenderer.send(IPC.windowCancel),
  helperStatus: () => ipcRenderer.invoke(IPC.helperStatus),
  getRoutePayload: () => ipcRenderer.invoke(IPC.getRoutePayload),
  readFileDataUrl: (filePath: string) => ipcRenderer.invoke('file:read-data-url', filePath),
  quit: () => ipcRenderer.invoke(IPC.appQuit),
  onRecordRequestStop: (cb: () => void): (() => void) => {
    const listener = () => cb()
    ipcRenderer.on('record:request-stop', listener)
    return () => {
      ipcRenderer.removeListener('record:request-stop', listener)
    }
  }
}

contextBridge.exposeInMainWorld('grabbit', api)

export type GrabbitApi = typeof api
