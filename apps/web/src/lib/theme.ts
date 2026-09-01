import rawThemes from '../themes.json'

interface ThemeRegistryItem {
  name: string
  title: string
  cssVars: {
    theme?: Record<string, string>
  }
}

const themeItems = (rawThemes as { items: ThemeRegistryItem[] }).items

export interface ThemeFonts {
  sans: string
  serif: string
  mono: string
}

export interface ThemeOption {
  name: string
  title: string
  fonts: ThemeFonts
}

export const THEME_OPTIONS: ThemeOption[] = themeItems.map((item) => ({
  name: item.name,
  title: item.title,
  fonts: {
    sans: item.cssVars.theme?.['font-sans'] ?? '',
    serif: item.cssVars.theme?.['font-serif'] ?? '',
    mono: item.cssVars.theme?.['font-mono'] ?? '',
  },
}))

export const THEMES = THEME_OPTIONS.map((option) => option.name)

export type Theme = string

const STORAGE_KEY = 'theme'
const DEFAULT_THEME: Theme = THEMES[0] ?? 'modern-minimal'

function isTheme(value: string | null): value is Theme {
  return value !== null && THEMES.includes(value)
}

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isTheme(stored) ? stored : DEFAULT_THEME
}

// Font names that are always available locally (system UI stacks and common
// OS-bundled fonts) - fetching these from Google Fonts would be wasted
// bandwidth, and several of them (ui-sans-serif, system-ui, ...) aren't even
// real font names.
const SYSTEM_FONT_KEYWORDS = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'segoe ui emoji',
  'segoe ui symbol',
  'helvetica neue',
  'helvetica',
  'arial',
  'noto sans',
  'noto color emoji',
  'apple color emoji',
  'georgia',
  'cambria',
  'times new roman',
  'times',
  'courier new',
  'menlo',
  'monaco',
  'consolas',
  'liberation mono',
  'sfmono-regular',
  'verdana',
  'tahoma',
])

// A font stack's first entry is the theme's intended custom font; everything
// after it is a fallback chain and is never something we need to fetch.
function primaryFontFamily(stack: string): string | null {
  const first = stack
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
  if (!first || SYSTEM_FONT_KEYWORDS.has(first.toLowerCase())) return null
  return first
}

function googleFontsHref(families: string[]): string | null {
  if (families.length === 0) return null
  const query = families
    .map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@400;500;600;700`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${query}&display=swap`
}

const FONT_LINK_ID = 'theme-fonts'

function loadThemeFonts(fonts: ThemeFonts) {
  const families = Array.from(
    new Set([fonts.sans, fonts.serif, fonts.mono].map(primaryFontFamily).filter(Boolean)),
  ) as string[]

  const href = googleFontsHref(families)
  const existing = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null

  if (!href) {
    existing?.remove()
    return
  }
  if (existing?.href === href) return

  existing?.remove()
  const link = document.createElement('link')
  link.id = FONT_LINK_ID
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)

  const option = THEME_OPTIONS.find((o) => o.name === theme)
  if (option) loadThemeFonts(option.fonts)
}

export const COLOR_MODES = ['light', 'dark', 'system'] as const
export type ColorMode = (typeof COLOR_MODES)[number]

const COLOR_MODE_STORAGE_KEY = 'colorMode'

function isColorMode(value: string | null): value is ColorMode {
  return value !== null && (COLOR_MODES as readonly string[]).includes(value)
}

export function getStoredColorMode(): ColorMode {
  const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY)
  return isColorMode(stored) ? stored : 'system'
}

// 'system' defers to the OS via the [data-color-mode] absence (see the
// prefers-color-scheme media query in each theme's CSS); an explicit choice
// sets the attribute so it wins regardless of OS setting.
export function applyColorMode(mode: ColorMode) {
  if (mode === 'system') {
    document.documentElement.removeAttribute('data-color-mode')
  } else {
    document.documentElement.setAttribute('data-color-mode', mode)
  }
  localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode)
}
