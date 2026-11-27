import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import type {
  AppSettings,
  CaptureLocationSnapshot,
  CaptureRecord,
  LibraryGroupBy,
  LibraryMediaKind,
  MultiSelectLayout,
  OrganizeApplyResult,
  OrganizeSuggestion
} from '../../../shared/types'
import { AutoOrganizeButton } from '../design/AutoOrganizeButton'
import {
  CheckGlyph,
  ChevronDownGlyph,
  ChevronRightGlyph,
  FilterGlyph,
  FolderGlyph,
  GridGlyph,
  ListGlyph,
  PhotoGlyph,
  UndoGlyph,
  VideoGlyph,
  XGlyph
} from '../design/Glyphs'
import { RabbitHopLoader, RabbitIcon } from '../design/RabbitHopLoader'
import { ShimmerText } from '../design/Shimmer'
import { SlideUpReplace, SUGGESTION_ACCEPT_MS } from '../design/SlideUpReplace'
import {
  SoftDropdown,
  SoftDropdownPanel,
  SoftDropdownRow
} from '../design/SoftDropdown'
import { SuggestedNameField, TagKindDropdown } from '../design/TagControls'

/* ───────────────────────── constants / small helpers ───────────────────────── */

const SUGGESTION_CONCURRENCY = 3
const ACCEPT_ALL_MIN_CONFIDENCE = 0.7
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 420
const SIDEBAR_DEFAULT = 240
const NONE_GROUP = 'None'
const DRAG_TYPE = 'application/x-grabbit-capture-ids'

const CARD_MIN_WIDTH = 200
const CARD_SPACING = 12

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i > 0 ? p.slice(0, i) : p
}

function isRecording(entry: CaptureRecord): boolean {
  return entry.kind === 'recording'
}

function projectOf(entry: CaptureRecord): string | undefined {
  const tag = entry.projectTag?.trim()
  return tag ? tag : undefined
}

function nameOf(entry: CaptureRecord): string {
  return entry.displayName || 'Untitled'
}

function sameCI(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
}

/** Date.compactRelativeLabel */
function compactRelativeLabel(iso: string): string {
  const date = new Date(iso)
  const seconds = (Date.now() - date.getTime()) / 1000
  const abbreviated = (withYear: boolean) =>
    date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {})
    })
  if (!Number.isFinite(seconds)) return ''
  if (seconds < 0) return abbreviated(true)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  return abbreviated(date.getFullYear() !== new Date().getFullYear())
}

function patchOf(record: CaptureRecord): Partial<CaptureRecord> {
  return { path: record.path, displayName: record.displayName, projectTag: record.projectTag }
}

function patchOfResult(result: OrganizeApplyResult): Partial<CaptureRecord> {
  return { path: result.path, displayName: result.name, projectTag: result.projectTag }
}

function sanitizeProjectName(raw: string): string | null {
  const cleaned = raw.replace(/[\\/:]+/g, '-').replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.startsWith('.')) return null
  return cleaned
}

function useThrottledTick(ms: number): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), ms)
    return () => window.clearInterval(t)
  }, [ms])
  return tick
}

/* ───────────────────────── suggestion row state ───────────────────────── */

interface RowState {
  isLoading: boolean
  suggestion: OrganizeSuggestion | null
  /** AO finished with nothing usable — show empty caption once. */
  didCompleteWithoutSuggestion: boolean
  /** null = fall back to the suggestion's name. */
  selectedName: string | null
  /** null = fall back to suggestion; '' = explicitly cleared to None. */
  selectedProject: string | null
  acceptedSnapshot: (CaptureLocationSnapshot & { captureId: string }) | null
  acceptHandoffName: string | null
  acceptHandoffProject: string | null
  slidesNameOnAccept: boolean
  slidesProjectOnAccept: boolean
  isAccepting: boolean
}

function emptyRow(): RowState {
  return {
    isLoading: false,
    suggestion: null,
    didCompleteWithoutSuggestion: false,
    selectedName: null,
    selectedProject: null,
    acceptedSnapshot: null,
    acceptHandoffName: null,
    acceptHandoffProject: null,
    slidesNameOnAccept: false,
    slidesProjectOnAccept: false,
    isAccepting: false
  }
}

const hasProject = (s: OrganizeSuggestion | null | undefined): boolean =>
  Boolean(s?.suggestedProject && s.suggestedProject.trim())
const hasRename = (s: OrganizeSuggestion | null | undefined): boolean =>
  Boolean(s?.suggestedName && s.suggestedName.trim())

function effectiveName(row: RowState): string | null {
  if (row.selectedName !== null) {
    const t = row.selectedName.trim()
    return t ? t : null
  }
  const n = row.suggestion?.suggestedName?.trim()
  return n ? n : null
}

function effectiveProject(row: RowState): string | null {
  if (row.selectedProject !== null) {
    const t = row.selectedProject.trim()
    return t ? t : null
  }
  const p = row.suggestion?.suggestedProject?.trim()
  return p ? p : null
}

const showsNameEditor = (row: RowState): boolean =>
  row.suggestion !== null && effectiveName(row) !== null

const showsProjectPicker = (row: RowState): boolean => {
  if (!row.suggestion) return false
  if (row.selectedProject !== null) return true
  return hasProject(row.suggestion)
}

/* ───────────────────────── image loading ───────────────────────── */

const dataUrlCache = new Map<string, string>()
const DATA_URL_CACHE_MAX = 60

function useFileDataUrl(path: string | null, version: string, cache = true): string | null {
  const key = path ? `${path}|${version}` : null
  const [url, setUrl] = useState<string | null>(() => (key ? dataUrlCache.get(key) ?? null : null))

  useEffect(() => {
    if (!key || !path) {
      setUrl(null)
      return
    }
    const cached = cache ? dataUrlCache.get(key) : undefined
    if (cached) {
      setUrl(cached)
      return
    }
    setUrl(null)
    let cancelled = false
    void (async () => {
      try {
        const next = (await window.grabbit.readFileDataUrl(path)) as string | null
        if (!next) return
        if (cache) {
          dataUrlCache.set(key, next)
          if (dataUrlCache.size > DATA_URL_CACHE_MAX) {
            const oldest = dataUrlCache.keys().next().value
            if (oldest !== undefined) dataUrlCache.delete(oldest)
          }
        }
        if (!cancelled) setUrl(next)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [key, path, cache])

  return url
}

function useElementWidth<T extends HTMLElement>(): [number, (node: T | null) => void] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    setWidth(node.clientWidth)
    observer.current = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth(Math.round(w))
    })
    observer.current.observe(node)
  }, [])
  return [width, ref]
}

/* ───────────────────────── page ───────────────────────── */

interface ContextMenuState {
  x: number
  y: number
  id: string
}

export function LibraryPage() {
  const [entries, setEntries] = useState<CaptureRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  const [projects, setProjects] = useState<string[]>([])
  const [groupBy, setGroupByState] = useState<LibraryGroupBy>('none')
  const [mediaFilters, setMediaFiltersState] = useState<LibraryMediaKind[]>([])
  const [layout, setLayoutState] = useState<MultiSelectLayout>('cards')
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const [resizeHover, setResizeHover] = useState(false)

  const [selection, setSelectionState] = useState<Set<string>>(() => new Set())
  const selectionRef = useRef(selection)
  const anchorRef = useRef<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const [rows, setRows] = useState<Record<string, RowState>>({})
  const rowsRef = useRef(rows)
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const queueRef = useRef<string[]>([])
  const inFlightRef = useRef<Map<string, string>>(new Map())
  const acceptTokensRef = useRef<Map<string, string>>(new Map())

  const [renameTarget, setRenameTarget] = useState<{ id: string; site: 'sidebar' | 'preview' } | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [createProject, setCreateProject] = useState<{ id: string; draft: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const lastClickRef = useRef<{ id: string; at: number } | null>(null)
  const prevIdsRef = useRef<string[]>([])
  const prevSelectionRef = useRef<Set<string>>(new Set())
  const reloadSeq = useRef(0)
  const reloadTimer = useRef<number | null>(null)

  useThrottledTick(30_000)

  /* — selection helpers — */

  const commitSelection = useCallback((next: Set<string>, anchor?: string | null) => {
    selectionRef.current = next
    setSelectionState(next)
    if (anchor !== undefined) anchorRef.current = anchor
  }, [])

  /* — settings persistence — */

  const persist = useCallback((partial: Partial<AppSettings>) => {
    void window.grabbit.settingsSet(partial)
  }, [])

  useEffect(() => {
    void (async () => {
      const s = (await window.grabbit.settingsGet()) as AppSettings
      setGroupByState(s.libraryGroupBy === 'project' ? 'project' : 'none')
      setMediaFiltersState(Array.isArray(s.libraryMediaFilter) ? s.libraryMediaFilter : [])
      setLayoutState(s.libraryMultiSelectLayout === 'list' ? 'list' : 'cards')
      const w = Number(s.librarySidebarWidth)
      if (Number.isFinite(w) && w > 0) {
        setSidebarWidth(Math.min(Math.max(w, SIDEBAR_MIN), SIDEBAR_MAX))
      }
    })()
  }, [])

  const setGroupBy = (next: LibraryGroupBy) => {
    setGroupByState(next)
    setExpandedGroups(new Set())
    setRenameTarget(null)
    persist({ libraryGroupBy: next })
  }

  const toggleMediaFilter = (kind: LibraryMediaKind) => {
    const next = mediaFilters.includes(kind)
      ? mediaFilters.filter((k) => k !== kind)
      : [...mediaFilters, kind].sort()
    setMediaFiltersState(next)
    persist({ libraryMediaFilter: next })
  }

  const setLayout = (next: MultiSelectLayout) => {
    setLayoutState(next)
    persist({ libraryMultiSelectLayout: next })
  }

  /* — data — */

  const reload = useCallback(async () => {
    const seq = ++reloadSeq.current
    const [list, projectList] = await Promise.all([
      window.grabbit.historyList() as Promise<CaptureRecord[]>,
      window.grabbit.libraryListProjects() as Promise<string[]>
    ])
    if (seq !== reloadSeq.current) return
    setEntries((list || []).filter((c) => c.kind === 'screenshot' || c.kind === 'recording'))
    setProjects(Array.isArray(projectList) ? projectList : [])
    setLoaded(true)
  }, [])

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null
      void reload()
    }, 60)
  }, [reload])

  useEffect(() => {
    void reload()
    const onFocus = () => void reload()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  const filteredEntries = useMemo(() => {
    if (mediaFilters.length === 0) return entries
    return entries.filter((e) =>
      mediaFilters.some((k) => (k === 'image' ? !isRecording(e) : isRecording(e)))
    )
  }, [entries, mediaFilters])

  const projectOptions = useMemo(() => {
    const set = new Map<string, string>()
    for (const name of projects) set.set(name.toLowerCase(), name)
    for (const e of entries) {
      const p = projectOf(e)
      if (p && !set.has(p.toLowerCase())) set.set(p.toLowerCase(), p)
    }
    return Array.from(set.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [projects, entries])

  /** Group by Project — sections A→Z, None last (existing folders seed empty projects). */
  const projectGroups = useMemo(() => {
    const grouped = new Map<string, CaptureRecord[]>()
    for (const name of projects) grouped.set(name, [])
    for (const e of filteredEntries) {
      const name = projectOf(e) ?? NONE_GROUP
      const bucket = grouped.get(name)
      if (bucket) bucket.push(e)
      else grouped.set(name, [e])
    }
    return Array.from(grouped.keys())
      .sort((a, b) => {
        if (a === NONE_GROUP) return 1
        if (b === NONE_GROUP) return -1
        return a.localeCompare(b, undefined, { sensitivity: 'base' })
      })
      .map((name) => ({ name, entries: grouped.get(name) ?? [] }))
  }, [projects, filteredEntries])

  const visibleInGroup = useCallback(
    (group: { name: string; entries: CaptureRecord[] }) =>
      expandedGroups.has(group.name)
        ? group.entries
        : group.entries.filter((e) => selection.has(e.id)),
    [expandedGroups, selection]
  )

  const selectableIds = useMemo(
    () =>
      groupBy === 'project'
        ? projectGroups.flatMap((g) => visibleInGroup(g).map((e) => e.id))
        : filteredEntries.map((e) => e.id),
    [groupBy, projectGroups, visibleInGroup, filteredEntries]
  )

  /* — row-state helpers — */

  const updateRow = useCallback((id: string, fn: (draft: RowState) => void) => {
    const next = { ...rowsRef.current }
    const draft = { ...(next[id] ?? emptyRow()) }
    fn(draft)
    next[id] = draft
    rowsRef.current = next
    setRows(next)
  }, [])

  const removeRow = useCallback((id: string) => {
    if (!(id in rowsRef.current)) return
    const next = { ...rowsRef.current }
    delete next[id]
    rowsRef.current = next
    setRows(next)
  }, [])

  /** File ids are path hashes — follow a capture to its new id after rename / move. */
  const remapId = useCallback(
    (oldId: string, newId: string | undefined | null, patch?: Partial<CaptureRecord>) => {
      if (!newId) return
      if (newId !== oldId || patch) {
        const nextEntries = entriesRef.current.map((e) =>
          e.id === oldId ? { ...e, ...patch, id: newId } : e
        )
        entriesRef.current = nextEntries
        setEntries(nextEntries)
      }
      if (newId === oldId) return
      if (oldId in rowsRef.current) {
        const next = { ...rowsRef.current }
        next[newId] = next[oldId]
        delete next[oldId]
        rowsRef.current = next
        setRows(next)
      }
      if (selectionRef.current.has(oldId)) {
        const sel = new Set<string>()
        selectionRef.current.forEach((id) => sel.add(id === oldId ? newId : id))
        commitSelection(sel, anchorRef.current === oldId ? newId : undefined)
      }
      setRenameTarget((t) => (t && t.id === oldId ? { ...t, id: newId } : t))
    },
    [commitSelection]
  )

  /* — selection reconcile on list changes (Swift entries.map(\.id) onChange) — */

  useEffect(() => {
    if (!loaded) return
    const ids = entries.map((e) => e.id)
    const idSet = new Set(ids)
    const prevIds = prevIdsRef.current
    prevIdsRef.current = ids

    const sel = selectionRef.current
    const remaining = new Set<string>()
    sel.forEach((id) => {
      if (idSet.has(id)) remaining.add(id)
    })
    const filteredIds = new Set(filteredEntries.map((e) => e.id))

    let next: Set<string>
    let anchor: string | null | undefined
    if (remaining.size > 0) {
      next = remaining
      if (anchorRef.current && !remaining.has(anchorRef.current)) {
        anchor = remaining.values().next().value ?? null
      }
    } else {
      const oldAnchor = prevIds.find((id) => sel.has(id))
      const oldIndex = oldAnchor ? prevIds.indexOf(oldAnchor) : -1
      if (oldIndex >= 0) {
        const after = prevIds[oldIndex + 1]
        const before = prevIds[oldIndex - 1]
        const pick =
          after && idSet.has(after) ? after : before && idSet.has(before) ? before : ids[0]
        next = pick ? new Set([pick]) : new Set()
        anchor = pick ?? null
      } else if (sel.size === 0 && ids[0]) {
        const first = filteredEntries[0]?.id ?? ids[0]
        next = new Set([first])
        anchor = first
      } else {
        next = new Set()
        anchor = null
      }
    }

    // Prune to the media-filtered list; fall back to the first visible row.
    const pruned = new Set<string>()
    next.forEach((id) => {
      if (filteredIds.has(id)) pruned.add(id)
    })
    if (pruned.size === 0) {
      const first = filteredEntries[0]
      if (first) {
        commitSelection(new Set([first.id]), first.id)
      } else {
        commitSelection(new Set(), null)
      }
      return
    }
    const sameSelection = pruned.size === sel.size && Array.from(pruned).every((id) => sel.has(id))
    if (!sameSelection) {
      const keepAnchor = anchorRef.current !== null && pruned.has(anchorRef.current)
      commitSelection(
        pruned,
        anchor !== undefined ? anchor : keepAnchor ? undefined : (pruned.values().next().value ?? null)
      )
    } else if (anchor !== undefined) {
      anchorRef.current = anchor
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, filteredEntries, loaded])

  /* Temporary undo affordance after accept — dismiss when selection changes. */
  useEffect(() => {
    const deselected: string[] = []
    prevSelectionRef.current.forEach((id) => {
      if (!selection.has(id)) deselected.push(id)
    })
    prevSelectionRef.current = selection
    for (const id of deselected) {
      if (rowsRef.current[id]?.acceptedSnapshot) removeRow(id)
    }
  }, [selection, removeRow])

  const selectedEntries = useMemo(
    () => entries.filter((e) => selection.has(e.id)),
    [entries, selection]
  )
  const selectedEntry = selectedEntries[0] ?? null

  /* — sidebar click handling — */

  const beginRename = (entry: CaptureRecord, site: 'sidebar' | 'preview') => {
    commitSelection(new Set([entry.id]), entry.id)
    setRenameDraft(nameOf(entry))
    setRenameTarget({ id: entry.id, site })
  }

  const commitRename = async () => {
    const target = renameTarget
    setRenameTarget(null)
    if (!target) return
    const entry = entriesRef.current.find((e) => e.id === target.id)
    const trimmed = renameDraft.trim()
    if (!entry || !trimmed || trimmed === entry.displayName) return
    const res = (await window.grabbit.historyRename(entry.id, trimmed)) as CaptureRecord | null
    if (res) remapId(entry.id, res.id, patchOf(res))
    scheduleReload()
  }

  const selectRange = (endId: string) => {
    const ordered = selectableIds
    const endIndex = ordered.indexOf(endId)
    if (endIndex < 0) {
      commitSelection(new Set([endId]), endId)
      return
    }
    const sel = selectionRef.current
    let startId = anchorRef.current
    if (!startId) {
      const idxs = Array.from(sel).map((id) => ordered.indexOf(id)).filter((i) => i >= 0)
      startId = idxs.length ? ordered[Math.min(...idxs)] : endId
    }
    const startIndex = ordered.indexOf(startId)
    if (startIndex < 0) {
      commitSelection(new Set([endId]), endId)
      return
    }
    const lower = Math.min(startIndex, endIndex)
    const upper = Math.max(startIndex, endIndex)
    commitSelection(new Set(ordered.slice(lower, upper + 1)), anchorRef.current ? undefined : startId)
  }

  const handleRowClick = (e: ReactMouseEvent, entry: CaptureRecord) => {
    const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey
    const now = Date.now()
    const last = lastClickRef.current
    if (!hasModifier && last && last.id === entry.id && now - last.at <= 500) {
      lastClickRef.current = null
      beginRename(entry, 'sidebar')
      return
    }
    lastClickRef.current = { id: entry.id, at: now }

    if (e.shiftKey) {
      selectRange(entry.id)
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectionRef.current)
      if (next.has(entry.id)) next.delete(entry.id)
      else next.add(entry.id)
      commitSelection(next, entry.id)
    } else {
      commitSelection(new Set([entry.id]), entry.id)
    }
  }

  const toggleGroupExpanded = (name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  /* — moves — */

  const moveEntryToProject = useCallback(
    async (id: string, project: string) => {
      const res = (await window.grabbit.historyUpdate(id, { projectTag: project })) as CaptureRecord | null
      if (res) remapId(id, res.id, patchOf(res))
      scheduleReload()
    },
    [remapId, scheduleReload]
  )

  const moveCaptures = async (ids: string[], groupName: string) => {
    setDropTarget(null)
    for (const id of ids) {
      const entry = entriesRef.current.find((e) => e.id === id)
      if (!entry) continue
      const current = projectOf(entry)
      if (groupName === NONE_GROUP) {
        if (current) await moveEntryToProject(id, '')
      } else if (!current || !sameCI(current, groupName)) {
        await moveEntryToProject(id, groupName)
      }
    }
    setExpandedGroups((prev) => new Set(prev).add(groupName))
  }

  /* — Auto Organize — */

  const isSuggestionActive = (id: string) =>
    inFlightRef.current.has(id) || queueRef.current.includes(id)

  const pumpQueue = useCallback(() => {
    while (inFlightRef.current.size < SUGGESTION_CONCURRENCY && queueRef.current.length > 0) {
      const id = queueRef.current.shift() as string
      const entry = entriesRef.current.find((e) => e.id === id)
      if (!entry) {
        updateRow(id, (r) => {
          r.isLoading = false
        })
        continue
      }
      const token = `${id}:${Date.now()}:${Math.random()}`
      inFlightRef.current.set(id, token)
      void (async () => {
        let suggestion: OrganizeSuggestion | null = null
        try {
          suggestion = (await window.grabbit.organizeSuggest(id)) as OrganizeSuggestion
        } catch {
          suggestion = null
        }
        if (inFlightRef.current.get(id) !== token) return
        inFlightRef.current.delete(id)
        const usable =
          suggestion && (hasProject(suggestion) || hasRename(suggestion)) ? suggestion : null
        updateRow(id, (r) => {
          r.isLoading = false
          r.suggestion = usable
          r.didCompleteWithoutSuggestion = usable === null
          r.selectedName = usable?.suggestedName ?? null
          r.selectedProject = usable?.suggestedProject ?? null
        })
        pumpQueue()
      })()
    }
  }, [updateRow])

  const cancelSuggestions = useCallback(
    (ids: Iterable<string>) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return
      queueRef.current = queueRef.current.filter((id) => !idSet.has(id))
      idSet.forEach((id) => {
        inFlightRef.current.delete(id)
        updateRow(id, (r) => {
          r.isLoading = false
        })
      })
      pumpQueue()
    },
    [pumpQueue, updateRow]
  )

  const requestSuggestions = useCallback(
    (ids: Iterable<string>) => {
      const idSet = new Set(ids)
      const targets = entriesRef.current.filter((e) => idSet.has(e.id))
      if (targets.length === 0) return
      // Second click on a loading/queued target cancels only those ids.
      const active = targets.filter((e) => isSuggestionActive(e.id)).map((e) => e.id)
      if (active.length > 0) {
        cancelSuggestions(active)
        return
      }
      for (const entry of targets) {
        updateRow(entry.id, (r) => {
          r.isLoading = true
          r.suggestion = null
          r.didCompleteWithoutSuggestion = false
          r.selectedName = null
          r.selectedProject = null
          r.acceptedSnapshot = null
        })
        queueRef.current.push(entry.id)
      }
      pumpQueue()
    },
    [cancelSuggestions, pumpQueue, updateRow]
  )

  const setSuggestedName = (name: string, id: string) =>
    updateRow(id, (r) => {
      r.selectedName = name
    })
  const setSuggestedProject = (project: string, id: string) =>
    updateRow(id, (r) => {
      r.selectedProject = project
    })
  const clearSuggestedProject = (id: string) =>
    updateRow(id, (r) => {
      // Empty string = explicit None; keeps the picker visible.
      r.selectedProject = ''
    })

  const clearAcceptState = (r: RowState) => {
    r.suggestion = null
    r.didCompleteWithoutSuggestion = false
    r.selectedName = null
    r.selectedProject = null
    r.isLoading = false
    r.acceptHandoffName = null
    r.acceptHandoffProject = null
    r.slidesNameOnAccept = false
    r.slidesProjectOnAccept = false
    r.isAccepting = false
  }

  const dismissSuggestion = (id: string) => {
    acceptTokensRef.current.delete(id)
    updateRow(id, clearAcceptState)
  }

  const dismissAllSuggestions = (ids: Iterable<string>) => {
    for (const id of Array.from(ids)) {
      const r = rowsRef.current[id]
      if (!r) continue
      if (!(r.suggestion || r.didCompleteWithoutSuggestion || r.isAccepting)) continue
      acceptTokensRef.current.delete(id)
      updateRow(id, clearAcceptState)
    }
  }

  const acceptSuggestion = async (id: string, token: string) => {
    const entry = entriesRef.current.find((e) => e.id === id)
    const row = rowsRef.current[id]
    if (!entry || !row || !row.suggestion) return
    const snapshot: CaptureLocationSnapshot & { captureId: string } = {
      captureId: id,
      name: nameOf(entry),
      directoryPath: dirname(entry.path),
      projectTag: projectOf(entry)
    }
    const suggestion: OrganizeSuggestion = {
      ...row.suggestion,
      suggestedName: effectiveName(row),
      suggestedProject: effectiveProject(row)
    }
    const result = (await window.grabbit.organizeApply(suggestion)) as OrganizeApplyResult | null
    if (acceptTokensRef.current.get(id) !== token) return
    acceptTokensRef.current.delete(id)
    if (!result) {
      updateRow(id, (r) => {
        r.isAccepting = false
        r.acceptHandoffName = null
        r.acceptHandoffProject = null
        r.slidesNameOnAccept = false
        r.slidesProjectOnAccept = false
      })
      return
    }
    snapshot.captureId = result.captureId
    updateRow(id, (r) => {
      clearAcceptState(r)
      r.acceptedSnapshot = snapshot
    })
    remapId(id, result.captureId, patchOfResult(result))
    scheduleReload()
  }

  /** Slide-up changed fields, wait for the motion, then apply. */
  const acceptWithMotion = async (id: string) => {
    const entry = entriesRef.current.find((e) => e.id === id)
    const row = rowsRef.current[id]
    if (!entry || !row || !row.suggestion || row.isAccepting) return

    const nextName = showsNameEditor(row) ? effectiveName(row) : null
    const nextProject = showsProjectPicker(row) ? effectiveProject(row) ?? NONE_GROUP : null
    const currentProject = projectOf(entry) ?? NONE_GROUP
    const nameChanges = nextName !== null && !sameCI(nextName, nameOf(entry))
    const projectChanges = nextProject !== null && !sameCI(nextProject, currentProject)

    const token = `${id}:${Date.now()}`
    acceptTokensRef.current.set(id, token)
    updateRow(id, (r) => {
      r.isAccepting = true
      r.slidesNameOnAccept = nameChanges
      r.slidesProjectOnAccept = projectChanges
    })

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (acceptTokensRef.current.get(id) !== token) return

    if (nameChanges || projectChanges) {
      updateRow(id, (r) => {
        if (nameChanges) r.acceptHandoffName = nextName
        if (projectChanges) r.acceptHandoffProject = nextProject
      })
      await new Promise<void>((resolve) => window.setTimeout(resolve, SUGGESTION_ACCEPT_MS))
      if (acceptTokensRef.current.get(id) !== token) return
    }
    await acceptSuggestion(id, token)
  }

  const acceptAllSuggestions = (ids: Iterable<string>) => {
    for (const id of Array.from(ids)) {
      const s = rowsRef.current[id]?.suggestion
      if (!s || s.confidence < ACCEPT_ALL_MIN_CONFIDENCE) continue
      void acceptWithMotion(id)
    }
  }

  const revertSuggestion = async (id: string) => {
    const snapshot = rowsRef.current[id]?.acceptedSnapshot
    if (!snapshot) return
    const result = (await window.grabbit.organizeRevert({
      ...snapshot,
      captureId: id
    })) as OrganizeApplyResult | null
    if (result) remapId(id, result.captureId, patchOfResult(result))
    removeRow(result?.captureId ?? id)
    removeRow(id)
    scheduleReload()
  }

  /* — banner — */

  const loadingCount = useMemo(() => Object.values(rows).filter((r) => r.isLoading).length, [rows])
  const awaitingCount = useMemo(() => Object.values(rows).filter((r) => r.suggestion).length, [rows])
  const showsBanner = loadingCount > 0 || awaitingCount > 0

  const openActivityInBulk = () => {
    const active = new Set(
      Object.entries(rows)
        .filter(([, r]) => r.isLoading || r.suggestion)
        .map(([id]) => id)
    )
    if (active.size === 0) return
    const ordered = entries.map((e) => e.id).filter((id) => active.has(id))
    const sel = new Set(ordered.length ? ordered : Array.from(active))
    commitSelection(sel, ordered[0] ?? Array.from(sel)[0] ?? null)
    if (groupBy === 'project') {
      setExpandedGroups((prev) => {
        const next = new Set(prev)
        for (const g of projectGroups) {
          if (g.entries.some((e) => sel.has(e.id))) next.add(g.name)
        }
        return next
      })
    }
  }

  /* — create project — */

  const beginCreateProject = (id: string) => {
    const row = rowsRef.current[id]
    const entry = entriesRef.current.find((e) => e.id === id)
    const draft = (row && effectiveProject(row)) || (entry && projectOf(entry)) || ''
    setCreateProject({ id, draft })
  }

  const confirmCreateProject = () => {
    const target = createProject
    setCreateProject(null)
    if (!target) return
    const name = sanitizeProjectName(target.draft)
    if (!name) return
    if (rowsRef.current[target.id]?.suggestion) setSuggestedProject(name, target.id)
    else void moveEntryToProject(target.id, name)
  }

  /* — destructive / misc — */

  const showInFinder = (id: string) => void window.grabbit.historyReveal(id)

  const moveToTrash = async (id: string) => {
    if (selectionRef.current.has(id)) {
      const idx = entries.findIndex((e) => e.id === id)
      const neighbor = entries[idx + 1]?.id ?? entries[idx - 1]?.id ?? null
      commitSelection(neighbor ? new Set([neighbor]) : new Set(), neighbor)
    }
    if (renameTarget?.id === id) setRenameTarget(null)
    cancelSuggestions([id])
    removeRow(id)
    await window.grabbit.historyDelete(id)
    scheduleReload()
  }

  const openCapture = (entry: CaptureRecord) => commitSelection(new Set([entry.id]), entry.id)

  /* — sidebar resize — */

  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    let latest = startWidth
    setResizing(true)
    const move = (ev: PointerEvent) => {
      latest = Math.min(Math.max(startWidth + (ev.clientX - startX), SIDEBAR_MIN), SIDEBAR_MAX)
      setSidebarWidth(latest)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setResizing(false)
      persist({ librarySidebarWidth: Math.round(latest) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /* — context menu dismissal — */

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  /* ───────── render ───────── */

  const clampedSidebar = Math.min(Math.max(sidebarWidth, SIDEBAR_MIN), SIDEBAR_MAX)
  const hasEntries = entries.length > 0

  const renderRow = (entry: CaptureRecord, nested: boolean) => (
    <SidebarRow
      key={entry.id}
      entry={entry}
      row={rows[entry.id] ?? emptyRow()}
      selected={selection.has(entry.id)}
      nested={nested}
      isRenaming={renameTarget?.id === entry.id && renameTarget.site === 'sidebar'}
      renameDraft={renameDraft}
      onRenameDraft={setRenameDraft}
      onCommitRename={() => void commitRename()}
      onCancelRename={() => setRenameTarget(null)}
      onClick={(e) => handleRowClick(e, entry)}
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, id: entry.id })
      }}
      onRevert={() => void revertSuggestion(entry.id)}
      draggable={groupBy === 'project'}
      onDragStart={(e) => {
        const ids = selection.has(entry.id) ? Array.from(selection) : [entry.id]
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids))
        e.dataTransfer.effectAllowed = 'move'
      }}
    />
  )

  const contextEntry = contextMenu ? entries.find((e) => e.id === contextMenu.id) : null

  return (
    <div className="app-surface library-shell">
      <div className="library-drag titlebar-drag" />

      <aside className="library-sidebar" style={{ width: clampedSidebar }}>
        {hasEntries ? (
          <>
            <div className="library-sidebar__chrome">
              <div className="titlebar-no-drag">
                <SoftDropdown
                  label="Group by"
                  value={groupBy === 'project' ? 'Project' : 'None'}
                  align="leading"
                  title="Group captures in the sidebar"
                >
                  {({ close }) => (
                    <>
                      <SoftDropdownRow
                        title="None"
                        icon={<ListGlyph />}
                        isSelected={groupBy === 'none'}
                        onSelect={() => setGroupBy('none')}
                        onRequestClose={close}
                      />
                      <SoftDropdownRow
                        title="Project"
                        icon={<FolderGlyph />}
                        isSelected={groupBy === 'project'}
                        onSelect={() => setGroupBy('project')}
                        onRequestClose={close}
                      />
                    </>
                  )}
                </SoftDropdown>
              </div>
              <span style={{ flex: 1 }} />
              <div className="titlebar-no-drag">
                <SoftDropdown
                  iconOnly
                  active={mediaFilters.length > 0}
                  value={<FilterGlyph />}
                  title="Filter by media type"
                  align="trailing"
                >
                  {({ close }) => (
                    <>
                      <SoftDropdownRow
                        title="Image"
                        icon={<PhotoGlyph />}
                        isSelected={mediaFilters.includes('image')}
                        dismissesMenu={false}
                        onSelect={() => toggleMediaFilter('image')}
                        onRequestClose={close}
                      />
                      <SoftDropdownRow
                        title="Video"
                        icon={<VideoGlyph />}
                        isSelected={mediaFilters.includes('video')}
                        dismissesMenu={false}
                        onSelect={() => toggleMediaFilter('video')}
                        onRequestClose={close}
                      />
                    </>
                  )}
                </SoftDropdown>
              </div>
            </div>

            <div className="library-sidebar__list">
              {groupBy === 'project'
                ? projectGroups.map((group) => {
                    const isExpanded = expandedGroups.has(group.name)
                    return (
                      <div
                        key={group.name}
                        className="library-group"
                        onDragOver={(e) => {
                          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                            e.preventDefault()
                            setDropTarget(group.name)
                          }
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            setDropTarget((t) => (t === group.name ? null : t))
                          }
                        }}
                        onDrop={(e) => {
                          const raw = e.dataTransfer.getData(DRAG_TYPE)
                          if (!raw) return
                          e.preventDefault()
                          try {
                            void moveCaptures(JSON.parse(raw) as string[], group.name)
                          } catch {
                            setDropTarget(null)
                          }
                        }}
                      >
                        <button
                          type="button"
                          className={`library-group__header ${dropTarget === group.name ? 'is-drop-target' : ''}`}
                          onClick={() => toggleGroupExpanded(group.name)}
                          aria-expanded={isExpanded}
                        >
                          <span className="library-group__disclosure">
                            {isExpanded ? <ChevronDownGlyph /> : <ChevronRightGlyph />}
                          </span>
                          <span className="library-group__name">{group.name}</span>
                        </button>
                        {visibleInGroup(group).map((entry) => renderRow(entry, true))}
                      </div>
                    )
                  })
                : filteredEntries.map((entry) => renderRow(entry, false))}
            </div>

            {showsBanner ? (
              <button
                type="button"
                className="library-banner"
                onClick={openActivityInBulk}
                title="Review auto-organize activity in bulk"
              >
                <span className="library-banner__text">
                  {loadingCount > 0 ? (
                    <span className="library-banner__line is-primary">
                      {loadingCount === 1 ? '1 in progress' : `${loadingCount} in progress`}
                    </span>
                  ) : null}
                  {awaitingCount > 0 ? (
                    <span
                      className={`library-banner__line ${loadingCount > 0 ? 'is-secondary' : 'is-primary'}`}
                    >
                      {awaitingCount === 1
                        ? '1 waiting for confirmation'
                        : `${awaitingCount} waiting for confirmation`}
                    </span>
                  ) : null}
                </span>
                {awaitingCount > 0 ? <span className="library-dot" aria-hidden /> : null}
              </button>
            ) : null}
          </>
        ) : null}
      </aside>

      <div
        className={`library-resize ${resizing || resizeHover ? 'is-active' : ''}`}
        onPointerDown={onResizeDown}
        onPointerEnter={() => setResizeHover(true)}
        onPointerLeave={() => setResizeHover(false)}
        title="Drag to resize"
      >
        <div className="library-resize__rule" />
      </div>

      <main className="library-detail">
        {selectedEntries.length >= 2 ? (
          <MultiSelectPane
            entries={selectedEntries}
            rows={rows}
            layout={layout}
            projectOptions={projectOptions}
            onLayout={setLayout}
            onAutoOrganize={() => requestSuggestions(selection)}
            onAcceptAll={() => acceptAllSuggestions(selection)}
            onDismissAll={() => dismissAllSuggestions(selection)}
            onAccept={(e) => void acceptWithMotion(e.id)}
            onDismiss={(e) => dismissSuggestion(e.id)}
            onRevert={(e) => void revertSuggestion(e.id)}
            onSelectName={setSuggestedName}
            onSelectProject={setSuggestedProject}
            onClearProject={clearSuggestedProject}
            onCreateProject={beginCreateProject}
            onMoveToProject={(id, name) => void moveEntryToProject(id, name)}
            onOpen={openCapture}
          />
        ) : selectedEntry ? (
          <PreviewPane
            key={selectedEntry.id}
            entry={selectedEntry}
            row={rows[selectedEntry.id] ?? emptyRow()}
            projectOptions={projectOptions}
            isRenaming={renameTarget?.id === selectedEntry.id && renameTarget.site === 'preview'}
            renameDraft={renameDraft}
            onRenameDraft={setRenameDraft}
            onBeginRename={() => beginRename(selectedEntry, 'preview')}
            onCommitRename={() => void commitRename()}
            onCancelRename={() => setRenameTarget(null)}
            onAutoOrganize={() => requestSuggestions([selectedEntry.id])}
            onAccept={() => void acceptWithMotion(selectedEntry.id)}
            onDismiss={() => dismissSuggestion(selectedEntry.id)}
            onSelectName={(n) => setSuggestedName(n, selectedEntry.id)}
            onSelectProject={(p) => setSuggestedProject(p, selectedEntry.id)}
            onClearProject={() => clearSuggestedProject(selectedEntry.id)}
            onCreateProject={() => beginCreateProject(selectedEntry.id)}
            onMoveToProject={(name) => void moveEntryToProject(selectedEntry.id, name)}
          />
        ) : (
          <div className="library-empty">
            <RabbitIcon width={56} />
            <h2>Select a Capture</h2>
            <p>Choose a screenshot or recording from the sidebar.</p>
          </div>
        )}
      </main>

      {contextMenu && contextEntry ? (
        <SoftDropdownPanel
          style={{
            position: 'fixed',
            top: Math.min(contextMenu.y, window.innerHeight - 190),
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            zIndex: 90
          }}
        >
          <div onMouseDown={(e) => e.stopPropagation()}>
            <SoftDropdownRow
              title="Auto-Rename"
              onSelect={() => requestSuggestions([contextEntry.id])}
              onRequestClose={() => setContextMenu(null)}
            />
            <SoftDropdownRow
              title="Show in Finder"
              onSelect={() => showInFinder(contextEntry.id)}
              onRequestClose={() => setContextMenu(null)}
            />
            <SoftDropdownRow
              title="Rename"
              onSelect={() => beginRename(contextEntry, 'sidebar')}
              onRequestClose={() => setContextMenu(null)}
            />
            <SoftDropdownRow
              title="Move to Trash"
              onSelect={() => void moveToTrash(contextEntry.id)}
              onRequestClose={() => setContextMenu(null)}
            />
          </div>
        </SoftDropdownPanel>
      ) : null}

      {createProject ? (
        <div className="modal-backdrop" onMouseDown={() => setCreateProject(null)}>
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3>New Project</h3>
            <input
              className="field"
              autoFocus
              placeholder="Project name"
              value={createProject.draft}
              onChange={(e) => setCreateProject({ ...createProject, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmCreateProject()
                if (e.key === 'Escape') setCreateProject(null)
              }}
            />
            <div className="modal-actions" style={{ marginTop: 'var(--space-md)' }}>
              <button type="button" className="btn" onClick={() => setCreateProject(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={confirmCreateProject}>
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ───────────────────────── sidebar row ───────────────────────── */

function SidebarRow({
  entry,
  row,
  selected,
  nested,
  isRenaming,
  renameDraft,
  onRenameDraft,
  onCommitRename,
  onCancelRename,
  onClick,
  onContextMenu,
  onRevert,
  draggable,
  onDragStart
}: {
  entry: CaptureRecord
  row: RowState
  selected: boolean
  nested: boolean
  isRenaming: boolean
  renameDraft: string
  onRenameDraft: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onClick: (e: ReactMouseEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
  onRevert: () => void
  draggable: boolean
  onDragStart: (e: ReactDragEvent) => void
}) {
  const skipCommit = useRef(false)

  let trailing: ReactNode
  if (row.isLoading) {
    trailing = (
      <span className="library-item__slot" title="Auto-organizing…">
        <RabbitHopLoader size="compact" isAnimating />
      </span>
    )
  } else if (row.suggestion) {
    trailing = (
      <span
        className="library-item__slot"
        title="Suggestion ready — accept or dismiss in the preview"
        aria-label="Suggestion awaiting confirmation"
      >
        <span className="library-dot" />
      </span>
    )
  } else if (row.acceptedSnapshot) {
    trailing = (
      <span className="library-item__undo">
        <span title="Just organized — click undo to revert, or select another capture to dismiss">
          Undo?
        </span>
        <button
          type="button"
          title="Undo rename and move"
          onClick={(e) => {
            e.stopPropagation()
            onRevert()
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <UndoGlyph size={10} />
        </button>
      </span>
    )
  } else if (row.didCompleteWithoutSuggestion) {
    trailing = (
      <span
        className="library-item__meta"
        title="Auto Organize couldn’t find a name or project for this capture"
      >
        No suggestions
      </span>
    )
  } else {
    trailing = <span className="library-item__meta">{compactRelativeLabel(entry.createdAt)}</span>
  }

  return (
    <div
      className={[
        'library-item',
        selected ? 'is-selected' : '',
        nested ? 'is-nested' : '',
        isRenaming ? 'is-renaming' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={isRenaming ? undefined : onClick}
      onContextMenu={onContextMenu}
      draggable={draggable && !isRenaming}
      onDragStart={onDragStart}
    >
      <div className="library-item__name" aria-label={row.isLoading ? `${nameOf(entry)}, auto-organizing` : nameOf(entry)}>
        {isRenaming ? (
          <input
            className="library-item__input"
            autoFocus
            value={renameDraft}
            spellCheck={false}
            onFocus={(e) => e.target.select()}
            onChange={(e) => onRenameDraft(e.target.value)}
            onBlur={() => {
              if (skipCommit.current) {
                skipCommit.current = false
                return
              }
              onCommitRename()
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                skipCommit.current = true
                onCancelRename()
              }
            }}
          />
        ) : row.isLoading ? (
          <ShimmerText
            active
            baseColor="var(--sidebar-text-muted)"
            highlightColor="var(--sidebar-text)"
          >
            {nameOf(entry)}
          </ShimmerText>
        ) : (
          nameOf(entry)
        )}
      </div>
      {trailing}
    </div>
  )
}

/* ───────────────────────── single-capture preview ───────────────────────── */

function PreviewPane({
  entry,
  row,
  projectOptions,
  isRenaming,
  renameDraft,
  onRenameDraft,
  onBeginRename,
  onCommitRename,
  onCancelRename,
  onAutoOrganize,
  onAccept,
  onDismiss,
  onSelectName,
  onSelectProject,
  onClearProject,
  onCreateProject,
  onMoveToProject
}: {
  entry: CaptureRecord
  row: RowState
  projectOptions: string[]
  isRenaming: boolean
  renameDraft: string
  onRenameDraft: (v: string) => void
  onBeginRename: () => void
  onCommitRename: () => void
  onCancelRename: () => void
  onAutoOrganize: () => void
  onAccept: () => void
  onDismiss: () => void
  onSelectName: (name: string) => void
  onSelectProject: (project: string) => void
  onClearProject: () => void
  onCreateProject: () => void
  onMoveToProject: (name: string) => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const skipCommit = useRef(false)
  const hasUsable = hasProject(row.suggestion) || hasRename(row.suggestion)
  const showsSuggestionRow = hasUsable && !row.isAccepting
  const suggestionBlocksAO = row.suggestion !== null || row.isAccepting
  const existingReadOnly = row.suggestion !== null || row.isAccepting || rejecting
  const canEditName = !existingReadOnly && !row.isLoading

  useEffect(() => {
    if (!row.suggestion) setRejecting(false)
  }, [row.suggestion])

  const committedProject = projectOf(entry)
  const displayedName = row.acceptHandoffName ?? nameOf(entry)
  const displayedProject = row.acceptHandoffProject ?? committedProject ?? NONE_GROUP
  const slidesName = row.isAccepting && row.slidesNameOnAccept
  const slidesProject = row.isAccepting && row.slidesProjectOnAccept

  const reject = () => {
    if (rejecting) return
    setRejecting(true)
    window.setTimeout(() => {
      onDismiss()
      setRejecting(false)
    }, SUGGESTION_ACCEPT_MS)
  }

  const isVideo = isRecording(entry)
  const mediaUrl = useFileDataUrl(entry.path, entry.createdAt, !isVideo)
  const posterUrl = useFileDataUrl(
    isVideo ? entry.thumbnailPath ?? null : null,
    entry.createdAt
  )

  const nameCell = (
    <div
      className={[
        'library-name-cell',
        'titlebar-no-drag',
        isRenaming ? 'is-renaming' : '',
        canEditName && !isRenaming ? 'is-editable' : '',
        existingReadOnly || row.isLoading ? 'is-secondary' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      title={canEditName && !isRenaming ? 'Rename' : undefined}
      onClick={() => {
        if (canEditName && !isRenaming) onBeginRename()
      }}
    >
      {isRenaming ? (
        <input
          className="library-name-cell__input"
          autoFocus
          value={renameDraft}
          spellCheck={false}
          onFocus={(e) => e.target.select()}
          onChange={(e) => onRenameDraft(e.target.value)}
          onBlur={() => {
            if (skipCommit.current) {
              skipCommit.current = false
              return
            }
            onCommitRename()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              skipCommit.current = true
              onCancelRename()
            }
          }}
        />
      ) : row.isLoading ? (
        <ShimmerText active>{displayedName}</ShimmerText>
      ) : slidesName ? (
        <SlideUpReplace value={displayedName} className="library-name-cell__slide">
          <span>{displayedName}</span>
        </SlideUpReplace>
      ) : (
        <span className="library-name-cell__text">{displayedName}</span>
      )}
    </div>
  )

  return (
    <div className="library-preview">
      <div className="library-preview__header">
        <div className="library-preview__row">
          <div className="titlebar-no-drag">
            <TagKindDropdown
              selected={displayedProject}
              options={projectOptions}
              isReadOnly={existingReadOnly}
              isLoading={row.isLoading}
              slidesSelectionChanges={slidesProject}
              onRemove={
                existingReadOnly || row.isLoading || !committedProject
                  ? undefined
                  : () => onMoveToProject('')
              }
              onSelect={(name) => {
                if (existingReadOnly || row.isLoading) return
                if (committedProject && sameCI(name, committedProject)) return
                onMoveToProject(name)
              }}
              onCreateNew={onCreateProject}
            />
          </div>
          <span className="library-slash">/</span>
          {nameCell}
          <span
            className="titlebar-no-drag"
            style={suggestionBlocksAO && !row.isLoading ? { pointerEvents: 'none' } : undefined}
          >
            <AutoOrganizeButton isLoading={row.isLoading} onClick={onAutoOrganize} />
          </span>
        </div>

        {showsSuggestionRow && row.suggestion ? (
          <div className={`library-suggest-row ${rejecting ? 'is-rejecting' : ''}`}>
            {showsProjectPicker(row) ? (
              <div className="titlebar-no-drag">
                <TagKindDropdown
                  selected={effectiveProject(row) ?? NONE_GROUP}
                  options={projectOptions}
                  onRemove={effectiveProject(row) === null ? undefined : onClearProject}
                  onSelect={onSelectProject}
                  onCreateNew={onCreateProject}
                />
              </div>
            ) : null}
            {showsNameEditor(row) && effectiveName(row) ? (
              <>
                <span className="library-slash">/</span>
                <SuggestedNameField name={effectiveName(row) as string} onCommit={onSelectName} />
              </>
            ) : !showsProjectPicker(row) ? (
              <span className="library-suggest-row__empty">No rename suggested</span>
            ) : null}
            <span style={{ flex: 1, minWidth: 12 }} />
            <span className="library-suggest-row__label">Suggesting</span>
            <div className="library-suggest-row__buttons titlebar-no-drag">
              <button
                type="button"
                className="btn library-icon-btn"
                disabled={rejecting}
                title="Accept rename and project"
                onClick={onAccept}
              >
                <CheckGlyph />
              </button>
              <button
                type="button"
                className="btn library-icon-btn"
                disabled={rejecting}
                title="Dismiss suggestion"
                onClick={reject}
              >
                <XGlyph />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {row.didCompleteWithoutSuggestion && !row.isLoading && !row.suggestion ? (
        <p className="library-suggest-empty">
          No suggestions — set Project manually, or try Auto Organize again.
        </p>
      ) : null}

      <div className="library-preview__body">
        {isVideo ? (
          mediaUrl ? (
            <video key={entry.path} src={mediaUrl} poster={posterUrl ?? undefined} controls />
          ) : posterUrl ? (
            <img src={posterUrl} alt="" className="is-loading" />
          ) : (
            <span className="library-preview__loading">Loading…</span>
          )
        ) : mediaUrl ? (
          <img
            src={mediaUrl}
            alt={nameOf(entry)}
            title="Double-click to annotate"
            onDoubleClick={() => void window.grabbit.annotateOpen(entry.id)}
          />
        ) : (
          <span className="library-preview__loading">Loading…</span>
        )}
      </div>
    </div>
  )
}

/* ───────────────────────── multi-select (bulk) pane ───────────────────────── */

interface MultiSelectProps {
  entries: CaptureRecord[]
  rows: Record<string, RowState>
  layout: MultiSelectLayout
  projectOptions: string[]
  onLayout: (l: MultiSelectLayout) => void
  onAutoOrganize: () => void
  onAcceptAll: () => void
  onDismissAll: () => void
  onAccept: (e: CaptureRecord) => void
  onDismiss: (e: CaptureRecord) => void
  onRevert: (e: CaptureRecord) => void
  onSelectName: (name: string, id: string) => void
  onSelectProject: (project: string, id: string) => void
  onClearProject: (id: string) => void
  onCreateProject: (id: string) => void
  onMoveToProject: (id: string, name: string) => void
  onOpen: (e: CaptureRecord) => void
}

function MultiSelectPane(props: MultiSelectProps) {
  const { entries, rows, layout, onLayout } = props
  const rowOf = (e: CaptureRecord) => rows[e.id] ?? emptyRow()

  const isAnyLoading = entries.some((e) => rowOf(e).isLoading)
  const pendingCount = entries.filter((e) => rowOf(e).suggestion).length
  const acceptAllCount = entries.filter((e) => {
    const s = rowOf(e).suggestion
    return s !== null && s.confidence >= ACCEPT_ALL_MIN_CONFIDENCE
  }).length

  const imageCount = entries.filter((e) => !isRecording(e)).length
  const videoCount = entries.filter(isRecording).length
  const countParts: string[] = []
  if (imageCount > 0) countParts.push(imageCount === 1 ? '1 image' : `${imageCount} images`)
  if (videoCount > 0) countParts.push(videoCount === 1 ? '1 video' : `${videoCount} videos`)
  const countLabel = countParts.length ? countParts.join(', ') : '0 images'

  const triageKey = (e: CaptureRecord): string => {
    const r = rowOf(e)
    const suggested = effectiveProject(r)
    if (suggested) return suggested
    return projectOf(e) ?? ''
  }

  const grouped = useMemo(() => {
    const buckets = new Map<string, CaptureRecord[]>()
    for (const e of entries) {
      const key = triageKey(e)
      const bucket = buckets.get(key)
      if (bucket) bucket.push(e)
      else buckets.set(key, [e])
    }
    return Array.from(buckets.entries()).map(([key, list]) => ({
      id: key || '__none__',
      title: key || 'No project',
      entries: list
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, rows])

  const bottomPad = pendingCount > 0 ? 56 : 0

  return (
    <div className="library-bulk">
      <div className="library-bulk__header">
        <span className="titlebar-no-drag">
          <AutoOrganizeButton
            isLoading={isAnyLoading}
            disabled={entries.length === 0}
            onClick={props.onAutoOrganize}
          />
        </span>
        <span className="library-bulk__count">{countLabel}</span>
        <span style={{ flex: 1 }} />
        <div className="library-bulk__seg titlebar-no-drag" role="group" aria-label="Bulk selection layout">
          <button
            type="button"
            className={layout === 'cards' ? 'is-on' : ''}
            title="Card view"
            onClick={() => onLayout('cards')}
          >
            <GridGlyph />
          </button>
          <button
            type="button"
            className={layout === 'list' ? 'is-on' : ''}
            title="List view"
            onClick={() => onLayout('list')}
          >
            <ListGlyph />
          </button>
        </div>
      </div>

      <div className="library-bulk__scroll">
        {layout === 'cards' ? (
          <CardGrid {...props} bottomPad={bottomPad} />
        ) : (
          <div className="library-bulk__list" style={{ paddingBottom: bottomPad }}>
            {grouped.map((group) => (
              <div key={group.id}>
                {grouped.length > 1 ? (
                  <div className="library-bulk__group-title">{group.title}</div>
                ) : null}
                {group.entries.map((entry) => (
                  <BulkListRow key={entry.id} entry={entry} row={rowOf(entry)} {...props} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {pendingCount > 0 ? (
        <div className="library-bulk__bar">
          <button
            type="button"
            className="btn"
            disabled={isAnyLoading || acceptAllCount === 0}
            onClick={props.onAcceptAll}
            title={
              acceptAllCount < pendingCount
                ? `Accepts suggestions with confidence ≥ 0.7 (${pendingCount - acceptAllCount} lower-confidence left for manual review)`
                : 'Accept suggestions with confidence ≥ 0.7'
            }
          >
            {acceptAllCount > 0 ? `Accept All (${acceptAllCount})` : 'Accept All'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={isAnyLoading}
            onClick={props.onDismissAll}
            title="Dismiss all pending suggestions"
          >
            Dismiss All
          </button>
        </div>
      ) : null}
    </div>
  )
}

function BulkThumb({ entry, className }: { entry: CaptureRecord; className: string }) {
  const isVideo = isRecording(entry)
  const url = useFileDataUrl(
    isVideo ? entry.thumbnailPath ?? null : entry.path,
    entry.createdAt
  )
  return (
    <div className={className}>
      {url ? (
        <img src={url} alt="" draggable={false} />
      ) : (
        <span className="library-bulk-thumb__placeholder">
          {isVideo ? <VideoGlyph size={18} /> : <PhotoGlyph size={18} />}
        </span>
      )}
    </div>
  )
}

function Slash() {
  return (
    <span className="library-slash" aria-hidden>
      /
    </span>
  )
}

function SuggestionActions({
  entry,
  row,
  onAccept,
  onDismiss,
  onRevert
}: {
  entry: CaptureRecord
  row: RowState
  onAccept: (e: CaptureRecord) => void
  onDismiss: (e: CaptureRecord) => void
  onRevert: (e: CaptureRecord) => void
}) {
  if (row.isAccepting) return null
  if (row.suggestion) {
    return (
      <div className="library-bulk-actions">
        <button
          type="button"
          className="btn library-icon-btn"
          title="Accept rename and project"
          onClick={() => onAccept(entry)}
        >
          <CheckGlyph />
        </button>
        <button
          type="button"
          className="btn library-icon-btn"
          title="Dismiss suggestion"
          onClick={() => onDismiss(entry)}
        >
          <XGlyph />
        </button>
      </div>
    )
  }
  if (row.acceptedSnapshot) {
    return (
      <div className="library-bulk-actions">
        <button
          type="button"
          className="btn library-icon-btn"
          title="Revert rename and move"
          onClick={() => onRevert(entry)}
        >
          <UndoGlyph />
        </button>
      </div>
    )
  }
  return null
}

/** Committed-project dropdown (no active suggestion). */
function CommittedProject({
  entry,
  row,
  isReadOnly,
  fillsAvailableWidth,
  projectOptions,
  onMoveToProject,
  onCreateProject
}: {
  entry: CaptureRecord
  row: RowState
  isReadOnly: boolean
  fillsAvailableWidth?: boolean
  projectOptions: string[]
  onMoveToProject: (id: string, name: string) => void
  onCreateProject: (id: string) => void
}) {
  const project = projectOf(entry)
  return (
    <TagKindDropdown
      selected={project ?? NONE_GROUP}
      options={projectOptions}
      isReadOnly={isReadOnly}
      isLoading={row.isLoading}
      fillsAvailableWidth={fillsAvailableWidth}
      onRemove={isReadOnly || row.isLoading || !project ? undefined : () => onMoveToProject(entry.id, '')}
      onSelect={(name) => {
        if (isReadOnly || row.isLoading) return
        if (project && sameCI(name, project)) return
        onMoveToProject(entry.id, name)
      }}
      onCreateNew={() => onCreateProject(entry.id)}
    />
  )
}

function CardGrid(props: MultiSelectProps & { bottomPad: number }) {
  const { entries, rows, bottomPad } = props
  const [width, ref] = useElementWidth<HTMLDivElement>()
  const contentWidth = Math.max(0, width - 24)
  const columns = Math.min(
    3,
    Math.max(1, Math.floor((contentWidth + CARD_SPACING) / (CARD_MIN_WIDTH + CARD_SPACING)))
  )
  return (
    <div ref={ref} className="library-bulk__cards-host">
      <div
        className="library-bulk__cards"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          paddingBottom: bottomPad + 8
        }}
      >
        {entries.map((entry) => (
          <BulkCard key={entry.id} entry={entry} row={rows[entry.id] ?? emptyRow()} {...props} />
        ))}
      </div>
    </div>
  )
}

function BulkCard({
  entry,
  row,
  projectOptions,
  onAccept,
  onDismiss,
  onRevert,
  onSelectName,
  onSelectProject,
  onClearProject,
  onCreateProject,
  onMoveToProject,
  onOpen
}: MultiSelectProps & { entry: CaptureRecord; row: RowState }) {
  const handoff = row.isAccepting
  const hasSuggestion = row.suggestion !== null && !handoff
  const committedProject = projectOf(entry)
  const pathText = `${committedProject ?? NONE_GROUP} / ${nameOf(entry)}`
  const displayName = row.acceptHandoffName ?? nameOf(entry)
  const displayProject = row.acceptHandoffProject ?? committedProject ?? NONE_GROUP

  return (
    <div className="library-bulk-card">
      <div
        className="library-bulk-card__thumb"
        role="button"
        title="Open capture"
        aria-label={`Open ${nameOf(entry)}`}
        onClick={() => onOpen(entry)}
      >
        <BulkThumb entry={entry} className="library-bulk-thumb is-fill" />
      </div>

      <div className="library-bulk-card__body">
        {row.isLoading ? (
          <ShimmerText active className="library-bulk-card__path">
            {pathText}
          </ShimmerText>
        ) : (
          <div
            className={`library-bulk-card__path ${hasSuggestion || handoff ? 'is-tertiary' : ''}`}
          >
            {pathText}
          </div>
        )}

        {hasSuggestion && row.suggestion ? (
          <>
            <div className="library-bulk-card__stack">
              <div className="library-bulk-card__line">
                {showsProjectPicker(row) ? (
                  <TagKindDropdown
                    selected={effectiveProject(row) ?? NONE_GROUP}
                    options={projectOptions}
                    onRemove={effectiveProject(row) === null ? undefined : () => onClearProject(entry.id)}
                    onSelect={(p) => onSelectProject(p, entry.id)}
                    onCreateNew={() => onCreateProject(entry.id)}
                  />
                ) : (
                  <CommittedProject
                    entry={entry}
                    row={row}
                    isReadOnly
                    projectOptions={projectOptions}
                    onMoveToProject={onMoveToProject}
                    onCreateProject={onCreateProject}
                  />
                )}
                <Slash />
              </div>
              {showsNameEditor(row) && effectiveName(row) ? (
                <SuggestedNameField
                  name={effectiveName(row) as string}
                  onCommit={(n) => onSelectName(n, entry.id)}
                  fillsAvailableWidth
                />
              ) : (
                <div className="library-bulk-card__name">{nameOf(entry)}</div>
              )}
            </div>
            <div className="library-bulk-card__status">
              <span>Confirm Suggestion</span>
              <span style={{ flex: 1 }} />
              <SuggestionActions
                entry={entry}
                row={row}
                onAccept={onAccept}
                onDismiss={onDismiss}
                onRevert={onRevert}
              />
            </div>
          </>
        ) : handoff ? (
          <div className="library-bulk-card__stack">
            <div className="library-bulk-card__line">
              <TagKindDropdown
                selected={displayProject}
                options={projectOptions}
                isReadOnly
                slidesSelectionChanges={row.slidesProjectOnAccept}
                onSelect={() => undefined}
                onCreateNew={() => undefined}
              />
              <Slash />
            </div>
            {row.slidesNameOnAccept ? (
              <SlideUpReplace value={displayName} className="library-bulk-card__slide">
                <div className="library-bulk-card__name">{displayName}</div>
              </SlideUpReplace>
            ) : (
              <div className="library-bulk-card__name">{displayName}</div>
            )}
          </div>
        ) : row.acceptedSnapshot ? (
          <div className="library-bulk-card__status">
            <span style={{ flex: 1 }} />
            <SuggestionActions
              entry={entry}
              row={row}
              onAccept={onAccept}
              onDismiss={onDismiss}
              onRevert={onRevert}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function BulkListRow({
  entry,
  row,
  projectOptions,
  onAccept,
  onDismiss,
  onRevert,
  onSelectName,
  onSelectProject,
  onClearProject,
  onCreateProject,
  onMoveToProject,
  onOpen
}: MultiSelectProps & { entry: CaptureRecord; row: RowState }) {
  const handoff = row.isAccepting
  const hasSuggestion = row.suggestion !== null && !handoff
  const committedProject = projectOf(entry)
  const displayName = row.acceptHandoffName ?? nameOf(entry)
  const displayProject = row.acceptHandoffProject ?? committedProject ?? NONE_GROUP

  let content: ReactNode
  if (handoff) {
    content = (
      <div className="library-bulk-row__path">
        <TagKindDropdown
          selected={displayProject}
          options={projectOptions}
          isReadOnly
          slidesSelectionChanges={row.slidesProjectOnAccept}
          onSelect={() => undefined}
          onCreateNew={() => undefined}
        />
        <Slash />
        {row.slidesNameOnAccept ? (
          <SlideUpReplace value={displayName}>
            <span className="library-bulk-row__name">{displayName}</span>
          </SlideUpReplace>
        ) : (
          <span className="library-bulk-row__name">{displayName}</span>
        )}
      </div>
    )
  } else if (hasSuggestion) {
    content = (
      <div className="library-bulk-row__path">
        {showsProjectPicker(row) ? (
          <TagKindDropdown
            selected={effectiveProject(row) ?? NONE_GROUP}
            options={projectOptions}
            onRemove={effectiveProject(row) === null ? undefined : () => onClearProject(entry.id)}
            onSelect={(p) => onSelectProject(p, entry.id)}
            onCreateNew={() => onCreateProject(entry.id)}
          />
        ) : null}
        {showsNameEditor(row) && effectiveName(row) ? (
          <>
            <Slash />
            <SuggestedNameField
              name={effectiveName(row) as string}
              onCommit={(n) => onSelectName(n, entry.id)}
            />
          </>
        ) : null}
      </div>
    )
  } else {
    content = (
      <div className="library-bulk-row__stack">
        {row.isLoading ? (
          <ShimmerText active className="library-bulk-row__name">
            {nameOf(entry)}
          </ShimmerText>
        ) : (
          <span className="library-bulk-row__name">{nameOf(entry)}</span>
        )}
        <CommittedProject
          entry={entry}
          row={row}
          isReadOnly={row.suggestion !== null || row.isAccepting}
          projectOptions={projectOptions}
          onMoveToProject={onMoveToProject}
          onCreateProject={onCreateProject}
        />
      </div>
    )
  }

  return (
    <div className="library-bulk-row">
      <div
        className="library-bulk-row__thumb"
        role="button"
        title="Open capture"
        aria-label={`Open ${nameOf(entry)}`}
        onClick={() => onOpen(entry)}
      >
        <BulkThumb entry={entry} className="library-bulk-thumb is-fill" />
      </div>
      {content}
      <span style={{ flex: 1 }} />
      {hasSuggestion ? <span className="library-bulk-row__confirm">Confirm Suggestion</span> : null}
      <SuggestionActions
        entry={entry}
        row={row}
        onAccept={onAccept}
        onDismiss={onDismiss}
        onRevert={onRevert}
      />
    </div>
  )
}
