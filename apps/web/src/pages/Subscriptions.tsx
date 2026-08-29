import type { Subscription } from '@reminder/core'
import { MoreVertical, Plus, Trash2 } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.js'
import { formatFriendlyDate } from '../lib/date.js'

const cycleLabels: Record<Subscription['cycle'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom_days: 'Custom',
}

function formatPrice(sub: Subscription): string | null {
  if (sub.priceCents === null) return null
  const amount = (sub.priceCents / 100).toFixed(2)
  return sub.currency ? `${amount} ${sub.currency}` : amount
}

function formatCycle(sub: Subscription): string {
  if (sub.cycle === 'custom_days' && sub.intervalDays) {
    return `Every ${sub.intervalDays} day${sub.intervalDays === 1 ? '' : 's'}`
  }
  return cycleLabels[sub.cycle]
}

export function Subscriptions() {
  const { data: subscriptions, loading, error } = useResource(subscriptionsCache)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)

  async function confirmDelete() {
    if (!deleteTarget) return
    const sub = deleteTarget
    setDeleteTarget(null)
    setPendingId(sub.id)
    try {
      await api.subscriptions.remove(sub.id)
      await Promise.all([subscriptionsCache.refresh(), remindersCache.refresh()])
      toast.success(`Deleted "${sub.name}".`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setPendingId(null)
    }
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
                <div className="flex min-w-0 flex-col gap-2">
                  <Link
                    to={`/subscriptions/${sub.id}`}
                    className="font-medium underline hover:no-underline"
                  >
                    {sub.name}
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">
                      Renews {formatFriendlyDate(sub.nextRenewalDate)}
                    </Badge>
                    {price && <Badge variant="secondary">{price}</Badge>}
                    <Badge variant="outline">{formatCycle(sub)}</Badge>
                    {sub.status !== 'active' && (
                      <Badge variant="secondary" className="capitalize">
                        {sub.status}
                      </Badge>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" disabled={busy} aria-label="More actions">
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(sub)}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
