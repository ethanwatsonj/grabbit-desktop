import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'

export function SoftDropdownDivider() {
  return <div className="soft-dropdown__divider" role="separator" />
}

export function SoftDropdownRow({
  title,
  icon,
  isSelected = false,
  shortcut,
  dismissesMenu = true,
  onSelect,
  onRequestClose
}: {
  title: string
  icon?: ReactNode
  isSelected?: boolean
  shortcut?: string
  dismissesMenu?: boolean
  onSelect: () => void
  onRequestClose?: () => void
}) {
  return (
    <button
      type="button"
      className="soft-dropdown__row"
      onClick={() => {
        onSelect()
        if (dismissesMenu) onRequestClose?.()
      }}
    >
      <span className="soft-dropdown__leading">
        {isSelected ? '✓' : icon ?? null}
      </span>
      <span className="soft-dropdown__title">{title}</span>
      {shortcut ? <span className="soft-dropdown__shortcut">{shortcut}</span> : null}
    </button>
  )
}

export function SoftDropdownPanel({
  children,
  style,
  className = ''
}: {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <div
      className={`soft-dropdown__panel titlebar-no-drag ${className}`.trim()}
      style={style}
      role="menu"
    >
      {children}
    </div>
  )
}

type Align = 'leading' | 'trailing'

/** Soft control + floating menu (SoftDropdownAnchor). */
export function SoftDropdown({
  label,
  value,
  align = 'trailing',
  open: controlledOpen,
  onOpenChange,
  children,
  className = '',
  iconOnly = false,
  active = false,
  title
}: {
  label?: string
  value?: ReactNode
  align?: Align
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: (api: { close: () => void }) => ReactNode
  className?: string
  iconOnly?: boolean
  active?: boolean
  title?: string
}) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = controlledOpen ?? uncontrolled
  const setOpen = (next: boolean) => {
    onOpenChange?.(next)
    if (controlledOpen === undefined) setUncontrolled(next)
  }
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div className={`soft-dropdown titlebar-no-drag ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={
          iconOnly
            ? `btn-icon ${active ? 'is-active' : ''} ${open ? 'is-open' : ''}`
            : `soft-control ${open ? 'is-open' : ''}`
        }
        aria-expanded={open}
        aria-controls={menuId}
        title={title}
        onClick={() => setOpen(!open)}
      >
        {iconOnly ? (
          value
        ) : (
          <>
            {label ? <span className="soft-control__label">{label}</span> : null}
            {value ? <span className="soft-control__value">{value}</span> : null}
            <span className="soft-control__chevron">▾</span>
          </>
        )}
      </button>
      {open ? (
        <SoftDropdownPanel
          className={align === 'trailing' ? 'align-end' : 'align-start'}
          style={{ position: 'absolute', top: 'calc(100% + 4px)', zIndex: 50 }}
        >
          <div id={menuId}>{children({ close })}</div>
        </SoftDropdownPanel>
      ) : null}
    </div>
  )
}
