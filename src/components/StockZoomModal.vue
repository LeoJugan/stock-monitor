<script setup lang="ts">
import type { StockData, WatchlistItem } from '@/types/stock'
import { computed } from 'vue'
import { getSignalLabel, getSignalClasses } from '@/utils/kdCalculator'
import { PERIOD_OPTIONS } from '@/services/StockService'
import KDChart from './KDChart.vue'

const props = defineProps<{
  item: WatchlistItem
  data: StockData
}>()

const emit = defineEmits<{ close: [] }>()

const shortCode = computed(() =>
  props.item.symbol.replace(/\.TW[O]?$/, '').replace(/^\^/, '')
)
const displayName = computed(() =>
  props.item.customName || props.data.quote.name || props.item.symbol
)
const isUp    = computed(() => (props.data.quote.change ?? 0) >= 0)
const priceColor  = computed(() => isUp.value ? 'text-red-400' : 'text-emerald-400')
const changeBadge = computed(() => isUp.value
  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20')

const currentKD = computed(() => {
  const arr = props.data.kd
  return arr.length ? arr[arr.length - 1] : null
})

const periodLabel = computed(() =>
  PERIOD_OPTIONS.find(p => p.value === props.item.interval)?.label ?? props.item.interval
)

function formatVolume(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}億`
  if (v >= 1e4) return `${(v / 1e4).toFixed(0)}萬`
  return String(v)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4"
       @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/75 backdrop-blur-sm" @click="emit('close')" />

    <div class="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-slate-800">
        <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-700 text-slate-400 shrink-0">
          {{ shortCode }}
        </span>
        <h2 class="text-base font-bold text-white truncate">{{ displayName }}</h2>
        <span class="text-xs text-slate-600 shrink-0">{{ periodLabel }} 週期</span>
        <button class="ml-auto text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-700"
                @click="emit('close')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="p-5 space-y-4">

        <!-- 價格 + KD -->
        <div class="flex items-center gap-4 flex-wrap">
          <div>
            <div :class="['text-4xl font-bold font-mono leading-none', priceColor]">
              {{ data.quote.price.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </div>
            <div class="text-xs text-slate-600 mt-1">TWD</div>
          </div>
          <div class="flex flex-col gap-1">
            <span :class="['text-sm font-mono px-3 py-1 rounded-lg font-semibold border', changeBadge]">
              {{ isUp ? '+' : '' }}{{ data.quote.changePercent.toFixed(2) }}%
            </span>
            <span :class="['text-sm font-mono text-center', priceColor]">
              {{ isUp ? '+' : '' }}{{ data.quote.change.toFixed(2) }}
            </span>
          </div>
          <div class="ml-auto flex items-center gap-4 bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-2.5">
            <div class="text-center">
              <div class="text-[10px] text-slate-500 mb-0.5">K</div>
              <div class="text-xl font-mono font-bold text-yellow-300">{{ currentKD?.k.toFixed(1) ?? '--' }}</div>
            </div>
            <div class="w-px h-8 bg-slate-700" />
            <div class="text-center">
              <div class="text-[10px] text-slate-500 mb-0.5">D</div>
              <div class="text-xl font-mono font-bold text-blue-400">{{ currentKD?.d.toFixed(1) ?? '--' }}</div>
            </div>
            <div class="w-px h-8 bg-slate-700" />
            <div class="text-center">
              <div class="text-[10px] text-slate-500 mb-0.5">訊號</div>
              <span :class="['text-xs font-medium border px-2 py-0.5 rounded-md', getSignalClasses(data.signal)]">
                {{ getSignalLabel(data.signal) }}
              </span>
            </div>
          </div>
        </div>

        <!-- KD 圖表（放大版） -->
        <div class="bg-slate-800/40 rounded-xl p-3 border border-slate-700/30">
          <div class="text-[11px] text-slate-500 font-medium mb-2 flex items-center gap-2">
            <span>KD 走勢圖</span>
            <span class="text-slate-700">近 {{ Math.min(data.kd.length, 120) }} 根</span>
            <span class="ml-auto text-slate-700">🟡 K線　🔵 D線　🔴 金叉　🟢 死叉</span>
          </div>
          <KDChart :kd="data.kd" :days="120" />
        </div>

        <!-- OHLCV -->
        <div class="grid grid-cols-5 gap-2">
          <div v-for="stat in [
            { label: '開盤', value: data.quote.open.toFixed(2),    color: 'text-slate-300' },
            { label: '最高', value: data.quote.high.toFixed(2),    color: 'text-red-400'     },
            { label: '最低', value: data.quote.low.toFixed(2),     color: 'text-emerald-400' },
            { label: '收盤', value: data.quote.price.toFixed(2),   color: priceColor          },
            { label: '成交量', value: formatVolume(data.quote.volume), color: 'text-slate-400' },
          ]" :key="stat.label"
            class="text-center bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/30">
            <div class="text-[10px] text-slate-600">{{ stat.label }}</div>
            <div :class="['text-sm font-mono font-semibold mt-0.5', stat.color]">{{ stat.value }}</div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
