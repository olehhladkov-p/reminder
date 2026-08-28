import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authClient } from '../auth/authClient.js'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return null
  if (!session) return <Navigate to="/sign-in" replace />

  return children
}
