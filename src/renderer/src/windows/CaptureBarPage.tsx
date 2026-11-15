import { useEffect, useRef, useState } from 'react'

export function CaptureBarPage() {
  const [recording, setRecording] = useState(false)
  const [mic, setMic] = useState(false)
  const [status, setStatus] = useState('')
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

  const startRecording = async () => {
    const start = await window.grabbit.recordStart({ mode: 'fullscreen', micEnabled: mic })
    if (!start.ok || !start.sourceId) {
      setStatus(start.error || 'Could not start')
      return
    }

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
        setStatus('Recording saved')
        window.close()
      }
      mediaRecorderRef.current = recorder
      recorder.start(250)
      setRecording(true)
      setStatus('Recording…')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Capture failed')
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

  return (
    <div
      className="panel"
      style={{
        margin: 8,
        height: 'calc(100% - 16px)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        background: 'rgba(24,24,28,0.92)',
        backdropFilter: 'blur(16px)'
      }}
    >
      <button className="btn" onClick={() => window.grabbit.captureFullscreen()}>
        Screen
      </button>
      <button className="btn" onClick={() => window.grabbit.captureRegion()}>
        Region
      </button>
      <button className="btn" onClick={() => window.grabbit.captureWindow()}>
        Window
      </button>
      <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
      {!recording ? (
        <button className="btn primary" onClick={() => void startRecording()}>
          Record
        </button>
      ) : (
        <button className="btn danger" onClick={() => void stopRecording()}>
          Stop
        </button>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
        Mic
      </label>
      <span className="muted" style={{ marginLeft: 'auto' }}>
        {status}
      </span>
    </div>
  )
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
