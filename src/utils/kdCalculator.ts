import type { OHLCVBar, KDValue, KDSignal, SignalSettings } from '@/types/stock'

export const DEFAULT_SIGNAL_SETTINGS: SignalSettings = {
  goldenCrossMaxK:  null,
  deathCrossMinK:   null,
  minKDDiff:        0,
  crossWarnGap:     0,
  notifyOnWarn:     false,
  refreshTradingMs: 60_000,   // 預設 1 分鐘
  refreshClosedMs:  1_800_000, // 預設 30 分鐘
}

const KD_PERIOD = 9

/**
 * 計算 KD 指標（台灣標準：9日RSV，2/3平滑）
 * 初始 K = D = 50
 */
export function calculateKD(bars: OHLCVBar[]): KDValue[] {
  if (bars.length === 0) return []

  const result: KDValue[] = []
  let k = 50
  let d = 50

  for (let i = 0; i < bars.length; i++) {
    if (i < KD_PERIOD - 1) {
      result.push({ date: bars[i].date, rsv: 50, k: 50, d: 50 })
      continue
    }

    const slice = bars.slice(i - KD_PERIOD + 1, i + 1)
    const highestHigh = Math.max(...slice.map(b => b.high))
    const lowestLow = Math.min(...slice.map(b => b.low))

    let rsv: number
    if (highestHigh === lowestLow) {
      rsv = 50
    } else {
      rsv = ((bars[i].close - lowestLow) / (highestHigh - lowestLow)) * 100
      rsv = Math.max(0, Math.min(100, rsv))
    }

    k = (2 / 3) * k + (1 / 3) * rsv
    d = (2 / 3) * d + (1 / 3) * k

    result.push({
      date: bars[i].date,
      rsv: Math.round(rsv * 100) / 100,
      k: Math.round(k * 100) / 100,
      d: Math.round(d * 100) / 100,
    })
  }

  return result
}

/**
 * 偵測 KD 訊號
 * 比較最後兩筆資料，依設定條件判斷是否有交叉或進入超買/超賣
 */
export function detectSignal(kd: KDValue[], settings: SignalSettings = DEFAULT_SIGNAL_SETTINGS): KDSignal {
  if (kd.length < 2) return 'normal'

  const cur  = kd[kd.length - 1]
  const prev = kd[kd.length - 2]

  // 黃金交叉：K 由下往上穿越 D
  if (prev.k <= prev.d && cur.k > cur.d) {
    const posOk      = settings.goldenCrossMaxK === null || cur.k < settings.goldenCrossMaxK
    const strengthOk = (cur.k - cur.d) >= settings.minKDDiff
    if (posOk && strengthOk) return 'golden_cross'
  }

  // 死亡交叉：K 由上往下穿越 D
  if (prev.k >= prev.d && cur.k < cur.d) {
    const posOk      = settings.deathCrossMinK === null || cur.k > settings.deathCrossMinK
    const strengthOk = (cur.d - cur.k) >= settings.minKDDiff
    if (posOk && strengthOk) return 'death_cross'
  }

  // 交叉預警（需至少 3 筆資料）
  if (settings.crossWarnGap > 0 && kd.length >= 3) {
    const prev2 = kd[kd.length - 3]
    const gap      = cur.k  - cur.d       // 目前差距
    const prevGap  = prev.k - prev.d      // 前一根差距
    const prev2Gap = prev2.k - prev2.d    // 前兩根差距

    // 黃金交叉預警：K 在 D 下方，且差距連續 3 根收斂，且差距 ≤ 門檻
    if (gap < 0 && gap > prevGap && prevGap > prev2Gap && Math.abs(gap) <= settings.crossWarnGap) {
      return 'golden_cross_warn'
    }
    // 死亡交叉預警：K 在 D 上方，且差距連續 3 根收斂，且差距 ≤ 門檻
    if (gap > 0 && gap < prevGap && prevGap < prev2Gap && Math.abs(gap) <= settings.crossWarnGap) {
      return 'death_cross_warn'
    }
  }

  // 超賣
  if (cur.k < 20) return 'oversold'

  // 超買
  if (cur.k > 80) return 'overbought'

  return 'normal'
}

export function getSignalLabel(signal: KDSignal): string {
  const map: Record<KDSignal, string> = {
    golden_cross:      '黃金交叉 ↑',
    death_cross:       '死亡交叉 ↓',
    golden_cross_warn: '⚡ 即將黃金',
    death_cross_warn:  '⚡ 即將死亡',
    oversold:          '超賣區域',
    overbought:        '超買區域',
    normal:            '正常',
  }
  return map[signal]
}

export function getSignalClasses(signal: KDSignal): string {
  const map: Record<KDSignal, string> = {
    golden_cross:      'text-red-400 bg-red-400/10 border-red-400/30',
    death_cross:       'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    golden_cross_warn: 'text-rose-300 bg-rose-400/10 border-rose-400/30 animate-pulse',
    death_cross_warn:  'text-teal-300 bg-teal-400/10 border-teal-400/30 animate-pulse',
    oversold:          'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    overbought:        'text-orange-400 bg-orange-400/10 border-orange-400/30',
    normal:            'text-slate-500 bg-slate-500/10 border-slate-500/30',
  }
  return map[signal]
}
