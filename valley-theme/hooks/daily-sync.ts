import type { EngineInterface } from 'claude-code'

import type { DailyDay, DailySettings } from '../types'

// Yoda's Daily across Macs, through iCloud Drive (no account, no Claude usage):
//   iCloud Drive/Yoda/daily-<this Mac>.json   this Mac's own log; only this Mac writes it
//   iCloud Drive/Yoda/settings.json           shared settings, the latest change wins
// Every drink, restroom visit, eye rest and stand-up is one event with its own id,
// so two Macs logging at once never overwrite each other: each day is counted from
// the events of every Mac's file. Where iCloud Drive is missing, this Mac's local
// store keeps working as before.

export type DailyEvent = { id: string; at: number; day: string; kind: 'water' | 'toilet' | 'eyes' | 'stand'; ml?: number }
type DeviceLog = { device: string; events: DailyEvent[]; legacy: Record<string, DailyDay> }

const DEVICE_KEY = 'daily-device-id'
const EMPTY: DailyDay = { ml: 0, cups: 0, toilet: [], eyes: 0, stands: 0 }

function homeOf($: EngineInterface): string {
  const root = $.plugin.root
  const i = root.indexOf('/.claude/')
  return i > 0 ? root.slice(0, i) : ''
}

/** The shared folder, or '' where iCloud Drive is not on this Mac. */
export async function syncDir($: EngineInterface): Promise<string> {
  const home = homeOf($)
  if (home === '') return ''
  const icloud = `${home}/Library/Mobile Documents/com~apple~CloudDocs`
  try {
    const st = await $.fs.stat(icloud)
    return st.kind === 'dir' ? `${icloud}/Yoda` : ''
  } catch {
    return ''
  }
}

/** This Mac's own id, kept in its local store (never synced). */
async function deviceId($: EngineInterface): Promise<string> {
  const have = await $.store.get(DEVICE_KEY)
  if (typeof have === 'string' && have !== '') return have
  const id = 'mac-' + Math.random().toString(36).slice(2, 8)
  await $.store.set(DEVICE_KEY, id)
  return id
}

async function readJson<T>($: EngineInterface, path: string): Promise<T | null> {
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

async function ownLog($: EngineInterface, dir: string): Promise<{ path: string; log: DeviceLog }> {
  const device = await deviceId($)
  const path = `${dir}/daily-${device}.json`
  const log = (await readJson<DeviceLog>($, path)) ?? { device, events: [], legacy: {} }
  return { path, log }
}

/**
 * Moves this Mac's existing history into its own log once, as `legacy` days, so
 * nothing recorded before syncing is lost or counted twice.
 */
export async function migrateOnce($: EngineInterface, localHistory: Record<string, DailyDay>) {
  const dir = await syncDir($)
  if (dir === '') return
  const { path, log } = await ownLog($, dir)
  if (Object.keys(log.legacy).length > 0 || log.events.length > 0) return
  if (Object.keys(localHistory).length === 0) return
  await $.fs.write(path, JSON.stringify({ ...log, legacy: localHistory }))
}

/** Logs one event in this Mac's file. Returns false where there is no shared folder. */
export async function addEvent($: EngineInterface, ev: Omit<DailyEvent, 'id'>): Promise<boolean> {
  const dir = await syncDir($)
  if (dir === '') return false
  const { path, log } = await ownLog($, dir)
  log.events.push({ ...ev, id: `${log.device}-${ev.at}-${Math.random().toString(36).slice(2, 6)}` })
  // keep about two months of events
  const cutoff = ev.at - 62 * 86400000
  log.events = log.events.filter(e => e.at >= cutoff)
  await $.fs.write(path, JSON.stringify(log))
  return true
}

/** Every Mac's days, merged: legacy days plus each day's events. Null where there is no shared folder. */
export async function mergedHistory($: EngineInterface): Promise<Record<string, DailyDay> | null> {
  const dir = await syncDir($)
  if (dir === '') return null
  let names: string[] = []
  try {
    names = (await $.fs.list(dir)).filter(f => f.kind === 'file' && /^daily-.+\.json$/.test(f.name)).map(f => f.name)
  } catch {
    names = []
  }
  const out: Record<string, DailyDay> = {}
  const day = (k: string) => (out[k] ??= { ...EMPTY, toilet: [] })
  for (const name of names) {
    const log = await readJson<DeviceLog>($, `${dir}/${name}`)
    if (!log) continue
    for (const [k, v] of Object.entries(log.legacy ?? {})) {
      const d = day(k)
      d.ml += v.ml
      d.cups += v.cups
      d.toilet.push(...v.toilet)
      d.eyes += v.eyes
      d.stands += v.stands
    }
    for (const e of log.events ?? []) {
      const d = day(e.day)
      if (e.kind === 'water') {
        d.ml += e.ml ?? 0
        d.cups += 1
      } else if (e.kind === 'toilet') d.toilet.push(e.at)
      else if (e.kind === 'eyes') d.eyes += 1
      else d.stands += 1
    }
  }
  for (const d of Object.values(out)) d.toilet.sort((a, b) => a - b)
  return out
}

type SharedSettings = { updatedAt: number; settings: DailySettings }

export async function readSharedSettings($: EngineInterface): Promise<SharedSettings | null> {
  const dir = await syncDir($)
  return dir === '' ? null : readJson<SharedSettings>($, `${dir}/settings.json`)
}

export async function writeSharedSettings($: EngineInterface, settings: DailySettings, at: number) {
  const dir = await syncDir($)
  if (dir === '') return
  await $.fs.write(`${dir}/settings.json`, JSON.stringify({ updatedAt: at, settings }))
}
