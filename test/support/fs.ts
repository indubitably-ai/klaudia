import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

const tempDirs = new Set<string>()

export async function createTempWorkspace(
  prefix = 'klaudia-harness-',
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.add(dir)
  return dir
}

export async function ensureDir(path: string): Promise<string> {
  await mkdir(path, { recursive: true })
  return path
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<string> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return path
}

export async function writeJsonFile(
  path: string,
  value: unknown,
): Promise<string> {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

export async function cleanupTempWorkspaces(): Promise<void> {
  await Promise.all(
    [...tempDirs].map(dir => rm(dir, { recursive: true, force: true })),
  )
  tempDirs.clear()
}
