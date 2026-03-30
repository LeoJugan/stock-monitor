<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

interface MajorRow {
  code:    string
  name:    string
  foreign: number  // 張
  trust:   number
  dealer:  number
  total:   number
}

const rows      = ref<MajorRow[]>([])
const loading   = ref(false)
const error     = ref('')
const date      = ref('')          // YYYYMMDD
const dataDate  = ref('')          // 回傳的實際日期（TWSE 欄位）
const filterMin = ref(0)           // 外資最低買超（張）篩選
const sortKey   = ref<'foreign' | 'trust' | 'dealer' | 'total'>('foreign')
const showAll   = ref(false)       // false = 僅同步買超，true = 全部

function todayTW(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '')
}

function parse(s: string): number {
  const n = parseInt(s.replace(/,/g, '').trim())
  return isNaN(n) ? 0 : Math.round(n / 1000)  // 股 → 張
}

async function fetchData(d?: string) {
  loading.value = true
  error.value   = ''
  rows.value    = []
  const q = d || date.value || todayTW()
  try {
    const res  = await fetch(`/api/three-majors?date=${q}`)
    const json = await res.json()

    if (json.stat !== 'OK' || !json.data?.length) {
      error.value = `${q.slice(0,4)}/${q.slice(4,6)}/${q.slice(6)} 無資料（假日或尚未公布）`
      return
    }

    dataDate.value = json.date ?? q

    rows.value = (json.data as string[][]).map(row => {
      const foreign = parse(row[4])
      const trust   = parse(row[10])
      const dealer  = parse(row[11])
      return {
        code:    row[0].trim(),
        name:    row[1].trim(),
        foreign, trust, dealer,
        total:   foreign + trust + dealer,
      }
    })
  } catch {
    error.value = '資料取得失敗，請稍後再試'
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  let list = rows.value
  if (!showAll.value) {
    list = list.filter(r => r.foreign > 0 && r.trust > 0 && r.dealer > 0)
  }
  if (filterMin.value > 0) {
    list = list.filter(r => r.foreign >= filterMin.value)
  }
  return [...list].sort((a, b) => b[sortKey.value] - a[sortKey.value])
})

function setDate(d: string) {
  date.value = d
  fetchData(d)
}

onMounted(() => {
  date.value = todayTW()
  fetchData()
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-4">

    <!-- 標題列 -->
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
          <span class="text-xl">🏦</span> 三大法人同步買超
        </h2>
        <p class="text-xs text-slate-500 mt-0.5">外資、投信、自營商同日買超個股（上市，單位：張）</p>
      </div>

      <!-- 日期選擇 -->
      <div class="ml-auto flex items-center gap-2">
        <input
          type="date"
          :value="date ? `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}` : ''"
          class="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-sm text-slate-200
                 focus:outline-none focus:border-blue-500"
          @change="(e) => setDate((e.target as HTMLInputElement).value.replace(/-/g,''))"
        />
        <button
          class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          @click="fetchData()"
        >
          <svg v-if="loading" class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          {{ loading ? '查詢中…' : '查詢' }}
        </button>
      </div>
    </div>

    <!-- 篩選列 -->
    <div class="flex flex-wrap items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/40">
      <!-- 同步買超 toggle -->
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <div
          :class="['relative w-10 h-5 rounded-full transition-colors',
                   !showAll ? 'bg-blue-600' : 'bg-slate-600']"
          @click="showAll = !showAll"
        >
          <div :class="['absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                        !showAll ? 'left-5' : 'left-0.5']"/>
        </div>
        <span class="text-sm text-slate-300">僅同步買超</span>
      </label>

      <div class="w-px h-4 bg-slate-600" />

      <!-- 外資最低門檻 -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500">外資 ≥</span>
        <select
          v-model.number="filterMin"
          class="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200
                 focus:outline-none focus:border-blue-500"
        >
          <option :value="0">不限</option>
          <option :value="100">100 張</option>
          <option :value="500">500 張</option>
          <option :value="1000">1,000 張</option>
          <option :value="5000">5,000 張</option>
        </select>
      </div>

      <div class="w-px h-4 bg-slate-600" />

      <!-- 排序 -->
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-500">排序</span>
        <select
          v-model="sortKey"
          class="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200
                 focus:outline-none focus:border-blue-500"
        >
          <option value="foreign">外資</option>
          <option value="trust">投信</option>
          <option value="dealer">自營商</option>
          <option value="total">合計</option>
        </select>
      </div>

      <div class="ml-auto text-xs text-slate-500">
        共 <span class="text-slate-300 font-medium">{{ filtered.length }}</span> 檔
        <template v-if="dataDate">
          ｜{{ dataDate }}
        </template>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error"
         class="text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-sm">
      ⚠️ {{ error }}
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="loading" class="space-y-2">
      <div v-for="i in 8" :key="i"
           class="h-10 bg-slate-800/60 rounded-xl animate-pulse" />
    </div>

    <!-- 表格 -->
    <div v-else-if="filtered.length > 0"
         class="rounded-xl border border-slate-700/50 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-slate-800/80 text-slate-400 text-xs">
            <th class="text-left px-3 py-2.5 font-medium">#</th>
            <th class="text-left px-3 py-2.5 font-medium">代號</th>
            <th class="text-left px-3 py-2.5 font-medium">名稱</th>
            <th
              class="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-blue-400 transition-colors"
              :class="sortKey === 'foreign' ? 'text-blue-400' : ''"
              @click="sortKey = 'foreign'"
            >外資 ↕</th>
            <th
              class="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-emerald-400 transition-colors"
              :class="sortKey === 'trust' ? 'text-emerald-400' : ''"
              @click="sortKey = 'trust'"
            >投信 ↕</th>
            <th
              class="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-yellow-400 transition-colors"
              :class="sortKey === 'dealer' ? 'text-yellow-400' : ''"
              @click="sortKey = 'dealer'"
            >自營 ↕</th>
            <th
              class="text-right px-3 py-2.5 font-medium cursor-pointer hover:text-purple-400 transition-colors pr-4"
              :class="sortKey === 'total' ? 'text-purple-400' : ''"
              @click="sortKey = 'total'"
            >合計 ↕</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-700/30">
          <tr
            v-for="(r, idx) in filtered" :key="r.code"
            class="hover:bg-slate-700/30 transition-colors"
          >
            <td class="px-3 py-2.5 text-slate-600 text-xs">{{ idx + 1 }}</td>
            <td class="px-3 py-2.5 font-mono text-blue-400 font-medium">{{ r.code }}</td>
            <td class="px-3 py-2.5 text-slate-200">{{ r.name }}</td>
            <td class="px-3 py-2.5 text-right font-mono"
                :class="r.foreign > 0 ? 'text-red-400' : 'text-emerald-400'">
              {{ r.foreign > 0 ? '+' : '' }}{{ r.foreign.toLocaleString() }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono"
                :class="r.trust > 0 ? 'text-red-400' : 'text-emerald-400'">
              {{ r.trust > 0 ? '+' : '' }}{{ r.trust.toLocaleString() }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono"
                :class="r.dealer > 0 ? 'text-red-400' : 'text-emerald-400'">
              {{ r.dealer > 0 ? '+' : '' }}{{ r.dealer.toLocaleString() }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono font-semibold pr-4"
                :class="r.total > 0 ? 'text-purple-300' : 'text-slate-400'">
              {{ r.total > 0 ? '+' : '' }}{{ r.total.toLocaleString() }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else-if="!loading && !error"
         class="text-center text-slate-600 py-12">
      無符合條件的個股
    </div>

  </div>
</template>
