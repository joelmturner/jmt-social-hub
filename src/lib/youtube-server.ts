import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { readUpload } from './publish'
import { YOUTUBE_CATEGORY_HASHTAGS } from '#/lib/constants'
import {
  getYoutubeSessionById,
  getYoutubeSessionCookieName,
  type YoutubeSessionData,
} from './youtube-session'
import { refreshYoutubeAccessToken } from './youtube-auth'

type YoutubeUploadResult =
  | { ok: true; videoId: string }
  | { ok: false; error: string }

type YoutubeConfigResult =
  | { ok: true; apiKey: string; session: YoutubeSessionData }
  | { ok: false; error: string }

async function getYoutubeConfig(): Promise<YoutubeConfigResult> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return { ok: false, error: 'YouTube API key not configured' }

  const sessionId = getCookie(getYoutubeSessionCookieName())
  if (!sessionId) return { ok: false, error: 'YouTube not connected' }

  let session = getYoutubeSessionById(sessionId)
  if (!session) return { ok: false, error: 'YouTube session expired' }

  const now = Date.now()
  if (session.expiryDate && session.expiryDate - now < 60_000) {
    const refreshed = await refreshYoutubeAccessToken(sessionId)
    if (refreshed) session = refreshed
  }

  if (!session.accessToken) return { ok: false, error: 'YouTube access token missing' }

  return { ok: true, apiKey, session }
}

function extractTitleAndDescription(caption: string): { title: string; description: string } {
  const trimmed = caption.trim()
  if (!trimmed) return { title: 'Short', description: '' }
  const [firstLine, ...rest] = trimmed.split('\n')
  const title = firstLine.slice(0, 100) || 'Short'
  const description = rest.join('\n').slice(0, 5000)
  return { title, description }
}

function extractTags(caption: string): string[] {
  const lower = caption.toLowerCase()
  const tags: string[] = []
  for (const tag of YOUTUBE_CATEGORY_HASHTAGS) {
    const hashtag = `#${tag.toLowerCase()}`
    if (lower.includes(hashtag)) tags.push(tag)
  }
  return tags
}

function getVideoMimeFromPath(mediaPath: string): string {
  const ext = mediaPath.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? '.mp4'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.mov') return 'video/quicktime'
  return 'video/mp4'
}

async function uploadVideoToYoutube(params: {
  mediaPath: string
  caption: string
  /** when set, upload as private and YouTube will publish at this time (ISO 8601) */
  publishAt?: string
}): Promise<YoutubeUploadResult> {
  const config = await getYoutubeConfig()
  if (!config.ok) return config

  const buffer = readUpload(params.mediaPath)
  const { title, description } = extractTitleAndDescription(params.caption)
  const tags = extractTags(params.caption)

  const status: { privacyStatus: string; selfDeclaredMadeForKids: boolean; publishAt?: string } = {
    privacyStatus: params.publishAt ? 'private' : 'unlisted',
    selfDeclaredMadeForKids: false,
  }
  if (params.publishAt) status.publishAt = params.publishAt

  const metadata = {
    snippet: {
      title,
      description,
      tags: tags.length > 0 ? tags : undefined,
      categoryId: '24',
    },
    status,
  }

  const boundary = `----youtube-upload-${Math.random().toString(36).slice(2)}`
  const mime = getVideoMimeFromPath(params.mediaPath)

  const jsonPart = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n`,
    'utf-8',
  )
  const mediaHeader = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: ${mime}\r\n` +
      'Content-Transfer-Encoding: binary\r\n\r\n',
    'utf-8',
  )
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')

  const body = Buffer.concat([jsonPart, mediaHeader, buffer, closing])

  const url =
    'https://www.googleapis.com/upload/youtube/v3/videos' +
    '?part=snippet,status' +
    '&uploadType=multipart' +
    `&key=${encodeURIComponent(config.apiKey)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.session.accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    })

    if (!res.ok) {
      let message = `YouTube upload failed: ${res.status}`
      try {
        const json = (await res.json()) as { error?: { message?: string } }
        if (json?.error?.message) message = json.error.message
      } catch {
        // ignore parse errors and keep default message
      }
      return { ok: false, error: message }
    }

    const json = (await res.json()) as { id?: string }
    if (!json.id) return { ok: false, error: 'YouTube upload succeeded but no video id returned' }
    return { ok: true, videoId: json.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'YouTube upload failed'
    return { ok: false, error: message }
  }
}

export const postVideoToYoutubeShorts = createServerFn()
  .inputValidator(
    (data: { mediaPath: string; caption: string; publishAt?: string }) => data,
  )
  .handler(async ({ data }): Promise<YoutubeUploadResult> => {
    return uploadVideoToYoutube({
      mediaPath: data.mediaPath,
      caption: data.caption,
      publishAt: data.publishAt,
    })
  })

