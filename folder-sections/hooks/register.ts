import type { Register } from 'claude-code'

// folder-sections: files each new Claude Desktop Code session into a sidebar
// section named after its project folder (the git repo root when there is one),
// creating the section if needed. Each session is filed once; if you move it
// by hand afterwards, it stays where you put it. Handles Windows and POSIX paths.

const SERVER = 'ccd_sidebar'
const SESSIONS = 'ccd_session_mgmt'
const DELAY_MS = 3000

// After each new session is filed, every section keeps its KEEP most recent
// sessions and the rest move to the OLDER section (created at the bottom).
export const KEEP = 5
export const OLDER = 'Older'

// Working directory (or any parent of it) -> section name. Checked before the
// repo-root lookup, longest match wins, case-insensitive, either slash style.
// Use this for folders that share a name, or to rename a section.
// Empty by default: add your own entries, using full paths from your machine.
// Examples (uncomment and edit):
//   'C:/Users/you/code/client-a/api': 'api (client-a)',   // two repos both named "api"
//   'C:/Users/you/code/client-b/api': 'api (client-b)',
//   '/home/you/work/monorepo': 'Monorepo',                // rename a section
export const OVERRIDES: Record<string, string> = {}

type Section = { id: string; kind: string; name: string }
export type SessionRow = {
  sessionId: string
  lastActivityAt?: string
  pinned?: boolean
  group?: { id: string; name: string } | null
}
type Result = { isError: boolean; content: { type: string; text?: string }[] }

const textOf = (r: Result) => r.content.map(b => b.text ?? '').join('')

/** Forward slashes, no trailing slash. */
export const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** `C:/Users/<name>`, `/Users/<name>` or `/home/<name>` at the front of a path, else null. */
export const homeOf = (p: string): string | null =>
  normalize(p).match(/^(?:[A-Za-z]:)?\/(?:Users|home)\/[^/]+/i)?.[0] ?? null

const isScratch = (p: string) =>
  !p ||
  p.includes('/scratch-workspaces/') ||
  /^\/(private\/)?tmp(\/|$)/.test(p) ||
  /\/AppData\/Local\/Temp(\/|$)/i.test(p)

/** The section a session in `cwd` belongs to. */
export const sectionName = async (
  cwd: string,
  exists: (p: string) => Promise<boolean>,
  overrides: Record<string, string> = OVERRIDES,
): Promise<string> => {
  let dir = normalize(cwd ?? '')
  if (isScratch(dir)) return 'Scratch'

  const lower = dir.toLowerCase()
  const hit = Object.entries(overrides)
    .map(([k, v]) => [normalize(k).toLowerCase(), v] as const)
    .filter(([k]) => lower === k || lower.startsWith(k + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]
  if (hit) return hit[1]

  dir = dir.replace(/\/\.claude\/worktrees\/[^/]+.*$/, '')
  const home = homeOf(dir)
  if (home && dir.toLowerCase() === home.toLowerCase()) return 'Home'

  // Walk up to the git repo root; never check the home folder or a drive root.
  for (let q = dir; ; ) {
    if (home && q.length <= home.length) break
    if (await exists(`${q}/.git`)) {
      dir = q
      break
    }
    const i = q.lastIndexOf('/')
    if (i <= 0) break
    q = q.slice(0, i)
    if (/^[A-Za-z]:$/.test(q)) break
  }
  return dir.slice(dir.lastIndexOf('/') + 1) || dir
}

/**
 * Ids of the sessions past the `keep` most recent in each section, oldest last.
 * `rows` excludes the current session, so its section (`selfGroup`) keeps one
 * fewer. Pinned and ungrouped sessions, and the Older section, are left alone.
 */
export const overflow = (rows: SessionRow[], selfGroup: string, olderGroup: string | null, keep = KEEP): string[] => {
  const bySection = new Map<string, SessionRow[]>()
  for (const r of rows) {
    const g = r.group?.id
    if (!g || g === olderGroup || r.pinned) continue
    bySection.set(g, [...(bySection.get(g) ?? []), r])
  }
  const out: string[] = []
  for (const [g, list] of bySection) {
    list.sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))
    out.push(...list.slice(Math.max(0, g === selfGroup ? keep - 1 : keep)).map(r => r.sessionId))
  }
  return out
}

const userHome = (cwd: string): string | null => {
  try {
    const env = (globalThis as any).process?.env
    const h = env?.USERPROFILE ?? env?.HOME
    if (h) return normalize(h)
  } catch {}
  return homeOf(cwd)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const home = userHome(e.cwd)
    const logFile = home ? `${home}/.claude/folder-sections.log` : null

    const log = async (line: string) => {
      if (!logFile) return
      try {
        const prev = (await $.fs.exists(logFile)) ? await $.fs.read(logFile) : ''
        await $.fs.write(logFile, (prev + `${new Date().toISOString()} ${e.cwd} ${line}\n`).slice(-20000))
      } catch {}
    }

    // Moves every section's sessions past the KEEP most recent into OLDER.
    const trim = async (selfGroup: string, sections: Section[]) => {
      const listed = await $.mcp.call(SESSIONS, 'list_sessions', { limit: 5000 })
      if (listed.isError) return void (await log(`list_sessions error: ${textOf(listed)}`))
      const rows = JSON.parse(textOf(listed)) as SessionRow[]

      let older = sections.find(s => s.kind === 'manual' && s.name.toLowerCase() === OLDER.toLowerCase())
      const ids = overflow(rows, selfGroup, older?.id ?? null)
      if (!ids.length) return
      if (!older) {
        const made = await $.mcp.call(SERVER, 'create_section', { name: OLDER })
        if (made.isError) return void (await log(`create_section error: ${textOf(made)}`))
        older = JSON.parse(textOf(made)) as Section
      }

      let done = 0
      const move = async (batch: string[]) => {
        const r = await $.mcp.call(SERVER, 'move_sessions', { session_ids: batch, section_id: older!.id })
        if (!r.isError) return void (done += batch.length)
        // One nested session fails the whole batch: retry one by one.
        if (batch.length > 1) for (const id of batch) await move([id])
        else if (!/nested under/.test(textOf(r))) await log(`trim move failed ${batch[0]}: ${textOf(r)}`)
      }
      for (let i = 0; i < ids.length; i += 100) await move(ids.slice(i, i + 100))
      await log(`trimmed ${done}/${ids.length} -> ${OLDER}`)
    }

    // Deferred so the desktop's sidebar server is ready and startup isn't held up.
    $.clock.after(DELAY_MS, async () => {
      try {
        const id = await $.session.id()
        if (await $.store.get(`filed:${id}`)) return

        const name = await sectionName(e.cwd, p => $.fs.exists(p))
        const listed = await $.mcp.call(SERVER, 'list_sections', {})
        if (listed.isError) return void (await log(`list_sections error: ${textOf(listed)}`))

        const sections = JSON.parse(textOf(listed)) as Section[]
        const want = name.toLowerCase()
        let section = sections.find(s => s.kind === 'manual' && s.name.toLowerCase() === want)
        if (!section) {
          const made = await $.mcp.call(SERVER, 'create_section', { name })
          if (made.isError) return void (await log(`create_section error: ${textOf(made)}`))
          section = JSON.parse(textOf(made)) as Section
        }

        const moved = await $.mcp.call(SERVER, 'move_sessions', { session_ids: ['self'], section_id: section.id })
        // A session started by another session is nested under it and moves with it.
        const nested = moved.isError && /nested under/.test(textOf(moved))
        if (!moved.isError || nested) await $.store.set(`filed:${id}`, name)
        await log(`${nested ? 'nested, follows its parent' : moved.isError ? `move failed: ${textOf(moved)}` : 'filed'} -> ${name}`)
        if (!moved.isError || nested) await trim(section.id, sections)
      } catch (err) {
        // Not a Claude Desktop session (terminal, -p): no sidebar to file into.
        await log(`skipped: ${String(err)}`)
      }
    })

    return started
  })
}
