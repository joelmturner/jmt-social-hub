/**
 * youtube session store (server-only).
 * persists to a JSON file so sessions survive dev server restarts.
 * file is in .gitignore; for production use a secure store.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type YoutubeSessionData = {
  accessToken: string
  refreshToken?: string
  expiryDate?: number
  channelId?: string
  channelTitle?: string
}

const SESSION_COOKIE = 'youtube_session_id'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

const SESSIONS_FILE = join(process.cwd(), '.youtube-sessions.json')

function loadSessions(): Map<string, YoutubeSessionData> {
  const map = new Map<string, YoutubeSessionData>()
  if (!existsSync(SESSIONS_FILE)) return map
  try {
    const raw = readFileSync(SESSIONS_FILE, 'utf-8')
    const data = JSON.parse(raw) as Record<string, YoutubeSessionData>
    for (const [id, session] of Object.entries(data)) {
      if (session && typeof session.accessToken === 'string') {
        map.set(id, session)
      }
    }
  } catch {
    // ignore invalid or missing file
  }
  return map
}

function saveSessionsToFile(sessions: Map<string, YoutubeSessionData>): void {
  try {
    const obj = Object.fromEntries(sessions)
    writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 0), 'utf-8')
  } catch {
    // ignore write errors
  }
}

const sessions = loadSessions()

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`
}

export function getYoutubeSessionCookieName(): string {
  return SESSION_COOKIE
}

export function getYoutubeSessionCookieOptions(): {
  httpOnly: boolean
  path: string
  sameSite: 'lax'
  maxAge: number
} {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS / 1000,
  }
}

export function saveYoutubeSession(sessionData: YoutubeSessionData): string {
  const id = generateId()
  sessions.set(id, sessionData)
  saveSessionsToFile(sessions)
  return id
}

export function getYoutubeSessionById(sessionId: string): YoutubeSessionData | undefined {
  return sessions.get(sessionId)
}

export function updateYoutubeSession(sessionId: string, patch: Partial<YoutubeSessionData>): void {
  const existing = sessions.get(sessionId)
  if (!existing) return
  sessions.set(sessionId, { ...existing, ...patch })
  saveSessionsToFile(sessions)
}

export function deleteYoutubeSessionById(sessionId: string): void {
  sessions.delete(sessionId)
  saveSessionsToFile(sessions)
}

