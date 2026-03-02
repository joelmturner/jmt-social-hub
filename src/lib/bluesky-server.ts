import { createServerFn } from '@tanstack/react-start'
import { Agent, CredentialSession, RichText } from '@atproto/api'
import {
  getCookie,
  setCookie,
  deleteCookie,
} from '@tanstack/react-start/server'

const BSKY_PDS = new URL('https://bsky.social')

export type BlueskySessionInfo = {
  handle: string
  did: string
} | null

/** Returns current Bluesky session info if logged in. */
export const getBlueskySession = createServerFn().handler(
  async (): Promise<BlueskySessionInfo> => {
    const { getSessionCookieName, getSessionById } = await import('./bluesky-session')
    const sessionId = getCookie(getSessionCookieName())
    if (!sessionId) return null
    const data = getSessionById(sessionId)
    if (!data) return null
    return { handle: data.handle, did: data.did }
  },
)

/** Log in with Bluesky handle and app password. Sets session cookie on success. */
export const loginBluesky = createServerFn()
  .inputValidator((data: { identifier: string; password: string }) => data)
  .handler(async ({ data }): Promise<{ ok: true; handle: string } | { ok: false; error: string }> => {
    const { saveSession, getSessionCookieName, getSessionCookieOptions } =
      await import('./bluesky-session')
    try {
      const session = new CredentialSession(BSKY_PDS)
      await session.login({
        identifier: data.identifier.trim(),
        password: data.password,
      })
      if (!session.session) {
        return { ok: false, error: 'Login did not return a session' }
      }
      const sessionId = saveSession(session.session)
      setCookie(getSessionCookieName(), sessionId, getSessionCookieOptions())
      return { ok: true, handle: session.session.handle }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      return { ok: false, error: message }
    }
  })

/** Log out and clear session cookie. */
export const logoutBluesky = createServerFn().handler(async (): Promise<void> => {
  const { getSessionCookieName, deleteSessionById } = await import('./bluesky-session')
  const sessionId = getCookie(getSessionCookieName())
  if (sessionId) {
    deleteSessionById(sessionId)
    deleteCookie(getSessionCookieName(), { path: '/' })
  }
})

/** Message shown when session is cleared due to revoked/expired token. */
export const SESSION_REVOKED_MESSAGE =
  'Your session has expired or was revoked. Please log in again.'

function isSessionRevokedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return (
    /token has been revoked/i.test(msg) ||
    /invalid token/i.test(msg) ||
    /session.*expired/i.test(msg) ||
    /authentication required/i.test(msg)
  )
}

/** Minimal post ref for Bluesky embed (uri + cid only; no serialization issues). */
export type BlueskyEmbedRef = {
  uri: string
  cid: string
  /** When present, indicates image(s) or video from the post's embed. */
  embedKind?: PostEmbedKind
}

/** Embed type discriminator in API responses (view types use #view suffix). */
const EMBED_IMAGES_VIEW = 'app.bsky.embed.images#view'
const EMBED_VIDEO_VIEW = 'app.bsky.embed.video#view'
const EMBED_RECORD_WITH_MEDIA_VIEW = 'app.bsky.embed.recordWithMedia#view'

type EmbedImagesView = { $type: typeof EMBED_IMAGES_VIEW; images: unknown[] }
type EmbedRecordWithMediaView = {
  $type: typeof EMBED_RECORD_WITH_MEDIA_VIEW
  media: { $type: string; images?: unknown[] }
}

/** Result of classifying a post's embed (images vs video). */
export type PostEmbedKind =
  | { kind: 'none' }
  | { kind: 'image'; count: 1 }
  | { kind: 'images'; count: number }
  | { kind: 'video' }
  | { kind: 'recordWithMedia'; media: PostEmbedKind }

/**
 * Classify a post's embed from the API: image (single), multiple images, or video.
 * Reliable when given the post's `embed` view from feed/search (uses Bluesky's $type discriminator).
 */
export function getPostEmbedKind(embed: unknown): PostEmbedKind {
  if (embed == null || typeof embed !== 'object') return { kind: 'none' }
  const e = embed as Record<string, unknown>
  const type = e.$type as string | undefined

  if (type === EMBED_IMAGES_VIEW) {
    const images = (e as EmbedImagesView).images
    const count = Array.isArray(images) ? images.length : 0
    if (count <= 0) return { kind: 'none' }
    return count === 1 ? { kind: 'image', count: 1 } : { kind: 'images', count }
  }

  if (type === EMBED_VIDEO_VIEW) return { kind: 'video' }

  if (type === EMBED_RECORD_WITH_MEDIA_VIEW) {
    const media = (e as EmbedRecordWithMediaView).media
    if (media != null && typeof media === 'object') {
      const mediaType = (media as Record<string, unknown>).$type as string | undefined
      if (mediaType === EMBED_IMAGES_VIEW) {
        const images = (media as { images?: unknown[] }).images
        const count = Array.isArray(images) ? images.length : 0
        if (count > 0)
          return { kind: 'recordWithMedia', media: count === 1 ? { kind: 'image', count: 1 } : { kind: 'images', count } }
      }
      if (mediaType === EMBED_VIDEO_VIEW)
        return { kind: 'recordWithMedia', media: { kind: 'video' } }
    }
  }

  return { kind: 'none' }
}

/** Post an image to Bluesky using a session id (e.g. from scheduled queue). Used by cron processor. */
export async function postImageToBlueskyWithSessionId(
  sessionId: string,
  data: { mediaPath: string; caption: string },
): Promise<{ ok: true; uri: string } | { ok: false; error: string }> {
  const { getSessionById, deleteSessionById } = await import('./bluesky-session')
  const sessionData = getSessionById(sessionId)
  if (!sessionData) return { ok: false, error: 'Session expired' }
  try {
    const { readUpload } = await import('./publish')
    const buffer = readUpload(data.mediaPath)
    const ext = data.mediaPath.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? '.jpg'
    const mime =
      ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
    const session = new CredentialSession(BSKY_PDS)
    await session.resumeSession(sessionData)
    const agent = new Agent(session)
    const { data: blobData } = await agent.uploadBlob(buffer, { encoding: mime })
    const text = data.caption.slice(0, 300)
    // use RichText to detect hashtags and links so they render as first-party facets on Bluesky
    const rt = new RichText({ text })
    rt.detectFacetsWithoutResolution()
    const facets =
      rt.facets
        ?.map((f) => ({
          ...f,
          features: f.features.filter(
            (x) =>
              x.$type === 'app.bsky.richtext.facet#tag' ||
              x.$type === 'app.bsky.richtext.facet#link',
          ),
        }))
        .filter((f) => f.features.length > 0) ?? undefined
    const res = await agent.post({
      text,
      facets: facets?.length ? facets : undefined,
      createdAt: new Date().toISOString(),
      embed: {
        $type: 'app.bsky.embed.images',
        images: [
          {
            image: blobData.blob,
            alt: data.caption.slice(0, 1000) || 'Image',
          },
        ],
      } as { $type: 'app.bsky.embed.images'; images: Array<{ image: typeof blobData.blob; alt: string }> },
    })
    return { ok: true, uri: res.uri }
  } catch (err) {
    if (isSessionRevokedError(err)) {
      deleteSessionById(sessionId)
      return { ok: false, error: SESSION_REVOKED_MESSAGE }
    }
    const message = err instanceof Error ? err.message : 'Post failed'
    return { ok: false, error: message }
  }
}

/** Post an image to Bluesky (caption + image at mediaPath). Returns post URI on success. */
export const postImageToBluesky = createServerFn()
  .inputValidator((data: { mediaPath: string; caption: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; uri: string } | { ok: false; error: string }
    > => {
      const { getSessionCookieName } = await import('./bluesky-session')
      const sessionId = getCookie(getSessionCookieName())
      if (!sessionId) return { ok: false, error: 'Not logged in' }
      const result = await postImageToBlueskyWithSessionId(sessionId, data)
      if (!result.ok && result.error === SESSION_REVOKED_MESSAGE) {
        deleteCookie(getSessionCookieName(), { path: '/' })
      }
      return result
    },
  )

/** Fetch the authenticated user's posts that have the given hashtag. Returns only uri/cid for use with Bluesky embed. */
export const searchMyPostsByHashtag = createServerFn()
  .inputValidator((data: { hashtag: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; posts: BlueskyEmbedRef[] } | { ok: false; error: string }
    > => {
      const { getSessionCookieName, getSessionById, deleteSessionById } =
        await import('./bluesky-session')
      const sessionId = getCookie(getSessionCookieName())
      if (!sessionId) {
        return { ok: false, error: 'Not logged in' }
      }
      const sessionData = getSessionById(sessionId)
      if (!sessionData) {
        return { ok: false, error: 'Session expired' }
      }
      const tag = data.hashtag.replace(/^#/, '').trim()
      if (!tag) {
        return { ok: false, error: 'Enter a hashtag' }
      }
      try {
        const session = new CredentialSession(BSKY_PDS)
        await session.resumeSession(sessionData)
        const agent = new Agent(session)
        const res = await agent.app.bsky.feed.searchPosts({
          q: tag,
          author: sessionData.handle,
          tag: [tag],
          limit: 50,
        })
        const rawPosts = res.data.posts ?? []
        const posts: BlueskyEmbedRef[] = rawPosts.map((p) => {
          const embed = (p as { embed?: unknown }).embed
          return {
            uri: typeof p.uri === 'string' ? p.uri : String((p as { uri?: unknown }).uri ?? ''),
            cid: typeof p.cid === 'string' ? p.cid : String((p as { cid?: unknown }).cid ?? ''),
            embedKind: getPostEmbedKind(embed),
          }
        })
        return { ok: true, posts }
      } catch (err) {
        if (isSessionRevokedError(err)) {
          deleteSessionById(sessionId)
          deleteCookie(getSessionCookieName(), { path: '/' })
          return { ok: false, error: SESSION_REVOKED_MESSAGE }
        }
        const message = err instanceof Error ? err.message : 'Search failed'
        return { ok: false, error: message }
      }
    },
  )
