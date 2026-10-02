import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<main className="page-wrap flex min-h-[60vh] flex-col items-center justify-center px-4 pb-8 pt-14">
			<div className="island-shell relative w-full max-w-md overflow-hidden px-8 py-12 text-center">
				<p className="island-kicker mb-3 justify-center">Reel missing</p>
				<h1 className="mb-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
					Page not found
				</h1>
				<div className="ornament-rule" aria-hidden="true">
					<span>◆</span>
				</div>
				<p className="mb-6 text-muted-foreground">
					The page you're looking for doesn't exist or has been moved.
				</p>
				<Button asChild>
					<Link to="/">Go home</Link>
				</Button>
			</div>
		</main>
	);
}
