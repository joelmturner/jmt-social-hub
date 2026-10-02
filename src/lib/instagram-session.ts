/**
 * Instagram session store (server-only).
 * persists to a JSON file so sessions survive dev server restarts.
 * file is in .gitignore; for production use a secure store.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type InstagramSessionData = {
	/** Facebook Page access token used for Graph API publish calls */
	accessToken: string;
	/** long-lived user token (for refresh / re-resolving page token if needed) */
	userAccessToken?: string;
	expiryDate?: number;
	/** Instagram professional account id (IG user id) */
	igUserId: string;
	/** Instagram username */
	username: string;
	/** linked Facebook Page id */
	pageId?: string;
	pageName?: string;
};

const SESSION_COOKIE = "instagram_session_id";
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // ~60 days (long-lived token window)

const SESSIONS_FILE = join(process.cwd(), ".instagram-sessions.json");

function loadSessions(): Map<string, InstagramSessionData> {
	const map = new Map<string, InstagramSessionData>();
	if (!existsSync(SESSIONS_FILE)) return map;
	try {
		const raw = readFileSync(SESSIONS_FILE, "utf-8");
		const data = JSON.parse(raw) as Record<string, InstagramSessionData>;
		for (const [id, session] of Object.entries(data)) {
			if (
				session &&
				typeof session.accessToken === "string" &&
				typeof session.igUserId === "string"
			) {
				map.set(id, session);
			}
		}
	} catch {
		// ignore invalid or missing file
	}
	return map;
}

function saveSessionsToFile(sessions: Map<string, InstagramSessionData>): void {
	try {
		const obj = Object.fromEntries(sessions);
		writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 0), "utf-8");
	} catch {
		// ignore write errors
	}
}

const sessions = loadSessions();

function generateId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
}

export function getInstagramSessionCookieName(): string {
	return SESSION_COOKIE;
}

export function getInstagramSessionCookieOptions(): {
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

export function saveInstagramSession(
	sessionData: InstagramSessionData,
): string {
	const id = generateId();
	sessions.set(id, sessionData);
	saveSessionsToFile(sessions);
	return id;
}

export function getInstagramSessionById(
	sessionId: string,
): InstagramSessionData | undefined {
	return sessions.get(sessionId);
}

export function updateInstagramSession(
	sessionId: string,
	patch: Partial<InstagramSessionData>,
): void {
	const existing = sessions.get(sessionId);
	if (!existing) return;
	sessions.set(sessionId, { ...existing, ...patch });
	saveSessionsToFile(sessions);
}

export function deleteInstagramSessionById(sessionId: string): void {
	sessions.delete(sessionId);
	saveSessionsToFile(sessions);
}
