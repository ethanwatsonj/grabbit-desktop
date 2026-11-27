import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ANNOTATION_PALETTE,
  COLOR_TINTS,
  Elevation,
  PALETTE_ORDER,
  Palette,
  RecordingGradients,
  SEMANTIC_SWATCHES,
  SCREENSHOT_TOOLS,
  Spacing,
  Typography,
  type PaletteName,
  type RecordingBackgroundStyle,
  type TypeStyle
} from '../design/tokens'
import { RabbitHopLoader, RabbitIcon } from '../design/RabbitHopLoader'

type Appearance = 'system' | 'light' | 'dark'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ks-section">
      <h2 className="section-label">{title}</h2>
      <hr className="divider" />
      <div className="ks-section__body">{children}</div>
    </section>
  )
}

function ColorSwatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="ks-swatch">
      <div className="ks-swatch__chip" style={{ background: `var(${varName})` }} />
      <span className="ks-swatch__name">{name}</span>
    </div>
  )
}

function PaletteRow({ name }: { name: PaletteName }) {
  const scale = Palette[name]
  return (
    <div className="ks-palette-row">
      <span className="ks-palette-row__label">{name[0].toUpperCase() + name.slice(1)}</span>
      <div className="ks-palette-row__ramp">
        {COLOR_TINTS.map((tint) => (
          <div key={tint} className="ks-palette-row__cell" style={{ background: scale[tint] }}>
            {tint === 600 ? <span className="ks-palette-row__solid">600</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function TypeRow({ style }: { style: TypeStyle }) {
  const token = Typography[style]
  const labels: Record<TypeStyle, string> = {
    caption: 'Caption',
    label: 'Label',
    body: 'Body',
    bodyEmphasized: 'Body Emphasized',
    title: 'Title',
    windowTitle: 'Window Title',
    panelTitle: 'Panel Title'
  }
  return (
    <div className="ks-type-row">
      <div className="ks-type-row__meta">
        <span className="ks-type-row__name">{labels[style]}</span>
        <span className="ks-type-row__spec">
          {token.size} pt · {token.label}
        </span>
      </div>
      <span
        style={{
          fontSize: token.size,
          fontWeight: token.weight,
          color: 'var(--text)'
        }}
      >
        The quick brown fox
      </span>
    </div>
  )
}

export function KitchenSinkPage() {
  const [appearance, setAppearance] = useState<Appearance>('system')
  const [bgStyle, setBgStyle] = useState<RecordingBackgroundStyle>('warm')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const [demoToggle, setDemoToggle] = useState(true)
  const [demoPicker, setDemoPicker] = useState('Region')
  const [tags, setTags] = useState([
    { id: '1', kind: 'project', name: 'Grabbit' },
    { id: '2', kind: 'custom', name: 'WIP' }
  ])
  const [tool, setTool] = useState('select')
  const [aoLoading, setAoLoading] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (appearance === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', appearance)
    return () => root.removeAttribute('data-theme')
  }, [appearance])

  return (
    <div className="app-surface kitchen-sink">
      <div className="titlebar-drag kitchen-sink__drag" />
      <div className="kitchen-sink__scroll">
        <header className="kitchen-sink__header">
          <div>
            <h1>Kitchen Sink</h1>
            <p className="muted">Design tokens and reusable UI building blocks.</p>
          </div>
          <div className="ks-segmented titlebar-no-drag" role="group" aria-label="Appearance">
            {(['system', 'light', 'dark'] as Appearance[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={appearance === mode ? 'is-active' : ''}
                onClick={() => setAppearance(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </header>

        <Section title="Colors">
          <p className="ks-sublabel">Semantics</p>
          <div className="ks-swatch-grid">
            {SEMANTIC_SWATCHES.map((s) => (
              <ColorSwatch key={s.name} name={s.name} varName={s.varName} />
            ))}
          </div>

          <p className="ks-sublabel" style={{ marginTop: Spacing.sm }}>
            Palette primitives · 100 → 1000
          </p>
          <div className="ks-palette-list">
            {PALETTE_ORDER.map((name) => (
              <PaletteRow key={name} name={name} />
            ))}
          </div>

          <p className="ks-sublabel" style={{ marginTop: Spacing.sm }}>
            Annotation palette (solid 600)
          </p>
          <div className="ks-anno-row">
            {ANNOTATION_PALETTE.map((color) => (
              <span
                key={color}
                className="ks-anno-dot"
                style={{ background: color }}
              />
            ))}
          </div>

          <p className="ks-sublabel" style={{ marginTop: Spacing.sm }}>
            Recording gradients
          </p>
          <div className="ks-grad-row">
            {(
              [
                ['Warm', RecordingGradients.warm],
                ['Cool', RecordingGradients.cool],
                ['Midnight', RecordingGradients.midnight]
              ] as const
            ).map(([label, stops]) => (
              <div key={label} className="ks-grad-chip">
                <div
                  className="ks-grad-chip__swatch"
                  style={{
                    background: `linear-gradient(135deg, ${stops[0]}, ${stops[1]})`
                  }}
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Typography">
          {(Object.keys(Typography) as TypeStyle[])
            .filter((k) => k !== 'windowTitle')
            .map((style) => (
              <TypeRow key={style} style={style} />
            ))}
        </Section>

        <Section title="Radius">
          <div className="ks-radius-row">
            {(
              [
                ['sm', 4],
                ['md', 8],
                ['lg', 12]
              ] as const
            ).map(([name, r]) => (
              <div key={name} className="ks-radius-sample">
                <div style={{ borderRadius: r }} />
                <span>
                  {name} · {r}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Spacing">
          {(
            [
              ['xs', Spacing.xs],
              ['sm', Spacing.sm],
              ['md', Spacing.md],
              ['lg', Spacing.lg],
              ['xl', Spacing.xl],
              ['xxl', Spacing.xxl]
            ] as const
          ).map(([name, value]) => (
            <div key={name} className="ks-spacing-row">
              <span className="ks-spacing-row__name">{name}</span>
              <span className="ks-spacing-row__bar" style={{ width: value }} />
              <span className="muted">{value} pt</span>
            </div>
          ))}
        </Section>

        <Section title="Elevation">
          <div className="ks-elevation-row">
            {(
              [
                ['Panel', 'panel', Elevation.panel],
                ['Panel Raised', 'panelRaised', Elevation.panelRaised],
                ['Subtle', 'subtle', Elevation.subtle]
              ] as const
            ).map(([label, key, elev]) => (
              <div key={key} className="ks-elevation-card">
                <div
                  style={
                    {
                      boxShadow: `0 ${elev.y}px ${elev.radius}px rgba(0,0,0,${elev.opacity})`
                    } as CSSProperties
                  }
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Key Badges">
          <div className="ks-key-row">
            {['⌘', '⇧', '3'].map((k) => (
              <span key={k} className="kbd">
                {k}
              </span>
            ))}
            <span className="muted" style={{ marginLeft: Spacing.sm, fontSize: 14, fontWeight: 500 }}>
              Grab Screen
            </span>
          </div>
        </Section>

        <Section title="Meta Chips">
          <div className="ks-chip-row">
            <span className="meta-chip">
              <span className="meta-chip__label">Project</span>
              <span className="meta-chip__value">Grabbit</span>
            </span>
            <span className="meta-chip">
              <span className="meta-chip__label">Tag</span>
              <span className="meta-chip__value">Organized</span>
            </span>
          </div>
        </Section>

        <Section title="Capture Tag Bar">
          <div className="tag-bar">
            {tags.map((tag) => (
              <span key={tag.id} className="tag-pill">
                <span className="tag-pill__kind">{tag.kind === 'project' ? 'Project' : 'Tag'}</span>
                <span>{tag.name}</span>
                <button
                  type="button"
                  className="tag-pill__x"
                  aria-label={`Remove ${tag.name}`}
                  onClick={() => setTags((t) => t.filter((x) => x.id !== tag.id))}
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              className="tag-pill tag-pill--add"
              onClick={() =>
                setTags((t) => [
                  ...t,
                  { id: String(Date.now()), kind: 'custom', name: `Tag ${t.length + 1}` }
                ])
              }
            >
              + Add
            </button>
          </div>
        </Section>

        <Section title="Background Style Swatches">
          <div className="ks-bg-swatches">
            {(
              [
                ['none', null],
                ['warm', RecordingGradients.warm],
                ['cool', RecordingGradients.cool],
                ['midnight', RecordingGradients.midnight]
              ] as const
            ).map(([style, stops]) => (
              <button
                key={style}
                type="button"
                className={`ks-bg-swatch ${bgStyle === style ? 'is-selected' : ''}`}
                onClick={() => setBgStyle(style)}
                style={
                  stops
                    ? { background: `linear-gradient(135deg, ${stops[0]}, ${stops[1]})` }
                    : { background: 'var(--surface)' }
                }
                title={style}
              />
            ))}
            <button
              type="button"
              className={`ks-bg-swatch ks-bg-swatch--custom ${bgStyle === 'custom' ? 'is-selected' : ''}`}
              onClick={() => setBgStyle('custom')}
              title="custom"
            />
          </div>
        </Section>

        <Section title="Annotation Color Buttons">
          <div className="ks-color-btns">
            {ANNOTATION_PALETTE.map((color, i) => (
              <button
                key={color}
                type="button"
                className={`ks-color-btn ${paletteIndex === i ? 'is-selected' : ''}`}
                style={{ background: color }}
                onClick={() => setPaletteIndex(i)}
              />
            ))}
            <button type="button" className="ks-color-btn ks-color-btn--custom" title="Custom" />
          </div>
        </Section>

        <Section title="Annotation Tools">
          <div className="ks-anno-chrome">
            <p className="ks-sublabel">Action bar</p>
            <div className="ks-action-bar">
              <span className="ks-action-bar__icon">⧉</span>
              <span>Open in Grabbit</span>
            </div>

            <p className="ks-sublabel" style={{ marginTop: Spacing.lg }}>
              Toolbar pill (screenshot tools)
            </p>
            <div className="ks-toolbar-pill">
              {SCREENSHOT_TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tool === t.id ? 'is-active' : ''}
                  title={t.label}
                  onClick={() => setTool(t.id)}
                >
                  {t.symbol}
                </button>
              ))}
              <span className="ks-toolbar-pill__sep" />
              <span
                className="ks-toolbar-pill__color"
                style={{ background: ANNOTATION_PALETTE[paletteIndex] }}
              />
            </div>
          </div>
        </Section>

        <Section title="Controls">
          <label className="ks-checkbox">
            <button
              type="button"
              className={`grabbit-checkbox ${demoToggle ? 'is-on' : ''}`}
              onClick={() => setDemoToggle((v) => !v)}
              aria-pressed={demoToggle}
            >
              {demoToggle ? '✓' : ''}
            </button>
            <span>Demo toggle</span>
          </label>

          <div className="ks-segmented" style={{ maxWidth: 320, marginTop: Spacing.md }}>
            {['Region', 'Window', 'Display'].map((opt) => (
              <button
                key={opt}
                type="button"
                className={demoPicker === opt ? 'is-active' : ''}
                onClick={() => setDemoPicker(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          <div className="ks-btn-row" style={{ marginTop: Spacing.md }}>
            <button type="button" className="btn">
              Secondary
            </button>
            <button type="button" className="btn primary">
              Prominent
            </button>
            <button type="button" className="btn compact">
              Compact
            </button>
            <button type="button" className="btn">
              <RabbitIcon width={18} />
              Auto Organize
            </button>
            <button type="button" className="btn" disabled title="Auto-organizing…">
              <RabbitHopLoader size="compact" isAnimating />
            </button>
          </div>
        </Section>

        <Section title="Toast">
          <div className="ks-btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => void window.grabbit.kitchenSinkToast('Kitchen sink toast')}
            >
              Show message toast
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void window.grabbit.kitchenSinkToast('Capture saved', true)}
            >
              Show action toast
            </button>
          </div>
        </Section>

        <Section title="Auto Organize">
          <button
            type="button"
            className="ks-ao-demo"
            disabled={aoLoading}
            onClick={() => {
              if (aoLoading) return
              setAoLoading(true)
              window.setTimeout(() => setAoLoading(false), 3000)
            }}
            title={aoLoading ? 'Auto-organizing…' : 'Auto Organize'}
          >
            <span className="ks-ao-demo__inner">
              <span className="ks-ao-demo__slot">
                <RabbitHopLoader
                  size="button"
                  isAnimating={aoLoading}
                  width={aoLoading ? 28 : 28}
                  height={aoLoading ? 24 : (28 * 12) / 25}
                />
              </span>
              <span className="ks-ao-demo__label" style={{ opacity: aoLoading ? 0 : 1 }}>
                Auto Organize
              </span>
            </span>
          </button>
        </Section>
      </div>
    </div>
  )
}
