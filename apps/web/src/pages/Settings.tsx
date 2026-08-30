import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import {
  exchangeRatesCache,
  meCache,
  remindersCache,
  resetAllCaches,
  subscriptionsCache,
} from '../api/resources.js'
import { authClient } from '../auth/authClient.js'
import { FormSkeleton } from '../components/skeletons.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { computeBudgetSummary, eurFormatter } from '../lib/budget.js'
import { formatFriendlyDate } from '../lib/date.js'
import type { Theme } from '../lib/theme.js'
import { applyTheme, getStoredTheme, THEMES } from '../lib/theme.js'
import { cn } from '../lib/utils.js'
import { enablePushNotifications, isPushSupported } from '../push/subscribe.js'

const THEME_LABELS: Record<Theme, string> = {
  default: 'Default',
  bubble: 'Bubble',
  claude: 'Claude',
  elegant: 'Elegant',
  claymorphism: 'Claymorphism',
}

function ThemeSection() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())

  function handleChange(value: string) {
    const next = value as Theme
    setTheme(next)
    applyTheme(next)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Choose a color theme for the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <Label htmlFor="theme">Theme</Label>
          <Select value={theme} onValueChange={handleChange}>
            <SelectTrigger id="theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THEMES.map((t) => (
                <SelectItem key={t} value={t}>
                  {THEME_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}

function BudgetSection() {
  const {
    data: subscriptions,
    loading: subsLoading,
    error: subsError,
  } = useResource(subscriptionsCache)
  const { data: rates, loading: ratesLoading, error: ratesError } = useResource(exchangeRatesCache)

  const loading = subsLoading || ratesLoading
  const error = ratesError ?? subsError
  const summary = subscriptions && rates ? computeBudgetSummary(subscriptions, rates) : null
  // Only show the skeleton before a summary has ever been computed - a
  // background refresh() with a summary already in hand disables it instead,
  // so stale figures can't be replaced by a redundant skeleton mid-refresh.
  const refreshing = loading && summary !== null

  return (
    <Card id="budget">
      <CardHeader>
        <CardTitle className="text-base">Budget</CardTitle>
        <CardDescription>Estimated in EUR using live exchange rates.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && summary === null && <FormSkeleton fields={3} />}
        {error && <p className="text-base text-destructive">{error}</p>}
        {!loading && !error && subscriptions?.length === 0 && (
          <p className="text-base text-muted-foreground">Add a subscription to see your budget.</p>
        )}
        {summary && subscriptions && subscriptions.length > 0 && (
          <dl
            className={cn(
              'flex flex-col gap-3',
              refreshing && 'skeleton-shimmer pointer-events-none rounded-md opacity-60',
            )}
            aria-busy={refreshing || undefined}
          >
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base text-muted-foreground">Last 30 days</dt>
              <dd className="font-medium">{eurFormatter.format(summary.last30DaysEur)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base text-muted-foreground">Due in the next 30 days</dt>
              <dd className="font-medium">{eurFormatter.format(summary.upcomingMonthEur)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base text-muted-foreground">
                Total spent since{' '}
                {summary.periodStart ? formatFriendlyDate(summary.periodStart) : '—'}
              </dt>
              <dd className="font-medium">{eurFormatter.format(summary.totalSinceStartEur)}</dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

function detectedTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

export function Settings() {
  const { data: user, loading, error } = useResource(meCache)
  const [timezone, setTimezone] = useState('')
  const [digestLocalTime, setDigestLocalTime] = useState('')
  const [defaultLeadDays, setDefaultLeadDays] = useState('')
  const [saving, setSaving] = useState(false)
  const [enablingPush, setEnablingPush] = useState(false)
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(
    isPushSupported() ? Notification.permission : null,
  )

  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [])

  async function handleEnablePush() {
    setEnablingPush(true)
    try {
      await enablePushNotifications()
      setNotificationPermission(Notification.permission)
      toast.success('Push notifications enabled.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not enable push notifications.')
    } finally {
      setEnablingPush(false)
    }
  }

  useEffect(() => {
    if (!user) return
    setTimezone(user.timezone)
    setDigestLocalTime(user.digestLocalTime)
    setDefaultLeadDays(user.defaultLeadDays.join(', '))

    // A fresh signup starts with the UTC placeholder - fill in the real
    // timezone from the browser once, right after the user's first load.
    const detected = detectedTimezone()
    if (user.timezone === 'UTC' && detected && detected !== 'UTC') {
      api.me.update({ timezone: detected }).then(() => meCache.refresh())
    }
  }, [user])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const leadDays = defaultLeadDays
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .map(Number)
      await api.me.update({
        timezone: timezone.trim(),
        digestLocalTime,
        defaultLeadDays: leadDays,
      })
      await Promise.all([meCache.refresh(), remindersCache.refresh()])
      toast.success('Settings saved.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  function handleSignOut() {
    setSignOutDialogOpen(false)
    authClient.signOut()
    resetAllCaches()
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        {user ? (
          <p className="text-base text-muted-foreground">Signed in as {user.email}.</p>
        ) : (
          <Skeleton className="mt-1 h-4 w-48" />
        )}
      </div>

      {error && <p className="text-base text-destructive">{error}</p>}

      <Card>
        <CardContent>
          {loading && !user ? (
            <FormSkeleton fields={3} />
          ) : (
            <form
              className={cn(
                'flex flex-col gap-4',
                loading && user && 'skeleton-shimmer pointer-events-none rounded-md opacity-60',
              )}
              aria-busy={(loading && !!user) || undefined}
              onSubmit={handleSave}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="America/New_York"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="digestLocalTime">Daily digest time</Label>
                <Input
                  id="digestLocalTime"
                  type="time"
                  value={digestLocalTime}
                  onChange={(e) => setDigestLocalTime(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="defaultLeadDays">Default reminder lead days</Label>
                <Input
                  id="defaultLeadDays"
                  placeholder="7, 3, 1"
                  value={defaultLeadDays}
                  onChange={(e) => setDefaultLeadDays(e.target.value)}
                />
                <p className="text-base text-muted-foreground">
                  Comma-separated days before renewal.
                </p>
              </div>

              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <ThemeSection />

      <BudgetSection />

      {notificationPermission !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Push notifications</CardTitle>
            <CardDescription>
              {notificationPermission === 'denied'
                ? 'Notifications are blocked - allow them in your browser settings to enable this.'
                : 'Get renewal reminders as notifications on this device. On iPhone, install this app to your home screen first.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              disabled={enablingPush || notificationPermission === 'denied'}
              onClick={handleEnablePush}
            >
              {enablingPush
                ? 'Enabling…'
                : notificationPermission === 'granted'
                  ? 'Push notifications enabled'
                  : 'Enable push notifications'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Button
            variant="destructive"
            className="w-full hover:bg-destructive/80"
            onClick={() => setSignOutDialogOpen(true)}
          >
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Dialog open={signOutDialogOpen} onOpenChange={setSignOutDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>You'll need to sign in again with a magic link.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="hover:bg-destructive/80"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
