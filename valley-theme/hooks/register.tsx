import type { Register, ThemeMessageRule, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { consoleView, startConsole } from './console'
import { dailyView, registerDaily, startDaily } from './daily'
import { SCENE } from './scene'
import { registerTidy, startTidy, tidyView } from './tidy'
import { registerUsage, startUsage } from './usage'

// ☕ Yoda's Daily: one Yoda and the day's life dashboard. 🏡 Yoda's Studio holds the work.
const SIDE = 'valley-side'
const SIDE_TITLE = "☕ Yoda's Daily"
// The command center: its own full pane, a tab beside the side pane.
const COMMAND = 'valley-command'
const COMMAND_TITLE = "🏡 Yoda's Studio"

// 北歐童話山谷：白天是奶油白與粉藍天空，夜晚是森林與星空。
const { theme, problems } = makeColors({
  label: 'Nordic Valley',
  roles: { accent: '#4f86b8', danger: '#c0545e', success: '#3f8a63', warning: '#b07a1f', pro: '#b0628f' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f3ecdc',
        'surface-1': '#f8f2e5',
        'surface-2': '#fdf9f0',
        'text-primary': '#243a33',
        'text-secondary': '#40564e',
        'text-muted': '#5a6e66',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#141f22',
        'surface-1': '#1a272a',
        'surface-2': '#203033',
        'surface-3': '#25363a',
        'text-primary': '#f1ebdc',
        'text-secondary': '#cfd8cf',
        'text-muted': '#a6b5ad',
      },
    },
  },
})

const bubble: ThemeMessageRule = {
  radius: 18,
  paddingX: 16,
  paddingY: 12,
  shadow: { x: 0, y: 2, blur: 8, color: '#2a3d3522' },
}

const BASE: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: 'nordic-valley-v4', glass: { blur: 18, opacity: 0.62 } },
}

const LOOK: ThemeSetArgs = {
  ...BASE,
  style: {
    Text: { fontFamily: ['sans'], fontSize: 15, lineHeight: 24 },
    Heading: { fontFamily: ['sans'], fontWeight: 'semibold', color: 'text-primary' },
    UserMessage: [
      { ...bubble, backgroundColor: '#fbe3e8', color: '#3a2a30', borderColor: '#f0c4cf', borderWidth: 1 },
      { ...bubble, backgroundColor: '#dcefe4', color: '#243a33', borderColor: '#b9dcc8', borderWidth: 1 },
    ],
    AssistantMessage: { ...bubble, backgroundColor: 'surface-2', borderColor: '#cfe3ee', borderWidth: 1 },
    ToolUse: { backgroundColor: 'surface-1', radius: 10, paddingX: 8 },
  },
}

export const register: Register = on => {
  registerDaily(on)
  registerUsage(on)
  registerTidy(on)

  on('ui.render', { component: 'Pane', requestId: SIDE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const daily = await dailyView($, e)
    if (e.props.placement === 'widget') return daily
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{SIDE_TITLE}</Text>
        {daily}
      </Box>
    )
  })

  // The command center, with the idea pad under it: jot anything, get a prompt Claude reads well.
  on('ui.render', { component: 'Pane', requestId: COMMAND }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const board = await consoleView($, e)
    const pad = await tidyView($, e)

    if (e.props.placement === 'widget') {
      return board
    }

    return (
      <Box flexDirection="column" gap={1}>
        {board}
        <Text dimColor>────────────────────</Text>
        <Text bold color="accent">✨ Yoda's Prompt Assistant</Text>
        {pad}
      </Box>
    )
  })

  on('command.run', { command: 'command-center' }, async $ => {
    await $.ui.open({ id: COMMAND, title: COMMAND_TITLE })
    return { text: "已打開 🏡 Yoda's Studio。" }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return (
      <Svg
        source={SCENE}
        alt="A quiet Nordic valley with pine trees and drifting clouds"
        isInteractive
      />
    )
  })

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    let set
    try {
      set = await $.theme.set(LOOK)
    } catch (error) {
      $.ui.log(String(error))
      set = await $.theme.set(BASE)
    }
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    // Redraw the backdrop so a reload never keeps an older scene on screen.
    $.ui.invalidate('ui.render')
    await startUsage($)
    await startTidy($)
    await startDaily($)
    await startConsole($)
    await $.command.register({ name: 'command-center', description: "打開 🏡 Yoda's Studio：所有任務的進度與等你處理的事" })
    void $.ui.open({ id: COMMAND, title: COMMAND_TITLE })
    void $.ui.open({ id: SIDE, title: SIDE_TITLE })

    return next(e)
  })
}
