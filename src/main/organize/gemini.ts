import { getGeminiApiKey } from '../storage/secrets'

export interface GeminiOrganizeResult {
  name: string
  project?: string
  rationale?: string
}

export async function geminiOrganize(opts: {
  ocrText: string
  windowTitle?: string
  appName?: string
  bundleID?: string
  url?: string
}): Promise<GeminiOrganizeResult | null> {
  const key = getGeminiApiKey()
  if (!key) return null

  const prompt = `You organize screenshots for a capture library.
Return ONLY compact JSON: {"name":"short-filename-without-extension","project":"optional-folder","rationale":"one sentence"}.
Prefer concise kebab-or-Title names. Project should be a short folder name or omit.

Context:
app: ${opts.appName ?? ''}
bundle: ${opts.bundleID ?? ''}
window: ${opts.windowTitle ?? ''}
url: ${opts.url ?? ''}
ocr:
${opts.ocrText.slice(0, 4000)}`

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
    encodeURIComponent(key)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as GeminiOrganizeResult
    if (!parsed.name) return null
    return parsed
  } catch {
    return null
  }
}
