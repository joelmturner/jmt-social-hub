export const CLOUDINARY_CATEGORY_HASHTAGS = [
	"handletteredabcs_2016",
	"inktober2017",
	"inktober2018",
	"inktober2019",
	"inktober2021",
	"inktober2022",
	"inktober2023",
	"inktober2024",
	"inktober2025",
	"inktober2026",
	"inktober2027",
	"inktober2028",
	"inktober2029",
	"inktober2030",
	"joelmturner_abcs2017",
	"joelmturner_featured",
	"joelmturner_rubberhose",
	"jmt_dorbs",
	"letterclash",
];

export const YOUTUBE_CATEGORY_HASHTAGS = ["jmt_animation", "jmt_featured"];

export type IllustrationTag = (typeof CLOUDINARY_CATEGORY_HASHTAGS)[number];
export type YoutubeTag = (typeof YOUTUBE_CATEGORY_HASHTAGS)[number];

/** category hashtags in a caption that archive the image to Cloudinary */
export function getTagsFromCaption(caption: string): string[] {
	const lower = caption.toLowerCase();
	return CLOUDINARY_CATEGORY_HASHTAGS.filter((tag) =>
		lower.includes(`#${tag.toLowerCase()}`),
	);
}

/** image posts with a category hashtag are uploaded to Cloudinary */
export function wasSentToCloudinary(
	caption: string,
	mediaType: "image" | "video",
): boolean {
	return mediaType === "image" && getTagsFromCaption(caption).length > 0;
}
