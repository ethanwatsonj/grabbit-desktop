import { useEffect, useMemo, useState } from 'react'
import type { CaptureRecord, OrganizeSuggestion } from '../../../shared/types'

export function LibraryPage() {
  const [items, setItems] = useState<CaptureRecord[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [introSeen, setIntroSeen] = useState(true)
  const [suggestion, setSuggestion] = useState<OrganizeSuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  const refresh = async () => {
    const list = (await window.grabbit.historyList()) as CaptureRecord[]
    setItems(list)
    const settings = await window.grabbit.settingsGet()
    setIntroSeen(Boolean(settings.libraryIntroSeen))
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, string> = {}
      for (const item of items.slice(0, 40)) {
        if (item.kind !== 'screenshot') continue
        const url = await window.grabbit.readFileDataUrl(item.thumbnailPath || item.path)
        if (url) next[item.id] = url as string
      }
      if (!cancelled) setThumbs(next)
    })()
    return () => {
      cancelled = true
    }
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => {
      const hay = `${i.displayName ?? ''} ${i.projectTag ?? ''} ${i.customTags.join(' ')} ${i.path}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.projectTag) set.add(i.projectTag)
    return Array.from(set).sort()
  }, [items])

  const selectedItem = items.find((i) => i.id === selected) ?? null

  return (
    <div className="app-surface" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
      <aside style={{ borderRight: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="titlebar-drag" style={{ height: 28 }} />
        <div style={{ fontWeight: 700, fontSize: 16 }}>Capture Library</div>
        <input className="field titlebar-no-drag" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Projects
        </div>
        <button className="btn ghost titlebar-no-drag" style={{ textAlign: 'left' }} onClick={() => setQuery('')}>
          All captures
        </button>
        {projects.map((p) => (
          <button key={p} className="btn ghost titlebar-no-drag" style={{ textAlign: 'left' }} onClick={() => setQuery(p)}>
            {p}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn titlebar-no-drag" onClick={() => window.grabbit.settingsShow()}>
          Settings
        </button>
      </aside>

      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          className="titlebar-drag"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '18px 18px 12px 18px',
            borderBottom: '1px solid var(--border)'
          }}
        >
          <div style={{ flex: 1 }} />
          <button
            className="btn titlebar-no-drag"
            disabled={!selectedItem || busy}
            onClick={async () => {
              if (!selectedItem) return
              setBusy(true)
              try {
                const s = (await window.grabbit.organizeSuggest(selectedItem.id)) as OrganizeSuggestion
                setSuggestion(s)
              } finally {
                setBusy(false)
              }
            }}
          >
            Auto Organize
          </button>
          <button
            className="btn primary titlebar-no-drag"
            disabled={!selectedItem}
            onClick={() => selectedItem && window.grabbit.annotateOpen(selectedItem.id)}
          >
            Open
          </button>
        </header>

        <div style={{ padding: 16, overflow: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {filtered.map((item) => (
            <button
              key={item.id}
              className="panel titlebar-no-drag"
              onClick={() => setSelected(item.id)}
              onDoubleClick={() => window.grabbit.annotateOpen(item.id)}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-grabbit-capture', item.id)
              }}
              style={{
                padding: 0,
                overflow: 'hidden',
                textAlign: 'left',
                outline: selected === item.id ? '2px solid var(--accent)' : 'none',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)'
              }}
            >
              <div style={{ aspectRatio: '16/10', background: '#0a0a0b', display: 'grid', placeItems: 'center' }}>
                {thumbs[item.id] ? (
                  <img src={thumbs[item.id]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span className="muted">{item.kind === 'recording' ? 'Recording' : 'Screenshot'}</span>
                )}
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.displayName || 'Untitled'}
                </div>
                <div className="muted" style={{ marginTop: 4 }}>
                  {item.projectTag || 'No project'}
                </div>
              </div>
            </button>
          ))}
          {!filtered.length && <div className="muted">No captures yet. Use the menu bar rabbit to grab the screen.</div>}
        </div>

        {selectedItem && (
          <footer style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="field"
              style={{ maxWidth: 280 }}
              value={selectedItem.displayName ?? ''}
              onChange={(e) => {
                const name = e.target.value
                setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, displayName: name } : i)))
              }}
              onBlur={async (e) => {
                await window.grabbit.historyUpdate(selectedItem.id, { displayName: e.target.value })
                await refresh()
              }}
            />
            <input
              className="field"
              style={{ maxWidth: 180 }}
              placeholder="Project"
              value={selectedItem.projectTag ?? ''}
              onChange={(e) => {
                const projectTag = e.target.value
                setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, projectTag } : i)))
              }}
              onBlur={async (e) => {
                await window.grabbit.historyUpdate(selectedItem.id, { projectTag: e.target.value || undefined })
                await refresh()
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('application/x-grabbit-capture')
                if (!id) return
                await window.grabbit.historyUpdate(id, { projectTag: selectedItem.projectTag })
                await refresh()
              }}
            />
            <button className="btn" onClick={() => window.grabbit.historyReveal(selectedItem.id)}>
              Reveal in Finder
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                await window.grabbit.historyDelete(selectedItem.id)
                setSelected(null)
                await refresh()
              }}
            >
              Delete
            </button>
          </footer>
        )}
      </main>

      {!introSeen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 20
          }}
        >
          <div className="panel" style={{ width: 420, padding: 24 }}>
            <h2 style={{ marginTop: 0 }}>Welcome to Capture Library</h2>
            <p className="muted">
              Browse recent grabs, assign projects, and run Auto Organize. Suggestions never apply until you accept.
            </p>
            <button
              className="btn primary"
              onClick={async () => {
                await window.grabbit.settingsSet({ libraryIntroSeen: true })
                setIntroSeen(true)
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {suggestion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 30
          }}
        >
          <div className="panel" style={{ width: 440, padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>Auto Organize suggestion</h3>
            <p>
              <strong>{suggestion.suggestedName}</strong>
              {suggestion.suggestedProject ? ` → ${suggestion.suggestedProject}` : ''}
            </p>
            <p className="muted">{suggestion.rationale}</p>
            <p className="muted">Provider: {suggestion.provider}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn"
                onClick={async () => {
                  await window.grabbit.organizeDismiss()
                  setSuggestion(null)
                }}
              >
                Dismiss
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  await window.grabbit.organizeApply(suggestion)
                  setSuggestion(null)
                  await refresh()
                }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
