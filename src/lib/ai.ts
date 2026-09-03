// The Claude layer.
//
// Everything else in CxSentinel is arithmetic: it reads records and reports
// what they contradict. That costs nothing, never varies, and can be defended
// line by line. This file is the one place that asks a model to read wording
// and form a judgement, and it is deliberately fenced:
//
//   • The API key lives in Vercel → Settings → Environment Variables as
//     ANTHROPIC_API_KEY. It is read here, server-side, and never reaches the
//     browser, the database, a log line, or a URL.
//   • Nothing here writes to any table. A model's opinion is a suggestion on
//     a screen, never a change to a record. Every record still changes only
//     when a person changes it.
//   • It only runs when somebody asks for it, so it cannot quietly spend
//     money in the background.
//   • If the key is absent, everything degrades to the arithmetic and the
//     screen says so. Nothing breaks.

const API = 'https://api.anthropic.com/v1'
const VERSION = '2023-06-01'

export type AiOutcome<T> =
  | { ok: true; value: T; model: string; inputTokens: number; outputTokens: number }
  | { ok: false; reason: string; hint: string | null }

/** Is a key configured on the server? Never returns the key itself. */
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

function key(): string | null {
  const value = process.env.ANTHROPIC_API_KEY
  return value && value.trim() ? value.trim() : null
}

// Model IDs change over time, and a hard-coded one is a time bomb: the app
// starts failing on a day nobody touched it. So the name is taken from
// ANTHROPIC_MODEL if it is set, and otherwise discovered by asking the API
// which models this key can actually use.
let cachedModel: string | null = null

async function resolveModel(apiKey: string): Promise<{ model: string | null; reason: string | null }> {
  const configured = process.env.ANTHROPIC_MODEL?.trim()
  if (configured) return { model: configured, reason: null }
  if (cachedModel) return { model: cachedModel, reason: null }

  try {
    const response = await fetch(`${API}/models?limit=20`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': VERSION },
      cache: 'no-store',
    })
    if (!response.ok) {
      return { model: null, reason: `The API refused the model list (HTTP ${response.status}).` }
    }
    const body = (await response.json()) as { data?: { id: string }[] }
    const first = body.data?.[0]?.id
    if (!first) return { model: null, reason: 'The API returned no models for this key.' }
    cachedModel = first
    return { model: first, reason: null }
  } catch {
    return { model: null, reason: 'Could not reach the Anthropic API to find out which models this key can use.' }
  }
}

/**
 * Ask Claude one question and get the text back.
 *
 * Never throws. Every failure — no key, no network, a refused request, a
 * timeout — comes back as `{ ok: false }` with something a site engineer can
 * act on, because the alternative is a 500 page on a screen that was working
 * fine a moment ago.
 */
export async function ask(options: {
  system: string
  prompt: string
  maxTokens?: number
  timeoutMs?: number
}): Promise<AiOutcome<string>> {
  const apiKey = key()
  if (!apiKey) {
    return {
      ok: false,
      reason: 'No Anthropic API key is configured on this deployment.',
      hint: 'Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy. Do not put the key in the code, in a file, or in a chat message.',
    }
  }

  const { model, reason } = await resolveModel(apiKey)
  if (!model) {
    return {
      ok: false,
      reason: reason ?? 'Could not work out which model to use.',
      hint: 'Set ANTHROPIC_MODEL in Vercel → Settings → Environment Variables to the model id you want to use.',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000)

  try {
    const response = await fetch(`${API}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 2000,
        system: options.system,
        messages: [{ role: 'user', content: options.prompt }],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      // The API's own message is far more useful than anything invented
      // here — a wrong model name, an exhausted credit balance and an
      // invalid key all say so plainly — but it is passed through as text,
      // never parsed for meaning.
      let detail = `HTTP ${response.status}`
      try {
        const body = (await response.json()) as { error?: { message?: string } }
        if (body.error?.message) detail = body.error.message
      } catch {
        /* the body was not JSON; the status code will have to do */
      }
      return {
        ok: false,
        reason: `The Anthropic API refused the request: ${detail}`,
        hint:
          response.status === 401
            ? 'The key was rejected. Check ANTHROPIC_API_KEY in Vercel.'
            : response.status === 400
              ? 'Often a model id that does not exist. Set ANTHROPIC_MODEL in Vercel, or unset it to let the app discover one.'
              : null,
      }
    }

    const body = (await response.json()) as {
      content?: { type: string; text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }

    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim()

    if (!text) return { ok: false, reason: 'The model returned nothing.', hint: null }

    return {
      ok: true,
      value: text,
      model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      reason: aborted
        ? 'The request took too long and was stopped.'
        : 'Could not reach the Anthropic API from this deployment.',
      hint: aborted ? 'Try again with a smaller scope — one system rather than the whole project.' : null,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── Asking about a picture ───────────────────────────────────────────────

export type ImageInput = {
  /** image/jpeg, image/png, image/webp or image/gif. */
  mediaType: string
  /** The raw bytes, already read on the server. Never a URL — the model is not
      given anything that would make it fetch from this deployment. */
  bytes: ArrayBuffer | Uint8Array | Buffer
}

/**
 * Ask Claude about one or more photographs.
 *
 * The same fenced layer as `ask()`: the key is read from the environment on
 * the server, never returned, never logged, never put in a URL. The images go
 * up as base64 in the request body and are not stored anywhere by this
 * function.
 *
 * Images are sent in the order given, which matters — a before-and-after
 * comparison depends on the model being told which is which, and the prompt
 * says "the first" and "the second".
 */
export async function askAboutImages(options: {
  system: string
  prompt: string
  images: ImageInput[]
  maxTokens?: number
  timeoutMs?: number
}): Promise<AiOutcome<string>> {
  const apiKey = key()
  if (!apiKey) {
    return {
      ok: false,
      reason: 'No Anthropic API key is configured on this deployment.',
      hint: 'Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy. Do not put the key in the code, in a file, or in a chat message.',
    }
  }
  if (options.images.length === 0) {
    return { ok: false, reason: 'No photograph was given to look at.', hint: null }
  }

  const { model, reason } = await resolveModel(apiKey)
  if (!model) {
    return {
      ok: false,
      reason: reason ?? 'Could not work out which model to use.',
      hint: 'Set ANTHROPIC_MODEL in Vercel → Settings → Environment Variables to the model id you want to use.',
    }
  }

  const content: unknown[] = options.images.map((image) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mediaType,
      data: Buffer.from(image.bytes as ArrayBuffer).toString('base64'),
    },
  }))
  content.push({ type: 'text', text: options.prompt })

  const controller = new AbortController()
  // Vision costs more time than text. A minute is not enough on a slow link
  // with two five-megabyte photographs in the body.
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 90_000)

  try {
    const response = await fetch(`${API}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 1200,
        system: options.system,
        messages: [{ role: 'user', content }],
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const body = (await response.json()) as { error?: { message?: string } }
        if (body.error?.message) detail = body.error.message
      } catch {
        /* the body was not JSON; the status code will have to do */
      }
      return {
        ok: false,
        reason: `The Anthropic API refused the request: ${detail}`,
        hint:
          response.status === 401
            ? 'The key was rejected. Check ANTHROPIC_API_KEY in Vercel.'
            : response.status === 413
              ? 'The photograph was too large to send. Upload a smaller one.'
              : response.status === 400
                ? 'Often a model that cannot see images, or one that does not exist. Set ANTHROPIC_MODEL in Vercel to a current model.'
                : null,
      }
    }

    const body = (await response.json()) as {
      content?: { type: string; text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim()

    if (!text) return { ok: false, reason: 'The model returned nothing.', hint: null }

    return {
      ok: true,
      value: text,
      model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return {
      ok: false,
      reason: aborted
        ? 'Looking at the photograph took too long and was stopped.'
        : 'Could not reach the Anthropic API from this deployment.',
      hint: aborted ? 'Try one photograph rather than a before-and-after pair.' : null,
    }
  } finally {
    clearTimeout(timer)
  }
}

// ── Getting structured answers back ──────────────────────────────────────

/**
 * Pull a JSON array out of a model's reply.
 *
 * Models are asked for bare JSON and usually give it, but "usually" is not a
 * contract, so a fenced block or a sentence of preamble is tolerated. If it
 * still cannot be read the raw text is handed back to the screen rather than
 * thrown away — a paragraph the engineer can read beats an error message.
 */
export function extractJsonArray<T>(text: string): { items: T[] | null; raw: string } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidates = [fenced?.[1], text].filter((v): v is string => typeof v === 'string')

  for (const candidate of candidates) {
    const start = candidate.indexOf('[')
    const end = candidate.lastIndexOf(']')
    if (start === -1 || end <= start) continue
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1))
      if (Array.isArray(parsed)) return { items: parsed as T[], raw: text }
    } catch {
      /* try the next candidate */
    }
  }

  return { items: null, raw: text }
}


/**
 * Pull a JSON object out of a model reply.
 *
 * Models wrap JSON in ```json fences perhaps a third of the time whatever the
 * prompt says, so the fence is stripped before anything else. Kept here, in
 * one place, because three separate assessments parse replies and each one
 * having its own idea of what a reply looks like is how they drift apart.
 *
 * It deliberately does NOT decide whether the object is useful — that depends
 * on which assessment asked, and a parser that judges content is a parser
 * that rejects a perfectly good clean result.
 */
export function readJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : raw
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const parsed = JSON.parse(body.slice(start, end + 1))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
