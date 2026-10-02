import { createServerFn } from "@tanstack/react-start";
import {
	type PostedRecord,
	saveUpload as saveUploadFile,
	recordPosted as writePostedRecord,
} from "./publish";

/**
 * Save an uploaded file (base64) to public/uploads. Returns mediaPath and mediaType for use in posting.
 */
export const saveUpload = createServerFn()
	.inputValidator(
		(data: { fileBase64: string; mimeType: string; filename: string }) => data,
	)
	.handler(
		async ({
			data,
		}): Promise<{ mediaPath: string; mediaType: "image" | "video" }> => {
			return saveUploadFile(data);
		},
	);

/** Record a post to content/posted so it appears in history (content-collections). */
export const recordPosted = createServerFn()
	.inputValidator((record: PostedRecord) => record)
	.handler(
		async ({ data }: { data: PostedRecord }): Promise<{ id: string }> => {
			const id = writePostedRecord(data);
			return { id };
		},
	);

/** Upload image to Cloudinary when caption contains a category hashtag (same structure as instagram-cloudinary). */
export const uploadToCloudinaryIfTagged = createServerFn()
	.inputValidator(
		(data: {
			mediaPath: string;
			caption: string;
			createdAt: string;
			mediaType: "image" | "video";
		}) => data,
	)
	.handler(async ({ data }): Promise<{ uploaded: boolean; error?: string }> => {
		if (data.mediaType !== "image") return { uploaded: false };
		// dynamic import — cloudinary is Node-only and must not enter the client bundle
		const { uploadImageToCloudinaryIfTagged } = await import("./cloudinary");
		return uploadImageToCloudinaryIfTagged({
			mediaPath: data.mediaPath,
			caption: data.caption,
			createdAt: data.createdAt,
		});
	});
