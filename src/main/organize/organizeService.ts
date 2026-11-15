import type { OrganizeSuggestion } from '../../shared/types'
import { getCapture, moveCaptureToProject, renameCaptureFile } from '../storage/history'
import { getSettings } from '../storage/settings'
import { getGeminiApiKey } from '../storage/secrets'
import { helperAppleFMSuggest, helperOcr, getHelperStatus } from '../helper/nativeHelper'
import { geminiOrganize } from './gemini'

function heuristicName(captureId: string): OrganizeSuggestion {
  const capture = getCapture(captureId)
  const app = capture?.windowSignature?.appName || capture?.windowSignature?.bundleID || 'Capture'
  const safe = String(app).replace(/[^\w\- ]+/g, '').trim().slice(0, 40) || 'Capture'
  return {
    captureId,
    suggestedName: safe,
    suggestedProject: undefined,
    rationale: 'Heuristic fallback from frontmost app name',
    provider: 'heuristic'
  }
}

export async function suggestOrganize(captureId: string): Promise<OrganizeSuggestion> {
  const capture = getCapture(captureId)
  if (!capture) return heuristicName(captureId)

  const settings = getSettings()
  const ocr =
    capture.kind === 'screenshot' ? await helperOcr(capture.path) : ''
  const sig = capture.windowSignature

  if (settings.organizeProvider === 'gemini' && getGeminiApiKey()) {
    try {
      const result = await geminiOrganize({
        ocrText: ocr,
        windowTitle: sig?.windowTitle,
        appName: sig?.appName,
        bundleID: sig?.bundleID,
        url: sig?.url
      })
      if (result) {
        return {
          captureId,
          suggestedName: result.name,
          suggestedProject: result.project,
          rationale: result.rationale,
          provider: 'gemini'
        }
      }
    } catch (err) {
      console.warn('Gemini organize failed', err)
    }
  }

  const helper = await getHelperStatus()
  if (settings.organizeProvider === 'appleFM' && helper.appleFMAvailable) {
    const prompt = JSON.stringify({
      ocr: ocr.slice(0, 3000),
      windowTitle: sig?.windowTitle,
      appName: sig?.appName,
      bundleID: sig?.bundleID,
      url: sig?.url
    })
    const fm = await helperAppleFMSuggest(prompt)
    if (fm?.name) {
      return {
        captureId,
        suggestedName: fm.name,
        suggestedProject: fm.project,
        rationale: fm.rationale,
        provider: 'appleFM'
      }
    }
  }

  // Prefer Gemini if key exists even when provider is appleFM but FM unavailable
  if (getGeminiApiKey()) {
    try {
      const result = await geminiOrganize({
        ocrText: ocr,
        windowTitle: sig?.windowTitle,
        appName: sig?.appName,
        bundleID: sig?.bundleID,
        url: sig?.url
      })
      if (result) {
        return {
          captureId,
          suggestedName: result.name,
          suggestedProject: result.project,
          rationale: result.rationale,
          provider: 'gemini'
        }
      }
    } catch {
      /* fall through */
    }
  }

  return heuristicName(captureId)
}

export function applyOrganize(suggestion: OrganizeSuggestion): boolean {
  const renamed = renameCaptureFile(suggestion.captureId, suggestion.suggestedName)
  if (!renamed) return false
  if (suggestion.suggestedProject) {
    moveCaptureToProject(suggestion.captureId, suggestion.suggestedProject)
  }
  return true
}
