import type { User } from '@reminder/core'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '../api/client.js'
import { useResource } from '../api/resourceCache.js'
import { meCache, remindersCache, resetAllCaches } from '../api/resources.js'
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
import type { ColorMode, Theme } from '../lib/theme.js'
import {
  applyColorMode,
  applyTheme,
  COLOR_MODES,
  getStoredColorMode,
  getStoredTheme,
  THEME_OPTIONS,
} from '../lib/theme.js'
import { cn } from '../lib/utils.js'
import {
  enablePushNotifications,
  hasActivePushSubscription,
  isPushSupported,
} from '../push/subscribe.js'

// Each SelectItem is min-h-10 (40px); the viewport adds 4px padding top and
// bottom, so 8 rows works out to 8 * 40 + 8 = 328px.
const MAX_VISIBLE_THEME_ITEMS = 8
const THEME_LIST_MAX_HEIGHT = `${MAX_VISIBLE_THEME_ITEMS * 40 + 8}px`

const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  system: 'Use system setting',
  light: 'Light',
  dark: 'Dark',
}

function ThemeSection({ user }: { user: User | null }) {
  const [theme, setTheme] = useState<Theme>(() => user?.theme ?? getStoredTheme())
  const [colorMode, setColorMode] = useState<ColorMode>(
    () => user?.colorMode ?? getStoredColorMode(),
  )

  // Once the account's saved values load, reflect them here too (AppLayout
  // applies them to the document; this just keeps the selects in sync).
  useEffect(() => {
    if (!user) return
    setTheme(user.theme)
    setColorMode(user.colorMode)
  }, [user])

  async function handleThemeChange(value: string) {
    const previous = theme
    setTheme(value)
    applyTheme(value)
    try {
      await api.me.update({ theme: value })
      meCache.refresh()
    } catch (err) {
      setTheme(previous)
      applyTheme(previous)
      toast.error(err instanceof Error ? err.message : 'Could not save theme.')
    }
  }

  async function handleColorModeChange(value: string) {
    const next = value as ColorMode
    const previous = colorMode
    setColorMode(next)
    applyColorMode(next)
    try {
      await api.me.update({ colorMode: next })
      meCache.refresh()
    } catch (err) {
      setColorMode(previous)
      applyColorMode(previous)
      toast.error(err instanceof Error ? err.message : 'Could not save color mode.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Appearance</CardTitle>
        <CardDescription>Choose a color theme for the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="theme">Theme</Label>
            <Select value={theme} onValueChange={handleThemeChange}>
              <SelectTrigger id="theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={{ maxHeight: THEME_LIST_MAX_HEIGHT }}>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.name} value={option.name}>
                    {option.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="colorMode">Color mode</Label>
            <Select value={colorMode} onValueChange={handleColorModeChange}>
              <SelectTrigger id="colorMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLOR_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {COLOR_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
  const [pushSubscribed, setPushSubscribed] = useState(false)

  useEffect(() => {
    if (!location.hash) return
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [])

  useEffect(() => {
    hasActivePushSubscription().then(setPushSubscribed)
  }, [])

  async function handleEnablePush() {
    setEnablingPush(true)
    try {
      await enablePushNotifications()
      setNotificationPermission(Notification.permission)
      setPushSubscribed(true)
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

      <ThemeSection user={user} />

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
              disabled={enablingPush || notificationPermission === 'denied' || pushSubscribed}
              onClick={handleEnablePush}
            >
              {enablingPush
                ? 'Enabling…'
                : pushSubscribed
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
