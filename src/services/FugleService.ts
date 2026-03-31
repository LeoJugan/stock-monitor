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
import { calculateKD } from '@/utils/kdCalculator'

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

// ── 1 分鐘棒聚合 ──────────────────────────────────────────────────────────────

/** 將 1 分鐘 K 棒聚合成 N 分鐘 K 棒（5/15/30/60） */
function aggregate1mTo(bars: OHLCVBar[], minutes: number): OHLCVBar[] {
  if (minutes <= 1 || bars.length === 0) return bars
  const buckets = new Map<string, OHLCVBar[]>()

  for (const bar of bars) {
    const [datePart, timePart] = bar.date.split(' ')
    const [hh, mm] = timePart.split(':').map(Number)
    const totalMin  = hh * 60 + mm
    const bucketMin = Math.floor(totalMin / minutes) * minutes
    const bHH = String(Math.floor(bucketMin / 60)).padStart(2, '0')
    const bMM = String(bucketMin % 60).padStart(2, '0')
    const key = `${datePart} ${bHH}:${bMM}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(bar)
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({
      date,
      open:   group[0].open,
      high:   Math.max(...group.map(b => b.high)),
      low:    Math.min(...group.map(b => b.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, b) => s + b.volume, 0),
    }))
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

  // ── 1 & 2. KDJ + 歷史 K 線 ──────────────────────────────────────────────────
  // 分鐘線：Fugle /technical/kdj 不支援日期參數，永遠回傳最近完整交易日（非今天）
  // → 改用 /historical/candles 取 K 棒，自行計算 KDJ（與 Yahoo Finance 路徑相同）
  // 日線/週線/月線：仍使用 /technical/kdj（支援日期，且含 J 值）
  const dateParams = `&from=${from}&to=${to}`

  let bars: OHLCVBar[]
  let kd: KDValue[]

  if (isIntraday) {
    const todayTW = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
    const tfNum   = parseInt(timeframe)  // '5' → 5

    // 1. 歷史 K 棒（已完結的交易日，提供 KD 計算的歷史基礎）
    // 2. 今日即時 K 棒（/intraday/candles 返回 1 分鐘棒，需聚合）
    const [histRes, intradayRes] = await Promise.all([
      fetch(`/fugle/historical/candles/${fugleId}?timeframe=${timeframe}${dateParams}&sort=asc`,
        { headers: { Accept: 'application/json' } }),
      fetch(`/fugle/intraday/candles/${fugleId}`,
        { headers: { Accept: 'application/json' } }),
    ])

    if (!histRes.ok) {
      if (histRes.status === 401 || histRes.status === 403)
        throw new Error('Fugle API Key 無效，請確認 .env.local 的 FUGLE_API_KEY')
      throw new Error(`HTTP ${histRes.status}：無法取得 ${symbol} 的 K 線`)
    }

    const histJson: FugleCandlesResponse = await histRes.json()
    const histBars: OHLCVBar[] = (histJson.data ?? [])
      .filter(c => !c.date.startsWith(todayTW))  // 排除今日，避免與即時重複
      .map(c => ({
        date:   c.date.replace('T', ' ').slice(0, 16),
        open:   c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0,
      }))

    // 今日即時：1 分鐘棒聚合到目標 timeframe
    let todayBars: OHLCVBar[] = []
    if (intradayRes.ok) {
      const intradayJson = await intradayRes.json()
      const raw1m: OHLCVBar[] = (intradayJson.data ?? []).map((c: FugleCandle) => ({
        date:   c.date.replace('T', ' ').slice(0, 16),
        open:   c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0,
      }))
      todayBars = aggregate1mTo(raw1m, tfNum)
    } else if (intradayRes.status === 429) {
      throw new Error('Fugle API 請求過於頻繁（429），請稍後再試')
    }

    // 合併：歷史 + 今日，計算 KDJ
    bars = [...histBars, ...todayBars]
    if (bars.length === 0) throw new Error(`找不到股票：${symbol}`)
    kd = calculateKD(bars)
  } else {
    // 日線/週線/月線：並行抓 KDJ + candles
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
    const kdjJson: FugleKDJResponse     = await kdjRes.json()
    const candlesJson: FugleCandlesResponse = candlesRes.ok ? await candlesRes.json() : { symbol, data: [] }

    // 建 date → close 對照表
    const closeMap = new Map<string, number>()
    for (const c of candlesJson.data ?? [])
      closeMap.set(c.date.slice(0, 10), c.close)

    bars = (candlesJson.data ?? []).map(c => ({
      date: c.date.slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0,
    }))

    kd = (kdjJson.data ?? []).map(item => {
      const dateKey = item.date.slice(0, 10)
      return { date: dateKey, rsv: 0, k: item.k, d: item.d, j: item.j, close: closeMap.get(dateKey) ?? 0 }
    })
    if (kd.length === 0) throw new Error(`找不到股票：${symbol}`)
  }

  // ── 3. 即時報價 ──────────────────────────────────────────────────────────────
  let fugleQuote: FugleQuote | null = null
  try {
    const qr = await fetch(`/fugle/intraday/quote/${fugleId}`, { headers: { Accept: 'application/json' } })
    if (qr.ok) {
      fugleQuote = await qr.json()
    } else if (qr.status === 429) {
      throw new Error('Fugle API 請求過於頻繁（429），請稍後再試')
    }
    // 其他非 2xx（例如非交易時段 404）：靜默忽略，使用 K 棒收盤作備用
  } catch (e) {
    if (e instanceof Error && e.message.includes('429')) throw e
  }

  // ── 4. 組合 quote ────────────────────────────────────────────────────────────
  const lastBar  = bars[bars.length - 1]
  const todayTWd = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
  const prevDay  = new Date(todayTWd + 'T00:00:00+08:00')
  prevDay.setDate(prevDay.getDate() - 1)
  const prevDayStr = prevDay.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })

  // lastPrice = 0 時仍未成交，視為無效；只取 > 0 的值
  const livePrice  = fugleQuote?.lastPrice  && fugleQuote.lastPrice  > 0 ? fugleQuote.lastPrice  : null
  // closePrice = 上一交易日收盤，可作備用
  const closePxFb  = fugleQuote?.closePrice && fugleQuote.closePrice > 0 ? fugleQuote.closePrice : null
  // lastBar.close 只在今日或前一日的棒才可信（防止歷史舊資料污染當前報價）
  const barRecent  = lastBar?.date?.startsWith(todayTWd) || lastBar?.date?.startsWith(prevDayStr)
  const barCloseFb = barRecent ? (lastBar?.close ?? null) : null

  const price = livePrice ?? barCloseFb ?? closePxFb ?? lastBar?.close ?? 0

  let prevClose = price
  if (isIntraday && bars.length > 0) {
    const prevBars = bars.filter(b => !b.date.startsWith(todayTWd))
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
    const todayBarsF = bars.filter(b => b.date.startsWith(todayTWd))
    if (todayBarsF.length > 0) {
      todayOpen = todayBarsF[0].open
      todayHigh = Math.max(...todayBarsF.map(b => b.high))
      todayLow  = Math.min(...todayBarsF.map(b => b.low))
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
