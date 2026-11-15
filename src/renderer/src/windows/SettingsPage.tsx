import { useEffect, useState } from 'react'
import type { AppSettings } from '../../../shared/types'

export function SettingsPage() {
  const [settings, setLocal] = useState<AppSettings | null>(null)
  const [ai, setAi] = useState<{
    geminiConnected: boolean
    appleFMAvailable: boolean
    provider: string
    helper: { available: boolean; screenTrusted: boolean; accessibilityTrusted: boolean }
  } | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState('')

  const refresh = async () => {
    setLocal(await window.grabbit.settingsGet())
    setAi(await window.grabbit.aiStatus())
  }

  useEffect(() => {
    void refresh()
  }, [])

  if (!settings || !ai) {
    return <div className="app-surface" style={{ padding: 24 }}>Loading…</div>
  }

  return (
    <div className="app-surface" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="titlebar-drag" style={{ height: 18 }} />
      <h2 style={{ margin: 0 }}>Settings</h2>

      <section className="panel" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Save folder</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          {settings.destinationFolder || 'Desktop (default)'}
        </p>
        <button
          className="btn"
          onClick={async () => {
            const next = await window.grabbit.settingsPickFolder()
            setLocal(next)
          }}
        >
          Choose folder…
        </button>
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Connect AI</h3>
        <p className="muted">
          Apple FM: {ai.appleFMAvailable ? 'available via helper' : 'unavailable'} · Gemini:{' '}
          {ai.geminiConnected ? 'connected' : 'not connected'}
        </p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button
            className={`btn ${settings.organizeProvider === 'appleFM' ? 'primary' : ''}`}
            onClick={async () => {
              await window.grabbit.aiSetProvider('appleFM')
              await refresh()
            }}
          >
            Apple FM
          </button>
          <button
            className={`btn ${settings.organizeProvider === 'gemini' ? 'primary' : ''}`}
            onClick={async () => {
              await window.grabbit.aiSetProvider('gemini')
              await refresh()
            }}
          >
            Gemini
          </button>
        </div>
        {!ai.geminiConnected ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="field"
              type="password"
              placeholder="Gemini API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <button
              className="btn primary"
              onClick={async () => {
                await window.grabbit.aiConnectGemini(apiKey)
                setApiKey('')
                setStatus('Gemini key saved in encrypted local storage.')
                await refresh()
              }}
            >
              Connect
            </button>
          </div>
        ) : (
          <button
            className="btn danger"
            onClick={async () => {
              await window.grabbit.aiDisconnectGemini()
              setStatus('Disconnected Gemini.')
              await refresh()
            }}
          >
            Disconnect Gemini
          </button>
        )}
        {status && <p className="muted">{status}</p>}
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Shortcuts</h3>
        <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li>⌘⇧3 — Grab full screen</li>
          <li>⌘⇧4 — Grab region</li>
          <li>⌘⇧5 — Capture Bar</li>
          <li>⌘7 — Show All</li>
          <li>⌘, — Settings</li>
          <li>Esc — Stop recording</li>
        </ul>
      </section>

      <section className="panel" style={{ padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Permissions</h3>
        <p className="muted">
          Screen: {ai.helper.screenTrusted ? 'granted' : 'needed'} · Accessibility:{' '}
          {ai.helper.accessibilityTrusted ? 'granted' : 'needed'} · Helper:{' '}
          {ai.helper.available ? 'found' : 'using Chromium fallbacks'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => window.grabbit.permissionsOpenScreen()}>
            Screen Recording…
          </button>
          <button className="btn" onClick={() => window.grabbit.permissionsOpenAccessibility()}>
            Accessibility…
          </button>
        </div>
      </section>
    </div>
  )
}
