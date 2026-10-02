import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { loginBluesky } from "#/lib/bluesky-server";
import {
	getInstagramAuthUrl,
	getInstagramRedirectUriHint,
	getInstagramSession,
	type InstagramSessionInfo,
	testInstagramConnection,
} from "#/lib/instagram-auth";
import {
	getYoutubeAuthUrl,
	getYoutubeRedirectUriHint,
	getYoutubeSession,
	type YoutubeSessionInfo,
} from "#/lib/youtube-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const identifierId = useId();
	const passwordId = useId();
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [youtubeError, setYoutubeError] = useState<string | null>(null);
	const [youtubeLoading, setYoutubeLoading] = useState(false);
	const [youtubeRedirectHint, setYoutubeRedirectHint] = useState<string | null>(
		null,
	);
	const [youtubeSession, setYoutubeSession] = useState<
		YoutubeSessionInfo | null | "loading"
	>("loading");
	const [instagramError, setInstagramError] = useState<string | null>(null);
	const [instagramLoading, setInstagramLoading] = useState(false);
	const [instagramTestLoading, setInstagramTestLoading] = useState(false);
	const [instagramTestMessage, setInstagramTestMessage] = useState<
		string | null
	>(null);
	const [instagramTestOk, setInstagramTestOk] = useState<boolean | null>(null);
	const [instagramRedirectHint, setInstagramRedirectHint] = useState<
		string | null
	>(null);
	const [instagramSession, setInstagramSession] = useState<
		InstagramSessionInfo | null | "loading"
	>("loading");

	useEffect(() => {
		getYoutubeRedirectUriHint().then((hint) => {
			if (hint) setYoutubeRedirectHint(hint.redirectUri);
		});
		getYoutubeSession().then((s) => setYoutubeSession(s ?? null));
		getInstagramRedirectUriHint().then((hint) => {
			if (hint) setInstagramRedirectHint(hint.redirectUri);
		});
		getInstagramSession().then((s) => setInstagramSession(s ?? null));
	}, []);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const result = await loginBluesky({ data: { identifier, password } });
			if (result.ok) {
				navigate({ to: "/" });
				return;
			}
			setError(result.error);
		} finally {
			setLoading(false);
		}
	}

	async function handleConnectYoutube() {
		setYoutubeError(null);
		setYoutubeLoading(true);
		try {
			const result = await getYoutubeAuthUrl();
			if (result.ok) {
				window.location.href = result.url;
				return;
			}
			setYoutubeError(result.error);
		} finally {
			setYoutubeLoading(false);
		}
	}

	async function handleConnectInstagram() {
		setInstagramError(null);
		setInstagramTestMessage(null);
		setInstagramTestOk(null);
		setInstagramLoading(true);
		try {
			const result = await getInstagramAuthUrl();
			if (result.ok) {
				window.location.href = result.url;
				return;
			}
			setInstagramError(result.error);
		} finally {
			setInstagramLoading(false);
		}
	}

	async function handleTestInstagram() {
		setInstagramError(null);
		setInstagramTestMessage(null);
		setInstagramTestOk(null);
		setInstagramTestLoading(true);
		try {
			const result = await testInstagramConnection();
			if (result.ok) {
				setInstagramTestOk(true);
				const quota =
					typeof result.quotaUsage === "number" &&
					typeof result.quotaTotal === "number"
						? ` Publish quota: ${result.quotaUsage}/${result.quotaTotal} in the last 24h.`
						: typeof result.quotaUsage === "number"
							? ` Publish quota usage (24h): ${result.quotaUsage}.`
							: "";
				setInstagramTestMessage(
					`Connected as @${result.username}. Token and publish permissions look good.${quota}`,
				);
				setInstagramSession({
					username: result.username,
					igUserId: result.igUserId,
				});
			} else {
				setInstagramTestOk(false);
				setInstagramTestMessage(result.error);
			}
		} catch (err) {
			setInstagramTestOk(false);
			setInstagramTestMessage(
				err instanceof Error ? err.message : "Connection test failed",
			);
		} finally {
			setInstagramTestLoading(false);
		}
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
				<Card className="rise-in relative overflow-hidden">
					<div className="px-6 py-10 sm:px-10 sm:py-14">
						<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Bluesky (AT Protocol)
						</p>
						<h1 className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							Log in
						</h1>
						<p className="mb-6 text-sm text-muted-foreground">
							Use your Bluesky handle and an{" "}
							<a
								href="https://bsky.social/settings/app-passwords"
								target="_blank"
								rel="noopener noreferrer"
								className="underline hover:no-underline"
							>
								app password
							</a>
							. We never see your main password.
						</p>
						<form onSubmit={handleSubmit} className="flex flex-col gap-4">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={identifierId}>Handle</Label>
								<Input
									id={identifierId}
									type="text"
									value={identifier}
									onChange={(e) => setIdentifier(e.target.value)}
									placeholder="you.bsky.social"
									required
									autoComplete="username"
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={passwordId}>App password</Label>
								<Input
									id={passwordId}
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="xxxx-xxxx-xxxx-xxxx"
									required
									autoComplete="current-password"
								/>
							</div>
							{error && (
								<p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{error}
								</p>
							)}
							<Button type="submit" disabled={loading}>
								{loading ? "Logging in…" : "Log in"}
							</Button>
						</form>
					</div>
				</Card>

				<Card className="rise-in relative overflow-hidden">
					<div className="px-6 py-10 sm:px-10 sm:py-14">
						<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							YouTube
						</p>
						<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							{youtubeSession === "loading"
								? "Connect channel"
								: youtubeSession
									? "Channel connected"
									: "Connect channel"}
						</h2>
						<p className="mb-6 text-sm text-muted-foreground">
							{youtubeSession === "loading" ? (
								"Checking connection…"
							) : youtubeSession ? (
								<>
									YouTube: connected as{" "}
									<strong>{youtubeSession.channelTitle}</strong>. You can upload
									Shorts when you publish.
								</>
							) : (
								<>
									Connect a YouTube channel so you can upload Shorts directly
									when you publish. This uses Google OAuth; you can revoke
									access from your Google account at any time.
								</>
							)}
						</p>
						{!youtubeSession && youtubeRedirectHint && (
							<p className="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
								In Google Cloud Console → APIs &amp; Services → Credentials →
								your OAuth 2.0 Client ID → Authorized redirect URIs, add
								exactly:{" "}
								<code className="mt-1 block break-all font-mono text-foreground">
									{youtubeRedirectHint}
								</code>
							</p>
						)}
						{youtubeError && (
							<p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{youtubeError}
							</p>
						)}
						{!youtubeSession && (
							<Button
								type="button"
								onClick={handleConnectYoutube}
								disabled={youtubeLoading}
							>
								{youtubeLoading ? "Opening Google…" : "Connect YouTube"}
							</Button>
						)}
					</div>
				</Card>

				<Card className="rise-in relative overflow-hidden md:col-span-2">
					<div className="px-6 py-10 sm:px-10 sm:py-14">
						<p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Instagram
						</p>
						<h2 className="mb-5 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
							{instagramSession === "loading"
								? "Connect account"
								: instagramSession
									? "Account connected"
									: "Connect account"}
						</h2>
						<p className="mb-6 text-sm text-muted-foreground">
							{instagramSession === "loading" ? (
								"Checking connection…"
							) : instagramSession ? (
								<>
									Instagram: connected as{" "}
									<strong>@{instagramSession.username}</strong>. You can publish
									feed images when you post.
								</>
							) : (
								<>
									Connect an Instagram professional account (Business or
									Creator) linked to a Facebook Page. Uses Meta OAuth; you can
									revoke access from your Facebook settings at any time.
								</>
							)}
						</p>
						{!instagramSession && instagramRedirectHint && (
							<p className="mb-4 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
								Add this exact URL in Meta (no trailing slash). Current console
								path:{" "}
								<strong>
									developers.facebook.com → your app → Use cases → Authenticate
									and request data from users with Facebook Login → Customize →
									Settings
								</strong>
								, field <strong>Valid OAuth Redirect URIs</strong>. Older apps
								may still show it under{" "}
								<strong>Products → Facebook Login → Settings</strong>. Also add{" "}
								<code className="font-mono text-foreground">localhost</code>{" "}
								under App settings → Basic → App Domains if prompted. URI:{" "}
								<code className="mt-1 block break-all font-mono text-foreground">
									{instagramRedirectHint}
								</code>
							</p>
						)}
						{instagramError && (
							<p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
								{instagramError}
							</p>
						)}
						{instagramTestMessage && (
							<p
								className={
									instagramTestOk
										? "mb-4 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
										: "mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
								}
							>
								{instagramTestMessage}
							</p>
						)}
						{!instagramSession && (
							<Button
								type="button"
								onClick={handleConnectInstagram}
								disabled={instagramLoading}
							>
								{instagramLoading ? "Opening Meta…" : "Connect Instagram"}
							</Button>
						)}
						{instagramSession && instagramSession !== "loading" && (
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={handleTestInstagram}
									disabled={instagramTestLoading}
								>
									{instagramTestLoading
										? "Testing…"
										: "Test Instagram connection"}
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={handleConnectInstagram}
									disabled={instagramLoading}
								>
									{instagramLoading ? "Opening Meta…" : "Reconnect"}
								</Button>
							</div>
						)}
					</div>
				</Card>
			</div>
		</main>
	);
}
