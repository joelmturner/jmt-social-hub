import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { completeYoutubeOAuth } from '#/lib/youtube-auth'

export const Route = createFileRoute('/auth/youtube/callback')({
  component: YoutubeCallbackPage,
})

function YoutubeCallbackPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')
  const [message, setMessage] = useState<string>('Finishing YouTube connection…')

  useEffect(() => {
    async function run() {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        const error = params.get('error')
        if (error) {
          setStatus('error')
          setMessage(error || 'YouTube connection was cancelled.')
          return
        }
        if (!code) {
          setStatus('error')
          setMessage('Missing OAuth code in callback.')
          return
        }
        const result = await completeYoutubeOAuth({ data: { code } })
        if (result.ok) {
          setStatus('success')
          setMessage('YouTube channel connected. Redirecting…')
          setTimeout(() => {
            navigate({ to: '/' })
          }, 800)
        } else {
          setStatus('error')
          setMessage(result.error)
        }
      } catch (err) {
        setStatus('error')
        setMessage(
          err instanceof Error ? err.message : 'Something went wrong finishing YouTube login.',
        )
      }
    }
    void run()
  }, [navigate])

  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          YouTube
        </p>
        <h1 className="mb-4 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
          Connecting channel…
        </h1>
        <p
          className={
            status === 'error'
              ? 'text-sm text-destructive'
              : 'text-sm text-muted-foreground'
          }
        >
          {message}
        </p>
      </div>
    </main>
  )
}

