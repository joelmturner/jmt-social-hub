import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { allPosts } from "content-collections";
import { useCallback, useEffect, useState } from "react";
import type { ControllerRenderProps } from "react-hook-form";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
	type BlueskySessionInfo,
	getBlueskySession,
	logoutBluesky,
	postImageToBluesky,
} from "#/lib/bluesky-server";
import { compressImageFile } from "#/lib/compress-image";
import { CLOUDINARY_CATEGORY_HASHTAGS } from "#/lib/constants";
import { recordPosted, uploadToCloudinaryIfTagged } from "#/lib/publish-server";
import type { ScheduledItem } from "#/lib/scheduled-queue";
import {
	addScheduledPost,
	listScheduled,
	removeScheduledPost,
} from "#/lib/scheduled-server";
import { getYoutubeSession, type YoutubeSessionInfo } from "#/lib/youtube-auth";
import { postVideoToYoutubeShorts } from "#/lib/youtube-server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropzone } from "@/components/ui/dropzone";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

const publishSchema = z
	.object({
		caption: z.string().max(300),
		postToBluesky: z.boolean(),
		postToYoutube: z.boolean(),
		file: z.union([z.instanceof(File), z.null()]),
		schedule: z.boolean(),
		scheduledAt: z.string().optional(),
	})
	.refine((data: { file: File | null }) => data.file instanceof File, {
		message: "Choose an image or video first.",
		path: ["file"],
	})
	.refine(
		(data: { schedule: boolean; scheduledAt?: string }) =>
			!data.schedule ||
			(data.scheduledAt != null && data.scheduledAt.length > 0),
		{
			message: "Pick a date and time for the schedule.",
			path: ["scheduledAt"],
		},
	);

type PublishValues = z.infer<typeof publishSchema>;

export const Route = createFileRoute("/")({ component: App });

function App() {
	const navigate = useNavigate();
	const [session, setSession] = useState<BlueskySessionInfo | null | "loading">(
		"loading",
	);
	const [youtubeSession, setYoutubeSession] = useState<
		YoutubeSessionInfo | null | "loading"
	>("loading");
	const [publishing, setPublishing] = useState(false);
	const [publishError, setPublishError] = useState<string | null>(null);
	const [publishSuccess, setPublishSuccess] = useState(false);

	const [scheduledList, setScheduledList] = useState<ScheduledItem[]>([]);
	const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
	const [historyToShow, setHistoryToShow] = useState(12);

	const form = useForm<PublishValues>({
		resolver: zodResolver(publishSchema),
		defaultValues: {
			caption: "",
			postToBluesky: true,
			postToYoutube: false,
			file: null,
			schedule: false,
			scheduledAt: "",
		},
	});

	const isSchedule = form.watch("schedule");

	const loadScheduled = useCallback(async () => {
		const list = await listScheduled();
		setScheduledList(list);
	}, []);

	useEffect(() => {
		loadScheduled();
	}, [loadScheduled]);
	useEffect(() => {
		if (isSchedule) loadScheduled();
	}, [isSchedule, loadScheduled]);

	useEffect(() => {
		getBlueskySession().then((s) => {
			const value = s ?? null;
			setSession(value);
			if (value === null) {
				navigate({ to: "/login" });
			}
		});
		getYoutubeSession().then((s) => setYoutubeSession(s ?? null));
	}, [navigate]);

	async function onSubmit(values: PublishValues) {
		const {
			caption,
			file,
			postToBluesky,
			postToYoutube,
			schedule,
			scheduledAt,
		} = values;
		if (!file) return;
		setPublishError(null);
		setPublishSuccess(false);
		setScheduleSuccess(null);
		const isImage = file.type.startsWith("image/");
		const isVideo = file.type.startsWith("video/");
		if (!isImage && postToBluesky) {
			setPublishError(
				"Bluesky only supports images for now. Use YouTube for video.",
			);
			return;
		}
		if (postToYoutube && !isVideo) {
			setPublishError("YouTube Shorts require a video file.");
			return;
		}
		if (postToYoutube && youtubeSession !== "loading" && !youtubeSession) {
			setPublishError("Connect your YouTube channel on the Login page first.");
			return;
		}
		if (postToBluesky && !session) {
			setPublishError("Log in with Bluesky to post there.");
			return;
		}
		setPublishing(true);
		try {
			const fileToUpload = isImage ? await compressImageFile(file) : file;
			const formData = new FormData();
			formData.append("file", fileToUpload);
			const uploadRes = await fetch("/api/upload", {
				method: "POST",
				body: formData,
			});
			if (!uploadRes.ok) {
				const err = await uploadRes.json().catch(() => ({}));
				throw new Error(err.error || `Upload failed: ${uploadRes.status}`);
			}
			const { mediaPath, mediaType } = (await uploadRes.json()) as {
				mediaPath: string;
				mediaType: "image" | "video";
			};
			const createdAt = new Date().toISOString();

			if (schedule && scheduledAt) {
				// schedule path: save to queue; optionally upload to YouTube now with publishAt
				let youtubePayload: { videoId: string; publishAt: string } | undefined;
				if (postToYoutube) {
					const publishAt = new Date(scheduledAt).toISOString();
					const result = await postVideoToYoutubeShorts({
						data: { mediaPath, caption, publishAt },
					});
					if (result.ok) {
						youtubePayload = { videoId: result.videoId, publishAt };
					} else {
						setPublishError(result.error);
						setPublishing(false);
						return;
					}
				}
				await addScheduledPost({
					data: {
						caption,
						mediaPath,
						mediaType: mediaType as "image" | "video",
						scheduledAt,
						postToBluesky,
						postToYoutube,
						createdAt,
						...(youtubePayload && { youtube: youtubePayload }),
					},
				});
				setScheduleSuccess(
					`Added to schedule for ${new Date(scheduledAt).toLocaleString()}. Run cron or keep the app open to publish at that time.`,
				);
				form.reset({
					caption: "",
					postToBluesky: true,
					postToYoutube: false,
					file: null,
					schedule: true,
					scheduledAt: "",
				});
				loadScheduled();
				return;
			}

			// immediate publish path
			const record = {
				caption,
				mediaPath,
				createdAt,
				mediaType: mediaType as "image" | "video",
			} as {
				caption: string;
				mediaPath: string;
				createdAt: string;
				mediaType: "image" | "video";
				bluesky?: { postedAt: string; uri: string };
				youtube?: { postedAt: string; videoId?: string };
			};

			if (postToBluesky && session) {
				const result = await postImageToBluesky({
					data: { mediaPath, caption },
				});
				if (result.ok) {
					record.bluesky = { postedAt: createdAt, uri: result.uri };
				} else {
					setPublishError(result.error);
					setPublishing(false);
					return;
				}
			}

			if (postToYoutube) {
				const result = await postVideoToYoutubeShorts({
					data: { mediaPath, caption },
				});
				if (result.ok) {
					record.youtube = { postedAt: createdAt, videoId: result.videoId };
				} else {
					setPublishError(result.error);
					setPublishing(false);
					return;
				}
			}

			await recordPosted({ data: record });
			if (mediaType === "image") {
				uploadToCloudinaryIfTagged({
					data: {
						mediaPath: record.mediaPath,
						caption: record.caption,
						createdAt: record.createdAt,
						mediaType: "image",
					},
				}).catch(() => {
					/* non-blocking */
				});
			}
			setPublishSuccess(true);
			form.reset({
				caption: "",
				postToBluesky: true,
				postToYoutube: false,
				file: null,
				schedule: false,
				scheduledAt: "",
			});
		} catch (err) {
			setPublishError(err instanceof Error ? err.message : "Publish failed");
		} finally {
			setPublishing(false);
		}
	}

	async function handleLogout() {
		await logoutBluesky();
		setSession(null);
	}

	const history = [...(allPosts ?? [])].sort(
		(a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf(),
	);

	// build view URLs from front matter (at:// -> bsky.app, videoId -> youtube shorts)
	function blueskyPostUrl(uri: string | undefined): string | null {
		if (!uri?.startsWith("at://")) return null;
		const withoutScheme = uri.slice(5);
		const parts = withoutScheme.split("/");
		const did = parts[0];
		const rkey = parts[parts.length - 1];
		if (!did || !rkey) return null;
		return `https://bsky.app/profile/${did}/post/${rkey}`;
	}
	function youtubePostUrl(videoId: string | undefined): string | null {
		if (!videoId) return null;
		return `https://www.youtube.com/shorts/${videoId}`;
	}

	if (session === "loading") {
		return (
			<main className="page-wrap px-4 pb-8 pt-14">
				<div className="flex justify-center py-20 text-muted-foreground">
					Loading…
				</div>
			</main>
		);
	}

	return (
		<main className="page-wrap px-4 pb-8 pt-14">
			<Card className="rise-in island-shell relative mx-auto max-w-2xl overflow-hidden">
				<div className="px-6 py-10 sm:px-10 sm:py-14">
					<p className="island-kicker mb-3">Let's publish something!</p>
					<h1 className="display-title neon-gradient-text mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
						Post to Bluesky &amp; YouTube
					</h1>
					<p className="mb-6 text-sm text-muted-foreground">
						Upload an image or video, add a caption, and publish to the
						destinations you choose.
						{session ? (
							<>
								{" "}
								Bluesky: <strong>{session.handle}</strong>.
							</>
						) : (
							<>
								{" "}
								<Link
									to="/login"
									className="text-primary underline decoration-primary/50 underline-offset-2 hover:text-primary/80"
								>
									Log in with Bluesky
								</Link>{" "}
								to post there.
							</>
						)}
						{youtubeSession === "loading" ? (
							" YouTube: …"
						) : youtubeSession ? (
							<>
								{" "}
								YouTube: <strong>{youtubeSession.channelTitle}</strong>.
							</>
						) : (
							<>
								{" "}
								YouTube: not connected.{" "}
								<Link
									to="/login"
									className="text-primary underline decoration-primary/50 underline-offset-2 hover:text-primary/80"
								>
									Connect on Login
								</Link>
								.
							</>
						)}
					</p>

					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="file"
								render={({
									field,
								}: {
									field: ControllerRenderProps<PublishValues, "file">;
								}) => (
									<FormItem>
										<FormLabel>Media</FormLabel>
										<FormControl>
											<Dropzone
												accept="image/*,video/*"
												file={field.value}
												onFileChange={field.onChange}
												disabled={publishing}
											/>
										</FormControl>
										<FormDescription>
											Images supported for Bluesky; video for YouTube Shorts.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="caption"
								render={({
									field,
								}: {
									field: ControllerRenderProps<PublishValues, "caption">;
								}) => {
									const appendHashtag = (tag: string) => {
										const hashtag = `#${tag}`;
										const current = field.value;
										const separator =
											current.length === 0
												? ""
												: current.includes("\n")
													? " "
													: "\n";
										const next = current + separator + hashtag;
										if (next.length <= 300) field.onChange(next);
									};
									return (
										<FormItem>
											<FormLabel>Caption</FormLabel>
											<FormControl>
												<Textarea
													placeholder="What's this about?"
													maxLength={300}
													className="min-h-[80px]"
													{...field}
												/>
											</FormControl>
											<div className="flex flex-wrap gap-1.5">
												{CLOUDINARY_CATEGORY_HASHTAGS.map((tag) => (
													<button
														key={tag}
														type="button"
														onClick={() => appendHashtag(tag)}
														disabled={publishing}
														className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-xs text-primary transition hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
													>
														#{tag}
													</button>
												))}
											</div>
											<FormDescription>
												{form.watch("caption").length}/300
											</FormDescription>
											<FormMessage />
										</FormItem>
									);
								}}
							/>

							<div className="flex flex-wrap items-center gap-4">
								<FormField
									control={form.control}
									name="postToBluesky"
									render={({
										field,
									}: {
										field: ControllerRenderProps<
											PublishValues,
											"postToBluesky"
										>;
									}) => (
										<FormItem className="flex flex-row items-center gap-2 space-y-0">
											<FormControl>
												<Checkbox
													checked={field.value}
													onCheckedChange={field.onChange}
													disabled={publishing}
												/>
											</FormControl>
											<FormLabel className="cursor-pointer font-normal">
												Post to Bluesky
											</FormLabel>
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="postToYoutube"
									render={({
										field,
									}: {
										field: ControllerRenderProps<
											PublishValues,
											"postToYoutube"
										>;
									}) => (
										<FormItem className="flex flex-row items-center gap-2 space-y-0">
											<FormControl>
												<Checkbox
													checked={field.value}
													onCheckedChange={field.onChange}
													disabled={publishing}
												/>
											</FormControl>
											<FormLabel className="cursor-pointer font-normal">
												Post to YouTube
											</FormLabel>
										</FormItem>
									)}
								/>
								<span className="text-xs text-muted-foreground">
									(YouTube Shorts use your channel auth)
								</span>
							</div>

							<FormField
								control={form.control}
								name="schedule"
								render={({
									field,
								}: {
									field: ControllerRenderProps<PublishValues, "schedule">;
								}) => (
									<FormItem className="flex flex-row items-center gap-2 space-y-0">
										<FormControl>
											<Checkbox
												checked={field.value}
												onCheckedChange={field.onChange}
												disabled={publishing}
											/>
										</FormControl>
										<FormLabel className="cursor-pointer font-normal">
											Schedule for later
										</FormLabel>
									</FormItem>
								)}
							/>

							{isSchedule && (
								<FormField
									control={form.control}
									name="scheduledAt"
									render={({
										field,
									}: {
										field: ControllerRenderProps<PublishValues, "scheduledAt">;
									}) => (
										<FormItem>
											<FormLabel>Date &amp; time</FormLabel>
											<FormControl>
												<input
													type="datetime-local"
													className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													min={new Date().toISOString().slice(0, 16)}
													{...field}
												/>
											</FormControl>
											<FormDescription>
												Your timezone. Keep the app running and call the process
												endpoint (or set up cron) so posts publish at this time.
											</FormDescription>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							{publishError && (
								<p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
									{publishError}
									{publishError.includes("YouTube") &&
									!publishError.includes("Login") ? (
										<>
											{" "}
											<Link
												to="/login"
												className="underline underline-offset-2"
											>
												Connect YouTube on the Login page
											</Link>
											.
										</>
									) : null}
								</p>
							)}
							{publishSuccess && (
								<p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
									Published and saved to history.
								</p>
							)}
							{scheduleSuccess && (
								<p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
									{scheduleSuccess}
								</p>
							)}

							<div className="flex flex-wrap gap-2">
								<Button
									type="submit"
									className="cursor-pointer"
									disabled={
										publishing ||
										!form.watch("file") ||
										(isSchedule && !form.watch("scheduledAt"))
									}
								>
									{publishing
										? isSchedule
											? "Scheduling…"
											: "Publishing…"
										: isSchedule
											? "Schedule"
											: "Publish"}
								</Button>
								{session && (
									<Button
										variant="ghost"
										size="sm"
										type="button"
										onClick={handleLogout}
									>
										Log out
									</Button>
								)}
							</div>
						</form>
					</Form>
				</div>
			</Card>

			{scheduledList.length > 0 && (
				<section className="mt-10">
					<h2 className="island-kicker mb-4 text-lg font-semibold tracking-wide text-primary">
						Scheduled
					</h2>
					<p className="mb-4 text-sm text-muted-foreground">
						These posts will be published when the process endpoint runs (e.g.
						cron every minute). Bluesky posts require the app to be running at
						the scheduled time.
					</p>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{scheduledList.map((item) => (
							<Card
								key={item.id}
								className="overflow-hidden border-primary/25 bg-card/80 shadow-md transition hover:border-primary/40 hover:shadow-lg"
							>
								<div className="w-full overflow-hidden bg-muted">
									{item.mediaType === "image" ? (
										<img
											src={item.mediaPath}
											alt=""
											className="h-auto w-full object-contain"
										/>
									) : (
										<video
											src={item.mediaPath}
											preload="metadata"
											playsInline
											className="aspect-video w-full object-contain"
											aria-label="Video"
										>
											<track kind="captions" srcLang="en" label="English" />
										</video>
									)}
								</div>
								<div className="p-3">
									<p className="line-clamp-2 text-sm font-medium">
										{item.caption || "No caption"}
									</p>
									<p className="mt-1 text-xs text-muted-foreground">
										{new Date(item.scheduledAt).toLocaleString()}
										{item.postToBluesky && " · Bluesky"}
										{item.postToYoutube && " · YouTube"}
									</p>
									<Button
										variant="outline"
										size="sm"
										className="mt-2 cursor-pointer"
										onClick={async () => {
											const { removed } = await removeScheduledPost({
												data: { id: item.id },
											});
											if (removed) loadScheduled();
										}}
									>
										Cancel
									</Button>
								</div>
							</Card>
						))}
					</div>
				</section>
			)}

			<section className="mt-10">
				<h2 className="island-kicker mb-4 text-lg font-semibold tracking-wide text-primary">
					Post history
				</h2>
				<p className="mb-4 text-sm text-muted-foreground">
					Items you've published are stored in{" "}
					<code className="rounded border border-primary/20 bg-card px-1.5 py-0.5 text-primary">
						content/posted
					</code>{" "}
					and listed below.
				</p>
				{history.length === 0 ? (
					<p className="text-muted-foreground">
						No posts yet. Publish something to see it here.
					</p>
				) : (
					<>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{history.slice(0, historyToShow).map((item) => {
								const blueskyUrl = blueskyPostUrl(item.bluesky?.uri);
								const youtubeUrl = youtubePostUrl(item.youtube?.videoId);
								return (
									<Card
										key={item.id}
										className="overflow-hidden border-primary/25 bg-card/80 shadow-md transition hover:border-primary/40 hover:shadow-lg py-0 flex flex-col gap-2 max-h-max"
									>
										<div className="w-full overflow-hidden bg-muted">
											{item.mediaType === "image" ? (
												<img
													src={item.mediaPath}
													alt=""
													className="h-auto w-full object-contain"
												/>
											) : (
												<video
													src={item.mediaPath}
													controls
													preload="metadata"
													playsInline
													className="aspect-video w-full object-contain"
													aria-label="Video"
												>
													<track kind="captions" srcLang="en" label="English" />
												</video>
											)}
										</div>
										<div className="p-3">
											<p className="line-clamp-2 text-sm font-medium">
												{item.caption || "No caption"}
											</p>
											<p className="mt-1 text-xs text-muted-foreground">
												{new Date(item.createdAt).toLocaleString()}
												{item.bluesky && " · Bluesky"}
												{item.youtube && " · YouTube"}
											</p>
											{(blueskyUrl || youtubeUrl) && (
												<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
													{blueskyUrl && (
														<a
															href={blueskyUrl}
															target="_blank"
															rel="noopener noreferrer"
															className="text-primary underline-offset-2 hover:underline"
														>
															View post on Bluesky
														</a>
													)}
													{youtubeUrl && (
														<a
															href={youtubeUrl}
															target="_blank"
															rel="noopener noreferrer"
															className="text-primary underline-offset-2 hover:underline"
														>
															View post on YouTube
														</a>
													)}
												</div>
											)}
										</div>
									</Card>
								);
							})}
						</div>
						{historyToShow < history.length && (
							<div className="mt-4 flex justify-center">
								<Button
									variant="outline"
									onClick={() =>
										setHistoryToShow((n) => Math.min(n + 12, history.length))
									}
								>
									Load more
								</Button>
							</div>
						)}
					</>
				)}
			</section>
		</main>
	);
}
