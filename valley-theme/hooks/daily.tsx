import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

import type { DailyDay, DailySettings, DailyWeather, RemindState } from '../types'
import type { DailyMove, Outfit } from './studio-cast'
import { addEvent, mergedHistory, migrateOnce, readSharedSettings, writeSharedSettings } from './daily-sync'
import { CAST_STYLE, yodaDressed } from './studio-cast'

// ☕ Yoda's Daily: a small life dashboard with one Yoda for company.
// Today first; every count resets at midnight, and each day is kept in the
// history ($.store, so it outlives sessions). One reminder at a time.

const MINUTE = 60000
const HISTORY_KEY = 'daily-history'
const SETTINGS_KEY = 'daily-settings'
const KEEP_DAYS = 60

const DEFAULTS: DailySettings = { goalMl: 2000, cupMl: 250, waterMin: 45, eyesMin: 20, sitMin: 50, city: '' }
const EMPTY_DAY: DailyDay = { ml: 0, cups: 0, toilet: [], eyes: 0, stands: 0 }

type Kind = 'water' | 'eyes' | 'sit'

const todayAtom = atom({ plugin: 'valley-theme', key: 'dailyToday' } as const, { day: '', data: EMPTY_DAY }, { shape: 'daily-today-1' })
const settingsAtom = atom({ plugin: 'valley-theme', key: 'dailySettings' } as const, DEFAULTS, { shape: 'daily-settings-1' })
const dueAtom = atom({ plugin: 'valley-theme', key: 'dailyDue' } as const, { water: 0, eyes: 0, sit: 0, active: '' }, { shape: 'daily-due-1' })
const weatherAtom = atom({ plugin: 'valley-theme', key: 'dailyWeather' } as const, null as DailyWeather | null, { shape: 'daily-weather-1' })
const panelAtom = atom({ plugin: 'valley-theme', key: 'dailyPanel' } as const, '', { shape: 'daily-panel-1' })
const historyAtom = atom({ plugin: 'valley-theme', key: 'dailyHistory' } as const, {} as Record<string, DailyDay>, { shape: 'daily-history-1' })
// The old water reminder's state, read once to carry today's cups over.
const oldRemindAtom = atom({ plugin: 'valley-theme', key: 'remind' } as const, null as RemindState | null, { shape: 'remind-1' })

/** The date in Hong Kong (UTC+8), whatever the computer's own zone. */
function hkDay(at: number): string {
  const d = new Date(at + 8 * 3600000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmm(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function localHistory($: EngineInterface): Promise<Record<string, DailyDay>> {
  const raw = (await $.store.get(HISTORY_KEY)) as Record<string, DailyDay> | undefined
  return raw && typeof raw === 'object' ? raw : {}
}

/** Every Mac's records through iCloud Drive; this Mac's own store where iCloud is missing. */
async function loadHistory($: EngineInterface): Promise<Record<string, DailyDay>> {
  return (await mergedHistory($)) ?? (await localHistory($))
}

/** Logs one thing done: an event in iCloud, or this Mac's store as before. */
async function logEvent($: EngineInterface, kind: 'water' | 'toilet' | 'eyes' | 'stand', ml?: number) {
  const now = await $.clock.now()
  const day = dayKey(now)
  const synced = await addEvent($, { at: now, day, kind, ...(ml !== undefined ? { ml } : {}) })
  if (!synced) {
    await changeToday($, d =>
      kind === 'water' ? { ...d, ml: d.ml + (ml ?? 0), cups: d.cups + 1 }
      : kind === 'toilet' ? { ...d, toilet: [...d.toilet, now] }
      : kind === 'eyes' ? { ...d, eyes: d.eyes + 1 } : { ...d, stands: d.stands + 1 })
    return
  }
  const hist = await loadHistory($)
  await update($, historyAtom, () => hist)
  await update($, todayAtom, () => ({ day, data: hist[day] ?? EMPTY_DAY }))
}

/** Today's record, rolling over at midnight; every change is saved to the history too. */
async function changeToday($: EngineInterface, fn: (d: DailyDay) => DailyDay) {
  const now = await $.clock.now()
  const key = dayKey(now)
  // Every open conversation shares one record: start from the stored day, not this session's copy.
  const hist = await localHistory($)
  const next = fn(hist[key] ?? EMPTY_DAY)
  await update($, todayAtom, () => ({ day: key, data: next }))
  hist[key] = next
  const keys = Object.keys(hist).sort()
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete hist[k]
  await $.store.set(HISTORY_KEY, hist)
  await update($, historyAtom, () => hist)
}

async function settings($: EngineInterface): Promise<DailySettings> {
  return read($, settingsAtom)
}

async function saveSettings($: EngineInterface, fn: (s: DailySettings) => DailySettings) {
  const next = fn(await settings($))
  await update($, settingsAtom, () => next)
  await $.store.set(SETTINGS_KEY, next)
  await $.store.set(SETTINGS_KEY + '-at', await $.clock.now())
  await writeSharedSettings($, next, await $.clock.now())
}

// ---- reminders: one at a time, never repeated while one waits ----

const LINES: Record<Kind, string> = {
  water: 'Yoda: Time for a sip of water 💧',
  eyes: 'Yoda: Look far away for 20 seconds 👀',
  sit: 'Yoda: Stand up and stretch a little 🧍',
}

// The reminder clock is shared by every open conversation, so a reminder fires once.
const DUE_KEY = 'daily-due'
type Due = { water: number; eyes: number; sit: number; active: string }

async function loadDue($: EngineInterface): Promise<Due | null> {
  const raw = (await $.store.get(DUE_KEY)) as Due | undefined
  return raw && typeof raw.water === 'number' ? raw : null
}

async function saveDue($: EngineInterface, next: Due) {
  await $.store.set(DUE_KEY, next)
  await update($, dueAtom, () => next)
}

async function resetTimer($: EngineInterface, kind: Kind, minutesFromNow?: number) {
  const now = await $.clock.now()
  const s = await settings($)
  const every = kind === 'water' ? s.waterMin : kind === 'eyes' ? s.eyesMin : s.sitMin
  const at = now + (minutesFromNow ?? every) * MINUTE
  const d = (await loadDue($)) ?? (await read($, dueAtom))
  await saveDue($, { ...d, [kind]: at, active: d.active === kind ? '' : d.active })
}

async function tick($: EngineInterface) {
  const now = await $.clock.now()
  // pick up what other conversations logged (and a new day at midnight)
  const hist = await loadHistory($)
  const key = dayKey(now)
  const stored = hist[key] ?? EMPTY_DAY
  const cur = await read($, todayAtom)
  if (cur.day !== key || JSON.stringify(cur.data) !== JSON.stringify(stored)) {
    await update($, todayAtom, () => ({ day: key, data: stored }))
    await update($, historyAtom, () => hist)
  }
  const shared = await readSharedSettings($)
  const localAt = Number(await $.store.get(SETTINGS_KEY + '-at')) || 0
  if (shared && shared.updatedAt > localAt) {
    await update($, settingsAtom, () => ({ ...DEFAULTS, ...shared.settings }))
    await $.store.set(SETTINGS_KEY, shared.settings)
    await $.store.set(SETTINGS_KEY + '-at', shared.updatedAt)
  }
  const due = await loadDue($)
  if (!due) return
  if (JSON.stringify(due) !== JSON.stringify(await read($, dueAtom))) await update($, dueAtom, () => due)
  if (due.active !== '') return
  const kind = (['water', 'sit', 'eyes'] as const).find(k => due[k] > 0 && now >= due[k])
  if (!kind) return
  // claim it in the shared clock first; the conversation that claims it is the one that tells you
  await saveDue($, { ...due, active: kind })
  const check = await loadDue($)
  if (check?.active !== kind) return
  $.ui.toast(LINES[kind], { timeoutMs: 8000 })
  void $.ui.notify(LINES[kind], { title: "☕ Yoda's Daily" }).catch(() => undefined)
}

// ---- actions ----

async function drink($: EngineInterface, ml?: number) {
  const s = await settings($)
  const add = ml ?? s.cupMl
  await logEvent($, 'water', add)
  await resetTimer($, 'water')
}

async function toilet($: EngineInterface) {
  await logEvent($, 'toilet')
}

async function ack($: EngineInterface, kind: Kind) {
  if (kind === 'water') return drink($)
  await logEvent($, kind === 'eyes' ? 'eyes' : 'stand')
  await resetTimer($, kind)
}

async function snooze($: EngineInterface, kind: Kind) {
  await resetTimer($, kind, 10)
}

// ---- weather: Hong Kong Observatory open data, no account ----

export type DailySky = 'clear' | 'cloudy' | 'rain' | 'storm'
const WEATHER_KEY = 'daily-weather'
const OUTFIT_KEY = 'daily-outfit'

// HKO weather icon numbers to the scene, a label, an emoji, and an Open-Meteo-like code
// (Yoda's Studio reads that code for its window).
function fromHko(icon: number): { sky: DailySky; label: string; emoji: string; code: number } {
  if (icon === 65) return { sky: 'storm', label: 'Thunderstorm', emoji: '⛈️', code: 95 }
  if ([53, 54, 62, 63, 64].includes(icon)) return { sky: 'rain', label: icon === 64 ? 'Heavy rain' : icon === 53 || icon === 54 ? 'Showers' : 'Rain', emoji: '🌧️', code: 63 }
  if ([60, 61, 80, 81, 82, 83, 84, 85].includes(icon)) return { sky: 'cloudy', label: icon === 61 ? 'Overcast' : icon === 83 ? 'Fog' : icon === 85 ? 'Haze' : 'Cloudy', emoji: '☁️', code: 3 }
  if (icon === 51 || icon === 52) return { sky: 'clear', label: 'Sunny intervals', emoji: '🌤️', code: 1 }
  if (icon >= 70 && icon <= 77) return { sky: 'clear', label: 'Fine', emoji: '🌙', code: 0 }
  if (icon === 90) return { sky: 'clear', label: 'Hot', emoji: '☀️', code: 0 }
  if (icon === 93) return { sky: 'clear', label: 'Cold', emoji: '🌤️', code: 0 }
  return { sky: 'clear', label: 'Sunny', emoji: '☀️', code: 0 }
}

async function refreshWeather($: EngineInterface) {
  try {
    const cached = (await $.store.get(WEATHER_KEY)) as DailyWeather | undefined
    const now0 = await $.clock.now()
    if (cached && now0 - cached.at < 14 * MINUTE) {
      // another conversation fetched it a moment ago: share theirs
      await update($, weatherAtom, () => cached)
      await chooseOutfit($)
      return
    }
    const res = await $.http.fetch('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=en')
    if (!res.ok) return // keep the last scene rather than guess
    const data = JSON.parse(res.text) as { icon?: number[]; temperature?: { data?: Array<{ place: string; value: number }> } }
    const icon = data.icon?.[0]
    const temps = data.temperature?.data ?? []
    const hko = temps.find(t => t.place === 'Hong Kong Observatory') ?? temps[0]
    if (icon === undefined || !hko) return
    const w = fromHko(icon)
    const now = await $.clock.now()
    const next: DailyWeather = { city: 'Hong Kong', temp: hko.value, code: w.code, at: now, note: `${w.emoji}|${w.label}|${w.sky}` }
    await update($, weatherAtom, () => next)
    await $.store.set(WEATHER_KEY, next)
    await chooseOutfit($)
  } catch (error) {
    $.ui.log('weather: ' + String(error))
  }
}

function weatherParts(w: DailyWeather | null): { emoji: string; label: string; sky: DailySky } {
  const [emoji = '🌤️', label = '', sky = 'clear'] = (w?.note ?? '').split('|')
  return { emoji, label, sky: (['clear', 'cloudy', 'rain', 'storm'].includes(sky) ? sky : 'clear') as DailySky }
}

// ---- one outfit a day, picked from the weather the first time it is known ----

const outfitAtom = atom({ plugin: 'valley-theme', key: 'dailyOutfit' } as const, { day: '', outfit: 'casual' as Outfit }, { shape: 'daily-outfit-1' })

async function chooseOutfit($: EngineInterface) {
  const now = await $.clock.now()
  const day = hkDay(now)
  const cur = await read($, outfitAtom)
  if (cur.day === day) return
  const shared = (await $.store.get(OUTFIT_KEY)) as { day: string; outfit: Outfit } | undefined
  if (shared && shared.day === day) {
    await update($, outfitAtom, () => shared)
    return
  }
  const w = await read($, weatherAtom)
  const { sky } = weatherParts(w)
  const t = w?.temp ?? 22
  const seed = Number(day.replace(/-/g, '')) % 3
  const outfit: Outfit =
    sky === 'rain' || sky === 'storm' ? 'raincoat' : t >= 28 ? 'summer' : t <= 16 ? 'winter' : (['casual', 'home', 'sport'] as const)[seed]!
  const next = { day, outfit }
  await update($, outfitAtom, () => next)
  await $.store.set(OUTFIT_KEY, next)
}

// ---- start and commands ----

export async function startDaily($: EngineInterface) {
  const saved = (await $.store.get(SETTINGS_KEY)) as Partial<DailySettings> | undefined
  const savedAt = Number(await $.store.get(SETTINGS_KEY + '-at')) || 0
  const shared = await readSharedSettings($)
  // the latest change wins, whichever Mac made it
  const s = { ...DEFAULTS, ...(shared && shared.updatedAt >= savedAt ? shared.settings : (saved ?? {})) }
  await update($, settingsAtom, () => s)
  if (!shared) await writeSharedSettings($, s, savedAt || (await $.clock.now()))
  const now = await $.clock.now()
  // first run with iCloud: this Mac's history becomes its own log, once
  await migrateOnce($, await localHistory($))
  const hist = await loadHistory($)
  const key = dayKey(now)
  let today = hist[key] ?? EMPTY_DAY
  // carry over cups already counted by the old water reminder today
  const old = await read($, oldRemindAtom)
  if (old && old.cups > today.cups && old.day === `${new Date(now).getFullYear()}-${new Date(now).getMonth() + 1}-${new Date(now).getDate()}`) {
    today = { ...today, cups: old.cups, ml: Math.max(today.ml, old.cups * s.cupMl) }
    hist[key] = today
    await $.store.set(HISTORY_KEY, hist)
  }
  await update($, historyAtom, () => hist)
  await update($, todayAtom, () => ({ day: key, data: today }))
  // one shared reminder clock: start it once, and only if no conversation has yet
  const sharedDue = await loadDue($)
  if (sharedDue) await update($, dueAtom, () => sharedDue)
  else await saveDue($, { water: now + s.waterMin * MINUTE, eyes: now + s.eyesMin * MINUTE, sit: now + s.sitMin * MINUTE, active: '' })
  await $.command.register({
    name: 'remind',
    description: 'Daily reminders: /remind water 45 | eyes 20 | sit 50 | goal 2000 | cup 250',
  })
  $.clock.every(MINUTE, () => void tick($).catch(error => $.ui.log('daily: ' + String(error))))
  const lastWeather = (await $.store.get(WEATHER_KEY)) as DailyWeather | undefined
  if (lastWeather) await update($, weatherAtom, () => lastWeather)
  const lastOutfit = (await $.store.get(OUTFIT_KEY)) as { day: string; outfit: Outfit } | undefined
  if (lastOutfit) await update($, outfitAtom, () => lastOutfit)
  void refreshWeather($)
  $.clock.every(15 * MINUTE, () => void refreshWeather($))
  // if the weather never comes, still dress for the day
  $.clock.every(10 * MINUTE, () => void chooseOutfit($))
}

export function registerDaily(on: On) {
  on('command.run', { command: 'remind' }, async ($, e) => {
    const [word = '', ...rest] = (e.args ?? '').trim().split(/\s+/)
    const value = rest.join(' ')
    const n = Number(value)
    const ok = Number.isFinite(n) && n > 0
    if (ok && (word === 'water' || word === 'eyes' || word === 'sit') && n >= 5 && n <= 240) {
      await saveSettings($, s => ({ ...s, [`${word}Min`]: n }))
      await resetTimer($, word)
      return { text: `${word === 'water' ? 'Water' : word === 'eyes' ? 'Eye rest' : 'Stand up'} reminder: every ${n} min.` }
    }
    if (ok && word === 'goal') {
      await saveSettings($, s => ({ ...s, goalMl: n }))
      return { text: `Daily water goal: ${n} ml.` }
    }
    if (ok && word === 'cup') {
      await saveSettings($, s => ({ ...s, cupMl: n }))
      return { text: `One cup: ${n} ml.` }
    }
    const s = await settings($)
    return {
      text: `Water every ${s.waterMin} min, eye rest every ${s.eyesMin} min, stand up every ${s.sitMin} min; goal ${s.goalMl} ml, one cup ${s.cupMl} ml\nUsage: /remind water 45 | eyes 20 | sit 50 | goal 2000 | cup 250`,
    }
  })
}

// ---- the dashboard ----

// ---- the little world: sky by Hong Kong time, scene by HK weather, Yoda by the day ----

const DAY = 86400
const pcDay = (h: number) => `${((h * 3600) / DAY * 100).toFixed(3)}%`
const frames = (name: string, prop: string, stops: Array<[number, string]>) =>
  `@keyframes ${name}{${stops.map(([h, v]) => `${pcDay(h)}{${prop}:${v}}`).join('')}}`

const WORLD_STYLE = `
.dSky{animation:dSky ${DAY}s linear infinite}
.dSun{animation:dSun ${DAY}s linear infinite}
.dNight{animation:dNight ${DAY}s linear infinite}
.dWarm{animation:dWarm ${DAY}s linear infinite}
.walkStep{animation:walkStep .5s ease-in-out infinite}
.stroll{animation:stroll 40s ease-in-out infinite}
.dCloud{animation:dCloud 60s linear infinite}
.dRain{animation:dRain .7s linear infinite}
.flash{opacity:0;animation:flash 9s linear infinite}
@keyframes walkStep{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes stroll{0%,100%{transform:translateX(0)}25%{transform:translateX(-16px)}75%{transform:translateX(16px)}}
@keyframes dCloud{from{transform:translateX(-60px)}to{transform:translateX(180px)}}
@keyframes dRain{from{transform:translate(0,-10px)}to{transform:translate(-3px,12px)}}
@keyframes flash{0%,91%{opacity:0}92%{opacity:.55}94%{opacity:0}100%{opacity:0}}
${frames('dSky', 'fill', [[0, '#1d2547'], [5, '#1d2547'], [6, '#f6c2a3'], [7.5, '#cfe4f0'], [12, '#bcdcf0'], [16.5, '#cfe4f0'], [18, '#f2a07e'], [19.2, '#53457a'], [20.5, '#1d2547'], [24, '#1d2547']])}
${frames('dSun', 'opacity', [[0, '0'], [5.6, '0'], [6.6, '1'], [17.8, '1'], [18.8, '0'], [24, '0']])}
${frames('dNight', 'opacity', [[0, '1'], [5.4, '1'], [6.4, '0'], [18.8, '0'], [19.8, '1'], [24, '1']])}
${frames('dWarm', 'opacity', [[0, '.9'], [6.5, '.9'], [7.5, '0'], [17.5, '0'], [18.5, '.9'], [24, '.9']])}`

// Her day: long stretches of standing about (idle), each broken by one move that
// eases in, lasts 30 to 60 seconds and eases back out to idle. Layers crossfade, so
// nothing snaps; the walk starts and ends on her spot, so she never jumps.
const FADE = 1.4 // seconds of crossfade at each end of a move

/** The scene: rebuilt only when the weather kind, the outfit or a reminder changes. */
let world = { key: '', svg: '' }

function worldSvg(now: number, sky: DailySky, outfit: Outfit): string {
  // Reminders, water counts and the clock never redraw her; only the weather kind or the day's outfit do.
  const key = `${sky}|${outfit}`
  if (key === world.key) return world.svg
  const sinceMidnightHk = Math.floor(((now / 1000 + 8 * 3600) % DAY + DAY) % DAY)
  const umbrella = sky === 'rain' || sky === 'storm'
  // Which moves suit now (Hong Kong hour, weather), weighted, then strung into a long loop.
  const hkHour = Math.floor(sinceMidnightHk / 3600)
  const isNight = hkHour >= 21 || hkHour < 6
  const wet = umbrella
  const pool: DailyMove[] = isNight
    ? ['rest', 'rest', 'dream', 'stretch', 'drink', 'wave']
    : wet
      ? ['dream', 'drink', 'wave', 'stretch', 'rest', 'drink']
      : ['wave', 'walk', 'drink', 'stretch', 'dream', 'jump', 'walk', 'rest']
  const plan: Array<{ move: DailyMove | 'idle'; secs: number }> = []
  let last: DailyMove | '' = ''
  for (let i = 0; i < 6; i++) {
    plan.push({ move: 'idle', secs: 14 + Math.round(Math.random() * 16) })
    let m = pool[Math.floor(Math.random() * pool.length)]!
    if (m === last) m = pool[(pool.indexOf(m) + 1) % pool.length]!
    last = m
    plan.push({ move: m, secs: 30 + Math.round(Math.random() * 30) })
  }
  const total = plan.reduce((n, x) => n + x.secs, 0)
  const pc = (t: number) => `${((t / total) * 100).toFixed(3)}%`
  let moveStyle = `.idleLayer{animation:idleFade ${total}s linear infinite}`
  const idleFrames: string[] = ['0%{opacity:1}']
  let yodaLayer = ''
  let t = 0
  plan.forEach((step, i) => {
    if (step.move !== 'idle') {
      const a = t
      const b = t + step.secs
      // the move fades in as idle fades out, and the reverse at its end
      moveStyle += `.mv${i}{opacity:0;animation:mv${i} ${total}s linear infinite}@keyframes mv${i}{0%{opacity:0}${pc(a)}{opacity:0}${pc(a + FADE)}{opacity:1}${pc(b - FADE)}{opacity:1}${pc(b)}{opacity:0}100%{opacity:0}}`
      idleFrames.push(`${pc(a)}{opacity:1}`, `${pc(a + FADE)}{opacity:0}`, `${pc(b - FADE)}{opacity:0}`, `${pc(b)}{opacity:1}`)
      const inner = yodaDressed(step.move, outfit, umbrella)
      yodaLayer += `<g class="mv${i}"><g transform="translate(80 54)">${step.move === 'walk' ? `<g class="stroll" style="animation-duration:${step.secs}s">${inner}</g>` : inner}</g></g>`
    }
    t += step.secs
  })
  idleFrames.push('100%{opacity:1}')
  moveStyle += `@keyframes idleFade{${idleFrames.join('')}}`
  // idle: standing, arms down, a gentle breath
  yodaLayer = `<g class="idleLayer"><g transform="translate(80 54)">${yodaDressed('idle', outfit, umbrella)}</g></g>` + yodaLayer
  const clouds =
    sky === 'clear'
      ? `<g class="dCloud" fill="#fffaf0" opacity=".9"><ellipse cx="20" cy="14" rx="12" ry="4"/><ellipse cx="27" cy="11" rx="7" ry="4"/></g>`
      : `<g class="dCloud" fill="${sky === 'cloudy' ? '#dfe6ee' : sky === 'rain' ? '#b9c3cf' : '#8d93a3'}"><ellipse cx="20" cy="13" rx="20" ry="6"/><ellipse cx="32" cy="9" rx="12" ry="6"/><ellipse cx="96" cy="15" rx="22" ry="6"/><ellipse cx="110" cy="11" rx="12" ry="6"/></g>`
  const rain = umbrella
    ? `<g class="dRain" stroke="#8fb7cf" stroke-width="1" stroke-linecap="round">${Array.from({ length: 18 }, (_, i) => `<path d="M${4 + i * 9} ${6 + (i % 3) * 9} l-2 5"/>`).join('')}</g>
<ellipse cx="40" cy="72" rx="14" ry="2.2" fill="#a9c9de" opacity=".8"/><ellipse cx="124" cy="74" rx="11" ry="2" fill="#a9c9de" opacity=".8"/>`
    : ''
  const storm = sky === 'storm' ? `<rect width="160" height="80" fill="#2a2440" opacity=".35"/><rect class="flash" width="160" height="80" fill="#fffbe8"/><path class="flash" d="M120 6 l-6 12 h5 l-5 12" stroke="#fff3b0" stroke-width="1.6" fill="none"/>` : ''
  const overcast = sky === 'cloudy' ? `<rect width="160" height="80" fill="#9fb2c6" opacity=".22"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 10 160 66" width="800" height="330" preserveAspectRatio="xMidYMid slice">
<style>${CAST_STYLE}${WORLD_STYLE}${moveStyle}.dSky,.dSun,.dNight,.dWarm{animation-delay:-${sinceMidnightHk}s}</style>
<rect class="dSky" width="160" height="80" fill="#bcdcf0"/>
<g class="dNight" fill="#fff6dc"><circle cx="20" cy="10" r=".8"/><circle cx="54" cy="18" r=".7"/><circle cx="100" cy="8" r=".9"/><circle cx="140" cy="20" r=".7"/><path d="M128 10 a7 7 0 1 0 6 11 a6 6 0 1 1 -6 -11 Z" fill="#f6ecd6"/></g>
<circle class="dSun" cx="132" cy="16" r="7" fill="${sky === 'clear' ? '#ffe7a8' : '#f2ead6'}" opacity="${sky === 'clear' ? 1 : 0.6}"/>
${clouds}${overcast}
<path d="M0 58 Q40 44 80 52 T160 48 V80 H0 Z" fill="#a9c9de"/>
<path d="M0 64 Q50 56 100 62 T160 60 V80 H0 Z" fill="#9fd2b4"/>
<g fill="#3f7a5c"><path d="M14 64 l4 -12 4 12 Z"/><path d="M24 65 l3 -9 3 9 Z"/><path d="M140 62 l4 -12 4 12 Z"/></g>
<g class="dWarm"><rect x="146" y="46" width="10" height="8" fill="#ffd98a" stroke="#3b2a2a" stroke-width=".6"/><circle cx="151" cy="50" r="12" fill="#ffd98a" opacity=".25"/></g>
${rain}
${yodaLayer}
${storm}
</svg>`
  world = { key, svg }
  return svg
}

function bar(value: number, goal: number, cells = 10): string {
  const filled = Math.max(0, Math.min(cells, Math.round((value / Math.max(1, goal)) * cells)))
  return '▰'.repeat(filled) + '▱'.repeat(cells - filled)
}

function minsLeft(at: number, now: number): string {
  if (at <= 0) return '—'
  const m = Math.max(0, Math.ceil((at - now) / MINUTE))
  return m === 0 ? 'Now' : `in ${m} min`
}

export async function dailyView($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const now = await $.clock.now()
  const s = await read($, settingsAtom)
  const today = await read($, todayAtom)
  const d = today.day === dayKey(now) ? today.data : EMPTY_DAY
  const due = await read($, dueAtom)
  const weather = await read($, weatherAtom)
  const panel = await read($, panelAtom)
  const hist = await read($, historyAtom)
  const active = (due.active === 'water' || due.active === 'eyes' || due.active === 'sit' ? due.active : '') as Kind | ''

  const outfit = (await read($, outfitAtom)).outfit
  const wp = weatherParts(weather)

  if (e.props.placement === 'widget') {
    return <Text>☕ 💧 {d.ml}/{s.goalMl} ml · 🚻 {d.toilet.length}{active ? ' · ' + LINES[active] : ''}</Text>
  }

  let art = null
  if (e.surface === 'desktop' || e.surface === 'mobile') {
    const { Svg } = $.ui.resolve(e)
    art = <Svg source={worldSvg(now, wp.sky, outfit)} alt="Yoda" />
  }

  const toggle = (name: string) => update($, panelAtom, cur => (cur === name ? '' : name))

  // last 7 days, oldest first
  // last 7 days, newest first; a day with no record stays null (not zero)
  const week = Array.from({ length: 7 }, (_, i) => dayKey(now - i * 86400000)).map(k => ({
    k,
    v: k === dayKey(now) ? d : (hist[k] ?? null),
  }))
  const recorded = week.filter(w => w.v !== null)
  const avgMl = recorded.length > 0 ? Math.round(recorded.reduce((n, w) => n + (w.v?.ml ?? 0), 0) / recorded.length) : null
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayLabel = (k: string) => {
    if (k === dayKey(now)) return 'Today'
    const [y, m, dd] = k.split('-').map(Number)
    const wd = new Date(Date.UTC(y!, m! - 1, dd!)).getUTCDay()
    return `${DOW[wd]} ${m}/${dd}`
  }
  const miniBar = (ml: number) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return null
    const { Svg } = $.ui.resolve(e)
    const w = Math.min(100, Math.round((ml / Math.max(1, s.goalMl)) * 100)) * 2
    const fill = ml >= s.goalMl ? '#6fbf8f' : '#7fb6d6'
    return <Svg source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 6" width="2000" height="60" preserveAspectRatio="none"><rect width="200" height="6" rx="3" fill="#8a8a8a" fill-opacity=".2"/><rect width="${w}" height="6" rx="3" fill="${fill}"/></svg>`} alt={`${ml} ml`} />
  }

  // the water bar: a real drawn bar where pictures are, plain text elsewhere
  const pct = Math.min(100, Math.round((d.ml / Math.max(1, s.goalMl)) * 100))
  let waterBar = null
  if (e.surface === 'desktop' || e.surface === 'mobile') {
    const { Svg } = $.ui.resolve(e)
    const fill = d.ml >= s.goalMl ? '#6fbf8f' : '#7fb6d6'
    waterBar = (
      <Svg
        source={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 8" width="2000" height="80" preserveAspectRatio="none"><rect width="200" height="8" rx="4" fill="#8a8a8a" fill-opacity=".2"/><rect width="${pct * 2}" height="8" rx="4" fill="${fill}"/></svg>`}
        alt={`Water ${pct}%`}
      />
    )
  }
  const hkNow = new Date(now + 8 * 3600000)
  const hkTime = `${String(hkNow.getUTCHours()).padStart(2, '0')}:${String(hkNow.getUTCMinutes()).padStart(2, '0')}`

  const reminder = (k: Kind, icon: string, name: string, at: number) => (
    <Box key={'rem-' + k} flexDirection="column" flexGrow={1} flexShrink={1} width="33%" minWidth={0} borderStyle="round" padding="lg">
      <Text wrap="wrap">
        {icon} <Text dimColor>{name}</Text>
      </Text>
      <Text bold color={active === k ? 'accent' : undefined}>
        {active === k ? 'Now' : minsLeft(at, now)}
      </Text>
      {active === k && (
        <Box flexDirection="column" gap="sm">
          <Button key={'rem-ack-' + k} variant="primary" onPress={() => ack($, k)}>
            {k === 'water' ? `Drank +${s.cupMl}` : k === 'eyes' ? 'Rested' : 'Moved'}
          </Button>
          <Button key={'rem-snz-' + k} dimColor onPress={() => snooze($, k)}>
            In 10 min
          </Button>
        </Box>
      )}
    </Box>
  )

  return (
    <Box flexDirection="column" gap="md">
      {/* weather and Yoda: the focus */}
      <Box flexDirection="column" borderStyle="round" padding="lg" gap="md">
        <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap" gap="sm">
          <Text wrap="wrap">
            {wp.emoji}{' '}
            {weather && weather.temp !== null ? (
              <Text>
                <Text bold size="title">{Math.round(weather.temp)}°</Text> <Text>{wp.label}</Text>
              </Text>
            ) : (
              <Text dimColor>Loading Hong Kong Observatory weather…</Text>
            )}
          </Text>
          <Text dimColor>Hong Kong · {hkTime}</Text>
        </Box>
        {art}
        {active !== '' && <Text bold color="accent" wrap="wrap">{LINES[active]}</Text>}
      </Box>

      {/* the two records, side by side */}
      <Box flexDirection="row" gap="md" alignItems="stretch">
        <Box flexDirection="column" justifyContent="space-between" flexGrow={1} flexShrink={1} width="50%" minWidth={0} borderStyle="round" padding="lg" gap="sm">
          <Text dimColor>💧 Water</Text>
          <Text>
            <Text bold size="heading">{d.ml}</Text>
            <Text dimColor> / {s.goalMl} ml · {pct}%</Text>
          </Text>
          {waterBar ?? <Text dimColor>{bar(d.ml, s.goalMl)}</Text>}
          <Box flexDirection="row" gap={1}>
            <Button key="d-drink" variant="primary" onPress={() => drink($, 250)}>
              +250
            </Button>
            <Button key="d-drink-500" onPress={() => drink($, 500)}>
              +500
            </Button>
          </Box>
        </Box>
        <Box flexDirection="column" justifyContent="space-between" flexGrow={1} flexShrink={1} width="50%" minWidth={0} borderStyle="round" padding="lg" gap="sm">
          <Text dimColor>🚻 Restroom</Text>
          <Text>
            <Text bold size="heading">{d.toilet.length}</Text>
            <Text dimColor> {d.toilet.length === 1 ? 'visit' : 'visits'}</Text>
          </Text>
          <Text dimColor wrap="wrap">{d.toilet.length > 0 ? 'Last ' + d.toilet.slice(-3).map(hhmm).join(', ') : 'None yet today'}</Text>
          <Box flexDirection="row">
            <Button key="d-toilet" variant="primary" onPress={() => toilet($)}>
              Log a visit
            </Button>
          </Box>
        </Box>
      </Box>

      {/* reminders, compact; buttons only on the one that is up */}
      <Box flexDirection="row" gap="md" alignItems="stretch">
        {reminder('eyes', '👀', 'Eye rest', due.eyes)}
        {reminder('sit', '🧍', 'Stand up', due.sit)}
        {reminder('water', '💧', 'Water', due.water)}
      </Box>

      {/* the quiet bottom */}
      <Box flexDirection="row" gap={1}>
        <Button key="d-stats" dimColor onPress={() => toggle('stats')}>
          {panel === 'stats' ? '📊 Hide stats' : '📊 Stats'}
        </Button>
        <Button key="d-settings" dimColor onPress={() => toggle('settings')}>
          {panel === 'settings' ? '⚙️ Hide settings' : '⚙️ Settings'}
        </Button>
      </Box>

      {panel === 'stats' && (
        <Box flexDirection="column" borderStyle="round" padding="lg" gap="sm">
          <Text bold>7-Day Habit Tracker</Text>
          <Box flexDirection="row" flexWrap="wrap" gap="md">
            <Text>
              <Text dimColor>Avg water </Text>
              <Text bold>{avgMl === null ? '—' : `${avgMl} ml`}</Text>
            </Text>
            <Text>
              <Text dimColor>Days logged </Text>
              <Text bold>{recorded.length} / 7</Text>
            </Text>
          </Box>
          {/* header */}
          <Box flexDirection="row" gap="sm">
            <Box width="22%" minWidth={0}><Text dimColor wrap="wrap">Day</Text></Box>
            <Box width="36%" minWidth={0}><Text dimColor wrap="wrap">💧 Water</Text></Box>
            <Box width="14%" minWidth={0} justifyContent="flex-end"><Text dimColor>🚻</Text></Box>
            <Box width="14%" minWidth={0} justifyContent="flex-end"><Text dimColor>👀</Text></Box>
            <Box width="14%" minWidth={0} justifyContent="flex-end"><Text dimColor>🧍</Text></Box>
          </Box>
          {week.map(({ k, v }) => (
            <Box key={'w-' + k} flexDirection="row" gap="sm" alignItems="center">
              <Box width="22%" minWidth={0}>
                <Text wrap="wrap" bold={k === dayKey(now)}>{dayLabel(k)}</Text>
              </Box>
              <Box width="36%" minWidth={0} flexDirection="column">
                {v === null ? (
                  <Text dimColor>No record</Text>
                ) : (
                  <>
                    <Text tabular wrap="wrap">{v.ml} ml</Text>
                    {miniBar(v.ml)}
                  </>
                )}
              </Box>
              <Box width="14%" minWidth={0} justifyContent="flex-end">
                <Text tabular dimColor={v === null}>{v === null ? '—' : v.toilet.length}</Text>
              </Box>
              <Box width="14%" minWidth={0} justifyContent="flex-end">
                <Text tabular dimColor={v === null}>{v === null ? '—' : v.eyes}</Text>
              </Box>
              <Box width="14%" minWidth={0} justifyContent="flex-end">
                <Text tabular dimColor={v === null}>{v === null ? '—' : v.stands}</Text>
              </Box>
            </Box>
          ))}
          <Text dimColor wrap="wrap">— = no record that day · 0 = logged, none counted · {Object.keys(hist).length} days kept in total</Text>
        </Box>
      )}

      {panel === 'settings' && (
        <Box flexDirection="column" gap={1}>
          {(
            [
              ['water', '💧 Water', s.waterMin],
              ['eyes', '👀 Eye rest', s.eyesMin],
              ['sit', '🧍 Stand up', s.sitMin],
            ] as const
          ).map(([k, name, min]) => (
            <Box key={'set-' + k} flexDirection="row" gap={1}>
              <Text>
                {name} every {min} min
              </Text>
              <Button key={'set-' + k + '-dn'} dimColor onPress={async () => { await saveSettings($, x => ({ ...x, [`${k}Min`]: Math.max(5, min - 5) })); await resetTimer($, k) }}>
                −5
              </Button>
              <Button key={'set-' + k + '-up'} dimColor onPress={async () => { await saveSettings($, x => ({ ...x, [`${k}Min`]: Math.min(240, min + 5) })); await resetTimer($, k) }}>
                +5
              </Button>
            </Box>
          ))}
          <Box flexDirection="row" gap={1}>
            <Text>Daily goal {s.goalMl} ml</Text>
            <Button key="set-goal-dn" dimColor onPress={() => saveSettings($, x => ({ ...x, goalMl: Math.max(500, x.goalMl - 250) }))}>
              −250
            </Button>
            <Button key="set-goal-up" dimColor onPress={() => saveSettings($, x => ({ ...x, goalMl: x.goalMl + 250 }))}>
              +250
            </Button>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text>One cup {s.cupMl} ml</Text>
            <Button key="set-cup-dn" dimColor onPress={() => saveSettings($, x => ({ ...x, cupMl: Math.max(50, x.cupMl - 50) }))}>
              −50
            </Button>
            <Button key="set-cup-up" dimColor onPress={() => saveSettings($, x => ({ ...x, cupMl: x.cupMl + 50 }))}>
              +50
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  )
}
