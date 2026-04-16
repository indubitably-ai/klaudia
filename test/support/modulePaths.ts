import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { mock } from 'bun:test'

let importNonce = 0

export function sourceModuleHref(sourcePath: string): string {
  return pathToFileURL(resolve(sourcePath)).href
}

export function mockSourceModule(
  sourcePath: string,
  factory: () => Record<string, unknown>,
): void {
  mock.module(sourceModuleHref(sourcePath), factory)
}

export async function importFreshSourceModule<T = unknown>(
  sourcePath: string,
): Promise<T> {
  importNonce += 1
  return import(
    `${sourceModuleHref(sourcePath)}?klaudia-test=${importNonce}`
  ) as Promise<T>
}
