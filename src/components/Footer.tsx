export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer mt-20 px-4 pb-14 pt-10 text-muted-foreground">
      <div className="page-wrap flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <p className="m-0 text-sm">
          &copy; {year} JMT Hub. All rights reserved.
        </p>
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground/90">Built with TanStack Start</p>
      </div>
      
    </footer>
  )
}
