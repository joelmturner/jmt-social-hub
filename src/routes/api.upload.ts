import { createFileRoute } from "@tanstack/react-router";
import { saveUploadFromBuffer } from "#/lib/publish";

export const Route = createFileRoute("/api/upload")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const formData = await request.formData();
				const file = formData.get("file");
				if (!file || !(file instanceof File)) {
					return new Response(
						JSON.stringify({
							error: 'Missing file in form data (use field "file")',
						}),
						{ status: 400, headers: { "Content-Type": "application/json" } },
					);
				}
				const buffer = Buffer.from(await file.arrayBuffer());
				const { mediaPath, mediaType } = saveUploadFromBuffer(
					buffer,
					file.name,
				);
				return new Response(JSON.stringify({ mediaPath, mediaType }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		},
	},
});
