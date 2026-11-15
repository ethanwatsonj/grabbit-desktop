import { useEffect, useState } from 'react'

type Step = 'screen' | 'accessibility' | 'folder' | 'done'

export function OnboardingPage() {
  const [step, setStep] = useState<Step>('screen')
  const [screenOk, setScreenOk] = useState(false)
  const [axOk, setAxOk] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)

  const refreshPerms = async () => {
    setScreenOk(Boolean(await window.grabbit.permissionsScreen()))
    setAxOk(Boolean(await window.grabbit.permissionsAccessibility()))
    const settings = await window.grabbit.settingsGet()
    setFolder(settings.destinationFolder)
  }

  useEffect(() => {
    void refreshPerms()
    const id = setInterval(() => void refreshPerms(), 1500)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app-surface" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      <div className="titlebar-drag" style={{ height: 16 }} />
      <div style={{ fontSize: 22, fontWeight: 700 }}>Welcome to Grabbit</div>
      <p className="muted" style={{ marginTop: 0 }}>
        A few permissions so capture, hotkeys, and Auto Organize work like the native app.
      </p>

      {step === 'screen' && (
        <section className="panel" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>1. Screen Recording</h3>
          <p className="muted">Needed for screenshots and recordings.</p>
          <p>{screenOk ? 'Granted' : 'Not granted yet'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => window.grabbit.permissionsOpenScreen()}>
              Open System Settings
            </button>
            <button className="btn primary" disabled={!screenOk} onClick={() => setStep('accessibility')}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 'accessibility' && (
        <section className="panel" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>2. Accessibility</h3>
          <p className="muted">Needed for global keyboard shortcuts from any app.</p>
          <p>{axOk ? 'Granted' : 'Not granted yet'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => window.grabbit.permissionsOpenAccessibility()}>
              Open System Settings
            </button>
            <button className="btn" onClick={() => setStep('screen')}>
              Back
            </button>
            <button className="btn primary" onClick={() => setStep('folder')}>
              {axOk ? 'Continue' : 'Continue anyway'}
            </button>
          </div>
        </section>
      )}

      {step === 'folder' && (
        <section className="panel" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>3. Save folder</h3>
          <p className="muted">Where captures are written (change later in Settings).</p>
          <p>{folder || 'Desktop (default until you choose)'}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={async () => {
                const next = await window.grabbit.settingsPickFolder()
                setFolder(next.destinationFolder)
              }}
            >
              Choose folder…
            </button>
            <button className="btn" onClick={() => setStep('accessibility')}>
              Back
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                await window.grabbit.onboardingComplete()
                setStep('done')
              }}
            >
              Finish
            </button>
          </div>
        </section>
      )}

      {step === 'done' && <p>You are set. Look for the rabbit in the menu bar.</p>}
    </div>
  )
}
