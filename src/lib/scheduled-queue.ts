/**
 * Server-only: scheduled posts queue stored in a local JSON file.
 * Used when "Schedule" is selected; processed by cron or in-process tick.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DATA_DIR = join(process.cwd(), 'data')
const SCHEDULED_FILE = join(DATA_DIR, 'scheduled-posts.json')

export type ScheduledItemYoutube = {
  videoId: string
  publishAt: string
}

export type ScheduledItem = {
  id: string
  caption: string
  mediaPath: string
  mediaType: 'image' | 'video'
  scheduledAt: string
  postToBluesky: boolean
  postToYoutube: boolean
  createdAt: string
  /** stored when scheduling so cron can post without browser cookie */
  blueskySessionId?: string
  youtube?: ScheduledItemYoutube
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function readQueue(): ScheduledItem[] {
  if (!existsSync(SCHEDULED_FILE)) return []
  try {
    const raw = readFileSync(SCHEDULED_FILE, 'utf-8')
    const data = JSON.parse(raw) as ScheduledItem[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeQueue(items: ScheduledItem[]): void {
  ensureDir(DATA_DIR)
  writeFileSync(SCHEDULED_FILE, JSON.stringify(items, null, 2), 'utf-8')
}

/** Read all scheduled items (for UI list). */
export function readScheduled(): ScheduledItem[] {
  return readQueue().sort(
    (a, b) => new Date(a.scheduledAt).valueOf() - new Date(b.scheduledAt).valueOf(),
  )
}

/** Get items that are due (scheduledAt <= now). */
export function getDueScheduled(): ScheduledItem[] {
  const now = new Date().toISOString()
  return readQueue().filter((item) => item.scheduledAt <= now)
}

/** Append an item to the queue. */
export function addScheduled(item: Omit<ScheduledItem, 'id'>): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const full: ScheduledItem = { ...item, id }
  const queue = readQueue()
  queue.push(full)
  writeQueue(queue)
  return id
}

/** Remove an item by id. */
export function removeScheduled(id: string): boolean {
  const queue = readQueue()
  const idx = queue.findIndex((i) => i.id === id)
  if (idx === -1) return false
  queue.splice(idx, 1)
  writeQueue(queue)
  return true
}

/** Remove an item by id (used after successful publish). */
export function removeScheduledById(id: string): void {
  const queue = readQueue().filter((i) => i.id !== id)
  writeQueue(queue)
}
