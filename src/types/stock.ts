export type ChartInterval = '5m' | '15m' | '30m' | '60m' | '1d' | '1wk' | '1mo'

export interface OHLCVBar {
  date: string   // YYYY-MM-DD 或 YYYY-MM-DD HH:mm（分鐘線）
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface KDValue {
  date: string
  rsv: number
  k: number
  d: number
}

/** KD 訊號類型 */
export type KDSignal =
  | 'golden_cross'      // K 向上穿越 D（黃金交叉）
  | 'death_cross'       // K 向下穿越 D（死亡交叉）
  | 'golden_cross_warn' // K 即將由下穿越 D（黃金交叉預警）
  | 'death_cross_warn'  // K 即將由上穿越 D（死亡交叉預警）
  | 'oversold'          // K < 20（超賣）
  | 'overbought'        // K > 80（超買）
  | 'normal'            // 正常

export interface StockQuote {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  high: number
  low: number
  open: number
  timestamp: number
}

export interface StockData {
  symbol: string
  quote: StockQuote
  bars: OHLCVBar[]
  kd: KDValue[]
  signal: KDSignal
  prevSignal: KDSignal
  lastUpdated: Date
  loading: boolean
  error?: string
}

/** KD 訊號觸發條件設定 */
export interface SignalSettings {
  /** 位置條件：黃金交叉需在低檔，K 必須低於此值（null = 不限） */
  goldenCrossMaxK: number | null
  /** 位置條件：死亡交叉需在高檔，K 必須高於此值（null = 不限） */
  deathCrossMinK: number | null
  /** 強度條件：交叉後 |K - D| 最小差距（0 = 不限） */
  minKDDiff: number
  /** 預警門檻：K-D 差距小於此值且連續收斂時發出接近交叉預警（0 = 關閉） */
  crossWarnGap: number
  /** 預警是否同時發送瀏覽器推播通知 */
  notifyOnWarn: boolean
  /** 交易時段更新頻率（毫秒） */
  refreshTradingMs: number
  /** 收盤後更新頻率（毫秒） */
  refreshClosedMs: number
}

export interface WatchlistItem {
  symbol: string
  customName?: string
  notifyOnSignal: boolean
  addedAt: number
  interval: ChartInterval   // KD 週期，預設 '1d'
}
