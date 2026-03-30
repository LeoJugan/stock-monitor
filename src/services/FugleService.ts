/**
 * Fugle Market Data API v1.0
 * 申請：https://developer.fugle.tw → 行情 API → 新增 API Key
 * 設定：在 .env.local 加入 FUGLE_API_KEY=<base64 key>
 *
 * 切換至此服務：將 stockStore.ts 第 4 行改為
 *   import { fetchStockData, normalizeSymbol } from '@/services/FugleService'
 */

import type { OHLCVBar, StockQuote, KDValue, ChartInterval } from '@/types/stock'
import { TW_STOCK_NAMES } from '@/data/stockNames'

export { TW_STOCK_NAMES }

// ── 公用 helpers（與 StockService 介面相同）──────────────────────────────────

const EXTRA: Record<string, string> = {
  '^TWII': '加權指數', '^TWOII': '櫃買指數',
}

export function getStockDisplayName(symbol: string): string {
  const code = symbol.replace(/\.TW[O]?$/, '').replace(/^\^/, '^')
  return EXTRA[symbol] || TW_STOCK_NAMES[code] || ''
}

/** 內部 symbol → Fugle symbolId（不含 .TW/.TWO） */
function toFugleSymbol(symbol: string): string {
  if (symbol === '^TWII' || symbol === '^TWOII') return 'IR0001'
  return symbol.replace(/\.TW[O]?$/, '')
}

/** 保持與 StockService 一致，讓 store 不需修改 */
export function normalizeSymbol(input: string): string {
  const t = input.trim().toUpperCase()
  if (t.startsWith('^') || t.endsWith('.TW') || t.endsWith('.TWO')) return t
  return `${t}.TW`
}

// ── 週期對應 ──────────────────────────────────────────────────────────────────

/** 各週期對應的 Fugle timeframe */
const FUGLE_TIMEFRAME: Record<ChartInterval, string> = {
  '5m':  '5',
  '15m': '15',
  '30m': '30',
  '60m': '60',
  '1d':  'D',
  '1wk': 'W',
  '1mo': 'M',
}

/** KDJ / 歷史 K 線的抓取天數 */
const INTERVAL_DAYS: Record<ChartInterval, number> = {
  '5m':  30, '15m': 30, '30m': 30, '60m': 30,
  '1d':  180, '1wk': 730, '1mo': 1825,
}

function getDateRange(interval: ChartInterval): { from: string; to: string } {
  // 台灣時區（UTC+8）：交易時間 09:00-13:30 對應 UTC 01:00-05:30，
  // 若用 toISOString() 在交易時間內 `to` 會是「昨天」，造成抓不到今天的資料
  const to = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
  const fromDate = new Date(to + 'T00:00:00')
  fromDate.setDate(fromDate.getDate() - INTERVAL_DAYS[interval])
  return { from: fromDate.toISOString().slice(0, 10), to }
}

// ── Fugle 回應型別 ────────────────────────────────────────────────────────────

interface FugleKDJItem {
  date: string  // 日線："2026-03-27"，分鐘："2026-03-02T09:40:00.000+08:00"
  k: number
  d: number
  j: number
}

interface FugleKDJResponse {
  symbol: string
  data: FugleKDJItem[]
}

interface FugleCandle {
  date: string
  open: number; high: number; low: number; close: number; volume: number
}

interface FugleCandlesResponse {
  symbol: string
  data: FugleCandle[]
}

interface FugleQuote {
  name?:          string
  lastPrice?:     number
  closePrice?:    number
  openPrice?:     number
  highPrice?:     number
  lowPrice?:      number
  change?:        number
  changePercent?: number
  isClose?:       boolean
  lastUpdated?:   number  // microseconds
  total?: { tradeVolume?: number }
}

// ── 主要 fetch 函式 ────────────────────────────────────────────────────────────

export async function fetchStockData(symbol: string, interval: ChartInterval = '1d'): Promise<{
  quote: StockQuote
  bars:  OHLCVBar[]
  kd:    KDValue[]
}> {
  const fugleId    = toFugleSymbol(symbol)
  const timeframe  = FUGLE_TIMEFRAME[interval]
  const isIntraday = interval.endsWith('m')
  const { from, to } = getDateRange(interval)

  // 日期參數：日線/分鐘線都必須明確帶 to（台灣時區），否則 Fugle 不返回今天資料
  const dateParams = `&from=${from}&to=${to}`

  // ── 1 & 2. KDJ + 歷史 K 線（並行 fetch）──────────────────────────────────────
  const [kdjRes, candlesRes] = await Promise.all([
    fetch(
      `/fugle/technical/kdj/${fugleId}?timeframe=${timeframe}${dateParams}&rPeriod=9&kPeriod=3&dPeriod=3`,
      { headers: { Accept: 'application/json' } },
    ),
    fetch(
      `/fugle/historical/candles/${fugleId}?timeframe=${timeframe}${dateParams}&sort=asc`,
      { headers: { Accept: 'application/json' } },
    ),
  ])

  if (!kdjRes.ok) {
    if (kdjRes.status === 401 || kdjRes.status === 403)
      throw new Error('Fugle API Key 無效，請確認 .env.local 的 FUGLE_API_KEY')
    throw new Error(`HTTP ${kdjRes.status}：無法取得 ${symbol} 的 KDJ`)
  }
  const kdjJson: FugleKDJResponse = await kdjRes.json()
  const candlesJson: FugleCandlesResponse = candlesRes.ok ? await candlesRes.json() : { symbol, data: [] }

  // 建 candles date → close 對照表
  const closeMap = new Map<string, number>()
  for (const c of candlesJson.data ?? []) {
    const dateKey = isIntraday ? c.date.replace('T', ' ').slice(0, 16) : c.date.slice(0, 10)
    closeMap.set(dateKey, c.close)
  }

  // KDJ → KDValue[]（日期格式對齊：分鐘線轉 "YYYY-MM-DD HH:mm"，日線保留 "YYYY-MM-DD"）
  const kd: KDValue[] = (kdjJson.data ?? []).map(item => {
    const dateKey = isIntraday ? item.date.replace('T', ' ').slice(0, 16) : item.date.slice(0, 10)
    return {
      date:  dateKey,
      rsv:   0,  // Fugle 不提供 RSV，填 0 佔位
      k:     item.k,
      d:     item.d,
      j:     item.j,
      close: closeMap.get(dateKey) ?? 0,
    }
  })

  if (kd.length === 0) throw new Error(`找不到股票：${symbol}`)

  const bars: OHLCVBar[] = (candlesJson.data ?? []).map(c => ({
    date:   isIntraday ? c.date.replace('T', ' ').slice(0, 16) : c.date.slice(0, 10),
    open:   c.open,
    high:   c.high,
    low:    c.low,
    close:  c.close,
    volume: c.volume ?? 0,
  }))

  // ── 3. 即時報價 ──────────────────────────────────────────────────────────────
  let fugleQuote: FugleQuote | null = null
  try {
    const qr = await fetch(`/fugle/intraday/quote/${fugleId}`, { headers: { Accept: 'application/json' } })
    if (qr.ok) fugleQuote = await qr.json()
  } catch { /* 非交易時段靜默忽略 */ }

  // ── 4. 組合 quote ────────────────────────────────────────────────────────────
  const lastBar = bars[bars.length - 1]
  const price   = fugleQuote?.lastPrice ?? fugleQuote?.closePrice ?? lastBar?.close ?? 0

  let prevClose = price
  if (isIntraday && bars.length > 0) {
    const todayDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
    const prevBars  = bars.filter(b => !b.date.startsWith(todayDate))
    prevClose = prevBars.length > 0 ? prevBars[prevBars.length - 1].close : (bars[0]?.open ?? price)
  } else if (bars.length >= 2) {
    prevClose = bars[bars.length - 2].close
  }

  const change        = fugleQuote?.change        ?? (price - prevClose)
  const changePercent = fugleQuote?.changePercent ?? (prevClose !== 0 ? (change / prevClose) * 100 : 0)

  let todayOpen = fugleQuote?.openPrice ?? lastBar?.open  ?? price
  let todayHigh = fugleQuote?.highPrice ?? lastBar?.high  ?? price
  let todayLow  = fugleQuote?.lowPrice  ?? lastBar?.low   ?? price

  if (isIntraday && bars.length > 0) {
    const todayDate = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
    const todayBars = bars.filter(b => b.date.startsWith(todayDate))
    if (todayBars.length > 0) {
      todayOpen = todayBars[0].open
      todayHigh = Math.max(...todayBars.map(b => b.high))
      todayLow  = Math.min(...todayBars.map(b => b.low))
    }
  }

  return {
    quote: {
      symbol,
      name:          getStockDisplayName(symbol) || fugleQuote?.name || symbol,
      price,
      change,
      changePercent,
      volume:        fugleQuote?.total?.tradeVolume ?? lastBar?.volume ?? 0,
      high:          todayHigh,
      low:           todayLow,
      open:          todayOpen,
      timestamp:     fugleQuote?.lastUpdated
        ? Math.floor(fugleQuote.lastUpdated / 1e6)
        : Math.floor(Date.now() / 1000),
    },
    bars,
    kd,
  }
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
