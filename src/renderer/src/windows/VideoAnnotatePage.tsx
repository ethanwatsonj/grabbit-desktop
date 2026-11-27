import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { AnnotatePayload } from '../../../shared/types'
import { ANNOTATION_PALETTE } from '../design/tokens'

/**
 * Video annotate window — mirrors VideoAnnotationWindow.swift:
 * titlebar (filename) · video stage with a floating tool pill (select / zoom / text)
 * · 44px timeline row (play/pause, scrubber with marker ticks, time label, save).
 */

type VideoTool = 'select' | 'zoom' | 'text'

interface ZoomMarker {
  id: number
  kind: 'zoom'
  t: number
  /** Normalized (0–1) focus point inside the video frame */
  cx: number
  cy: number
  scale: number
}

interface TextMarker {
  id: number
  kind: 'text'
  t: number
  /** Normalized (0–1) top-left of the text inside the video frame */
  x: number
  y: number
  text: string
}

type Marker = ZoomMarker | TextMarker

interface TextDraft {
  x: number
  y: number
  t: number
  value: string
}

interface Size {
  w: number
  h: number
}

const ZOOM_CLICK_SCALE = 1.8
const ZOOM_MIN_SCALE = 1.2
const ZOOM_MAX_SCALE = 4
const DRAG_THRESHOLD_PX = 8

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function baseName(filePath: string | undefined): string {
  if (!filePath) return 'Recording'
  const file = filePath.split(/[\\/]/).pop() ?? filePath
  const dot = file.lastIndexOf('.')
  return dot > 0 ? file.slice(0, dot) : file
}

/** Top-left (normalized) of the visible region for a zoom marker. */
function zoomOrigin(m: ZoomMarker): { left: number; top: number } {
  const span = 1 / m.scale
  return {
    left: clamp(m.cx - span / 2, 0, 1 - span),
    top: clamp(m.cy - span / 2, 0, 1 - span)
  }
}

const TOOL_DEFS: { id: VideoTool; label: string; shortcut: string; icon: ReactNode }[] = [
  {
    id: 'select',
    label: 'Select',
    shortcut: 'S',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M3.2 1.6a.6.6 0 0 1 .98-.46l8.4 6.9a.6.6 0 0 1-.34 1.06l-3.6.3 2.1 4.2a.6.6 0 0 1-.27.8l-1.2.6a.6.6 0 0 1-.8-.27l-2.1-4.2-2.4 2.7a.6.6 0 0 1-1.05-.4V1.6z" />
      </svg>
    )
  },
  {
    id: 'zoom',
    label: 'Zoom',
    shortcut: 'Z',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
        <circle cx="6.8" cy="6.8" r="4.6" />
        <path d="M10.3 10.3L14 14M6.8 4.7v4.2M4.7 6.8h4.2" />
      </svg>
    )
  },
  {
    id: 'text',
    label: 'Text',
    shortcut: 'T',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M2.5 4.5V3h11v1.5M8 3v10M6 13h4" />
      </svg>
    )
  }
]

export function VideoAnnotatePage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<TextDraft | null>(null)
  const markerIdRef = useRef(1)
  const scrubbingRef = useRef(false)
  const zoomDragRef = useRef<{ x0: number; y0: number; px: number; py: number } | null>(null)

  const [payload, setPayload] = useState<AnnotatePayload | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [tool, setTool] = useState<VideoTool>('zoom')
  const [markers, setMarkers] = useState<Marker[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [stage, setStage] = useState<Size>({ w: 0, h: 0 })
  const [natural, setNatural] = useState<Size | null>(null)
  const [textDraft, setTextDraftState] = useState<TextDraft | null>(null)
  const [dragRect, setDragRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const setTextDraft = useCallback((d: TextDraft | null) => {
    draftRef.current = d
    setTextDraftState(d)
  }, [])

  // Load the recording once per capture (data URL — kept stable so <video> never reloads on render).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const p = (await window.grabbit.getRoutePayload()) as AnnotatePayload | null
      if (cancelled) return
      setPayload(p)
      if (p?.path) {
        const url = (await window.grabbit.readFileDataUrl(p.path)) as string | null
        if (!cancelled) setSrc(url)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Track stage size so the frame can match the recording's aspect ratio (no pillarbox inside the frame).
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = (): void => setStage({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Smooth playhead while playing.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = (): void => {
      const v = videoRef.current
      if (v && !scrubbingRef.current) setCurrent(v.currentTime || 0)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current
    if (!v) return
    const total = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0
    const clamped = total ? clamp(t, 0, total) : Math.max(0, t)
    v.currentTime = clamped
    setCurrent(clamped)
  }, [])

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }, [])

  const pauseForEditing = useCallback(() => {
    const v = videoRef.current
    if (v && !v.paused) v.pause()
  }, [])

  const chooseTool = useCallback(
    (next: VideoTool) => {
      setTool(next)
      if (next === 'zoom') pauseForEditing()
      if (next !== 'text') {
        // commit-or-drop is handled by blur; make sure nothing lingers
        if (draftRef.current && !draftRef.current.value.trim()) setTextDraft(null)
      }
    },
    [pauseForEditing, setTextDraft]
  )

  const commitText = useCallback(() => {
    const d = draftRef.current
    if (!d) return
    setTextDraft(null)
    const text = d.value.trim()
    if (!text) return
    const id = markerIdRef.current++
    setMarkers((m) => [...m, { id, kind: 'text', t: d.t, x: d.x, y: d.y, text }])
    setSelectedId(id)
  }, [setTextDraft])

  // Keyboard: Space play/pause, S/Z/T tools, Delete removes selected marker, Esc cancels / closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (e.key === 'Escape') {
        if (draftRef.current) {
          e.preventDefault()
          setTextDraft(null)
          return
        }
        if (!typing) window.close()
        return
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === ' ') {
        e.preventDefault()
        togglePlayPause()
      } else if (key === 's') chooseTool('select')
      else if (key === 'z') chooseTool('zoom')
      else if (key === 't') chooseTool('text')
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId != null) {
        e.preventDefault()
        setMarkers((m) => m.filter((x) => x.id !== selectedId))
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chooseTool, selectedId, setTextDraft, togglePlayPause])

  // ——— Frame geometry ———
  const frame: Size = (() => {
    if (!natural || stage.w <= 0 || stage.h <= 0) return { w: stage.w, h: stage.h }
    const scale = Math.min(stage.w / natural.w, stage.h / natural.h)
    return { w: Math.round(natural.w * scale), h: Math.round(natural.h * scale) }
  })()

  // ——— Zoom preview: latest zoom marker with t ≤ currentTime (raw frame while editing zoom) ———
  const zoomMarkers = markers.filter((m): m is ZoomMarker => m.kind === 'zoom')
  const activeZoom = [...zoomMarkers].sort((a, b) => a.t - b.t).filter((m) => m.t <= current + 0.001).pop() ?? null
  const showZoomApplied = !!activeZoom && tool !== 'zoom'
  const zoomStyle = (() => {
    if (!activeZoom || !showZoomApplied) return { transform: 'translate(0%, 0%) scale(1)' }
    const { left, top } = zoomOrigin(activeZoom)
    return {
      transform: `translate(${-left * activeZoom.scale * 100}%, ${-top * activeZoom.scale * 100}%) scale(${activeZoom.scale})`
    }
  })()
  const activeZoomOutline = (() => {
    if (!activeZoom || tool !== 'zoom') return null
    const { left, top } = zoomOrigin(activeZoom)
    const span = 1 / activeZoom.scale
    return { left: `${left * 100}%`, top: `${top * 100}%`, width: `${span * 100}%`, height: `${span * 100}%` }
  })()

  // ——— Interaction layer (over the video) ———
  const toNormalized = (e: { clientX: number; clientY: number }, el: HTMLElement): { x: number; y: number } => {
    const r = el.getBoundingClientRect()
    return {
      x: clamp((e.clientX - r.left) / Math.max(1, r.width), 0, 1),
      y: clamp((e.clientY - r.top) / Math.max(1, r.height), 0, 1)
    }
  }

  const onLayerPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const el = e.currentTarget
    const { x, y } = toNormalized(e, el)
    if (tool === 'zoom') {
      pauseForEditing()
      el.setPointerCapture(e.pointerId)
      zoomDragRef.current = { x0: x, y0: y, px: e.clientX, py: e.clientY }
      setDragRect({ x0: x, y0: y, x1: x, y1: y })
    }
  }

  const onLayerPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = zoomDragRef.current
    if (!drag) return
    const { x, y } = toNormalized(e, e.currentTarget)
    setDragRect({ x0: drag.x0, y0: drag.y0, x1: x, y1: y })
  }

  const onLayerPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    const { x, y } = toNormalized(e, el)

    if (tool === 'zoom' && zoomDragRef.current) {
      const drag = zoomDragRef.current
      zoomDragRef.current = null
      setDragRect(null)
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      const moved = Math.hypot(e.clientX - drag.px, e.clientY - drag.py) > DRAG_THRESHOLD_PX
      let cx = x
      let cy = y
      let scale = ZOOM_CLICK_SCALE
      if (moved) {
        const w = Math.abs(x - drag.x0)
        const h = Math.abs(y - drag.y0)
        scale = clamp(Math.min(1 / Math.max(w, 0.01), 1 / Math.max(h, 0.01)), ZOOM_MIN_SCALE, ZOOM_MAX_SCALE)
        cx = (x + drag.x0) / 2
        cy = (y + drag.y0) / 2
      }
      const t = videoRef.current?.currentTime ?? current
      const id = markerIdRef.current++
      setMarkers((m) => [
        ...m.filter((k) => !(k.kind === 'zoom' && Math.abs(k.t - t) < 0.05)),
        { id, kind: 'zoom', t, cx, cy, scale }
      ])
      setSelectedId(id)
      return
    }

    if (tool === 'text') {
      pauseForEditing()
      setTextDraft({ x, y, t: videoRef.current?.currentTime ?? current, value: '' })
      return
    }

    if (tool === 'select') {
      setSelectedId(null)
      togglePlayPause()
    }
  }

  // ——— Timeline scrubber ———
  const timeForClientX = (clientX: number): number => {
    const el = trackRef.current
    if (!el || duration <= 0) return 0
    const r = el.getBoundingClientRect()
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * duration
  }

  const onScrubDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 || duration <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    scrubbingRef.current = true
    seekTo(timeForClientX(e.clientX))
  }
  const onScrubMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (scrubbingRef.current) seekTo(timeForClientX(e.clientX))
  }
  const onScrubUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    scrubbingRef.current = false
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const pct = (t: number): string => `${duration > 0 ? clamp(t / duration, 0, 1) * 100 : 0}%`

  const textMarkers = markers.filter((m): m is TextMarker => m.kind === 'text' && m.t <= current + 0.001)
  const title = baseName(payload?.path)
  const textPx = Math.max(14, Math.round(frame.h * 0.05))
  const textColor = ANNOTATION_PALETTE[0]

  return (
    <div className="app-surface video-annotate-page">
      {/* Titlebar: drag region + filename */}
      <div className="video-annotate-titlebar titlebar-drag">
        <span className="video-annotate-titlebar__name">{title}</span>
      </div>

      {/* Video stage — fills everything above the 44px timeline row */}
      <div className="video-annotate-stage" ref={stageRef}>
        {src ? (
          <div className="video-annotate-frame" style={{ width: frame.w, height: frame.h }}>
            <div className="video-annotate-zoom" style={zoomStyle}>
              <video
                ref={videoRef}
                className="video-annotate-video"
                src={src}
                playsInline
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  if (v.videoWidth > 0 && v.videoHeight > 0) setNatural({ w: v.videoWidth, h: v.videoHeight })
                  if (Number.isFinite(v.duration) && v.duration > 0) {
                    setDuration(v.duration)
                  } else {
                    // MediaRecorder WebM often reports Infinity — force the real duration to resolve.
                    v.currentTime = 1e7
                  }
                  void v.play().catch(() => undefined)
                }}
                onDurationChange={(e) => {
                  const v = e.currentTarget
                  if (Number.isFinite(v.duration) && v.duration > 0) {
                    setDuration(v.duration)
                    if (v.currentTime > v.duration) v.currentTime = 0
                  }
                }}
                onTimeUpdate={(e) => {
                  if (!scrubbingRef.current && !playing) setCurrent(e.currentTarget.currentTime || 0)
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false)
                  seekTo(0)
                }}
              />
            </div>

            {/* Text overlays (not zoomed, like the Swift canvas) */}
            {textMarkers.map((m) => (
              <div
                key={m.id}
                className={`video-annotate-text ${selectedId === m.id ? 'is-selected' : ''}`}
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, fontSize: textPx, color: textColor }}
              >
                {m.text}
              </div>
            ))}

            {activeZoomOutline ? <div className="video-annotate-zoom-outline" style={activeZoomOutline} /> : null}
            {dragRect ? (
              <div
                className="video-annotate-zoom-outline is-drag"
                style={{
                  left: `${Math.min(dragRect.x0, dragRect.x1) * 100}%`,
                  top: `${Math.min(dragRect.y0, dragRect.y1) * 100}%`,
                  width: `${Math.abs(dragRect.x1 - dragRect.x0) * 100}%`,
                  height: `${Math.abs(dragRect.y1 - dragRect.y0) * 100}%`
                }}
              />
            ) : null}

            {/* Interaction layer */}
            <div
              className={`video-annotate-layer is-${tool}`}
              onPointerDown={onLayerPointerDown}
              onPointerMove={onLayerPointerMove}
              onPointerUp={onLayerPointerUp}
              onPointerCancel={() => {
                zoomDragRef.current = null
                setDragRect(null)
              }}
            />

            {textDraft ? (
              <input
                className="video-annotate-text-input"
                autoFocus
                spellCheck={false}
                placeholder="Type…"
                value={textDraft.value}
                style={{
                  left: `${textDraft.x * 100}%`,
                  top: `${textDraft.y * 100}%`,
                  fontSize: textPx,
                  color: textColor
                }}
                onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
                onBlur={commitText}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitText()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    setTextDraft(null)
                  }
                  e.stopPropagation()
                }}
              />
            ) : null}
          </div>
        ) : (
          <div className="video-annotate-empty">Loading recording…</div>
        )}

        {/* Floating tool pill — bottom-center over the video */}
        <div className="video-annotate-pill titlebar-no-drag" role="toolbar" aria-label="Annotation tools">
          {TOOL_DEFS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`video-annotate-pill__btn ${tool === t.id ? 'is-active' : ''}`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
              onClick={() => chooseTool(t.id)}
            >
              {t.icon}
              <span className="video-annotate-pill__tip">
                {t.label}
                <kbd>{t.shortcut}</kbd>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Timeline row (44px) */}
      <div className="video-annotate-timeline titlebar-no-drag">
        <button
          type="button"
          className="video-annotate-play"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={togglePlayPause}
          disabled={!src}
        >
          {playing ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" />
              <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <path d="M4.5 2.7a.8.8 0 0 1 1.2-.7l7.6 4.9a.8.8 0 0 1 0 1.4L5.7 13a.8.8 0 0 1-1.2-.7V2.7z" />
            </svg>
          )}
        </button>

        <div
          className="video-annotate-scrubber"
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
        >
          <div className="video-annotate-track" ref={trackRef}>
            {markers.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`video-annotate-tick is-${m.kind} ${selectedId === m.id ? 'is-selected' : ''}`}
                style={{ left: pct(m.t) }}
                title={m.kind === 'zoom' ? `Zoom at ${formatTime(m.t)}` : `Text “${m.text}” at ${formatTime(m.t)}`}
                aria-label={m.kind === 'zoom' ? 'Zoom marker' : 'Text marker'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSelectedId(m.id)
                  seekTo(m.t)
                }}
              />
            ))}
            <div className="video-annotate-playhead" style={{ left: pct(current) }}>
              <span className="video-annotate-playhead__dot" />
            </div>
          </div>
        </div>

        <span className="video-annotate-time">
          {formatTime(current)} / {formatTime(duration)}
        </span>

        <button
          type="button"
          className="btn compact video-annotate-save"
          disabled={!payload?.captureId}
          onClick={() => {
            if (payload?.captureId) void window.grabbit.historyReveal(payload.captureId)
          }}
        >
          Save and show in Finder
        </button>
      </div>
    </div>
  )
}
