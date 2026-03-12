/**
 * Purity guard: src/terrain/** must not import THREE or use DOM APIs.
 * Ensures the terrain pipeline stays worker-safe and deterministic (see docs/ARCH_CONSTRAINTS.md).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const TERRAIN_DIR = path.join(process.cwd(), 'src', 'terrain')

/** Patterns that violate terrain purity (no THREE, no DOM). */
const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+['"]three['"]/, name: "import from 'three'" },
  { pattern: /from\s+['"]three\//, name: "import from 'three/...'" },
  { pattern: /require\s*\(\s*['"]three['"]\s*\)/, name: "require('three')" },
  { pattern: /document\./, name: 'document.*' },
  { pattern: /\bwindow\./, name: 'window.*' },
]

function getAllTsFiles(dir: string): string[] {
  const out: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...getAllTsFiles(full))
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

const THIS_FILE = path.join(TERRAIN_DIR, 'terrain-purity.test.ts')

describe('terrain purity (no THREE, no DOM)', () => {
  it('no .ts file under src/terrain imports three or uses document/window', () => {
    const files = getAllTsFiles(TERRAIN_DIR).filter((f) => f !== THIS_FILE)
    const violations: Array<{ file: string; line: number; match: string }> = []
    for (const file of files) {
      const rel = path.relative(process.cwd(), file)
      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        for (const { pattern, name } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push({ file: rel, line: i + 1, match: name })
          }
        }
      }
    }
    expect(
      violations,
      violations.length > 0 ? violations.map((v) => `${v.file}:${v.line} ${v.match}`).join('\n') : undefined,
    ).toHaveLength(0)
  })
})
