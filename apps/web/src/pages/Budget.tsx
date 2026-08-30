import { useState } from 'react'
import { useResource } from '../api/resourceCache.js'
import { exchangeRatesCache, subscriptionsCache } from '../api/resources.js'
import { FormSkeleton } from '../components/skeletons.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js'
import {
  type BudgetSummaryMultiCurrency,
  computeBudgetSummaryMultiCurrency,
  getFormatterForCurrency,
} from '../lib/budget.js'
import type { CurrencyCode } from '../lib/currency.js'
import { formatFriendlyDate } from '../lib/date.js'
import { cn } from '../lib/utils.js'

const CURRENCIES: CurrencyCode[] = ['EUR', 'USD', 'UAH']

function BudgetDisplay({
  summary,
  currency,
}: {
  summary: BudgetSummaryMultiCurrency
  currency: CurrencyCode
}) {
  const formatter = getFormatterForCurrency(currency)

  const getValue = (key: keyof BudgetSummaryMultiCurrency): number => {
    if (key === 'periodStart') return 0

    // Map EUR values to the selected currency
    if (currency === 'EUR') {
      if (key === 'last30DaysEur') return summary.last30DaysEur
      if (key === 'upcomingMonthEur') return summary.upcomingMonthEur
      if (key === 'totalSinceStartEur') return summary.totalSinceStartEur
    } else if (currency === 'USD') {
      if (key === 'last30DaysEur') return summary.last30DaysUsd
      if (key === 'upcomingMonthEur') return summary.upcomingMonthUsd
      if (key === 'totalSinceStartEur') return summary.totalSinceStartUsd
    } else if (currency === 'UAH') {
      if (key === 'last30DaysEur') return summary.last30DaysUah
      if (key === 'upcomingMonthEur') return summary.upcomingMonthUah
      if (key === 'totalSinceStartEur') return summary.totalSinceStartUah
    }

    return 0
  }

  return (
    <dl className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <dt className="text-base text-muted-foreground">Last 30 days</dt>
        <dd className="font-medium">{formatter.format(getValue('last30DaysEur'))}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-base text-muted-foreground">Due in the next 30 days</dt>
        <dd className="font-medium">{formatter.format(getValue('upcomingMonthEur'))}</dd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <dt className="text-base text-muted-foreground">
          Total spent since {summary.periodStart ? formatFriendlyDate(summary.periodStart) : '—'}
        </dt>
        <dd className="font-medium">{formatter.format(getValue('totalSinceStartEur'))}</dd>
      </div>
    </dl>
  )
}

export function Budget() {
  const {
    data: subscriptions,
    loading: subsLoading,
    error: subsError,
  } = useResource(subscriptionsCache)
  const { data: rates, loading: ratesLoading, error: ratesError } = useResource(exchangeRatesCache)
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyCode>('EUR')

  const loading = subsLoading || ratesLoading
  const error = ratesError ?? subsError
  const summary =
    subscriptions && rates ? computeBudgetSummaryMultiCurrency(subscriptions, rates) : null
  const refreshing = loading && summary !== null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Budget</h1>
        <p className="text-base text-muted-foreground">Estimated using live exchange rates.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Budget Overview</CardTitle>
              <CardDescription>View your spending across subscriptions.</CardDescription>
            </div>
            <div className="flex flex-col gap-2">
              <label
                htmlFor="currency-select"
                className="text-sm font-medium text-muted-foreground"
              >
                Currency
              </label>
              <Select
                value={selectedCurrency}
                onValueChange={(value) => setSelectedCurrency(value as CurrencyCode)}
              >
                <SelectTrigger id="currency-select" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && summary === null && <FormSkeleton fields={3} />}
          {error && <p className="text-base text-destructive">{error}</p>}
          {!loading && !error && subscriptions?.length === 0 && (
            <p className="text-base text-muted-foreground">
              Add a subscription to see your budget.
            </p>
          )}
          {summary && subscriptions && subscriptions.length > 0 && (
            <div
              className={cn(
                refreshing && 'skeleton-shimmer pointer-events-none rounded-md opacity-60',
              )}
              aria-busy={refreshing || undefined}
            >
              <BudgetDisplay summary={summary} currency={selectedCurrency} />
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button variant="outline" asChild>
          <a href="/">Back to Subscriptions</a>
        </Button>
      </div>
    </div>
  )
}
