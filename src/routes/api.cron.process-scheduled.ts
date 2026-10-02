import { createFileRoute } from "@tanstack/react-router";
import { postImageToBlueskyWithSessionId } from "#/lib/bluesky-server";
import { recordPosted } from "#/lib/publish";
import {
	getDueScheduled,
	removeScheduledById,
	type ScheduledItem,
} from "#/lib/scheduled-queue";

export const Route = createFileRoute("/api/cron/process-scheduled")({
	server: {
		handlers: {
			GET: async () => {
				const due = getDueScheduled();
				const results: { id: string; ok: boolean; error?: string }[] = [];

				for (const item of due) {
					const result = await processOneScheduled(item);
					results.push(result);
					if (result.ok) {
						removeScheduledById(item.id);
					}
				}

				return new Response(
					JSON.stringify({ processed: results.length, results }),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			},
		},
	},
});

async function processOneScheduled(
	item: ScheduledItem,
): Promise<{ id: string; ok: boolean; error?: string }> {
	const now = new Date().toISOString();
	const record: Parameters<typeof recordPosted>[0] = {
		caption: item.caption,
		mediaPath: item.mediaPath,
		createdAt: item.createdAt,
		mediaType: item.mediaType,
	};

	if (item.postToBluesky && item.blueskySessionId) {
		if (item.mediaType !== "image") {
			return { id: item.id, ok: false, error: "Bluesky only supports images" };
		}
		const res = await postImageToBlueskyWithSessionId(item.blueskySessionId, {
			mediaPath: item.mediaPath,
			caption: item.caption,
		});
		if (!res.ok) {
			return { id: item.id, ok: false, error: res.error };
		}
		record.bluesky = { postedAt: now, uri: res.uri };
	}

	if (item.youtube) {
		record.youtube = {
			postedAt: item.youtube.publishAt,
			videoId: item.youtube.videoId,
		};
	}

	try {
		recordPosted(record);
		return { id: item.id, ok: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Failed to record";
		return { id: item.id, ok: false, error: message };
	}
}
