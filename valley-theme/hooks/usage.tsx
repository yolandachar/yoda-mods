import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, RenderInput, SessionUsage } from 'claude-code'

import type { Category, Snapshot } from '../types'

const PANE = 'valley-side'
const PANE_TITLE = "☕ Yoda's Daily"
const BAR_CELLS = 16

const snapshotAtom = atom({ plugin: 'valley-theme', key: 'snapshot' } as const, null as Snapshot | null, {
  shape: 'snapshot-1',
})
const categoriesAtom = atom({ plugin: 'valley-theme', key: 'categories' } as const, null as Category[] | null, {
  shape: 'categories-1',
})
const loadingAtom = atom({ plugin: 'valley-theme', key: 'isLoadingDetail' } as const, false)

const toSnapshot = (u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>, startedAt: number, now: number): Snapshot => ({
  tokens: u.context.tokens,
  window: u.context.window,
  percent: u.context.percent,
  limits: u.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  usd: u.cost?.usd,
  hasUnknownPrice: u.cost?.hasUnknownPrice === true,
  startedAt,
  measuredAt: now,
})

async function refresh($: EngineInterface) {
  const u = await $.session.usage()
  const snap = toSnapshot(u, u.startedAt, await $.clock.now())
  await update($, snapshotAtom, () => snap)
}

async function loadDetail($: EngineInterface) {
  await update($, loadingAtom, () => true)
  try {
    const u = await $.session.usage({ breakdown: 'summary' })
    const rows = (u.context.breakdown?.categories ?? [])
      .filter(c => !c.isDeferred && c.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens)
      .map(c => ({ name: c.name, tokens: c.tokens }))
    await update($, categoriesAtom, () => rows)
  } catch (error) {
    $.ui.log('usage-pane: ' + String(error))
  }
  await update($, loadingAtom, () => false)
}

const fmtTokens = (n: number) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n))
const bar = (pct: number) => {
  const filled = Math.max(0, Math.min(BAR_CELLS, Math.round((pct / 100) * BAR_CELLS)))
  return { on: '█'.repeat(filled), off: '░'.repeat(BAR_CELLS - filled) }
}
const tone = (pct: number) => (pct >= 85 ? 'danger' : pct >= 60 ? 'warning' : 'success')
const LIMIT_NAME: Record<string, string> = { five_hour: '5 小時', seven_day: '7 天', spend_limit: '花費上限' }

const resetIn = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms) || ms <= 0) return '即將重設'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)} 天 ${h % 24} 小時後重設`
  return h > 0 ? `${h} 小時 ${m} 分後重設` : `${m} 分後重設`
}
const duration = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000))
  return min >= 60 ? `${Math.floor(min / 60)} 小時 ${min % 60} 分` : `${min} 分`
}

// Called from the mod's one session.start hook.
export async function startUsage($: EngineInterface) {
  await $.command.register({ name: 'usage-pane', description: "重新打開右側的 ☕ Yoda's Daily" })
  void refresh($).catch(error => $.ui.log('usage-pane: ' + String(error)))
}

export function registerUsage(on: On) {

  on('command.run', { command: 'usage-pane' }, async $ => {
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    await refresh($)
    return { text: "已打開 ☕ Yoda's Daily。" }
  })

  // Pushed after each turn and when a rate-limit window moves.
  on('session.measure', async ($, e, next) => {
    const prev = await read($, snapshotAtom)
    const startedAt = prev?.startedAt ?? (await $.session.usage()).startedAt
    const snap = toSnapshot(e, startedAt, await $.clock.now())
    await update($, snapshotAtom, () => snap)
    if (e.changed.includes('context')) await update($, categoriesAtom, () => null)
    return next(e)
  })

}

export async function usageView($: EngineInterface, e: RenderInput<'Pane'>) {
    const { Box, Text, Button } = $.ui.resolve(e)
    const snap = await read($, snapshotAtom)
    const categories = await read($, categoriesAtom)
    const isLoading = await read($, loadingAtom)
    const now = await $.clock.now()

    if (snap === null) {
      return <Text dimColor>正在讀取用量…</Text>
    }
    const ctxPct = snap.percent ?? (snap.tokens !== undefined ? Math.round((snap.tokens / snap.window) * 100) : 0)

    if (e.props.placement === 'widget') {
      const five = snap.limits.find(l => l.kind === 'five_hour')
      return (
        <Text>
          📊 上下文 {ctxPct}%{five ? ` · 5h ${Math.round(five.percentUsed)}%` : ''}
        </Text>
      )
    }

    const ctxBar = bar(ctxPct)

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>上下文</Text>
          <Box flexDirection="row">
            <Text color={tone(ctxPct)}>{ctxBar.on}</Text>
            <Text dimColor>{ctxBar.off}</Text>
            <Text> {ctxPct}%</Text>
          </Box>
          <Text dimColor>
            {snap.tokens !== undefined ? fmtTokens(snap.tokens) : '—'} / {fmtTokens(snap.window)} tokens
          </Text>
          {ctxPct >= 85 && <Text color="danger">快滿了，可以考慮整理（compact）或開新對話。</Text>}
        </Box>

        <Box flexDirection="column">
          <Text bold>額度</Text>
          {snap.limits.length === 0 && <Text dimColor>還沒有額度資料（第一次回覆後會出現）。</Text>}
          {snap.limits.map(l => {
            const b = bar(l.percentUsed)
            return (
              <Box key={'limit-' + l.kind} flexDirection="column">
                <Box flexDirection="row">
                  <Text>{(LIMIT_NAME[l.kind] ?? l.kind) + ' '}</Text>
                  <Text color={tone(l.percentUsed)}>{b.on}</Text>
                  <Text dimColor>{b.off}</Text>
                  <Text> {l.percentUsed}%</Text>
                </Box>
                {l.resetsAt && <Text dimColor>{resetIn(l.resetsAt, now)}</Text>}
              </Box>
            )
          })}
        </Box>

        <Box flexDirection="column">
          <Text bold>本次 session</Text>
          <Text>
            花費約 {snap.usd !== undefined ? '$' + snap.usd.toFixed(2) : '—'}
            {snap.hasUnknownPrice ? '（部分模型未計價）' : ''}
          </Text>
          <Text dimColor>已進行 {duration(now - snap.startedAt)}（估算，不是帳單）</Text>
        </Box>

        <Box flexDirection="column">
          {categories === null ? (
            <Button key="detail" dimColor onPress={() => loadDetail($)}>
              {isLoading ? '讀取中…' : '上下文明細'}
            </Button>
          ) : (
            <Box flexDirection="column">
              <Text bold>上下文明細</Text>
              {categories.slice(0, 8).map(c => (
                <Text key={'cat-' + c.name}>
                  {c.name}　<Text dimColor>{fmtTokens(c.tokens)}</Text>
                </Text>
              ))}
              <Button key="hide-detail" dimColor onPress={() => update($, categoriesAtom, () => null)}>
                收起明細
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    )
}
