import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput } from 'claude-code'

import type { Mode, PadTurn, TidyEntry } from '../types'

const MODE_KEY = 'mode'
const PANE = 'valley-side'
const PANE_TITLE = "☕ Yoda's Daily"
const SKIP_PREFIXES = ['!raw', '原文:', '原文：']
const FILLERS = [
  '嗯', '呃', '額', '那個', '就是說', '然後呢', '怎麼說', '對吧', '你知道',
  '额', '那个', '就是说', '然后呢', '怎么说', '对吧',
  'um', 'uh', 'like,', 'you know', 'i mean', 'kind of', 'sort of', 'basically',
]

const SYSTEM = `你是一個"口述轉提示詞"整理器。輸入是用戶通過語音輸入的一段口頭想法，可能冗長、重複、跳躍、夾雜口頭禪和語音辨識錯誤。
你的任務：把它改寫成一條清晰、結構化、可以直接交給 AI 程式設計助手執行的提示詞。

規則：
1. 保留用戶的全部意圖、約束、細節、文件名、命令、数字和專有名詞，絕不添加用戶沒有說過的需求。
2. 刪除口頭禪、重複和自我糾正（以用戶最後的說法為準）；按上下文修正明顯的語音辨識錯誤。
3. 使用與用戶相同的語言（中文就用中文，英文就用英文）。
4. 按需使用以下結構（沒有內容的部分省略）：
   **目標**：一句話說明要做什麼
   **背景**：相關上下文
   **具體要求**：編號列表
   **約束 / 注意事項**：列表
   **待確認的問題**：用戶自己表達了不確定的地方
5. 如果原文已經很簡短清晰，只做最小修改。
6. 只輸出整理後的提示詞本身，不要任何前言、解釋或程式碼塊包裹。`

// Values the pane reads; each write redraws it.
const modeAtom = atom({ plugin: 'valley-theme', key: 'mode' } as const, 'auto' as Mode)
const busyAtom = atom({ plugin: 'valley-theme', key: 'busy' } as const, false)
const historyAtom = atom({ plugin: 'valley-theme', key: 'history' } as const, [] as TidyEntry[], {
  shape: 'history-1',
})

// The side pane's own conversation: think out loud, refine, then hand the draft over.
const padAtom = atom({ plugin: 'valley-theme', key: 'pad' } as const, [] as PadTurn[], { shape: 'pad-1' })
const padBusyAtom = atom({ plugin: 'valley-theme', key: 'padBusy' } as const, false)
const noticeAtom = atom({ plugin: 'valley-theme', key: 'notice' } as const, '')

const PAD_SYSTEM = `${SYSTEM}

補充：你在一個側邊草稿面板裡和用戶來回溝通。
- 對話中第一條"用戶"訊息是最初的口述想法；之後的"用戶"訊息可能是補充、修改意見或糾正。
- 每次都根據全部對話，輸出一份完整的、最新的整理稿（不是只輸出改動部分）。
- 依然只輸出整理稿本身。`

const padPrompt = (turns: readonly PadTurn[]) =>
  turns
    .map(t => (t.role === 'me' ? `<用戶>\n${t.text}\n</用戶>` : `<你上一版的整理稿>\n${t.text}\n</你上一版的整理稿>`))
    .join('\n\n') + '\n\n請輸出最新的完整整理稿。'

// The person's own edit of the latest draft (by that draft's time), kept until a new draft comes.
const editAtom = atom({ plugin: 'valley-theme', key: 'padEdit' } as const, { at: 0, text: '' }, { shape: 'pad-edit-1' })
const settingsAtom = atom({ plugin: 'valley-theme', key: 'padSettings' } as const, false)

const latestTidy = (turns: readonly PadTurn[]) => [...turns].reverse().find(t => t.role === 'tidy')

async function flash($: EngineInterface, text: string) {
  await update($, noticeAtom, () => text)
  void $.clock.sleep(3000).then(() => update($, noticeAtom, now => (now === text ? '' : now)))
}

/** The prompt as it stands: the person's edit of the latest draft, else the draft. */
async function currentPrompt($: EngineInterface): Promise<string> {
  const last = latestTidy(await read($, padAtom))
  if (!last) return ''
  const edit = await read($, editAtom)
  return edit.at === last.at ? edit.text : last.text
}

// Asks the model for a fresh full prompt from the whole conversation.
async function padRun($: EngineInterface, turns: PadTurn[]) {
  await update($, padBusyAtom, () => true)
  const r = await $.model
    .complete({ model: 'sonnet', system: PAD_SYSTEM, prompt: padPrompt(turns), maxTokens: 2048, effort: 'low', timeoutMs: 45000 })
    .catch(() => null)
  await update($, padBusyAtom, () => false)
  const tidied = r && r.isAnswered ? r.text.trim() : ''
  if (tidied === '') {
    await flash($, '整理失敗了，再試一次？')
    return
  }
  await update($, padAtom, () => [...turns, { at: Date.now(), role: 'tidy' as const, text: tidied }].slice(-40))
}

/** A new idea, an addition, or "shorter please": always built on the latest version, edits included. */
async function padSend($: EngineInterface, value: string) {
  const text = value.trim()
  if (text === '' || (await read($, padBusyAtom))) return
  const pad = await read($, padAtom)
  const last = latestTidy(pad)
  const edit = await read($, editAtom)
  const base = last && edit.at === last.at && edit.text.trim() !== '' && edit.text !== last.text
    ? [...pad, { at: Date.now() - 1, role: 'tidy' as const, text: edit.text }]
    : [...pad]
  const turns = [...base, { at: Date.now(), role: 'me' as const, text }]
  await update($, padAtom, () => turns)
  await padRun($, turns)
}

/** Tidies the same words again, for another take. */
async function padRedo($: EngineInterface) {
  if (await read($, padBusyAtom)) return
  const pad = await read($, padAtom)
  let cut = pad.length
  while (cut > 0 && pad[cut - 1]!.role === 'tidy') cut -= 1
  if (cut === 0) return
  await padRun($, pad.slice(0, cut))
}

const fillerCount = (text: string) => {
  const lower = text.toLowerCase()
  return FILLERS.reduce((n, f) => n + (lower.split(f).length - 1), 0)
}

// 自動模式：看起來像口述的長文字（較長，或帶有多個口頭禪），且不像程式碼/紀錄貼上
const looksSpoken = (text: string) => {
  if (text.includes('```') || text.split('\n').length > 12) return false
  const len = text.length
  return len >= 200 || (len >= 60 && fillerCount(text) >= 2)
}

async function storedMode($: EngineInterface): Promise<Mode> {
  const m = await $.store.get(MODE_KEY)
  return m === 'always' || m === 'off' ? m : 'auto'
}

const MODE_LABEL: Record<Mode, string> = {
  auto: '自動（只整理看起來像口述的長文字）',
  always: '總是整理',
  off: '關閉',
}
const MODE_SHORT: Record<Mode, string> = { auto: '自動', always: '總是', off: '關閉' }

function showStatus($: EngineInterface, mode: Mode) {
  return $.ui.status(mode === 'off' ? undefined : '🎙 語音整理：' + MODE_SHORT[mode])
}

async function setMode($: EngineInterface, mode: Mode) {
  await $.store.set(MODE_KEY, mode)
  await update($, modeAtom, () => mode)
  showStatus($, mode)
}

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max) + '…' : text)
const clock = (at: number) => {
  const d = new Date(at)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

// Called from the mod's one session.start hook.
export async function startTidy($: EngineInterface) {
  await $.command.register({
    name: 'tidyup',
    description: '語音整理：/tidyup auto | always | off | status | panel',
  })
  const mode = await storedMode($)
  await update($, modeAtom, () => mode)
  await update($, busyAtom, () => false)
  showStatus($, mode)
}

export function registerTidy(on: On) {

  on('command.run', { command: 'tidyup' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg === 'auto' || arg === 'always' || arg === 'off') {
      await setMode($, arg)
      return { text: '語音整理已切換為：' + MODE_LABEL[arg] }
    }
    if (arg === 'panel') {
      await $.ui.open({ id: PANE, title: PANE_TITLE })
      return { text: "已打開 ☕ Yoda's Daily。" }
    }
    const mode = await storedMode($)
    return {
      text:
        '語音整理當前模式：' + MODE_LABEL[mode] +
        '\n用法：/tidyup auto | always | off | panel' +
        '\n單條跳過：在訊息開頭加 "!raw" 或 "原文:"',
    }
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return next(e)

    const raw = e.text.trim()
    const skip = SKIP_PREFIXES.find(p => raw.toLowerCase().startsWith(p))
    if (skip) return next({ ...e, text: raw.slice(skip.length).trim() })

    const mode = await storedMode($)
    if (mode === 'off') return next(e)
    if (mode === 'auto' && !looksSpoken(raw)) return next(e)

    $.ui.status('🎙 正在整理語音輸入…')
    await update($, busyAtom, () => true)
    const r = await $.model
      .complete({
        model: 'sonnet',
        system: SYSTEM,
        prompt: `<口述原文>\n${raw}\n</口述原文>`,
        maxTokens: 2048,
        effort: 'low',
        timeoutMs: 30000,
      })
      .catch(() => null)
    await update($, busyAtom, () => false)
    showStatus($, mode)

    const tidied = r && r.isAnswered ? r.text.trim() : ''
    await update($, historyAtom, list =>
      [...list, { at: Date.now(), raw, tidied, isFailed: tidied === '' }].slice(-20),
    )

    if (tidied === '') {
      $.ui.toast('語音整理失敗，已按原文發送')
      return next(e)
    }

    $.ui.toast('🎙 已把口述整理成結構化提示詞')
    return next({
      ...e,
      text: tidied,
      context: [
        ...(e.context ?? []),
        `以上提示詞由 voice-tidy 從用戶的語音口述自動整理而來。若整理稿與原意可能有出入，以下是用戶的口述原文，供核對：\n${raw}`,
      ],
    })
  })

}

export async function tidyView($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const mode = await read($, modeAtom)
  const busy = await read($, busyAtom)
  const pad = await read($, padAtom)
  const padBusy = await read($, padBusyAtom)
  const notice = await read($, noticeAtom)
  const showSettings = await read($, settingsAtom)
  const last = latestTidy(pad)
  const prompt = await currentPrompt($)

  // Minimized on the desktop: one line at a glance.
  if (e.props.placement === 'widget') {
    return <Text>{padBusy || busy ? '✨ 整理中…' : prompt ? '✨ 指令已準備好' : '✨ ' + MODE_SHORT[mode]}</Text>
  }

  const use = async () => {
    const text = await currentPrompt($)
    if (text.trim() === '') return
    const done = await $.prompt.fill({ text, mode: 'replace' })
    await flash($, done.isFilled ? '✅ 已填入 Claude 對話框' : '沒能填入，請改用「複製指令」')
  }
  const modeButton = (m: Mode) => (
    <Button key={'mode-' + m} variant={mode === m ? 'primary' : 'secondary'} onPress={() => setMode($, m)}>
      {MODE_SHORT[m]}
    </Button>
  )

  return (
    <Box flexDirection="column" gap={1}>
      {/* the result, editable in place */}
      {last ? (
        <Box flexDirection="column">
          <Text dimColor>整理好的指令（可直接修改）</Text>
          <Input
            key={'pad-result-' + last.at}
            rows={10}
            value={prompt}
            submitLabel="使用指令"
            onInput={value => update($, editAtom, () => ({ at: last.at, text: value }))}
            onSubmit={() => use()}
          />
        </Box>
      ) : (
        <Text dimColor>寫下你的想法，按 Enter，我會整理成清楚的 Claude 指令。之後可以直接修改，或再輸入「簡短一點」「補充以下要求…」繼續調整。</Text>
      )}

      {padBusy && <Text color="warning">⏳ 正在整理…</Text>}
      {notice !== '' && <Text color="success">{notice}</Text>}

      {last && (
        <Box flexDirection="row" gap={1}>
          <Button key="pad-use" variant="primary" onPress={() => use()}>
            使用指令
          </Button>
          <Button
            key="pad-copy"
            onPress={async press => {
              await $.ui.copy({ text: await currentPrompt($), surface: press.surface })
              await flash($, '📋 已複製')
            }}
          >
            複製指令
          </Button>
          <Button key="pad-redo" onPress={() => padRedo($)}>
            重新整理
          </Button>
          <Button
            key="pad-new"
            dimColor
            onPress={async () => {
              await update($, padAtom, () => [])
              await update($, editAtom, () => ({ at: 0, text: '' }))
            }}
          >
            清空
          </Button>
        </Box>
      )}

      {/* one box for a new idea, an addition or a change */}
      <Input
        key="pad-input"
        rows={3}
        autoFocus
        value=""
        placeholder={last ? '補充、修改，或說「簡短一點」…（Enter 送出）' : '輸入你的想法…（Enter 送出）'}
        submitLabel="整理"
        onSubmit={value => padSend($, value)}
      />

      <Button key="pad-settings" dimColor onPress={() => update($, settingsAtom, v => !v)}>
        {showSettings ? '⚙ 收起設定' : '⚙ 設定'}
      </Button>
      {showSettings && (
        <Box flexDirection="column">
          <Text dimColor>主對話的自動整理：</Text>
          <Box flexDirection="row" gap={1}>
            {modeButton('auto')}
            {modeButton('always')}
            {modeButton('off')}
          </Box>
          <Text dimColor>{MODE_LABEL[mode]}</Text>
          {busy && <Text color="warning">⏳ 正在整理主對話的輸入…</Text>}
        </Box>
      )}
    </Box>
  )
}
