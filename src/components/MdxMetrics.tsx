import { Card, CardContent } from "@/components/ui/card";

export function MdxMetrics({
	items,
}: {
	items: Array<{ label: string; value: string }>;
}) {
	return (
		<div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
			{items.map((item) => (
				<Card key={item.label} className="px-4 py-3">
					<CardContent className="p-0">
						<p className="m-0 text-xs uppercase tracking-[0.12em] text-muted-foreground">
							{item.label}
						</p>
						<p className="m-0 mt-1 text-lg font-semibold text-foreground">
							{item.value}
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
