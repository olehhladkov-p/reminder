export interface ExchangeRates {
  base: 'EUR'
  /** EUR -> currency multipliers, e.g. rates.USD = 1.16 means 1 EUR = 1.16 USD. */
  rates: Record<string, number>
  fetchedAt: number
}

export type CurrencyCode = 'EUR' | 'USD' | 'UAH'

// Free, no-key exchange rate API (https://www.exchangerate-api.com/docs/free),
// updated once every 24h - cached client-side on the same cadence below.
const RATES_URL = 'https://open.er-api.com/v6/latest/EUR'
const CACHE_KEY = 'reminder:eur-exchange-rates'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

function readCache(): ExchangeRates | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ExchangeRates
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(rates: ExchangeRates): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rates))
  } catch {
    // best-effort only - ignore quota/private-mode errors
  }
}

export async function fetchEurExchangeRates(): Promise<ExchangeRates> {
  const cached = readCache()
  if (cached) return cached

  const res = await fetch(RATES_URL)
  if (!res.ok) throw new Error(`exchange rate request failed (${res.status})`)
  const body = (await res.json()) as { result?: string; rates?: Record<string, number> }
  if (body.result !== 'success' || !body.rates) throw new Error('exchange rate request failed')

  const rates: ExchangeRates = { base: 'EUR', rates: body.rates, fetchedAt: Date.now() }
  writeCache(rates)
  return rates
}

/** Converts an amount in `currency` to EUR. Falls back to the raw amount if the currency is unknown. */
export function toEur(amount: number, currency: string | null, rates: ExchangeRates): number {
  if (!currency || currency === 'EUR') return amount
  const rate = rates.rates[currency]
  return rate ? amount / rate : amount
}

/** Converts an amount from EUR to the target currency. */
export function fromEur(
  amountEur: number,
  targetCurrency: CurrencyCode,
  rates: ExchangeRates,
): number {
  if (targetCurrency === 'EUR') return amountEur
  const rate = rates.rates[targetCurrency]
  return rate ? amountEur * rate : amountEur
}

/** Creates a currency formatter for the given currency code. */
export function createCurrencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  return new Intl.NumberFormat('en', { style: 'currency', currency })
}
