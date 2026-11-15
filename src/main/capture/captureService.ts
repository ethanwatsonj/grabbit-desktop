import { BrowserWindow, clipboard, desktopCapturer, nativeImage, screen } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { CaptureMode, CaptureResult, WindowSignature } from '../../shared/types'
import { addCaptureFile } from '../storage/history'
import { helperCaptureWindowSignature, helperScreenshot } from '../helper/nativeHelper'
import { showToast } from '../windows/windowManager'

async function writePngFromDataUrl(dataUrl: string, outPath: string): Promise<void> {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'))
}

async function captureDisplayPng(displayId?: number): Promise<string | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 3840, height: 2160 }
  })
  if (!sources.length) return null

  let source = sources[0]
  if (displayId != null) {
    const match = sources.find((s) => String(s.display_id) === String(displayId))
    if (match) source = match
  }

  const img = source.thumbnail
  if (img.isEmpty()) return null
  const tmp = path.join(os.tmpdir(), `grabbit-capture-${Date.now()}.png`)
  fs.writeFileSync(tmp, img.toPNG())
  return tmp
}

async function captureRegionWithDesktopCapturer(region: {
  x: number
  y: number
  width: number
  height: number
}): Promise<string | null> {
  const display = screen.getDisplayMatching({
    x: Math.round(region.x),
    y: Math.round(region.y),
    width: Math.round(region.width),
    height: Math.round(region.height)
  })
  const fullPath = await captureDisplayPng(display.id)
  if (!fullPath) return null

  const full = nativeImage.createFromPath(fullPath)
  const scale = display.scaleFactor || 1
  const bounds = display.bounds
  const cropX = Math.max(0, Math.round((region.x - bounds.x) * scale))
  const cropY = Math.max(0, Math.round((region.y - bounds.y) * scale))
  const cropW = Math.max(1, Math.round(region.width * scale))
  const cropH = Math.max(1, Math.round(region.height * scale))
  const cropped = full.crop({ x: cropX, y: cropY, width: cropW, height: cropH })
  const tmp = path.join(os.tmpdir(), `grabbit-region-${Date.now()}.png`)
  fs.writeFileSync(tmp, cropped.toPNG())
  try {
    fs.unlinkSync(fullPath)
  } catch {
    /* ignore */
  }
  return tmp
}

export async function takeScreenshot(
  mode: CaptureMode,
  opts?: {
    region?: { x: number; y: number; width: number; height: number }
    windowId?: number
  }
): Promise<CaptureResult | null> {
  // Capture window signature before UI steals focus (parity with Swift).
  const signature: WindowSignature | undefined = await helperCaptureWindowSignature()

  const tmp = path.join(os.tmpdir(), `grabbit-shot-${Date.now()}.png`)
  let sourcePath: string | null = null

  const helperOk = await helperScreenshot({
    mode,
    outputPath: tmp,
    region: opts?.region,
    windowId: opts?.windowId
  })

  if (helperOk) {
    sourcePath = tmp
  } else if (mode === 'fullscreen') {
    sourcePath = await captureDisplayPng()
  } else if (mode === 'region' && opts?.region) {
    sourcePath = await captureRegionWithDesktopCapturer(opts.region)
  } else if (mode === 'window') {
    // Fallback: full display when helper unavailable
    sourcePath = await captureDisplayPng()
  }

  if (!sourcePath || !fs.existsSync(sourcePath)) return null

  // Clipboard parity for screenshots
  try {
    clipboard.writeImage(nativeImage.createFromPath(sourcePath))
  } catch {
    /* ignore */
  }

  const record = addCaptureFile({
    kind: 'screenshot',
    sourcePath,
    windowSignature: signature
  })

  try {
    if (sourcePath.startsWith(os.tmpdir())) fs.unlinkSync(sourcePath)
  } catch {
    /* ignore */
  }

  const result: CaptureResult = { record, openAnnotate: true }
  showToast({
    captureId: record.id,
    path: record.path,
    kind: 'screenshot',
    thumbnailDataUrl: undefined
  })
  return result
}

export async function listWindowsForPicker(): Promise<
  Array<{ id: string; name: string; display_id: string }>
> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: true
  })
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    display_id: s.display_id
  }))
}

export function hideCaptureChrome(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.getTitle().startsWith('grabbit:')) {
      // keep tray; overlays hide themselves
    }
  }
}

export { writePngFromDataUrl }
