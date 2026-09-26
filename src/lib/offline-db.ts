// Where a defect lives while the phone has no signal.
//
// IndexedDB, written by hand rather than with a library, for one reason:
// this is the store that can lose somebody's work, and a dependency that
// changes underneath it — or fails to install on a deployment — is a risk
// with nothing to gain against it. The API is ugly and about sixty lines.
//
// ── What is kept, and why each ─────────────────────────────────────────
//
//   queue      Defects raised with no signal, and their photographs as
//              Blobs. The photograph is stored WITH the defect rather than
//              in a second store, because two stores mean two writes and a
//              phone closed between them leaves a defect with no picture.
//
//   cache      The tag list and the open punch list, brought down on the
//              last online visit. Without the tag list there is nothing to
//              raise a defect against; without the open list the screen is
//              blank and looks broken.
//
// ── Persistence ────────────────────────────────────────────────────────
//
// Browsers evict storage under pressure. `navigator.storage.persist()` asks
// not to be evicted, and an installed app is usually granted it. This asks
// as soon as there is anything worth keeping — not on first load, when
// there is nothing to lose and the prompt would mean nothing.

import { migrate, type QueuedDefect } from '@/lib/offline-queue'

/**
 * NOT RENAMED WITH THE PRODUCT, AND IT MUST NOT BE.
 *
 * This is the name of a database sitting on somebody's phone. Change it and
 * the next time they open the app the browser hands them a brand-new empty
 * one — while the old database, with every defect they raised in a basement
 * and have not yet sent, is still there, orphaned, unreachable and invisible.
 * They would see a clean screen and conclude their work had gone up.
 *
 * A rename is a change of name. It is not worth one lost defect, and the day
 * this application is renamed again the same reasoning applies.
 */
const DB_NAME = 'cxsentinel-site'
const DB_VERSION = 1
const QUEUE = 'queue'
const CACHE = 'cache'

export type CachedSubject = { ref: string; code: string | null; name: string; type: string }

export type CachedOpen = {
  id: string
  ref: string | null
  title: string
  category: string | null
  status: string
  due_date: string | null
  required_action?: string | null
}

export type SiteCache = {
  project: { id: string; name: string } | null
  subjects: CachedSubject[]
  open: CachedOpen[]
  /** When this was brought down. Shown on screen — see `cacheWording`. */
  at: string | null
}

/**
 * A queued defect, with its photographs.
 *
 * The Blobs are stored WITH the defect rather than in a second store,
 * because two stores mean two writes and a phone closed between them leaves
 * a defect with no pictures.
 *
 * `photo` — singular — is what this was before one defect could carry
 * several. It is still read, because a phone may have queued something on
 * the old shape and not yet found a signal. It is never written.
 */
export type StoredDefect = QueuedDefect & { photoBlobs?: Blob[]; photo?: Blob | null }

// ── Telling the screen when the store changes ───────────────────────────
//
// Found by driving the real thing: a defect was saved on the phone, the
// form said so — and the banner right above it, the one whose whole job is
// to say "there are 2 defects on this phone", showed nothing at all. The
// form and the banner each had their own copy of the queue and neither knew
// the other had written.
//
// That is not a cosmetic bug. The banner is the mechanism that stops a
// queued defect being mistaken for a raised one, and a banner that appears
// only after a reload is a banner somebody walks away without seeing.
//
// So the store is what it actually is — something outside React that
// changes — and it says so. Every write notifies; the hook subscribes.
const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function changed(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // One bad listener must not stop the others being told.
    }
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'clientRef' })
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const request = work(tx.objectStore(store))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      })
  )
}

/** Whether this browser can hold anything at all. */
export function available(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

// ── The queue ───────────────────────────────────────────────────────────

export async function listQueue(): Promise<StoredDefect[]> {
  const rows = await run<StoredDefect[]>(QUEUE, 'readonly', (s) => s.getAll() as IDBRequest<StoredDefect[]>)
  return [...rows]
    .map((row) => {
      // Anything queued before several photographs were allowed is brought
      // forward on the way out, so nothing downstream has to know there were
      // ever two shapes — and nothing downstream can forget.
      const moved = migrate(row) as StoredDefect
      if (!moved.photoBlobs && row.photo) return { ...moved, photoBlobs: [row.photo] }
      return moved
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function putQueued(item: StoredDefect): Promise<void> {
  await run(QUEUE, 'readwrite', (s) => s.put(item))
  changed()
  // Now there IS something worth keeping.
  void askToPersist()
}

export async function dropQueued(clientRef: string): Promise<void> {
  await run(QUEUE, 'readwrite', (s) => s.delete(clientRef))
  changed()
}

export async function getQueued(clientRef: string): Promise<StoredDefect | undefined> {
  return run<StoredDefect | undefined>(QUEUE, 'readonly', (s) => s.get(clientRef) as IDBRequest<StoredDefect | undefined>)
}

// ── What was brought down last time ─────────────────────────────────────

const EMPTY: SiteCache = { project: null, subjects: [], open: [], at: null }

export async function readCache(): Promise<SiteCache> {
  try {
    const value = await run<SiteCache | undefined>(CACHE, 'readonly', (s) => s.get('site') as IDBRequest<SiteCache | undefined>)
    return value ?? EMPTY
  } catch {
    // A browser in private mode, or storage blocked entirely. The screen
    // must still draw — it will say it has nothing rather than break.
    return EMPTY
  }
}

export async function writeCache(value: SiteCache): Promise<void> {
  try {
    await run(CACHE, 'readwrite', (s) => s.put(value, 'site'))
  } catch {
    // Not worth failing a page load over. The queue is what matters, and it
    // is written separately.
  }
}

/**
 * Ask the browser not to evict this.
 *
 * On an installed app it is usually granted without a prompt. It is never
 * a guarantee, which is why the screen keeps telling somebody there is
 * something on the phone rather than letting them forget about it.
 */
export async function askToPersist(): Promise<boolean> {
  try {
    const storage = navigator.storage as { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> } | undefined
    if (!storage?.persist) return false
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

/** Roughly how much room is left, for the screen to warn with. */
export async function roomLeft(): Promise<{ usedMb: number; quotaMb: number } | null> {
  try {
    const storage = navigator.storage as { estimate?: () => Promise<{ usage?: number; quota?: number }> } | undefined
    if (!storage?.estimate) return null
    const { usage = 0, quota = 0 } = await storage.estimate()
    if (!quota) return null
    return { usedMb: usage / 1024 / 1024, quotaMb: quota / 1024 / 1024 }
  } catch {
    return null
  }
}
