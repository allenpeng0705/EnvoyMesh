// throwaway: compute transitive local import closure of a candidate glob
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'

const root = process.argv[2]
const testDir = join(root, 'apps/node/test')
const errorsByFile = new Map()
for (const line of readFileSync('/tmp/errors-by-file.txt', 'utf8').split('\n')) {
  const m = line.match(/^\s*(\d+) (.*)$/)
  if (m) errorsByFile.set(resolve(root, m[2]), Number(m[1]))
}

function listTs(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTs(p))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

const all = listTs(testDir)
const importRe = /(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
  const cands = []
  const swap = (s, ext) => (s.endsWith('.js') ? s.slice(0, -3) + ext : s.endsWith('.mjs') ? s.slice(0, -4) + ext : s + ext)
  cands.push(base, swap(base, '.ts'), base + '.ts', join(base, 'index.ts'), swap(base, '.mts'))
  for (const c of cands) if (existsSync(c) && c.endsWith('.ts')) return resolve(c)
  return null
}

const graph = new Map()
for (const f of all) {
  const src = readFileSync(f, 'utf8')
  const deps = new Set()
  let m
  importRe.lastIndex = 0
  while ((m = importRe.exec(src))) {
    const r = resolveSpec(f, m[1])
    if (r) deps.add(r)
  }
  graph.set(resolve(f), deps)
}

// also: type-only references within test dir? enough for closure

const prefixes = process.argv.slice(3)
for (const prefix of prefixes) {
  const entry = [...graph.keys()].filter((f) => {
    const b = relative(testDir, f)
    return !b.includes('/') && b.startsWith(prefix + '-')
  })
  const seen = new Set()
  const stack = [...entry]
  while (stack.length) {
    const f = stack.pop()
    if (seen.has(f)) continue
    seen.add(f)
    for (const d of graph.get(f) ?? []) if (!seen.has(d)) stack.push(d)
  }
  const errs = [...seen].filter((f) => errorsByFile.has(f))
  const total = errs.reduce((a, f) => a + errorsByFile.get(f), 0)
  console.log(`\n=== ${prefix}-* : ${entry.length} entry files, closure ${seen.size} files ===`)
  for (const f of errs.sort((a, b) => errorsByFile.get(b) - errorsByFile.get(a))) {
    console.log(`  ${errorsByFile.get(f)}\t${relative(root, f)}`)
  }
  console.log(`  TOTAL errors in closure: ${total}`)
}
