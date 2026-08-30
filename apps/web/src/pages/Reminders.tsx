import type { ChannelType, NotificationJob } from '@reminder/core'
import type { LucideIcon } from 'lucide-react'
import { Mail, MessageCircle, Plus, Smartphone, Webhook } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useResource } from '../api/resourceCache.js'
import { channelsCache, remindersCache, subscriptionsCache } from '../api/resources.js'
import { ListSkeleton } from '../components/skeletons.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent } from '../components/ui/card.js'
import { formatFriendlyDate, formatFriendlyDateTime } from '../lib/date.js'
import { cn } from '../lib/utils.js'

const DEFAULT_VISIBLE_COUNT = 5

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
  const [showAll, setShowAll] = useState(false)
  const { data: jobs, loading: jobsLoading, error: jobsError } = useResource(remindersCache)
  const { data: subscriptions } = useResource(subscriptionsCache)
  const { data: channels } = useResource(channelsCache)

  const nameById = new Map(subscriptions?.map((sub) => [sub.id, sub.name]))
  const channelById = new Map(channels?.map((channel) => [channel.id, channel]))
  const reminderGroups = jobs ? groupJobsByReminder(jobs) : []
  const visibleGroups = showAll ? reminderGroups : reminderGroups.slice(0, DEFAULT_VISIBLE_COUNT)
  const hiddenCount = reminderGroups.length - visibleGroups.length
  // Only show the skeleton before any data has ever loaded - a background
  // refresh() with jobs already in hand disables the list instead, so a
  // stale card can't be replaced by a redundant skeleton and clicked past.
  const refreshing = jobsLoading && jobs !== null

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

      {jobsLoading && jobs === null && <ListSkeleton />}
      {jobsError && <p className="text-base text-destructive">{jobsError}</p>}
      {jobs && jobs.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-base text-muted-foreground">No reminders scheduled.</p>
          <Button size="lg" onClick={handleNewReminder}>
            <Plus /> Add a reminder
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
        {visibleGroups.map((group) => (
          <Card key={group.key}>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-col gap-2">
                <Link
                  to={`/subscriptions/${group.subscriptionId}`}
                  className="font-medium underline underline-offset-2 hover:no-underline"
                >
                  {nameById.get(group.subscriptionId) ?? 'Subscription'}
                </Link>
                <Badge>Reminder on {formatFriendlyDateTime(group.sendAt)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1">
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

      {!showAll && hiddenCount > 0 && (
        <Button variant="outline" onClick={() => setShowAll(true)}>
          Show all ({reminderGroups.length})
        </Button>
      )}
    </div>
  )
}
