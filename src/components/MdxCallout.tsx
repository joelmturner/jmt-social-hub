import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export function MdxCallout({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<Card className="not-prose my-6 p-4" data-slot="callout">
			<p className="island-kicker mb-2">{title}</p>
			<CardContent className="p-0 text-sm leading-7 text-muted-foreground">
				{children}
			</CardContent>
		</Card>
	);
}
