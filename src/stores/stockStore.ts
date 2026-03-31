import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { WatchlistItem, StockData, KDSignal, ChartInterval, SignalSettings, PocketItem } from '@/types/stock'
import { fetchStockData, normalizeSymbol } from '@/services/dataService'
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
  const pocketList     = ref<PocketItem[]>([])
  const dataMap        = ref<Record<string, StockData>>({})
  const notifyEnabled  = ref(false)
  const signalSettings = ref<SignalSettings>({ ...DEFAULT_SIGNAL_SETTINGS })
  const lastRefresh    = ref<Date | null>(null)
  const isRefreshing   = ref(false)
  let   _timer: ReturnType<typeof setTimeout> | null = null

  // ── 持久化 ──────────────────────────────────────────────────────────────────

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      watchlist: watchlist.value,
      pocketList: pocketList.value,
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
        interval: w.interval ?? '5m',
      }))
      pocketList.value     = parsed.pocketList ?? []
      notifyEnabled.value  = parsed.notifyEnabled  ?? false
      signalSettings.value = { ...DEFAULT_SIGNAL_SETTINGS, ...(parsed.signalSettings ?? {}) }
    } catch {
      watchlist.value = []
    }
  }

  // ── 清單管理 ────────────────────────────────────────────────────────────────

  // 動態上限：60 req/min ÷ (每分鐘刷新次數) ÷ 3 calls/stock
  // = refreshTradingMs / 3000，最少 5 支
  const maxWatchlist = computed(() =>
    Math.max(5, Math.floor(signalSettings.value.refreshTradingMs / 3000))
  )

  async function addStock(rawSymbol: string, customName?: string) {
    const symbol = normalizeSymbol(rawSymbol)
    if (watchlist.value.some(w => w.symbol === symbol)) {
      throw new Error(`${symbol} 已在清單中`)
    }
    if (watchlist.value.length >= maxWatchlist.value) {
      throw new Error(`目前刷新間隔（${signalSettings.value.refreshTradingMs / 1000}s）下，上限為 ${maxWatchlist.value} 支`)
    }

    // 先驗證資料可以抓到，找不到就不加入
    const DEFAULT_INTERVAL = '5m' as const
    const { quote, bars, kd: apiKD } = await fetchStockData(symbol, DEFAULT_INTERVAL)
    if (!quote || bars.length === 0) throw new Error(`找不到股票：${symbol}`)

    // 驗證通過才加入清單
    watchlist.value.push({
      symbol,
      customName: customName || undefined,
      notifyOnSignal: true,
      addedAt: Date.now(),
      interval: DEFAULT_INTERVAL,
    })
    save()

    // 直接用剛抓到的資料，不用再發一次請求
    const kd        = apiKD ?? calculateKD(bars)
    const newSignal = detectSignal(kd, signalSettings.value)
    dataMap.value[symbol] = {
      symbol, quote, bars, kd,
      signal:      newSignal,
      prevSignal:  'normal',
      lastUpdated: new Date(),
      loading:     false,
    }
  }

  function removeStock(symbol: string) {
    watchlist.value = watchlist.value.filter(w => w.symbol !== symbol)
    delete dataMap.value[symbol]
    save()
  }

  function reorderStock(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    const list = [...watchlist.value]
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
    watchlist.value = list
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

  // ── 口袋清單 ─────────────────────────────────────────────────────────────────

  function addToPocket(symbol: string, name: string) {
    if (pocketList.value.some(p => p.symbol === symbol)) return
    pocketList.value.push({ symbol, name, addedAt: Date.now() })
    save()
  }

  function removeFromPocket(symbol: string) {
    pocketList.value = pocketList.value.filter(p => p.symbol !== symbol)
    save()
  }

  function isInPocket(symbol: string): boolean {
    return pocketList.value.some(p => p.symbol === symbol)
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
    const interval = item?.interval ?? '5m'

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
      const { quote, bars, kd: apiKD } = await fetchStockData(symbol, interval)
      // Fugle 直接提供 KDJ，Yahoo Finance 則自行計算
      const kd = apiKD ?? calculateKD(bars)
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
      // 循序更新，避免並行打爆 Fugle free-tier rate limit（429）
      for (const w of watchlist.value) {
        await refreshOne(w.symbol)
      }
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
    if (_timer) clearTimeout(_timer)
    _timer = null

    async function tick() {
      await refreshAll()
      // 每次 refresh 完成後重新判斷，確保開/收盤切換即時生效
      const ms = isTaiwanTradingTime()
        ? signalSettings.value.refreshTradingMs
        : signalSettings.value.refreshClosedMs
      _timer = setTimeout(tick, ms)
    }

    // 先用目前判斷的間隔排第一次
    const ms = isTaiwanTradingTime()
      ? signalSettings.value.refreshTradingMs
      : signalSettings.value.refreshClosedMs
    _timer = setTimeout(tick, ms)
  }

  function stopAutoRefresh() {
    if (_timer) { clearTimeout(_timer); _timer = null }
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
    pocketList,
    dataMap,
    notifyEnabled,
    signalSettings,
    maxWatchlist,
    updateSignalSettings,
    lastRefresh,
    isRefreshing,
    listWithData,
    addStock,
    removeStock,
    reorderStock,
    addToPocket,
    removeFromPocket,
    isInPocket,
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
