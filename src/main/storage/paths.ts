import { app } from 'electron'
import fs from 'fs'
import path from 'path'

/** Match Swift app Application Support folder name for migration. */
export const APP_SUPPORT_NAME = 'Grabbit'

export function appSupportDir(): string {
  const dir = path.join(app.getPath('appData'), APP_SUPPORT_NAME)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function recentsDir(): string {
  const dir = path.join(appSupportDir(), 'recents')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function manifestPath(): string {
  return path.join(recentsDir(), 'manifest.json')
}

export function destinationMirrorPath(): string {
  return path.join(appSupportDir(), 'destinationFolderPath.txt')
}

export function thumbsDir(): string {
  const dir = path.join(recentsDir(), 'thumbs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function formatCaptureFilename(kind: 'screenshot' | 'recording', date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  const ext = kind === 'screenshot' ? 'png' : 'webm'
  return `Grabbit ${stamp}.${ext}`
}
