import { setSystemTime, vi } from 'bun:test'

export function useFakeTime(now: Date | string): void {
  vi.useFakeTimers()
  setSystemTime(typeof now === 'string' ? new Date(now) : now)
}

export function restoreTime(): void {
  if (vi.isFakeTimers()) {
    vi.useRealTimers()
  }
}
