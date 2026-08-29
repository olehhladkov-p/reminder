import type { ChannelType, NotificationJob } from '@reminder/core'
import type { LucideIcon } from 'lucide-react'
import { Mail, MessageCircle, Plus, Smartphone, Webhook } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useResource } from '../api/resourceCache.js'
import { channelsCache, remindersCache, subscriptionsCache } from '../api/resources.js'
import { ListSkeleton } from '../components/skeletons.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { formatFriendlyDate, formatFriendlyDateTime } from '../lib/date.js'

const kindLabels = { renewal: 'Renewal', trial_end: 'Trial ends' }

const channelLabels: Record<ChannelType, string> = {
  email: 'Email',
  push: 'Push',
  telegram: 'Telegram',
  webhook: 'Webhook',
}

const channelIcons: Record<ChannelType, LucideIcon> = {
  email: Mail,
  push: Smartphone,
  telegram: MessageCircle,
  webhook: Webhook,
}

interface ReminderGroup {
  key: string
  subscriptionId: string
  kind: NotificationJob['kind']
  occurrenceDate: string
  sendAt: Date
  channelIds: string[]
}

/** Jobs only differ per notification channel - one reminder, not one card per channel. */
function groupJobsByReminder(jobs: readonly NotificationJob[]): ReminderGroup[] {
  const groups = new Map<string, ReminderGroup>()
  for (const job of jobs) {
    const key = `${job.subscriptionId}:${job.kind}:${job.occurrenceDate}:${job.leadDays}`
    const existing = groups.get(key)
    if (existing) {
      if (!existing.channelIds.includes(job.channelId)) existing.channelIds.push(job.channelId)
    } else {
      groups.set(key, {
        key,
        subscriptionId: job.subscriptionId,
        kind: job.kind,
        occurrenceDate: job.occurrenceDate,
        sendAt: job.sendAt,
        channelIds: [job.channelId],
      })
    }
  }
  return [...groups.values()]
}

export function Reminders() {
  const navigate = useNavigate()
  const { data: jobs, loading: jobsLoading, error: jobsError } = useResource(remindersCache)
  const { data: subscriptions } = useResource(subscriptionsCache)
  const { data: channels } = useResource(channelsCache)

  const nameById = new Map(subscriptions?.map((sub) => [sub.id, sub.name]))
  const channelById = new Map(channels?.map((channel) => [channel.id, channel]))
  const reminderGroups = jobs ? groupJobsByReminder(jobs) : []

  function handleNewReminder() {
    if ((subscriptions?.length ?? 0) === 0) {
      toast('You need a subscription before you can add a reminder.', {
        action: { label: 'Create subscription', onClick: () => navigate('/subscriptions/new') },
      })
      return
    }
    navigate('/reminders/new')
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Upcoming reminders</h1>
        <Button size="sm" onClick={handleNewReminder}>
          <Plus /> New
        </Button>
      </header>

      {jobsLoading && <ListSkeleton />}
      {jobsError && <p className="text-base text-destructive">{jobsError}</p>}
      {jobs && jobs.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-base text-muted-foreground">No reminders scheduled.</p>
          <Button size="lg" onClick={handleNewReminder}>
            <Plus /> Add a reminder
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {reminderGroups.map((group) => (
          <Card key={group.key}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1 break-words">
                  <Link
                    to={`/subscriptions/${group.subscriptionId}`}
                    className="font-medium underline hover:no-underline"
                  >
                    {nameById.get(group.subscriptionId) ?? 'Subscription'}
                  </Link>
                </div>
                <Badge>Reminder at {formatFriendlyDateTime(group.sendAt)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {kindLabels[group.kind]} on {formatFriendlyDate(group.occurrenceDate)}
                </Badge>
                {group.channelIds.map((channelId) => {
                  const channel = channelById.get(channelId)
                  if (!channel) return null
                  const ChannelIcon = channelIcons[channel.type]
                  return (
                    <Badge key={channelId} variant="outline">
                      <ChannelIcon /> {channelLabels[channel.type]}
                    </Badge>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
