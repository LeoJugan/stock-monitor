import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WatchlistItem, StockData, KDSignal, ChartInterval, SignalSettings } from '@/types/stock'
import { fetchStockData, normalizeSymbol } from '@/services/StockService'
import { calculateKD, detectSignal, getSignalLabel, DEFAULT_SIGNAL_SETTINGS } from '@/utils/kdCalculator'
import { isTaiwanTradingTime } from '@/utils/marketTime'

const STORAGE_KEY = 'stock-monitor-v1'

function emptyQuote(symbol: string) {
  return {
    symbol, name: symbol,
    price: 0, change: 0, changePercent: 0,
    volume: 0, high: 0, low: 0, open: 0, timestamp: 0,
  }
}

export const useStockStore = defineStore('stock', () => {
  const watchlist      = ref<WatchlistItem[]>([])
  const dataMap        = ref<Record<string, StockData>>({})
  const notifyEnabled  = ref(false)
  const signalSettings = ref<SignalSettings>({ ...DEFAULT_SIGNAL_SETTINGS })
  const lastRefresh    = ref<Date | null>(null)
  const isRefreshing   = ref(false)
  let   _timer: ReturnType<typeof setInterval> | null = null

  // ── 持久化 ──────────────────────────────────────────────────────────────────

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      watchlist: watchlist.value,
      notifyEnabled: notifyEnabled.value,
      signalSettings: signalSettings.value,
    }))
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      watchlist.value    = (parsed.watchlist ?? []).map((w: WatchlistItem) => ({
        ...w,
        interval: w.interval ?? '1d',   // 舊資料補預設值
      }))
      notifyEnabled.value  = parsed.notifyEnabled  ?? false
      signalSettings.value = { ...DEFAULT_SIGNAL_SETTINGS, ...(parsed.signalSettings ?? {}) }
    } catch {
      watchlist.value = []
    }
  }

  // ── 清單管理 ────────────────────────────────────────────────────────────────

  async function addStock(rawSymbol: string, customName?: string) {
    const symbol = normalizeSymbol(rawSymbol)
    if (watchlist.value.some(w => w.symbol === symbol)) {
      throw new Error(`${symbol} 已在清單中`)
    }
    watchlist.value.push({
      symbol,
      customName: customName || undefined,
      notifyOnSignal: true,
      addedAt: Date.now(),
      interval: '1d',
    })
    save()
    await refreshOne(symbol)
  }

  function removeStock(symbol: string) {
    watchlist.value = watchlist.value.filter(w => w.symbol !== symbol)
    delete dataMap.value[symbol]
    save()
  }

  function toggleNotify(symbol: string) {
    const item = watchlist.value.find(w => w.symbol === symbol)
    if (item) { item.notifyOnSignal = !item.notifyOnSignal; save() }
  }

  function updateCustomName(symbol: string, name: string) {
    const item = watchlist.value.find(w => w.symbol === symbol)
    if (item) { item.customName = name || undefined; save() }
  }

  // ── 訊號設定 ─────────────────────────────────────────────────────────────────

  function updateSignalSettings(patch: Partial<SignalSettings>) {
    signalSettings.value = { ...signalSettings.value, ...patch }
    save()
    // 若更新頻率有變，重啟 timer
    if ('refreshTradingMs' in patch || 'refreshClosedMs' in patch) {
      startAutoRefresh()
    }
    refreshAll()
  }

  // ── 週期切換 ─────────────────────────────────────────────────────────────────

  async function changeInterval(symbol: string, interval: ChartInterval) {
    const item = watchlist.value.find(w => w.symbol === symbol)
    if (!item) return
    item.interval = interval
    save()
    await refreshOne(symbol)
  }

  // ── 資料更新 ────────────────────────────────────────────────────────────────

  async function refreshOne(symbol: string) {
    const prev = dataMap.value[symbol]
    const item = watchlist.value.find(w => w.symbol === symbol)
    const interval = item?.interval ?? '1d'

    // 設置 loading 狀態
    dataMap.value[symbol] = {
      symbol,
      quote:       prev?.quote    ?? emptyQuote(symbol),
      bars:        prev?.bars     ?? [],
      kd:          prev?.kd       ?? [],
      signal:      prev?.signal   ?? 'normal',
      prevSignal:  prev?.prevSignal ?? 'normal',
      lastUpdated: prev?.lastUpdated ?? new Date(),
      loading:     true,
      error:       undefined,
    }

    try {
      const { quote, bars } = await fetchStockData(symbol, interval)
      const kd        = calculateKD(bars)
      const newSignal  = detectSignal(kd, signalSettings.value)
      const prevSignal = (prev?.signal ?? 'normal') as KDSignal

      dataMap.value[symbol] = {
        symbol, quote, bars, kd,
        signal:      newSignal,
        prevSignal,
        lastUpdated: new Date(),
        loading:     false,
      }

      // 發送通知
      const w = watchlist.value.find(x => x.symbol === symbol)
      if (notifyEnabled.value && w?.notifyOnSignal && newSignal !== prevSignal) {
        const isWarn = newSignal === 'golden_cross_warn' || newSignal === 'death_cross_warn'
        const shouldNotify = isWarn
          ? signalSettings.value.notifyOnWarn
          : newSignal !== 'normal'
        if (shouldNotify) _notify(symbol, quote.name, newSignal)
      }
    } catch (err) {
      dataMap.value[symbol] = {
        ...(dataMap.value[symbol]!),
        loading: false,
        error:   err instanceof Error ? err.message : '未知錯誤',
      }
    }
  }

  async function refreshAll() {
    if (isRefreshing.value || watchlist.value.length === 0) return
    isRefreshing.value = true
    try {
      await Promise.allSettled(watchlist.value.map(w => refreshOne(w.symbol)))
      lastRefresh.value = new Date()
    } finally {
      isRefreshing.value = false
    }
  }

  // ── 通知 ────────────────────────────────────────────────────────────────────

  function _notify(symbol: string, name: string, signal: KDSignal) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const body = `${name}（${symbol.replace(/\.TW[O]?$/, '')}）${getSignalLabel(signal)}`
    new Notification('📈 台股盯盤系統', { body, icon: '/favicon.ico' })
  }

  async function requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      alert('此瀏覽器不支援通知功能')
      return false
    }
    const perm = await Notification.requestPermission()
    notifyEnabled.value = perm === 'granted'
    save()
    return notifyEnabled.value
  }

  function toggleGlobalNotify() {
    if (!notifyEnabled.value) {
      requestNotificationPermission()
    } else {
      notifyEnabled.value = false
      save()
    }
  }

  // ── 自動更新 ────────────────────────────────────────────────────────────────

  function startAutoRefresh() {
    if (_timer) clearInterval(_timer)
    const ms = isTaiwanTradingTime()
      ? signalSettings.value.refreshTradingMs
      : signalSettings.value.refreshClosedMs
    _timer = setInterval(() => refreshAll(), ms)
  }

  function stopAutoRefresh() {
    if (_timer) { clearInterval(_timer); _timer = null }
  }

  // ── 初始化 ──────────────────────────────────────────────────────────────────

  async function initialize() {
    load()
    if (watchlist.value.length > 0) await refreshAll()
    startAutoRefresh()
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  const listWithData = computed(() =>
    watchlist.value.map(item => ({
      item,
      data: dataMap.value[item.symbol],
    }))
  )

  return {
    watchlist,
    dataMap,
    notifyEnabled,
    signalSettings,
    updateSignalSettings,
    lastRefresh,
    isRefreshing,
    listWithData,
    addStock,
    removeStock,
    toggleNotify,
    updateCustomName,
    changeInterval,
    refreshOne,
    refreshAll,
    toggleGlobalNotify,
    stopAutoRefresh,
    initialize,
  }
})
