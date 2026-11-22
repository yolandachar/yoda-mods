import type { EngineInterface } from 'claude-code'

import type { AiScene, Look } from '../types'
import { JX, YX } from './friends'

// The model makes up a fresh little scene for 俊俊 and 瑩瑩: a caption, where
// they look and hold their hands, and SVG art behind and in front of them.
// The two characters are always drawn by this mod, so they never change.
// Everything the model writes is filtered to a few plain shape tags first.

const SYSTEM = `你是一位溫柔可愛的童書插畫家，替兩個角色「俊俊」和「瑩瑩」設計一個全新的小場景，畫在 240×152 的 SVG 畫布上。

角色已經畫好，你不用畫他們本人，只要決定他們的動作與周圍的東西：
- 俊俊站在 x=${JX}：頭是圓心 (${JX},60)、半徑 26 的圓；身體 y=86–122；腳在 y≈137。肩膀在 (${JX - 13},90) 和 (${JX + 13},90)。
- 瑩瑩站在 x=${YX}：頭圓心 (${YX},60)、半徑 26；雙麻花辮垂在 x=${YX - 26} 與 x=${YX + 26}；身體 y=86–133。肩膀在 (${YX - 12},90) 和 (${YX + 12},90)。
- 地面是 y≈140 的淡綠橢圓。
- 手的位置必須離自己的肩膀 34 以內。手垂下時大約是 俊俊 (${JX - 20},114)/(${JX + 20},114)、瑩瑩 (${YX - 19},114)/(${YX + 19},114)。兩人牽手可用 (${JX + 24},104) 與 (${YX - 23},104)。

畫風：黑褐色描邊 #3b2a2a（stroke-width 1.2–2），平塗柔和色（奶油、粉紅 #f28da4、薄荷 #9fdcc8、淡藍 #bcd7ef、暖黃 #f2c84b、草綠 #6c9c78），圓潤可愛、簡單，像角色卡。
可以用 class 讓東西動：float（上下飄）、twinkle（閃爍）、rain（雨滴落下）、steam（冒煙閃爍）。

每次都要想一個和之前不一樣、日常又浪漫的小事件（例如：吹泡泡、餵小貓、堆雪人、看煙火、做蛋糕、拍照、彈吉他、追蝴蝶、看書、撿落葉…自由發揮）。

只輸出一個 JSON 物件，不要任何其他文字或程式碼區塊：
{
 "caption": "一句繁體中文描述，20 字內，結尾一個 emoji",
 "junLook": "side|up|front", "yingLook": "side|up|front",
 "junLeft": [x,y], "junRight": [x,y], "yingLeft": [x,y], "yingRight": [x,y],
 "back": "畫在兩人後面的 SVG 元素（背景、天空、遠處物件）",
 "front": "畫在兩人前面的 SVG 元素（手上拿的東西、前景小物）"
}
SVG 規則：只能用 path、circle、ellipse、rect、line、polyline、polygon、g；屬性只能用 d cx cy r rx ry x y width height x1 y1 x2 y2 points fill stroke stroke-width stroke-linecap stroke-linejoin opacity fill-opacity transform class；顏色只用 #十六進位；不要文字、圖片、漸層、濾鏡、url()。back 與 front 各 2500 字以內。不要遮住兩人的臉。`

const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g'])
const ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'transform', 'class',
])
const CLASSES = new Set(['float', 'twinkle', 'rain', 'steam'])
const SAFE_VALUE = /^[#\w\s.,\-()%]*$/

/** Keeps only plain shape tags and attributes; drops everything else. */
function cleanSvg(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const out: string[] = []
  const tag = /<\s*(\/?)\s*([a-zA-Z]+)([^<>]*?)(\/?)\s*>/g
  let m: RegExpExecArray | null
  let depth = 0
  while ((m = tag.exec(raw.slice(0, 4000))) !== null) {
    const [, closing, nameRaw, attrText, selfClose] = m
    const name = (nameRaw ?? '').toLowerCase()
    if (!TAGS.has(name)) continue
    if (closing) {
      if (name === 'g' && depth > 0) {
        depth -= 1
        out.push('</g>')
      }
      continue
    }
    const attrs: string[] = []
    const attr = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g
    let a: RegExpExecArray | null
    while ((a = attr.exec(attrText ?? '')) !== null) {
      const key = (a[1] ?? '').toLowerCase()
      const value = a[2] ?? ''
      if (!ATTRS.has(key) || !SAFE_VALUE.test(value) || /url|script|expression/i.test(value)) continue
      if (key === 'class') {
        const kept = value.split(/\s+/).filter(c => CLASSES.has(c))
        if (kept.length > 0) attrs.push(`class="${kept.join(' ')}"`)
        continue
      }
      if (key === 'transform' && !/^(translate|rotate|scale)\([\d\s.,-]*\)(\s+(translate|rotate|scale)\([\d\s.,-]*\))*$/.test(value.trim())) continue
      attrs.push(`${key}="${value}"`)
    }
    if (name === 'g' && !selfClose) {
      depth += 1
      out.push(`<g ${attrs.join(' ')}>`)
    } else {
      out.push(`<${name} ${attrs.join(' ')}/>`)
    }
  }
  while (depth-- > 0) out.push('</g>')
  return out.join('')
}

function look(v: unknown): Look {
  return v === 'up' || v === 'front' ? v : 'side'
}

/** A hand within reach of its shoulder; else the resting spot. */
function hand(v: unknown, shoulder: [number, number], rest: [number, number]): [number, number] {
  if (!Array.isArray(v) || typeof v[0] !== 'number' || typeof v[1] !== 'number') return rest
  const x = v[0]
  const y = v[1]
  const dx = x - shoulder[0]
  const dy = y - shoulder[1]
  const d = Math.hypot(dx, dy)
  if (!Number.isFinite(d)) return rest
  if (d <= 34) return [Math.round(x), Math.round(y)]
  return [Math.round(shoulder[0] + (dx / d) * 34), Math.round(shoulder[1] + (dy / d) * 34)]
}

function parse(text: string): AiScene | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let o: Record<string, unknown>
  try {
    o = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const caption = typeof o['caption'] === 'string' ? o['caption'].replace(/[<>]/g, '').slice(0, 40) : ''
  if (caption === '') return null
  return {
    caption,
    junLook: look(o['junLook']),
    yingLook: look(o['yingLook']),
    junLeft: hand(o['junLeft'], [JX - 13, 90], [JX - 20, 114]),
    junRight: hand(o['junRight'], [JX + 13, 90], [JX + 20, 114]),
    yingLeft: hand(o['yingLeft'], [YX - 12, 90], [YX - 19, 114]),
    yingRight: hand(o['yingRight'], [YX + 12, 90], [YX + 19, 114]),
    back: cleanSvg(o['back']),
    front: cleanSvg(o['front']),
  }
}

/** Asks the model for a fresh scene; null when it fails, so the caller keeps a fixed one. */
export async function makeAiScene($: EngineInterface, recent: readonly string[]): Promise<AiScene | null> {
  const avoid = recent.length > 0 ? `最近畫過的場景（這次請想不一樣的）：${recent.join('、')}` : '這是第一個場景。'
  const r = await $.model
    .complete({ model: 'sonnet', system: SYSTEM, prompt: avoid, maxTokens: 4096, effort: 'low', timeoutMs: 60000 })
    .catch(() => null)
  if (!r || !r.isAnswered) return null
  return parse(r.text)
}
