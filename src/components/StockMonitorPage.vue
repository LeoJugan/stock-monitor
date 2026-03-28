<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useStockStore } from '@/stores/stockStore'
import { getTaiwanTimeStr, isTaiwanTradingTime } from '@/utils/marketTime'
import { DATA_SOURCE_LABEL } from '@/services/dataService'
import StockCard from './StockCard.vue'
import AddStockModal from './AddStockModal.vue'
import SignalSettingsModal from './SignalSettingsModal.vue'

const store = useStockStore()
const showModal    = ref(false)
const showSettings = ref(false)
const addError   = ref('')
const twTime     = ref(getTaiwanTimeStr())
const isTrading  = ref(isTaiwanTradingTime())

// 即時時鐘
let clockTimer: ReturnType<typeof setInterval>
onMounted(() => {
  clockTimer = setInterval(() => {
    twTime.value   = getTaiwanTimeStr()
    isTrading.value = isTaiwanTradingTime()
  }, 1000)
})
onUnmounted(() => clearInterval(clockTimer))

// 加股票
async function handleAdd(symbol: string, name: string) {
  addError.value = ''
  try {
    await store.addStock(symbol, name)
    showModal.value = false
  } catch (e) {
    addError.value = e instanceof Error ? e.message : '新增失敗'
  }
}

// 訊號統計
const signalCount = computed(() => {
  const counts = {
    golden_cross: 0, death_cross: 0,
    golden_cross_warn: 0, death_cross_warn: 0,
    oversold: 0, overbought: 0,
  }
  for (const { data } of store.listWithData) {
    if (!data || data.signal === 'normal') continue
    counts[data.signal]++
  }
  return counts
})

const hasAlert = computed(() =>
  Object.values(signalCount.value).some(v => v > 0)
)

// 手動刷新動畫
const spinning = ref(false)
async function manualRefresh() {
  spinning.value = true
  await store.refreshAll()
  setTimeout(() => { spinning.value = false }, 600)
}

// 拖曳排序
const dragFrom  = ref(-1)
const dragOver  = ref(-1)
const dragReady = ref(false)  // 只有從把手按下才允許拖曳

function onDragHandleMousedown() {
  dragReady.value = true
}

function onDragStart(e: DragEvent, idx: number) {
  if (!dragReady.value) { e.preventDefault(); return }
  dragFrom.value = idx
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(e: DragEvent, idx: number) {
  e.preventDefault()
  dragOver.value = idx
}

function onDrop(idx: number) {
  if (dragFrom.value !== -1 && dragFrom.value !== idx) {
    store.reorderStock(dragFrom.value, idx)
  }
  dragFrom.value  = -1
  dragOver.value  = -1
  dragReady.value = false
}

function onDragEnd() {
  dragFrom.value  = -1
  dragOver.value  = -1
  dragReady.value = false
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">

    <!-- ══ Header ══════════════════════════════════════════════════════ -->
    <header class="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">

        <!-- Title -->
        <div class="flex items-center gap-2.5 mr-auto">
          <span class="text-xl">📈</span>
          <div>
            <h1 class="text-sm font-bold text-white leading-none">台股盯盤系統</h1>
            <p class="text-[11px] text-slate-500 leading-none mt-0.5">Taiwan Stock Monitor</p>
          </div>
        </div>

        <!-- 市場狀態 + 時鐘 -->
        <div class="hidden sm:flex items-center gap-2 text-xs">
          <span :class="[
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium',
            isTrading
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
              : 'bg-slate-700/50 text-slate-500 border border-slate-700'
          ]">
            <span :class="['w-1.5 h-1.5 rounded-full', isTrading ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600']" />
            {{ isTrading ? '交易中' : '已收盤' }}
          </span>
          <span class="font-mono text-slate-500 tabular-nums">{{ twTime }}</span>
        </div>

        <!-- 訊號設定 -->
        <button
          class="p-2 rounded-lg transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-700/60"
          title="KD 訊號條件設定"
          @click="showSettings = true"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </button>

        <!-- 刷新 -->
        <button
          :class="['p-2 rounded-lg transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-700/60',
                   store.isRefreshing ? 'opacity-50 cursor-not-allowed' : '']"
          :disabled="store.isRefreshing"
          title="手動更新"
          @click="manualRefresh"
        >
          <svg :class="['w-4 h-4', spinning ? 'animate-spin' : '']"
               fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <!-- 通知開關 -->
        <button
          :class="[
            'p-2 rounded-lg transition-colors',
            store.notifyEnabled
              ? 'text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/60'
          ]"
          :title="store.notifyEnabled ? '關閉通知' : '開啟通知'"
          @click="store.toggleGlobalNotify"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path v-if="store.notifyEnabled"
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10 3.17 10 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            <path v-else
              d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10 3.17 10 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zM2.5 1.5L1 3l2.31 2.31C3.11 5.95 3 6.46 3 7v0l-2 2v1h13.73L17 12.27V16l2 2v1h.73L21.5 21 23 19.5 2.5 1.5z"
              opacity="0.6" />
          </svg>
        </button>

        <!-- 新增按鈕 -->
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500
                 text-white text-xs font-semibold transition-colors shadow-lg shadow-blue-500/20"
          @click="showModal = true; addError = ''"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
          </svg>
          新增股票
        </button>
      </div>
    </header>

    <!-- ══ Body ══════════════════════════════════════════════════════ -->
    <main class="flex-1 max-w-6xl mx-auto w-full px-4 py-5">

      <!-- 訊號摘要列 -->
      <div v-if="hasAlert"
        class="flex flex-wrap gap-2 mb-5 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/50">
        <span class="text-xs text-slate-500 self-center mr-1 font-medium">KD 訊號：</span>
        <span v-if="signalCount.golden_cross > 0"
          class="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
          🔺 黃金交叉 {{ signalCount.golden_cross }} 支
        </span>
        <span v-if="signalCount.death_cross > 0"
          class="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          🔻 死亡交叉 {{ signalCount.death_cross }} 支
        </span>
        <span v-if="signalCount.oversold > 0"
          class="text-xs px-2.5 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
          📉 超賣 {{ signalCount.oversold }} 支
        </span>
        <span v-if="signalCount.overbought > 0"
          class="text-xs px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
          📈 超買 {{ signalCount.overbought }} 支
        </span>
        <span v-if="signalCount.golden_cross_warn > 0"
          class="text-xs px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20 animate-pulse">
          ⚡ 即將黃金 {{ signalCount.golden_cross_warn }} 支
        </span>
        <span v-if="signalCount.death_cross_warn > 0"
          class="text-xs px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20 animate-pulse">
          ⚡ 即將死亡 {{ signalCount.death_cross_warn }} 支
        </span>
      </div>

      <!-- 更新時間 -->
      <div v-if="store.lastRefresh" class="text-[11px] text-slate-600 mb-4">
        最後更新：{{ store.lastRefresh.toLocaleTimeString('zh-TW') }}
        <span v-if="!isTrading" class="ml-2 text-slate-700">（收盤，每 30 分鐘更新一次）</span>
        <span v-else class="ml-2 text-emerald-700">（交易中，每 1 分鐘更新一次）</span>
      </div>

      <!-- 股票卡片 Grid -->
      <div v-if="store.listWithData.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <div
          v-for="({ item, data }, idx) in store.listWithData"
          :key="item.symbol"
          :draggable="dragReady"
          :class="[
            'rounded-2xl transition-all duration-150',
            dragFrom === idx ? 'opacity-40 scale-95' : '',
            dragOver === idx && dragFrom !== idx
              ? 'ring-2 ring-blue-500/60 ring-offset-2 ring-offset-slate-950' : '',
          ]"
          @dragstart="onDragStart($event, idx)"
          @dragover="onDragOver($event, idx)"
          @drop.prevent="onDrop(idx)"
          @dragend="onDragEnd"
        >
          <StockCard
            :item="item"
            :data="data"
            :settings="store.signalSettings"
            @remove="store.removeStock"
            @toggleNotify="store.toggleNotify"
            @changeInterval="store.changeInterval"
            @dragHandleMousedown="onDragHandleMousedown"
          />
        </div>
      </div>

      <!-- 空狀態 -->
      <div v-else class="flex flex-col items-center justify-center py-24 gap-5 text-center">
        <div class="text-6xl">📋</div>
        <div>
          <h2 class="text-lg font-semibold text-slate-300">清單是空的</h2>
          <p class="text-slate-500 text-sm mt-1">點擊「新增股票」開始盯盤</p>
        </div>
        <button
          class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500
                 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20"
          @click="showModal = true"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
          </svg>
          新增第一支股票
        </button>
      </div>
    </main>

    <!-- ══ Footer ══════════════════════════════════════════════════════ -->
    <footer class="border-t border-slate-800/60 py-3 text-center text-[11px] text-slate-700">
      資料來源：{{ DATA_SOURCE_LABEL }} ｜ KD 指標採 9 日 RSV，2/3 平滑計算
      <span class="mx-2">·</span>
      台灣時間 {{ isTrading ? '09:00–13:30 交易' : '非交易時段' }}
    </footer>

    <!-- ══ Add Modal ══════════════════════════════════════════════════ -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <AddStockModal
        v-if="showModal"
        @add="handleAdd"
        @close="showModal = false"
      />
    </Transition>

    <!-- ══ Signal Settings Modal ═══════════════════════════════════════ -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <SignalSettingsModal
        v-if="showSettings"
        :settings="store.signalSettings"
        @update="store.updateSignalSettings"
        @close="showSettings = false"
      />
    </Transition>
  </div>
</template>
