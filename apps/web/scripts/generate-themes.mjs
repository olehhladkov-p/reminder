// Converts src/themes.json into one CSS file per theme under src/themes/.
// Usage: node scripts/generate-themes.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const THEMES_JSON = path.join(__dirname, '..', 'src', 'themes.json')
const OUT_DIR = path.join(__dirname, '..', 'src', 'themes')

function renderVars(vars, indent) {
  return Object.entries(vars)
    .map(([key, value]) => `${indent}--${key}: ${value};`)
    .join('\n')
}

// Light is the base rule. Dark applies either when the OS prefers it (and the
// user hasn't explicitly picked "light") or when the user has explicitly
// picked "dark" - so an explicit choice always wins over the OS setting.
function renderTheme({ name, cssVars }) {
  const { light, dark } = cssVars
  const parts = []

  if (light) {
    parts.push(`[data-theme="${name}"] {\n${renderVars(light, '  ')}\n}`)
  }

  if (dark) {
    parts.push(
      `@media (prefers-color-scheme: dark) {\n  [data-theme="${name}"]:not([data-color-mode="light"]) {\n${renderVars(dark, '    ')}\n  }\n}`,
    )
    parts.push(`[data-theme="${name}"][data-color-mode="dark"] {\n${renderVars(dark, '  ')}\n}`)
  }

  return `${parts.join('\n\n')}\n`
}

async function main() {
  const raw = await readFile(THEMES_JSON, 'utf8')
  const { items } = JSON.parse(raw)

  await mkdir(OUT_DIR, { recursive: true })

  for (const item of items) {
    const css = renderTheme(item)
    const outPath = path.join(OUT_DIR, `${item.name}.css`)
    await writeFile(outPath, css, 'utf8')
    console.log(`wrote ${path.relative(process.cwd(), outPath)}`)
  }

  console.log(
    `\nGenerated ${items.length} theme file(s) in ${path.relative(process.cwd(), OUT_DIR)}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
