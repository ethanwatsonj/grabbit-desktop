/**
 * Auto Organize pipeline — mirrors CaptureClassifier.swift order:
 * preferred AI (Gemini vision when connected+selected, else Apple FM)
 * → remaining AI fallback → strong window/OCR signals only (no weak app-name heuristic).
 */
import type {
  CaptureLocationSnapshot,
  CaptureRecord,
  OrganizeApplyResult,
  OrganizeSuggestion
} from '../../shared/types'
import {
  getCapture,
  moveCaptureToProject,
  renameCaptureFile,
  updateCapture
} from '../storage/history'
import { getSettings } from '../storage/settings'
import { getGeminiApiKey } from '../storage/secrets'
import { helperAppleFMSuggest, helperOcr, getHelperStatus } from '../helper/nativeHelper'
import { geminiOrganize } from './gemini'
import { listProjectFolders, stableId } from '../storage/libraryBrowser'
import fs from 'fs'
import path from 'path'

function emptySuggestion(captureId: string, provider: OrganizeSuggestion['provider']): OrganizeSuggestion {
  return {
    captureId,
    suggestedName: null,
    suggestedProject: null,
    confidence: 0,
    rationale: 'No usable rename or project suggestion',
    provider
  }
}

function usable(s: OrganizeSuggestion): boolean {
  return Boolean(s.suggestedName?.trim() || s.suggestedProject?.trim())
}

/** Deterministic fallback when AI unavailable — only strong window/title signals. */
function strongSignalSuggestion(captureId: string): OrganizeSuggestion | null {
  const capture = getCapture(captureId)
  if (!capture) return null
  const sig = capture.windowSignature
  const title = sig?.windowTitle?.trim()
  const project = sig?.url
    ? (() => {
        try {
          const host = new URL(sig.url!).hostname.replace(/^www\./, '')
          return host.split('.')[0] || null
        } catch {
          return null
        }
      })()
    : null

  // Skip IDE chrome titles
  const chrome = /agents|chat session|new chat|untitled/i
  let name: string | null = null
  if (title && !chrome.test(title) && title.split(/\s+/).length >= 2) {
    name = title.replace(/[\\/?:*|"<>]/g, '-').slice(0, 80)
  }

  if (!name && !project) return null
  return {
    captureId,
    suggestedName: name,
    suggestedProject: project,
    confidence: 0.55,
    rationale: 'From window / URL signals',
    provider: 'heuristic'
  }
}

export async function suggestOrganize(captureId: string): Promise<OrganizeSuggestion> {
  const capture = getCapture(captureId)
  if (!capture) return emptySuggestion(captureId, 'heuristic')

  const settings = getSettings()
  const existingProjects = listProjectFolders()
  const imagePath =
    capture.kind === 'screenshot'
      ? capture.path
      : capture.thumbnailPath && pathExists(capture.thumbnailPath)
        ? capture.thumbnailPath
        : capture.path

  const ocr = capture.kind === 'screenshot' ? await helperOcr(capture.path) : ''
  const sig = capture.windowSignature
  const preferCloud = settings.organizeProvider === 'gemini' && Boolean(getGeminiApiKey())

  const fromGemini = async (): Promise<OrganizeSuggestion | null> => {
    if (!getGeminiApiKey()) return null
    try {
      const result = await geminiOrganize({
        imagePath,
        ocrText: ocr,
        windowInfo: sig,
        existingProjects
      })
      if (!result) return null
      const suggestion: OrganizeSuggestion = {
        captureId,
        suggestedName: result.name ?? null,
        suggestedProject: result.project ?? null,
        confidence: result.confidence,
        rationale: result.rationale,
        provider: 'gemini'
      }
      return usable(suggestion) ? suggestion : null
    } catch (err) {
      console.warn('Gemini organize failed', err)
      return null
    }
  }

  if (preferCloud) {
    const cloud = await fromGemini()
    if (cloud) return cloud
  }

  const helper = await getHelperStatus()
  if (settings.organizeProvider === 'appleFM' && helper.appleFMAvailable) {
    const prompt = JSON.stringify({
      ocr: ocr.slice(0, 3000),
      windowTitle: sig?.windowTitle,
      appName: sig?.appName,
      bundleID: sig?.bundleID,
      url: sig?.url,
      existingProjects: existingProjects.slice(0, 40)
    })
    const fm = await helperAppleFMSuggest(prompt)
    if (fm?.name || fm?.project) {
      const suggestion: OrganizeSuggestion = {
        captureId,
        suggestedName: fm.name || null,
        suggestedProject: fm.project || null,
        confidence: 0.75,
        rationale: fm.rationale,
        provider: 'appleFM'
      }
      if (usable(suggestion)) return suggestion
    }
  }

  // Gemini as fallback when Apple FM path failed / unavailable but key exists
  if (!preferCloud && getGeminiApiKey()) {
    const cloud = await fromGemini()
    if (cloud) return cloud
  }

  const signal = strongSignalSuggestion(captureId)
  if (signal) return signal

  // Swift returns nil when unclear — surface empty so UI shows “No suggestions”
  return emptySuggestion(captureId, settings.organizeProvider === 'appleFM' ? 'appleFM' : 'heuristic')
}

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

export function snapshotCapture(captureId: string): CaptureLocationSnapshot | null {
  const item = getCapture(captureId)
  if (!item) return null
  return {
    name: item.displayName || path.parse(item.path).name,
    directoryPath: path.dirname(item.path),
    projectTag: item.projectTag
  }
}

function toApplyResult(record: CaptureRecord | undefined): OrganizeApplyResult | null {
  if (!record) return null
  return {
    captureId: stableId(record.path),
    path: record.path,
    name: record.displayName || path.parse(record.path).name,
    projectTag: record.projectTag
  }
}

/** Returns `null` on failure or the post-move record info. */
export function applyOrganize(suggestion: OrganizeSuggestion): OrganizeApplyResult | null {
  let latest: CaptureRecord | undefined = getCapture(suggestion.captureId)
  if (!latest) return null
  const name = suggestion.suggestedName?.trim()
  if (name) {
    const renamed = renameCaptureFile(suggestion.captureId, name)
    if (!renamed) return null
    latest = renamed
  }
  if (suggestion.suggestedProject !== undefined && suggestion.suggestedProject !== null) {
    const project = suggestion.suggestedProject.trim()
    latest = moveCaptureToProject(latest.id, project || undefined) ?? latest
  }
  return toApplyResult(latest)
}

export function revertOrganize(
  snapshot: CaptureLocationSnapshot & { captureId: string }
): OrganizeApplyResult | null {
  const item = getCapture(snapshot.captureId)
  if (!item) return null
  let latest = renameCaptureFile(snapshot.captureId, snapshot.name) ?? item
  latest = moveCaptureToProject(latest.id, snapshot.projectTag) ?? latest
  latest =
    updateCapture(latest.id, {
      displayName: snapshot.name,
      projectTag: snapshot.projectTag
    }) ?? latest
  return toApplyResult(latest)
}
