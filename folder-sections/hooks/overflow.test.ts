import { test, expect } from 'claude-code/testing'
import { overflow, type SessionRow } from './register'

const row = (id: string, group: string | null, t: number, pinned = false): SessionRow => ({
  sessionId: id,
  lastActivityAt: new Date(Date.UTC(2026, 0, 1, 0, t)).toISOString(),
  pinned,
  group: group ? { id: group, name: group } : null,
})

test('keeps the 5 most recent per section and returns the rest', () => {
  const rows = Array.from({ length: 8 }, (_, i) => row(`a${i}`, 'A', i))
  expect(overflow(rows, 'other', null).sort()).toEqual(['a0', 'a1', 'a2'])
})

test("the current session's section keeps 4 others", () => {
  const rows = Array.from({ length: 6 }, (_, i) => row(`a${i}`, 'A', i))
  expect(overflow(rows, 'A', null).sort()).toEqual(['a0', 'a1'])
})

test('skips pinned, ungrouped and the Older section', () => {
  const rows = [
    ...Array.from({ length: 7 }, (_, i) => row(`o${i}`, 'OLD', i)),
    ...Array.from({ length: 7 }, (_, i) => row(`u${i}`, null, i)),
    ...Array.from({ length: 6 }, (_, i) => row(`p${i}`, 'P', i, i === 0)),
  ]
  expect(overflow(rows, 'x', 'OLD')).toEqual([])
})
