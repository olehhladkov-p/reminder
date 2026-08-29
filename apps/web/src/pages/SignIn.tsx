import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { authClient } from '../auth/authClient.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'

type Status =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent' }
  | { kind: 'error'; message: string }

export function SignIn() {
  const { data: session, isPending } = authClient.useSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  if (isPending) return null
  if (session) return <Navigate to="/" replace />

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setStatus({ kind: 'sending' })
    try {
      const { error } = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL: `${window.location.origin}/auth/callback`,
      })
      if (error) {
        setStatus({ kind: 'error', message: error.message ?? 'Could not send the link.' })
        return
      }
      setStatus({ kind: 'sent' })
    } catch {
      setStatus({ kind: 'error', message: 'Could not reach the server. Check your connection.' })
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Subscription Reminder</CardTitle>
          <CardDescription>Sign in with a magic link - no password needed.</CardDescription>
        </CardHeader>
        <CardContent>
          {status.kind === 'sent' ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-base font-medium">Check your email</p>
              <p className="text-base text-muted-foreground">
                We sent a sign-in link to {email}. Open it on this device to continue.
              </p>
              <Button variant="link" onClick={() => setStatus({ kind: 'idle' })}>
                Use a different email
              </Button>
            </div>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={sendMagicLink}>
              {status.kind === 'error' && (
                <p className="text-base text-destructive">{status.message}</p>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status.kind === 'sending'}
                  required
                />
              </div>
              <Button type="submit" disabled={status.kind === 'sending'}>
                {status.kind === 'sending' ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
