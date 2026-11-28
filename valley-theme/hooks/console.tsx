import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

import type { ConsoleRow, DailyWeather, StepState } from '../types'
import { junAt, junNextChange, junPicture } from './jun-life'
import { planTrip, positionAt, routeBetween, tripStyle } from './jun-route'
import type { Area, Pt, Trip } from './jun-route'
import { CAST_STYLE, jun, lookFor, seedOf, yoda, yodaDressed, yodaLife } from './studio-cast'

// The task console: every Claude session on this computer, how far its task
// list has got, and what is waiting on the person. It reads the desktop app's
// session records and each session's transcript tail; it writes nothing.

const REFRESH_MS = 5000 // a cheap look: only files whose modified time moved are read again
const TAIL_BYTES = 3 * 1024 * 1024
const RECENT_DAYS = 7
// A task that finished this recently still celebrates.
const JUST_DONE_MS = 15 * 60000

const rowsAtom = atom({ plugin: 'valley-theme', key: 'consoleRows' } as const, [] as ConsoleRow[], {
  shape: 'console-rows-3',
})
const refreshedAtom = atom({ plugin: 'valley-theme', key: 'consoleAt' } as const, 0)

type Step = { content: string; status: StepState }

function homeOf($: EngineInterface): string {
  const root = $.plugin.root
  const i = root.indexOf('/.claude/')
  return i > 0 ? root.slice(0, i) : ''
}

async function listDir($: EngineInterface, path: string) {
  try {
    return await $.fs.list(path)
  } catch {
    return []
  }
}

// The app's task list tool: a whole list, or an advance / done / start update.
function applyPlan(steps: Step[], input: Record<string, unknown>): Step[] {
  const items = input['items']
  if (Array.isArray(items)) {
    return items.flatMap(it => {
      const o = it as Record<string, unknown>
      const st = o['status']
      return typeof o['content'] === 'string'
        ? [{ content: o['content'], status: st === 'completed' || st === 'in_progress' ? st : 'pending' }]
        : []
    })
  }
  let next = steps.map(s => ({ ...s }))
  if (input['advance'] === true) {
    const cur = next.findIndex(s => s.status === 'in_progress')
    if (cur >= 0) next[cur]!.status = 'completed'
    const pend = next.findIndex((s, i) => i > cur && s.status === 'pending')
    if (pend >= 0) next[pend]!.status = 'in_progress'
  }
  const done = input['done']
  if (Array.isArray(done)) for (const n of done) if (typeof n === 'number' && next[n - 1]) next[n - 1]!.status = 'completed'
  const start = input['start']
  if (typeof start === 'number' && next[start - 1]) {
    next = next.map(s => (s.status === 'in_progress' ? { ...s, status: 'pending' as const } : s))
    next[start - 1]!.status = 'in_progress'
  }
  return next
}

type Tail = { steps: Step[]; ask: string; recap: string; isAsking: boolean; isError: boolean; turnOpen: boolean; bgOpen: number }

// Walks the transcript tail for the task list, the last wrap-up and an open question.
function readTail(text: string): Tail {
  let steps: Step[] = []
  let ask = ''
  let recap = ''
  let isAsking = false
  let isError = false
  // Is a turn still open? The last message decides: an assistant reply that ended its
  // turn (end_turn) closes it; a tool call, a tool result or a new message keeps it open.
  let turnOpen = false
  // Background work (a background command or agent) keeps the task working after the turn
  // ends: launched ids, each closed by its <task-notification>.
  const bg = new Map<string, number>()
  const lines = text.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.length < 20) continue
    if (line.includes('backgroundTaskId') || line.includes('async_launched')) {
      const at = Date.parse(/"timestamp":"([^"]+)"/.exec(line)?.[1] ?? '') || Date.now()
      for (const m of line.matchAll(/"(?:backgroundTaskId|agentId)":"([A-Za-z0-9_-]+)"/g)) bg.set(m[1]!, at)
    }
    if (line.includes('task-notification')) {
      for (const m of line.matchAll(/<task-id>([^<]+)<\/task-id>/g)) bg.delete(m[1]!)
    }
    const hasPlan = line.includes('update_plan')
    const hasWrap = line.includes('mcp__ccd_turn__wrap_up')
    const hasAsk = line.includes('AskUserQuestion')
    const isUser = line.includes('"type":"user"')
    const isAssistant = line.includes('"type":"assistant"')
    // The last word was an API error, until the person or a fine reply moves on.
    if (line.startsWith('{"parentUuid"') || line.includes('"type":"assistant"') || line.includes('"type":"user"')) {
      if (line.includes('"type":"assistant"') && !line.includes('"isApiErrorMessage":true')) turnOpen = !line.includes('"stop_reason":"end_turn"')
      else if (line.includes('"type":"user"')) turnOpen = true
    }
    if (line.includes('"isApiErrorMessage":true') || line.includes('"subtype":"api_error"')) {
      turnOpen = false
      isError = true
      continue
    }
    if (isAssistant && !line.includes('isApiErrorMessage":true')) isError = false
    if (!hasPlan && !hasWrap && !hasAsk && !isUser) continue
    let o: Record<string, unknown>
    try {
      o = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    const msg = o['message'] as { role?: string; content?: unknown } | undefined
    const content = Array.isArray(msg?.content) ? (msg!.content as Record<string, unknown>[]) : []
    if (o['type'] === 'user') {
      const isHuman = typeof msg?.content === 'string' || content.some(c => c['type'] === 'text')
      if (isHuman) {
        ask = ''
        isAsking = false
        isError = false
      }
      if (content.some(c => c['type'] === 'tool_result')) isAsking = false
      continue
    }
    // The same call is also logged as a request copy; read the assistant's alone.
    if (o['type'] !== 'assistant') continue
    for (const c of content) {
      if (c['type'] !== 'tool_use') continue
      const name = String(c['name'] ?? '')
      const input = (c['input'] ?? {}) as Record<string, unknown>
      if (/(^|__)update_plan$/.test(name)) steps = applyPlan(steps, input)
      else if (name === 'mcp__ccd_turn__wrap_up') {
        steps = steps.map(s => ({ ...s, status: 'completed' as const }))
        ask = typeof input['ask'] === 'string' ? input['ask'] : ''
        recap = typeof input['recap'] === 'string' ? input['recap'] : ''
      } else if (name === 'AskUserQuestion') {
        const qs = input['questions']
        const first = Array.isArray(qs) ? (qs[0] as Record<string, unknown> | undefined) : undefined
        ask = typeof first?.['question'] === 'string' ? first['question'] : '有問題等你回答'
        isAsking = true
      }
    }
  }
  return { steps, ask, recap, isAsking, isError, turnOpen, bgOpen: Math.max(0, ...bg.values()) }
}

// Each session's row as last read, with the modified times it was read at.
const rowCache = new Map<string, { sessionAt: number; transcriptAt: number; row: ConsoleRow | null }>()

async function readSessionCached($: EngineInterface, home: string, file: string, now: number): Promise<ConsoleRow | null> {
  let sessionAt = 0
  try {
    sessionAt = (await $.fs.stat(file)).mtimeMs
  } catch {
    return null
  }
  const have = rowCache.get(file)
  // the transcript moves more often than the session record: look at its time too
  let transcriptAt = 0
  if (have && have.sessionAt === sessionAt && have.row) {
    const p = transcriptPaths.get(file)
    if (p) {
      try {
        transcriptAt = (await $.fs.stat(p)).mtimeMs
      } catch {
        transcriptAt = 0
      }
    }
    // nothing moved: keep the row, but let "done a moment ago" age into "done"
    if (transcriptAt === have.transcriptAt) {
      const row = have.row
      if (row.status === 'done' && now - row.edgeAt >= JUST_DONE_MS) return { ...row, status: 'idle' }
      return row
    }
  }
  const row = await readSession($, home, file, now)
  const p = transcriptPaths.get(file)
  if (p) {
    try {
      transcriptAt = (await $.fs.stat(p)).mtimeMs
    } catch {
      transcriptAt = 0
    }
  }
  rowCache.set(file, { sessionAt, transcriptAt, row })
  return row
}

const transcriptPaths = new Map<string, string>()

async function readSession($: EngineInterface, home: string, file: string, now: number): Promise<ConsoleRow | null> {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(await $.fs.read(file)) as Record<string, unknown>
  } catch {
    return null
  }
  if (d['isArchived'] === true) return null
  const lastAt = typeof d['lastActivityAt'] === 'number' ? d['lastActivityAt'] : 0
  if (now - lastAt > RECENT_DAYS * 86400000) return null
  const cwd = typeof d['cwd'] === 'string' ? d['cwd'] : ''
  const cli = typeof d['cliSessionId'] === 'string' ? d['cliSessionId'] : ''
  const userAt = typeof d['latestUserFrameAt'] === 'number' ? d['latestUserFrameAt'] : 0
  const edgeAt = typeof d['lastTurnEdgeAt'] === 'number' ? d['lastTurnEdgeAt'] : 0

  let tail: Tail = { steps: [], ask: '', recap: '', isAsking: false, isError: false, turnOpen: false, bgOpen: 0 }
  let transcriptAt = 0
  if (cwd && cli) {
    const path = `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${cli}.jsonl`
    transcriptPaths.set(file, path)
    try {
      const { size, mtimeMs } = await $.fs.stat(path)
      transcriptAt = mtimeMs
      const offset = Math.max(0, size - TAIL_BYTES)
      tail = readTail(await $.fs.read(path, { offset, length: size - offset }))
    } catch {
      // no transcript yet
    }
  }
  // Working = the transcript's last message leaves a turn open, and it moved in the last
  // 10 minutes (an open turn that went quiet longer than that was stopped or lost).
  // Background work still out (launched in the last 3 hours, not yet reported back) counts too.
  const bgRunning = tail.bgOpen > 0 && now - tail.bgOpen < 3 * 3600000
  const isRunning = ((tail.turnOpen && now - transcriptAt < 10 * 60000) || bgRunning) && !tail.isAsking
  const total = tail.steps.length
  const done = tail.steps.filter(s => s.status === 'completed').length
  const current = tail.steps.find(s => s.status === 'in_progress')?.content ?? ''
  const waiting = d['interruptedAwaitingPerson'] ? '被中斷了，等你決定要不要繼續' : tail.isAsking || !isRunning ? tail.ask : ''
  const isError = tail.isError && !isRunning
  const finishedAt = edgeAt || lastAt
  const status: ConsoleRow['status'] = isError
    ? 'error'
    : waiting !== ''
      ? 'waiting'
      : isRunning
        ? 'running'
        : now - finishedAt < JUST_DONE_MS
          ? 'done'
          : 'idle'
  return {
    id: String(d['sessionId'] ?? file),
    title: typeof d['title'] === 'string' && d['title'] !== '' ? d['title'] : '（未命名）',
    status,
    done,
    total,
    current,
    waiting: isError ? '出錯了，看一下發生什麼事' : waiting,
    recap: tail.recap,
    lastAt,
    edgeAt: edgeAt || lastAt,
    since: status === 'running' ? userAt || transcriptAt || now : finishedAt,
  }
}

/** Re-reads every session; cheap enough to run every half minute. */
export async function refreshConsole($: EngineInterface) {
  const home = homeOf($)
  if (home === '') return
  const now = await $.clock.now()
  const base = `${home}/Library/Application Support/Claude/claude-code-sessions`
  const files: string[] = []
  for (const org of await listDir($, base)) {
    if (org.kind !== 'dir') continue
    for (const ws of await listDir($, `${base}/${org.name}`)) {
      if (ws.kind !== 'dir') continue
      for (const f of await listDir($, `${base}/${org.name}/${ws.name}`)) {
        if (f.kind === 'file' && /^local_.*\.json$/.test(f.name)) files.push(`${base}/${org.name}/${ws.name}/${f.name}`)
      }
    }
  }
  const rows: ConsoleRow[] = []
  for (const file of files) {
    const row = await readSessionCached($, home, file, now)
    if (row) rows.push(row)
  }
  const rank = { error: 0, waiting: 0, running: 1, done: 2, idle: 3 } as const
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.lastAt - a.lastAt)
  // Only hand over rows that really changed, so the pane isn't redrawn for nothing.
  const next = rows.slice(0, 30)
  const before = await read($, rowsAtom)
  // Redraw the pane only when something it shows really changed: not for a newer
  // activity time on a running task, and not on every refresh (that made the room flash).
  const meaning = (list: readonly ConsoleRow[]) =>
    JSON.stringify(list.map(r => [r.id, r.title, r.status, r.done, r.total, r.current, r.waiting, r.recap, r.edgeAt]))
  if (meaning(before) !== meaning(next)) await update($, rowsAtom, () => next)
}

let refreshing = false
async function refreshSoon($: EngineInterface) {
  if (refreshing) return
  refreshing = true
  try {
    await refreshConsole($)
  } finally {
    refreshing = false
  }
}

/** A turn ending in this session updates the board at once; everything else is seen by the 5-second look. */
export function registerConsole(on: On) {
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    void $.clock.sleep(400).then(() => refreshSoon($)).catch(() => undefined)
    return out
  })
}

export async function startConsole($: EngineInterface) {
  void refreshConsole($).catch(error => $.ui.log('console: ' + String(error)))
  $.clock.every(REFRESH_MS, () => void refreshSoon($).catch(error => $.ui.log('console: ' + String(error))))
}

// Lets long words break anywhere: an invisible break point every 8 characters of a run
// with no space, and after / _ - . so paths and file names wrap too. The text reads the same.
function soft(text: string): string {
  return text
    // Chinese, Japanese and Korean have no spaces: allow a break after every character
    .replace(/([\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F])/g, '$1\u200B')
    .replace(/([/_\-.])/g, '$1\u200B')
    .replace(/[^\s\u200B]{8}(?=[^\s\u200B])/g, m => m + '\u200B')
}

// Splits text into pieces that may sit on separate lines: each Chinese/Japanese/Korean
// character alone, each other word with the space after it, and long words cut every 8.
function pieces(text: string): string[] {
  const out: string[] = []
  const re = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]|[^\s\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]+\s*|\s+/g
  for (const m of text.matchAll(re)) {
    const t = m[0]
    if (t.length > 9 && !/^\s+$/.test(t)) for (let i = 0; i < t.length; i += 8) out.push(t.slice(i, i + 8))
    else out.push(t)
  }
  return out
}

function ago(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000))
  if (min < 1) return '剛剛'
  if (min < 60) return `${min} 分鐘`
  const h = Math.floor(min / 60)
  return h < 24 ? `${h} 小時` : `${Math.floor(h / 24)} 天`
}

function clock(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const weatherAtom = atom({ plugin: 'valley-theme', key: 'dailyWeather' } as const, null as DailyWeather | null, { shape: 'daily-weather-1' })
// Bumped when a Yoda arrives, so her settled picture replaces the walking one once.
const arrivalAtom = atom({ plugin: 'valley-theme', key: 'studioArrivals' } as const, 0)
let arrivalPlanned = 0
const openAtom = atom({ plugin: 'valley-theme', key: 'consoleOpen' } as const, [] as string[], { shape: 'console-open-1' })

// ---- the little valley: one sprite per task, placed by what it is doing ----

const INK = '#3b2a2a'

// ---- the office: wall with valley windows, checkered floor, three corners ----

function desk(x: number, y: number): string {
  return `<rect x="${x - 20}" y="${y}" width="40" height="7" fill="#e9d2b0" stroke="${INK}" stroke-width="1.1"/>
<rect x="${x - 20}" y="${y + 7}" width="40" height="3" fill="#cfb38c" stroke="${INK}" stroke-width=".8"/>
<path d="M${x - 17} ${y + 10} V${y + 22} M${x + 17} ${y + 10} V${y + 22}" stroke="${INK}" stroke-width="1.6"/>
<rect x="${x - 8}" y="${y - 12}" width="16" height="11" fill="#3b3b44" stroke="${INK}" stroke-width="1"/>
<rect x="${x - 6.5}" y="${y - 10.5}" width="13" height="8" fill="#bcd7ef"/>
<path d="M${x} ${y - 1} V${y}" stroke="${INK}" stroke-width="2"/>`
}

function plant(x: number, y: number): string {
  return `<path d="M${x} ${y - 6} q-6 -6 -5 -12 q4 4 5 12 M${x} ${y - 6} q6 -7 6 -13 q-5 4 -6 13 M${x} ${y - 6} q0 -8 0 -14" fill="#6c9c78" stroke="#4f7a5c" stroke-width="1"/>
<path d="M${x - 5} ${y - 6} H${x + 5} L${x + 4} ${y + 2} H${x - 4} Z" fill="#c98a5a" stroke="${INK}" stroke-width="1"/>`
}

function windowPane(x: number): string {
  return `<rect x="${x}" y="8" width="40" height="26" fill="#bcdcf0" stroke="${INK}" stroke-width="1.2"/>
<path d="M${x} 28 Q${x + 12} 20 ${x + 22} 25 T${x + 40} 23 V34 H${x} Z" fill="#9fd2b4"/>
<path d="M${x + 30} 24 l3 -7 3 7 Z" fill="#3f7a5c"/>
<path d="M${x + 20} 8 V34 M${x} 21 H${x + 40}" stroke="#fffaf0" stroke-width="2"/>
<rect x="${x}" y="8" width="40" height="26" fill="none" stroke="${INK}" stroke-width="1.2"/>`
}

const SCENE_STYLE = `
.hour{transform-box:view-box;transform-origin:272px 21px;animation:tick 43200s linear infinite}
.min{transform-box:view-box;transform-origin:272px 21px;animation:tick 3600s linear infinite}
.sec{transform-box:view-box;transform-origin:272px 21px;animation:tick 60s linear infinite}
.screen{animation:screen 2.4s ease-in-out infinite}
@keyframes screen{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes tick{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
${CAST_STYLE}`

const DESKS: ReadonlyArray<readonly [number, number]> = [[124, 104], [184, 104], [124, 150], [184, 150]]

type Cast = { waiting: ConsoleRow[]; running: ConsoleRow[]; resting: ConsoleRow[] }

// One Yoda per task, placed by its state; never more than the room holds.
function castOf(rows: readonly ConsoleRow[]): Cast {
  return {
    waiting: rows.filter(r => r.status === 'waiting' || r.status === 'error').slice(0, 6),
    running: rows.filter(r => r.status === 'running').slice(0, 4),
    resting: [...rows.filter(r => r.status === 'done'), ...rows.filter(r => r.status === 'idle')].slice(0, 6),
  }
}

// What the picture depends on: who stands where, in what state. Times and titles don't count.
function signatureOf(c: Cast): string {
  const part = (list: readonly ConsoleRow[]) => list.map(r => `${r.id}:${r.status}`).join(',')
  return `${part(c.waiting)}|${part(c.running)}|${part(c.resting)}`
}

function areasOf(c: Cast): Area[] {
  const out = new Set<Area>()
  c.waiting.forEach((_, i) => out.add(i < 3 ? 'waiting1' : 'waiting2'))
  c.running.forEach((_, i) => out.add(i < 2 ? 'desk1' : 'desk2'))
  c.resting.forEach((_, i) => out.add(i < 3 ? 'rest1' : 'rest2'))
  return [...out]
}

// ---- the big window: one valley view, a sky that follows the real day, and weather ----

export type Sky = 'clear' | 'cloudy' | 'rain' | 'snow'

/** Open-Meteo weather code to the window's weather. */
export function skyOf(code: number | null | undefined): Sky {
  if (code === null || code === undefined || code < 0) return 'clear'
  if (code <= 1) return 'clear'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code >= 51) return 'rain'
  return 'cloudy'
}

const DAY = 86400
// Where in the day each look sits (seconds after midnight), as stepped/gliding keyframes.
const pcDay = (h: number) => `${((h * 3600) / DAY * 100).toFixed(3)}%`
function dayFrames(name: string, prop: string, stops: Array<[number, string]>): string {
  return `@keyframes ${name}{${stops.map(([h, v]) => `${pcDay(h)}{${prop}:${v}}`).join('')}}`
}

// A full day as CSS: the sky, sun, moon, stars and the room's light all run on a
// 24-hour loop started at the real time of day, so the picture never needs redrawing
// for the hour to change.
const DAY_STYLE = `
.skyFill{animation:skyFill ${DAY}s linear infinite}
.sun{animation:sunShow ${DAY}s linear infinite}
.moon{animation:moonShow ${DAY}s linear infinite}
.stars{animation:moonShow ${DAY}s linear infinite}
.glowIn{animation:glowIn ${DAY}s linear infinite}
.dim{animation:dim ${DAY}s linear infinite}
.lampOn{animation:lampOn ${DAY}s linear infinite}
${dayFrames('skyFill', 'fill', [[0, '#1d2547'], [5, '#1d2547'], [6, '#f6c2a3'], [7.5, '#cfe4f0'], [12, '#bcdcf0'], [16.5, '#cfe4f0'], [18, '#f2a07e'], [19.2, '#53457a'], [20.5, '#1d2547'], [24, '#1d2547']])}
${dayFrames('sunShow', 'opacity', [[0, '0'], [5.6, '0'], [6.6, '1'], [17.8, '1'], [18.8, '0'], [24, '0']])}
${dayFrames('moonShow', 'opacity', [[0, '1'], [5.4, '1'], [6.4, '0'], [18.8, '0'], [19.8, '1'], [24, '1']])}
${dayFrames('glowIn', 'opacity', [[0, '0'], [5.5, '0'], [6.5, '.5'], [8, '0'], [17, '0'], [18.2, '.55'], [19.5, '0'], [24, '0']])}
${dayFrames('dim', 'opacity', [[0, '.34'], [5.5, '.34'], [7, '.06'], [8, '0'], [17, '0'], [18.5, '.12'], [20, '.3'], [24, '.34']])}
${dayFrames('lampOn', 'opacity', [[0, '1'], [6.5, '1'], [7.5, '0'], [17.5, '0'], [18.5, '1'], [24, '1']])}
.cloudA{animation:drift 90s linear infinite}
.cloudB{animation:drift 130s linear infinite;animation-delay:-60s}
.rainFall{animation:rainFall .8s linear infinite}
.snowFall{animation:snowFall 6s linear infinite}
@keyframes drift{from{transform:translateX(-80px)}to{transform:translateX(260px)}}
@keyframes rainFall{from{transform:translate(0,-12px)}to{transform:translate(-4px,14px)}}
@keyframes snowFall{from{transform:translate(0,-14px)}to{transform:translate(4px,16px)}}`

function windowView(sky: Sky): string {
  const x0 = 10
  const x1 = 252
  const clouds =
    sky === 'clear'
      ? `<g class="cloudA" fill="#fffaf0" opacity=".9"><ellipse cx="30" cy="16" rx="12" ry="4"/><ellipse cx="37" cy="13" rx="7" ry="4"/></g>`
      : `<g class="cloudA" fill="${sky === 'cloudy' ? '#e9edf0' : '#c9cfd6'}"><ellipse cx="20" cy="14" rx="18" ry="6"/><ellipse cx="30" cy="10" rx="11" ry="6"/></g>
<g class="cloudB" fill="${sky === 'cloudy' ? '#dfe5ea' : '#b9c0c9'}"><ellipse cx="40" cy="20" rx="20" ry="6"/><ellipse cx="52" cy="16" rx="10" ry="5"/><ellipse cx="140" cy="12" rx="16" ry="5"/></g>`
  const drops =
    sky === 'rain'
      ? `<g class="rainFall" stroke="#8fb7cf" stroke-width="1" stroke-linecap="round">${Array.from({ length: 22 }, (_, i) => `<path d="M${x0 + 6 + i * 11} ${8 + (i % 3) * 7} l-2 5"/>`).join('')}</g>`
      : sky === 'snow'
        ? `<g class="snowFall" fill="#ffffff">${Array.from({ length: 20 }, (_, i) => `<circle cx="${x0 + 8 + i * 12}" cy="${8 + (i % 4) * 6}" r="1"/>`).join('')}</g>`
        : ''
  return `<defs><clipPath id="win"><rect x="${x0}" y="7" width="${x1 - x0}" height="30"/></clipPath>
<radialGradient id="lampGlow"><stop offset="0" stop-color="#ffd98a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient></defs>
<g clip-path="url(#win)">
<rect class="skyFill" x="${x0}" y="7" width="${x1 - x0}" height="30" fill="#bcdcf0"/>
<g class="stars" fill="#fff6dc"><circle cx="40" cy="12" r=".8"/><circle cx="92" cy="18" r=".7"/><circle cx="150" cy="11" r=".9"/><circle cx="205" cy="16" r=".7"/><circle cx="236" cy="10" r=".8"/></g>
<circle class="sun" cx="196" cy="16" r="5" fill="${sky === 'clear' ? '#ffe7a8' : '#f6eccf'}"/>
<circle class="moon" cx="70" cy="15" r="4" fill="#f6ecd6"/>
${clouds}
<path d="M${x0} 31 Q40 22 78 28 T150 26 T210 24 T${x1} 27 V38 H${x0} Z" fill="#a9c9de"/>
<path d="M${x0} 34 Q60 28 120 33 T${x1} 31 V38 H${x0} Z" fill="#9fd2b4"/>
<g fill="#3f7a5c"><path d="M44 34 l3 -8 3 8 Z"/><path d="M52 35 l2.4 -6 2.4 6 Z"/><path d="M170 33 l3 -8 3 8 Z"/><path d="M226 34 l2.6 -7 2.6 7 Z"/></g>
${drops}
<rect class="glowIn" x="${x0}" y="7" width="${x1 - x0}" height="30" fill="#ffb98a" opacity="0"/>
</g>
<rect x="${x0}" y="7" width="${x1 - x0}" height="30" fill="none" stroke="${INK}" stroke-width="1.4"/>
<path d="${Array.from({ length: 4 }, (_, i) => `M${x0 + ((x1 - x0) / 5) * (i + 1)} 7 V37`).join(' ')}" stroke="#fffaf0" stroke-width="2.4"/>
<path d="M${x0} 22 H${x1}" stroke="#fffaf0" stroke-width="1.6"/>
<rect x="${x0 - 2}" y="36" width="${x1 - x0 + 4}" height="3" fill="#e9d2b0" stroke="${INK}" stroke-width=".8"/>`
}

// ---- the room in layers ----
// The pane stacks separate pictures, each redrawn only when its own content changes:
//   room   floor, wall, window, clock, furniture  (only a new kind of weather redraws it)
//   Yoda   one picture per task                   (only that task's own state redraws it)
//   俊俊   his own picture, made once             (nothing ever redraws it)
//   light  dusk and night dimming, the lamp       (made once; it follows the day by itself)
// A picture whose text is unchanged is left alone, so its animations keep running.

const OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" width="1500" height="950" preserveAspectRatio="xMidYMid meet">`

function daySeconds(now: number): number {
  return Math.floor((now - new Date(new Date(now).toDateString()).getTime()) / 1000)
}

let roomCache = { key: '', svg: '' }
function roomSvg(now: number, sky: Sky): string {
  if (roomCache.key === sky) return roomCache.svg
  const dayDelay = `animation-delay:-${daySeconds(now)}s`
  const svg = `${OPEN}
<style>${SCENE_STYLE}${DAY_STYLE}
.skyFill,.sun,.moon,.stars,.glowIn{${dayDelay}}</style>
<defs><pattern id="tiles" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#f6ecdd"/><rect width="8" height="8" fill="#efe1cd"/><rect x="8" y="8" width="8" height="8" fill="#efe1cd"/></pattern></defs>
<rect width="300" height="190" fill="url(#tiles)"/>
<rect width="300" height="44" fill="#f7efe2"/>
<rect y="40" width="300" height="5" fill="#d9c3a3"/>
${windowView(sky)}
<circle cx="272" cy="21" r="12" fill="#fffaf0" stroke="${INK}" stroke-width="1.6"/>
<g stroke="${INK}" stroke-width="1"><path d="M272 10.5 V12.5 M272 29.5 V31.5 M261.5 21 H263.5 M280.5 21 H282.5"/></g>

${plant(10, 70)}${plant(12, 188)}
<rect x="80" y="56" width="12" height="9" fill="#bcd7ef" stroke="${INK}" stroke-width="1"/><path d="M86 65 V80" stroke="#8a5a3a" stroke-width="2"/><path d="M92 58 V52 h4 v3 h-4" fill="#e07a6a" stroke="${INK}" stroke-width=".8"/>
${DESKS.map(([x, y]) => desk(x, y)).join('')}
${plant(106, 84)}
<path d="M220 50 V80 M220 100 V186" stroke="#c98a5a" stroke-width="3"/>
<path d="M220 56 V80 M220 100 V186" stroke="#e9d2b0" stroke-width="1" stroke-dasharray="3 3"/>
<circle cx="220" cy="80" r="2.4" fill="#c98a5a"/><circle cx="220" cy="100" r="2.4" fill="#c98a5a"/>
<rect x="230" y="52" width="26" height="34" fill="#e9d2b0" stroke="${INK}" stroke-width="1"/>
<path d="M230 63 H256 M230 74 H256" stroke="${INK}" stroke-width="1"/>
<rect x="233" y="55" width="4" height="8" fill="#f4a7b9"/><rect x="238" y="56" width="4" height="7" fill="#9fdcc8"/><rect x="243" y="54" width="3" height="9" fill="#f2c84b"/><rect x="236" y="66" width="5" height="8" fill="#bcd7ef"/>
<path d="M284 86 V58 M278 58 h12 l-3 -7 h-6 Z" stroke="${INK}" stroke-width="1.2" fill="#f2c84b"/>
<rect x="226" y="114" width="70" height="20" fill="#f4a7b9" stroke="${INK}" stroke-width="1.2"/>
<rect x="226" y="158" width="70" height="20" fill="#9fdcc8" stroke="${INK}" stroke-width="1.2"/>
<rect x="224" y="124" width="74" height="12" fill="#f28da4" stroke="${INK}" stroke-width="1.2"/>
<rect x="224" y="168" width="74" height="12" fill="#7fcfb6" stroke="${INK}" stroke-width="1.2"/>
</svg>`
  roomCache = { key: sky, svg }
  return svg
}

// The clock's hands: their own small layer, drawn fresh each minute, so the time is always
// the real one (also after the pane is reopened). The second hand sweeps on its own.
let handsCache = { key: -1, svg: '' }
function handsSvg(now: number): string {
  const minuteKey = Math.floor(now / 60000)
  if (handsCache.key === minuteKey) return handsCache.svg
  const d = new Date(now)
  const min = d.getMinutes()
  const hour = (d.getHours() % 12) + min / 60
  const at = (turns: number) => `rotate(${(turns * 360).toFixed(1)} 272 21)`
  const svg = `${OPEN}
<style>.secHand{transform-box:view-box;transform-origin:272px 21px;animation:secSweep 60s linear infinite;animation-delay:-${d.getSeconds()}s}
@keyframes secSweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>
<g transform="${at(hour / 12)}"><path d="M272 21 V15.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/></g>
<g transform="${at(min / 60)}"><path d="M272 21 V12" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/></g>
<g class="secHand"><path d="M272 22.5 V11" stroke="#e07a6a" stroke-width=".7" stroke-linecap="round"/></g>
<circle cx="272" cy="21" r="1.2" fill="#e07a6a"/>
</svg>`
  handsCache = { key: minuteKey, svg }
  return svg
}

// Seats that stay put: a Yoda keeps her seat while her task stays in that part of the room,
// so others coming and going never move her (and never redraw her).
type Zone = 'wait' | 'desk' | 'rest'
const SEATS: Record<Zone, number> = { wait: 6, desk: 4, rest: 6 }
const seats: Record<Zone, Map<string, number>> = { wait: new Map(), desk: new Map(), rest: new Map() }

function seatAll(zone: Zone, ids: readonly string[]): Map<string, number> {
  const map = seats[zone]
  for (const id of [...map.keys()]) if (!ids.includes(id)) map.delete(id)
  for (const id of ids) {
    if (map.has(id)) continue
    const taken = new Set(map.values())
    for (let s = 0; s < SEATS[zone]; s++) {
      if (!taken.has(s)) {
        map.set(id, s)
        break
      }
    }
  }
  return map
}

function seatPoint(zone: Zone, seat: number): Pt {
  if (zone === 'wait') return [22 + (seat % 3) * 24, 104 + Math.floor(seat / 3) * 40]
  if (zone === 'desk') return [DESKS[seat]![0], DESKS[seat]![1] - 12]
  return [238 + (seat % 3) * 22, 112 + Math.floor(seat / 3) * 44]
}

// Each Yoda moves only when her own state changes, in an explicit flow:
//   state changed → walking (a temporary picture, timed by the real clock) → arrived → settled
// The walk is never part of her settled picture, so a redraw can never replay it, and
// a walk cut short by another change starts from wherever she is at that moment.
type Move = { route: Pt[]; lens: number[]; start: number; secs: number }
const RISE = 0.8 // seconds to stand up before walking
const YODA_WALK = 30 // px per second
const spot = new Map<string, Pt>() // where each Yoda is (or is heading)
const moving = new Map<string, Move>() // walks in progress
const settled = new Map<string, { key: string; svg: string }>()

function moveOf(from: Pt, to: Pt, start: number): Move | null {
  const route = routeBetween(from, to)
  const lens = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i]![0], p[1] - route[i]![1]))
  const dist = lens.reduce((a, b) => a + b, 0)
  return dist < 1 ? null : { route, lens, start, secs: RISE + dist / YODA_WALK }
}

/** Where she is `now` along a walk. */
function whereOn(m: Move, now: number): Pt {
  const s = (now - m.start) / 1000 - RISE
  if (s <= 0) return m.route[0]!
  let left = s * YODA_WALK
  for (let i = 0; i < m.lens.length; i++) {
    const len = m.lens[i]!
    const a = m.route[i]!
    const b = m.route[i + 1]!
    if (left <= len) return [a[0] + ((b[0] - a[0]) * left) / len, a[1] + ((b[1] - a[1]) * left) / len]
    left -= len
  }
  return m.route[m.route.length - 1]!
}

/** The moment the next walk ends, so the pane can swap in her settled picture then. */
export function nextArrival(now: number): number | null {
  let soonest: number | null = null
  for (const m of moving.values()) {
    const end = m.start + m.secs * 1000
    if (end > now && (soonest === null || end < soonest)) soonest = end
  }
  return soonest
}

function frontOf(zone: Zone, seat: number): string {
  if (zone === 'desk') {
    const [dx, dy] = DESKS[seat]!
    return `${desk(dx, dy)}<g class="screen" fill="#ffffff" opacity=".7"><rect x="${dx - 5}" y="${dy - 9}" width="6" height="1.2"/><rect x="${dx - 5}" y="${dy - 6.5}" width="9" height="1.2"/></g>`
  }
  if (zone === 'rest') {
    const row = Math.floor(seat / 3)
    const cx = 238 + (seat % 3) * 22
    return row === 0
      ? `<rect x="${cx - 11}" y="124" width="22" height="12" fill="#f28da4"/><path d="M${cx - 11} 124 H${cx + 11} M${cx - 11} 136 H${cx + 11}" stroke="${INK}" stroke-width="1.2"/>`
      : `<rect x="${cx - 11}" y="168" width="22" height="12" fill="#7fcfb6"/><path d="M${cx - 11} 168 H${cx + 11} M${cx - 11} 180 H${cx + 11}" stroke="${INK}" stroke-width="1.2"/>`
  }
  return ''
}

/** The walking picture: only her, walking; the clock decides how far along she is. */
function walkingSvg(id: string, m: Move, now: number, look: number): string {
  const to = m.route[m.route.length - 1]!
  const frames: string[] = []
  let acc = 0
  frames.push(`0%{transform:translate(${(m.route[0]![0] - to[0]).toFixed(1)}px,${(m.route[0]![1] - to[1]).toFixed(1)}px)}`)
  frames.push(`${((RISE / m.secs) * 100).toFixed(2)}%{transform:translate(${(m.route[0]![0] - to[0]).toFixed(1)}px,${(m.route[0]![1] - to[1]).toFixed(1)}px)}`)
  m.route.slice(1).forEach((p, i) => {
    acc += m.lens[i]!
    frames.push(`${(((RISE + acc / YODA_WALK) / m.secs) * 100).toFixed(2)}%{transform:translate(${(p[0] - to[0]).toFixed(1)}px,${(p[1] - to[1]).toFixed(1)}px)}`)
  })
  const k = 'w' + seedOf(id)
  const elapsed = Math.max(0, (now - m.start) / 1000)
  const face = to[0] >= m.route[0]![0] ? 1 : -1
  // runs once, from how far she has already come; held at the end until the swap
  const css = `.${k}{animation:${k} ${m.secs.toFixed(2)}s linear 1 both;animation-delay:-${elapsed.toFixed(2)}s}@keyframes ${k}{${frames.join('')}}.walkStep{animation:walkStep .5s ease-in-out infinite}@keyframes walkStep{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}`
  return `${OPEN}<style>${CAST_STYLE}${css}</style><g class="${k}"><g transform="translate(${to[0]} ${to[1]}) scale(${face} 1)">${yodaDressed('walk', 'casual', false, look)}</g></g></svg>`
}

/** One Yoda's own picture: walking while she moves, else settled at her seat. */
function yodaSvg(zone: Zone, seat: number, state: Parameters<typeof yoda>[2], id: string, now: number, look: number, since = now): string {
  const target = seatPoint(zone, seat)
  const was = spot.get(id)
  // her place changed: start a walk from wherever she is right now
  if (was && (was[0] !== target[0] || was[1] !== target[1])) {
    const cur = moving.get(id)
    const from = cur && now < cur.start + cur.secs * 1000 ? whereOn(cur, now) : was
    // timed from when the change really happened: seen late (this window was in the
    // background), she is already part way there, or already seated
    const begin = cur && now < cur.start + cur.secs * 1000 ? now : Math.min(now, Math.max(since, now - 10 * 60000))
    const m = moveOf(from, target, begin)
    if (m) moving.set(id, m)
    else moving.delete(id)
  }
  spot.set(id, target)
  const m = moving.get(id)
  if (m && now < m.start + m.secs * 1000) return walkingSvg(id, m, now, look)
  moving.delete(id)
  // arrived (or never moved): her settled picture, the same text until her state changes
  const key = `${zone}|${seat}|${state}|${look}`
  const have = settled.get(id)
  if (have && have.key === key) return have.svg
  const svg = `${OPEN}<style>${CAST_STYLE}${SCENE_STYLE}</style>${yodaLife(target[0], target[1], state, id, look)}${frontOf(zone, seat)}</svg>`
  settled.set(id, { key, svg })
  return svg
}

// 俊俊's picture is made once for the life of this pane and never changes, so nothing
// (no task, no refresh, no weather) can restart or move him. His trip visits every part
// of the room at random, whoever happens to be there.
let junCache = ''
function junSvg(): string {
  if (junCache !== '') return junCache
  const trip = planTrip([100, 176], ['waiting1', 'waiting2', 'desk1', 'desk2', 'rest1', 'rest2'], Math.random)
  junCache = `${OPEN}<style>${CAST_STYLE}${tripStyle(trip)}</style>${jun()}</svg>`
  return junCache
}

// The room's light over everyone, made once; its own 24-hour loop does the rest.
let lightCache = ''
function lightSvg(now: number): string {
  if (lightCache !== '') return lightCache
  lightCache = `${OPEN}<style>${DAY_STYLE}.dim,.lampOn{animation-delay:-${daySeconds(now)}s}</style>
<defs><radialGradient id="lampGlowL"><stop offset="0" stop-color="#ffd98a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient></defs>
<rect class="dim" width="300" height="190" fill="#1b2140" opacity="0"/>
<circle class="lampOn" cx="284" cy="62" r="26" fill="url(#lampGlowL)" opacity="0"/></svg>`
  return lightCache
}

type Layer = { key: string; svg: string; alt: string }

/** The stack of pictures for the room, bottom to top. */
export function sceneLayers(rows: readonly ConsoleRow[], now: number, sky: Sky = 'clear'): Layer[] {
  const cast = castOf(rows)
  const waitSeats = seatAll('wait', cast.waiting.map(r => r.id))
  const deskSeats = seatAll('desk', cast.running.map(r => r.id))
  const restSeats = seatAll('rest', cast.resting.map(r => r.id))
  const present = new Set(rows.map(r => r.id))
  for (const id of [...settled.keys()]) if (!present.has(id)) {
    settled.delete(id)
    spot.delete(id)
    moving.delete(id)
  }
  const layers: Layer[] = [{ key: 'room', svg: roomSvg(now, sky), alt: "Yoda's Studio" }, { key: 'hands', svg: handsSvg(now), alt: '' }]
  // 俊俊 goes under the Yodas: where they meet, she stays in front
  layers.push({ key: 'jun', svg: junPicture(junAt(now, areasOf(cast)), now), alt: '俊俊' })
  const everyone = [...cast.running, ...cast.resting, ...cast.waiting].map(r => r.id)
  for (const r of cast.running) layers.push({ key: 'y-' + r.id, svg: yodaSvg('desk', deskSeats.get(r.id)!, 'working', r.id, now, lookFor(r.id, everyone), r.since), alt: r.title })
  for (const r of cast.resting) layers.push({ key: 'y-' + r.id, svg: yodaSvg('rest', restSeats.get(r.id)!, r.status === 'done' ? 'completed' : 'idle', r.id, now, lookFor(r.id, everyone), r.since), alt: r.title })
  for (const r of cast.waiting) layers.push({ key: 'y-' + r.id, svg: yodaSvg('wait', waitSeats.get(r.id)!, r.status === 'error' ? 'error' : 'waiting', r.id, now, lookFor(r.id, everyone), r.since), alt: r.title })
  // 俊俊 follows his own state machine; who is in the room only shapes where he may wander next
  layers.push({ key: 'light', svg: lightSvg(now), alt: '' })
  return layers
}

// ---- the panel ----

export async function consoleView($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const rows = await read($, rowsAtom)
  const opened = await read($, openAtom)
  const now = await $.clock.now()
  const waiting = rows.filter(r => r.status === 'waiting' || r.status === 'error')
  const running = rows.filter(r => r.status === 'running')
  const idle = rows.filter(r => r.status === 'done' || r.status === 'idle')

  if (e.props.placement === 'widget') {
    return <Text>🗂 {waiting.length} 個等你 · {running.length} 個工作中</Text>
  }

  let art = null
  if (e.surface === 'desktop' || e.surface === 'mobile') {
    const { Svg } = $.ui.resolve(e)
    const layers = sceneLayers(rows, now, skyOf((await read($, weatherAtom))?.code))
    await read($, arrivalAtom)
    // one redraw at the next moment anything ends: a Yoda arriving, or 俊俊 finishing a stretch
    const nextMinute = (Math.floor(now / 60000) + 1) * 60000
    const ends = [nextArrival(now), junNextChange(), nextMinute].filter((x): x is number => x !== null && x > now)
    const arrive = ends.length > 0 ? Math.min(...ends) : null
    if (arrive !== null && arrive !== arrivalPlanned) {
      arrivalPlanned = arrive
      $.clock.after(arrive - now + 50, () => void update($, arrivalAtom, n => n + 1))
    }
    const [room, ...over] = layers
    art = (
      <Box key="studio-stack" position="relative" flexDirection="column">
        <Box key="layer-room">
          <Svg source={room!.svg} alt={`Yoda's Studio：${waiting.length} 個等你、${running.length} 個工作中、${idle.length} 個做完了`} />
        </Box>
        {over.map(l => (
          <Box key={l.key} position="absolute" top={0} left={0} right={0} bottom={0}>
            <Svg source={l.svg} alt={l.alt || 'light'} />
          </Box>
        ))}
      </Box>
    )
  }

  const toggle = (col: string) => update($, openAtom, list => (list.includes(col) ? list.filter(c => c !== col) : [...list, col]))

  // Text that wraps by layout: a row of pieces that flows onto new lines inside its box,
  // so a card can never be pushed wider by its words, Chinese or English.
  const wrapped = (key: string, text: string, style: { bold?: boolean; dim?: boolean; color?: 'warning' } = {}) => (
    <Box key={key} flexDirection="row" flexWrap="wrap" minWidth={0} width="100%">
      {pieces(text).map(t => (
        // a space at the end of a piece kept as a non-breaking space, so it is not dropped
        <Text bold={style.bold} dimColor={style.dim} color={style.color}>
          {t.replace(/\s+$/, '\u00A0')}
        </Text>
      ))}
    </Box>
  )

  const column = (col: string, title: string, list: readonly ConsoleRow[], empty: string, meta: (r: ConsoleRow) => string) => {
    const isOpen = opened.includes(col)
    const shown = isOpen ? list : list.slice(0, 3)
    return (
      <Box key={'col-' + col} flexDirection="column" flexGrow={1} flexShrink={1} width={0} minWidth={0} gap={1}>
        {wrapped('t-' + col, `${title} ${list.length}`, { bold: true })}
        {list.length === 0 && (
          <Box borderStyle="single" paddingX={1} minWidth={0} width="100%">
            {wrapped('e-' + col, empty, { dim: true })}
          </Box>
        )}
        {shown.map(r => (
          <Box key={col + '-' + r.id} flexDirection="column" borderStyle="single" paddingX={1} minWidth={0} width="100%">
            {wrapped('n-' + r.id, r.title, { bold: true })}
            {col === 'wait' && r.waiting !== '' && wrapped('w-' + r.id, r.waiting, { color: 'warning' })}
            {col === 'work' && r.total > 0 && wrapped('p-' + r.id, `${r.done}/${r.total}${r.current !== '' ? ' · ' + r.current : ''}`, { dim: true })}
            {wrapped('m-' + r.id, meta(r), { dim: true })}
          </Box>
        ))}
        {list.length > 3 && (
          <Button key={'more-' + col} dimColor onPress={() => toggle(col)}>
            {isOpen ? '收起' : `More +${list.length - 3}`}
          </Button>
        )}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>
        <Text bold>🏡 Yoda's Studio</Text>{' '}
        <Text dimColor>
          {waiting.length} 個等你 · {running.length} 個工作中 · {clock(now)}
        </Text>
      </Text>
      {art}
      <Box flexDirection="row" gap={1} width="100%" minWidth={0}>
        {column('wait', '📮 等你回覆', waiting, '沒有人在等你', r => `等了 ${ago(now - r.edgeAt)}`)}
        {column('work', '⏳ 工作中', running, '現在沒人在工作', r => (now - r.lastAt < 60000 ? '剛剛更新' : `${ago(now - r.lastAt)}前更新`))}
        {column('done', '✅ 做完了', idle, '還沒有做完的', r => `${clock(r.edgeAt)} 做完`)}
      </Box>
      <Button key="console-refresh" dimColor onPress={() => refreshConsole($)}>
        重新整理
      </Button>
    </Box>
  )
}
