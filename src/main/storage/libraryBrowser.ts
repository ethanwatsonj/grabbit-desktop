import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { CaptureKind, CaptureRecord, LibraryPrimaryView } from '../../shared/types'
import { resolveDestination } from './destination'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tif', '.tiff', '.heic', '.bmp'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'])
const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.aac', '.flac', '.aiff', '.ogg'])

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

function stableId(filePath: string): string {
  return crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 32)
}

function kindFromExt(ext: string): CaptureKind {
  if (AUDIO_EXTS.has(ext)) return 'audio'
  if (VIDEO_EXTS.has(ext)) return 'recording'
  return 'screenshot'
}

function matchesView(ext: string, view: LibraryPrimaryView): boolean {
  if (view === 'all') return true
  if (view === 'media') return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)
  if (view === 'audio') return AUDIO_EXTS.has(ext)
  return true
}

function safeResolveUnderRoot(root: string, relativePath: string): string | null {
  const cleaned = relativePath.replace(/^[/\\]+/, '')
  const full = path.resolve(root, cleaned)
  const rootResolved = path.resolve(root)
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null
  return full
}

function countMatchingItems(dir: string, view: LibraryPrimaryView, depth = 0): number {
  if (depth > 6) return 0
  let count = 0
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      count += countMatchingItems(full, view, depth + 1)
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (matchesView(ext, view)) count += 1
  }
  return count
}

export function browseLibraryFolder(
  relativePath = '',
  view: LibraryPrimaryView = 'all'
): LibraryBrowseResult {
  const root = resolveDestination()
  const abs = safeResolveUnderRoot(root, relativePath || '') || root
  const normalizedRel =
    abs === path.resolve(root) ? '' : path.relative(root, abs).split(path.sep).join('/')

  const folders: LibraryFolderEntry[] = []
  const files: CaptureRecord[] = []

  if (!fs.existsSync(abs)) {
    return { root, relativePath: normalizedRel, folders, files }
  }

  let entries: fs.Dirent[] = []
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true })
  } catch {
    return { root, relativePath: normalizedRel, folders, files }
  }

  const sorted = entries
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

  for (const entry of sorted) {
    const full = path.join(abs, entry.name)
    const rel = path.relative(root, full).split(path.sep).join('/')

    if (entry.isDirectory()) {
      const itemCount = countMatchingItems(full, view)
      // Always show folders in "all"; in filtered views only if they contain matches
      if (view === 'all' || itemCount > 0) {
        folders.push({ name: entry.name, relativePath: rel, itemCount })
      }
      continue
    }

    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!matchesView(ext, view)) continue

    let stat: fs.Stats
    try {
      stat = fs.statSync(full)
    } catch {
      continue
    }

    const projectTag = normalizedRel.split('/').filter(Boolean)[0]

    files.push({
      id: stableId(full),
      kind: kindFromExt(ext),
      path: full,
      createdAt: stat.mtime.toISOString(),
      projectTag,
      customTags: [],
      displayName: path.parse(entry.name).name
    })
  }

  return { root, relativePath: normalizedRel, folders, files }
}

/** Flat list of media under destination (for tray recents / organize). */
export function listFilesInDestination(view: LibraryPrimaryView = 'all'): CaptureRecord[] {
  const root = resolveDestination()
  const out: CaptureRecord[] = []

  const walk = (dir: string, depth: number) => {
    if (depth > 8) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!matchesView(ext, view)) continue
      let stat: fs.Stats
      try {
        stat = fs.statSync(full)
      } catch {
        continue
      }
      const rel = path.relative(root, full)
      const projectTag = rel.split(path.sep).filter(Boolean)[0]
      out.push({
        id: stableId(full),
        kind: kindFromExt(ext),
        path: full,
        createdAt: stat.mtime.toISOString(),
        projectTag: projectTag !== path.basename(full) ? projectTag : undefined,
        customTags: [],
        displayName: path.parse(entry.name).name
      })
    }
  }

  if (fs.existsSync(root)) walk(root, 0)
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return out
}
