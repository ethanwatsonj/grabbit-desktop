import { useEffect, useRef, useState } from 'react'

type CaptureMode =
  | 'screenshotRegion'
  | 'screenshotWindow'
  | 'screenshotFullScreen'
  | 'recordFullScreen'
  | 'recordWindow'
  | 'recordRegion'

/** Order matches CaptureBar.swift mode groups. */
const MODES: { id: CaptureMode; label: string; record: boolean }[] = [
  { id: 'screenshotFullScreen', label: 'Capture Full Screen', record: false },
  { id: 'screenshotWindow', label: 'Capture Window', record: false },
  { id: 'screenshotRegion', label: 'Capture Region', record: false },
  { id: 'recordFullScreen', label: 'Record Full Screen', record: true },
  { id: 'recordWindow', label: 'Record Window', record: true },
  { id: 'recordRegion', label: 'Record Region', record: true }
]

export function CaptureBarPage() {
  const [mode, setMode] = useState<CaptureMode>('screenshotRegion')
  const [recording, setRecording] = useState(false)
  const [mic, setMic] = useState(false)
  const [hoverLabel, setHoverLabel] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    void window.grabbit.recordStatus().then((s) => setRecording(Boolean(s.active)))
    const unsubscribe = window.grabbit.onRecordRequestStop(() => {
      void stopRecording()
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const runScreenshot = async (m: CaptureMode) => {
    if (m === 'screenshotFullScreen') await window.grabbit.captureFullscreen()
    else if (m === 'screenshotWindow') await window.grabbit.captureWindow()
    else await window.grabbit.captureRegion()
  }

  const startRecording = async (recordMode: CaptureMode) => {
    const start = await window.grabbit.recordStart({
      mode:
        recordMode === 'recordWindow'
          ? 'window'
          : recordMode === 'recordRegion'
            ? 'region'
            : 'fullscreen',
      micEnabled: mic
    })
    if (!start.ok || !start.sourceId) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: mic,
        video: {
          // @ts-expect-error Electron desktop capturer constraint
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: start.sourceId
          }
        }
      })

      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const buffer = await blob.arrayBuffer()
        const b64 = arrayBufferToBase64(buffer)
        await window.grabbit.recordWriteAndFinalize(b64)
        setRecording(false)
        window.close()
      }
      mediaRecorderRef.current = recorder
      recorder.start(250)
      setRecording(true)
    } catch {
      await window.grabbit.recordStop()
    }
  }

  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      await window.grabbit.recordStop()
      setRecording(false)
    }
  }

  const onModeActivate = async (m: CaptureMode) => {
    setMode(m)
    const spec = MODES.find((x) => x.id === m)
    if (!spec) return
    if (spec.record) {
      if (recording) await stopRecording()
      else await startRecording(m)
    } else {
      await runScreenshot(m)
    }
  }

  return (
    <div className="capture-bar">
      <div className="capture-bar__modes">
        {MODES.slice(0, 3).map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mode-btn ${mode === m.id ? 'is-active' : ''}`}
            title={m.label}
            onMouseEnter={() => setHoverLabel(m.label)}
            onMouseLeave={() => setHoverLabel(null)}
            onClick={() => void onModeActivate(m.id)}
          >
            <ModeGlyph mode={m.id} />
          </button>
        ))}
        <div className="capture-bar__sep" />
        {MODES.slice(3).map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mode-btn ${mode === m.id ? 'is-active' : ''} is-record`}
            title={m.label}
            onMouseEnter={() => setHoverLabel(m.label)}
            onMouseLeave={() => setHoverLabel(null)}
            onClick={() => void onModeActivate(m.id)}
          >
            <ModeGlyph mode={m.id} />
          </button>
        ))}
      </div>

      <div className="capture-bar__sep" />

      <button
        type="button"
        className={`mode-btn capture-bar__mic ${mic ? 'is-active' : ''}`}
        title={mic ? 'Microphone on' : 'Microphone off'}
        onClick={() => setMic((v) => !v)}
        onMouseEnter={() => setHoverLabel(mic ? 'Microphone on' : 'Microphone off')}
        onMouseLeave={() => setHoverLabel(null)}
      >
        <MicGlyph on={mic} />
      </button>

      {recording ? (
        <button type="button" className="btn danger compact" onClick={() => void stopRecording()}>
          Stop
        </button>
      ) : null}

      <div className="capture-bar__sep" />

      <button
        type="button"
        className="mode-btn capture-bar__close"
        title="Close"
        onClick={() => window.close()}
      >
        <CloseGlyph />
      </button>

      {hoverLabel ? <div className="capture-bar__hover-label">{hoverLabel}</div> : null}
    </div>
  )
}

function ModeGlyph({ mode }: { mode: CaptureMode }) {
  switch (mode) {
    case 'screenshotRegion':
    case 'recordRegion':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M7 4H4v3M17 4h3v3M7 20H4v-3M17 20h3v-3" />
          <rect x="7" y="7" width="10" height="10" rx="1" />
          {mode.startsWith('record') ? <circle className="rec-dot" cx="18" cy="18" r="3" /> : null}
        </svg>
      )
    case 'screenshotWindow':
    case 'recordWindow':
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M4 9h16" />
          {mode.startsWith('record') ? <circle className="rec-dot" cx="18" cy="18" r="3" /> : null}
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 20h8" />
          {mode.startsWith('record') ? <circle className="rec-dot" cx="18" cy="18" r="3" /> : null}
        </svg>
      )
  }
}

function MicGlyph({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {!on ? <path d="M4 4l16 16" /> : null}
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
