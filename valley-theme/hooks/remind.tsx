import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

import type { AiScene, RemindState } from '../types'
import { makeAiScene } from './aiscene'
import { aiSceneSvg, friendsSvg, SCENE_COUNT, sceneCaption } from './friends'

const SETTINGS_KEY = 'remind-settings'
const MINUTE = 60000
const SNOOZE_MIN = 10

const DEFAULTS = { waterMin: 45, eyesMin: 20 }

const remindAtom = atom({ plugin: 'valley-theme', key: 'remind' } as const, null as RemindState | null, {
  shape: 'remind-1',
})

// Which little scene the pane shows; changed at random.
const sceneAtom = atom({ plugin: 'valley-theme', key: 'scene' } as const, 0)
const SCENE_EVERY_MIN = 15
let sceneSince = 0

const aiSceneAtom = atom({ plugin: 'valley-theme', key: 'aiScene' } as const, null as AiScene | null, {
  shape: 'ai-scene-1',
})
const sceneBusyAtom = atom({ plugin: 'valley-theme', key: 'sceneBusy' } as const, false)
const recent: string[] = []

// A fixed scene, for when the model can't answer.
async function fallbackScene($: EngineInterface) {
  await update($, aiSceneAtom, () => null)
  await update($, sceneAtom, cur => {
    const step = 1 + Math.floor(Math.random() * (SCENE_COUNT - 1))
    return (cur + step) % SCENE_COUNT
  })
}

// Asks the model for a brand-new scene; keeps the current one while it thinks.
async function shuffleScene($: EngineInterface) {
  if (await read($, sceneBusyAtom)) return
  sceneSince = await $.clock.now()
  await update($, sceneBusyAtom, () => true)
  try {
    const made = await makeAiScene($, recent.slice(-6))
    if (made) {
      recent.push(made.caption)
      await update($, aiSceneAtom, () => made)
    } else {
      await fallbackScene($)
    }
  } catch (error) {
    $.ui.log('scene: ' + String(error))
    await fallbackScene($)
  }
  await update($, sceneBusyAtom, () => false)
}

const WATER_LINES = ['俊俊：咕嚕咕嚕～該喝口水囉 💧', '俊俊：玩了好久，喝一杯吧 💧', '俊俊：喝水時間到了，小口小口慢慢喝 💧']
const EYES_LINES = [
  '瑩瑩：看看遠方 20 秒，讓眼睛休息一下 👀',
  '瑩瑩：閉上眼睛數到 20，再眨眨眼 🌿',
  '瑩瑩：抬頭看看窗外的綠色吧 🌳',
]

function pick(lines: readonly string[], seed: number): string {
  return lines[Math.abs(seed) % lines.length] ?? lines[0] ?? ''
}

function todayKey(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

async function loadSettings($: EngineInterface) {
  const raw = (await $.store.get(SETTINGS_KEY)) as Partial<typeof DEFAULTS> | undefined
  return {
    waterMin: typeof raw?.waterMin === 'number' ? raw.waterMin : DEFAULTS.waterMin,
    eyesMin: typeof raw?.eyesMin === 'number' ? raw.eyesMin : DEFAULTS.eyesMin,
  }
}

async function current($: EngineInterface): Promise<RemindState> {
  const now = await $.clock.now()
  const have = await read($, remindAtom)
  if (have !== null) return have
  const s = await loadSettings($)
  return { ...s, waterAt: now, eyesAt: now, active: null, isPaused: false, cups: 0, day: todayKey(now), line: 0 }
}

async function patch($: EngineInterface, fn: (r: RemindState) => RemindState) {
  const base = await current($)
  await update($, remindAtom, () => fn(base))
}

async function fire($: EngineInterface, kind: 'water' | 'eyes', r: RemindState) {
  const line = pick(kind === 'water' ? WATER_LINES : EYES_LINES, r.line)
  $.ui.toast(line, { timeoutMs: 8000 })
  void $.ui.notify(line, { title: kind === 'water' ? '💧 喝水提醒' : '👀 休息眼睛' }).catch(() => undefined)
}

// Once a minute: is either friend due?
async function tick($: EngineInterface) {
  const r = await current($)
  const now = await $.clock.now()
  let next = r.day === todayKey(now) ? r : { ...r, cups: 0, day: todayKey(now) }
  if (!next.isPaused && next.active === null) {
    if (now - next.waterAt >= next.waterMin * MINUTE) {
      next = { ...next, active: 'water', line: next.line + 1 }
      await fire($, 'water', next)
    } else if (now - next.eyesAt >= next.eyesMin * MINUTE) {
      next = { ...next, active: 'eyes', line: next.line + 1 }
      await fire($, 'eyes', next)
    }
  }
  if (next !== r) await update($, remindAtom, () => next)
  if (now - sceneSince >= SCENE_EVERY_MIN * MINUTE) void shuffleScene($)
}

async function done($: EngineInterface, kind: 'water' | 'eyes') {
  const now = await $.clock.now()
  await patch($, r =>
    kind === 'water'
      ? { ...r, waterAt: now, active: r.active === 'water' ? null : r.active, cups: r.cups + 1 }
      : { ...r, eyesAt: now, active: r.active === 'eyes' ? null : r.active },
  )
  void shuffleScene($)
}

async function snooze($: EngineInterface) {
  const now = await $.clock.now()
  await patch($, r => {
    if (r.active === 'water') return { ...r, active: null, waterAt: now - (r.waterMin - SNOOZE_MIN) * MINUTE }
    if (r.active === 'eyes') return { ...r, active: null, eyesAt: now - (r.eyesMin - SNOOZE_MIN) * MINUTE }
    return r
  })
}

function minutesLeft(at: number, every: number, now: number): number {
  return Math.max(0, Math.ceil((at + every * MINUTE - now) / MINUTE))
}

// Called from the mod's one session.start hook.
export async function startRemind($: EngineInterface) {
  await $.command.register({
    name: 'remind',
    description: '喝水 / 休息眼睛提醒：/remind water 45 | eyes 20 | pause | resume | status',
  })
  // Keeps the running timers across a reload; starts them fresh in a new session.
  const r = await current($)
  await update($, remindAtom, () => r)
  await update($, sceneBusyAtom, () => false)
  sceneSince = await $.clock.now()
  if ((await read($, aiSceneAtom)) === null) void shuffleScene($)
  $.clock.every(MINUTE, () => void tick($).catch(error => $.ui.log('remind: ' + String(error))))
}

export function registerRemind(on: On) {
  on('command.run', { command: 'remind' }, async ($, e) => {
    const [word = 'status', num] = (e.args ?? '').trim().split(/\s+/)
    const minutes = Number(num)
    if ((word === 'water' || word === 'eyes') && Number.isFinite(minutes) && minutes >= 5 && minutes <= 240) {
      const s = await loadSettings($)
      const saved = word === 'water' ? { ...s, waterMin: minutes } : { ...s, eyesMin: minutes }
      await $.store.set(SETTINGS_KEY, saved)
      await patch($, r => ({ ...r, ...saved }))
      return { text: `${word === 'water' ? '喝水' : '休息眼睛'}提醒改成每 ${minutes} 分鐘。` }
    }
    if (word === 'pause' || word === 'resume') {
      const now = await $.clock.now()
      await patch($, r => ({ ...r, isPaused: word === 'pause', active: null, waterAt: now, eyesAt: now }))
      return { text: word === 'pause' ? '提醒已暫停。' : '提醒已恢復，重新開始計時。' }
    }
    const r = await current($)
    const now = await $.clock.now()
    return {
      text:
        `喝水：每 ${r.waterMin} 分鐘（還有 ${minutesLeft(r.waterAt, r.waterMin, now)} 分）· 今天 ${r.cups} 杯\n` +
        `休息眼睛：每 ${r.eyesMin} 分鐘（還有 ${minutesLeft(r.eyesAt, r.eyesMin, now)} 分）\n` +
        (r.isPaused ? '目前暫停中。\n' : '') +
        '用法：/remind water 45 | eyes 20 | pause | resume（間隔 5–240 分鐘）',
    }
  })
}

export async function remindView($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const r = await current($)
  const now = await $.clock.now()
  const scene = await read($, sceneAtom)
  const ai = await read($, aiSceneAtom)
  const busy = await read($, sceneBusyAtom)
  const caption = ai ? ai.caption : sceneCaption(scene)

  const say = r.isPaused
    ? '俊俊和瑩瑩在打盹（提醒已暫停）💤'
    : r.active === 'water'
      ? pick(WATER_LINES, r.line)
      : r.active === 'eyes'
        ? pick(EYES_LINES, r.line)
        : caption

  let art = null
  if (e.surface === 'desktop' || e.surface === 'mobile') {
    const { Svg } = $.ui.resolve(e)
    art = <Svg source={ai ? aiSceneSvg(ai, r.active) : friendsSvg(scene, r.active)} alt={caption} />
  }

  if (e.props.placement === 'widget') {
    return <Text>{r.active ? say : `💧 ${minutesLeft(r.waterAt, r.waterMin, now)} 分 · 👀 ${minutesLeft(r.eyesAt, r.eyesMin, now)} 分`}</Text>
  }

  return (
    <Box flexDirection="column">
      {art}
      <Text bold={r.active !== null} color={r.active ? 'accent' : undefined}>
        {say}
      </Text>
      {r.active !== null && (
        <Box flexDirection="row" gap={1}>
          <Button key="remind-done" variant="primary" onPress={() => done($, r.active === 'water' ? 'water' : 'eyes')}>
            {r.active === 'water' ? '喝了 💧' : '休息好了 👀'}
          </Button>
          <Button key="remind-snooze" onPress={() => snooze($)}>
            {SNOOZE_MIN} 分鐘後再提醒
          </Button>
        </Box>
      )}
      {!r.isPaused && (
        <Text dimColor>
          下次喝水 {minutesLeft(r.waterAt, r.waterMin, now)} 分 · 休息眼睛 {minutesLeft(r.eyesAt, r.eyesMin, now)} 分 · 今天 {r.cups} 杯
        </Text>
      )}
      <Box flexDirection="row" gap={1}>
        <Button key="remind-water-now" dimColor onPress={() => done($, 'water')}>
          記一杯水
        </Button>
        <Button
          key="remind-pause"
          dimColor
          onPress={async () => {
            const t = await $.clock.now()
            await patch($, x => ({ ...x, isPaused: !x.isPaused, active: null, waterAt: t, eyesAt: t }))
          }}
        >
          {r.isPaused ? '恢復提醒' : '暫停提醒'}
        </Button>
        <Button key="remind-shuffle" dimColor onPress={() => shuffleScene($)}>
          {busy ? '🎨 正在想新場景…' : '換個場景 🎲'}
        </Button>
      </Box>
    </Box>
  )
}
