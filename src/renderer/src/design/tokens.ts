/**
 * DesignTokens — ported from archive/swiftui DesignTokens.swift
 * Prefer CSS vars in styles; use these constants for JS-driven UI (kitchen sink, annotate).
 */

export const Radius = {
  sm: 4,
  md: 8,
  lg: 12
} as const

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const

export type ColorTint = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000

export const COLOR_TINTS: ColorTint[] = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]

export type PaletteName =
  | 'neutral'
  | 'blue'
  | 'tomato'
  | 'tangerine'
  | 'gold'
  | 'sage'
  | 'peacock'
  | 'grape'
  | 'flamingo'

/** Hex ramps matching DesignTokens.Palette exactly. */
export const Palette: Record<PaletteName, Record<ColorTint, string>> = {
  neutral: {
    100: '#FAFAFA',
    200: '#F5F5F5',
    300: '#EBEBEB',
    400: '#E0E0E0',
    500: '#A1A1A1',
    600: '#737373',
    700: '#525252',
    800: '#424242',
    900: '#2A2A2A',
    1000: '#171717'
  },
  blue: {
    100: '#EEF3FF',
    200: '#D9E4FF',
    300: '#B8CCFF',
    400: '#8FABFF',
    500: '#6E95FF',
    600: '#5080FF',
    700: '#3B66E0',
    800: '#2C4FB5',
    900: '#1E3785',
    1000: '#122152'
  },
  tomato: {
    100: '#FFF1F0',
    200: '#FFD9D7',
    300: '#FFB3AF',
    400: '#FF8A84',
    500: '#FF655E',
    600: '#FF4A45',
    700: '#E02F2A',
    800: '#B52420',
    900: '#851A17',
    1000: '#54110F'
  },
  tangerine: {
    100: '#FFF4EB',
    200: '#FFE4CC',
    300: '#FFC999',
    400: '#FFAF66',
    500: '#FF9A4D',
    600: '#FF8A38',
    700: '#E06E1F',
    800: '#B55616',
    900: '#853E10',
    1000: '#54280A'
  },
  gold: {
    100: '#FFF8E6',
    200: '#FFECB8',
    300: '#FFDC7A',
    400: '#FFCB3D',
    500: '#FABA14',
    600: '#F0A800',
    700: '#CC8F00',
    800: '#A37200',
    900: '#755200',
    1000: '#473200'
  },
  sage: {
    100: '#EAFBF2',
    200: '#C9F5DE',
    300: '#93E8BD',
    400: '#5CD99A',
    500: '#3DD188',
    600: '#2EC87A',
    700: '#24A664',
    800: '#1B824E',
    900: '#135C38',
    1000: '#0C3A23'
  },
  peacock: {
    100: '#E6F9FC',
    200: '#B8F0F8',
    300: '#70E0EF',
    400: '#33CEED',
    500: '#12C2E0',
    600: '#00B4D4',
    700: '#0096B0',
    800: '#00778C',
    900: '#005566',
    1000: '#003540'
  },
  grape: {
    100: '#F5F0FE',
    200: '#E6DAFC',
    300: '#CDB4F9',
    400: '#B48FF5',
    500: '#A878F2',
    600: '#9D66F0',
    700: '#824ED4',
    800: '#663AAE',
    900: '#4A2880',
    1000: '#2E1852'
  },
  flamingo: {
    100: '#FFF0F5',
    200: '#FFD6E4',
    300: '#FFADD0',
    400: '#FF7AB0',
    500: '#F8629A',
    600: '#F04E88',
    700: '#D1366E',
    800: '#A82856',
    900: '#7A1D3E',
    1000: '#4C1226'
  }
}

export const PALETTE_ORDER: PaletteName[] = [
  'neutral',
  'blue',
  'tomato',
  'tangerine',
  'gold',
  'sage',
  'peacock',
  'grape',
  'flamingo'
]

/** Annotation picker order — solid (600) stops. */
export const ANNOTATION_PALETTE = [
  Palette.tomato[600],
  Palette.tangerine[600],
  Palette.gold[600],
  Palette.sage[600],
  Palette.peacock[600],
  Palette.blue[600],
  Palette.grape[600],
  Palette.flamingo[600]
] as const

export const RecordingGradients = {
  warm: [Palette.tangerine[400], Palette.flamingo[600]] as const,
  cool: [Palette.peacock[400], Palette.blue[700]] as const,
  midnight: [Palette.blue[900], Palette.neutral[1000]] as const
} as const

export type RecordingBackgroundStyle = 'none' | 'warm' | 'cool' | 'midnight' | 'custom'

export const Typography = {
  caption: { size: 13, weight: 400, label: 'Geist Regular' },
  label: { size: 14, weight: 500, label: 'Geist Medium' },
  body: { size: 14, weight: 500, label: 'Geist Medium' },
  bodyEmphasized: { size: 14, weight: 600, label: 'Geist Semibold' },
  title: { size: 14, weight: 600, label: 'Geist Semibold' },
  windowTitle: { size: 12, weight: 600, label: 'Geist Semibold' },
  panelTitle: { size: 18, weight: 600, label: 'Geist Semibold' }
} as const

export type TypeStyle = keyof typeof Typography

export const Elevation = {
  panel: { opacity: 0.18, radius: 6, y: 1 },
  panelRaised: { opacity: 0.45, radius: 10, y: 2 },
  subtle: { opacity: 0.06, radius: 2, y: 1 }
} as const

export const SEMANTIC_SWATCHES = [
  { name: 'Background', varName: '--bg' },
  { name: 'Surface', varName: '--surface' },
  { name: 'Elevated', varName: '--surface-elevated' },
  { name: 'Border', varName: '--border' },
  { name: 'Primary', varName: '--primary' },
  { name: 'On Primary', varName: '--text-on-primary' },
  { name: 'Panel', varName: '--panel-surface' },
  { name: 'Selection', varName: '--list-selection' },
  { name: 'Region', varName: '--region-accent' },
  { name: 'Text Primary', varName: '--text' },
  { name: 'Text Secondary', varName: '--text-secondary' },
  { name: 'Text Tertiary', varName: '--text-tertiary' },
  { name: 'Soft Control', varName: '--soft-fill' },
  { name: 'Soft Hover', varName: '--soft-fill-hovered' }
] as const

export const SCREENSHOT_TOOLS = [
  { id: 'select', label: 'Select', symbol: '↖' },
  { id: 'spotlight', label: 'Spotlight', symbol: '◎' },
  { id: 'crop', label: 'Crop', symbol: '⬚' },
  { id: 'text', label: 'Text', symbol: 'T' },
  { id: 'emoji', label: 'Sticker', symbol: '☺' },
  { id: 'draw', label: 'Draw', symbol: '✎' },
  { id: 'arrow', label: 'Arrow', symbol: '→' },
  { id: 'rect', label: 'Rectangle', symbol: '▭' }
] as const
