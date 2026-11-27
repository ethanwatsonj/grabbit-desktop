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
    return (
      <div className="app-surface settings-page">
        <div className="titlebar-drag" style={{ height: 18 }} />
        <p className="muted">Loading…</p>
      </div>
    )
  }

  const shortcuts: { label: string; keys: string[] }[] = [
    { label: 'Grab Screen', keys: ['⌘', '⇧', '3'] },
    { label: 'Grab Region', keys: ['⌘', '⇧', '4'] },
    { label: 'Capture Bar', keys: ['⌘', '⇧', '5'] },
    { label: 'Show All', keys: ['⌘', '7'] }
  ]

  return (
    <div className="app-surface settings-page">
      <div className="titlebar-drag" style={{ height: 18 }} />

      {import.meta.env.DEV ? (
        <section className="settings-section">
          <h2 className="section-label">Debug</h2>
          <hr className="divider" />
          <div className="settings-row" style={{ flexWrap: 'wrap' }}>
            <button className="btn" type="button" onClick={() => window.grabbit.kitchenSinkShow()}>
              Kitchen Sink
            </button>
          </div>
        </section>
      ) : null}

      <section className="settings-section">
        <h2 className="section-label">Save Location</h2>
        <hr className="divider" />
        <div className="settings-row">
          <span>Save to</span>
          <span className="path" title={settings.destinationFolder || undefined}>
            {settings.destinationFolder || 'Desktop (default)'}
          </span>
          <button
            className="btn"
            onClick={async () => {
              const next = await window.grabbit.settingsPickFolder()
              setLocal(next)
            }}
          >
            Change…
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-label">Connect AI</h2>
        <hr className="divider" />
        <p className="muted" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          Apple FM: {ai.appleFMAvailable ? 'available via helper' : 'unavailable'} · Gemini:{' '}
          {ai.geminiConnected ? 'connected' : 'not connected'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
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
            className="btn"
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

      <section className="settings-section">
        <h2 className="section-label">Shortcuts</h2>
        <hr className="divider" />
        {shortcuts.map((row) => (
          <div key={row.label}>
            <div className="settings-row">
              <span>{row.label}</span>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {row.keys.map((k) => (
                  <span key={k} className="kbd">
                    {k}
                  </span>
                ))}
              </span>
            </div>
            <hr className="divider" />
          </div>
        ))}
      </section>

      <section className="settings-section">
        <h2 className="section-label">Permissions</h2>
        <hr className="divider" />
        <p className="muted" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
          Screen: {ai.helper.screenTrusted ? 'granted' : 'needed'} · Accessibility:{' '}
          {ai.helper.accessibilityTrusted ? 'granted' : 'needed'} · Helper:{' '}
          {ai.helper.available ? 'found' : 'using Chromium fallbacks'}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
