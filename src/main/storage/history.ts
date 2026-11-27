import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { CaptureKind, CaptureRecord, HistoryManifest, WindowSignature } from '../../shared/types'
import { formatCaptureFilename, manifestPath, thumbsDir } from './paths'
import { resolveDestination } from './destination'
import { listFilesInDestination } from './libraryBrowser'

const MAX_ITEMS = 500

function emptyManifest(): HistoryManifest {
  return { version: 1, items: [] }
}

/** Apple CFAbsoluteTime (seconds since 2001-01-01) → ISO string */
function appleTimeToIso(value: unknown): string {
  if (typeof value === 'string' && value.includes('T')) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Heuristic: Swift used CFAbsoluteTime (~8e8). Unix ms would be ~1e12.
    if (value > 1e12) return new Date(value).toISOString()
    if (value > 1e10) return new Date(value).toISOString() // unix ms-ish
    const appleEpochMs = Date.UTC(2001, 0, 1)
    return new Date(appleEpochMs + value * 1000).toISOString()
  }
  return new Date().toISOString()
}

function kindFromPath(filePath: string, fallback?: string): CaptureKind {
  const ext = path.extname(filePath).toLowerCase()
  if (['.m4a', '.mp3', '.wav', '.aac'].includes(ext)) return 'audio'
  if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) return 'recording'
  if (fallback === 'recording' || fallback === 'screenshot' || fallback === 'audio') {
    return fallback
  }
  return 'screenshot'
}

interface SwiftTag {
  id?: string
  name?: string
  kind?: string
}

interface SwiftCapture {
  id?: string
  path?: string
  kind?: string
  createdAt?: number | string
  thumbnailPath?: string
  tags?: SwiftTag[]
  displayName?: string
  projectTag?: string
  customTags?: string[]
  windowSignature?: WindowSignature
}

function projectFromTags(tags: SwiftTag[] | undefined): string | undefined {
  const project = tags?.find((t) => t.kind === 'project' && t.name)
  return project?.name
}

function projectFromPath(filePath: string, destRoot: string): string | undefined {
  const resolved = path.resolve(filePath)
  const root = path.resolve(destRoot)
  if (!resolved.startsWith(root + path.sep)) return undefined
  const rel = path.relative(root, resolved)
  const parts = rel.split(path.sep)
  if (parts.length >= 2) return parts[0]
  return undefined
}

function normalizeRecord(raw: SwiftCapture, destRoot: string): CaptureRecord | null {
  if (!raw.path) return null
  const customTags =
    raw.customTags ??
    (raw.tags || [])
      .filter((t) => t.kind !== 'project' && t.name)
      .map((t) => t.name as string)

  const projectTag =
    raw.projectTag || projectFromTags(raw.tags) || projectFromPath(raw.path, destRoot)

  return {
    id: raw.id || uuidv4(),
    kind: kindFromPath(raw.path, raw.kind),
    path: raw.path,
    createdAt: appleTimeToIso(raw.createdAt),
    thumbnailPath: raw.thumbnailPath,
    projectTag,
    customTags,
    windowSignature: raw.windowSignature,
    displayName: raw.displayName || path.parse(raw.path).name
  }
}

function parseManifestFile(raw: string, destRoot: string): HistoryManifest {
  try {
    const data = JSON.parse(raw) as unknown
    // Electron format
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as HistoryManifest).items)) {
      const items = (data as HistoryManifest).items
        .map((item) => normalizeRecord(item as SwiftCapture, destRoot))
        .filter((x): x is CaptureRecord => Boolean(x))
      return { version: 1, items }
    }
    // Swift format: bare array
    if (Array.isArray(data)) {
      const items = data
        .map((item) => normalizeRecord(item as SwiftCapture, destRoot))
        .filter((x): x is CaptureRecord => Boolean(x))
      return { version: 1, items }
    }
  } catch {
    /* fall through */
  }
  return emptyManifest()
}

export function loadManifest(): HistoryManifest {
  const destRoot = resolveDestination()
  const p = manifestPath()
  if (!fs.existsSync(p)) return emptyManifest()
  const parsed = parseManifestFile(fs.readFileSync(p, 'utf8'), destRoot)
  return parsed
}

function saveManifest(manifest: HistoryManifest): void {
  fs.writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), 'utf8')
}

/** One-shot rewrite of Swift array manifest into Electron shape (keeps same path). */
function persistNormalizedIfNeeded(items: CaptureRecord[]): void {
  const p = manifestPath()
  if (!fs.existsSync(p)) return
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
    if (Array.isArray(raw)) {
      saveManifest({ version: 1, items })
    }
  } catch {
    /* ignore */
  }
}

export function listCaptures(): CaptureRecord[] {
  // Library / tray source of truth: files under the Settings destination folder.
  const fromDisk = listFilesInDestination('all')
  if (fromDisk.length) return fromDisk.slice(0, MAX_ITEMS)

  // Fallback: migrated Swift manifest paths that still exist
  const manifest = loadManifest()
  const existing = manifest.items.filter((item) => {
    try {
      return fs.existsSync(item.path)
    } catch {
      return false
    }
  })
  if (existing.length) persistNormalizedIfNeeded(existing)
  return existing.slice(0, MAX_ITEMS)
}

export function getCapture(id: string): CaptureRecord | undefined {
  const fromDisk = listCaptures().find((c) => c.id === id)
  if (fromDisk) return fromDisk
  return loadManifest().items.find((c) => c.id === id)
}

export function updateCapture(id: string, patch: Partial<CaptureRecord>): CaptureRecord | undefined {
  const destRoot = resolveDestination()
  const manifest = loadManifest()
  let idx = manifest.items.findIndex((c) => c.id === id)
  if (idx < 0) {
    // Item may have come from folder scan — append then update
    const fromList = listCaptures().find((c) => c.id === id)
    if (!fromList) return undefined
    manifest.items = [fromList, ...manifest.items]
    idx = 0
  }
  manifest.items[idx] = {
    ...normalizeRecord({ ...manifest.items[idx], ...patch, id }, destRoot)!,
    ...patch,
    id
  }
  saveManifest(manifest)
  return manifest.items[idx]
}

export function deleteCapture(id: string): boolean {
  const item = getCapture(id)
  if (!item) return false
  const manifest = loadManifest()
  manifest.items = manifest.items.filter((c) => c.id !== id && c.path !== item.path)
  saveManifest(manifest)
  try {
    if (fs.existsSync(item.path)) fs.unlinkSync(item.path)
    if (item.thumbnailPath && fs.existsSync(item.thumbnailPath)) fs.unlinkSync(item.thumbnailPath)
  } catch {
    /* ignore */
  }
  return true
}

export { resolveDestination }

export function addCaptureFile(opts: {
  kind: CaptureKind
  sourcePath: string
  windowSignature?: WindowSignature
  projectTag?: string
  displayName?: string
}): CaptureRecord {
  const destRoot = resolveDestination()
  const projectDir = opts.projectTag ? path.join(destRoot, opts.projectTag) : destRoot
  fs.mkdirSync(projectDir, { recursive: true })

  const filename = opts.displayName ?? formatCaptureFilename(opts.kind)
  const destPath = path.join(projectDir, filename)
  fs.copyFileSync(opts.sourcePath, destPath)

  let thumbnailPath: string | undefined
  if (opts.kind === 'screenshot') {
    thumbnailPath = path.join(thumbsDir(), `${path.parse(filename).name}.png`)
    try {
      fs.copyFileSync(destPath, thumbnailPath)
    } catch {
      thumbnailPath = undefined
    }
  }

  const record: CaptureRecord = {
    id: uuidv4(),
    kind: opts.kind,
    path: destPath,
    createdAt: new Date().toISOString(),
    thumbnailPath,
    projectTag: opts.projectTag,
    customTags: [],
    windowSignature: opts.windowSignature,
    displayName: path.parse(filename).name
  }

  const manifest = loadManifest()
  manifest.items = [record, ...manifest.items].slice(0, MAX_ITEMS)
  saveManifest(manifest)
  return record
}

export function moveCaptureToProject(id: string, projectTag: string | undefined): CaptureRecord | undefined {
  const item = getCapture(id)
  if (!item) return undefined
  const destRoot = resolveDestination()
  const projectDir = projectTag ? path.join(destRoot, projectTag) : destRoot
  fs.mkdirSync(projectDir, { recursive: true })
  const basename = path.basename(item.path)
  const newPath = path.join(projectDir, basename)
  if (item.path !== newPath) {
    fs.renameSync(item.path, newPath)
  }
  return updateCapture(id, { path: newPath, projectTag })
}

export function renameCaptureFile(id: string, newBaseName: string): CaptureRecord | undefined {
  const item = getCapture(id)
  if (!item) return undefined
  const ext = path.extname(item.path)
  const safe = newBaseName.replace(/[\\/?:*|"<>]/g, '-').trim() || 'Grabbit'
  const newPath = path.join(path.dirname(item.path), `${safe}${ext}`)
  if (item.path !== newPath) {
    fs.renameSync(item.path, newPath)
  }
  return updateCapture(id, { path: newPath, displayName: safe })
}
