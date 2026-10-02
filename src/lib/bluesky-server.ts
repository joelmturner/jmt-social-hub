import { Agent, CredentialSession, RichText } from "@atproto/api";
import { createServerFn } from "@tanstack/react-start";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";

const BSKY_PDS = new URL("https://bsky.social");
const REFRESH_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // refresh when access JWT is within 5 min of expiry

export type BlueskySessionInfo = {
	handle: string;
	did: string;
} | null;

/** Decode JWT payload and return exp (seconds) if present. Returns null if invalid/missing. */
function getJwtExp(accessJwt: string): number | null {
	try {
		const parts = accessJwt.split(".");
		if (parts.length !== 3) return null;
		const payload = JSON.parse(
			Buffer.from(parts[1], "base64url").toString("utf-8"),
		) as { exp?: number };
		return typeof payload.exp === "number" ? payload.exp : null;
	} catch {
		return null;
	}
}

/** True if access JWT is expired or within the refresh buffer. */
function isAccessTokenExpiredOrNearExpiry(accessJwt: string): boolean {
	const exp = getJwtExp(accessJwt);
	if (exp === null) return true;
	return exp * 1000 < Date.now() + REFRESH_EXPIRY_BUFFER_MS;
}

type RefreshSessionResponse = {
	accessJwt: string;
	refreshJwt: string;
	handle: string;
	did: string;
};

/** Refresh Bluesky session if access token is expired or near expiry. Returns updated session data or null on failure. */
async function refreshBlueskySessionIfNeeded(
	sessionId: string,
): Promise<RefreshSessionResponse | null> {
	const { getSessionById, updateSessionById } = await import(
		"./bluesky-session"
	);
	const data = getSessionById(sessionId);
	if (!data?.refreshJwt) return null;
	if (!isAccessTokenExpiredOrNearExpiry(data.accessJwt)) return data;

	const url = new URL("/xrpc/com.atproto.server.refreshSession", BSKY_PDS);
	const res = await fetch(url.toString(), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${data.refreshJwt}`,
			"Content-Type": "application/json",
		},
	});
	if (!res.ok) return null;
	let json: unknown;
	try {
		json = await res.json();
	} catch {
		return null;
	}
	const body = json as Partial<RefreshSessionResponse>;
	if (
		typeof body.accessJwt !== "string" ||
		typeof body.refreshJwt !== "string" ||
		typeof body.handle !== "string" ||
		typeof body.did !== "string"
	) {
		return null;
	}
	updateSessionById(sessionId, {
		accessJwt: body.accessJwt,
		refreshJwt: body.refreshJwt,
		handle: body.handle,
		did: body.did,
	});
	return body;
}

/** Returns current Bluesky session info if logged in. Refreshes token if expired; clears session only if refresh fails. */
export const getBlueskySession = createServerFn().handler(
	async (): Promise<BlueskySessionInfo> => {
		const { getSessionCookieName, getSessionById, deleteSessionById } =
			await import("./bluesky-session");
		const sessionId = getCookie(getSessionCookieName());
		if (!sessionId) return null;
		const data = getSessionById(sessionId);
		if (!data) return null;
		const exp = getJwtExp(data.accessJwt);
		const expired = exp !== null && exp * 1000 < Date.now();
		if (expired) {
			const refreshed = await refreshBlueskySessionIfNeeded(sessionId);
			if (refreshed) return { handle: refreshed.handle, did: refreshed.did };
			deleteSessionById(sessionId);
			deleteCookie(getSessionCookieName(), { path: "/" });
			return null;
		}
		return { handle: data.handle, did: data.did };
	},
);

/** Log in with Bluesky handle and app password. Sets session cookie on success. */
export const loginBluesky = createServerFn()
	.inputValidator((data: { identifier: string; password: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<
			{ ok: true; handle: string } | { ok: false; error: string }
		> => {
			const { saveSession, getSessionCookieName, getSessionCookieOptions } =
				await import("./bluesky-session");
			try {
				const session = new CredentialSession(BSKY_PDS);
				await session.login({
					identifier: data.identifier.trim(),
					password: data.password,
				});
				if (!session.session) {
					return { ok: false, error: "Login did not return a session" };
				}
				const sessionId = saveSession(session.session);
				setCookie(getSessionCookieName(), sessionId, getSessionCookieOptions());
				return { ok: true, handle: session.session.handle };
			} catch (err) {
				const message = err instanceof Error ? err.message : "Login failed";
				return { ok: false, error: message };
			}
		},
	);

/** Log out and clear session cookie. */
export const logoutBluesky = createServerFn().handler(
	async (): Promise<void> => {
		const { getSessionCookieName, deleteSessionById } = await import(
			"./bluesky-session"
		);
		const sessionId = getCookie(getSessionCookieName());
		if (sessionId) {
			deleteSessionById(sessionId);
			deleteCookie(getSessionCookieName(), { path: "/" });
		}
	},
);

/** Message shown when session is cleared due to revoked/expired token. */
export const SESSION_REVOKED_MESSAGE =
	"Your session has expired or was revoked. Please log in again.";

function isSessionRevokedError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err ?? "");
	return (
		/token has been revoked/i.test(msg) ||
		/invalid token/i.test(msg) ||
		/session.*expired/i.test(msg) ||
		/authentication required/i.test(msg)
	);
}

/** Minimal post ref for Bluesky embed (uri + cid only; no serialization issues). */
export type BlueskyEmbedRef = {
	uri: string;
	cid: string;
	/** When present, indicates image(s) or video from the post's embed. */
	embedKind?: PostEmbedKind;
};

/** Embed type discriminator in API responses (view types use #view suffix). */
const EMBED_IMAGES_VIEW = "app.bsky.embed.images#view";
const EMBED_VIDEO_VIEW = "app.bsky.embed.video#view";
const EMBED_RECORD_WITH_MEDIA_VIEW = "app.bsky.embed.recordWithMedia#view";

type EmbedImagesView = { $type: typeof EMBED_IMAGES_VIEW; images: unknown[] };
type EmbedRecordWithMediaView = {
	$type: typeof EMBED_RECORD_WITH_MEDIA_VIEW;
	media: { $type: string; images?: unknown[] };
};

/** Result of classifying a post's embed (images vs video). */
export type PostEmbedKind =
	| { kind: "none" }
	| { kind: "image"; count: 1 }
	| { kind: "images"; count: number }
	| { kind: "video" }
	| { kind: "recordWithMedia"; media: PostEmbedKind };

/**
 * Classify a post's embed from the API: image (single), multiple images, or video.
 * Reliable when given the post's `embed` view from feed/search (uses Bluesky's $type discriminator).
 */
export function getPostEmbedKind(embed: unknown): PostEmbedKind {
	if (embed == null || typeof embed !== "object") return { kind: "none" };
	const e = embed as Record<string, unknown>;
	const type = e.$type as string | undefined;

	if (type === EMBED_IMAGES_VIEW) {
		const images = (e as EmbedImagesView).images;
		const count = Array.isArray(images) ? images.length : 0;
		if (count <= 0) return { kind: "none" };
		return count === 1
			? { kind: "image", count: 1 }
			: { kind: "images", count };
	}

	if (type === EMBED_VIDEO_VIEW) return { kind: "video" };

	if (type === EMBED_RECORD_WITH_MEDIA_VIEW) {
		const media = (e as EmbedRecordWithMediaView).media;
		if (media != null && typeof media === "object") {
			const mediaType = (media as Record<string, unknown>).$type as
				| string
				| undefined;
			if (mediaType === EMBED_IMAGES_VIEW) {
				const images = (media as { images?: unknown[] }).images;
				const count = Array.isArray(images) ? images.length : 0;
				if (count > 0)
					return {
						kind: "recordWithMedia",
						media:
							count === 1
								? { kind: "image", count: 1 }
								: { kind: "images", count },
					};
			}
			if (mediaType === EMBED_VIDEO_VIEW)
				return { kind: "recordWithMedia", media: { kind: "video" } };
		}
	}

	return { kind: "none" };
}

/** Extract CID string from an atproto blob ref (CID object or { $link }). */
function blobRefToCid(ref: unknown): string | null {
	if (ref == null) return null;
	if (typeof ref === "string") return ref;
	if (typeof ref === "object") {
		const r = ref as { $link?: string; toString?: () => string };
		if (typeof r.$link === "string") return r.$link;
		if (typeof r.toString === "function") {
			const s = r.toString();
			if (s && s !== "[object Object]") return s;
		}
	}
	return null;
}

/** Public Bluesky CDN URL for a blob (usable as Meta image_url when the post is public). */
export function blueskyCdnImageUrl(did: string, cid: string): string | null {
	if (!did || !cid) return null;
	return `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@jpeg`;
}

/** Post an image to Bluesky using a session id (e.g. from scheduled queue). Used by cron processor. */
export async function postImageToBlueskyWithSessionId(
	sessionId: string,
	data: { mediaPath: string; caption: string },
): Promise<
	| { ok: true; uri: string; did: string; cid: string }
	| { ok: false; error: string }
> {
	const { getSessionById, deleteSessionById } = await import(
		"./bluesky-session"
	);
	let sessionData = getSessionById(sessionId);
	if (!sessionData) return { ok: false, error: "Session expired" };
	if (isAccessTokenExpiredOrNearExpiry(sessionData.accessJwt)) {
		const refreshed = await refreshBlueskySessionIfNeeded(sessionId);
		if (!refreshed) {
			deleteSessionById(sessionId);
			return { ok: false, error: SESSION_REVOKED_MESSAGE };
		}
		const updated = getSessionById(sessionId);
		if (!updated) return { ok: false, error: SESSION_REVOKED_MESSAGE };
		sessionData = updated;
	}
	try {
		const { readUpload } = await import("./publish");
		const buffer = readUpload(data.mediaPath);
		const ext =
			data.mediaPath.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? ".jpg";
		const mime =
			ext === ".png"
				? "image/png"
				: ext === ".gif"
					? "image/gif"
					: ext === ".webp"
						? "image/webp"
						: "image/jpeg";
		const session = new CredentialSession(BSKY_PDS);
		await session.resumeSession(sessionData);
		const agent = new Agent(session);
		const { data: blobData } = await agent.uploadBlob(buffer, {
			encoding: mime,
		});
		const text = data.caption.slice(0, 300);
		// use RichText to detect hashtags and links so they render as first-party facets on Bluesky
		const rt = new RichText({ text });
		rt.detectFacetsWithoutResolution();
		const facets =
			rt.facets
				?.map((f) => ({
					...f,
					features: f.features.filter(
						(x) =>
							x.$type === "app.bsky.richtext.facet#tag" ||
							x.$type === "app.bsky.richtext.facet#link",
					),
				}))
				.filter((f) => f.features.length > 0) ?? undefined;
		const res = await agent.post({
			text,
			facets: facets?.length ? facets : undefined,
			createdAt: new Date().toISOString(),
			embed: {
				$type: "app.bsky.embed.images",
				images: [
					{
						image: blobData.blob,
						alt: data.caption.slice(0, 1000) || "Image",
					},
				],
			} as {
				$type: "app.bsky.embed.images";
				images: Array<{ image: typeof blobData.blob; alt: string }>;
			},
		});
		const cid = blobRefToCid(blobData.blob.ref) ?? "";
		return { ok: true, uri: res.uri, did: sessionData.did, cid };
	} catch (err) {
		if (isSessionRevokedError(err)) {
			deleteSessionById(sessionId);
			return { ok: false, error: SESSION_REVOKED_MESSAGE };
		}
		const message = err instanceof Error ? err.message : "Post failed";
		return { ok: false, error: message };
	}
}

/** Post an image to Bluesky (caption + image at mediaPath). Returns post URI + blob refs on success. */
export const postImageToBluesky = createServerFn()
	.inputValidator((data: { mediaPath: string; caption: string }) => data)
	.handler(
		async ({
			data,
		}): Promise<
			| { ok: true; uri: string; did: string; cid: string }
			| { ok: false; error: string }
		> => {
			const { getSessionCookieName } = await import("./bluesky-session");
			const sessionId = getCookie(getSessionCookieName());
			if (!sessionId) return { ok: false, error: "Not logged in" };
			const result = await postImageToBlueskyWithSessionId(sessionId, data);
			if (!result.ok && result.error === SESSION_REVOKED_MESSAGE) {
				deleteCookie(getSessionCookieName(), { path: "/" });
			}
			return result;
		},
	);

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
				await import("./bluesky-session");
			const sessionId = getCookie(getSessionCookieName());
			if (!sessionId) {
				return { ok: false, error: "Not logged in" };
			}
			let sessionData = getSessionById(sessionId);
			if (!sessionData) {
				return { ok: false, error: "Session expired" };
			}
			if (isAccessTokenExpiredOrNearExpiry(sessionData.accessJwt)) {
				const refreshed = await refreshBlueskySessionIfNeeded(sessionId);
				if (!refreshed) {
					deleteSessionById(sessionId);
					deleteCookie(getSessionCookieName(), { path: "/" });
					return { ok: false, error: SESSION_REVOKED_MESSAGE };
				}
				const updated = getSessionById(sessionId);
				if (!updated) {
					return { ok: false, error: SESSION_REVOKED_MESSAGE };
				}
				sessionData = updated;
			}
			const tag = data.hashtag.replace(/^#/, "").trim();
			if (!tag) {
				return { ok: false, error: "Enter a hashtag" };
			}
			try {
				const session = new CredentialSession(BSKY_PDS);
				await session.resumeSession(sessionData);
				const agent = new Agent(session);
				const res = await agent.app.bsky.feed.searchPosts({
					q: tag,
					author: sessionData.handle,
					tag: [tag],
					limit: 50,
				});
				const rawPosts = res.data.posts ?? [];
				const posts: BlueskyEmbedRef[] = rawPosts.map((p) => {
					const embed = (p as { embed?: unknown }).embed;
					return {
						uri:
							typeof p.uri === "string"
								? p.uri
								: String((p as { uri?: unknown }).uri ?? ""),
						cid:
							typeof p.cid === "string"
								? p.cid
								: String((p as { cid?: unknown }).cid ?? ""),
						embedKind: getPostEmbedKind(embed),
					};
				});
				return { ok: true, posts };
			} catch (err) {
				if (isSessionRevokedError(err)) {
					deleteSessionById(sessionId);
					deleteCookie(getSessionCookieName(), { path: "/" });
					return { ok: false, error: SESSION_REVOKED_MESSAGE };
				}
				const message = err instanceof Error ? err.message : "Search failed";
				return { ok: false, error: message };
			}
		},
	);
