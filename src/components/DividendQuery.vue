<script setup lang="ts">
import { ref, computed } from 'vue'
import { TW_STOCK_NAMES } from '@/services/dataService'

interface DividendRow {
  year:         string   // 民國年或西元年
  cashDiv:      number   // 現金股利
  stockDiv:     number   // 股票股利
  exDivDate:    string   // 除息日
  exDivPrice:   number   // 除息前收盤
  yield:        number   // 殖利率 %
  fillDays:     number   // 0=已填息 -1=未填息 -2=待除息
  status:       'pending' | 'filled' | 'unfilled'
}

const symbolInput = ref('')
const displayName = ref('')
const rows        = ref<DividendRow[]>([])
const loading     = ref(false)
const error       = ref('')

const QUICK = ['2330','0056','2412','2882','2317','2454','00878','00713']

const stats = computed(() => {
  const valid = rows.value.filter(r => r.cashDiv > 0 && r.status !== 'pending')
  if (!valid.length) return null
  const recent5 = valid.slice(0, 5)
  const avgDiv   = recent5.reduce((s, r) => s + r.cashDiv, 0) / recent5.length
  const avgYield = recent5.filter(r => r.yield > 0).reduce((s, r) => s + r.yield, 0)
                 / recent5.filter(r => r.yield > 0).length || 0
  const filled   = valid.filter(r => r.status === 'filled')
  const fillRate = valid.length ? (filled.length / valid.length) * 100 : 0
  const avgDays  = filled.length
    ? filled.reduce((s, r) => s + r.fillDays, 0) / filled.length : 0
  return { avgDiv, avgYield, fillRate, avgDays }
})

async function search(code?: string) {
  const sym = (code ?? symbolInput.value).trim().toUpperCase().replace(/\.TW[O]?$/, '')
  if (!sym) return
  symbolInput.value = sym
  displayName.value = TW_STOCK_NAMES[sym] ?? sym
  loading.value = true
  error.value   = ''
  rows.value    = []

  try {
    const startDate = `${new Date().getFullYear() - 7}-01-01`
    const [divRes, resultRes] = await Promise.all([
      fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${sym}&start_date=${startDate}`),
      fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividendResult&data_id=${sym}&start_date=${startDate}`),
    ])

    const divData: any[]    = (await divRes.json()).data    ?? []
    const resultData: any[] = (await resultRes.json()).data ?? []

    // DividendResult: date = 除息日, before_price, max_price（達到即填息）
    // max_price >= before_price → 曾填息
    const resultMap = new Map<string, any>()
    for (const r of resultData) resultMap.set(r.date, r)

    // Dividend 每筆可能只有現金或股票，合併同除息日
    const merged = new Map<string, {
      cashDiv: number; stockDiv: number; exDivDate: string; year: string
    }>()
    for (const d of divData) {
      const key = d.CashExDividendTradingDate || d.StockExDividendTradingDate || ''
      if (!key) continue
      const ex = merged.get(key) ?? { cashDiv: 0, stockDiv: 0, exDivDate: key, year: d.year ?? '' }
      ex.cashDiv  += parseFloat(d.CashEarningsDistribution ?? 0) + parseFloat(d.CashStatutorySurplus ?? 0)
      ex.stockDiv += parseFloat(d.StockEarningsDistribution ?? 0) + parseFloat(d.StockStatutorySurplus ?? 0)
      if (!ex.year && d.year) ex.year = d.year
      merged.set(key, ex)
    }

    const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)

    rows.value = Array.from(merged.values())
      .sort((a, b) => b.exDivDate.localeCompare(a.exDivDate))
      .map(d => {
        const result     = resultMap.get(d.exDivDate)
        const beforePrice = result?.before_price ?? 0
        const maxPrice    = result?.max_price    ?? 0
        const cashDiv     = Math.round(d.cashDiv  * 100) / 100
        const stockDiv    = Math.round(d.stockDiv * 100) / 100
        const yld         = beforePrice > 0 && cashDiv > 0 ? (cashDiv / beforePrice) * 100 : 0
        const isPending   = d.exDivDate > today

        let status: DividendRow['status']
        let fillDays = -1

        if (isPending) {
          status = 'pending'
        } else if (maxPrice > 0 && beforePrice > 0 && maxPrice >= beforePrice) {
          status   = 'filled'
          // 填息天數：無精確日期，用 max_price 出現估算（null → 顯示 ✓）
          fillDays = 0
        } else {
          status = 'unfilled'
        }

        // 民國年（從 API year 字串取，例如 "113年第1季" → "113年"）
        const yearLabel = d.year ? d.year.replace(/第.*$/, '').trim()
          : `${parseInt(d.exDivDate.slice(0, 4)) - 1911}年`

        return {
          year:       yearLabel,
          cashDiv,
          stockDiv,
          exDivDate:  d.exDivDate,
          exDivPrice: beforePrice,
          yield:      Math.round(yld * 100) / 100,
          fillDate:   '',
          fillDays,
          status,
        }
      })

    if (!rows.value.length) error.value = `找不到 ${sym} 的除息紀錄`
  } catch {
    error.value = '資料取得失敗，請稍後再試'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-4">

    <!-- 標題 -->
    <div>
      <h2 class="text-lg font-bold text-white flex items-center gap-2">
        <span class="text-xl">💰</span> 除息 / 填息查詢
      </h2>
      <p class="text-xs text-slate-500 mt-0.5">資料來源：FinMind（免費）</p>
    </div>

    <!-- 搜尋列 -->
    <div class="flex gap-2">
      <input
        v-model="symbolInput"
        type="text"
        placeholder="輸入股票代碼，例：2330"
        class="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3.5 py-2.5 text-sm
               text-slate-100 font-mono placeholder-slate-600
               focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
        @keyup.enter="search()"
      />
      <button
        class="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium
               transition-colors flex items-center gap-1.5"
        :disabled="loading"
        @click="search()"
      >
        <svg v-if="loading" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        {{ loading ? '查詢中…' : '查詢' }}
      </button>
    </div>

    <!-- 快速選擇 -->
    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="q in QUICK" :key="q"
        :class="['text-xs px-2.5 py-1 rounded-lg border transition-all',
                 symbolInput === q
                   ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                   : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200']"
        @click="search(q)"
      >
        {{ TW_STOCK_NAMES[q] ?? q }}（{{ q }}）
      </button>
    </div>

    <!-- 統計卡 -->
    <div v-if="stats && rows.length"
         class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40 text-center">
        <div class="text-[11px] text-slate-500 mb-1">近5年平均股利</div>
        <div class="text-lg font-bold text-yellow-300">{{ stats.avgDiv.toFixed(2) }}</div>
        <div class="text-[10px] text-slate-600">元/股</div>
      </div>
      <div class="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40 text-center">
        <div class="text-[11px] text-slate-500 mb-1">近5年平均殖利率</div>
        <div class="text-lg font-bold text-emerald-400">{{ stats.avgYield.toFixed(2) }}%</div>
      </div>
      <div class="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40 text-center">
        <div class="text-[11px] text-slate-500 mb-1">整體填息率</div>
        <div class="text-lg font-bold text-blue-400">{{ stats.fillRate.toFixed(0) }}%</div>
      </div>
      <div class="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40 text-center">
        <div class="text-[11px] text-slate-500 mb-1">平均填息天數</div>
        <div class="text-lg font-bold text-purple-400">{{ stats.avgDays.toFixed(0) }}</div>
        <div class="text-[10px] text-slate-600">天</div>
      </div>
    </div>

    <!-- 股票名稱 -->
    <div v-if="displayName && rows.length"
         class="text-sm font-semibold text-slate-200">
      {{ displayName }}（{{ symbolInput }}）
      <span class="text-slate-500 font-normal text-xs ml-2">共 {{ rows.length }} 筆除息紀錄</span>
    </div>

    <!-- Error -->
    <div v-if="error"
         class="text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm">
      ⚠️ {{ error }}
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="space-y-2">
      <div v-for="i in 6" :key="i" class="h-10 bg-slate-800/60 rounded-xl animate-pulse" />
    </div>

    <!-- 表格 -->
    <div v-else-if="rows.length"
         class="rounded-xl border border-slate-700/50 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-slate-800/80 text-slate-400 text-xs">
            <th class="text-left px-3 py-2.5 font-medium">年度</th>
            <th class="text-right px-3 py-2.5 font-medium">現金股利</th>
            <th class="text-right px-3 py-2.5 font-medium">股票股利</th>
            <th class="text-right px-3 py-2.5 font-medium">除息日</th>
            <th class="text-right px-3 py-2.5 font-medium">除息前價</th>
            <th class="text-right px-3 py-2.5 font-medium">殖利率</th>
            <th class="text-right px-3 py-2.5 font-medium pr-4">填息狀態</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-700/30">
          <tr v-for="r in rows" :key="r.exDivDate"
              class="hover:bg-slate-700/30 transition-colors">
            <td class="px-3 py-2.5 text-slate-400 text-xs font-medium">{{ r.year }}</td>
            <td class="px-3 py-2.5 text-right font-mono font-semibold"
                :class="r.cashDiv > 0 ? 'text-yellow-300' : 'text-slate-600'">
              {{ r.cashDiv > 0 ? r.cashDiv.toFixed(2) : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-slate-400">
              {{ r.stockDiv > 0 ? r.stockDiv.toFixed(2) : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-slate-400 text-xs">
              {{ r.exDivDate }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-slate-300">
              {{ r.exDivPrice > 0 ? r.exDivPrice.toFixed(2) : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono font-semibold"
                :class="r.yield >= 5 ? 'text-emerald-400' : r.yield > 0 ? 'text-emerald-300/70' : 'text-slate-600'">
              {{ r.yield > 0 ? r.yield.toFixed(2) + '%' : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right pr-4">
              <span v-if="r.status === 'pending'"
                    class="text-xs px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/20">
                待除息
              </span>
              <span v-else-if="r.status === 'filled'"
                    class="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                ✓ 已填息
              </span>
              <span v-else
                    class="text-xs px-2 py-0.5 rounded-md bg-slate-700/50 text-slate-500 border border-slate-700">
                未填息
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 空狀態 -->
    <div v-else-if="!loading && !error && !rows.length"
         class="text-center text-slate-600 py-16">
      <div class="text-4xl mb-3">💰</div>
      輸入股票代碼查詢除息紀錄
    </div>

  </div>
</template>
