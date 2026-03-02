/**
 * Server-only: save uploads to public/uploads and record posted history to content/posted.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const UPLOADS_DIR = join(process.cwd(), 'public', 'uploads')
const POSTED_DIR = join(process.cwd(), 'content', 'posted')

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov'])

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** Generate a safe filename: timestamp + short id + extension. */
export function generateUploadFilename(originalName: string): string {
  const ext = originalName.includes('.')
    ? (originalName.match(/\.[a-z0-9]+$/i)?.[0] ?? '.bin').toLowerCase()
    : '.bin'
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `${id}${ext}`
}

/** Determine media type from filename. */
export function getMediaType(filename: string): 'image' | 'video' {
  const ext = filename.includes('.')
    ? (filename.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase()
    : ''
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'
}

/**
 * Save uploaded file (base64) to public/uploads. Returns path suitable for embed (e.g. /uploads/xxx.jpg).
 */
export function saveUpload(params: {
  fileBase64: string
  mimeType: string
  filename: string
}): { mediaPath: string; mediaType: 'image' | 'video' } {
  const buffer = Buffer.from(params.fileBase64, 'base64')
  return saveUploadFromBuffer(buffer, params.filename)
}

/**
 * Save raw buffer to public/uploads. Used by multipart upload API to avoid base64 in RPC.
 */
export function saveUploadFromBuffer(
  buffer: Buffer,
  originalFilename: string,
): { mediaPath: string; mediaType: 'image' | 'video' } {
  ensureDir(UPLOADS_DIR)
  const safeName = generateUploadFilename(originalFilename)
  const filePath = join(UPLOADS_DIR, safeName)
  writeFileSync(filePath, buffer)
  const mediaType = getMediaType(safeName)
  return { mediaPath: `/uploads/${safeName}`, mediaType }
}

/**
 * Resolve media path (e.g. /uploads/xxx.jpg) to absolute path and read file as Buffer.
 */
export function readUpload(mediaPath: string): Buffer {
  const normalized = mediaPath.startsWith('/') ? mediaPath.slice(1) : mediaPath
  const absolute = join(process.cwd(), 'public', normalized)
  if (!existsSync(absolute)) throw new Error(`Upload not found: ${mediaPath}`)
  return readFileSync(absolute)
}

export type PostedDestination = {
  postedAt: string
  uri?: string
  videoId?: string
}

export type PostedRecord = {
  caption: string
  mediaPath: string
  createdAt: string
  mediaType: 'image' | 'video'
  bluesky?: PostedDestination
  youtube?: PostedDestination
}

/**
 * Write a new history record to content/posted/<id>.md so content-collections picks it up.
 */
export function recordPosted(record: PostedRecord): string {
  ensureDir(POSTED_DIR)
  const id = `${record.createdAt.replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 9)}`
  const slug = id.replace(/^(\d{4})-(\d{2})-(\d{2})T.*/, '$1-$2-$3') + `-${id.slice(-7)}`
  const filename = `${slug}.md`

  function escapeYaml(s: string) {
    if (!s.includes('\n') && !s.includes('"') && !s.includes(':')) return s
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  }
  const lines: string[] = ['---']
  lines.push(`caption: ${escapeYaml(record.caption)}`)
  lines.push(`mediaPath: ${escapeYaml(record.mediaPath)}`)
  lines.push(`createdAt: ${escapeYaml(record.createdAt)}`)
  lines.push(`mediaType: ${escapeYaml(record.mediaType)}`)
  if (record.bluesky) {
    lines.push('bluesky:')
    lines.push(`  postedAt: ${escapeYaml(record.bluesky.postedAt)}`)
    if (record.bluesky.uri) lines.push(`  uri: ${escapeYaml(record.bluesky.uri)}`)
    if (record.bluesky.videoId) lines.push(`  videoId: ${escapeYaml(record.bluesky.videoId)}`)
  }
  if (record.youtube) {
    lines.push('youtube:')
    lines.push(`  postedAt: ${escapeYaml(record.youtube.postedAt)}`)
    if (record.youtube.uri) lines.push(`  uri: ${escapeYaml(record.youtube.uri)}`)
    if (record.youtube.videoId) lines.push(`  videoId: ${escapeYaml(record.youtube.videoId)}`)
  }
  lines.push('---', '')
  const content = lines.join('\n')
  const filePath = join(POSTED_DIR, filename)
  writeFileSync(filePath, content, 'utf-8')
  return slug
}
