import type { StdoutMessage } from 'src/entrypoints/sdk/controlTypes.js'

export type Transport = {
  connect(): Promise<void> | void
  close(): void
  write(message: StdoutMessage): Promise<void>
  setOnData(callback: (data: string) => void): void
  setOnClose(callback: (closeCode?: number) => void): void
  setOnConnect?(callback: () => void): void
  setOnEvent?(callback: (event: unknown) => void): void
}
