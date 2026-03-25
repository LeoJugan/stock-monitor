import type { OHLCVBar, StockQuote, ChartInterval } from '@/types/stock'

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

/** 台股常用名稱對照表（代碼 → 中文名） */
export const TW_STOCK_NAMES: Record<string, string> = {
  '0050':  '元大台灣50',
  '0056':  '元大高股息',
  '006208':'富邦台50',
  '00878': '國泰永續高股息',
  '00929': '復華台灣科技優息',
  '2330':  '台積電',
  '2317':  '鴻海',
  '2454':  '聯發科',
  '2308':  '台達電',
  '2882':  '國泰金',
  '2881':  '富邦金',
  '2886':  '兆豐金',
  '2891':  '中信金',
  '2892':  '第一金',
  '2884':  '玉山金',
  '2303':  '聯電',
  '3008':  '大立光',
  '2412':  '中華電',
  '2002':  '中鋼',
  '1301':  '台塑',
  '1303':  '南亞',
  '1326':  '台化',
  '2207':  '和泰車',
  '2357':  '華碩',
  '2382':  '廣達',
  '4938':  '和碩',
  '3711':  '日月光投控',
  '2395':  '研華',
  '2379':  '瑞昱',
  '6505':  '台塑化',
  '5871':  '中租-KY',
  '2474':  '可成',
  '2408':  '南亞科',
  '3034':  '聯詠',
  '2618':  '長榮航',
  '2603':  '長榮',
  '2609':  '陽明',
  '2615':  '萬海',
  '3045':  '台灣大',
  '4904':  '遠傳',
  '2498':  '宏達電',
  '^TWII': '加權指數',
  '^TWOII':'櫃買指數',
}

/** 根據代碼取得中文名稱 */
export function getStockDisplayName(symbol: string): string {
  const code = symbol.replace(/\.TW[O]?$/, '').replace(/^\^/, '^')
  return TW_STOCK_NAMES[code] || ''
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
  regularMarketChange?: number
  regularMarketChangePercent?: number
  regularMarketVolume: number
  regularMarketDayHigh?: number
  regularMarketDayLow?: number
  regularMarketOpen?: number
  regularMarketTime: number
  previousClose?: number
  chartPreviousClose?: number
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

/**
 * 從 Yahoo Finance 取得股票歷史資料
 * Dev 環境透過 Vite proxy（/api/yahoo → query1.finance.yahoo.com）
 */
export async function fetchStockData(symbol: string, interval: ChartInterval = '1d'): Promise<{
  quote: StockQuote
  bars: OHLCVBar[]
}> {
  const range = INTERVAL_RANGE[interval]
  const url =
    `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${interval}&range=${range}&includePrePost=false&events=`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}：無法取得 ${symbol}`)
  }

  const json: YFChartResponse = await res.json()

  if (json.chart.error) {
    throw new Error(`${json.chart.error.description}（代碼：${symbol}）`)
  }

  if (!json.chart.result?.length) {
    throw new Error(`找不到股票：${symbol}`)
  }

  const result = json.chart.result[0]
  const meta = result.meta
  const timestamps = result.timestamp ?? []
  const q = result.indicators.quote[0]

  // 組成 OHLCV 棒（分鐘線保留 HH:mm，日線以上只取日期）
  const isIntraday = interval.endsWith('m')
  const bars: OHLCVBar[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i]
    if (o == null || h == null || l == null || c == null) continue
    const dt = new Date(timestamps[i] * 1000)
    // 轉換為台灣時間字串
    const twStr = dt.toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }) // YYYY-MM-DD HH:mm:ss
    const dateLabel = isIntraday ? twStr.slice(0, 16) : twStr.slice(0, 10)
    bars.push({
      date:   dateLabel,
      open:   o,
      high:   h,
      low:    l,
      close:  c,
      volume: v ?? 0,
    })
  }

  const zhName = getStockDisplayName(symbol)

  // chart API 不含 regularMarketChange，用 bars 的前一日收盤價計算
  // （避免 chartPreviousClose 在除權除息後產生錯誤的大幅漲跌）
  const price     = meta.regularMarketPrice
  const prevClose = bars.length >= 2 ? bars[bars.length - 2].close : price
  const change        = price - prevClose
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0

  const quote: StockQuote = {
    symbol,
    name: zhName || meta.shortName || meta.longName || symbol,
    price,
    change,
    changePercent,
    volume:        meta.regularMarketVolume,
    high:          meta.regularMarketDayHigh  ?? bars[bars.length - 1]?.high  ?? price,
    low:           meta.regularMarketDayLow   ?? bars[bars.length - 1]?.low   ?? price,
    open:          meta.regularMarketOpen     ?? bars[bars.length - 1]?.open  ?? price,
    timestamp:     meta.regularMarketTime,
  }

  return { quote, bars }
}
