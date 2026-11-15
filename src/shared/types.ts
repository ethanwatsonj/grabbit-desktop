export type CaptureKind = 'screenshot' | 'recording'

export type CaptureMode = 'fullscreen' | 'region' | 'window'

export type OrganizeProvider = 'appleFM' | 'gemini'

export interface WindowSignature {
  bundleID?: string
  appName?: string
  windowTitle?: string
  url?: string
}

export interface CaptureRecord {
  id: string
  kind: CaptureKind
  path: string
  createdAt: string
  thumbnailPath?: string
  projectTag?: string
  customTags: string[]
  windowSignature?: WindowSignature
  displayName?: string
}

export interface HistoryManifest {
  version: 1
  items: CaptureRecord[]
}

export interface AppSettings {
  destinationFolder: string | null
  onboardingComplete: boolean
  libraryIntroSeen: boolean
  organizeProvider: OrganizeProvider
  libraryWidth: number
  libraryHeight: number
  recordingBackground: 'none' | 'warm' | 'cool' | 'midnight' | 'custom'
  micEnabledDefault: boolean
}

export interface OrganizeSuggestion {
  captureId: string
  suggestedName: string
  suggestedProject?: string
  rationale?: string
  provider: OrganizeProvider | 'heuristic'
}

export interface CaptureResult {
  record: CaptureRecord
  openAnnotate: boolean
}

export type RendererRoute =
  | 'library'
  | 'settings'
  | 'onboarding'
  | 'annotate'
  | 'video-annotate'
  | 'capture-bar'
  | 'region'
  | 'window-pick'
  | 'toast'

export interface AnnotatePayload {
  captureId: string
  path: string
  kind: CaptureKind
}

export interface ToastPayload {
  captureId: string
  thumbnailDataUrl?: string
  path: string
  kind: CaptureKind
}
