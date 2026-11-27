import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement
} from 'react'

type CaptureMode =
  | 'screenshotRegion'
  | 'screenshotWindow'
  | 'screenshotFullScreen'
  | 'recordFullScreen'
  | 'recordWindow'
  | 'recordRegion'

interface WindowSource {
  id: string
  name: string
}

/** Mirrors CaptureBar.swift groups: screenshot cluster, then record cluster. */
const SCREENSHOT_MODES: { id: CaptureMode; label: string }[] = [
  { id: 'screenshotFullScreen', label: 'Capture Full Screen' },
  { id: 'screenshotWindow', label: 'Capture Window' },
  { id: 'screenshotRegion', label: 'Capture Region' }
]

const RECORD_MODES: { id: CaptureMode; label: string }[] = [
  { id: 'recordFullScreen', label: 'Record Full Screen' },
  { id: 'recordWindow', label: 'Record Window' },
  { id: 'recordRegion', label: 'Record Region' }
]

type OpenMenu = 'window' | 'systemAudio' | 'mic' | null

const isRecordMode = (m: CaptureMode): boolean => m.startsWith('record')
const isWindowMode = (m: CaptureMode): boolean => m === 'screenshotWindow' || m === 'recordWindow'

export function CaptureBarPage() {
  // CaptureBar.swift: mode buttons only SELECT; trailing CTA performs the action.
  const [mode, setMode] = useState<CaptureMode>('screenshotRegion')
  const [recording, setRecording] = useState(false)
  const [mic, setMic] = useState(false)
  const [systemAudio, setSystemAudio] = useState(false)
  const [hover, setHover] = useState<{ text: string; x: number } | null>(null)
  const [windows, setWindows] = useState<WindowSource[]>([])
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null)
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rootRef = useRef<HTMLDivElement>(null)
  const stackRef = useRef<HTMLDivElement>(null)
  const recordingRef = useRef(false)
  recordingRef.current = recording

  const recordMode = isRecordMode(mode)
  const windowMode = isWindowMode(mode)
  const showsOptionsRow = windowMode || recordMode
  const showsMedia = recordMode
  const showsPicker = windowMode

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    } else {
      await window.grabbit.recordStop()
      setRecording(false)
    }
  }, [])

  useEffect(() => {
    void window.grabbit.recordStatus().then((s) => setRecording(Boolean(s.active)))
    const unsubscribe = window.grabbit.onRecordRequestStop(() => {
      void stopRecording()
    })
    return () => {
      unsubscribe()
    }
  }, [stopRecording])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (recordingRef.current) return
      e.preventDefault()
      window.close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Load windows whenever a window-capture mode is selected (screenshot or record).
  useEffect(() => {
    if (!showsPicker) {
      setOpenMenu((m) => (m === 'window' ? null : m))
      return
    }
    let cancelled = false
    void window.grabbit.listWindows().then((list) => {
      if (cancelled) return
      const next = list as WindowSource[]
      setWindows(next)
      setSelectedWindowId((cur) =>
        cur && next.some((w) => w.id === cur) ? cur : (next[0]?.id ?? null)
      )
    })
    return () => {
      cancelled = true
    }
  }, [showsPicker])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!stackRef.current?.contains(t)) setOpenMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const startRecording = async (recordModeId: CaptureMode) => {
    const start = await window.grabbit.recordStart({
      mode:
        recordModeId === 'recordWindow'
          ? 'window'
          : recordModeId === 'recordRegion'
            ? 'region'
            : 'fullscreen',
      micEnabled: mic,
      sourceId: recordModeId === 'recordWindow' ? (selectedWindowId ?? undefined) : undefined
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

  const onPrimary = () => {
    if (recordMode) {
      void startRecording(mode)
      return
    }
    if (mode === 'screenshotFullScreen') void window.grabbit.captureFullscreen()
    else if (mode === 'screenshotWindow') void window.grabbit.captureWindow()
    else void window.grabbit.captureRegion()
    window.close()
  }

  const showHover = (e: MouseEvent<HTMLElement>, text: string) => {
    const stack = stackRef.current
    if (!stack) return
    const rect = e.currentTarget.getBoundingClientRect()
    const stackRect = stack.getBoundingClientRect()
    setHover({ text, x: rect.left + rect.width / 2 - stackRect.left })
  }
  const hideHover = () => setHover(null)

  const hoverProps = (text: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => showHover(e, text),
    onMouseLeave: hideHover
  })

  const selectedWindowName = windows.find((w) => w.id === selectedWindowId)?.name
  const pickerTitle = selectedWindowName ?? (windows.length ? 'Select a window…' : 'Loading windows…')

  const primaryDisabled =
    (mode === 'recordWindow' || mode === 'screenshotWindow') && !selectedWindowId

  const renderModeButton = (m: { id: CaptureMode; label: string }) => (
    <button
      key={m.id}
      type="button"
      className={`mode-btn ${mode === m.id ? 'is-active' : ''}`}
      aria-label={m.label}
      aria-pressed={mode === m.id}
      disabled={recording}
      {...hoverProps(m.label)}
      onClick={() => {
        setMode(m.id)
        setOpenMenu(null)
      }}
    >
      <ModeGlyph mode={m.id} />
    </button>
  )

  return (
    <div className="capture-bar-root" ref={rootRef}>
      <div className="capture-bar-stack" ref={stackRef}>
        {hover ? (
          <div className="capture-bar__hover-label" style={{ left: hover.x }}>
            {hover.text}
          </div>
        ) : null}

        {showsOptionsRow ? (
          <div
            className={`capture-bar__options ${
              showsMedia && !showsPicker ? 'is-media-only' : ''
            }`}
          >
            {showsPicker ? (
              <div className="capture-bar__picker-wrap">
                <button
                  type="button"
                  className="capture-bar__picker"
                  disabled={recording}
                  onClick={() => setOpenMenu((v) => (v === 'window' ? null : 'window'))}
                >
                  <span className="capture-bar__picker-title">{pickerTitle}</span>
                  <ChevronUpGlyph className="capture-bar__picker-chevron" />
                </button>
                {openMenu === 'window' ? (
                  <div className="capture-bar__menu" role="listbox">
                    {windows.length === 0 ? (
                      <div className="capture-bar__menu-empty">No windows available</div>
                    ) : (
                      windows.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          role="option"
                          aria-selected={w.id === selectedWindowId}
                          className={`capture-bar__menu-item ${
                            w.id === selectedWindowId ? 'is-selected' : ''
                          }`}
                          onClick={() => {
                            setSelectedWindowId(w.id)
                            setOpenMenu(null)
                          }}
                        >
                          <span className="capture-bar__menu-check">
                            {w.id === selectedWindowId ? '✓' : ''}
                          </span>
                          <span>{w.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {showsPicker && showsMedia ? <div className="capture-bar__sep capture-bar__sep--options" /> : null}

            {showsMedia ? (
              <div className="capture-bar__media">
                <div className="capture-bar__media-wrap">
                  <button
                    type="button"
                    className={`capture-bar__media-btn ${systemAudio ? 'is-active' : ''}`}
                    aria-label="System Audio"
                    aria-pressed={systemAudio}
                    disabled={recording}
                    {...hoverProps(systemAudio ? 'System audio on' : 'System audio off')}
                    onClick={() => setOpenMenu((v) => (v === 'systemAudio' ? null : 'systemAudio'))}
                  >
                    <ChevronUpGlyph className="media-chevron" />
                    <SpeakerGlyph on={systemAudio} />
                  </button>
                  {openMenu === 'systemAudio' ? (
                    <div className="capture-bar__menu is-anchored-media" role="menu">
                      <button
                        type="button"
                        className={`capture-bar__menu-item ${!systemAudio ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSystemAudio(false)
                          setOpenMenu(null)
                        }}
                      >
                        <span className="capture-bar__menu-check">{!systemAudio ? '✓' : ''}</span>
                        None
                      </button>
                      <button
                        type="button"
                        className={`capture-bar__menu-item ${systemAudio ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSystemAudio(true)
                          setOpenMenu(null)
                        }}
                      >
                        <span className="capture-bar__menu-check">{systemAudio ? '✓' : ''}</span>
                        System Audio
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="capture-bar__media-wrap">
                  <button
                    type="button"
                    className={`capture-bar__media-btn ${mic ? 'is-active' : ''}`}
                    aria-label="Microphone"
                    aria-pressed={mic}
                    disabled={recording}
                    {...hoverProps(mic ? 'Microphone on' : 'Microphone off')}
                    onClick={() => setOpenMenu((v) => (v === 'mic' ? null : 'mic'))}
                  >
                    <ChevronUpGlyph className="media-chevron" />
                    <MicGlyph on={mic} />
                  </button>
                  {openMenu === 'mic' ? (
                    <div className="capture-bar__menu is-anchored-media" role="menu">
                      <button
                        type="button"
                        className={`capture-bar__menu-item ${!mic ? 'is-selected' : ''}`}
                        onClick={() => {
                          setMic(false)
                          setOpenMenu(null)
                        }}
                      >
                        <span className="capture-bar__menu-check">{!mic ? '✓' : ''}</span>
                        None
                      </button>
                      <div className="capture-bar__menu-sep" />
                      <button
                        type="button"
                        className={`capture-bar__menu-item ${mic ? 'is-selected' : ''}`}
                        onClick={() => {
                          setMic(true)
                          setOpenMenu(null)
                        }}
                      >
                        <span className="capture-bar__menu-check">{mic ? '✓' : ''}</span>
                        Microphone
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="capture-bar">
          <button
            type="button"
            className="capture-bar__close"
            aria-label="Close"
            disabled={recording}
            {...hoverProps('Close')}
            onClick={() => window.close()}
          >
            <CloseGlyph />
          </button>

          <div className="capture-bar__sep" />

          <div className="capture-bar__modes">{SCREENSHOT_MODES.map(renderModeButton)}</div>

          <div className="capture-bar__sep" />

          <div className="capture-bar__modes">{RECORD_MODES.map(renderModeButton)}</div>

          <div className="capture-bar__sep" />

          {recording ? (
            <button
              type="button"
              className="capture-bar__cta is-stop"
              onClick={() => void stopRecording()}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="capture-bar__cta"
              disabled={primaryDisabled}
              onClick={onPrimary}
            >
              {recordMode ? 'Record' : 'Capture'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** SF Symbol approximations: rectangle.fill / macwindow / rectangle.dashed (+ rec badge). */
function ModeGlyph({ mode }: { mode: CaptureMode }) {
  const rec = isRecordMode(mode)
  const maskId = `cut-${mode}`
  let shape: ReactElement
  switch (mode) {
    case 'screenshotRegion':
    case 'recordRegion':
      // rectangle.dashed — corner brackets + light dashed body
      shape = (
        <>
          <path
            className="glyph-stroke"
            d="M8 5.5H5.5V8M20 5.5h2.5V8M8 22.5H5.5V20M20 22.5h2.5V20"
            strokeWidth={2}
          />
          <rect
            className="glyph-stroke"
            x="8.5"
            y="8.5"
            width="11"
            height="11"
            rx="1.5"
            strokeDasharray="2.5 2"
          />
        </>
      )
      break
    case 'screenshotWindow':
    case 'recordWindow':
      // macwindow
      shape = (
        <>
          <rect className="glyph-stroke" x="4.5" y="6.5" width="19" height="15" rx="2.5" strokeWidth={1.7} />
          <path className="glyph-stroke" d="M4.5 10.5h19" strokeWidth={1.7} />
          <circle className="glyph-fill" cx="7.5" cy="8.5" r="0.85" />
          <circle className="glyph-fill" cx="10.2" cy="8.5" r="0.85" />
          <circle className="glyph-fill" cx="12.9" cy="8.5" r="0.85" />
        </>
      )
      break
    default:
      // rectangle.fill
      shape = <rect className="glyph-fill" x="4" y="6" width="20" height="14" rx="2.5" />
  }
  return (
    <svg viewBox="0 0 28 28" aria-hidden>
      {rec ? (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="28" height="28">
            <rect x="0" y="0" width="28" height="28" fill="white" />
            {/* 2px knockout ring around 10pt record badge */}
            <circle cx="23" cy="23" r="7" fill="black" />
          </mask>
        </defs>
      ) : null}
      <g mask={rec ? `url(#${maskId})` : undefined}>{shape}</g>
      {rec ? <circle className="rec-dot" cx="23" cy="23" r="5" /> : null}
    </svg>
  )
}

function MicGlyph({ on }: { on: boolean }) {
  return (
    <svg className="media-icon" viewBox="0 0 18 18" aria-hidden>
      <rect
        x="6.5"
        y="2.5"
        width="5"
        height="8"
        rx="2.5"
        className={on ? 'glyph-fill' : 'glyph-stroke'}
      />
      <path className="glyph-stroke" d="M4 9.5a5 5 0 0 0 10 0M9 14.5v2" />
    </svg>
  )
}

function SpeakerGlyph({ on }: { on: boolean }) {
  return (
    <svg className="media-icon" viewBox="0 0 18 18" aria-hidden>
      <path
        d="M3.5 7v4h2.8L10 14.2V3.8L6.3 7H3.5z"
        className={on ? 'glyph-fill' : 'glyph-stroke'}
      />
      <path className="glyph-stroke" d="M12.2 7a2.8 2.8 0 0 1 0 4M14.2 5a5.2 5.2 0 0 1 0 8" />
    </svg>
  )
}

function ChevronUpGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 10" aria-hidden className={className}>
      <path d="M2 7.5L6 3.5l4 4" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
