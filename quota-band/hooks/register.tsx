import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { ContextFill, Window } from '../types'

// Three even columns right above the prompt (5-hour | Weekly | Context), each a title,
// a value, a thin bar and a note. Formerly: one quiet line right above the prompt, in the app's own type and colors:
//   5h · 94% left · Resets in 4h 49m   Weekly · 63% left · Resets Fri 12:00 AM   Context · 45.6k / 200k tokens
// Context is the current context window's fill as the app reports it after each
// reply (input, cache writes and cache reads of the last request), not a running
// total of everything spent. Before the first reply there is no figure, so none is shown.
// A window at 90% used or more is left to the app's own warning.

const windowsAtom = atom({ plugin: 'quota-band', key: 'windows' } as const, [] as Window[], { shape: 'windows-1' })
const contextAtom = atom({ plugin: 'quota-band', key: 'context' } as const, null as ContextFill | null, { shape: 'context-1' })
const hiddenAtom = atom({ plugin: 'quota-band', key: 'isHidden' } as const, false)

const OFFICIAL_WARNING_AT = 90
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toWindows(limits: readonly SessionRateLimit[]): Window[] {
  return limits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
}

function toContext(c: SessionContextUsage): ContextFill {
  return { tokens: typeof c.tokens === 'number' ? c.tokens : null, window: c.window }
}

function left(w: Window): number {
  return Math.max(0, Math.min(100, Math.round(100 - w.percentUsed)))
}

function resetsIn(iso: string | undefined, now: number): string {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return 'Resets soon'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `Resets in ${h}h ${m}m` : `Resets in ${m}m`
}

function resetsOn(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours() % 12 || 12
  return `Resets ${DAYS[d.getDay()]} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

function kilo(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : String(n)
}

// A 5px track with a soft fill, stretched to the column's width.
function thinBar(pct: number, tone: 'calm' | 'low'): string {
  const w = Math.max(0, Math.min(100, pct)) * 2
  const fill = tone === 'low' ? '#d99a6c' : '#8fb9a8'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 5" width="2000" height="50" preserveAspectRatio="none"><rect width="200" height="5" rx="2.5" fill="#8a8a8a" fill-opacity=".22"/><rect width="${w.toFixed(1)}" height="5" rx="2.5" fill="${fill}"/></svg>`
}

async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  const list = toWindows(u.rateLimits)
  const ctx = toContext(u.context)
  await update($, windowsAtom, () => list)
  await update($, contextAtom, () => ctx)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'quota', description: 'Show or hide the usage line above the prompt' })
    $.ui.status(undefined) // the older version kept a status line; clear it
    void refresh($).catch(error => $.ui.log('quota: ' + String(error)))
    // the countdown moves on each minute
    $.clock.every(60000, () => void $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('command.run', { command: 'quota' }, async $ => {
    const hidden = !(await read($, hiddenAtom))
    await update($, hiddenAtom, () => hidden)
    return { text: hidden ? 'Usage line hidden.' : 'Usage line shown.' }
  })

  // Pushed after each turn and when a window moves a whole point.
  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      const list = toWindows(e.rateLimits)
      await update($, windowsAtom, () => list)
    }
    if (e.changed.includes('context')) {
      const ctx = toContext(e.context)
      await update($, contextAtom, () => ctx)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenAtom))) return next(e)
    const now = await $.clock.now()
    const windows = await read($, windowsAtom)
    const ctx = await read($, contextAtom)
    const five = windows.find(w => w.kind === 'five_hour')
    const week = windows.find(w => w.kind === 'seven_day')
    if (!five && !week && !(ctx && ctx.tokens !== null)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // the thin bar is drawn where pictures are; the terminal keeps the text alone
    const barOf = (pct: number, tone: 'calm' | 'low', alt: string) => {
      if (e.surface !== 'desktop' && e.surface !== 'mobile') return null
      const { Svg } = $.ui.resolve(e)
      return <Svg source={thinBar(pct, tone)} alt={alt} />
    }

    const column = (key: string, title: string, value: string, filled: number | null, note: string, tone: 'calm' | 'low') => (
      <Box key={key} flexDirection="column" flexGrow={1} flexShrink={1} width="33%" minWidth={0}>
        <Text wrap="wrap">
          <Text dimColor>{title}</Text> <Text bold>{value}</Text>
        </Text>
        {filled !== null ? barOf(filled, tone, `${title} ${value}`) : null}
        <Text dimColor wrap="wrap">{note}</Text>
      </Box>
    )

    const cols = []
    if (five) cols.push(column('q-5h', '5-hour', `${left(five)}% left`, left(five), resetsIn(five.resetsAt, now), left(five) <= 15 ? 'low' : 'calm'))
    if (week) cols.push(column('q-week', 'Weekly', `${left(week)}% left`, left(week), resetsOn(week.resetsAt), left(week) <= 15 ? 'low' : 'calm'))
    if (ctx && ctx.tokens !== null) {
      const used = Math.min(100, Math.round((ctx.tokens / Math.max(1, ctx.window)) * 100))
      cols.push(column('q-ctx', 'Context', `${used}% used`, used, `${kilo(ctx.tokens)} / ${kilo(ctx.window)} tokens`, used >= 85 ? 'low' : 'calm'))
    }
    return (
      <Box flexDirection="row" gap={3} width="100%">
        {cols}
      </Box>
    )
  })
}
