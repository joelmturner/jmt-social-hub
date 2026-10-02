import { createServerFn } from "@tanstack/react-start";
import {
	deleteCookie,
	getCookie,
	setCookie,
} from "@tanstack/react-start/server";
import type { InstagramSessionData } from "./instagram-session";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export type InstagramSessionInfo = {
	username: string;
	igUserId: string;
} | null;

type OAuthConfigResult =
	| { ok: true; appId: string; appSecret: string; redirectUri: string }
	| { ok: false; error: string };

// redirect URI must match Meta app settings exactly: no trailing slash, correct protocol and port.
// e.g. local: http://localhost:5173/auth/instagram/callback
function getOAuthConfig(): OAuthConfigResult {
	const appId = process.env.META_APP_ID;
	const appSecret = process.env.META_APP_SECRET;
	const redirectUri = process.env.INSTAGRAM_REDIRECT_URI?.trim();

	if (!appId || !appSecret || !redirectUri) {
		return {
			ok: false,
			error:
				"Instagram OAuth not configured (META_APP_ID, META_APP_SECRET, INSTAGRAM_REDIRECT_URI)",
		};
	}
	return { ok: true, appId, appSecret, redirectUri };
}

/** Returns the redirect URI this app uses so you can add it to Meta app settings. */
export const getInstagramRedirectUriHint = createServerFn().handler(
	async (): Promise<{ redirectUri: string } | null> => {
		const uri = process.env.INSTAGRAM_REDIRECT_URI?.trim();
		return uri ? { redirectUri: uri } : null;
	},
);

export const getInstagramSession = createServerFn().handler(
	async (): Promise<InstagramSessionInfo> => {
		const { getInstagramSessionCookieName, getInstagramSessionById } =
			await import("./instagram-session");

		const sessionId = getCookie(getInstagramSessionCookieName());
		if (!sessionId) return null;
		const data = getInstagramSessionById(sessionId);
		if (!data) return null;
		return {
			username: data.username || "Instagram",
			igUserId: data.igUserId,
		};
	},
);

export const logoutInstagram = createServerFn().handler(
	async (): Promise<void> => {
		const { getInstagramSessionCookieName, deleteInstagramSessionById } =
			await import("./instagram-session");

		const sessionId = getCookie(getInstagramSessionCookieName());
		if (sessionId) {
			deleteInstagramSessionById(sessionId);
			deleteCookie(getInstagramSessionCookieName(), { path: "/" });
		}
	},
);

const OAUTH_SCOPES = [
	"instagram_basic",
	"instagram_content_publish",
	"pages_show_list",
	"pages_read_engagement",
	"business_management",
].join(",");

export const getInstagramAuthUrl = createServerFn().handler(
	async (): Promise<
		{ ok: true; url: string } | { ok: false; error: string }
	> => {
		const config = getOAuthConfig();
		if (!config.ok) return { ok: false, error: config.error };

		const params = new URLSearchParams({
			client_id: config.appId,
			redirect_uri: config.redirectUri,
			scope: OAUTH_SCOPES,
			response_type: "code",
		});

		return {
			ok: true,
			url: `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params}`,
		};
	},
);

type TokenResponse = {
	access_token: string;
	token_type?: string;
	expires_in?: number;
};

async function exchangeCodeForToken(
	code: string,
): Promise<{ ok: true; tokens: TokenResponse } | { ok: false; error: string }> {
	const config = getOAuthConfig();
	if (!config.ok) return { ok: false, error: config.error };

	const params = new URLSearchParams({
		client_id: config.appId,
		client_secret: config.appSecret,
		redirect_uri: config.redirectUri,
		code,
	});

	try {
		const res = await fetch(
			`${GRAPH_BASE}/oauth/access_token?${params.toString()}`,
		);
		if (!res.ok) {
			let message = `token exchange failed: ${res.status}`;
			try {
				const json = (await res.json()) as {
					error?: { message?: string };
				};
				if (json.error?.message) message = json.error.message;
			} catch {
				// ignore parse errors
			}
			return { ok: false, error: message };
		}
		const json = (await res.json()) as TokenResponse;
		if (!json.access_token)
			return { ok: false, error: "no access token returned from Meta" };
		return { ok: true, tokens: json };
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "token exchange failed";
		return { ok: false, error: message };
	}
}

async function exchangeForLongLivedToken(
	shortLivedToken: string,
): Promise<{ ok: true; tokens: TokenResponse } | { ok: false; error: string }> {
	const config = getOAuthConfig();
	if (!config.ok) return { ok: false, error: config.error };

	const params = new URLSearchParams({
		grant_type: "fb_exchange_token",
		client_id: config.appId,
		client_secret: config.appSecret,
		fb_exchange_token: shortLivedToken,
	});

	try {
		const res = await fetch(
			`${GRAPH_BASE}/oauth/access_token?${params.toString()}`,
		);
		if (!res.ok) {
			let message = `long-lived token exchange failed: ${res.status}`;
			try {
				const json = (await res.json()) as {
					error?: { message?: string };
				};
				if (json.error?.message) message = json.error.message;
			} catch {
				// ignore
			}
			return { ok: false, error: message };
		}
		const json = (await res.json()) as TokenResponse;
		if (!json.access_token)
			return { ok: false, error: "no long-lived token returned from Meta" };
		return { ok: true, tokens: json };
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "long-lived token exchange failed";
		return { ok: false, error: message };
	}
}

type PageWithIg = {
	id: string;
	name?: string;
	access_token: string;
	instagram_business_account?: { id: string };
};

async function resolveInstagramAccount(userAccessToken: string): Promise<
	| {
			ok: true;
			igUserId: string;
			username: string;
			pageId: string;
			pageName?: string;
			pageAccessToken: string;
	  }
	| { ok: false; error: string }
> {
	try {
		const pagesRes = await fetch(
			`${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userAccessToken)}`,
		);
		if (!pagesRes.ok) {
			let message = `failed to list Facebook Pages: ${pagesRes.status}`;
			try {
				const json = (await pagesRes.json()) as {
					error?: { message?: string };
				};
				if (json.error?.message) message = json.error.message;
			} catch {
				// ignore
			}
			return { ok: false, error: message };
		}
		const pagesJson = (await pagesRes.json()) as { data?: PageWithIg[] };
		const pages = pagesJson.data ?? [];
		const linked = pages.find((p) => p.instagram_business_account?.id);
		if (!linked?.instagram_business_account?.id || !linked.access_token) {
			return {
				ok: false,
				error:
					"No Facebook Page with a linked Instagram professional account found. Link your IG Business/Creator account to a Page first.",
			};
		}

		const igUserId = linked.instagram_business_account.id;
		const igRes = await fetch(
			`${GRAPH_BASE}/${igUserId}?fields=id,username&access_token=${encodeURIComponent(linked.access_token)}`,
		);
		let username = "Instagram";
		if (igRes.ok) {
			const igJson = (await igRes.json()) as { username?: string };
			if (typeof igJson.username === "string") username = igJson.username;
		}

		return {
			ok: true,
			igUserId,
			username,
			pageId: linked.id,
			pageName: linked.name,
			pageAccessToken: linked.access_token,
		};
	} catch (err) {
		const message =
			err instanceof Error
				? err.message
				: "failed to resolve Instagram account";
		return { ok: false, error: message };
	}
}

export const completeInstagramOAuth = createServerFn()
	.inputValidator((data: { code: string }) => data)
	.handler(
		async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
			const shortLived = await exchangeCodeForToken(data.code);
			if (!shortLived.ok) return shortLived;

			const longLived = await exchangeForLongLivedToken(
				shortLived.tokens.access_token,
			);
			const userToken = longLived.ok ? longLived.tokens : shortLived.tokens;

			const account = await resolveInstagramAccount(userToken.access_token);
			if (!account.ok) return account;

			const now = Date.now();
			const expiryDate =
				typeof userToken.expires_in === "number"
					? now + userToken.expires_in * 1000
					: now + 60 * 24 * 60 * 60 * 1000;

			const sessionData: InstagramSessionData = {
				accessToken: account.pageAccessToken,
				userAccessToken: userToken.access_token,
				expiryDate,
				igUserId: account.igUserId,
				username: account.username,
				pageId: account.pageId,
				pageName: account.pageName,
			};

			const {
				saveInstagramSession,
				getInstagramSessionCookieName,
				getInstagramSessionCookieOptions,
			} = await import("./instagram-session");

			const sessionId = saveInstagramSession(sessionData);
			setCookie(
				getInstagramSessionCookieName(),
				sessionId,
				getInstagramSessionCookieOptions(),
			);

			return { ok: true };
		},
	);

export type InstagramConnectionTestResult =
	| {
			ok: true;
			username: string;
			igUserId: string;
			quotaUsage?: number;
			quotaTotal?: number;
	  }
	| { ok: false; error: string };

/**
 * Verify the stored Instagram session can call Graph API (account + publish quota).
 * Does not create or publish any media.
 */
export const testInstagramConnection = createServerFn().handler(
	async (): Promise<InstagramConnectionTestResult> => {
		const { getInstagramSessionCookieName, getInstagramSessionById } =
			await import("./instagram-session");

		const sessionId = getCookie(getInstagramSessionCookieName());
		if (!sessionId) return { ok: false, error: "Instagram not connected" };
		const session = getInstagramSessionById(sessionId);
		if (!session?.accessToken || !session.igUserId) {
			return { ok: false, error: "Instagram session expired or incomplete" };
		}

		try {
			const accountRes = await fetch(
				`${GRAPH_BASE}/${session.igUserId}?fields=id,username&access_token=${encodeURIComponent(session.accessToken)}`,
			);
			const accountJson = (await accountRes.json()) as {
				id?: string;
				username?: string;
				error?: { message?: string };
			};
			if (!accountRes.ok || accountJson.error) {
				return {
					ok: false,
					error:
						accountJson.error?.message ||
						`Account check failed (${accountRes.status}). Reconnect Instagram.`,
				};
			}

			const username =
				typeof accountJson.username === "string"
					? accountJson.username
					: session.username;
			const igUserId =
				typeof accountJson.id === "string" ? accountJson.id : session.igUserId;

			let quotaUsage: number | undefined;
			let quotaTotal: number | undefined;
			const limitRes = await fetch(
				`${GRAPH_BASE}/${session.igUserId}/content_publishing_limit?fields=config,quota_usage&access_token=${encodeURIComponent(session.accessToken)}`,
			);
			const limitJson = (await limitRes.json()) as {
				data?: Array<{
					quota_usage?: number;
					config?: { quota_total?: number };
				}>;
				error?: { message?: string };
			};
			if (!limitRes.ok || limitJson.error) {
				return {
					ok: false,
					error:
						limitJson.error?.message ||
						`Publish permission check failed (${limitRes.status}). Token may lack instagram_content_publish.`,
				};
			}
			const row = limitJson.data?.[0];
			if (typeof row?.quota_usage === "number") quotaUsage = row.quota_usage;
			if (typeof row?.config?.quota_total === "number") {
				quotaTotal = row.config.quota_total;
			}

			return { ok: true, username, igUserId, quotaUsage, quotaTotal };
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Instagram connection test failed";
			return { ok: false, error: message };
		}
	},
);
