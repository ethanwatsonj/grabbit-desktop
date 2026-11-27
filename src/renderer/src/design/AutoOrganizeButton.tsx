import { RabbitHopLoader, RabbitIcon } from './RabbitHopLoader'

/**
 * Swift AutoOrganizeButtonLabel: idle rabbit + label; loading slides rabbit
 * to center and fades the label (0.28s), hop animates in place.
 */
export function AutoOrganizeButton({
  isLoading,
  disabled,
  onClick,
  className = ''
}: {
  isLoading: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={`btn ao-btn titlebar-no-drag ${className}`.trim()}
      disabled={disabled && !isLoading}
      onClick={onClick}
      title={isLoading ? 'Auto-organizing…' : 'Auto Organize'}
    >
      <span className={`ao-btn__inner ${isLoading ? 'is-loading' : ''}`}>
        <span className="ao-btn__rabbit">
          {isLoading ? (
            <RabbitHopLoader size="compact" isAnimating />
          ) : (
            <RabbitIcon width={18} />
          )}
        </span>
        <span className="ao-btn__label">Auto Organize</span>
      </span>
    </button>
  )
}
