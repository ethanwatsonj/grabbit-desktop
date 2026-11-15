import { desktopCapturer } from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { CaptureMode, CaptureResult } from '../../shared/types'
import { addCaptureFile } from '../storage/history'
import { helperCaptureWindowSignature } from '../helper/nativeHelper'
import { showToast, updateTrayRecording } from '../windows/windowManager'

export interface RecordingState {
  active: boolean
  startedAt: number | null
  mode: CaptureMode | null
  micEnabled: boolean
}

let state: RecordingState = {
  active: false,
  startedAt: null,
  mode: null,
  micEnabled: false
}

let recordingWindowId: number | null = null

export function getRecordingState(): RecordingState {
  return { ...state }
}

/**
 * Recording is driven by a hidden renderer that uses getUserMedia / desktopCapturer.
 * Main process tracks lifecycle and persists the resulting file.
 */
export async function beginRecording(opts: {
  mode: CaptureMode
  micEnabled: boolean
  sourceId?: string
}): Promise<{ ok: boolean; sourceId?: string; error?: string }> {
  if (state.active) return { ok: false, error: 'Already recording' }

  const sources = await desktopCapturer.getSources({
    types: opts.mode === 'window' ? ['window'] : ['screen'],
    thumbnailSize: { width: 0, height: 0 }
  })
  const source = opts.sourceId
    ? sources.find((s) => s.id === opts.sourceId)
    : sources[0]
  if (!source) return { ok: false, error: 'No capture source' }

  state = {
    active: true,
    startedAt: Date.now(),
    mode: opts.mode,
    micEnabled: opts.micEnabled
  }
  updateTrayRecording(true)
  return { ok: true, sourceId: source.id }
}

export function bindRecordingWindow(id: number): void {
  recordingWindowId = id
}

export function getRecordingWindowId(): number | null {
  return recordingWindowId
}

export async function finalizeRecording(tempFilePath: string): Promise<CaptureResult | null> {
  if (!fs.existsSync(tempFilePath)) {
    state = { active: false, startedAt: null, mode: null, micEnabled: false }
    updateTrayRecording(false)
    return null
  }

  const signature = await helperCaptureWindowSignature()
  const record = addCaptureFile({
    kind: 'recording',
    sourcePath: tempFilePath,
    windowSignature: signature
  })

  try {
    if (tempFilePath.startsWith(os.tmpdir())) fs.unlinkSync(tempFilePath)
  } catch {
    /* ignore */
  }

  state = { active: false, startedAt: null, mode: null, micEnabled: false }
  updateTrayRecording(false)

  showToast({
    captureId: record.id,
    path: record.path,
    kind: 'recording'
  })

  return { record, openAnnotate: true }
}

export function cancelRecording(): void {
  state = { active: false, startedAt: null, mode: null, micEnabled: false }
  updateTrayRecording(false)
}

export function recordingTempPath(): string {
  return path.join(os.tmpdir(), `grabbit-recording-${Date.now()}.webm`)
}
