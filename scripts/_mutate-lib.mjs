/**
 * Crash-safe mutation helpers (scratch tooling — used by scripts/_mutate*.js).
 *
 * Why this exists: a mutation run writes a DELIBERATELY broken source file, runs
 * the suite, and restores the file in a finally block. A `finally` survives an
 * exception, but not a killed process — and that happened: an interrupted run left
 * `if (false)` in src/host/core.js, the bundle was rebuilt from it, and a create
 * route's parent-directory check shipped disabled until a later guard refused for
 * the "wrong reason".
 *
 * So every mutant is written beside a `<file>.mutbak` copy of the original. Any
 * harness restores stale backups BEFORE its first mutation, which makes recovery
 * automatic even after a hard kill — and scripts/check.js separately refuses to
 * pass while an `if (false)` is in the sources.
 */
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const BAK = '.mutbak'

export const backupOf = (file) => file + BAK

/** Restore one file from its backup. Returns what happened, for the log. */
export function restore(file) {
  const bak = backupOf(file)
  if (!existsSync(bak)) return 'no-backup'
  const original = readFileSync(bak, 'utf8')
  writeFileSync(file, original)
  rmSync(bak, { force: true })
  return 'restored'
}

/** Every `.mutbak` under `targets` — the files a previous run died holding. Each
 *  target may be a directory (walked) or a single source file (checked directly). */
export function staleBackups(targets) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== '.git' && entry.name !== 'node_modules') walk(rel)
      } else if (entry.name.endsWith(BAK)) out.push(rel.slice(0, -BAK.length))
    }
  }
  for (const target of targets) {
    if (!existsSync(target)) continue
    if (statSync(target).isDirectory()) walk(target)
    else if (target.endsWith(BAK)) out.push(target.slice(0, -BAK.length))
  }
  return out
}

/**
 * Undo whatever the previous run left behind. Call this FIRST, before reading any
 * source: otherwise a harness would read a mutated file as its "original" and
 * bake the mutation into the tree for good.
 */
export function recover(dirs) {
  const files = staleBackups(dirs)
  for (const file of files) {
    const what = restore(file)
    console.log('recovered a killed run\'s mutant: ' + file + ' (' + what + ')')
  }
  return files.length
}

/** Write a mutant, keeping the original beside it. */
export function mutate(file, text) {
  const bak = backupOf(file)
  if (!existsSync(bak)) writeFileSync(bak, readFileSync(file, 'utf8'))
  writeFileSync(file, text)
}

/** Put the original back and drop the backup. */
export function unmutate(file) {
  if (existsSync(backupOf(file))) return restore(file)
  return 'no-backup'
}
