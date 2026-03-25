<script setup lang="ts">
import { ref, computed } from 'vue'
import type { StockData, WatchlistItem, ChartInterval } from '@/types/stock'
import { getSignalLabel, getSignalClasses } from '@/utils/kdCalculator'
import { formatTime } from '@/utils/marketTime'
import { PERIOD_OPTIONS } from '@/services/StockService'
import KDChart from './KDChart.vue'
import StockZoomModal from './StockZoomModal.vue'

const props = defineProps<{
  item: WatchlistItem
  data?: StockData
}>()

const emit = defineEmits<{
  remove: [symbol: string]
  toggleNotify: [symbol: string]
  changeInterval: [symbol: string, interval: ChartInterval]
}>()

const expanded = ref(false)
const zoomed   = ref(false)

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

const lastUpdatedStr = computed(() =>
  props.data?.lastUpdated ? formatTime(props.data.lastUpdated) : ''
)

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
    <div class="p-4 cursor-pointer select-none" @click="expanded = !expanded">

      <!-- 股票代碼 + 名稱 + 刪除 -->
      <div class="flex items-start justify-between gap-2 mb-3">
        <div class="min-w-0 flex items-center gap-2">
          <span class="shrink-0 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded
                       bg-slate-700 text-slate-400">
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
            <span :class="['text-[11px] font-medium border px-1.5 py-0.5 rounded-md',
                          getSignalClasses(data.signal)]">
              {{ getSignalLabel(data.signal) }}
            </span>
          </div>
        </div>
      </template>

      <!-- 尚無資料 -->
      <div v-else class="text-slate-600 text-sm py-3 text-center">尚無資料</div>

      <!-- 週期切換列 -->
      <div class="flex items-center gap-1 mt-3 pt-2 border-t border-slate-700/30">
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

        <div class="ml-auto flex items-center gap-2.5">
          <!-- 放大鏡 -->
          <button
            v-if="data?.quote"
            title="放大檢視"
            class="text-slate-600 hover:text-slate-300 transition-colors"
            @click.stop="zoomed = true"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          </button>

          <button
            :title="item.notifyOnSignal ? '關閉此股通知' : '開啟此股通知'"
            :class="['flex items-center gap-1 text-[11px] transition-colors',
                     item.notifyOnSignal ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400']"
            @click.stop="emit('toggleNotify', item.symbol)"
          >
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10 3.17 10 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
            </svg>
          </button>
          <span v-if="lastUpdatedStr" class="text-[10px] text-slate-600">{{ lastUpdatedStr }}</span>
          <svg
            :class="['w-4 h-4 text-slate-600 transition-transform duration-200',
                     expanded ? 'rotate-180' : '']"
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
          @close="zoomed = false"
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
        <div class="text-[11px] text-slate-500 font-medium mb-2 flex items-center gap-2">
          <span>KD 走勢圖</span>
          <span class="text-slate-700">近 {{ Math.min(data.kd.length, 60) }} 個交易日</span>
          <span class="ml-auto text-slate-700">
            🔴 超買(>80) 　🟡 超賣(<20)
          </span>
        </div>
        <KDChart :kd="data.kd" :days="60" />

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
