// The cast of Yoda's Studio, in the office's 300 x 190 box.
// Yoda (瑩瑩's look: twin braids, cream top, light jeans): one per Claude task,
//   animated by that task's state alone.
// 俊俊 (glasses, white shirt, black shorts): only ever one, bound to no task,
//   wandering the office on a loose routine that starts somewhere new each redraw.

const INK = '#3b2a2a'
const SKIN_Y = '#fde3d4'
const SKIN_J = '#f6d5bf'

export type YodaState = 'working' | 'waiting' | 'completed' | 'idle' | 'error'

/** A stable small number from a task id, to vary pose and timing per Yoda. */
export function seedOf(id: string): number {
  let n = 0
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) >>> 0
  return n
}

function arm(x2: number, y2: number, side: -1 | 1, skin: string, cls = ''): string {
  const x1 = side * 6
  return `<g class="${cls}"><path d="M${x1} 4 L${x2} ${y2}" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M${x1} 4 L${x2} ${y2}" stroke="${skin}" stroke-width="1.5" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="1.7" fill="${skin}" stroke="${INK}" stroke-width=".8"/></g>`
}

const YODA_BACK = `<g fill="#5a3a2a" stroke="${INK}" stroke-width=".8"><circle cx="-10" cy="-2" r="2.6"/><circle cx="-10" cy="3" r="2.3"/><circle cx="10" cy="-2" r="2.6"/><circle cx="10" cy="3" r="2.3"/></g><rect x="-12" y="5" width="4" height="1.6" rx=".8" fill="#9fdcc8"/><rect x="8" y="5" width="4" height="1.6" rx=".8" fill="#9fdcc8"/>`
const YODA_BODY = `<path d="M-6 3 H6 L7 9 H-7 Z" fill="#fdf3e0" stroke="${INK}" stroke-width=".9"/><path d="M-6 9 H6 V12 H-6 Z" fill="#bcd7ef"/>`
const YODA_HEAD = `<circle cx="0" cy="-6" r="9.5" fill="${SKIN_Y}" stroke="${INK}" stroke-width="1.2"/>
<path d="M-10 -6 C-11 -16 -5 -18 0 -18 C5 -18 11 -16 10 -6 C7 -11 4 -12 0 -12 C-4 -12 -7 -11 -10 -6 Z" fill="#5a3a2a"/>
<ellipse cx="-6" cy="-2" rx="1.8" ry="1" fill="#f4b3bf"/><ellipse cx="6" cy="-2" rx="1.8" ry="1" fill="#f4b3bf"/>`

const EYES = {
  open: `<ellipse cx="-3.2" cy="-6" rx="1" ry="1.3" fill="${INK}"/><ellipse cx="3.2" cy="-6" rx="1" ry="1.3" fill="${INK}"/>`,
  up: `<ellipse cx="-3.2" cy="-7.2" rx="1" ry="1.3" fill="${INK}"/><ellipse cx="3.2" cy="-7.2" rx="1" ry="1.3" fill="${INK}"/>`,
  happy: `<path d="M-4.6 -5.4 q1.4 -1.8 2.8 0 M1.8 -5.4 q1.4 -1.8 2.8 0" stroke="${INK}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
  closed: `<path d="M-4.6 -6 q1.4 1.4 2.8 0 M1.8 -6 q1.4 1.4 2.8 0" stroke="${INK}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
  puzzled: `<ellipse cx="-3.2" cy="-6" rx="1" ry="1.3" fill="${INK}"/><path d="M2 -6 h2.6" stroke="${INK}" stroke-width="1" stroke-linecap="round"/><path d="M-5 -9.5 l2.6 .8 M2 -9.7 l2.6 -.6" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/>`,
}
const MOUTH = {
  smile: `<path d="M-1.5 -1.5 Q0 0 1.5 -1.5" stroke="${INK}" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
  open: `<ellipse cx="0" cy="-1.2" rx="1.4" ry="1.1" fill="#c9555f"/>`,
  wobbly: `<path d="M-2 -1 q1 -1 2 0 q1 1 2 0" stroke="${INK}" stroke-width=".8" fill="none" stroke-linecap="round"/>`,
  flat: `<path d="M-1.2 -1.2 H1.2" stroke="${INK}" stroke-width=".8" stroke-linecap="round"/>`,
}

const BUBBLE_WAIT = `<g class="pop"><rect x="8" y="-30" width="9" height="11" rx="2.5" fill="#e0574f" stroke="${INK}" stroke-width="1"/><path d="M12.5 -27.5 V-23" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/><circle cx="12.5" cy="-21" r="1" fill="#ffffff"/></g>`
const BUBBLE_ERROR = `<g class="pop"><rect x="8" y="-31" width="10" height="12" rx="2.5" fill="#f0a35e" stroke="${INK}" stroke-width="1"/><path d="M11 -27.5 q0 -2.4 2 -2.4 q2 0 2 2 q0 1.4 -2 2.2 v1.4" stroke="#ffffff" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="13" cy="-21.6" r=".8" fill="#ffffff"/></g>`
const BUBBLE_THINK = `<g><circle cx="9" cy="-17" r="1.2" fill="#ffffff" stroke="${INK}" stroke-width=".6"/><circle cx="12" cy="-21" r="1.8" fill="#ffffff" stroke="${INK}" stroke-width=".6"/><rect x="11" y="-33" width="16" height="9" rx="4.5" fill="#ffffff" stroke="${INK}" stroke-width=".8"/><g fill="${INK}"><circle class="dot1" cx="15" cy="-28.5" r=".9"/><circle class="dot2" cx="19" cy="-28.5" r=".9"/><circle class="dot3" cx="23" cy="-28.5" r=".9"/></g></g>`
const CONFETTI = `<g class="confetti"><rect x="-13" y="-24" width="2" height="2" fill="#f28da4" transform="rotate(20 -12 -23)"/><rect x="11" y="-26" width="2" height="2" fill="#9fdcc8" transform="rotate(-15 12 -25)"/><rect x="-4" y="-30" width="2" height="2" fill="#f2c84b"/><rect x="14" y="-16" width="1.6" height="1.6" fill="#bcd7ef"/><rect x="-16" y="-14" width="1.6" height="1.6" fill="#f2c84b"/></g>`
const MUG = `<g><rect x="6" y="2" width="5" height="5.5" rx="1" fill="#fffaf0" stroke="${INK}" stroke-width=".8"/><path d="M11 3.5 q2 0 2 1.6 q0 1.6 -2 1.6" stroke="${INK}" stroke-width=".7" fill="none"/><path class="steam" d="M7.5 0 q-1 -2 0 -4 M9.8 0 q-1 -2 0 -4" stroke="#b9a7a7" stroke-width=".7" fill="none" stroke-linecap="round"/></g>`
const ZZ = `<path class="zz" d="M9 -20 h4 l-4 4 h4" stroke="#8a7790" stroke-width="1.1" fill="none"/>`


// ---- one look per task in Yoda's Studio: each Yoda dresses differently ----
type Look = { top: string; bottom: string; detail?: string; hat?: string }
const LOOKS: Look[] = [
  { top: '#fdf3e0', bottom: '#bcd7ef' }, // cream top, jeans (her usual)
  { top: '#f6c6d3', bottom: '#5a4a6b', detail: `<g fill="#ffffff"><circle cx="-3" cy="5.5" r=".7"/><circle cx="2" cy="7" r=".7"/><circle cx="4" cy="4.5" r=".7"/></g>` },
  { top: '#9fdcc8', bottom: '#3b4a6b', detail: `<path d="M-1 3 V9" stroke="#ffffff" stroke-width="1"/>`, hat: `<path d="M-9.6 -10 Q0 -14 9.6 -10" stroke="#f28da4" stroke-width="2.2" fill="none" stroke-linecap="round"/>` },
  { top: '#f2c84b', bottom: '#8fb7cf', detail: `<path d="M-6 5 H6 M-6.5 7 H6.5" stroke="#ffffff" stroke-width=".8"/>` },
  { top: '#c0545e', bottom: '#2b2b30', detail: `<path d="M0 3 V9" stroke="${INK}" stroke-width=".7"/><circle cx="-1.6" cy="5" r=".6" fill="#fffaf0"/><circle cx="-1.6" cy="7.5" r=".6" fill="#fffaf0"/>` },
  { top: '#bcd7ef', bottom: '#fdf3e0', hat: `<path d="M-9 -12 Q-9 -20 0 -20 Q9 -20 9 -12 Z" fill="#f2c84b" stroke="${INK}" stroke-width=".9"/><path d="M8 -12 H13" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>` },
  { top: '#e9d2b0', bottom: '#8a5a3a', detail: `<path d="M-3 3 L0 6 L3 3" stroke="#c0545e" stroke-width="1.1" fill="none"/>` },
  { top: '#d9c8ef', bottom: '#5a6b8a', hat: `<path d="M-9.4 -11 Q0 -15 9.4 -11" stroke="#f4a7b9" stroke-width="1.6" fill="none"/><circle cx="7" cy="-12.5" r="2" fill="#f4a7b9" stroke="${INK}" stroke-width=".6"/>` },
]
const lookOfId = new Map<string, number>()
/** The look of the Yoda for task `id`: different from every other task's while there are looks left. */
export function lookFor(id: string, active: readonly string[]): number {
  for (const k of [...lookOfId.keys()]) if (!active.includes(k) && k !== id) lookOfId.delete(k)
  const have = lookOfId.get(id)
  if (have !== undefined) return have
  const used = new Set(lookOfId.values())
  const start = seedOf(id) % LOOKS.length
  let pick = start
  for (let i = 0; i < LOOKS.length; i++) if (!used.has((start + i) % LOOKS.length)) { pick = (start + i) % LOOKS.length; break }
  lookOfId.set(id, pick)
  return pick
}
function lookBody(i: number): string {
  const l = LOOKS[i % LOOKS.length]!
  return `<path d="M-6 3 H6 L7 9 H-7 Z" fill="${l.top}" stroke="${INK}" stroke-width=".9"/>${l.detail ?? ''}<path d="M-6 9 H6 V12 H-6 Z" fill="${l.bottom}"/>`
}
function lookHat(i: number): string {
  return LOOKS[i % LOOKS.length]!.hat ?? ''
}

/** One Yoda at (x, y), acting out its task's state. `seed` varies pose and rhythm. */
export function yoda(x: number, y: number, state: YodaState, seed: number, look = 0): string {
  const YB = lookBody(look)
  const YH = YODA_HEAD + lookHat(look)
  const v = seed % 3
  const delay = `animation-delay:-${(seed % 97) / 10}s`
  let body = ''
  let extra = ''
  let cls = 'bob'
  if (state === 'working') {
    // typing, reading or thinking at the desk; the desk hides the hands
    cls = v === 0 ? 'type' : v === 1 ? 'read' : 'think'
    const eyes = v === 2 ? EYES.up : EYES.open
    body = `${YODA_BACK}${YB}${YH}${eyes}${v === 2 ? MOUTH.flat : MOUTH.smile}${arm(-4, 11, -1, SKIN_Y, 'tapL')}${arm(4, 11, 1, SKIN_Y, 'tapR')}`
    extra = v === 2 ? BUBBLE_THINK : ''
  } else if (state === 'waiting') {
    // stopped, hand up, a bubble
    cls = 'bob'
    body = `${YODA_BACK}${YB}${YH}${EYES.open}${MOUTH.open}${arm(-8, 10, -1, SKIN_Y)}${arm(9, -14, 1, SKIN_Y, 'raise')}`
    extra = BUBBLE_WAIT
  } else if (state === 'completed') {
    // hopping and clapping
    cls = 'hop'
    body = `${YODA_BACK}${YB}${YH}${EYES.happy}${MOUTH.open}<g class="clap">${arm(-2, 1, -1, SKIN_Y)}${arm(2, 1, 1, SKIN_Y)}</g>`
    extra = CONFETTI
  } else if (state === 'idle') {
    // coffee, a stretch, or a doze
    cls = v === 1 ? 'stretch' : 'bob'
    if (v === 0) body = `${YODA_BACK}${YB}${YH}${EYES.open}${MOUTH.smile}${arm(-8, 10, -1, SKIN_Y)}${arm(8, 5, 1, SKIN_Y)}${MUG}`
    else if (v === 1) body = `${YODA_BACK}${YB}${YH}${EYES.closed}${MOUTH.open}${arm(-7, -17, -1, SKIN_Y)}${arm(7, -17, 1, SKIN_Y)}`
    else body = `${YODA_BACK}${YB}${YH}${EYES.closed}${MOUTH.smile}${arm(-8, 10, -1, SKIN_Y)}${arm(8, 10, 1, SKIN_Y)}`
    extra = v === 2 ? ZZ : ''
  } else {
    // scratching her head, puzzled
    cls = 'wobble'
    body = `${YODA_BACK}${YB}${YH}${EYES.puzzled}${MOUTH.wobbly}${arm(-8, 10, -1, SKIN_Y)}${arm(8, -14, 1, SKIN_Y, 'scratch')}`
    extra = BUBBLE_ERROR
  }
  return `<g transform="translate(${x} ${y})"><g class="${cls}" style="${delay}">
<ellipse cx="0" cy="13" rx="8" ry="2" fill="#2a3d3522"/>${body}</g><g style="${delay}">${extra}</g></g>`
}

// ---- 俊俊 ----

const JUN_BODY = `<path d="M-6 3 H6 L7 9 H-7 Z" fill="#fbfbf5" stroke="${INK}" stroke-width=".9"/><path d="M5 3.5 L-6 8.5" stroke="${INK}" stroke-width="1"/><path d="M-6 9 H6 V12 H-6 Z" fill="#2b2b30"/>`
const JUN_HEAD = `<circle cx="0" cy="-6" r="9.5" fill="${SKIN_J}" stroke="${INK}" stroke-width="1.2"/>
<path d="M-10 -7 C-11 -18 -4 -18 0 -18 C5 -18 11 -17 10 -7 C8 -10 6 -11 4 -9 C2 -12 -1 -12 -2 -9 C-4 -12 -7 -11 -10 -7 Z" fill="#2b211d"/>
<circle cx="-3.5" cy="-6" r="2.6" fill="#ffffff" fill-opacity=".4" stroke="${INK}" stroke-width=".9"/><circle cx="3.5" cy="-6" r="2.6" fill="#ffffff" fill-opacity=".4" stroke="${INK}" stroke-width=".9"/><path d="M-.9 -6 H.9" stroke="${INK}" stroke-width=".8"/>
<ellipse cx="-6" cy="-2" rx="1.8" ry="1" fill="#f4b3bf"/><ellipse cx="6" cy="-2" rx="1.8" ry="1" fill="#f4b3bf"/>`

// His movements and moments come from jun-route.ts, as CSS for the classes below.

/** The one 俊俊; where he goes and what he does is in the trip's CSS. */
export function jun(): string {
  const eyesOpen = `<g class="junOpen"><circle cx="-3.5" cy="-6" r=".9" fill="${INK}"/><circle cx="3.5" cy="-6" r=".9" fill="${INK}"/></g>`
  const eyesShut = `<g class="junShut"><path d="M-4.8 -6 q1.3 1.2 2.6 0 M2.2 -6 q1.3 1.2 2.6 0" stroke="${INK}" stroke-width=".8" fill="none"/></g>`
  const armsDown = `<g class="junDown">${arm(-8, 10, -1, SKIN_J)}${arm(8, 10, 1, SKIN_J)}</g>`
  const waving = `<g class="junWave">${arm(-8, 10, -1, SKIN_J)}<g class="junWaveArm">${arm(10, -12, 1, SKIN_J)}</g></g>`
  const stretching = `<g class="junUp">${arm(-7, -17, -1, SKIN_J)}${arm(7, -17, 1, SKIN_J)}</g>`
  const booArms = `<g class="junBoo">${arm(-10, -10, -1, SKIN_J)}${arm(10, -10, 1, SKIN_J)}</g>`
  const booBubble = `<g class="junBoo"><rect x="9" y="-31" width="9" height="11" rx="2.5" fill="#f2c84b" stroke="${INK}" stroke-width="1"/><path d="M13.5 -28.5 V-24" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><circle cx="13.5" cy="-22" r="1" fill="${INK}"/></g>`
  return `<g class="junPos"><g class="junJump"><g class="junCrouch"><g class="junSit"><g class="junSpin"><g class="junFace"><g class="junStep">
<ellipse cx="0" cy="13" rx="8" ry="2" fill="#2a3d3522"/>${JUN_BODY}${JUN_HEAD}${eyesOpen}${eyesShut}
<path d="M-1.5 -1.5 Q0 0 1.5 -1.5" stroke="${INK}" stroke-width=".8" fill="none" stroke-linecap="round"/>
${armsDown}${waving}${stretching}${booArms}
</g></g></g></g></g></g>${booBubble}<path class="junZz" d="M9 -20 h4 l-4 4 h4" stroke="#8a7790" stroke-width="1.1" fill="none"/></g>`
}

export const CAST_STYLE = `
.bob{animation:bob 3.6s ease-in-out infinite}
.type{animation:type .55s ease-in-out infinite}
.read{transform-box:fill-box;transform-origin:50% 100%;animation:read 5s ease-in-out infinite}
.think{transform-box:fill-box;transform-origin:50% 100%;animation:read 7s ease-in-out infinite}
.tapL{animation:tap .35s ease-in-out infinite}
.tapR{animation:tap .35s ease-in-out infinite;animation-delay:-.17s}
.raise{transform-box:fill-box;transform-origin:0% 100%;animation:raise 1.2s ease-in-out infinite alternate}
.hop{animation:hop .8s ease-in-out infinite}
.clap{transform-box:fill-box;transform-origin:center;animation:clap .4s ease-in-out infinite alternate}
.confetti{animation:twinkle 1.2s ease-in-out infinite}
.stretch{transform-box:fill-box;transform-origin:50% 100%;animation:stretch 4s ease-in-out infinite}
.wobble{transform-box:fill-box;transform-origin:50% 100%;animation:wobble 2.4s ease-in-out infinite}
.scratch{animation:scratch .3s ease-in-out infinite alternate}
.pop{animation:pop 1.6s ease-in-out infinite}
.zz,.steam{animation:twinkle 3s ease-in-out infinite}
.dot1{animation:twinkle 1.2s ease-in-out infinite}
.dot2{animation:twinkle 1.2s ease-in-out infinite;animation-delay:-.4s}
.dot3{animation:twinkle 1.2s ease-in-out infinite;animation-delay:-.8s}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes type{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes read{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes tap{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2px)}}
@keyframes raise{from{transform:rotate(-6deg)}to{transform:rotate(8deg)}}
@keyframes hop{0%,100%{transform:translateY(0)}45%{transform:translateY(-6px)}}
@keyframes clap{from{transform:scaleX(1)}to{transform:scaleX(.5)}}
@keyframes stretch{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.08)}}
@keyframes wobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes scratch{from{transform:translate(0,0)}to{transform:translate(-1px,1px)}}
@keyframes pop{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes twinkle{0%,100%{opacity:1}50%{opacity:.25}}`

// ---- the one Yoda of Yoda's Daily ----

export type DailyMood = 'hello' | 'drink' | 'rest' | 'stretch' | 'cheer'

/** Yoda alone, acting out what the day calls for. */
export function yodaPose(x: number, y: number, mood: DailyMood): string {
  let cls = 'bob'
  let body = ''
  let extra = ''
  if (mood === 'drink') {
    body = `${YODA_BACK}${YODA_BODY}${YODA_HEAD}${EYES.happy}${MOUTH.smile}${arm(-8, 10, -1, SKIN_Y)}${arm(8, 5, 1, SKIN_Y)}${MUG}`
  } else if (mood === 'rest') {
    body = `${YODA_BACK}${YODA_BODY}${YODA_HEAD}${EYES.closed}${MOUTH.smile}${arm(-8, 10, -1, SKIN_Y)}${arm(8, 10, 1, SKIN_Y)}`
    extra = ZZ
  } else if (mood === 'stretch') {
    cls = 'stretch'
    body = `${YODA_BACK}${YODA_BODY}${YODA_HEAD}${EYES.closed}${MOUTH.open}${arm(-7, -17, -1, SKIN_Y)}${arm(7, -17, 1, SKIN_Y)}`
  } else if (mood === 'cheer') {
    cls = 'hop'
    body = `${YODA_BACK}${YODA_BODY}${YODA_HEAD}${EYES.happy}${MOUTH.open}<g class="clap">${arm(-2, 1, -1, SKIN_Y)}${arm(2, 1, 1, SKIN_Y)}</g>`
    extra = CONFETTI
  } else {
    body = `${YODA_BACK}${YODA_BODY}${YODA_HEAD}${EYES.open}${MOUTH.smile}${arm(-8, 10, -1, SKIN_Y)}<g class="raise">${arm(9, -12, 1, SKIN_Y)}</g>`
  }
  return `<g transform="translate(${x} ${y})"><g class="${cls}"><ellipse cx="0" cy="13" rx="8" ry="2" fill="#2a3d3522"/>${body}</g>${extra}</g>`
}

// ---- Yoda's outfits for Yoda's Daily: one a day, picked by the weather ----

export type Outfit = 'casual' | 'home' | 'sport' | 'summer' | 'winter' | 'raincoat'

function outfitBody(o: Outfit): string {
  switch (o) {
    case 'home':
      return `<path d="M-6 3 H6 L7 9 H-7 Z" fill="#f6c6d3" stroke="${INK}" stroke-width=".9"/><g fill="#ffffff"><circle cx="-3" cy="5.5" r=".7"/><circle cx="2" cy="7" r=".7"/><circle cx="4" cy="4.5" r=".7"/></g><path d="M-6 9 H6 V12.5 H-6 Z" fill="#f6c6d3" stroke="${INK}" stroke-width=".7"/>`
    case 'sport':
      return `<path d="M-6 3 H6 L7 9 H-7 Z" fill="#9fdcc8" stroke="${INK}" stroke-width=".9"/><path d="M-1 3 V9" stroke="#ffffff" stroke-width="1"/><path d="M-6 9 H6 V12 H-6 Z" fill="#3b4a6b"/>`
    case 'summer':
      return `<path d="M-5 3 H5 L6.5 9 H-6.5 Z" fill="#f2c84b" stroke="${INK}" stroke-width=".9"/><path d="M-6 9 H6 V11.5 H-6 Z" fill="#8fb7cf"/>`
    case 'winter':
      return `<path d="M-7 2.5 H7 L8 11 H-8 Z" fill="#c0545e" stroke="${INK}" stroke-width=".9"/><path d="M0 3 V11" stroke="${INK}" stroke-width=".7"/><circle cx="-1.6" cy="6" r=".6" fill="#fffaf0"/><circle cx="-1.6" cy="8.5" r=".6" fill="#fffaf0"/><path d="M-6 11 H6 V12.5 H-6 Z" fill="#5a4a6b"/>`
    case 'raincoat':
      return `<path d="M-7.5 2 H7.5 L9 12.5 H-9 Z" fill="#f2c84b" stroke="${INK}" stroke-width=".9"/><path d="M0 2.5 V12" stroke="${INK}" stroke-width=".6"/>`
    default:
      return YODA_BODY
  }
}

function outfitHat(o: Outfit): string {
  switch (o) {
    case 'sport':
      return `<path d="M-9.6 -10 Q0 -14 9.6 -10" stroke="#f28da4" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    case 'summer':
      return `<ellipse cx="0" cy="-14" rx="14" ry="3" fill="#f6e3b4" stroke="${INK}" stroke-width=".9"/><path d="M-7 -14 Q-7 -22 0 -22 Q7 -22 7 -14 Z" fill="#f6e3b4" stroke="${INK}" stroke-width=".9"/><path d="M-7 -15.5 H7" stroke="#f28da4" stroke-width="1.4"/>`
    case 'winter':
      return `<path d="M-9 -12 Q-9 -21 0 -21 Q9 -21 9 -12 Z" fill="#9fdcc8" stroke="${INK}" stroke-width=".9"/><rect x="-9.5" y="-13" width="19" height="3" rx="1.5" fill="#7fcfb6" stroke="${INK}" stroke-width=".7"/><circle cx="0" cy="-22" r="2.2" fill="#fffaf0" stroke="${INK}" stroke-width=".7"/><path d="M-6 2 Q0 5 6 2 L6 4 Q0 7 -6 4 Z" fill="#9fdcc8" stroke="${INK}" stroke-width=".7"/>`
    case 'raincoat':
      return `<path d="M-11 -5 Q-12 -20 0 -20 Q12 -20 11 -5 Q8 -12 0 -12.5 Q-8 -12 -11 -5 Z" fill="#f2c84b" stroke="${INK}" stroke-width=".9"/>`
    default:
      return ''
  }
}

export type DailyMove = 'idle' | 'wave' | 'drink' | 'stretch' | 'walk' | 'dream' | 'jump' | 'rest'

const UMBRELLA = `<g><path d="M-22 -14 Q-10 -32 2 -14 Q-1 -17 -4 -14 Q-7 -17 -10 -14 Q-13 -17 -16 -14 Q-19 -17 -22 -14 Z" fill="#9fdcc8" stroke="${INK}" stroke-width=".9"/><path d="M-10 -14 V8" stroke="${INK}" stroke-width="1"/><path d="M-10 -24 V-26" stroke="${INK}" stroke-width="1"/></g>`

/** Yoda dressed for the day, doing one move. With `umbrella`, her left hand holds it. */
export function yodaDressed(move: DailyMove, outfit: Outfit, umbrella: boolean, look?: number): string {
  const leftArm = umbrella ? arm(-10, 7, -1, SKIN_Y) : null
  let eyes = EYES.open
  let mouth = MOUTH.smile
  let arms = ''
  let extra = ''
  if (move === 'wave') arms = `${leftArm ?? arm(-8, 10, -1, SKIN_Y)}<g class="raise">${arm(9, -12, 1, SKIN_Y)}</g>`
  else if (move === 'drink') {
    eyes = EYES.happy
    arms = `${leftArm ?? arm(-8, 10, -1, SKIN_Y)}${arm(8, 5, 1, SKIN_Y)}`
    extra = MUG
  } else if (move === 'stretch') {
    eyes = EYES.closed
    mouth = MOUTH.open
    arms = umbrella ? `${leftArm}${arm(7, -17, 1, SKIN_Y)}` : `${arm(-7, -17, -1, SKIN_Y)}${arm(7, -17, 1, SKIN_Y)}`
  } else if (move === 'dream') {
    eyes = EYES.up
    mouth = MOUTH.flat
    arms = `${leftArm ?? arm(-8, 10, -1, SKIN_Y)}${arm(8, 10, 1, SKIN_Y)}`
    extra = `<g class="dot1" fill="${INK}"><circle cx="11" cy="-20" r=".8"/></g><g class="dot2" fill="${INK}"><circle cx="14" cy="-23" r=".9"/></g><g class="dot3" fill="${INK}"><circle cx="18" cy="-26" r="1"/></g>`
  } else if (move === 'jump') {
    eyes = EYES.happy
    mouth = MOUTH.open
    arms = umbrella ? `${leftArm}${arm(9, -10, 1, SKIN_Y)}` : `${arm(-9, -10, -1, SKIN_Y)}${arm(9, -10, 1, SKIN_Y)}`
  } else if (move === 'idle') {
    arms = `${leftArm ?? arm(-8, 10, -1, SKIN_Y)}${arm(8, 10, 1, SKIN_Y)}`
  } else if (move === 'rest') {
    eyes = EYES.closed
    arms = `${leftArm ?? arm(-8, 10, -1, SKIN_Y)}${arm(8, 10, 1, SKIN_Y)}`
    extra = ZZ
  } else {
    arms = `${leftArm ?? arm(-7, 11, -1, SKIN_Y)}${arm(7, 11, 1, SKIN_Y)}`
  }
  const cls = move === 'jump' ? 'hop' : move === 'walk' ? 'walkStep' : move === 'stretch' ? 'stretch' : 'bob'
  return `<g class="${cls}"><ellipse cx="0" cy="13" rx="8" ry="2" fill="#2a3d3522"/>${YODA_BACK}${look === undefined ? outfitBody(outfit) : lookBody(look)}${YODA_HEAD}${look === undefined ? outfitHat(outfit) : lookHat(look)}${eyes}${mouth}${arms}</g>${extra}${umbrella ? UMBRELLA : ''}`
}

// ---- a Yoda's routine: several moments, each 30-50s, crossfading ----

/** A small fixed-seed random generator: the same task always gets the same routine,
 *  so her picture's text never changes by itself (a changed text would restart her). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CHAT = [
  `<g class="dot1" fill="${INK}"><circle cx="14" cy="-27.5" r=".9"/></g><g class="dot2" fill="${INK}"><circle cx="18" cy="-27.5" r=".9"/></g><g class="dot3" fill="${INK}"><circle cx="22" cy="-27.5" r=".9"/></g>`,
  `<path d="M15 -30 c-1.2 -1.2 -3 0 -1.6 1.6 l1.6 1.6 1.6 -1.6 c1.4 -1.6 -.4 -2.8 -1.6 -1.6 Z" fill="#f28da4"/><path d="M21 -27 l.6 -3 .8 2.4" stroke="${INK}" stroke-width=".8" fill="none"/>`,
  `<path d="M14 -29 q2 -2 4 0 M19 -29 q2 2 4 0" stroke="${INK}" stroke-width=".8" fill="none"/>`,
]

function chatBubble(variant: number): string {
  return `<g class="pop"><rect x="10" y="-33" width="16" height="9" rx="4.5" fill="#ffffff" stroke="${INK}" stroke-width=".8"/><path d="M13 -24 l-2 3 4 -3 Z" fill="#ffffff" stroke="${INK}" stroke-width=".6"/>${CHAT[variant % CHAT.length]}</g>`
}

/**
 * One Yoda living her state: a fixed set of moments for that state, strung in a
 * seeded order, each lasting 30-50 seconds and crossfading into the next.
 */
export function yodaLife(x: number, y: number, state: YodaState, id: string, look = 0): string {
  const seed = seedOf(id)
  const rnd = seededRandom(seed)
  // the moments each state may show; each entry is a pose seed for yoda() plus an extra
  type Moment = { pose: YodaState; v: number; chat?: boolean }
  const moments: Moment[] =
    state === 'working'
      ? [{ pose: 'working', v: 0 }, { pose: 'working', v: 1 }, { pose: 'working', v: 2 }, { pose: 'working', v: 0, chat: true }, { pose: 'idle', v: 0 }]
      : state === 'idle'
        ? [{ pose: 'idle', v: 0 }, { pose: 'idle', v: 1 }, { pose: 'idle', v: 2 }, { pose: 'idle', v: 0, chat: true }]
        : state === 'completed'
          ? [{ pose: 'completed', v: 0 }, { pose: 'idle', v: 0, chat: true }, { pose: 'completed', v: 1 }]
          : state === 'waiting'
            ? [{ pose: 'waiting', v: 0 }, { pose: 'waiting', v: 1 }]
            : [{ pose: 'error', v: 0 }, { pose: 'error', v: 1 }]
  // shuffle by the seed
  for (let i = moments.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[moments[i], moments[j]] = [moments[j]!, moments[i]!]
  }
  const secs = moments.map(() => 30 + Math.round(rnd() * 20))
  const total = secs.reduce((a, b) => a + b, 0)
  const fade = 0.35 // short, so two poses never linger see-through together
  const pc = (t: number) => `${((((t % total) + total) % total) / total * 100).toFixed(3)}%`
  let css = ''
  let body = ''
  let t = 0
  moments.forEach((m, i) => {
    const a = t
    const b = t + secs[i]!
    const cls = `m${i}`
    // fade in over [a - fade, a], hold, fade out over [b - fade, b]; the first wraps round the loop end
    const frames =
      i === 0
        ? `0%{opacity:1}${pc(b - fade)}{opacity:1}${pc(b)}{opacity:0}${pc(total - fade)}{opacity:0}100%{opacity:1}`
        : `0%{opacity:0}${pc(a - fade)}{opacity:0}${pc(a)}{opacity:1}${pc(b - fade)}{opacity:1}${pc(b)}{opacity:0}100%{opacity:0}`
    css += `.${cls}{animation:${cls} ${total}s linear infinite;animation-delay:-${(seed % total)}s}@keyframes ${cls}{${frames}}`
    const pose = yoda(x, y, m.pose, m.v + 3 * (seed % 7), look)
    const chat = m.chat ? `<g transform="translate(${x} ${y})">${chatBubble(seed + i)}</g>` : ''
    body += `<g class="${cls}">${pose}${chat}</g>`
    t = b
  })
  return `<style>${css}</style>${body}`
}
