import { Link } from '@tanstack/react-router'

export default function NotFound() {
  return (
    <main className="page-wrap flex min-h-[60vh] flex-col items-center justify-center px-4 pb-8 pt-14">
      <h1 className="mb-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
        Page not found
      </h1>
      <p className="mb-6 text-muted-foreground">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Go home
      </Link>
    </main>
  )
}
