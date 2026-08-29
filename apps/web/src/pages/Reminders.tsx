import type { ChannelType } from '@reminder/core'
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

export function Reminders() {
  const navigate = useNavigate()
  const { data: jobs, loading: jobsLoading, error: jobsError } = useResource(remindersCache)
  const { data: subscriptions } = useResource(subscriptionsCache)
  const { data: channels } = useResource(channelsCache)

  const nameById = new Map(subscriptions?.map((sub) => [sub.id, sub.name]))
  const channelById = new Map(channels?.map((channel) => [channel.id, channel]))

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
      {jobsError && <p className="text-sm text-destructive">{jobsError}</p>}
      {jobs && jobs.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">No reminders scheduled.</p>
          <Button size="lg" onClick={handleNewReminder}>
            <Plus /> Add a reminder
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {jobs?.map((job) => {
          const channel = channelById.get(job.channelId)
          const ChannelIcon = channel ? channelIcons[channel.type] : null
          return (
            <Card key={job.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1 break-words">
                    <Link
                      to={`/subscriptions/${job.subscriptionId}`}
                      className="font-medium underline hover:no-underline"
                    >
                      {nameById.get(job.subscriptionId) ?? 'Subscription'}
                    </Link>
                  </div>
                  <Badge>Reminder at {formatFriendlyDateTime(job.sendAt)}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {kindLabels[job.kind]} on {formatFriendlyDate(job.occurrenceDate)}
                  </Badge>
                  {channel && ChannelIcon && (
                    <Badge variant="outline">
                      <ChannelIcon /> {channelLabels[channel.type]}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
