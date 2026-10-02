import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import {
	getInstagramSessionById,
	getInstagramSessionCookieName,
	type InstagramSessionData,
} from "./instagram-session";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const INSTAGRAM_CAPTION_MAX = 2200;
const CONTAINER_POLL_MS = 2000;
const CONTAINER_POLL_ATTEMPTS = 15;

type InstagramPublishResult =
	| { ok: true; mediaId: string; permalink?: string }
	| { ok: false; error: string };

function getInstagramSessionFromCookie():
	| { ok: true; session: InstagramSessionData }
	| { ok: false; error: string } {
	const sessionId = getCookie(getInstagramSessionCookieName());
	if (!sessionId) return { ok: false, error: "Instagram not connected" };
	const session = getInstagramSessionById(sessionId);
	if (!session) return { ok: false, error: "Instagram session expired" };
	if (!session.accessToken || !session.igUserId) {
		return { ok: false, error: "Instagram session incomplete" };
	}
	return { ok: true, session };
}

function isLikelyImageUrlFetchError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("image") ||
		lower.includes("download") ||
		lower.includes("url") ||
		lower.includes("fetch") ||
		lower.includes("curl") ||
		lower.includes("media could not be fetched") ||
		lower.includes("cannot download") ||
		lower.includes("invalid image")
	);
}

async function graphPost(
	path: string,
	accessToken: string,
	body: Record<string, string>,
): Promise<
	{ ok: true; json: Record<string, unknown> } | { ok: false; error: string }
> {
	const params = new URLSearchParams({
		...body,
		access_token: accessToken,
	});
	try {
		const res = await fetch(`${GRAPH_BASE}/${path}`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: params.toString(),
		});
		const json = (await res.json()) as Record<string, unknown> & {
			error?: { message?: string; error_user_msg?: string };
		};
		if (!res.ok || json.error) {
			const message =
				json.error?.error_user_msg ||
				json.error?.message ||
				`Instagram API error: ${res.status}`;
			return { ok: false, error: message };
		}
		return { ok: true, json };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Instagram API failed";
		return { ok: false, error: message };
	}
}

async function waitForContainerReady(
	containerId: string,
	accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i++) {
		try {
			const res = await fetch(
				`${GRAPH_BASE}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
			);
			const json = (await res.json()) as {
				status_code?: string;
				status?: string;
				error?: { message?: string };
			};
			if (!res.ok || json.error) {
				return {
					ok: false,
					error:
						json.error?.message || `container status failed: ${res.status}`,
				};
			}
			const code = json.status_code;
			if (code === "FINISHED") return { ok: true };
			if (code === "ERROR" || code === "EXPIRED") {
				return {
					ok: false,
					error: json.status || `Instagram container ${code.toLowerCase()}`,
				};
			}
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "container status check failed";
			return { ok: false, error: message };
		}
		await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS));
	}
	return { ok: false, error: "Instagram media container timed out" };
}

async function publishWithImageUrl(params: {
	session: InstagramSessionData;
	imageUrl: string;
	caption: string;
}): Promise<InstagramPublishResult> {
	const caption = params.caption.slice(0, INSTAGRAM_CAPTION_MAX);
	const create = await graphPost(
		`${params.session.igUserId}/media`,
		params.session.accessToken,
		{
			image_url: params.imageUrl,
			caption,
		},
	);
	if (!create.ok) return create;

	const containerId =
		typeof create.json.id === "string" ? create.json.id : null;
	if (!containerId)
		return { ok: false, error: "No container id from Instagram" };

	const ready = await waitForContainerReady(
		containerId,
		params.session.accessToken,
	);
	if (!ready.ok) return ready;

	const published = await graphPost(
		`${params.session.igUserId}/media_publish`,
		params.session.accessToken,
		{ creation_id: containerId },
	);
	if (!published.ok) return published;

	const mediaId =
		typeof published.json.id === "string" ? published.json.id : null;
	if (!mediaId) return { ok: false, error: "No media id from Instagram" };

	let permalink: string | undefined;
	try {
		const permalinkRes = await fetch(
			`${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(params.session.accessToken)}`,
		);
		if (permalinkRes.ok) {
			const permalinkJson = (await permalinkRes.json()) as {
				permalink?: string;
			};
			if (typeof permalinkJson.permalink === "string") {
				permalink = permalinkJson.permalink;
			}
		}
	} catch {
		// permalink is optional for history links
	}

	return { ok: true, mediaId, permalink };
}

async function resolveCloudinaryUrl(
	mediaPath: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
	// dynamic import — cloudinary is Node-only and must not enter the client bundle
	const { uploadImageForInstagramPublish } = await import("./cloudinary");
	return uploadImageForInstagramPublish({ mediaPath });
}

/**
 * Publish a single feed image to Instagram.
 * Prefer provided imageUrl (e.g. Bluesky CDN); otherwise host via Cloudinary.
 * If Meta rejects a Bluesky CDN URL, re-host on Cloudinary and retry once.
 */
export async function postImageToInstagramWithSession(
	session: InstagramSessionData,
	data: { mediaPath: string; caption: string; imageUrl?: string },
): Promise<InstagramPublishResult> {
	let imageUrl = data.imageUrl;
	let usedProvidedUrl = Boolean(imageUrl);

	if (!imageUrl) {
		const hosted = await resolveCloudinaryUrl(data.mediaPath);
		if (!hosted.ok) return hosted;
		imageUrl = hosted.url;
		usedProvidedUrl = false;
	}

	const first = await publishWithImageUrl({
		session,
		imageUrl,
		caption: data.caption,
	});
	if (first.ok) return first;

	if (usedProvidedUrl && isLikelyImageUrlFetchError(first.error)) {
		const hosted = await resolveCloudinaryUrl(data.mediaPath);
		if (!hosted.ok) {
			return {
				ok: false,
				error: `${first.error} (Cloudinary fallback also failed: ${hosted.error})`,
			};
		}
		return publishWithImageUrl({
			session,
			imageUrl: hosted.url,
			caption: data.caption,
		});
	}

	return first;
}

export const postImageToInstagram = createServerFn()
	.inputValidator(
		(data: { mediaPath: string; caption: string; imageUrl?: string }) => data,
	)
	.handler(async ({ data }): Promise<InstagramPublishResult> => {
		const sessionResult = getInstagramSessionFromCookie();
		if (!sessionResult.ok) return sessionResult;
		return postImageToInstagramWithSession(sessionResult.session, data);
	});
