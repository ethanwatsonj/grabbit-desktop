export type CaptureKind = 'screenshot' | 'recording' | 'audio'

export type LibraryPrimaryView = 'all' | 'media' | 'audio'

export interface LibraryFolderEntry {
  name: string
  relativePath: string
  itemCount: number
}

export interface LibraryBrowseResult {
  root: string
  relativePath: string
  folders: LibraryFolderEntry[]
  files: CaptureRecord[]
}

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

export type LibraryGroupBy = 'none' | 'project'
export type LibraryMediaKind = 'image' | 'video'
export type MultiSelectLayout = 'cards' | 'list'

export interface AppSettings {
  destinationFolder: string | null
  onboardingComplete: boolean
  libraryIntroSeen: boolean
  organizeProvider: OrganizeProvider
  libraryWidth: number
  libraryHeight: number
  recordingBackground: 'none' | 'warm' | 'cool' | 'midnight' | 'custom'
  micEnabledDefault: boolean
  libraryGroupBy: LibraryGroupBy
  /** Empty = show all media kinds (image + video). */
  libraryMediaFilter: LibraryMediaKind[]
  libraryMultiSelectLayout: MultiSelectLayout
  librarySidebarWidth: number
}

export interface OrganizeSuggestion {
  captureId: string
  suggestedName?: string | null
  suggestedProject?: string | null
  confidence: number
  rationale?: string
  provider: OrganizeProvider | 'heuristic'
}

/** Result of applying / reverting an organize action. File ids are path hashes, so `captureId` is the id after the move/rename. */
export interface OrganizeApplyResult {
  captureId: string
  path: string
  name: string
  projectTag?: string
}

export interface CaptureLocationSnapshot {
  name: string
  directoryPath: string
  projectTag?: string
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
  | 'kitchen-sink'

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
  /** Kitchen-sink / message-only toast copy */
  message?: string
  actionTitle?: string
}
