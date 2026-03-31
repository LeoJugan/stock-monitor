<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  symbol:       string   // 裸碼，例如 "1326"
  name:         string
  currentPrice?: number  // 目前股價（用於未實現損益）
}>()

const emit = defineEmits<{ close: [] }>()

// ── 資料結構 ─────────────────────────────────────────────────────────────────
interface DayRow {
  date:    string   // YYYYMMDD
  foreign: number
  trust:   number
  dealer:  number
  total:   number
  price:   number   // 當日收盤（0 = 尚未取得）
}

interface AvgCost {
  qty:      number  // 累積持有張數
  avgPrice: number  // 加權平均成本（元）
}

const days     = ref(1)
const rows     = ref<DayRow[]>([])
const loading  = ref(false)
const error    = ref('')
const dateRange = ref('')

// 是否顯示平均成本區塊
const showCost = ref(false)
const costLoading = ref(false)

// ── 工具函式 ─────────────────────────────────────────────────────────────────
function todayTW(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '')
}

function prevDay(d: string): string {
  const dt = new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}T00:00:00`)
  dt.setDate(dt.getDate() - 1)
  return dt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(/-/g, '')
}

function parse(s: string): number {
  const n = parseInt(s.replace(/,/g, '').trim())
  return isNaN(n) ? 0 : Math.round(n / 1000)
}

function fmtDate(d: string): string {
  return `${d.slice(4,6)}/${d.slice(6)}`
}

// ── 抓 TWSE 個股日線收盤價（免費，無需 API Key）─────────────────────────────
// TWSE STOCK_DAY 一次回傳整個月，dates 可能跨月，需分月查詢（最多 2 個月）
async function fetchClosePrices(dates: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>()
  if (!dates.length) return priceMap

  // 取出涵蓋的不重複年月（YYYYMM）
  const months = [...new Set(dates.map(d => d.slice(0, 6)))]

  await Promise.all(months.map(async (ym) => {
    try {
      const res  = await fetch(`/api/stock-day?date=${ym}01&stockNo=${props.symbol}`)
      const json = await res.json()
      if (json.stat !== 'OK' || !json.data?.length) return

      for (const row of json.data) {
        // row[0] = "113/12/02"（民國年），row[6] = 收盤價字串
        const parts = (row[0] as string).split('/')
        const year  = parseInt(parts[0]) + 1911
        const dateKey = `${year}${parts[1]}${parts[2]}`   // YYYYMMDD
        const close   = parseFloat((row[6] as string).replace(/,/g, ''))
        if (!isNaN(close)) priceMap.set(dateKey, close)
      }
    } catch { /* 靜默忽略單月錯誤 */ }
  }))

  return priceMap
}

// ── 加權平均成本計算 ──────────────────────────────────────────────────────────
/**
 * 從最舊到最新累積，買入時加成本，賣出時以當前均價攤銷。
 * 只計算有收盤價的日期（price > 0）。
 */
function calcAvgCost(key: 'foreign' | 'trust' | 'dealer'): AvgCost {
  let qty       = 0
  let totalCost = 0

  // rows 是從新到舊，reverse 後從舊到新
  for (const row of [...rows.value].reverse()) {
    if (!row.price) continue
    const net = row[key]
    if (net > 0) {
      totalCost += net * row.price
      qty       += net
    } else if (net < 0 && qty > 0) {
      const sellQty  = Math.min(Math.abs(net), qty)
      const avgCost  = totalCost / qty
      totalCost     -= sellQty * avgCost
      qty           -= sellQty
    }
  }

  return { qty, avgPrice: qty > 0 ? totalCost / qty : 0 }
}

const foreignCost = computed(() => calcAvgCost('foreign'))
const trustCost   = computed(() => calcAvgCost('trust'))
const dealerCost  = computed(() => calcAvgCost('dealer'))

// 三法人合併（量加總，成本加權）
const combinedCost = computed<AvgCost>(() => {
  let totalQty  = 0
  let totalCost = 0
  for (const row of [...rows.value].reverse()) {
    if (!row.price) continue
    const net = row.foreign + row.trust + row.dealer
    if (net > 0) {
      totalCost += net * row.price
      totalQty  += net
    } else if (net < 0 && totalQty > 0) {
      const sellQty  = Math.min(Math.abs(net), totalQty)
      const avgCost  = totalCost / totalQty
      totalCost     -= sellQty * avgCost
      totalQty      -= sellQty
    }
  }
  return { qty: totalQty, avgPrice: totalQty > 0 ? totalCost / totalQty : 0 }
})

// 未實現損益 %（和現價比）
function unrealized(avgPrice: number): { pct: number; diff: number } | null {
  if (!props.currentPrice || avgPrice <= 0) return null
  const diff = props.currentPrice - avgPrice
  const pct  = (diff / avgPrice) * 100
  return { pct, diff }
}

// ── 查詢三大法人 ──────────────────────────────────────────────────────────────
async function fetchData() {
  loading.value   = true
  error.value     = ''
  rows.value      = []
  dateRange.value = ''

  const n = days.value
  let cur = todayTW()
  let found = 0
  let attempts = 0
  const collected: DayRow[] = []

  while (found < n && attempts < n + 30) {
    attempts++
    try {
      const res  = await fetch(`/api/three-majors?date=${cur}`)
      const json = await res.json()
      if (json.stat === 'OK' && json.data?.length) {
        const record = json.data.find((r: string[]) => r[0].trim() === props.symbol)
        if (record) {
          const foreign = parse(record[4])
          const trust   = parse(record[10])
          const dealer  = parse(record[11])
          collected.push({ date: cur, foreign, trust, dealer, total: foreign + trust + dealer, price: 0 })
        } else {
          collected.push({ date: cur, foreign: 0, trust: 0, dealer: 0, total: 0, price: 0 })
        }
        found++
      }
    } catch { /* 靜默忽略 */ }
    cur = prevDay(cur)
  }

  if (found === 0) {
    error.value = '近期無三大法人資料（假日或尚未公布）'
    loading.value = false
    return
  }

  rows.value = collected
  if (collected.length >= 2) {
    dateRange.value = `${fmtDate(collected[collected.length - 1].date)} ～ ${fmtDate(collected[0].date)}`
  } else if (collected.length === 1) {
    dateRange.value = fmtDate(collected[0].date)
  }
  loading.value = false

  // 已有資料後，若平均成本區塊開啟則自動抓價格
  if (showCost.value) await loadPrices()
}

// ── 抓收盤價並填入 rows ───────────────────────────────────────────────────────
async function loadPrices() {
  if (!rows.value.length) return
  costLoading.value = true
  const dates    = rows.value.map(r => r.date)
  const priceMap = await fetchClosePrices(dates)
  for (const row of rows.value) {
    row.price = priceMap.get(row.date) ?? 0
  }
  costLoading.value = false
}

async function toggleCost() {
  showCost.value = !showCost.value
  if (showCost.value && rows.value.every(r => r.price === 0)) {
    await loadPrices()
  }
}

// ── 格式化 ───────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return (n > 0 ? '+' : '') + n.toLocaleString()
}
function numClass(n: number): string {
  return n > 0 ? 'text-red-400' : n < 0 ? 'text-emerald-400' : 'text-slate-500'
}
function pctClass(pct: number): string {
  return pct > 0 ? 'text-red-400' : pct < 0 ? 'text-emerald-400' : 'text-slate-400'
}

// 合計（買超累積）
const total = computed(() => rows.value.reduce(
  (acc, r) => ({ foreign: acc.foreign + r.foreign, trust: acc.trust + r.trust,
                 dealer: acc.dealer + r.dealer, total: acc.total + r.total }),
  { foreign: 0, trust: 0, dealer: 0, total: 0 }
))

watch(days, fetchData)
onMounted(fetchData)
</script>

<template>
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
       @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

    <!-- Panel -->
    <div class="relative w-full max-w-md bg-slate-800 border border-slate-700/80
                rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700/50 shrink-0">
        <div>
          <h2 class="text-base font-bold text-white flex items-center gap-2">
            <span class="text-xl">🏦</span>
            <span class="font-mono text-blue-300">{{ symbol }}</span>
            <span>{{ name }}</span>
          </h2>
          <p class="text-[11px] text-slate-500 mt-0.5">
            三大法人買超（單位：張）
            <span v-if="dateRange" class="text-slate-600 ml-1">｜{{ dateRange }}</span>
          </p>
        </div>
        <button class="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-700"
                @click="emit('close')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 天數選擇 -->
      <div class="flex items-center gap-2 px-5 pt-4 pb-3 shrink-0">
        <span class="text-xs text-slate-500 shrink-0">累積天數</span>
        <div class="flex gap-1">
          <button
            v-for="d in [1, 3, 5, 10, 20]" :key="d"
            :class="[
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
              days === d
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            ]"
            @click="days = d"
          >{{ d }}日</button>
        </div>
        <button
          class="ml-auto p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-colors"
          title="重新查詢"
          @click="fetchData"
        >
          <svg :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']"
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- 捲動區域 -->
      <div class="overflow-y-auto flex-1 px-4 pb-5 space-y-4">

        <!-- Loading -->
        <div v-if="loading" class="space-y-2">
          <div v-for="i in days" :key="i" class="h-9 bg-slate-700/40 rounded-xl animate-pulse" />
        </div>

        <!-- Error -->
        <div v-else-if="error"
             class="text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm">
          ⚠️ {{ error }}
        </div>

        <template v-else-if="rows.length > 0">

          <!-- ── 每日明細表 ── -->
          <div class="rounded-xl border border-slate-700/50 overflow-hidden">
            <table class="w-full text-xs">
              <thead>
                <tr class="bg-slate-900/60 text-slate-500">
                  <th class="text-left px-3 py-2 font-medium">日期</th>
                  <th class="text-right px-2 py-2 font-medium text-blue-400/70">外資</th>
                  <th class="text-right px-2 py-2 font-medium text-emerald-400/70">投信</th>
                  <th class="text-right px-2 py-2 font-medium text-yellow-400/70">自營</th>
                  <th class="text-right px-3 py-2 font-medium text-purple-400/70">合計</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-700/30">
                <tr v-for="r in rows" :key="r.date" class="hover:bg-slate-700/20 transition-colors">
                  <td class="px-3 py-2 font-mono text-slate-400">{{ fmtDate(r.date) }}</td>
                  <td :class="['px-2 py-2 text-right font-mono', numClass(r.foreign)]">{{ fmt(r.foreign) }}</td>
                  <td :class="['px-2 py-2 text-right font-mono', numClass(r.trust)]">{{ fmt(r.trust) }}</td>
                  <td :class="['px-2 py-2 text-right font-mono', numClass(r.dealer)]">{{ fmt(r.dealer) }}</td>
                  <td :class="['px-3 py-2 text-right font-mono font-semibold', numClass(r.total)]">{{ fmt(r.total) }}</td>
                </tr>
              </tbody>
              <!-- 合計列 -->
              <tfoot v-if="rows.length > 1">
                <tr class="bg-slate-900/60 border-t border-slate-600/50">
                  <td class="px-3 py-2 text-slate-400 font-medium">合計</td>
                  <td :class="['px-2 py-2 text-right font-mono font-bold', numClass(total.foreign)]">{{ fmt(total.foreign) }}</td>
                  <td :class="['px-2 py-2 text-right font-mono font-bold', numClass(total.trust)]">{{ fmt(total.trust) }}</td>
                  <td :class="['px-2 py-2 text-right font-mono font-bold', numClass(total.dealer)]">{{ fmt(total.dealer) }}</td>
                  <td :class="['px-3 py-2 text-right font-mono font-bold', numClass(total.total)]">{{ fmt(total.total) }}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- ── 三格小卡（買超合計） ── -->
          <div class="grid grid-cols-3 gap-2">
            <div v-for="item in [
              { label: '外資', value: total.foreign },
              { label: '投信', value: total.trust },
              { label: '自營', value: total.dealer },
            ]" :key="item.label"
              class="text-center bg-slate-900/40 rounded-xl p-2.5 border border-slate-700/30">
              <div class="text-[10px] text-slate-600 mb-1">{{ item.label }}</div>
              <div :class="['text-sm font-mono font-bold', numClass(item.value)]">{{ fmt(item.value) }}</div>
              <div class="text-[10px] text-slate-600 mt-0.5">張</div>
            </div>
          </div>

          <!-- ── 平均成本切換按鈕 ── -->
          <button
            class="w-full flex items-center justify-center gap-2 py-2 rounded-xl border transition-all text-sm font-medium"
            :class="showCost
              ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
              : 'border-slate-700/60 bg-slate-700/20 text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'"
            @click="toggleCost"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {{ showCost ? '隱藏平均成本' : '計算平均成本（估算）' }}
            <svg v-if="costLoading" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </button>

          <!-- ── 平均成本區塊 ── -->
          <Transition
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
          >
            <div v-if="showCost && !costLoading" class="space-y-2">

              <!-- 說明 -->
              <p class="text-[11px] text-slate-600 text-center px-2">
                以各日收盤價估算，僅限顯示區間內累積成本，供參考用
              </p>

              <!-- 合計成本卡 -->
              <div class="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                <div class="text-xs text-slate-500 mb-2 text-center font-medium">三法人合計</div>
                <div class="flex items-center justify-around">
                  <div class="text-center">
                    <div class="text-[10px] text-slate-600">持有</div>
                    <div class="text-sm font-mono font-bold text-slate-300">
                      {{ combinedCost.qty.toLocaleString() }} 張
                    </div>
                  </div>
                  <div class="w-px h-8 bg-slate-700" />
                  <div class="text-center">
                    <div class="text-[10px] text-slate-600">均成本</div>
                    <div class="text-lg font-mono font-bold text-white">
                      {{ combinedCost.avgPrice > 0 ? combinedCost.avgPrice.toFixed(2) : '--' }}
                    </div>
                  </div>
                  <template v-if="currentPrice && combinedCost.avgPrice > 0">
                    <div class="w-px h-8 bg-slate-700" />
                    <div class="text-center">
                      <div class="text-[10px] text-slate-600">未實現</div>
                      <div :class="['text-sm font-mono font-bold', pctClass(unrealized(combinedCost.avgPrice)?.pct ?? 0)]">
                        {{ unrealized(combinedCost.avgPrice) ? (unrealized(combinedCost.avgPrice)!.pct > 0 ? '+' : '') + unrealized(combinedCost.avgPrice)!.pct.toFixed(2) + '%' : '--' }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>

              <!-- 各法人明細 -->
              <div class="grid grid-cols-3 gap-2">
                <div v-for="inst in [
                  { label: '外資', cost: foreignCost, color: 'blue' },
                  { label: '投信', cost: trustCost,   color: 'emerald' },
                  { label: '自營', cost: dealerCost,  color: 'yellow' },
                ]" :key="inst.label"
                  class="bg-slate-900/50 rounded-xl p-2.5 border border-slate-700/30 text-center">
                  <div class="text-[10px] text-slate-600 mb-1.5">{{ inst.label }}</div>
                  <div class="text-[11px] font-mono font-bold text-white leading-none">
                    {{ inst.cost.avgPrice > 0 ? inst.cost.avgPrice.toFixed(2) : '--' }}
                  </div>
                  <div class="text-[10px] text-slate-600 mt-1">
                    {{ inst.cost.qty > 0 ? inst.cost.qty.toLocaleString() + '張' : '無持倉' }}
                  </div>
                  <!-- 未實現損益 -->
                  <div v-if="currentPrice && inst.cost.avgPrice > 0"
                       :class="['text-[10px] font-medium mt-1', pctClass(unrealized(inst.cost.avgPrice)?.pct ?? 0)]">
                    {{ unrealized(inst.cost.avgPrice)
                        ? (unrealized(inst.cost.avgPrice)!.pct > 0 ? '+' : '')
                          + unrealized(inst.cost.avgPrice)!.pct.toFixed(1) + '%'
                        : '' }}
                  </div>
                </div>
              </div>

              <!-- 每日收盤參考（展示用到的價格） -->
              <div class="rounded-xl border border-slate-700/40 overflow-hidden">
                <div class="bg-slate-900/60 px-3 py-1.5 text-[10px] text-slate-600 font-medium">
                  使用之收盤價
                </div>
                <div class="divide-y divide-slate-700/30">
                  <div v-for="r in rows" :key="r.date"
                       class="flex justify-between px-3 py-1.5 text-xs">
                    <span class="font-mono text-slate-500">{{ fmtDate(r.date) }}</span>
                    <span class="font-mono" :class="r.price > 0 ? 'text-slate-300' : 'text-slate-700'">
                      {{ r.price > 0 ? r.price.toFixed(2) : '無資料' }}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </Transition>

        </template>
      </div>
    </div>
  </div>
</template>
