import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie, deleteCookie } from '@tanstack/react-start/server'
import type { YoutubeSessionData } from './youtube-session'

export type YoutubeSessionInfo = {
  channelTitle: string
  channelId: string
} | null

type OAuthConfigResult =
  | { ok: true; clientId: string; clientSecret: string; redirectUri: string }
  | { ok: false; error: string }

// redirect URI must match Google Cloud Console exactly: no trailing slash, correct protocol and port.
// e.g. local: http://localhost:5173/auth/youtube/callback  production: https://yourdomain.com/auth/youtube/callback
function getOAuthConfig(): OAuthConfigResult {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim()

  if (!clientId || !clientSecret || !redirectUri) {
    return {
      ok: false,
      error: 'YouTube OAuth not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI)',
    }
  }
  return { ok: true, clientId, clientSecret, redirectUri }
}

/** Returns the redirect URI this app uses so you can add it to Google Cloud Console. */
export const getYoutubeRedirectUriHint = createServerFn().handler(
  async (): Promise<{ redirectUri: string } | null> => {
    const uri = process.env.YOUTUBE_REDIRECT_URI?.trim()
    return uri ? { redirectUri: uri } : null
  },
)

export const getYoutubeSession = createServerFn().handler(
  async (): Promise<YoutubeSessionInfo> => {
    const { getYoutubeSessionCookieName, getYoutubeSessionById } = await import('./youtube-session')

    const sessionId = getCookie(getYoutubeSessionCookieName())
    if (!sessionId) return null
    const data = getYoutubeSessionById(sessionId)
    if (!data) return null
    return {
      channelTitle: data.channelTitle ?? 'YouTube channel',
      channelId: data.channelId ?? '',
    }
  },
)

export const logoutYoutube = createServerFn().handler(async (): Promise<void> => {
  const { getYoutubeSessionCookieName, deleteYoutubeSessionById } = await import('./youtube-session')

  const sessionId = getCookie(getYoutubeSessionCookieName())
  if (sessionId) {
    deleteYoutubeSessionById(sessionId)
    deleteCookie(getYoutubeSessionCookieName(), { path: '/' })
  }
})

export const getYoutubeAuthUrl = createServerFn().handler(
  async (): Promise<{ ok: true; url: string } | { ok: false; error: string }> => {
    const config = getOAuthConfig()
    if (!config.ok) return { ok: false, error: config.error }

    const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube.upload')
    const redirectUri = encodeURIComponent(config.redirectUri)
    const clientId = encodeURIComponent(config.clientId)
    const url =
      'https://accounts.google.com/o/oauth2/v2/auth' +
      `?client_id=${clientId}` +
      `&redirect_uri=${redirectUri}` +
      '&response_type=code' +
      `&scope=${scope}` +
      '&access_type=offline' +
      '&prompt=consent'

    return { ok: true, url }
  },
)

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

async function fetchTokensFromCode(
  code: string,
): Promise<{ ok: true; tokens: TokenResponse } | { ok: false; error: string }> {
  const config = getOAuthConfig()
  if (!config.ok) return { ok: false, error: config.error }

  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  })

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (!res.ok) {
      let message = `token exchange failed: ${res.status}`
      try {
        const json = (await res.json()) as { error?: string; error_description?: string }
        if (json.error_description) message = json.error_description
        else if (json.error) message = json.error
      } catch {
        // ignore parse errors
      }
      return { ok: false, error: message }
    }
    const json = (await res.json()) as TokenResponse
    if (!json.access_token) return { ok: false, error: 'no access token returned from Google' }
    return { ok: true, tokens: json }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'token exchange failed'
    return { ok: false, error: message }
  }
}

async function fetchChannelInfo(
  accessToken: string,
): Promise<Pick<YoutubeSessionData, 'channelId' | 'channelTitle'>> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
    if (!res.ok) return {}
    const json = (await res.json()) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>
    }
    const first = json.items?.[0]
    return {
      channelId: typeof first?.id === 'string' ? first.id : undefined,
      channelTitle:
        typeof first?.snippet?.title === 'string' ? first.snippet.title : undefined,
    }
  } catch {
    return {}
  }
}

export const completeYoutubeOAuth = createServerFn()
  .inputValidator((data: { code: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      const result = await fetchTokensFromCode(data.code)
      if (!result.ok) return result

      const tokens = result.tokens
      const now = Date.now()
      const expiryDate =
        typeof tokens.expires_in === 'number' ? now + tokens.expires_in * 1000 : undefined

      const baseSession: YoutubeSessionData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate,
      }

      const channelInfo = await fetchChannelInfo(tokens.access_token)
      const sessionData: YoutubeSessionData = { ...baseSession, ...channelInfo }

      const {
        saveYoutubeSession,
        getYoutubeSessionCookieName,
        getYoutubeSessionCookieOptions,
      } = await import('./youtube-session')

      const sessionId = saveYoutubeSession(sessionData)
      setCookie(getYoutubeSessionCookieName(), sessionId, getYoutubeSessionCookieOptions())

      return { ok: true }
    },
  )

export async function refreshYoutubeAccessToken(
  sessionId: string,
): Promise<YoutubeSessionData | null> {
  const {
    getYoutubeSessionById,
    updateYoutubeSession,
  } = await import('./youtube-session')

  const existing = getYoutubeSessionById(sessionId)
  if (!existing || !existing.refreshToken) return existing ?? null

  const config = getOAuthConfig()
  if (!config.ok) return existing ?? null

  const body = new URLSearchParams({
    refresh_token: existing.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
  })

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
    if (!res.ok) return existing ?? null
    const json = (await res.json()) as TokenResponse
    if (!json.access_token) return existing ?? null

    const now = Date.now()
    const expiryDate =
      typeof json.expires_in === 'number' ? now + json.expires_in * 1000 : undefined

    const updated: YoutubeSessionData = {
      ...existing,
      accessToken: json.access_token,
      expiryDate,
    }
    updateYoutubeSession(sessionId, updated)
    return updated
  } catch {
    return existing ?? null
  }
}

