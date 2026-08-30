import type { ChannelConfig } from '@reminder/core'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import { channelsCache, remindersCache } from '../api/resources.js'
import { ListSkeleton } from '../components/skeletons.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { cn } from '../lib/utils.js'

function describeTarget(channel: ChannelConfig): string {
  if (channel.type === 'email' && typeof channel.target.email === 'string') {
    return channel.target.email
  }
  if (channel.type === 'push') {
    if (channel.target.platform === 'mobile') return 'Mobile notifications'
    if (channel.target.platform === 'desktop') return 'Desktop notifications'
    return 'Push notifications'
  }
  return channel.type
}

export function Channels() {
  const { data: channels, loading, error } = useResource(channelsCache)
  const [email, setEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  // Only show the skeleton before any data has ever loaded - a background
  // refresh() with channels already in hand disables the list instead, so a
  // stale card can't be replaced by a redundant skeleton and clicked past.
  const refreshing = loading && channels !== null

  async function addEmailChannel(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setAdding(true)
    setFormError(null)
    try {
      await api.channels.create({ type: 'email', target: { email: email.trim() }, enabled: true })
      setEmail('')
      await Promise.all([channelsCache.refresh(), remindersCache.refresh()])
      toast.success('Channel added.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add channel.')
    } finally {
      setAdding(false)
    }
  }

  async function removeChannel(id: string) {
    setPendingId(id)
    try {
      await api.channels.remove(id)
      await Promise.all([channelsCache.refresh(), remindersCache.refresh()])
    } finally {
      setPendingId(null)
    }
  }

  async function verifyChannel(id: string) {
    setPendingId(id)
    try {
      const result = await api.channels.verify(id)
      if (result.ok) {
        toast.success('Test notification sent.')
      } else {
        toast.error(result.error ?? 'Verification failed.')
      }
      await channelsCache.refresh()
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>

      {loading && channels === null && <ListSkeleton count={2} />}
      {error && <p className="text-base text-destructive">{error}</p>}

      <div
        className={cn(
          'flex flex-col gap-3',
          refreshing && 'skeleton-shimmer pointer-events-none rounded-md opacity-60',
        )}
        aria-busy={refreshing || undefined}
      >
        {channels?.map((channel) => {
          const busy = pendingId === channel.id
          return (
            <Card key={channel.id}>
              <CardContent className="flex flex-col gap-2">
                <p className="min-w-0 truncate font-medium">{describeTarget(channel)}</p>
                <div className="flex items-center gap-2">
                  <Badge variant={channel.verifiedAt ? 'default' : 'secondary'}>
                    {channel.verifiedAt ? 'Verified' : 'Not verified'}
                  </Badge>
                  {!channel.enabled && <Badge variant="outline">Disabled</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => verifyChannel(channel.id)}
                  >
                    Send test
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => removeChannel(channel.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add email channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={addEmailChannel}>
            {formError && <p className="text-base text-destructive">{formError}</p>}
            <div className="flex flex-col gap-2">
              <Label htmlFor="channel-email">Email address</Label>
              <Input
                id="channel-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={adding} className="self-end">
              {adding ? 'Adding…' : 'Add channel'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
