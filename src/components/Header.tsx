import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b border-primary/20 bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 shadow-header-bar">
			<nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4 justify-between">
				<h2 className="m-0 shrink-0 text-base font-semibold tracking-tight">
					<Button variant="outline" size="sm" asChild>
						<Link
							to="/"
							className="inline-flex items-center gap-2 no-underline border-primary/30 font-display tracking-wider text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
						>
							<span className="film-mark" aria-hidden="true" />
							JMT Hub
						</Link>
					</Button>
				</h2>

				<div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-2 sm:w-auto sm:flex-nowrap sm:pb-0">
					<Link
						to="/login"
						className="nav-link text-muted-foreground transition-colors hover:text-primary"
						activeProps={{ className: "nav-link is-active text-primary" }}
					>
						Log in
					</Link>
				</div>
			</nav>
		</header>
	);
}
