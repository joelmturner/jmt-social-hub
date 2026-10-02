import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeInstagramOAuth } from "#/lib/instagram-auth";

export const Route = createFileRoute("/auth/instagram/callback")({
	component: InstagramCallbackPage,
});

function InstagramCallbackPage() {
	const navigate = useNavigate();
	const [status, setStatus] = useState<"pending" | "success" | "error">(
		"pending",
	);
	const [message, setMessage] = useState<string>(
		"Finishing Instagram connection…",
	);

	useEffect(() => {
		async function run() {
			try {
				const params = new URLSearchParams(window.location.search);
				const code = params.get("code");
				const error = params.get("error");
				const errorDescription = params.get("error_description");
				if (error) {
					setStatus("error");
					setMessage(
						errorDescription || error || "Instagram connection was cancelled.",
					);
					return;
				}
				if (!code) {
					setStatus("error");
					setMessage("Missing OAuth code in callback.");
					return;
				}
				const result = await completeInstagramOAuth({ data: { code } });
				if (result.ok) {
					setStatus("success");
					setMessage("Instagram account connected. Redirecting…");
					setTimeout(() => {
						navigate({ to: "/" });
					}, 800);
				} else {
					setStatus("error");
					setMessage(result.error);
				}
			} catch (err) {
				setStatus("error");
				setMessage(
					err instanceof Error
						? err.message
						: "Something went wrong finishing Instagram login.",
				);
			}
		}
		void run();
	}, [navigate]);

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<div className="island-shell relative mx-auto max-w-md overflow-hidden px-6 py-10 text-center">
				<p className="island-kicker mb-3 justify-center">Instagram</p>
				<h1 className="mb-3 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
					Connecting account…
				</h1>
				<div className="ornament-rule" aria-hidden="true">
					<span>◆</span>
				</div>
				<p
					className={
						status === "error"
							? "text-sm text-destructive"
							: "text-sm text-muted-foreground"
					}
				>
					{message}
				</p>
			</div>
		</main>
	);
}
