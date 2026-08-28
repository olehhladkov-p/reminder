import { useEffect } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { authClient } from '../auth/authClient.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'

// The magic-link verify redirect (see apps/api's auth.ts) lands here. On
// success it has already set the session cookie before redirecting, so this
// just waits for useSession() to pick it up. On failure, better-auth appends
// ?error=&error_description= instead of a fresh cookie.
export function AuthCallback() {
  const { data: session, isPending, refetch } = authClient.useSession()
  const [searchParams] = useSearchParams()
  const error = searchParams.get('error')

  useEffect(() => {
    if (!error) refetch()
  }, [error, refetch])

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle className="text-xl">Sign-in failed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {searchParams.get('error_description') ?? 'That link is invalid or expired.'}
            </p>
            <Button asChild variant="secondary">
              <Link to="/sign-in">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isPending || !session) return null

  return <Navigate to="/" replace />
}
