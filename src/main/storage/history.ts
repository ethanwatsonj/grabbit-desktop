import fs from 'fs'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { CaptureKind, CaptureRecord, HistoryManifest, WindowSignature } from '../../shared/types'
import { getSettings } from './settings'
import { formatCaptureFilename, manifestPath, thumbsDir } from './paths'

const MAX_ITEMS = 200

function emptyManifest(): HistoryManifest {
  return { version: 1, items: [] }
}

export function loadManifest(): HistoryManifest {
  const p = manifestPath()
  if (!fs.existsSync(p)) return emptyManifest()
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as HistoryManifest
    if (!data.items) return emptyManifest()
    return data
  } catch {
    return emptyManifest()
  }
}

function saveManifest(manifest: HistoryManifest): void {
  fs.writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), 'utf8')
}

export function listCaptures(): CaptureRecord[] {
  const manifest = loadManifest()
  // Drop missing files
  const items = manifest.items.filter((item) => fs.existsSync(item.path))
  if (items.length !== manifest.items.length) {
    saveManifest({ version: 1, items })
  }
  return items
}

export function getCapture(id: string): CaptureRecord | undefined {
  return listCaptures().find((c) => c.id === id)
}

export function updateCapture(id: string, patch: Partial<CaptureRecord>): CaptureRecord | undefined {
  const manifest = loadManifest()
  const idx = manifest.items.findIndex((c) => c.id === id)
  if (idx < 0) return undefined
  manifest.items[idx] = { ...manifest.items[idx], ...patch, id }
  saveManifest(manifest)
  return manifest.items[idx]
}

export function deleteCapture(id: string): boolean {
  const manifest = loadManifest()
  const item = manifest.items.find((c) => c.id === id)
  if (!item) return false
  manifest.items = manifest.items.filter((c) => c.id !== id)
  saveManifest(manifest)
  try {
    if (fs.existsSync(item.path)) fs.unlinkSync(item.path)
    if (item.thumbnailPath && fs.existsSync(item.thumbnailPath)) fs.unlinkSync(item.thumbnailPath)
  } catch {
    /* ignore */
  }
  return true
}

export function resolveDestination(): string {
  const settings = getSettings()
  if (settings.destinationFolder && fs.existsSync(settings.destinationFolder)) {
    return settings.destinationFolder
  }
  return path.join(os.homedir(), 'Desktop')
}

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
