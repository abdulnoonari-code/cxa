// Teaches plain node what `@/` means, so a check can import the application's
// own modules instead of a copy of them. Without this the suite would be
// asserting against its own transcription of the palette, which always passes.
import { pathToFileURL, fileURLToPath } from 'node:url'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
// This file sits in src/checks, so src is one level up. Not an absolute path:
// see the note at the top of brand.check.mts.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..') + '/'
const isFile = (p) => existsSync(p) && statSync(p).isFile()
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = ROOT + specifier.split('?')[0].slice(2)
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (isFile(base + ext)) return { url: pathToFileURL(base + ext).href, shortCircuit: true }
    }
    if (isFile(base)) return { url: pathToFileURL(base).href, shortCircuit: true }
  }
  return next(specifier, context)
}
