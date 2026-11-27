/**
 * BYOK Gemini vision Auto Organize — ported from
 * archive/swiftui CaptureClassifierCloud.swift
 */
import fs from 'fs'
import { getGeminiApiKey } from '../storage/secrets'
import type { WindowSignature } from '../../shared/types'

export interface GeminiOrganizeResult {
  name?: string | null
  project?: string | null
  confidence: number
  rationale?: string
}

const MODEL_CANDIDATES = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash']

const PLACEHOLDER_VALUES = new Set([
  'filename',
  'file name',
  'name',
  'title',
  'suggestedname',
  'suggested name',
  'project',
  'suggestedproject',
  'suggested project',
  'folder',
  'product',
  'none',
  'null',
  'nil',
  'n/a',
  'na',
  'unknown',
  'untitled',
  'empty',
  'string',
  'undefined',
  'screenshot',
  'screen recording',
  'grabbit',
  'back',
  'home',
  'menu',
  'close',
  'cancel',
  'done',
  'next',
  'previous',
  'search',
  'share',
  'edit',
  'more',
  'settings',
  'account',
  'profile',
  'sign in',
  'log in',
  'login',
  'signin',
  'skip',
  'continue',
  'ok',
  'okay',
  'yes',
  'no',
  'introduction',
  'overview',
  'contents',
  'sidebar',
  'navigation',
  'design',
  'parts',
  'requirements',
  'versions',
  'simulation',
  'materials',
  'extension',
  'extensions'
])

const REJECTED_LABELS = new Set([
  'untitled',
  'screenshot',
  'screen recording',
  'window',
  'document',
  'agents',
  'chat',
  'new chat',
  'chat session',
  'new chat session'
])

function sanitized(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return null
  if (REJECTED_LABELS.has(trimmed.toLowerCase())) return null
  const cleaned = trimmed
    .split(/[:/\\]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('-')
  if (!cleaned) return null
  if (PLACEHOLDER_VALUES.has(cleaned.toLowerCase())) return null
  if (REJECTED_LABELS.has(cleaned.toLowerCase())) return null
  return cleaned.slice(0, 120)
}

function isStrongFilename(raw: string): boolean {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return false
  if (REJECTED_LABELS.has(raw.trim().toLowerCase())) return false
  return true
}

function buildPrompt(opts: {
  windowInfo?: WindowSignature | null
  ocrText: string
  existingProjects: string[]
}): string {
  const lines: string[] = [
    `You help organize screenshots and screen recordings on macOS.
Look at the attached image first. OCR below is only a secondary hint.
Return JSON only with suggestedName, suggestedProject, and confidence.

suggestedProject (when clear):
- Name the product, client, brand, codebase, or workspace identity visible IN THE IMAGE.
- If the image shows a clear product brand (large logo, CLI welcome, product name + version), that brand IS the project — even when Captured app / Window title is Cursor, VS Code, Xcode, Terminal, or another host IDE.
- Prefer the ACTIVE / selected browser or app tab when that tab names the pictured product. Ignore inactive sibling tabs.
- Match an existing project folder ONLY when it clearly names the same product/workspace as the image. If unsure, propose a NEW name from the image or leave empty — never default to an unrelated existing folder (including "People").
- People project — ONLY when the image clearly shows real people: faces, portraits, video-call / meeting participants, or on-screen name overlays. Do NOT use People for product UIs, app directories, marketplaces, dashboards, code, or company logos.
- Never use sidebar/nav chrome or host IDE chrome (Agents, Chat Session, New Chat) as the project when the pixels show a different product.

suggestedName (filename, no extension):
- Describe what is VISIBLE in the image (content / how-to / panel), not host IDE chrome when that chrome is not the subject.
- Short descriptive name: product/workspace context plus the main panel, selection, or subject (about 3–7 words, Title Case).
- MUST differ from suggestedProject when both are filled. Never copy only one OCR line.
- Leave fields empty only when the capture is truly unusable.`
  ]

  const sig = opts.windowInfo
  if (sig?.windowTitle) lines.push(`Window title: ${sig.windowTitle}`)
  if (sig?.appName) lines.push(`Captured app: ${sig.appName}`)
  if (sig?.bundleID) lines.push(`Bundle ID: ${sig.bundleID}`)
  if (sig?.url) lines.push(`URL: ${sig.url}`)

  if (opts.existingProjects.length) {
    lines.push(
      'Existing project folders (optional — match ONLY if the same product/workspace as the image; never pick People just because it is listed): ' +
        opts.existingProjects.slice(0, 40).join(', ')
    )
  }

  if (opts.ocrText.trim()) {
    lines.push('OCR (secondary — trust the image over this):\n' + opts.ocrText.slice(0, 3000))
  } else {
    lines.push('OCR text: (none detected)')
  }

  return lines.join('\n')
}

function parseSuggestion(data: unknown): GeminiOrganizeResult | null {
  const root = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text =
    root.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('\n')?.trim() ?? ''
  if (!text) return null

  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        json = JSON.parse(match[0]) as Record<string, unknown>
      } catch {
        return null
      }
    }
  }
  if (!json) return null

  const project = sanitized(
    (json.suggestedProject as string | undefined) ?? (json.project as string | undefined)
  )
  const name = sanitized(
    (json.suggestedName as string | undefined) ?? (json.name as string | undefined)
  )
  const strongRename = name ? isStrongFilename(name) : false
  if (!project && !strongRename) return null

  let confidence = 0.7
  if (typeof json.confidence === 'number') confidence = json.confidence
  else if (typeof json.confidence === 'string') {
    const n = Number(json.confidence)
    if (Number.isFinite(n)) confidence = n
  }

  return {
    name,
    project,
    confidence: Math.min(Math.max(confidence, 0), 1),
    rationale: typeof json.rationale === 'string' ? json.rationale : undefined
  }
}

async function jpegBase64FromPath(filePath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(filePath)) return null
    const buf = fs.readFileSync(filePath)
    // Already jpeg/png — Gemini accepts both; prefer sending as jpeg mime when .jpg
    return buf.toString('base64')
  } catch {
    return null
  }
}

function mimeForPath(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

async function requestModel(
  modelID: string,
  apiKey: string,
  prompt: string,
  imageBase64: string,
  mimeType: string
): Promise<GeminiOrganizeResult | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelID}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            suggestedName: {
              type: 'STRING',
              description: '3–7 word filename from visible image content (not IDE Agents/Chat chrome)'
            },
            suggestedProject: {
              type: 'STRING',
              description:
                'In-image product/brand/workspace when clear; else active tab. People ONLY for real faces — never product UIs'
            },
            confidence: {
              type: 'NUMBER',
              description: 'Confidence from 0 to 1'
            }
          },
          required: ['suggestedName', 'suggestedProject', 'confidence']
        }
      }
    })
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn(`Gemini ${modelID} HTTP ${res.status}: ${text.slice(0, 200)}`)
    return null
  }

  const data = await res.json()
  return parseSuggestion(data)
}

export async function geminiOrganize(opts: {
  imagePath: string
  ocrText: string
  windowInfo?: WindowSignature | null
  existingProjects?: string[]
}): Promise<GeminiOrganizeResult | null> {
  const key = getGeminiApiKey()
  if (!key) return null

  const imageBase64 = await jpegBase64FromPath(opts.imagePath)
  if (!imageBase64) {
    console.warn('Gemini organize skipped: could not read capture image')
    return null
  }

  const prompt = buildPrompt({
    windowInfo: opts.windowInfo,
    ocrText: opts.ocrText,
    existingProjects: opts.existingProjects ?? []
  })
  const mime = mimeForPath(opts.imagePath)

  for (const modelID of MODEL_CANDIDATES) {
    try {
      const suggestion = await requestModel(modelID, key, prompt, imageBase64, mime)
      if (suggestion) return suggestion
    } catch (err) {
      console.warn(`Gemini ${modelID} failed`, err)
    }
  }
  return null
}
