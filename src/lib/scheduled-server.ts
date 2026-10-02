import { createServerFn } from "@tanstack/react-start";
import type { ScheduledItem } from "./scheduled-queue";

export type ScheduledItemInput = Omit<ScheduledItem, "id" | "blueskySessionId">;

/** List all scheduled posts (for UI). */
export const listScheduled = createServerFn().handler(
	async (): Promise<ScheduledItem[]> => {
		const { readScheduled } = await import("./scheduled-queue");
		return readScheduled();
	},
);

/** Add a post to the schedule. Stores current Bluesky session id when postToBluesky is true. Converts scheduledAt to ISO UTC for storage. */
export const addScheduledPost = createServerFn()
	.inputValidator((data: ScheduledItemInput) => data)
	.handler(async ({ data }): Promise<{ id: string }> => {
		const { getCookie } = await import("@tanstack/react-start/server");
		const { getSessionCookieName } = await import("./bluesky-session");
		const blueskySessionId = data.postToBluesky
			? (getCookie(getSessionCookieName()) ?? undefined)
			: undefined;
		const scheduledAt =
			typeof data.scheduledAt === "string" && data.scheduledAt
				? new Date(data.scheduledAt).toISOString()
				: data.scheduledAt;
		const { addScheduled } = await import("./scheduled-queue");
		const id = addScheduled({
			...data,
			scheduledAt,
			blueskySessionId,
		});
		return { id };
	});

/** Remove a scheduled post by id. */
export const removeScheduledPost = createServerFn()
	.inputValidator((data: { id: string }) => data)
	.handler(async ({ data }): Promise<{ removed: boolean }> => {
		const { removeScheduled } = await import("./scheduled-queue");
		const removed = removeScheduled(data.id);
		return { removed };
	});
