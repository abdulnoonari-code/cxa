// Registers the `@/` alias hooks, resolved from this file's own directory so
// the suite runs wherever the repository is checked out.
import { register } from 'node:module'
register('./alias-hooks.mjs', import.meta.url)
