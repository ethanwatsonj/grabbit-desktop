import { app, systemPreferences } from 'electron'
import { spawn, execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import type { WindowSignature } from '../../shared/types'

const execFileAsync = promisify(execFile)

export interface HelperStatus {
  available: boolean
  path: string | null
  screenTrusted: boolean
  accessibilityTrusted: boolean
  appleFMAvailable: boolean
  version?: string
}

function candidateHelperPaths(): string[] {
  const resources = process.resourcesPath
  return [
    path.join(resources, 'grabbit-helper'),
    path.join(app.getAppPath(), 'native/helper/.build/release/grabbit-helper'),
    path.join(process.cwd(), 'native/helper/.build/release/grabbit-helper'),
    path.join(process.cwd(), 'native/helper/.build/debug/grabbit-helper')
  ]
}

export function resolveHelperPath(): string | null {
  for (const p of candidateHelperPaths()) {
    if (fs.existsSync(p)) return p
  }
  return null
}

export async function getHelperStatus(): Promise<HelperStatus> {
  const helperPath = resolveHelperPath()
  const screenTrusted =
    process.platform === 'darwin'
      ? systemPreferences.getMediaAccessStatus('screen') === 'granted'
      : true
  const accessibilityTrusted =
    process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true

  if (!helperPath) {
    return {
      available: false,
      path: null,
      screenTrusted,
      accessibilityTrusted,
      appleFMAvailable: false
    }
  }

  try {
    const { stdout } = await execFileAsync(helperPath, ['status'], { timeout: 5000 })
    const parsed = JSON.parse(stdout) as {
      appleFMAvailable?: boolean
      version?: string
    }
    return {
      available: true,
      path: helperPath,
      screenTrusted,
      accessibilityTrusted,
      appleFMAvailable: Boolean(parsed.appleFMAvailable),
      version: parsed.version
    }
  } catch {
    return {
      available: true,
      path: helperPath,
      screenTrusted,
      accessibilityTrusted,
      appleFMAvailable: false
    }
  }
}

export async function helperCaptureWindowSignature(): Promise<WindowSignature | undefined> {
  const helperPath = resolveHelperPath()
  if (!helperPath) return undefined
  try {
    const { stdout } = await execFileAsync(helperPath, ['frontmost-window'], { timeout: 3000 })
    return JSON.parse(stdout) as WindowSignature
  } catch {
    return undefined
  }
}

export async function helperOcr(imagePath: string): Promise<string> {
  const helperPath = resolveHelperPath()
  if (!helperPath) return ''
  try {
    const { stdout } = await execFileAsync(helperPath, ['ocr', imagePath], { timeout: 15000 })
    const parsed = JSON.parse(stdout) as { text?: string }
    return parsed.text ?? ''
  } catch {
    return ''
  }
}

export async function helperAppleFMSuggest(prompt: string): Promise<{
  name?: string
  project?: string
  rationale?: string
} | null> {
  const helperPath = resolveHelperPath()
  if (!helperPath) return null
  try {
    const { stdout } = await execFileAsync(helperPath, ['apple-fm', prompt], { timeout: 20000 })
    return JSON.parse(stdout) as { name?: string; project?: string; rationale?: string }
  } catch {
    return null
  }
}

export async function helperScreenshot(opts: {
  mode: 'fullscreen' | 'region' | 'window'
  outputPath: string
  region?: { x: number; y: number; width: number; height: number }
  windowId?: number
}): Promise<boolean> {
  const helperPath = resolveHelperPath()
  if (!helperPath) return false
  const args = ['screenshot', '--mode', opts.mode, '--out', opts.outputPath]
  if (opts.region) {
    args.push(
      '--x',
      String(Math.round(opts.region.x)),
      '--y',
      String(Math.round(opts.region.y)),
      '--w',
      String(Math.round(opts.region.width)),
      '--h',
      String(Math.round(opts.region.height))
    )
  }
  if (opts.windowId != null) args.push('--window-id', String(opts.windowId))
  try {
    await execFileAsync(helperPath, args, { timeout: 20000 })
    return fs.existsSync(opts.outputPath)
  } catch {
    return false
  }
}

export function openScreenRecordingPrefs(): void {
  spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}

export function openAccessibilityPrefs(): void {
  if (process.platform === 'darwin') {
    systemPreferences.isTrustedAccessibilityClient(true)
  }
  spawn('open', ['x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}
