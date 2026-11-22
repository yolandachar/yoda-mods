import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import type { ConsoleRow, DailyWeather, StepState } from '../types'
import { planTrip, positionAt, tripStyle } from './jun-route'
import type { Area, Pt, Trip } from './jun-route'
import { CAST_STYLE, jun, seedOf, yoda } from './studio-cast'

// The task console: every Claude session on this computer, how far its task
// list has got, and what is waiting on the person. It reads the desktop app's
// session records and each session's transcript tail; it writes nothing.

const REFRESH_MS = 30000
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

type Tail = { steps: Step[]; ask: string; recap: string; isAsking: boolean; isError: boolean }

// Walks the transcript tail for the task list, the last wrap-up and an open question.
function readTail(text: string): Tail {
  let steps: Step[] = []
  let ask = ''
  let recap = ''
  let isAsking = false
  let isError = false
  const lines = text.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.length < 20) continue
    const hasPlan = line.includes('update_plan')
    const hasWrap = line.includes('mcp__ccd_turn__wrap_up')
    const hasAsk = line.includes('AskUserQuestion')
    const isUser = line.includes('"type":"user"')
    const isAssistant = line.includes('"type":"assistant"')
    // The last word was an API error, until the person or a fine reply moves on.
    if (line.includes('"isApiErrorMessage":true') || line.includes('"subtype":"api_error"')) {
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
  return { steps, ask, recap, isAsking, isError }
}

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
  const isRunning = userAt > edgeAt && now - userAt < 6 * 3600000

  let tail: Tail = { steps: [], ask: '', recap: '', isAsking: false, isError: false }
  if (cwd && cli) {
    const path = `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${cli}.jsonl`
    try {
      const { size } = await $.fs.stat(path)
      const offset = Math.max(0, size - TAIL_BYTES)
      tail = readTail(await $.fs.read(path, { offset, length: size - offset }))
    } catch {
      // no transcript yet
    }
  }
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
    const row = await readSession($, home, file, now)
    if (row) rows.push(row)
  }
  const rank = { error: 0, waiting: 0, running: 1, done: 2, idle: 3 } as const
  rows.sort((a, b) => rank[a.status] - rank[b.status] || b.lastAt - a.lastAt)
  // Only hand over rows that really changed, so the pane isn't redrawn for nothing.
  const next = rows.slice(0, 30)
  const before = await read($, rowsAtom)
  if (JSON.stringify(before) !== JSON.stringify(next)) await update($, rowsAtom, () => next)
  await update($, refreshedAtom, () => now)
}

export async function startConsole($: EngineInterface) {
  void refreshConsole($).catch(error => $.ui.log('console: ' + String(error)))
  $.clock.every(REFRESH_MS, () => void refreshConsole($).catch(error => $.ui.log('console: ' + String(error))))
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

// The last picture handed to the pane. While nobody's state changes the pane gets the
// very same text, so the drawing is left alone and every animation keeps running.
// When something does change, 俊俊 sets off on a new trip from wherever he is right now.
let scene: { sig: string; svg: string; builtAt: number; trip: Trip | null } = { sig: '', svg: '', builtAt: 0, trip: null }

export function sceneFor(rows: readonly ConsoleRow[], now: number, sky: Sky = 'clear'): string {
  const cast = castOf(rows)
  // The hour never forces a redraw (the day runs inside the picture); only who is where, and the weather, do.
  const sig = signatureOf(cast) + '|' + sky
  if (sig === scene.sig && scene.svg !== '') return scene.svg
  const start: Pt = scene.trip ? positionAt(scene.trip, (now - scene.builtAt) / 1000) : [100, 176]
  const trip = planTrip(start, areasOf(cast), Math.random)
  const svg = valleySvg(cast, now, trip, sky)
  scene = { sig, svg, builtAt: now, trip }
  return svg
}

function valleySvg(cast: Cast, now: number, trip: Trip, sky: Sky): string {
  const since = (now - new Date(new Date(now).toDateString()).getTime()) / 1000
  const dayDelay = `animation-delay:-${since.toFixed(0)}s`
  // The clock starts at the real time and the hands keep turning between redraws.
  const d = new Date(now)
  const sec = d.getSeconds()
  const min = d.getMinutes() + sec / 60
  const hour = (d.getHours() % 12) + min / 60
  // Each hand rests at the real angle (so it reads right even with motion off), then turns on.
  const at = (turns: number) => `rotate(${(turns * 360).toFixed(1)} 272 21)`
  const { waiting, running, resting } = cast
  const waitSprites = waiting
    .map((r, i) => yoda(22 + (i % 3) * 24, 104 + Math.floor(i / 3) * 40, r.status === 'error' ? 'error' : 'waiting', seedOf(r.id)))
    .join('')
  const workSprites = running.map((r, i) => yoda(DESKS[i]![0], DESKS[i]![1] - 12, 'working', seedOf(r.id))).join('')
  const restSprites = resting
    .map((r, i) => yoda(238 + (i % 3) * 22, 112 + Math.floor(i / 3) * 44, r.status === 'done' ? 'completed' : 'idle', seedOf(r.id)))
    .join('')
  // The one 俊俊: no task, just his own trip round the office.
  const stroller = jun()
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" width="1500" height="950" preserveAspectRatio="xMidYMid meet">
<style>${SCENE_STYLE}${tripStyle(trip)}${DAY_STYLE.replace(/infinite\}/g, 'infinite}')}
.skyFill,.sun,.moon,.stars,.glowIn,.dim,.lampOn{${dayDelay}}</style>
<defs><pattern id="tiles" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#f6ecdd"/><rect width="8" height="8" fill="#efe1cd"/><rect x="8" y="8" width="8" height="8" fill="#efe1cd"/></pattern></defs>
<!-- floor and wall -->
<rect width="300" height="190" fill="url(#tiles)"/>
<rect width="300" height="44" fill="#f7efe2"/>
<rect y="40" width="300" height="5" fill="#d9c3a3"/>
${windowView(sky)}
<!-- the clock -->
<circle cx="272" cy="21" r="12" fill="#fffaf0" stroke="${INK}" stroke-width="1.6"/>
<g stroke="${INK}" stroke-width="1"><path d="M272 10.5 V12.5 M272 29.5 V31.5 M261.5 21 H263.5 M280.5 21 H282.5"/></g>
<g transform="${at(hour / 12)}"><path class="hour" d="M272 21 V15.5" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/></g>
<g transform="${at(min / 60)}"><path class="min" d="M272 21 V12" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/></g>
<g transform="${at(sec / 60)}"><path class="sec" d="M272 22.5 V11" stroke="#e07a6a" stroke-width=".7" stroke-linecap="round"/></g>
<circle cx="272" cy="21" r="1.2" fill="#e07a6a"/>
<!-- the waiting corner: mailbox and plants -->
${plant(10, 70)}${plant(12, 188)}
<rect x="80" y="56" width="12" height="9" fill="#bcd7ef" stroke="${INK}" stroke-width="1"/><path d="M86 65 V80" stroke="#8a5a3a" stroke-width="2"/><path d="M92 58 V52 h4 v3 h-4" fill="#e07a6a" stroke="${INK}" stroke-width=".8"/>
<!-- the work floor: the busy ones sit behind four desks -->
${workSprites}
${DESKS.map(([x, y]) => desk(x, y)).join('')}
<g class="screen" fill="#ffffff" opacity=".7">${DESKS.slice(0, running.length).map(([x, y]) => `<rect x="${x - 5}" y="${y - 9}" width="6" height="1.2"/><rect x="${x - 5}" y="${y - 6.5}" width="9" height="1.2"/>`).join('')}</g>
${plant(106, 84)}
<!-- the rest area, past a rope: sofa, shelf and lamp -->
<path d="M220 50 V186" stroke="#c98a5a" stroke-width="3"/>
<path d="M220 56 V186" stroke="#e9d2b0" stroke-width="1" stroke-dasharray="3 3"/>
<rect x="230" y="52" width="26" height="34" fill="#e9d2b0" stroke="${INK}" stroke-width="1"/>
<path d="M230 63 H256 M230 74 H256" stroke="${INK}" stroke-width="1"/>
<rect x="233" y="55" width="4" height="8" fill="#f4a7b9"/><rect x="238" y="56" width="4" height="7" fill="#9fdcc8"/><rect x="243" y="54" width="3" height="9" fill="#f2c84b"/><rect x="236" y="66" width="5" height="8" fill="#bcd7ef"/>
<path d="M284 86 V58 M278 58 h12 l-3 -7 h-6 Z" stroke="${INK}" stroke-width="1.2" fill="#f2c84b"/>
<rect x="226" y="114" width="70" height="20" fill="#f4a7b9" stroke="${INK}" stroke-width="1.2"/>
<rect x="226" y="158" width="70" height="20" fill="#9fdcc8" stroke="${INK}" stroke-width="1.2"/>
${restSprites}
<rect x="224" y="124" width="74" height="12" fill="#f28da4" stroke="${INK}" stroke-width="1.2"/>
<rect x="224" y="168" width="74" height="12" fill="#7fcfb6" stroke="${INK}" stroke-width="1.2"/>
${stroller}
${waitSprites}
<!-- the room's light: dimmer at dusk and night, the lamp glowing -->
<rect class="dim" width="300" height="190" fill="#1b2140" opacity="0" pointer-events="none"/>
<circle class="lampOn" cx="284" cy="62" r="26" fill="url(#lampGlow)" opacity="0"/>
</svg>`
}

// ---- the panel ----

export async function consoleView($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const rows = await read($, rowsAtom)
  const opened = await read($, openAtom)
  // read so the times on the cards move on with each refresh; the picture itself is cached
  await read($, refreshedAtom)
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
    art = <Svg source={sceneFor(rows, now, skyOf((await read($, weatherAtom))?.code))} alt={`Yoda's Studio：${waiting.length} 個等你、${running.length} 個工作中、${idle.length} 個做完了`} />
  }

  const toggle = (col: string) => update($, openAtom, list => (list.includes(col) ? list.filter(c => c !== col) : [...list, col]))

  const column = (col: string, title: string, list: readonly ConsoleRow[], empty: string, meta: (r: ConsoleRow) => string) => {
    const isOpen = opened.includes(col)
    const shown = isOpen ? list : list.slice(0, 3)
    return (
      <Box key={'col-' + col} flexDirection="column" flexGrow={1} flexShrink={1} width="33%" minWidth={0} gap={1}>
        <Text bold>
          {title} <Text dimColor>{list.length}</Text>
        </Text>
        {list.length === 0 && (
          <Box borderStyle="single" paddingX={1}>
            <Text dimColor wrap="wrap">{empty}</Text>
          </Box>
        )}
        {shown.map(r => (
          <Box key={col + '-' + r.id} flexDirection="column" borderStyle="single" paddingX={1} minWidth={0}>
            <Text bold wrap="wrap">{r.title}</Text>
            {col === 'wait' && r.waiting !== '' && <Text color="warning" wrap="wrap">{r.waiting}</Text>}
            {col === 'work' && r.total > 0 && (
              <Text dimColor wrap="wrap">
                {r.done}/{r.total}
                {r.current !== '' ? ' · ' + r.current : ''}
              </Text>
            )}
            <Text dimColor wrap="wrap">{meta(r)}</Text>
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
      <Box flexDirection="row" gap={1}>
        {column('wait', '📮 等你回覆', waiting, '沒有人在等你', r => `等了 ${ago(now - r.edgeAt)}`)}
        {column('work', '⏳ 工作中', running, '現在沒人在工作', r => `${ago(now - r.lastAt)}前更新`)}
        {column('done', '✅ 做完了', idle, '還沒有做完的', r => `${clock(r.edgeAt)} 做完`)}
      </Box>
      <Button key="console-refresh" dimColor onPress={() => refreshConsole($)}>
        重新整理
      </Button>
    </Box>
  )
}
