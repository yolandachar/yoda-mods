// 俊俊's own day: a fresh, random trip through the office aisles.
// The aisles are a small map of walkway points; he only walks along its edges,
// so he never cuts through desks, the sofas or the rope. Each trip visits a few
// random Yodas (waving or watching them work) and throws in a spin, a dash, a
// doze or a stretch, then comes back to where it began so it loops smoothly.
// The trip is turned into CSS keyframes; the page only builds a new trip when
// the tasks change, and the new one starts from wherever he is standing.

export type Pt = readonly [number, number]

const NODES: Record<string, Pt> = {
  nap: [60, 178], // by the plant, bottom left: his napping spot
  bl: [98, 176],
  bm: [154, 176],
  br: [211, 176],
  wl1: [98, 118], // beside the waiting corner
  wl2: [98, 150],
  tl: [98, 84],
  tm: [154, 84],
  tr: [211, 84],
  d1: [154, 100], // between the front desks
  d2: [154, 146], // between the back desks
  r1: [211, 124], // at the rope, by the pink sofa
  r2: [211, 164], // at the rope, by the mint sofa
}

const EDGES: ReadonlyArray<readonly [string, string]> = [
  ['nap', 'bl'], ['bl', 'bm'], ['bm', 'br'],
  ['bl', 'wl2'], ['wl2', 'wl1'], ['wl1', 'tl'], ['tl', 'tm'], ['tm', 'tr'],
  ['tm', 'd1'], ['d1', 'd2'], ['d2', 'bm'],
  ['tr', 'r1'], ['r1', 'r2'], ['r2', 'br'],
]

const NEIGHBOURS: Record<string, string[]> = {}
for (const [a, b] of EDGES) {
  ;(NEIGHBOURS[a] ??= []).push(b)
  ;(NEIGHBOURS[b] ??= []).push(a)
}

/** The walkway spot from which a Yoda in each part of the room is visited. */
export type Area = 'waiting1' | 'waiting2' | 'desk1' | 'desk2' | 'rest1' | 'rest2'
const AREA_NODE: Record<Area, string> = {
  waiting1: 'wl1', waiting2: 'wl2', desk1: 'd1', desk2: 'd2', rest1: 'r1', rest2: 'r2',
}

function path(from: string, to: string): string[] {
  const prev: Record<string, string> = {}
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const n = queue.shift()!
    if (n === to) break
    for (const m of NEIGHBOURS[n] ?? []) {
      if (!seen.has(m)) {
        seen.add(m)
        prev[m] = n
        queue.push(m)
      }
    }
  }
  const out = [to]
  while (out[0] !== from && prev[out[0]!]) out.unshift(prev[out[0]!]!)
  return out
}

function nearest(p: Pt): string {
  let best = 'bl'
  let bestD = Infinity
  for (const [k, q] of Object.entries(NODES)) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  return best
}

type Act = 'walk' | 'run' | 'wave' | 'watch' | 'spin' | 'sleep' | 'stretch' | 'pause'
/** One piece of the trip: from t0 to t1 seconds he goes from a to b (or stays) doing `act`. */
export type Leg = { t0: number; t1: number; a: Pt; b: Pt; act: Act; face: 1 | -1 }
export type Trip = { legs: Leg[]; total: number }

const WALK = 26 // px per second
const RUN = 70

/** Plans a trip from `start` that visits some of `areas` and comes back to `start`. */
export function planTrip(start: Pt, areas: readonly Area[], rnd: () => number): Trip {
  const legs: Leg[] = []
  let t = 0
  let at: Pt = start
  let face: 1 | -1 = 1
  const move = (to: Pt, speed: number, act: Act) => {
    const d = Math.hypot(to[0] - at[0], to[1] - at[1])
    if (d < 0.5) return
    if (to[0] !== at[0]) face = to[0] > at[0] ? 1 : -1
    const dt = d / speed
    legs.push({ t0: t, t1: t + dt, a: at, b: to, act, face })
    t += dt
    at = to
  }
  const stay = (secs: number, act: Act) => {
    legs.push({ t0: t, t1: t + secs, a: at, b: at, act, face })
    t += secs
  }
  const walkTo = (node: string, speed = WALK) => {
    for (const n of path(nearest(at), node)) move(NODES[n]!, speed, speed === RUN ? 'run' : 'walk')
  }

  // first step onto the walkway
  move(NODES[nearest(at)]!, WALK, 'walk')
  const visits = 4 + Math.floor(rnd() * 3)
  for (let i = 0; i < visits; i++) {
    const roll = rnd()
    if (areas.length > 0 && roll < 0.62) {
      // pay a Yoda a visit
      const area = areas[Math.floor(rnd() * areas.length)]!
      walkTo(AREA_NODE[area])
      // turn toward the Yoda: desks and the waiting corner are to his left, the sofas to his right
      face = area === 'rest1' || area === 'rest2' ? 1 : area === 'desk1' || area === 'desk2' ? (rnd() < 0.5 ? 1 : -1) : -1
      stay(1, 'pause')
      stay(2.5 + rnd() * 2, rnd() < 0.5 ? 'wave' : 'watch')
    } else if (roll < 0.74) {
      stay(2.4, 'spin')
    } else if (roll < 0.86) {
      // a sudden dash to the far side, then a doze
      walkTo(rnd() < 0.5 ? 'br' : 'nap', RUN)
      walkTo('nap')
      stay(7 + rnd() * 5, 'sleep')
      stay(3, 'stretch')
    } else {
      stay(3, 'stretch')
    }
    stay(0.6 + rnd() * 1.4, 'pause')
  }
  // home again, so the loop joins up
  walkTo(nearest(start))
  move(start, WALK, 'walk')
  stay(1, 'pause')
  return { legs, total: t }
}

/** Where he stands `secs` into the trip (it loops). */
export function positionAt(trip: Trip, secs: number): Pt {
  if (trip.total <= 0 || trip.legs.length === 0) return [100, 176]
  const s = ((secs % trip.total) + trip.total) % trip.total
  for (const l of trip.legs) {
    if (s <= l.t1) {
      const k = l.t1 > l.t0 ? (s - l.t0) / (l.t1 - l.t0) : 1
      return [l.a[0] + (l.b[0] - l.a[0]) * k, l.a[1] + (l.b[1] - l.a[1]) * k]
    }
  }
  const last = trip.legs[trip.legs.length - 1]!
  return last.b
}

const pc = (t: number, total: number) => `${((t / total) * 100).toFixed(3)}%`
const f1 = (n: number) => n.toFixed(1)

// on/off windows as stepped keyframes
function windows(name: string, prop: string, on: string, off: string, spans: Array<[number, number]>, total: number): string {
  const frames = [`0%{${prop}:${off}}`]
  for (const [a, b] of spans) frames.push(`${pc(a, total)}{${prop}:${on}}`, `${pc(b, total)}{${prop}:${off}}`)
  return `@keyframes ${name}{${frames.join('')}}`
}

/** The trip as CSS: position, facing, and when he waves, sleeps, spins or stretches. */
export function tripStyle(trip: Trip): string {
  const { legs, total } = trip
  const pos = [`0%{transform:translate(${f1(legs[0]!.a[0])}px,${f1(legs[0]!.a[1])}px)}`]
  for (const l of legs) pos.push(`${pc(l.t1, total)}{transform:translate(${f1(l.b[0])}px,${f1(l.b[1])}px)}`)
  const faces = legs.map(l => `${pc(l.t0, total)}{transform:scaleX(${l.face})}`)
  const spans = (act: Act) => legs.filter(l => l.act === act).map(l => [l.t0, l.t1] as [number, number])
  const wave = spans('wave')
  const sleep = spans('sleep')
  const stretch = spans('stretch')
  const busyArms = [...wave, ...stretch].sort((x, y) => x[0] - y[0])
  const spin = spans('spin')
  const spinFrames = ['0%{transform:rotate(0deg)}']
  for (const [a, b] of spin) spinFrames.push(`${pc(a, total)}{transform:rotate(0deg)}`, `${pc(b, total)}{transform:rotate(360deg)}`, `${pc(b + 0.01, total)}{transform:rotate(0deg)}`)
  const T = `${total.toFixed(1)}s`
  return `
.junPos{transform:translate(${f1(legs[0]!.a[0])}px,${f1(legs[0]!.a[1])}px);animation:junPos ${T} linear infinite}
.junFace{transform-box:fill-box;transform-origin:center;animation:junFace ${T} steps(1) infinite}
.junSpin{transform-box:fill-box;transform-origin:50% 60%;animation:junSpin ${T} linear infinite}
.junSit{animation:junSit ${T} steps(1) infinite}
.junStep{animation:junStep .5s ease-in-out infinite}
.junWave{opacity:0;animation:junWave ${T} steps(1) infinite}
.junWaveArm{transform-box:fill-box;transform-origin:0% 100%;animation:junWaveArm .45s ease-in-out infinite alternate}
.junDown{animation:junDown ${T} steps(1) infinite}
.junUp{opacity:0;animation:junUp ${T} steps(1) infinite}
.junOpen{animation:junOpen ${T} steps(1) infinite}
.junShut{opacity:0;animation:junShut ${T} steps(1) infinite}
.junZz{opacity:0;animation:junZz ${T} steps(1) infinite}
@keyframes junPos{${pos.join('')}}
@keyframes junFace{${faces.join('')}}
@keyframes junSpin{${spinFrames.join('')}}
@keyframes junStep{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes junWaveArm{from{transform:rotate(-12deg)}to{transform:rotate(16deg)}}
${windows('junSit', 'transform', 'translateY(3px)', 'translateY(0)', sleep, total)}
${windows('junWave', 'opacity', '1', '0', wave, total)}
${windows('junDown', 'opacity', '0', '1', busyArms, total)}
${windows('junUp', 'opacity', '1', '0', stretch, total)}
${windows('junOpen', 'opacity', '0', '1', sleep, total)}
${windows('junShut', 'opacity', '1', '0', sleep, total)}
${windows('junZz', 'opacity', '1', '0', sleep, total)}`
}
