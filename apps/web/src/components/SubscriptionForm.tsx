import type { CreateSubscriptionInput, Cycle, Subscription } from '@reminder/core'
import { useState } from 'react'
import { Button } from './ui/button.js'
import { Input } from './ui/input.js'
import { Label } from './ui/label.js'
import { RadioGroup, RadioGroupItem } from './ui/radio-group.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.js'
import { Textarea } from './ui/textarea.js'

const currencies = ['EUR', 'UAH', 'USD'] as const

export interface SubscriptionFormValues {
  name: string
  nextRenewalDate: string
  cycle: Cycle
  intervalDays: string
  priceCents: string
  currency: string
  leadDays: string
  trialEndsAt: string
  trialLeadDays: string
  cancelUrl: string
  notes: string
}

export function subscriptionToFormValues(sub: Subscription): SubscriptionFormValues {
  return {
    name: sub.name,
    nextRenewalDate: sub.nextRenewalDate,
    cycle: sub.cycle,
    intervalDays: sub.intervalDays?.toString() ?? '',
    priceCents: sub.priceCents !== null ? (sub.priceCents / 100).toString() : '',
    currency:
      sub.currency && currencies.includes(sub.currency as (typeof currencies)[number])
        ? sub.currency
        : 'EUR',
    leadDays: sub.leadDays?.join(', ') ?? '',
    trialEndsAt: sub.trialEndsAt ?? '',
    trialLeadDays: sub.trialLeadDays?.join(', ') ?? '',
    cancelUrl: sub.cancelUrl ?? '',
    notes: sub.notes ?? '',
  }
}

const emptyFormValues: SubscriptionFormValues = {
  name: '',
  nextRenewalDate: '',
  cycle: 'monthly',
  intervalDays: '',
  priceCents: '',
  currency: 'EUR',
  leadDays: '',
  trialEndsAt: '',
  trialLeadDays: '',
  cancelUrl: '',
  notes: '',
}

function parseLeadDays(value: string): number[] | undefined {
  const parts = value
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map(Number)
  return parts.length > 0 && parts.every((n) => Number.isInteger(n) && n >= 0) ? parts : undefined
}

/** Shared shape both create and update accept - the caller narrows as needed. */
export function formValuesToInput(values: SubscriptionFormValues): CreateSubscriptionInput {
  return {
    name: values.name.trim(),
    nextRenewalDate: values.nextRenewalDate,
    cycle: values.cycle,
    intervalDays: values.cycle === 'custom_days' ? Number(values.intervalDays) || null : null,
    priceCents: values.priceCents.trim() ? Math.round(Number(values.priceCents) * 100) : null,
    currency: values.currency.trim() ? values.currency.trim().toUpperCase() : null,
    leadDays: parseLeadDays(values.leadDays) ?? null,
    trialEndsAt: values.trialEndsAt.trim() || null,
    trialLeadDays: parseLeadDays(values.trialLeadDays) ?? null,
    cancelUrl: values.cancelUrl.trim() || null,
    notes: values.notes.trim() || null,
  }
}

const cycleOptions: { value: Cycle; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom_days', label: 'Custom interval' },
]

interface SubscriptionFormProps {
  initialValues?: SubscriptionFormValues
  submitLabel: string
  onSubmit: (values: SubscriptionFormValues) => Promise<void>
  onCancel: () => void
}

export function SubscriptionForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: SubscriptionFormProps) {
  const [values, setValues] = useState<SubscriptionFormValues>(initialValues ?? emptyFormValues)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof SubscriptionFormValues>(key: K, value: SubscriptionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          required
          maxLength={200}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="nextRenewalDate">Next renewal</Label>
          <Input
            id="nextRenewalDate"
            type="date"
            value={values.nextRenewalDate}
            onChange={(e) => set('nextRenewalDate', e.target.value)}
            required
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="cycle">Billing cycle</Label>
          <Select value={values.cycle} onValueChange={(v) => set('cycle', v as Cycle)}>
            <SelectTrigger id="cycle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cycleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {values.cycle === 'custom_days' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="intervalDays">Interval (days)</Label>
          <Input
            id="intervalDays"
            type="number"
            min={1}
            value={values.intervalDays}
            onChange={(e) => set('intervalDays', e.target.value)}
            required
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="priceCents">Price</Label>
          <Input
            id="priceCents"
            type="number"
            step="0.01"
            min={0}
            placeholder="9.99"
            value={values.priceCents}
            onChange={(e) => set('priceCents', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Currency</Label>
          <RadioGroup
            className="grid-flow-col justify-start gap-4 pt-1.5"
            value={values.currency}
            onValueChange={(v) => set('currency', v)}
          >
            {currencies.map((currency) => (
              <div key={currency} className="flex items-center gap-2">
                <RadioGroupItem value={currency} id={`currency-${currency}`} />
                <Label htmlFor={`currency-${currency}`} className="font-normal">
                  {currency}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="leadDays">Reminder lead days</Label>
        <Input
          id="leadDays"
          placeholder="7, 3, 1"
          value={values.leadDays}
          onChange={(e) => set('leadDays', e.target.value)}
        />
        <p className="text-sm text-muted-foreground">Comma-separated days before renewal.</p>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor="trialEndsAt">Trial ends</Label>
        <Input
          id="trialEndsAt"
          type="date"
          value={values.trialEndsAt}
          onChange={(e) => set('trialEndsAt', e.target.value)}
        />
      </div>

      {values.trialEndsAt && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="trialLeadDays">Trial reminder lead days</Label>
          <Input
            id="trialLeadDays"
            placeholder="3, 1"
            value={values.trialLeadDays}
            onChange={(e) => set('trialLeadDays', e.target.value)}
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="cancelUrl">Cancel URL</Label>
        <Input
          id="cancelUrl"
          type="url"
          placeholder="https://example.com/account/cancel"
          value={values.cancelUrl}
          onChange={(e) => set('cancelUrl', e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={3}
          maxLength={2000}
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
