import fs from 'fs'
import os from 'os'
import path from 'path'
import { getSettings } from './settings'
import { destinationMirrorPath } from './paths'

export function resolveDestination(): string {
  const settings = getSettings()
  if (settings.destinationFolder && fs.existsSync(settings.destinationFolder)) {
    return settings.destinationFolder
  }
  const mirror = destinationMirrorPath()
  if (fs.existsSync(mirror)) {
    const p = fs.readFileSync(mirror, 'utf8').trim()
    if (p && fs.existsSync(p)) return p
  }
  return path.join(os.homedir(), 'Desktop')
}
