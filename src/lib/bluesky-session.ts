/**
 * Bluesky session store (server-only).
 * Persists to a JSON file so sessions survive dev server restarts.
 * File is in .gitignore; for production use Redis or another secure store.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AtpSessionData } from "@atproto/api";

const SESSION_COOKIE = "bluesky_session_id";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const SESSIONS_FILE = join(process.cwd(), ".bluesky-sessions.json");

function loadSessions(): Map<string, AtpSessionData> {
	const map = new Map<string, AtpSessionData>();
	if (!existsSync(SESSIONS_FILE)) return map;
	try {
		const raw = readFileSync(SESSIONS_FILE, "utf-8");
		const data = JSON.parse(raw) as Record<string, AtpSessionData>;
		for (const [id, session] of Object.entries(data)) {
			if (
				session &&
				typeof session.accessJwt === "string" &&
				typeof session.refreshJwt === "string"
			) {
				map.set(id, session);
			}
		}
	} catch {
		// ignore invalid or missing file
	}
	return map;
}

function saveSessionsToFile(sessions: Map<string, AtpSessionData>): void {
	try {
		const obj = Object.fromEntries(sessions);
		writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 0), "utf-8");
	} catch {
		// ignore write errors (e.g. read-only fs)
	}
}

const sessions = loadSessions();

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

export function getSessionCookieName(): string {
	return SESSION_COOKIE;
}

export function getSessionCookieOptions(): {
	httpOnly: boolean;
	path: string;
	sameSite: "lax";
	maxAge: number;
} {
	return {
		httpOnly: true,
		path: "/",
		sameSite: "lax",
		maxAge: SESSION_TTL_MS / 1000,
	};
}

export function saveSession(sessionData: AtpSessionData): string {
	const id = generateId();
	sessions.set(id, sessionData);
	saveSessionsToFile(sessions);
	return id;
}

export function getSessionById(sessionId: string): AtpSessionData | undefined {
	return sessions.get(sessionId);
}

export function updateSessionById(
	sessionId: string,
	data: Partial<AtpSessionData>,
): void {
	const existing = sessions.get(sessionId);
	if (!existing) return;
	sessions.set(sessionId, { ...existing, ...data });
	saveSessionsToFile(sessions);
}

export function deleteSessionById(sessionId: string): void {
	sessions.delete(sessionId);
	saveSessionsToFile(sessions);
}
