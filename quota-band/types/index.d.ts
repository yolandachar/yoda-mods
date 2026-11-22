export type Window = { kind: string; percentUsed: number; resetsAt?: string }
export type ContextFill = { tokens: number | null; window: number }

declare module 'claude-code' {
  interface PluginState {
    'quota-band': {
      windows: Shaped<Window[]>
      context: Shaped<ContextFill | null>
      isHidden: boolean
    }
  }
}
