import type { OHLCVBar, StockQuote, ChartInterval } from '@/types/stock'
import { TW_STOCK_NAMES } from '@/data/stockNames'

export { TW_STOCK_NAMES }

/** 各週期對應的 Yahoo Finance range 參數 */
const INTERVAL_RANGE: Record<ChartInterval, string> = {
  '5m':  '5d',
  '15m': '5d',
  '30m': '1mo',
  '60m': '2mo',
  '1d':  '6mo',
  '1wk': '2y',
  '1mo': '5y',
}

export const PERIOD_OPTIONS: { value: ChartInterval; label: string }[] = [
  { value: '5m',  label: '5分'  },
  { value: '15m', label: '15分' },
  { value: '30m', label: '30分' },
  { value: '60m', label: '60分' },
  { value: '1d',  label: '日'   },
  { value: '1wk', label: '週'   },
  { value: '1mo', label: '月'   },
]

/** 指數補充（不在 TWSE/TPEx 清單中） */
const EXTRA: Record<string, string> = {
  '^TWII': '加權指數', '^TWOII': '櫃買指數',
}

/** 根據代碼取得中文名稱 */
export function getStockDisplayName(symbol: string): string {
  const code = symbol.replace(/\.TW[O]?$/, '').replace(/^\^/, '^')
  return EXTRA[symbol] || TW_STOCK_NAMES[code] || ''
}

/**
 * 將使用者輸入正規化為 Yahoo Finance symbol
 * 例：2330 → 2330.TW、0050 → 0050.TW、^TWII → ^TWII
 */
export function normalizeSymbol(input: string): string {
  const t = input.trim().toUpperCase()
  if (t.startsWith('^') || t.endsWith('.TW') || t.endsWith('.TWO')) return t
  return `${t}.TW`
}

// ── Yahoo Finance v8 chart API 回應型別 ──────────────────────────────────────

interface YFMeta {
  symbol: string
  shortName?: string
  longName?: string
  currency: string
  regularMarketPrice: number
  regularMarketVolume: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketOpen?: number
  regularMarketTime: number
}

interface YFChartResult {
  meta: YFMeta
  timestamp: number[]
  indicators: {
    quote: Array<{
      open:   (number | null)[]
      high:   (number | null)[]
      low:    (number | null)[]
      close:  (number | null)[]
      volume: (number | null)[]
    }>
  }
}

interface YFChartResponse {
  chart: {
    result: YFChartResult[] | null
    error: { code: string; description: string } | null
  }
}

// ── 主要 fetch 函式 ────────────────────────────────────────────────────────────

export async function fetchStockData(symbol: string, interval: ChartInterval = '1d'): Promise<{
  quote: StockQuote
  bars: OHLCVBar[]
}> {
  const range = INTERVAL_RANGE[interval]
  const url = `/api/stock?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`

  const res = await fetch(url, { headers: { Accept: 'application/json' } })

  if (!res.ok) throw new Error(`HTTP ${res.status}：無法取得 ${symbol}`)

  const json: YFChartResponse = await res.json()

  if (json.chart.error) throw new Error(`${json.chart.error.description}（${symbol}）`)
  if (!json.chart.result?.length) throw new Error(`找不到股票：${symbol}`)

  const result = json.chart.result[0]
  const meta   = result.meta
  const timestamps = result.timestamp ?? []
  const q      = result.indicators.quote[0]
  const isIntraday = interval.endsWith('m')

  // 組成 OHLCV 棒
  const bars: OHLCVBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i]
    if (o == null || h == null || l == null || c == null) continue
    const dt    = new Date(timestamps[i] * 1000)
    const twStr = dt.toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' })
    bars.push({
      date:   isIntraday ? twStr.slice(0, 16) : twStr.slice(0, 10),
      open: o, high: h, low: l, close: c, volume: v ?? 0,
    })
  }

  // 計算 price / change / changePercent（chart API 無直接提供 change）
  const price = meta.regularMarketPrice
  let prevClose = price

  if (isIntraday && bars.length > 0) {
    const todayDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
    const prevBars  = bars.filter(b => !b.date.startsWith(todayDate))
    prevClose = prevBars.length > 0 ? prevBars[prevBars.length - 1].close : (bars[0]?.open ?? price)
  } else if (bars.length >= 2) {
    prevClose = bars[bars.length - 2].close
  }

  const change        = price - prevClose
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0

  // 今日 OHLV
  const lastBar = bars[bars.length - 1]
  let todayOpen = lastBar?.open ?? price
  let todayHigh = lastBar?.high ?? price
  let todayLow  = lastBar?.low  ?? price

  if (isIntraday && bars.length > 0) {
    const todayDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
    const todayBars = bars.filter(b => b.date.startsWith(todayDate))
    if (todayBars.length > 0) {
      todayOpen = todayBars[0].open
      todayHigh = Math.max(...todayBars.map(b => b.high))
      todayLow  = Math.min(...todayBars.map(b => b.low))
    }
  }

  const zhName = getStockDisplayName(symbol)

  return {
    quote: {
      symbol,
      name:          zhName || meta.shortName || meta.longName || symbol,
      price,
      change,
      changePercent,
      volume:        meta.regularMarketVolume,
      high:          meta.regularMarketDayHigh ?? todayHigh,
      low:           meta.regularMarketDayLow  ?? todayLow,
      open:          meta.regularMarketOpen    ?? todayOpen,
      timestamp:     meta.regularMarketTime,
    },
    bars,
  }
}
