import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CaptureRecord,
  LibraryBrowseResult,
  LibraryFolderEntry,
  LibraryPrimaryView,
  OrganizeSuggestion
} from '../../../shared/types'
import { RabbitHopLoader, RabbitIcon } from '../design/RabbitHopLoader'

const ROOT_PATH = ''

function isMedia(item: CaptureRecord): boolean {
  return item.kind === 'screenshot' || item.kind === 'recording'
}

function viewLabel(view: LibraryPrimaryView): string {
  if (view === 'media') return 'Images & video'
  if (view === 'audio') return 'Audio'
  return 'All'
}

function basename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

function kindLabel(item: CaptureRecord): string {
  if (item.kind === 'screenshot') return 'Image'
  if (item.kind === 'recording') return 'Video'
  if (item.kind === 'audio') return 'Audio'
  return 'File'
}

export function LibraryPage() {
  const [view, setView] = useState<LibraryPrimaryView>('all')
  const [nodes, setNodes] = useState<Record<string, LibraryBrowseResult>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [suggestion, setSuggestion] = useState<OrganizeSuggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set())
  const filterRef = useRef<HTMLDivElement>(null)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const loadPath = useCallback(async (relativePath: string) => {
    setLoadingPaths((prev) => new Set(prev).add(relativePath))
    try {
      const result = (await window.grabbit.libraryBrowse(
        relativePath,
        view
      )) as LibraryBrowseResult
      setNodes((prev) => ({ ...prev, [relativePath]: result }))
      return result
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev)
        next.delete(relativePath)
        return next
      })
    }
  }, [view])

  const refresh = useCallback(async () => {
    const paths = Array.from(new Set([ROOT_PATH].concat(Array.from(expandedRef.current))))
    const results = await Promise.all(
      paths.map((p) => window.grabbit.libraryBrowse(p, view) as Promise<LibraryBrowseResult>)
    )
    const next: Record<string, LibraryBrowseResult> = {}
    paths.forEach((p, i) => {
      next[p] = results[i]
    })
    setNodes(next)
  }, [view])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const root = nodes[ROOT_PATH] ?? null
  const rootName = root?.root ? basename(root.root) : 'Library'

  const allFiles = useMemo(() => {
    const out: CaptureRecord[] = []
    const seen = new Set<string>()
    for (const node of Object.values(nodes)) {
      for (const file of node.files) {
        if (seen.has(file.id)) continue
        seen.add(file.id)
        out.push(file)
      }
    }
    return out
  }, [nodes])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, string> = {}
      for (const item of allFiles.slice(0, 120)) {
        if (item.kind !== 'screenshot') continue
        try {
          const url = await window.grabbit.readFileDataUrl(item.thumbnailPath || item.path)
          if (url) next[item.id] = url as string
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setThumbs(next)
    })()
    return () => {
      cancelled = true
    }
  }, [allFiles])

  const selectedItem = allFiles.find((i) => i.id === selected) ?? null
  const canAnnotate = Boolean(selectedItem && isMedia(selectedItem))
  const canOrganize = Boolean(selectedItem)
  const q = query.trim().toLowerCase()

  useEffect(() => {
    let cancelled = false
    setPreviewUrl(null)
    if (!selectedItem) return
    ;(async () => {
      if (selectedItem.kind === 'screenshot') {
        const url = await window.grabbit.readFileDataUrl(selectedItem.path)
        if (!cancelled) setPreviewUrl((url as string) || thumbs[selectedItem.id] || null)
      } else if (selectedItem.kind === 'recording') {
        const url = await window.grabbit.readFileDataUrl(
          selectedItem.thumbnailPath || selectedItem.path
        )
        if (!cancelled) setPreviewUrl((url as string) || null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedItem, thumbs])

  const toggleFolder = async (folderPath: string) => {
    const wasExpanded = expanded.has(folderPath)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (wasExpanded) next.delete(folderPath)
      else next.add(folderPath)
      return next
    })
    if (!wasExpanded && !nodes[folderPath]) {
      await loadPath(folderPath)
    }
  }

  const runOrganize = async () => {
    if (!selectedItem) return
    setBusy(true)
    try {
      const s = (await window.grabbit.organizeSuggest(selectedItem.id)) as OrganizeSuggestion
      setSuggestion(s)
    } finally {
      setBusy(false)
    }
  }

  const rootFolders = root?.folders ?? []
  const rootFiles = root?.files ?? []
  const hasVisibleRoot =
    rootFolders.some((f) => folderVisible(f, q, nodes, expanded)) ||
    rootFiles.some((f) => matchesQuery(f.displayName || basename(f.path), q))

  return (
    <div className="app-surface library-shell">
      <aside className="library-sidebar" style={{ position: 'relative' }}>
        <div className="titlebar-drag" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }} />

        <div className="library-sidebar__chrome titlebar-no-drag">
          <div className="soft-control" style={{ flex: 1, minWidth: 0 }} title={root?.root}>
            <span className="soft-control__label">Browse</span>
            <span className="soft-control__value" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {rootName}
            </span>
          </div>

          <div className="soft-menu" ref={filterRef}>
            <button
              className={`btn-icon ${view !== 'all' ? 'is-active' : ''}`}
              title="Filter by media type"
              onClick={() => setFilterOpen((v) => !v)}
            >
              <FilterGlyph />
            </button>
            {filterOpen && (
              <div className="soft-menu__panel align-end">
                {(
                  [
                    ['all', 'All'],
                    ['media', 'Images & video'],
                    ['audio', 'Audio']
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className="soft-menu__row"
                    onClick={() => {
                      setView(id)
                      setSelected(null)
                      setFilterOpen(false)
                    }}
                  >
                    <span className="soft-menu__check">{view === id ? '✓' : ''}</span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button className="btn-icon" title="Settings" onClick={() => window.grabbit.settingsShow()}>
            <SettingsGlyph />
          </button>
        </div>

        <div className="library-toolbar titlebar-no-drag">
          <span className="library-toolbar__hint">{viewLabel(view)}</span>
        </div>

        <div className="titlebar-no-drag" style={{ padding: '0 10px 8px 0' }}>
          <input
            className="field"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="library-sidebar__list titlebar-no-drag">
          {rootFolders.map((folder) => (
            <FolderTree
              key={folder.relativePath}
              folder={folder}
              depth={0}
              query={q}
              nodes={nodes}
              expanded={expanded}
              loadingPaths={loadingPaths}
              selected={selected}
              thumbs={thumbs}
              onToggle={toggleFolder}
              onSelect={setSelected}
            />
          ))}

          {rootFiles
            .filter((item) => matchesQuery(item.displayName || basename(item.path), q))
            .map((item) => (
              <FileRow
                key={item.id}
                item={item}
                depth={0}
                selected={selected === item.id}
                thumb={thumbs[item.id]}
                onSelect={() => setSelected(item.id)}
              />
            ))}

          {!hasVisibleRoot && (
            <div style={{ padding: '24px 8px', color: 'var(--sidebar-text-muted)', fontSize: 13 }}>
              {root?.root
                ? q
                  ? 'No matches.'
                  : view === 'audio'
                    ? 'No audio in this library.'
                    : view === 'media'
                      ? 'No images or videos here.'
                      : 'This library is empty.'
                : 'Choose a save folder in Settings.'}
            </div>
          )}
        </div>
      </aside>

      <div className="library-divider" />

      <main className="library-detail">
        {selectedItem ? (
          <>
            <header className="library-detail__header titlebar-drag">
              <div className="library-detail__title titlebar-no-drag">
                <h1>{selectedItem.displayName || 'Untitled'}</h1>
                <p>
                  {kindLabel(selectedItem)}
                  {selectedItem.path ? ` · ${basename(selectedItem.path)}` : ''}
                </p>
              </div>
              <div className="library-detail__actions titlebar-no-drag">
                <button
                  className="btn"
                  disabled={!canOrganize || busy}
                  onClick={() => void runOrganize()}
                  title={busy ? 'Auto-organizing…' : 'Auto Organize'}
                >
                  {busy ? (
                    <RabbitHopLoader size="compact" isAnimating />
                  ) : (
                    <>
                      <RabbitIcon width={18} />
                      Auto Organize
                    </>
                  )}
                </button>
                <button
                  className="btn primary"
                  disabled={!canAnnotate}
                  onClick={() => window.grabbit.annotateOpen(selectedItem.id)}
                >
                  Annotate
                </button>
              </div>
            </header>

            <div className="library-detail__body">
              {selectedItem.kind === 'screenshot' && previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : selectedItem.kind === 'recording' && previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : (
                <div className="library-empty">
                  <FileKindGlyph kind={selectedItem.kind} large />
                  <p className="muted">{kindLabel(selectedItem)} preview</p>
                </div>
              )}
            </div>

            <div className="library-footer-bar titlebar-no-drag">
              <span className="muted" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedItem.path}
              </span>
              <button className="btn" onClick={() => window.grabbit.historyReveal(selectedItem.id)}>
                Show in Finder
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  await window.grabbit.historyDelete(selectedItem.id)
                  setSelected(null)
                  await refresh()
                }}
              >
                Move to Trash
              </button>
            </div>
          </>
        ) : (
          <div className="library-empty">
            <RabbitMark />
            <h2>Select a Capture</h2>
            <p>Choose a file from the sidebar, or expand a folder in your save location.</p>
          </div>
        )}
      </main>

      {suggestion && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Organize suggestion</h3>
            <p>
              <strong>{suggestion.suggestedName}</strong>
              {suggestion.suggestedProject ? ` → ${suggestion.suggestedProject}` : ''}
            </p>
            <p className="muted">{suggestion.rationale}</p>
            <div className="modal-actions">
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

function matchesQuery(name: string, q: string): boolean {
  return !q || name.toLowerCase().includes(q)
}

function folderVisible(
  folder: LibraryFolderEntry,
  q: string,
  nodes: Record<string, LibraryBrowseResult>,
  expanded: Set<string>
): boolean {
  if (matchesQuery(folder.name, q)) return true
  if (!q) return true
  const node = nodes[folder.relativePath]
  if (!node) return false
  if (node.files.some((f) => matchesQuery(f.displayName || basename(f.path), q))) return true
  return node.folders.some((child) => folderVisible(child, q, nodes, expanded))
}

function FolderTree({
  folder,
  depth,
  query,
  nodes,
  expanded,
  loadingPaths,
  selected,
  thumbs,
  onToggle,
  onSelect
}: {
  folder: LibraryFolderEntry
  depth: number
  query: string
  nodes: Record<string, LibraryBrowseResult>
  expanded: Set<string>
  loadingPaths: Set<string>
  selected: string | null
  thumbs: Record<string, string>
  onToggle: (path: string) => void | Promise<void>
  onSelect: (id: string) => void
}) {
  if (!folderVisible(folder, query, nodes, expanded)) return null

  const isExpanded = expanded.has(folder.relativePath)
  const isLoading = loadingPaths.has(folder.relativePath)
  const child = nodes[folder.relativePath]
  const childFolders = child?.folders ?? []
  const childFiles = child?.files ?? []

  return (
    <div className="library-tree-branch">
      <button
        type="button"
        className="library-row library-row--folder"
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => void onToggle(folder.relativePath)}
        aria-expanded={isExpanded}
      >
        <span className={`library-row__disclosure ${isExpanded ? 'is-open' : ''}`} aria-hidden>
          <ChevronGlyph />
        </span>
        <div className="library-row__thumb">
          <FolderGlyph />
        </div>
        <div className="library-row__meta">
          <div className="library-row__name">{folder.name}</div>
          <div className="library-row__sub">
            {isLoading
              ? 'Loading…'
              : `${folder.itemCount} item${folder.itemCount === 1 ? '' : 's'}`}
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="library-tree-children">
          {childFolders.map((childFolder) => (
            <FolderTree
              key={childFolder.relativePath}
              folder={childFolder}
              depth={depth + 1}
              query={query}
              nodes={nodes}
              expanded={expanded}
              loadingPaths={loadingPaths}
              selected={selected}
              thumbs={thumbs}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
          {childFiles
            .filter((item) => matchesQuery(item.displayName || basename(item.path), query))
            .map((item) => (
              <FileRow
                key={item.id}
                item={item}
                depth={depth + 1}
                selected={selected === item.id}
                thumb={thumbs[item.id]}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          {child && !childFolders.length && !childFiles.length && !query && (
            <div
              className="library-tree-empty"
              style={{ paddingLeft: 8 + (depth + 1) * 14 + 28 }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FileRow({
  item,
  depth,
  selected,
  thumb,
  onSelect
}: {
  item: CaptureRecord
  depth: number
  selected: boolean
  thumb?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`library-row ${selected ? 'is-selected' : ''}`}
      style={{ paddingLeft: 8 + depth * 14 + 14 }}
      onClick={onSelect}
      onDoubleClick={() => {
        if (isMedia(item)) window.grabbit.annotateOpen(item.id)
        else window.grabbit.historyReveal(item.id)
      }}
    >
      <div className="library-row__thumb">
        {thumb ? <img src={thumb} alt="" /> : <FileKindGlyph kind={item.kind} />}
      </div>
      <div className="library-row__meta">
        <div className="library-row__name">{item.displayName || 'Untitled'}</div>
        <div className="library-row__sub">{kindLabel(item)}</div>
      </div>
    </button>
  )
}

function RabbitMark() {
  return (
    <svg className="rabbit-mark" width="56" height="56" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8 14c1.5-4 4-6 7-5 1-2 3-3 4.5-1.5C21 8 22 10 21 12c-.5 2-2.5 3-5 2.5-1.5 1.5-4 1.5-6.5.2C7.5 15.5 5 15 4 13.5"
        stroke="currentColor"
        fill="none"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FilterGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}

function SettingsGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </svg>
  )
}

function ChevronGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden>
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FolderGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

function FileKindGlyph({ kind, large }: { kind: CaptureRecord['kind']; large?: boolean }) {
  const size = large ? 40 : 14
  if (kind === 'recording') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
      </svg>
    )
  }
  if (kind === 'audio') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path
          d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="5" y="3" width="14" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
