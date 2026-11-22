// 俊俊's own day: a fresh, random trip through the office aisles.
// The aisles are a small map of walkway points; he only walks along its edges,
// so he never cuts through desks, the sofas or the rope. Each trip visits a few
// random Yodas (waving or watching them work) and throws in a spin, a dash, a
// doze or a stretch, then comes back to where it began so it loops smoothly.
// The trip is turned into CSS keyframes; the page only builds a new trip when
// the tasks change, and the new one starts from wherever he is standing.

export type Pt = readonly [number, number]

// The whole room as walkway points, each placed clear of the desks, sofas, shelf,
// lamp, mailbox and plants; he only ever walks straight between linked points.
export const NODES: Record<string, Pt> = {
  nap: [60, 178], // by the plant, bottom left: his napping spot
  bl: [98, 176],
  bm: [154, 176],
  br: [211, 176],
  wl1: [98, 118], // beside the waiting corner
  wl2: [98, 150],
  tl: [98, 84],
  tm: [154, 84],
  tr: [211, 84],
  wn: [154, 62], // under the big window
  win2: [126, 62],
  win3: [186, 62],
  wr: [211, 62],
  d1: [154, 100], // between the front desks
  d2: [154, 146], // between the back desks
  r1: [211, 124], // at the rope, by the pink sofa
  rm: [211, 146],
  r2: [211, 164], // at the rope, by the mint sofa
  gate: [211, 90], // the gap in the rope
  shelf: [240, 90], // in front of the bookshelf
  lamp: [266, 90], // by the reading lamp
}

const EDGES: ReadonlyArray<readonly [string, string]> = [
  ['nap', 'bl'], ['bl', 'bm'], ['bm', 'br'],
  ['bl', 'wl2'], ['wl2', 'wl1'], ['wl1', 'tl'], ['tl', 'tm'], ['tm', 'tr'],
  ['tm', 'wn'], ['wn', 'win2'], ['wn', 'win3'], ['win3', 'wr'], ['wr', 'tr'],
  ['tm', 'd1'], ['d1', 'd2'], ['d2', 'bm'],
  ['tr', 'gate'], ['gate', 'r1'], ['r1', 'rm'], ['rm', 'r2'], ['r2', 'br'],
  ['gate', 'shelf'], ['shelf', 'lamp'],
]

const NEIGHBOURS: Record<string, string[]> = {}
for (const [a, b] of EDGES) {
  ;(NEIGHBOURS[a] ??= []).push(b)
  ;(NEIGHBOURS[b] ??= []).push(a)
}

/** The walkway spot from which a Yoda in each part of the room is visited. */
export type Area = 'waiting1' | 'waiting2' | 'desk1' | 'desk2' | 'rest1' | 'rest2'
export const AREA_NODE: Record<Area, string> = {
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

type Act = 'walk' | 'run' | 'tiptoe' | 'boo' | 'wave' | 'watch' | 'spin' | 'sleep' | 'stretch' | 'pause' | 'sit' | 'play'
/** One piece of the trip: from t0 to t1 seconds he goes from a to b (or stays) doing `act`. */
export type Leg = { t0: number; t1: number; a: Pt; b: Pt; act: Act; face: 1 | -1 }
export type Trip = { legs: Leg[]; total: number }

const WALK = 26 // px per second
const RUN = 70
const TIPTOE = 11

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
    for (const n of path(nearest(at), node)) move(NODES[n]!, speed, speed === RUN ? 'run' : speed === TIPTOE ? 'tiptoe' : 'walk')
  }

  // first step onto the walkway
  move(NODES[nearest(at)]!, WALK, 'walk')
  // a long, loose day: each time he picks somewhere to go and something to do there
  const look = () => {
    // looking about: turn one way, then the other
    const n = 2 + Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) {
      face = face === 1 ? -1 : 1
      stay(0.9 + rnd() * 1.4, 'pause')
    }
  }
  const spots = Object.keys(NODES)
  // His rhythm: mostly quiet (sitting, gazing, dozing for a good while), with an
  // occasional outing between. An outing is one or two things, then he settles again.
  const settle = () => {
    const r = rnd()
    if (r < 0.3) {
      walkTo(rnd() < 0.5 ? 'win2' : 'win3')
      stay(25 + rnd() * 45, 'sit') // on the sill, watching the sky
    } else if (r < 0.5) {
      walkTo(rnd() < 0.6 ? 'lamp' : 'shelf')
      stay(30 + rnd() * 50, 'sit') // reading under the lamp
    } else if (r < 0.72) {
      walkTo('nap')
      stay(40 + rnd() * 60, 'sleep') // a proper nap
      stay(3, 'stretch')
    } else {
      stay(20 + rnd() * 30, 'watch') // just standing about, daydreaming
      look()
    }
  }
  const outing = () => {
    const roll = rnd()
    if (areas.length > 0 && roll < 0.14) {
      // mischief: tiptoe up to a Yoda, then jump out with a "!"
      const area = areas[Math.floor(rnd() * areas.length)]!
      walkTo(AREA_NODE[area])
      const spot = NODES[AREA_NODE[area]]!
      move([spot[0] + (rnd() < 0.5 ? -8 : 8), spot[1]], TIPTOE, 'tiptoe')
      stay(1.6, 'boo')
      stay(1, 'pause')
      walkTo(rnd() < 0.5 ? 'bm' : 'tm', RUN)
    } else if (areas.length > 0 && roll < 0.55) {
      // pay a Yoda a visit: say hello, or watch her work for a while
      const area = areas[Math.floor(rnd() * areas.length)]!
      walkTo(AREA_NODE[area])
      face = area === 'rest1' || area === 'rest2' ? 1 : area === 'desk1' || area === 'desk2' ? (rnd() < 0.5 ? 1 : -1) : -1
      stay(0.8, 'pause')
      stay(6 + rnd() * 10, rnd() < 0.4 ? 'wave' : 'watch')
    } else if (roll < 0.8) {
      // explore a corner and look about
      walkTo(spots[Math.floor(rnd() * spots.length)]!)
      look()
    } else if (roll < 0.9) {
      stay(2.4, rnd() < 0.5 ? 'spin' : 'play')
    } else {
      stay(3, 'stretch')
    }
    stay(2 + rnd() * 4, 'pause')
  }
  const rounds = 8 + Math.floor(rnd() * 5)
  for (let i = 0; i < rounds; i++) {
    settle()
    const n = 1 + Math.floor(rnd() * 2)
    for (let k = 0; k < n; k++) outing()
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
  const sat = [...sleep, ...spans('sit')].sort((x, y) => x[0] - y[0])
  const play = spans('play')
  const stretch = spans('stretch')
  const boo = spans('boo')
  const tiptoe = spans('tiptoe')
  const busyArms = [...wave, ...stretch, ...boo].sort((x, y) => x[0] - y[0])
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
.junBoo{opacity:0;animation:junBoo ${T} steps(1) infinite}
.junJump{animation:junJump ${T} linear infinite}
.junCrouch{animation:junCrouch ${T} steps(1) infinite}
@keyframes junPos{${pos.join('')}}
@keyframes junFace{${faces.join('')}}
@keyframes junSpin{${spinFrames.join('')}}
@keyframes junStep{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes junWaveArm{from{transform:rotate(-12deg)}to{transform:rotate(16deg)}}
${windows('junSit', 'transform', 'translateY(3px)', 'translateY(0)', sat, total)}
${windows('junWave', 'opacity', '1', '0', wave, total)}
${windows('junDown', 'opacity', '0', '1', busyArms, total)}
${windows('junUp', 'opacity', '1', '0', stretch, total)}
${windows('junOpen', 'opacity', '0', '1', sleep, total)}
${windows('junShut', 'opacity', '1', '0', sleep, total)}
${windows('junZz', 'opacity', '1', '0', sleep, total)}
${windows('junBoo', 'opacity', '1', '0', boo, total)}
${windows('junCrouch', 'transform', 'translateY(2.5px) scaleY(.94)', 'translateY(0) scaleY(1)', tiptoe, total)}
@keyframes junJump{0%{transform:translateY(0)}${[...boo, ...play].sort((x, y) => x[0] - y[0]).map(([a, b]) => `${pc(a, total)}{transform:translateY(0)}${pc(a + (b - a) * 0.3, total)}{transform:translateY(-7px)}${pc(a + (b - a) * 0.6, total)}{transform:translateY(0)}`).join('')}100%{transform:translateY(0)}}`
}

/** A walkway route between two points (for a Yoda walking to her new seat). */
export function routeBetween(from: Pt, to: Pt): Pt[] {
  const names = path(nearest(from), nearest(to))
  return [from, ...names.map(n => NODES[n]!), to]
}
