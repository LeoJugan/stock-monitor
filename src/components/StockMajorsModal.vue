<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  symbol: string   // 裸碼，例如 "1326"
  name:   string
}>()

const emit = defineEmits<{ close: [] }>()

// ── 資料結構 ─────────────────────────────────────────────────────────────────
interface DayRow {
  date:    string
  foreign: number
  trust:   number
  dealer:  number
  total:   number
}

const days       = ref(5)            // 查詢天數
const rows       = ref<DayRow[]>([]) // 每日資料（新 → 舊）
const loading    = ref(false)
const error      = ref('')
const dateRange  = ref('')

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
  // YYYYMMDD → MM/DD
  return `${d.slice(4,6)}/${d.slice(6)}`
}

// ── 查詢 ─────────────────────────────────────────────────────────────────────
async function fetchData() {
  loading.value = true
  error.value   = ''
  rows.value    = []
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
          collected.push({
            date: json.date ?? cur,
            foreign,
            trust,
            dealer,
            total: foreign + trust + dealer,
          })
        } else {
          // 當天有資料但此股票不在清單（可能為上櫃或特殊股）
          collected.push({ date: json.date ?? cur, foreign: 0, trust: 0, dealer: 0, total: 0 })
        }
        found++
      }
    } catch { /* 靜默忽略單日錯誤 */ }
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
}

// ── 合計 ─────────────────────────────────────────────────────────────────────
const total = computed(() => rows.value.reduce(
  (acc, r) => ({
    foreign: acc.foreign + r.foreign,
    trust:   acc.trust   + r.trust,
    dealer:  acc.dealer  + r.dealer,
    total:   acc.total   + r.total,
  }),
  { foreign: 0, trust: 0, dealer: 0, total: 0 }
))

function fmt(n: number): string {
  return (n > 0 ? '+' : '') + n.toLocaleString()
}
function numClass(n: number): string {
  return n > 0 ? 'text-red-400' : n < 0 ? 'text-emerald-400' : 'text-slate-500'
}

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
                rounded-2xl shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700/50">
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
      <div class="flex items-center gap-2 px-5 pt-4 pb-3">
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
          :class="loading ? 'animate-spin' : ''"
          @click="fetchData"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="px-5 pb-6 space-y-2">
        <div v-for="i in days" :key="i" class="h-9 bg-slate-700/40 rounded-xl animate-pulse" />
      </div>

      <!-- Error -->
      <div v-else-if="error"
           class="mx-5 mb-5 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm">
        ⚠️ {{ error }}
      </div>

      <!-- 表格 -->
      <div v-else-if="rows.length > 0" class="px-4 pb-5">
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
              <tr v-for="r in rows" :key="r.date"
                  class="hover:bg-slate-700/20 transition-colors">
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
                <td class="px-3 py-2 text-slate-400 font-medium text-xs">合計</td>
                <td :class="['px-2 py-2 text-right font-mono font-bold text-xs', numClass(total.foreign)]">
                  {{ fmt(total.foreign) }}
                </td>
                <td :class="['px-2 py-2 text-right font-mono font-bold text-xs', numClass(total.trust)]">
                  {{ fmt(total.trust) }}
                </td>
                <td :class="['px-2 py-2 text-right font-mono font-bold text-xs', numClass(total.dealer)]">
                  {{ fmt(total.dealer) }}
                </td>
                <td :class="['px-3 py-2 text-right font-mono font-bold text-xs', numClass(total.total)]">
                  {{ fmt(total.total) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- 趨勢小結 -->
        <div class="mt-3 grid grid-cols-3 gap-2">
          <div v-for="item in [
            { label: '外資', value: total.foreign, color: 'blue' },
            { label: '投信', value: total.trust,   color: 'emerald' },
            { label: '自營', value: total.dealer,  color: 'yellow' },
          ]" :key="item.label"
            class="text-center bg-slate-900/40 rounded-xl p-2.5 border border-slate-700/30">
            <div class="text-[10px] text-slate-600 mb-1">{{ item.label }}</div>
            <div :class="['text-sm font-mono font-bold', numClass(item.value)]">
              {{ fmt(item.value) }}
            </div>
            <div class="text-[10px] text-slate-600 mt-0.5">張</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
