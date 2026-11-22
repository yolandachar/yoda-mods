export type Mode = 'auto' | 'always' | 'off'
export type TidyEntry = { at: number; raw: string; tidied: string; isFailed: boolean }
/** One line of the side-pane conversation: what the person said, or the tidied draft. */
export type PadTurn = { at: number; role: 'me' | 'tidy'; text: string }

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Snapshot = {
  tokens?: number
  window: number
  percent?: number
  limits: Limit[]
  usd?: number
  hasUnknownPrice: boolean
  startedAt: number
  measuredAt: number
}
export type Category = { name: string; tokens: number }

export type RemindState = {
  waterMin: number
  eyesMin: number
  waterAt: number
  eyesAt: number
  active: 'water' | 'eyes' | null
  isPaused: boolean
  cups: number
  day: string
  line: number
}

export type Look = 'side' | 'up' | 'front'
/** A scene the model made up: poses for the two friends and the art around them. */
export type AiScene = {
  caption: string
  junLook: Look
  yingLook: Look
  junLeft: [number, number]
  junRight: [number, number]
  yingLeft: [number, number]
  yingRight: [number, number]
  back: string
  front: string
}

export type StepState = 'pending' | 'in_progress' | 'completed'
/** One Claude session as the task console shows it. */
export type ConsoleRow = {
  id: string
  title: string
  /** waiting on you, working, just finished, finished a while ago, or ended in an error */
  status: 'waiting' | 'running' | 'done' | 'idle' | 'error'
  done: number
  total: number
  current: string
  waiting: string
  recap: string
  lastAt: number
  /** When its last turn ended: since when it waits, or when it finished. */
  edgeAt: number
}

/** One day of Yoda's Daily. */
export type DailyDay = { ml: number; cups: number; toilet: number[]; eyes: number; stands: number }
export type DailySettings = { goalMl: number; cupMl: number; waterMin: number; eyesMin: number; sitMin: number; city: string }
export type DailyWeather = { city: string; temp: number | null; code: number; at: number; note: string }

declare module 'claude-code' {
  interface PluginState {
    'valley-theme': {
      mode: Mode
      busy: boolean
      history: Shaped<TidyEntry[]>
      pad: Shaped<PadTurn[]>
      padBusy: boolean
      notice: string
      snapshot: Shaped<Snapshot | null>
      categories: Shaped<Category[] | null>
      isLoadingDetail: boolean
      remind: Shaped<RemindState | null>
      scene: number
      aiScene: Shaped<AiScene | null>
      sceneBusy: boolean
      consoleRows: Shaped<ConsoleRow[]>
      consoleAt: number
      studioArrivals: number
      consoleOpen: Shaped<string[]>
      padEdit: Shaped<{ at: number; text: string }>
      padSettings: boolean
      dailyToday: Shaped<{ day: string; data: DailyDay }>
      dailySettings: Shaped<DailySettings>
      dailyDue: Shaped<{ water: number; eyes: number; sit: number; active: string }>
      dailyWeather: Shaped<DailyWeather | null>
      dailyPanel: Shaped<string>
      dailyHistory: Shaped<Record<string, DailyDay>>
      dailyOutfit: Shaped<{ day: string; outfit: 'casual' | 'home' | 'sport' | 'summer' | 'winter' | 'raincoat' }>
    }
  }
}
