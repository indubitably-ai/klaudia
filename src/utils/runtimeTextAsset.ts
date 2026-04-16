import { readFileSync } from 'fs'

type BundledTextAssetModule = string | { default: string } | null | undefined

function normalizeBundledTextAsset(mod: BundledTextAssetModule): string | null {
  if (typeof mod === 'string') {
    return mod
  }

  if (mod && typeof mod === 'object' && typeof mod.default === 'string') {
    return mod.default
  }

  return null
}

export function loadOptionalTextAsset({
  relativePath,
  importMetaUrl,
  fallback = '',
  inline,
}: {
  relativePath: string
  importMetaUrl: string
  fallback?: string
  inline?: () => BundledTextAssetModule
}): string {
  if (inline) {
    try {
      const bundled = normalizeBundledTextAsset(inline())
      if (bundled !== null) {
        return bundled
      }
    } catch {
      // Fall back to disk lookup when source-run mode cannot resolve the
      // build-time text asset import.
    }
  }

  try {
    return readFileSync(new URL(relativePath, importMetaUrl), 'utf8')
  } catch {
    return fallback
  }
}
