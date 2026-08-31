import type { Subscription } from '@reminder/core'
import { Eye, MoreVertical, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import { exchangeRatesCache, remindersCache, subscriptionsCache } from '../api/resources.js'
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
import { computeBudgetSummary, eurFormatter } from '../lib/budget.js'
import { formatFriendlyDate } from '../lib/date.js'
import { cn } from '../lib/utils.js'

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

function UpcomingBudgetBanner() {
  const { data: subscriptions } = useResource(subscriptionsCache)
  const { data: rates } = useResource(exchangeRatesCache)

  if (!subscriptions || subscriptions.length === 0 || !rates) return null
  const { upcomingMonthEur } = computeBudgetSummary(subscriptions, rates)

  return (
    <Card className="border bg-card text-foreground">
      <CardContent className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base">
          Due in the next 30 days:{' '}
          <span className="font-medium">{eurFormatter.format(upcomingMonthEur)}</span>
        </p>
        <Link
          to="/budget"
          className="text-base font-medium underline underline-offset-2 hover:no-underline"
        >
          View full budget
        </Link>
      </CardContent>
    </Card>
  )
}

export function Subscriptions() {
  const navigate = useNavigate()
  const { data: subscriptions, loading, error } = useResource(subscriptionsCache)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)
  // Only show the skeleton before any data has ever loaded - a background
  // refresh() with subscriptions already in hand disables the list instead,
  // so a stale card can't be replaced by a redundant skeleton and clicked past.
  const refreshing = loading && subscriptions !== null

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

      <UpcomingBudgetBanner />

      {loading && subscriptions === null && <ListSkeleton />}
      {error && <p className="text-base text-destructive">{error}</p>}

      {subscriptions && subscriptions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-base text-muted-foreground">No subscriptions yet.</p>
          <Button asChild size="lg">
            <Link to="/subscriptions/new">
              <Plus /> Add your first subscription
            </Link>
          </Button>
        </div>
      )}

      <div
        className={cn(
          'flex flex-col gap-3',
          refreshing && 'skeleton-shimmer pointer-events-none rounded-md opacity-60',
        )}
        aria-busy={refreshing || undefined}
      >
        {subscriptions?.map((sub) => {
          const price = formatPrice(sub)
          const busy = pendingId === sub.id
          return (
            <Card key={sub.id} className="relative">
              <CardContent className="flex flex-col items-start gap-2 pr-14">
                <Link
                  to={`/subscriptions/${sub.id}`}
                  className="font-medium underline underline-offset-2 hover:no-underline"
                >
                  {sub.name}
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    Renews {formatFriendlyDate(sub.nextRenewalDate)}
                  </Badge>
                  {price && <Badge variant="secondary">{price}</Badge>}
                  <Badge variant="outline">{formatCycle(sub)}</Badge>
                  {sub.isTrial && <Badge>Trial</Badge>}
                  {sub.status !== 'active' && (
                    <Badge variant="secondary" className="capitalize">
                      {sub.status}
                    </Badge>
                  )}
                </div>
              </CardContent>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={busy}
                    aria-label="More actions"
                    className="absolute top-3 right-3"
                  >
                    <MoreVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate(`/subscriptions/${sub.id}`)}>
                    <Eye /> View details
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(sub)}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
