import type { Subscription } from '@reminder/core'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import { remindersCache, subscriptionsCache } from '../api/resources.js'
import { ListSkeleton } from '../components/skeletons.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js'
import { formatFriendlyDate } from '../lib/date.js'

function formatPrice(sub: Subscription): string | null {
  if (sub.priceCents === null) return null
  const amount = (sub.priceCents / 100).toFixed(2)
  return sub.currency ? `${amount} ${sub.currency}` : amount
}

export function Subscriptions() {
  const { data: subscriptions, loading, error } = useResource(subscriptionsCache)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)

  async function runAction(id: string, action: () => Promise<unknown>, successMessage?: string) {
    setPendingId(id)
    try {
      await action()
      await Promise.all([subscriptionsCache.refresh(), remindersCache.refresh()])
      if (successMessage) toast.success(successMessage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setPendingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const sub = deleteTarget
    setDeleteTarget(null)
    await runAction(sub.id, () => api.subscriptions.remove(sub.id), `Deleted "${sub.name}".`)
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Subscriptions</h1>
        <Button asChild size="sm">
          <Link to="/subscriptions/new">
            <Plus /> New
          </Link>
        </Button>
      </header>

      {loading && <ListSkeleton />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {subscriptions && subscriptions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          <Button asChild size="lg">
            <Link to="/subscriptions/new">
              <Plus /> Add your first subscription
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {subscriptions?.map((sub) => {
          const price = formatPrice(sub)
          const busy = pendingId === sub.id
          return (
            <Card key={sub.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Link
                    to={`/subscriptions/${sub.id}`}
                    className="font-medium underline hover:no-underline"
                  >
                    {sub.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Renews on {formatFriendlyDate(sub.nextRenewalDate)}
                    {price ? ` · ${price}` : ''}
                  </p>
                  {sub.status !== 'active' && (
                    <Badge variant="secondary" className="w-fit capitalize">
                      {sub.status}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {sub.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => runAction(sub.id, () => api.subscriptions.pause(sub.id))}
                    >
                      Pause
                    </Button>
                  )}
                  {sub.status === 'paused' && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => runAction(sub.id, () => api.subscriptions.resume(sub.id))}
                    >
                      Resume
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      runAction(sub.id, () => api.subscriptions.renew(sub.id), 'Renewed.')
                    }
                  >
                    Renew
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => setDeleteTarget(sub)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete subscription?</DialogTitle>
            <DialogDescription>
              This deletes "{deleteTarget?.name}" and its scheduled reminders. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
