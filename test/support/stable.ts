function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortDeep)
  }

  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortDeep(nested)]),
    )
  }

  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2)
}
