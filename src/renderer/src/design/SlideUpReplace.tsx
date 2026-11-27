import { useRef, type ReactNode } from 'react'

export const SUGGESTION_ACCEPT_MS = 280

/** Slide-up value replace for AO accept handoff (SlideUpReplace.swift). */
export function SlideUpReplace({
  value,
  children,
  className = ''
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  // Only animate when the value changes after mount (matches SwiftUI .id transition).
  const initial = useRef(value)
  const hasChanged = useRef(false)
  if (value !== initial.current) hasChanged.current = true
  return (
    <span className={`slide-up-slot ${className}`.trim()}>
      <span
        key={value}
        className={`slide-up-slot__item ${hasChanged.current ? 'is-animated' : ''}`.trim()}
      >
        {children}
      </span>
    </span>
  )
}
