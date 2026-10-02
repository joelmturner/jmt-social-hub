/**
 * Server-only: upload images to Cloudinary when caption includes category hashtags.
 * Mirrors structure from instagram-cloudinary (folder "illustration", public_id timestamp_id, tags).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { v2 as cloudinary } from "cloudinary";
import { getTagsFromCaption } from "#/lib/constants";

const CLOUD_FOLDER = "illustration";
const INSTAGRAM_PUBLISH_FOLDER = "instagram-publish";

function getConfig() {
	const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
	const apiKey = process.env.CLOUDINARY_API_KEY;
	const apiSecret = process.env.CLOUDINARY_API_SECRET;
	if (!cloudName || !apiKey || !apiSecret) return null;
	return { cloudName, apiKey, apiSecret };
}

function configureCloudinary(): NonNullable<
	ReturnType<typeof getConfig>
> | null {
	const config = getConfig();
	if (!config) return null;
	cloudinary.config({
		cloud_name: config.cloudName,
		api_key: config.apiKey,
		api_secret: config.apiSecret,
		secure: true,
	});
	return config;
}

/**
 * Resolve media path to absolute file path on disk.
 */
function getAbsolutePath(mediaPath: string): string {
	const normalized = mediaPath.startsWith("/") ? mediaPath.slice(1) : mediaPath;
	return join(process.cwd(), "public", normalized);
}

export type UploadImageParams = {
	mediaPath: string;
	caption: string;
	createdAt: string;
};

/**
 * Upload image to Cloudinary when caption contains at least one category hashtag.
 * Uses same structure as instagram-cloudinary: folder "illustration", public_id = timestamp_id, tags.
 */
export async function uploadImageToCloudinaryIfTagged(
	params: UploadImageParams,
): Promise<{ uploaded: boolean; error?: string }> {
	const { mediaPath, caption, createdAt } = params;
	const tags = getTagsFromCaption(caption);
	if (tags.length === 0) return { uploaded: false };

	if (!configureCloudinary())
		return { uploaded: false, error: "Cloudinary not configured" };

	const absolutePath = getAbsolutePath(mediaPath);
	if (!existsSync(absolutePath))
		return { uploaded: false, error: `File not found: ${mediaPath}` };

	// same naming as instagram-cloudinary: timestamp_id for sortable public_id
	const timestamp = new Date(createdAt).valueOf();
	const basename =
		mediaPath.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "") || "image";
	const publicId = `${timestamp}_${basename}`;

	try {
		// skip upload if this public_id already exists (dedupe)
		try {
			await cloudinary.api.resource(publicId, {
				resource_type: "image",
				type: "upload",
			});
			return { uploaded: false };
		} catch (err: unknown) {
			const httpCode = (err as { http_code?: number } | null)?.http_code;
			if (httpCode && httpCode !== 404) {
				const message =
					(err as { message?: string } | null)?.message ?? String(err);
				return { uploaded: false, error: message };
			}
			// http 404 means not found; continue to upload
		}

		await cloudinary.uploader.upload(absolutePath, {
			public_id: publicId,
			folder: CLOUD_FOLDER,
			overwrite: true,
			tags,
		});

		// trigger Netlify rebuild for project that consumes Cloudinary
		const buildHookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
		if (buildHookUrl) {
			fetch(buildHookUrl, { method: "POST" }).catch(() => {
				// non-blocking; don't fail the upload if webhook fails
			});
		}

		return { uploaded: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { uploaded: false, error: message };
	}
}

/**
 * Upload image to Cloudinary folder used as a public HTTPS host for Meta's image_url.
 * Always uploads (ignores category hashtags). Separate from illustration archival.
 */
export async function uploadImageForInstagramPublish(params: {
	mediaPath: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
	const { mediaPath } = params;
	if (!configureCloudinary())
		return { ok: false, error: "Cloudinary not configured" };

	const absolutePath = getAbsolutePath(mediaPath);
	if (!existsSync(absolutePath))
		return { ok: false, error: `File not found: ${mediaPath}` };

	const basename =
		mediaPath.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "") || "image";
	const publicId = `${Date.now()}_${basename}`;

	try {
		const result = await cloudinary.uploader.upload(absolutePath, {
			public_id: publicId,
			folder: INSTAGRAM_PUBLISH_FOLDER,
			overwrite: true,
			resource_type: "image",
		});
		const url =
			typeof result.secure_url === "string"
				? result.secure_url
				: typeof result.url === "string"
					? result.url
					: null;
		if (!url) return { ok: false, error: "Cloudinary upload returned no URL" };
		return { ok: true, url };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, error: message };
	}
}
