import { Cloud } from "lucide-react";

/** pill shown on history cards whose image was archived to Cloudinary */
export function CloudinaryBadge() {
	return (
		<span className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-primary">
			<Cloud className="size-3" aria-hidden="true" />
			Cloudinary
		</span>
	);
}
