// The person's own two characters, full body, in little scenes that change.
// 俊俊: black hair, round glasses, white printed shirt over a grey vest,
//       crossbody strap, black shorts, black watch, white sneakers.
// 瑩瑩: brown twin braids with mint hair ties, cream ribbed top,
//       sticker-covered light jeans, white sneakers.
// Ink outlines and flat fills, like their character cards.

const INK = '#3b2a2a'
const SKIN_J = '#f6d5bf'
const SKIN_Y = '#fde3d4'
const BLUSH = '#f4b3bf'

import type { AiScene, Look } from '../types'

type Pt = readonly [number, number]

export const JX = 86
export const YX = 154

const f = (n: number) => Number(n.toFixed(1))

function arm(from: Pt, to: Pt, skin: string, sleeve: string): string {
  return `<path d="M${from[0]} ${from[1]} L${to[0]} ${to[1]}" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/>
<path d="M${from[0]} ${from[1]} L${to[0]} ${to[1]}" stroke="${skin}" stroke-width="4.5" stroke-linecap="round"/>
<path d="M${from[0]} ${from[1]} L${f(from[0] + (to[0] - from[0]) * 0.35)} ${f(from[1] + (to[1] - from[1]) * 0.35)}" stroke="${sleeve}" stroke-width="5" stroke-linecap="round"/>
<circle cx="${to[0]}" cy="${to[1]}" r="3.6" fill="${skin}" stroke="${INK}" stroke-width="1.4"/>`
}

function junHead(look: Look): string {
  const px = look === 'side' ? 2 : 0
  const py = look === 'up' ? -2 : 0
  return `<circle r="26" fill="${SKIN_J}" stroke="${INK}" stroke-width="2"/>
<path d="M-26 0 C-29 -27 -12 -28 0 -28 C14 -28 29 -25 26 0 C23 -8 19 -11 14 -7 C10 -13 4 -13 0 -7 C-4 -13 -11 -13 -15 -7 C-19 -11 -24 -7 -26 0 Z" fill="#2b211d" stroke="${INK}" stroke-width="1.6"/>
<circle cx="-9" cy="4" r="6.5" fill="#ffffff" fill-opacity=".35" stroke="${INK}" stroke-width="1.8"/>
<circle cx="9" cy="4" r="6.5" fill="#ffffff" fill-opacity=".35" stroke="${INK}" stroke-width="1.8"/>
<path d="M-2.5 4 H2.5 M-15.5 3 L-25 1 M15.5 3 L25 1" stroke="${INK}" stroke-width="1.6"/>
<circle cx="${-9 + px}" cy="${4 + py}" r="1.9" fill="${INK}"/><circle cx="${9 + px}" cy="${4 + py}" r="1.9" fill="${INK}"/>
<ellipse cx="-16" cy="14" rx="4.5" ry="2.6" fill="${BLUSH}"/><ellipse cx="17" cy="14" rx="4.5" ry="2.6" fill="${BLUSH}"/>
<path d="M-4 15 Q0 19 4 15" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
}

function yingHead(look: Look, isResting: boolean): string {
  const px = look === 'side' ? -2 : 0
  const py = look === 'up' ? -2.5 : 0
  const eyes = isResting
    ? `<path d="M-11 1 Q-8 4 -5 1 M5 1 Q8 4 11 1" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="${-8 + px}" cy="${py}" rx="2.4" ry="3.2" fill="${INK}"/><ellipse cx="${8 + px}" cy="${py}" rx="2.4" ry="3.2" fill="${INK}"/>
<circle cx="${-7.2 + px}" cy="${-1.4 + py}" r=".8" fill="#ffffff"/><circle cx="${8.8 + px}" cy="${-1.4 + py}" r=".8" fill="#ffffff"/>`
  return `<circle r="26" fill="${SKIN_Y}" stroke="${INK}" stroke-width="2"/>
<path d="M-26 2 C-29 -23 -13 -28 0 -28 C14 -28 29 -23 26 2 C20 -11 10 -15 0 -15 C-10 -15 -20 -11 -26 2 Z" fill="#5a3a2a" stroke="${INK}" stroke-width="1.6"/>
<path d="M-3 -27 L0 -33 L3 -27" fill="#5a3a2a" stroke="${INK}" stroke-width="1.4"/>
${eyes}
<ellipse cx="-16" cy="9" rx="4.5" ry="2.6" fill="${BLUSH}"/><ellipse cx="16" cy="9" rx="4.5" ry="2.6" fill="${BLUSH}"/>
<path d="M-4 10 Q0 13 4 10" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`
}

function braid(x: number): string {
  return `<g fill="#5a3a2a" stroke="${INK}" stroke-width="1.6">
<ellipse cx="${x}" cy="72" rx="6" ry="7"/><ellipse cx="${x}" cy="84" rx="5.6" ry="6.5"/><ellipse cx="${x}" cy="95" rx="5" ry="6"/>
</g><rect x="${x - 4.5}" y="100" width="9" height="4" rx="2" fill="#9fdcc8" stroke="${INK}" stroke-width="1.2"/>`
}

/** 俊俊 standing at JX, with each hand where the scene needs it. */
function jun(look: Look, left: Pt, right: Pt): string {
  const x = JX
  return `<g class="bobA">
<ellipse cx="${x - 8}" cy="137" rx="9" ry="5" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>
<ellipse cx="${x + 8}" cy="137" rx="9" ry="5" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>
<rect x="${x - 10}" y="120" width="6" height="14" fill="${SKIN_J}" stroke="${INK}" stroke-width="1.6"/>
<rect x="${x + 4}" y="120" width="6" height="14" fill="${SKIN_J}" stroke="${INK}" stroke-width="1.6"/>
<path d="M${x - 15} 106 H${x + 15} L${x + 14} 122 H${x + 2} L${x} 114 L${x - 2} 122 H${x - 14} Z" fill="#2b2b30" stroke="${INK}" stroke-width="1.8"/>
${arm([x - 13, 90], left, SKIN_J, '#fbfbf5')}
${arm([x + 13, 90], right, SKIN_J, '#fbfbf5')}
<rect x="${left[0] - 3}" y="${left[1] - 7}" width="6" height="4" rx="1" fill="#2b2b30"/>
<path d="M${x - 14} 86 L${x + 14} 86 L${x + 16} 108 L${x - 16} 108 Z" fill="#fbfbf5" stroke="${INK}" stroke-width="2"/>
<path d="M${x - 4} 86 L${x} 94 L${x + 4} 86 Z" fill="#a9a9a3" stroke="${INK}" stroke-width="1.2"/>
<path d="M${x - 10} 95 q2 -2 4 0 M${x + 6} 100 q2 -2 4 0" stroke="#5b8bbf" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M${x - 3} 103 q2 -2 4 0" stroke="#f0b52f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M${x + 7} 91 q2 -2 4 0" stroke="#ef8a6a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M${x + 12} 87 L${x - 14} 106" stroke="${INK}" stroke-width="2.4"/>
<g transform="translate(${x} 60)">${junHead(look)}</g>
</g>`
}

/** 瑩瑩 standing at YX, with each hand where the scene needs it. */
function ying(look: Look, left: Pt, right: Pt, isResting: boolean): string {
  const x = YX
  return `<g class="bobB">
${braid(x - 26)}${braid(x + 26)}
<ellipse cx="${x - 8}" cy="137" rx="9" ry="5" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>
<ellipse cx="${x + 8}" cy="137" rx="9" ry="5" fill="#ffffff" stroke="${INK}" stroke-width="1.8"/>
<path d="M${x - 15} 108 H${x + 15} L${x + 13} 133 H${x + 2} L${x} 118 L${x - 2} 133 H${x - 13} Z" fill="#bcd7ef" stroke="${INK}" stroke-width="1.8"/>
<path d="M${x - 10} 120 c0 -2 3 -2 3 0 c0 -2 3 -2 3 0 c0 2 -3 4 -3 4 c0 0 -3 -2 -3 -4 Z" fill="#f28da4"/>
<circle cx="${x + 8}" cy="114" r="1.8" fill="#9fdcc8"/><circle cx="${x + 7}" cy="126" r="1.8" fill="#f2c84b"/><circle cx="${x - 7}" cy="129" r="1.6" fill="#9fdcc8"/>
${arm([x - 12, 90], left, SKIN_Y, '#fdf3e0')}
${arm([x + 12, 90], right, SKIN_Y, '#fdf3e0')}
<path d="M${x - 13} 86 H${x + 13} L${x + 15} 110 H${x - 15} Z" fill="#fdf3e0" stroke="${INK}" stroke-width="2"/>
<path d="M${x - 6} 88 V109 M${x} 88 V109 M${x + 6} 88 V109" stroke="#e8d9bd" stroke-width="1.2"/>
<g transform="translate(${x} 60)">${yingHead(look, isResting)}</g>
</g>`
}

const GROUND = `<ellipse cx="120" cy="140" rx="104" ry="9" fill="#bfe3cf" opacity=".55"/>
<path d="M30 140 q-2 -6 -4 -9 M34 140 q0 -6 1 -10 M206 140 q2 -6 5 -8 M210 140 q0 -6 -1 -9" stroke="#6c9c78" stroke-width="1.6" fill="none" stroke-linecap="round"/>`

const DOWN_JL: Pt = [JX - 20, 114]
const DOWN_YL: Pt = [YX - 19, 114]
const DOWN_YR: Pt = [YX + 19, 114]
const HOLD_HANDS_J: Pt = [JX + 24, 104]
const HOLD_HANDS_Y: Pt = [YX - 23, 104]

function flower(x: number, y: number, c: string): string {
  return `<g><circle cx="${x - 3}" cy="${y}" r="3" fill="${c}"/><circle cx="${x + 3}" cy="${y}" r="3" fill="${c}"/><circle cx="${x}" cy="${y - 3}" r="3" fill="${c}"/><circle cx="${x}" cy="${y + 3}" r="3" fill="${c}"/><circle cx="${x}" cy="${y}" r="2" fill="#f2c84b"/></g>`
}

function cup(x: number, y: number): string {
  return `<g><path d="M${x - 6} ${y - 6} H${x + 6} L${x + 4} ${y + 8} H${x - 4} Z" fill="#fff7ee" stroke="${INK}" stroke-width="1.5"/>
<path d="M${x - 6} ${y - 2} H${x + 6}" stroke="#d8b48a" stroke-width="3"/>
<path class="steam" d="M${x - 2} ${y - 9} q-3 -4 0 -8 M${x + 3} ${y - 9} q-3 -4 0 -8" stroke="#b9a7a7" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>`
}

type SceneDef = { caption: string; draw: (isResting: boolean) => string }

/** The little scenes, picked at random. */
export const SCENES: readonly SceneDef[] = [
  {
    caption: '俊俊和瑩瑩在放風箏 🪁',
    draw: r => `<g class="float"><path d="M196 14 L210 28 L196 44 L182 28 Z" fill="#f4a7b9" stroke="${INK}" stroke-width="1.6"/>
<path d="M196 14 V44 M182 28 H210" stroke="${INK}" stroke-width="1"/>
<path d="M196 44 q-6 8 0 14 q6 6 0 12" stroke="${INK}" stroke-width="1.2" fill="none"/>
<path d="M192 52 l4 2 -4 2 Z M192 64 l4 2 -4 2 Z" fill="#9fdcc8"/></g>
<path d="M${JX + 24} 72 Q150 40 196 44" stroke="${INK}" stroke-width="1" fill="none"/>
${jun('up', DOWN_JL, [JX + 24, 72])}${ying('up', DOWN_YL, DOWN_YR, r)}`,
  },
  {
    caption: '瑩瑩拿著愛心氣球，俊俊在旁邊揮手 🎈',
    draw: r => `<path d="M${YX + 22} 102 Q${YX + 30} 60 ${YX + 34} 36" stroke="${INK}" stroke-width="1" fill="none"/>
<g class="float"><path d="M${YX + 34} 38 C${YX + 22} 30 ${YX + 18} 18 ${YX + 26} 14 C${YX + 30} 12 ${YX + 34} 16 ${YX + 34} 20 C${YX + 34} 16 ${YX + 38} 12 ${YX + 42} 14 C${YX + 50} 18 ${YX + 46} 30 ${YX + 34} 38 Z" fill="#f28da4" stroke="${INK}" stroke-width="1.6"/></g>
${jun('side', DOWN_JL, [JX + 22, 70])}${ying('front', DOWN_YL, [YX + 22, 102], r)}`,
  },
  {
    caption: '俊俊送瑩瑩一束花 💐',
    draw: r => `${jun('side', DOWN_JL, [JX + 26, 98])}${ying('side', [YX - 22, 100], DOWN_YR, r)}
<path d="M${JX + 28} 98 L${JX + 34} 84 M${JX + 28} 98 L${JX + 28} 82 M${JX + 28} 98 L${JX + 22} 84" stroke="#5d8a4f" stroke-width="1.6"/>
${flower(JX + 34, 82, '#f28da4')}${flower(JX + 27, 78, '#f6b3c3')}${flower(JX + 21, 82, '#f4a07a')}`,
  },
  {
    caption: '俊俊和瑩瑩一起看星星 ✨',
    draw: r => `<path d="M206 18 a12 12 0 1 0 10 18 a10 10 0 1 1 -10 -18 Z" fill="#f6e7b8" stroke="${INK}" stroke-width="1.4"/>
<g class="twinkle" fill="#f2c84b"><path d="M40 20 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z"/><path d="M120 12 l1.5 4 4 1.5 -4 1.5 -1.5 4 -1.5 -4 -4 -1.5 4 -1.5 Z"/><path d="M176 30 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z"/></g>
${jun('up', DOWN_JL, HOLD_HANDS_J)}${ying('up', HOLD_HANDS_Y, DOWN_YR, r)}`,
  },
  {
    caption: '下雨了，俊俊幫瑩瑩撐傘 ☔',
    draw: r => `<g class="rain" stroke="#8fb7cf" stroke-width="1.6" stroke-linecap="round"><path d="M24 10 l-3 8 M54 30 l-3 8 M30 60 l-3 8 M206 20 l-3 8 M222 56 l-3 8 M196 70 l-3 8"/></g>
<path d="M70 36 C80 4 170 4 180 36 C168 30 156 30 148 36 C138 30 124 30 125 36 C114 30 102 30 100 36 C92 30 80 30 70 36 Z" fill="#9fdcc8" stroke="${INK}" stroke-width="1.8"/>
<path d="M125 8 V4" stroke="${INK}" stroke-width="2"/>
<path d="M125 36 V96 q0 6 -6 6" stroke="${INK}" stroke-width="2" fill="none"/>
${jun('side', DOWN_JL, [JX + 33, 92])}${ying('front', DOWN_YL, DOWN_YR, r)}`,
  },
  {
    caption: '俊俊和瑩瑩在喝奶茶 🧋',
    draw: r => `${jun('side', DOWN_JL, [JX + 20, 100])}${ying('side', [YX - 20, 100], DOWN_YR, r)}${cup(JX + 20, 94)}${cup(YX - 20, 94)}`,
  },
]

export const SCENE_COUNT = SCENES.length

const DROP = `<g class="hop"><path d="M${JX} 6 C${JX - 6} 16 ${JX - 6} 22 ${JX} 22 C${JX + 6} 22 ${JX + 6} 16 ${JX} 6 Z" fill="#9fd0ee" stroke="${INK}" stroke-width="1.5"/></g>`
const ZZZ = `<path d="M${YX + 30} 22 h8 l-8 8 h8 M${YX + 40} 10 h6 l-6 6 h6" stroke="#8a7790" stroke-width="1.6" fill="none"/>`

const MOTION = `
.bobA{animation:bob 4s ease-in-out infinite}
.bobB{animation:bob 4.6s ease-in-out infinite;animation-delay:-1.3s}
.float{animation:float 5s ease-in-out infinite}
.twinkle{animation:twinkle 3s ease-in-out infinite}
.rain{animation:rain 1.4s linear infinite}
.steam{animation:twinkle 2.5s ease-in-out infinite}
.hop{animation:hop 1s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes twinkle{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes rain{from{transform:translateY(-6px);opacity:.2}50%{opacity:1}to{transform:translateY(10px);opacity:.2}}
@keyframes hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`

function pick(index: number): SceneDef {
  return SCENES[((index % SCENE_COUNT) + SCENE_COUNT) % SCENE_COUNT] ?? SCENES[0]!
}

/** One scene for the side pane; a reminder adds 俊俊's water drop or lets 瑩瑩 doze. */
export function friendsSvg(index: number, active: 'water' | 'eyes' | null): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 152" width="1200" height="760" preserveAspectRatio="xMidYMid meet">
<style>${MOTION}</style>
${GROUND}${pick(index).draw(active === 'eyes')}${active === 'water' ? DROP : ''}${active === 'eyes' ? ZZZ : ''}
</svg>`
}

/** A scene the model made up, drawn round the same two friends. */
export function aiSceneSvg(s: AiScene, active: 'water' | 'eyes' | null): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 152" width="1200" height="760" preserveAspectRatio="xMidYMid meet">
<style>${MOTION}</style>
${GROUND}<g>${s.back}</g>${jun(s.junLook, s.junLeft, s.junRight)}${ying(s.yingLook, s.yingLeft, s.yingRight, active === 'eyes')}<g>${s.front}</g>${active === 'water' ? DROP : ''}${active === 'eyes' ? ZZZ : ''}
</svg>`
}

export function sceneCaption(index: number): string {
  return pick(index).caption
}
