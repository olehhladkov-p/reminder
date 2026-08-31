import type { NotificationJob, Subscription } from '@reminder/core'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import { meCache, remindersCache, subscriptionsCache } from '../api/resources.js'
import { FormSkeleton } from '../components/skeletons.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'

function effectiveLeadDays(subscription: Subscription, defaultLeadDays: number[]) {
  return subscription.leadDays ?? defaultLeadDays
}

export function ReminderEdit() {
  const {
    subscriptionId,
    kind: kindParam,
    leadDays: leadDaysParam,
  } = useParams<{
    subscriptionId: string
    kind: string
    leadDays: string
  }>()
  const navigate = useNavigate()
  const { data: subscriptions, loading, error } = useResource(subscriptionsCache)
  const { data: me } = useResource(meCache)
  const [days, setDays] = useState(leadDaysParam ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const kind: NotificationJob['kind'] | null =
    kindParam === 'renewal' || kindParam === 'trial_end' ? kindParam : null
  const originalLeadDays = Number(leadDaysParam)
  const subscription = subscriptions?.find((sub) => sub.id === subscriptionId)
  const validReminder =
    Boolean(subscription && kind) && Number.isInteger(originalLeadDays) && originalLeadDays >= 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subscription || !kind || !validReminder || !me) {
      setFormError('Reminder details are still loading. Please try again.')
      return
    }

    const parsedDays = Number(days)
    if (!Number.isInteger(parsedDays) || parsedDays < 0) {
      setFormError('Enter a whole number of days.')
      return
    }

    setSubmitting(true)
    setFormError(null)
    try {
      const updatedDays = Array.from(
        new Set([
          ...effectiveLeadDays(subscription, me.defaultLeadDays).filter(
            (value) => value !== originalLeadDays,
          ),
          parsedDays,
        ]),
      )
      await api.subscriptions.update(subscription.id, { leadDays: updatedDays })
      await Promise.all([subscriptionsCache.refresh(), remindersCache.refresh()])
      toast.success('Reminder updated.')
      navigate('/reminders')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not update the reminder.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !subscriptions) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Edit reminder</h1>
        <Card>
          <CardContent>
            <FormSkeleton fields={2} />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !subscription || !kind || !validReminder) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Edit reminder</h1>
        <p className="text-base text-destructive">{error ?? 'Reminder not found.'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Edit reminder</h1>
      <Card>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {formError && <p className="text-base text-destructive">{formError}</p>}
            <div className="flex flex-col gap-2">
              <Label htmlFor="subscription">Subscription</Label>
              <Input id="subscription" value={subscription.name} disabled />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="reminder-type">Reminder type</Label>
              <Input
                id="reminder-type"
                value={kind === 'renewal' ? 'Renewal' : 'Trial ends'}
                disabled
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="days">Days before reminder date</Label>
              <Input
                id="days"
                type="number"
                min={0}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate('/reminders')}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save reminder'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
