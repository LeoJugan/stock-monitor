<script setup lang="ts">
import { ref, computed } from 'vue'
import type { StockData, WatchlistItem, ChartInterval, SignalSettings } from '@/types/stock'
import { getSignalLabel, getSignalClasses } from '@/utils/kdCalculator'
import { PERIOD_OPTIONS } from '@/services/dataService'
import { useStockStore } from '@/stores/stockStore'
import KDChart from './KDChart.vue'
import StockZoomModal from './StockZoomModal.vue'
import StockMajorsModal from './StockMajorsModal.vue'

const props = defineProps<{
  item: WatchlistItem
  data?: StockData
  settings?: SignalSettings
}>()

const emit = defineEmits<{
  remove: [symbol: string]
  toggleNotify: [symbol: string]
  changeInterval: [symbol: string, interval: ChartInterval]
  dragHandleMousedown: []
}>()

const store = useStockStore()
const inPocket = computed(() => store.isInPocket(props.item.symbol))

function togglePocket() {
  if (inPocket.value) {
    store.removeFromPocket(props.item.symbol)
  } else {
    const name = props.item.customName || props.data?.quote.name || props.item.symbol
    store.addToPocket(props.item.symbol, name)
  }
}

const expanded     = ref(false)
const zoomed       = ref(false)
const showMajors   = ref(false)

const shortCode = computed(() =>
  props.item.symbol.replace(/\.TW[O]?$/, '').replace(/^\^/, '')
)
const displayName = computed(() =>
  props.item.customName || props.data?.quote.name || props.item.symbol
)

const isUp = computed(() => (props.data?.quote.change ?? 0) >= 0)
const priceColor  = computed(() => isUp.value ? 'text-red-400'           : 'text-emerald-400')
const changeBadge = computed(() => isUp.value
  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')

const currentKD = computed(() => {
  const arr = props.data?.kd
  if (!arr?.length) return null
  return arr[arr.length - 1]
})

const kColor = computed(() => {
  const k = currentKD.value?.k
  if (k == null) return 'text-slate-500'
  if (k > 80) return 'text-orange-400'
  if (k < 20) return 'text-emerald-400'
  return 'text-yellow-300'
})


function formatVolume(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}億`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}萬`
  return String(v)
}
</script>

<template>
  <div
    class="rounded-2xl border border-slate-700/60 bg-slate-800/70 backdrop-blur-sm overflow-hidden
           transition-all duration-200 hover:border-slate-600 hover:bg-slate-800/90 shadow-lg"
  >
    <!-- ── 主要資訊區 ── -->
    <div class="p-4 cursor-pointer select-none" @click="expanded = !expanded" @dblclick.prevent="zoomed = true">

      <!-- 股票代碼 + 名稱 + 刪除 -->
      <div class="flex items-start justify-between gap-2 mb-3">
        <div class="min-w-0 flex items-center gap-2">
          <!-- 拖曳把手 -->
          <div
            class="shrink-0 text-slate-700 hover:text-slate-400 cursor-grab active:cursor-grabbing
                   p-0.5 -ml-1 touch-none transition-colors"
            title="拖曳排序"
            @click.stop
            @mousedown.stop="emit('dragHandleMousedown')"
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="9"  cy="5"  r="1.5"/>
              <circle cx="15" cy="5"  r="1.5"/>
              <circle cx="9"  cy="12" r="1.5"/>
              <circle cx="15" cy="12" r="1.5"/>
              <circle cx="9"  cy="19" r="1.5"/>
              <circle cx="15" cy="19" r="1.5"/>
            </svg>
          </div>
          <span class="shrink-0 font-mono text-sm font-bold px-2 py-0.5 rounded-md
                       bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wide">
            {{ shortCode }}
          </span>
          <span class="text-sm font-semibold text-slate-100 truncate">{{ displayName }}</span>
        </div>
        <button
          class="shrink-0 p-1 -m-1 text-slate-600 hover:text-red-400 transition-colors rounded"
          title="移除"
          @click.stop="emit('remove', item.symbol)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="data?.loading" class="flex items-center gap-2 text-slate-500 text-sm py-3">
        <svg class="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>載入資料中…</span>
      </div>

      <!-- Error -->
      <div v-else-if="data?.error"
        class="text-red-400 text-xs bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
        ⚠️ {{ data.error }}
      </div>

      <!-- 正常資料 -->
      <template v-else-if="data?.quote">
        <!-- 價格列 -->
        <div class="flex items-end justify-between gap-3 mb-3">
          <div>
            <div :class="['text-[26px] font-bold font-mono leading-none', priceColor]">
              {{ data.quote.price.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </div>
            <div class="text-[11px] text-slate-600 mt-0.5">TWD</div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <span :class="['text-xs font-mono px-2 py-0.5 rounded-md font-semibold', changeBadge]">
              {{ isUp ? '+' : '' }}{{ data.quote.changePercent.toFixed(2) }}%
            </span>
            <span :class="['text-xs font-mono', priceColor]">
              {{ isUp ? '+' : '' }}{{ data.quote.change.toFixed(2) }}
            </span>
          </div>
        </div>

        <!-- KD 列 -->
        <div class="flex items-center gap-4 py-2.5 px-3 rounded-xl bg-slate-900/40 border border-slate-700/40">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-500 font-medium">K</span>
            <span :class="['text-sm font-mono font-bold', kColor]">
              {{ currentKD?.k.toFixed(1) ?? '--' }}
            </span>
          </div>
          <div class="w-px h-4 bg-slate-700" />
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-slate-500 font-medium">D</span>
            <span class="text-sm font-mono font-bold text-blue-400">
              {{ currentKD?.d.toFixed(1) ?? '--' }}
            </span>
          </div>
          <div class="ml-auto">
            <span :class="['text-[11px] font-medium border px-1.5 py-0.5 rounded-md whitespace-nowrap',
                          getSignalClasses(data.signal)]">
              {{ getSignalLabel(data.signal) }}
            </span>
          </div>
        </div>
      </template>

      <!-- 尚無資料 -->
      <div v-else class="text-slate-600 text-sm py-3 text-center">尚無資料</div>

      <!-- 底部工具列：整排平均分佈，點任意空白處展開/收合 -->
      <div class="flex items-center justify-between mt-3 pt-2 border-t border-slate-700/30 cursor-pointer select-none"
           @click.stop="expanded = !expanded">

        <!-- 收藏 -->
        <button
          :title="inPocket ? '從口袋清單移除' : '加入口袋清單'"
          :class="['p-1.5 rounded-lg transition-colors',
                   inPocket ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-600 hover:text-yellow-400']"
          @click.stop="togglePocket"
        >
          <svg class="w-3.5 h-3.5" :fill="inPocket ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>

        <!-- 放大鏡 -->
        <button
          v-if="data?.quote"
          title="放大檢視"
          class="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 transition-colors"
          @click.stop="zoomed = true"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
        </button>
        <div v-else class="w-7" />

        <!-- 三大法人 -->
        <button
          title="三大法人買超"
          class="p-1.5 rounded-lg text-slate-600 hover:text-blue-400 transition-colors"
          @click.stop="showMajors = true"
        >
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="2"  y="14" width="4" height="8" rx="1"/>
            <rect x="10" y="8"  width="4" height="14" rx="1"/>
            <rect x="18" y="3"  width="4" height="19" rx="1"/>
          </svg>
        </button>

        <!-- 通知 -->
        <button
          :title="item.notifyOnSignal ? '關閉此股通知' : '開啟此股通知'"
          :class="['p-1.5 rounded-lg transition-colors',
                   item.notifyOnSignal ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-600 hover:text-slate-400']"
          @click.stop="emit('toggleNotify', item.symbol)"
        >
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10 3.17 10 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>
        </button>

        <!-- 展開 / 收合 -->
        <div class="p-1.5 text-slate-600">
          <svg
            :class="['w-4 h-4 transition-transform duration-200', expanded ? 'rotate-180' : '']"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>

    <!-- ── 放大 Modal ── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <StockZoomModal
          v-if="zoomed && data?.quote"
          :item="item"
          :data="data"
          :settings="settings"
          @close="zoomed = false"
          @changeInterval="(sym, iv) => emit('changeInterval', sym, iv)"
        />
      </Transition>
    </Teleport>

    <!-- ── 三大法人 Modal ── -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <StockMajorsModal
          v-if="showMajors"
          :symbol="shortCode"
          :name="displayName"
          @close="showMajors = false"
        />
      </Transition>
    </Teleport>

    <!-- ── 展開：KD 圖表 ── -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 max-h-0"
      enter-to-class="opacity-100 max-h-96"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 max-h-96"
      leave-to-class="opacity-0 max-h-0"
    >
      <div v-if="expanded && data?.kd?.length"
        class="border-t border-slate-700/40 px-3 pb-4 pt-3 bg-slate-900/30 overflow-hidden">
        <!-- 週期切換 -->
        <div class="flex items-center gap-1 mb-2.5">
          <button
            v-for="p in PERIOD_OPTIONS" :key="p.value"
            :class="[
              'text-[11px] px-2 py-0.5 rounded-md transition-all font-medium',
              item.interval === p.value
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-slate-600 hover:text-slate-300 hover:bg-slate-700/50'
            ]"
            @click.stop="emit('changeInterval', item.symbol, p.value)"
          >{{ p.label }}</button>
          <span class="ml-auto text-[10px] text-slate-700">🔴 超買  🟡 超賣</span>
        </div>
        <KDChart :kd="data.kd" :days="60" :settings="settings" :interval="item.interval" />

        <!-- 當日資訊卡 -->
        <div class="grid grid-cols-4 gap-2 mt-3">
          <div v-for="stat in [
            { label: '開盤', value: data.quote.open.toFixed(2), color: 'text-slate-300' },
            { label: '最高', value: data.quote.high.toFixed(2), color: 'text-red-400' },
            { label: '最低', value: data.quote.low.toFixed(2), color: 'text-emerald-400' },
            { label: '成交量', value: formatVolume(data.quote.volume), color: 'text-slate-400' },
          ]" :key="stat.label"
            class="text-center bg-slate-800/60 rounded-lg p-2 border border-slate-700/30">
            <div class="text-[10px] text-slate-600">{{ stat.label }}</div>
            <div :class="['text-xs font-mono font-semibold mt-0.5', stat.color]">{{ stat.value }}</div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
