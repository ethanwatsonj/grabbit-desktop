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
    <div className="app-surface onboarding-page">
      <div className="titlebar-drag" style={{ height: 16 }} />
      <h1>Welcome to Grabbit</h1>
      <p className="muted" style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>
        A few permissions so capture, hotkeys, and Auto Organize work.
      </p>

      {step === 'screen' && (
        <section className="onboarding-step">
          <h2 className="section-label">1. Screen Recording</h2>
          <hr className="divider" />
          <p className="muted" style={{ margin: 0 }}>
            Needed for screenshots and recordings.
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{screenOk ? 'Granted' : 'Not granted yet'}</p>
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
        <section className="onboarding-step">
          <h2 className="section-label">2. Accessibility</h2>
          <hr className="divider" />
          <p className="muted" style={{ margin: 0 }}>
            Needed for global keyboard shortcuts from any app.
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{axOk ? 'Granted' : 'Not granted yet'}</p>
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
        <section className="onboarding-step">
          <h2 className="section-label">3. Save folder</h2>
          <hr className="divider" />
          <p className="muted" style={{ margin: 0 }}>
            Where captures are written (change later in Settings).
          </p>
          <p style={{ margin: 0, fontWeight: 500 }}>{folder || 'Desktop (default until you choose)'}</p>
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

      {step === 'done' && (
        <p style={{ fontWeight: 500, margin: 0 }}>You are set. Look for the rabbit in the menu bar.</p>
      )}
    </div>
  )
}
