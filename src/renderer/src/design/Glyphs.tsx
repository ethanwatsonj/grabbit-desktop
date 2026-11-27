import type { ReactNode } from 'react'

function Svg({
  children,
  size = 12,
  fill = 'none',
  strokeWidth = 1.6
}: {
  children: ReactNode
  size?: number
  fill?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: 'block', flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

export function ChevronDownGlyph({ size = 9 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M3 5.5l5 5 5-5" />
    </Svg>
  )
}

export function ChevronRightGlyph({ size = 9 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M5.5 3l5 5-5 5" />
    </Svg>
  )
}

export function CheckGlyph({ size = 11 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M3 8.5l3.2 3.2L13 4.5" />
    </Svg>
  )
}

export function XGlyph({ size = 11 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2.2}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  )
}

export function UndoGlyph({ size = 11 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M6 3.5L3 6.5l3 3" />
      <path d="M3 6.5h6.5a3.5 3.5 0 010 7H7" />
    </Svg>
  )
}

export function PlusGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.8}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  )
}

export function NoneGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.5}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4 12L12 4" />
    </Svg>
  )
}

export function FolderGlyph({ size = 12, filled = false }: { size?: number; filled?: boolean }) {
  return (
    <Svg size={size} fill={filled ? 'currentColor' : 'none'} strokeWidth={1.4}>
      <path d="M1.8 4.6a1.4 1.4 0 011.4-1.4h2.6l1.4 1.5h5.6a1.4 1.4 0 011.4 1.4v5.7a1.4 1.4 0 01-1.4 1.4H3.2a1.4 1.4 0 01-1.4-1.4V4.6z" />
    </Svg>
  )
}

export function ListGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.7}>
      <path d="M5.5 4h8M5.5 8h8M5.5 12h8" />
      <circle cx="2.4" cy="4" r="0.6" fill="currentColor" />
      <circle cx="2.4" cy="8" r="0.6" fill="currentColor" />
      <circle cx="2.4" cy="12" r="0.6" fill="currentColor" />
    </Svg>
  )
}

export function GridGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.5}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </Svg>
  )
}

export function PhotoGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.4}>
      <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.6" />
      <circle cx="5.5" cy="6.2" r="1.1" />
      <path d="M2.4 12l3.8-3.6 2.6 2.4 2-1.8 3 3" />
    </Svg>
  )
}

export function VideoGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.4}>
      <rect x="1.6" y="3.8" width="8.8" height="8.4" rx="1.6" />
      <path d="M10.4 7l4-2.2v6.4l-4-2.2" />
    </Svg>
  )
}

/** line.3.horizontal.decrease */
export function FilterGlyph({ size = 12 }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={1.8}>
      <path d="M2 4h12M4 8h8M6.5 12h3" />
    </Svg>
  )
}
