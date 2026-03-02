import type { ReactNode } from 'react'

export function MdxCallout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <aside className="not-prose my-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="island-kicker mb-2">{title}</p>
      <div className="text-sm leading-7 text-[var(--muted-foreground)]">
        {children}
      </div>
    </aside>
  )
}
