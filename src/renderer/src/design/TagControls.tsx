import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDownGlyph, FolderGlyph, NoneGlyph, PlusGlyph } from './Glyphs'
import { ShimmerText } from './Shimmer'
import { SlideUpReplace } from './SlideUpReplace'
import { SoftDropdownDivider, SoftDropdownPanel, SoftDropdownRow } from './SoftDropdown'

function isEmptyProject(value: string): boolean {
  const t = value.trim()
  return t === '' || t.toLowerCase() === 'none'
}

/**
 * TagKindDropdown (kind: project) — folder icon + editable name | divider | chevron menu.
 * Read-only / loading keep the chrome but block editing and the menu.
 */
export function TagKindDropdown({
  selected,
  options,
  isReadOnly = false,
  isLoading = false,
  slidesSelectionChanges = false,
  fillsAvailableWidth = false,
  onRemove,
  onSelect,
  onCreateNew
}: {
  selected: string
  options: string[]
  isReadOnly?: boolean
  isLoading?: boolean
  slidesSelectionChanges?: boolean
  fillsAvailableWidth?: boolean
  onRemove?: () => void
  onSelect: (name: string) => void
  onCreateNew: () => void
}) {
  const blocksEditing = isReadOnly || isLoading
  const emptySelection = isEmptyProject(selected)
  const displayText = emptySelection ? 'None' : selected
  const [draft, setDraft] = useState(emptySelection ? '' : selected)
  const [focused, setFocused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const chevronRef = useRef<HTMLButtonElement>(null)
  const skipCommitRef = useRef(false)

  useEffect(() => {
    if (!focused) setDraft(emptySelection ? '' : selected)
  }, [selected, emptySelection, focused])

  useEffect(() => {
    if (blocksEditing) {
      setFocused(false)
      setMenuOpen(false)
    }
  }, [blocksEditing])

  useLayoutEffect(() => {
    if (!menuOpen) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left })
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menuOpen])

  const applySelection = (name: string) => {
    const normalized = name.trim()
    if (!normalized) return
    setDraft(normalized)
    onSelect(normalized)
  }

  const commitDraft = () => {
    if (blocksEditing) {
      setDraft(emptySelection ? '' : selected)
      return
    }
    const trimmed = draft.trim()
    if (trimmed === '' || trimmed.toLowerCase() === 'none') {
      if (onRemove && !emptySelection) onRemove()
      else setDraft(emptySelection ? '' : selected)
      return
    }
    if (!emptySelection && trimmed.toLowerCase() === selected.toLowerCase()) {
      setDraft(selected)
      return
    }
    applySelection(trimmed)
  }

  const usesSlide = slidesSelectionChanges && blocksEditing && !isLoading && !focused
  const active = !blocksEditing && (hovered || focused || menuOpen)
  const textTone = emptySelection
    ? 'is-empty'
    : blocksEditing
      ? 'is-secondary'
      : 'is-primary'

  const fieldWidth = fillsAvailableWidth
    ? undefined
    : { width: `clamp(88px, ${Math.max(displayText.length, draft.length) + 1}ch, 200px)` }

  return (
    <div
      ref={rootRef}
      className={[
        'tag-dd',
        'titlebar-no-drag',
        active ? 'is-active' : '',
        focused ? 'is-focused' : '',
        blocksEditing ? 'is-blocked' : '',
        fillsAvailableWidth ? 'is-fill' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={() => !blocksEditing && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={isLoading ? 'Auto-organizing…' : undefined}
    >
      <div className="tag-dd__field">
        <span className="tag-dd__icon">
          <FolderGlyph size={11} filled />
        </span>
        {isLoading ? (
          <ShimmerText active className={`tag-dd__text ${textTone}`} style={fieldWidth}>
            {displayText}
          </ShimmerText>
        ) : usesSlide ? (
          <SlideUpReplace value={displayText} className="tag-dd__slide">
            <span className={`tag-dd__text ${textTone}`}>{displayText}</span>
          </SlideUpReplace>
        ) : (
          <input
            className={`tag-dd__input ${textTone}`}
            style={fieldWidth}
            value={draft}
            placeholder="None"
            readOnly={blocksEditing}
            tabIndex={blocksEditing ? -1 : 0}
            spellCheck={false}
            onFocus={(e) => {
              if (blocksEditing) return
              setFocused(true)
              setDraft(emptySelection ? '' : selected)
              requestAnimationFrame(() => e.target.select())
            }}
            onBlur={() => {
              setFocused(false)
              if (skipCommitRef.current) {
                skipCommitRef.current = false
                setDraft(emptySelection ? '' : selected)
                return
              }
              commitDraft()
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                skipCommitRef.current = true
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        )}
      </div>
      <span className="tag-dd__divider" />
      {blocksEditing ? (
        <span className="tag-dd__chevron" aria-hidden>
          <ChevronDownGlyph />
        </span>
      ) : (
        <button
          ref={chevronRef}
          type="button"
          className="tag-dd__chevron"
          aria-expanded={menuOpen}
          title="Choose project folder"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <ChevronDownGlyph />
        </button>
      )}
      {menuOpen && menuPos ? (
        <SoftDropdownPanel style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 80 }}>
          {options.map((name) => (
            <SoftDropdownRow
              key={name}
              title={name}
              icon={<FolderGlyph size={12} />}
              isSelected={name.toLowerCase() === selected.toLowerCase()}
              onSelect={() => applySelection(name)}
              onRequestClose={() => setMenuOpen(false)}
            />
          ))}
          {options.length > 0 ? <SoftDropdownDivider /> : null}
          {onRemove && !emptySelection ? (
            <SoftDropdownRow
              title="None"
              icon={<NoneGlyph />}
              onSelect={() => onRemove()}
              onRequestClose={() => setMenuOpen(false)}
            />
          ) : null}
          <SoftDropdownRow
            title="Custom…"
            icon={<PlusGlyph />}
            onSelect={() => onCreateNew()}
            onRequestClose={() => setMenuOpen(false)}
          />
        </SoftDropdownPanel>
      ) : null}
    </div>
  )
}

/** Auto Organize rename suggestion: neutral soft-control name field. */
export function SuggestedNameField({
  name,
  onCommit,
  fillsAvailableWidth = false
}: {
  name: string
  onCommit: (name: string) => void
  fillsAvailableWidth?: boolean
}) {
  const [draft, setDraft] = useState(name)
  const [focused, setFocused] = useState(false)
  const skipCommitRef = useRef(false)

  useEffect(() => {
    if (!focused) setDraft(name)
  }, [name, focused])

  const commit = () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed.toLowerCase() === name.toLowerCase()) {
      setDraft(name)
      return
    }
    setDraft(trimmed)
    onCommit(trimmed)
  }

  return (
    <div
      className={`suggest-name titlebar-no-drag ${focused ? 'is-focused' : ''} ${fillsAvailableWidth ? 'is-fill' : ''}`}
    >
      <input
        className="suggest-name__input"
        style={
          fillsAvailableWidth
            ? undefined
            : { width: `clamp(128px, ${Math.max(draft.length, name.length) + 2}ch, 440px)` }
        }
        value={draft}
        placeholder="Name"
        spellCheck={false}
        title="Edit suggested name"
        onFocus={(e) => {
          setFocused(true)
          requestAnimationFrame(() => e.target.select())
        }}
        onBlur={() => {
          setFocused(false)
          if (skipCommitRef.current) {
            skipCommitRef.current = false
            setDraft(name)
            return
          }
          commit()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          } else if (e.key === 'Escape') {
            skipCommitRef.current = true
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
    </div>
  )
}
