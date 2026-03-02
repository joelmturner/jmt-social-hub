import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loginBluesky } from "#/lib/bluesky-server";
import {
	getYoutubeAuthUrl,
	getYoutubeRedirectUriHint,
} from "#/lib/youtube-auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const [identifier, setIdentifier] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [youtubeError, setYoutubeError] = useState<string | null>(null);
	const [youtubeLoading, setYoutubeLoading] = useState(false);
	const [youtubeRedirectHint, setYoutubeRedirectHint] = useState<string | null>(
		null,
	);

	useEffect(() => {
		getYoutubeRedirectUriHint().then((hint) => {
			if (hint) setYoutubeRedirectHint(hint.redirectUri);
		});
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
							<label htmlFor="identifier" className="flex flex-col gap-1.5">
								<span className="text-sm font-medium">Handle</span>
								<Input
									type="text"
									value={identifier}
									onChange={(e) => setIdentifier(e.target.value)}
									placeholder="you.bsky.social"
									required
									autoComplete="username"
								/>
							</label>
							<label htmlFor="password" className="flex flex-col gap-1.5">
								<span className="text-sm font-medium">App password</span>
								<Input
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="xxxx-xxxx-xxxx-xxxx"
									required
									autoComplete="current-password"
								/>
							</label>
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
							Connect channel
						</h2>
						<p className="mb-6 text-sm text-muted-foreground">
							Connect a YouTube channel so you can upload Shorts directly when
							you publish. This uses Google OAuth; you can revoke access from
							your Google account at any time.
						</p>
						{youtubeRedirectHint && (
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
						<Button
							type="button"
							onClick={handleConnectYoutube}
							disabled={youtubeLoading}
						>
							{youtubeLoading ? "Opening Google…" : "Connect YouTube"}
						</Button>
					</div>
				</Card>
			</div>
		</main>
	);
}
