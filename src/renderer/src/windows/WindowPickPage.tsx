import { useEffect, useState } from 'react'

export function WindowPickPage() {
  const [windows, setWindows] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    void window.grabbit.listWindows().then((list) => setWindows(list as Array<{ id: string; name: string }>))
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center' }}>
      <div className="panel" style={{ width: 520, maxHeight: 420, overflow: 'auto', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong>Choose a window</strong>
          <button className="btn ghost" onClick={() => window.grabbit.windowCancel()}>
            Cancel
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {windows.map((w) => (
            <button key={w.id} className="btn" style={{ textAlign: 'left' }} onClick={() => window.grabbit.windowSelected(w.id)}>
              {w.name || w.id}
            </button>
          ))}
          {!windows.length && <div className="muted">No windows found</div>}
        </div>
      </div>
    </div>
  )
}
