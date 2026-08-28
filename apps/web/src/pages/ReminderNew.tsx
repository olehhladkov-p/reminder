import type { Subscription } from '@reminder/core'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import { channelsCache, meCache, remindersCache, subscriptionsCache } from '../api/resources.js'
import { FormSkeleton } from '../components/skeletons.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js'

function notifyNeedsSubscriptionFirst(navigate: (path: string) => void) {
  toast('You need a subscription before you can add a reminder.', {
    action: { label: 'Create subscription', onClick: () => navigate('/subscriptions/new') },
  })
}

export function ReminderNew() {
  const navigate = useNavigate()
  const { data: subscriptions, loading } = useResource(subscriptionsCache)
  const { data: channels } = useResource(channelsCache)
  const { data: me } = useResource(meCache)

  // Reached directly (URL, back button, bookmark) without going through the
  // Reminders page's own guard - bounce back with the same message instead
  // of showing a dead-end form.
  useEffect(() => {
    if (!loading && (subscriptions?.length ?? 0) === 0) {
      notifyNeedsSubscriptionFirst(navigate)
      navigate('/reminders', { replace: true })
    }
  }, [loading, subscriptions, navigate])

  if (loading || (subscriptions?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">New reminder</h1>
        <Card>
          <CardContent>
            <FormSkeleton fields={2} />
          </CardContent>
        </Card>
      </div>
    )
  }

  const hasEnabledChannel = channels?.some((c) => c.enabled) ?? true

  return (
    <PickReminderForm
      subscriptions={subscriptions ?? []}
      defaultLeadDays={me?.defaultLeadDays ?? []}
      hasEnabledChannel={hasEnabledChannel}
      onCancel={() => navigate('/reminders')}
    />
  )
}

interface PickReminderFormProps {
  subscriptions: Subscription[]
  defaultLeadDays: number[]
  hasEnabledChannel: boolean
  onCancel: () => void
}

function PickReminderForm({
  subscriptions,
  defaultLeadDays,
  hasEnabledChannel,
  onCancel,
}: PickReminderFormProps) {
  const navigate = useNavigate()
  const [subscriptionId, setSubscriptionId] = useState(subscriptions[0]?.id ?? '')
  const [days, setDays] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsedDays = Number(days)
    if (!Number.isInteger(parsedDays) || parsedDays < 0) {
      setError('Enter a whole number of days.')
      return
    }
    const sub = subscriptions.find((s) => s.id === subscriptionId)
    if (!sub) return

    setSubmitting(true)
    setError(null)
    try {
      // A subscription's own leadDays overrides the user default entirely
      // once set - merge into whichever is currently in effect so adding a
      // custom reminder doesn't silently drop the existing ones.
      const effective = sub.leadDays ?? defaultLeadDays
      const merged = Array.from(new Set([...effective, parsedDays]))
      await api.subscriptions.update(subscriptionId, { leadDays: merged })
      await Promise.all([subscriptionsCache.refresh(), remindersCache.refresh()])

      // Materialization silently produces nothing if there's no enabled
      // channel, or if the computed send time is more than a day in the
      // past (e.g. too many days before a renewal that's already close) -
      // confirm the job actually landed rather than claiming success blind.
      const created = remindersCache
        .getSnapshot()
        .data?.some((job) => job.subscriptionId === subscriptionId && job.leadDays === parsedDays)

      if (!created) {
        setError(
          hasEnabledChannel
            ? `That's too close to (or past) the renewal date to schedule a reminder ${parsedDays} day(s) ahead - try a smaller number.`
            : 'The reminder was not scheduled because you have no enabled notification channel yet. Add one in Channels first.',
        )
        return
      }

      toast.success(`Reminder added for "${sub.name}".`)
      navigate('/reminders')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the reminder.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">New reminder</h1>

      {!hasEnabledChannel && (
        <p className="text-sm text-muted-foreground">
          You don't have an enabled notification channel yet - add one in{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => navigate('/channels')}>
            Channels
          </Button>{' '}
          or this reminder won't be sent.
        </p>
      )}

      <Card>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-col gap-2">
              <Label htmlFor="subscription">Subscription</Label>
              <Select value={subscriptionId} onValueChange={setSubscriptionId}>
                <SelectTrigger id="subscription">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subscriptions.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="days">Days before renewal</Label>
              <Input
                id="days"
                type="number"
                min={0}
                placeholder="14"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !subscriptionId}>
                {submitting ? 'Adding…' : 'Add reminder'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
