import { AREA_NODE, NODES, routeBetween } from './jun-route'
import type { Area, Pt } from './jun-route'
import { CAST_STYLE, jun } from './studio-cast'

// 俊俊 as a state machine, not a looping film:
//   resting (30-90s) → when the rest is over, maybe walking → arrived (a moment: wave,
//   watch, peek, look about) → resting again where he is.
// Each stretch has its own small picture. A resting picture never changes while he rests,
// so nothing restarts it. A walking picture runs once, timed by the real clock, so a redraw
// mid-walk finds him where he is. The next stretch is decided only when one ends; the pane
// is asked to redraw at that moment, once.

type Pose = 'stand' | 'sit' | 'sleep' | 'wave' | 'watch' | 'stretch' | 'boo' | 'look' | 'play'
type Seg =
  | { kind: 'rest' | 'act'; start: number; secs: number; at: Pt; face: 1 | -1; pose: Pose; id: number }
  | { kind: 'walk'; start: number; secs: number; route: Pt[]; lens: number[]; face: 1 | -1; then: Pose; id: number }

const WALK = 20 // px per second, an easy stroll
const SPOTS: Record<string, Pose> = { win2: 'sit', win3: 'sit', shelf: 'sit', lamp: 'sit', nap: 'sleep' }

let seg: Seg | null = null
let segId = 0
const cache = new Map<number, string>()

function rnd(): number {
  return Math.random()
}

function restAt(at: Pt, face: 1 | -1, start: number): Seg {
  const name = Object.entries(NODES).find(([, p]) => p[0] === at[0] && p[1] === at[1])?.[0] ?? ''
  const pose: Pose = SPOTS[name] ?? (rnd() < 0.5 ? 'stand' : 'look')
  return { kind: 'rest', start, secs: 30 + rnd() * 60, at, face, pose, id: ++segId }
}

function walkTo(from: Pt, to: Pt, start: number, then: Pose): Seg {
  const route = routeBetween(from, to)
  const lens = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i]![0], p[1] - route[i]![1]))
  const dist = lens.reduce((a, b) => a + b, 0)
  return { kind: 'walk', start, secs: Math.max(1, dist / WALK + 0.6), route, lens, face: to[0] >= from[0] ? 1 : -1, then, id: ++segId }
}

/** What comes after `s`, decided only now that it has ended. */
function after(s: Seg, end: number, areas: readonly Area[]): Seg {
  if (s.kind === 'walk') {
    const at = s.route[s.route.length - 1]!
    return { kind: 'act', start: end, secs: s.then === 'boo' ? 2.2 : 12 + rnd() * 18, at, face: s.face, pose: s.then, id: ++segId }
  }
  if (s.kind === 'act') return restAt(s.at, s.face, end)
  // a rest is over: sometimes just stretch or look about where he is, else go somewhere
  const r = rnd()
  if (r < 0.12) return { kind: 'act', start: end, secs: 6, at: s.at, face: s.face, pose: rnd() < 0.5 ? 'stretch' : 'play', id: ++segId }
  if (r < 0.16) return restAt(s.at, s.face === 1 ? -1 : 1, end) // turns round and settles again
  // pick a destination
  const roll = rnd()
  let node: string
  let then: Pose
  if (areas.length > 0 && roll < 0.45) {
    node = AREA_NODE[areas[Math.floor(rnd() * areas.length)]!]
    then = rnd() < 0.2 ? 'boo' : rnd() < 0.5 ? 'wave' : 'watch'
  } else if (roll < 0.7) {
    node = ['win2', 'win3', 'shelf', 'lamp', 'nap'][Math.floor(rnd() * 5)]!
    then = 'look'
  } else {
    const names = Object.keys(NODES)
    node = names[Math.floor(rnd() * names.length)]!
    then = 'look'
  }
  const to = NODES[node]!
  if (to[0] === s.at[0] && to[1] === s.at[1]) return restAt(s.at, s.face, end)
  return walkTo(s.at, to, end, then)
}

/** Brings 俊俊 up to `now`, stepping through any stretches that ended meanwhile. */
export function junAt(now: number, areas: readonly Area[]): Seg {
  if (!seg) seg = restAt(NODES['win2']!, 1, now)
  let guard = 0
  while (now >= seg.start + seg.secs * 1000 && guard++ < 500) {
    const end = seg.start + seg.secs * 1000
    cache.delete(seg.id)
    seg = after(seg, end, areas)
  }
  return seg
}

/** When the current stretch ends (the pane redraws once then). */
export function junNextChange(): number | null {
  return seg ? seg.start + seg.secs * 1000 : null
}

const OPEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" width="1500" height="950" preserveAspectRatio="xMidYMid meet">`

// Constant classes for a still pose; small life (blinks, glances) loops on its own.
function poseCss(at: Pt, face: 1 | -1, pose: Pose): string {
  const on = (c: string, yes: boolean) => `.${c}{opacity:${yes ? 1 : 0}}`
  const shut = pose === 'sleep'
  const arms = pose === 'wave' ? 'wave' : pose === 'stretch' ? 'up' : pose === 'boo' ? 'boo' : 'down'
  return `
.junPos{transform:translate(${at[0]}px,${at[1]}px)}
.junFace{transform-box:fill-box;transform-origin:center;transform:scaleX(${face})${pose === 'look' ? ';animation:glance 9s steps(1) infinite' : ''}}
.junSit{transform:translateY(${pose === 'sit' || pose === 'sleep' ? 3 : 0}px)}
.junSpin{transform-box:fill-box;transform-origin:50% 60%${pose === 'play' ? ';animation:spinOnce 4s ease-in-out 1 both' : ''}}
.junJump{${pose === 'boo' ? 'animation:booJump 2.2s ease-out 1 both' : ''}}
.junCrouch{}
.junStep{${pose === 'stand' || pose === 'look' || pose === 'watch' ? 'animation:breathe 4.5s ease-in-out infinite' : ''}}
${on('junDown', arms === 'down')}${on('junWave', arms === 'wave')}${on('junUp', arms === 'up')}${on('junBoo', arms === 'boo')}
.junWaveArm{transform-box:fill-box;transform-origin:0% 100%;animation:waveArm .45s ease-in-out infinite alternate}
${shut ? on('junOpen', false) + on('junShut', true) : '.junOpen{animation:blinkOpen 5.3s steps(1) infinite}.junShut{opacity:0;animation:blinkShut 5.3s steps(1) infinite}'}
${on('junZz', shut)}.junZz{${shut ? 'animation:zz 3s ease-in-out infinite' : ''}}
@keyframes glance{0%{transform:scaleX(${face})}45%{transform:scaleX(${-face})}60%{transform:scaleX(${face})}}
@keyframes spinOnce{0%,20%{transform:rotate(0deg)}70%{transform:rotate(360deg)}100%{transform:rotate(360deg)}}
@keyframes booJump{0%{transform:translateY(0)}25%{transform:translateY(-7px)}55%,100%{transform:translateY(0)}}
@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8px)}}
@keyframes waveArm{from{transform:rotate(-12deg)}to{transform:rotate(16deg)}}
@keyframes blinkOpen{0%{opacity:1}96%{opacity:0}99%{opacity:1}}
@keyframes blinkShut{0%{opacity:0}96%{opacity:1}99%{opacity:0}}
@keyframes zz{0%,100%{opacity:1}50%{opacity:.3}}`
}

/** 俊俊's picture for this stretch. Still stretches keep the same text; a walk is clock-timed. */
export function junPicture(s: Seg, now: number): string {
  if (s.kind !== 'walk') {
    const have = cache.get(s.id)
    if (have) return have
    const svg = `${OPEN}<style>${CAST_STYLE}${poseCss(s.at, s.face, s.pose)}</style>${jun()}</svg>`
    cache.set(s.id, svg)
    return svg
  }
  // walking: stand up, stroll the route once, and at the very end ease down if he will sit
  const frames: string[] = [`0%{transform:translate(${s.route[0]![0]}px,${s.route[0]![1]}px)}`]
  const faces: string[] = []
  let acc = 0
  let lastFace = 0
  s.route.slice(1).forEach((p, i) => {
    const a = s.route[i]!
    const t0 = 0.6 + acc / WALK
    acc += s.lens[i]!
    const f = p[0] === a[0] ? lastFace || s.face : p[0] > a[0] ? 1 : -1
    if (f !== lastFace) faces.push(`${((t0 / s.secs) * 100).toFixed(2)}%{transform:scaleX(${f})}`)
    lastFace = f
    frames.push(`${(((0.6 + acc / WALK) / s.secs) * 100).toFixed(2)}%{transform:translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)}`)
  })
  frames.splice(1, 0, `${((0.6 / s.secs) * 100).toFixed(2)}%{transform:translate(${s.route[0]![0]}px,${s.route[0]![1]}px)}`)
  const firstFace = faces.length > 0 ? faces[0]!.match(/scaleX\((-?1)\)/)![1] : String(s.face)
  const delay = `animation-delay:-${Math.max(0, (now - s.start) / 1000).toFixed(2)}s`
  const T = `${s.secs.toFixed(2)}s`
  const css = `
.junPos{transform:translate(${s.route[0]![0]}px,${s.route[0]![1]}px);animation:jp ${T} linear 1 both;${delay}}
.junFace{transform-box:fill-box;transform-origin:center;transform:scaleX(${firstFace});animation:jf ${T} steps(1) 1 both;${delay}}
.junStep{animation:step .5s ease-in-out infinite}
.junSit{} .junSpin{} .junJump{} .junCrouch{}
.junDown{opacity:1}.junWave,.junUp,.junBoo,.junShut,.junZz{opacity:0}.junOpen{opacity:1}
@keyframes jp{${frames.join('')}}
@keyframes jf{0%{transform:scaleX(${firstFace})}${faces.join('')}}
@keyframes step{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}`
  return `${OPEN}<style>${CAST_STYLE}${css}</style>${jun()}</svg>`
}
