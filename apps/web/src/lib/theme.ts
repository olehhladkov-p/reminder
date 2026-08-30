export const THEMES = ['default', 'bubble', 'claude', 'elegant', 'claymorphism'] as const

export type Theme = (typeof THEMES)[number]

const STORAGE_KEY = 'theme'

function isTheme(value: string | null): value is Theme {
  return THEMES.includes(value as Theme)
}

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isTheme(stored) ? stored : 'default'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(STORAGE_KEY, theme)
}
