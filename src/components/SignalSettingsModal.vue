<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { SignalSettings } from '@/types/stock'

const props = defineProps<{ settings: SignalSettings }>()
const emit  = defineEmits<{
  update: [patch: Partial<SignalSettings>]
  close: []
}>()

// 本地副本，即時預覽
const local = reactive<SignalSettings>({ ...props.settings })
watch(() => props.settings, s => Object.assign(local, s), { deep: true })

function apply() {
  emit('update', { ...local })
  emit('close')
}

// ── 選項定義 ─────────────────────────────────────────────────────────────────

const POSITION_OPTIONS_GOLDEN = [
  { label: '不限位置', value: null },
  { label: 'K < 20（深度超賣）', value: 20 },
  { label: 'K < 30', value: 30 },
  { label: 'K < 50（低檔）', value: 50 },
]

const POSITION_OPTIONS_DEATH = [
  { label: '不限位置', value: null },
  { label: 'K > 50（高檔）', value: 50 },
  { label: 'K > 70', value: 70 },
  { label: 'K > 80（深度超買）', value: 80 },
]

const STRENGTH_OPTIONS = [
  { label: '不限（0）', value: 0 },
  { label: '差距 ≥ 1', value: 1 },
  { label: '差距 ≥ 2', value: 2 },
  { label: '差距 ≥ 3', value: 3 },
  { label: '差距 ≥ 5', value: 5 },
]

const WARN_GAP_OPTIONS = [
  { label: '關閉', value: 0 },
  { label: '差距 ≤ 3', value: 3 },
  { label: '差距 ≤ 5', value: 5 },
  { label: '差距 ≤ 8', value: 8 },
  { label: '差距 ≤ 10', value: 10 },
]

const REFRESH_TRADING_OPTIONS = [
  { label: '30 秒', value: 30_000 },
  { label: '1 分鐘', value: 60_000 },
  { label: '2 分鐘', value: 120_000 },
  { label: '5 分鐘', value: 300_000 },
]

const REFRESH_CLOSED_OPTIONS = [
  { label: '10 分鐘', value: 600_000 },
  { label: '30 分鐘', value: 1_800_000 },
  { label: '1 小時', value: 3_600_000 },
  { label: '3 小時', value: 10_800_000 },
]
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4"
       @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

    <div class="relative w-full max-w-md bg-slate-800 border border-slate-700/80 rounded-2xl shadow-2xl">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700/50">
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          KD 訊號條件設定
        </h2>
        <button class="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-700"
                @click="emit('close')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="p-5 space-y-6 overflow-y-auto max-h-[65vh]">

        <!-- 更新頻率 -->
        <div class="space-y-3">
          <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">更新頻率</div>

          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span class="text-sm text-slate-300">交易時段</span>
              <span class="text-xs text-slate-600">09:00–13:30</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in REFRESH_TRADING_OPTIONS" :key="opt.value"
                :class="[
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  local.refreshTradingMs === opt.value
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                ]"
                @click="local.refreshTradingMs = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>

          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-slate-500"></span>
              <span class="text-sm text-slate-300">收盤後</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in REFRESH_CLOSED_OPTIONS" :key="opt.value"
                :class="[
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  local.refreshClosedMs === opt.value
                    ? 'border-slate-400/50 bg-slate-500/15 text-slate-300'
                    : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                ]"
                @click="local.refreshClosedMs = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
        </div>

        <!-- 說明 -->
        <p class="text-xs text-slate-500 bg-slate-900/40 rounded-xl px-3 py-2.5 leading-relaxed">
          條件設定會套用到所有股票。只有同時符合<span class="text-slate-300">位置條件</span>與
          <span class="text-slate-300">強度條件</span>的交叉，才會觸發通知。
        </p>

        <!-- 位置條件 -->
        <div class="space-y-4">
          <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">位置條件</div>

          <!-- 黃金交叉 -->
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-red-400"></span>
              <span class="text-sm text-slate-300">黃金交叉</span>
              <span class="text-xs text-slate-600">需在低檔才觸發</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in POSITION_OPTIONS_GOLDEN" :key="String(opt.value)"
                :class="[
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  local.goldenCrossMaxK === opt.value
                    ? 'border-red-500/50 bg-red-500/15 text-red-300'
                    : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                ]"
                @click="local.goldenCrossMaxK = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- 死亡交叉 -->
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span class="text-sm text-slate-300">死亡交叉</span>
              <span class="text-xs text-slate-600">需在高檔才觸發</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in POSITION_OPTIONS_DEATH" :key="String(opt.value)"
                :class="[
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  local.deathCrossMinK === opt.value
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                ]"
                @click="local.deathCrossMinK = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
        </div>

        <!-- 分隔線 -->
        <div class="border-t border-slate-700/50" />

        <!-- 強度條件 -->
        <div class="space-y-3">
          <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">強度條件</div>
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm text-slate-300">交叉後 K 與 D 差距</span>
              <span class="text-xs text-slate-600">越大代表訊號越強</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in STRENGTH_OPTIONS" :key="opt.value"
                :class="[
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  local.minKDDiff === opt.value
                    ? 'border-blue-500/50 bg-blue-500/15 text-blue-300'
                    : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                ]"
                @click="local.minKDDiff = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
        </div>

        <!-- 分隔線 -->
        <div class="border-t border-slate-700/50" />

        <!-- 交叉預警 -->
        <div class="space-y-3">
          <div class="text-xs font-semibold text-slate-400 uppercase tracking-wider">交叉預警</div>
          <div>
            <div class="flex items-center gap-2 mb-2">
              <span class="text-sm text-slate-300">即將交叉偵測門檻</span>
              <span class="text-xs text-slate-600">連續 3 根收斂且差距小於門檻</span>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="opt in WARN_GAP_OPTIONS" :key="opt.value"
                :class="[
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  local.crossWarnGap === opt.value
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-300'
                    : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                ]"
                @click="local.crossWarnGap = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>

          <!-- 推播通知開關 -->
          <div class="flex items-center justify-between pt-1">
            <div>
              <div class="text-sm text-slate-300">瀏覽器推播通知</div>
              <div class="text-xs text-slate-600 mt-0.5">預警訊號同時發送推播（需開啟全域通知）</div>
            </div>
            <button
              :class="[
                'relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none',
                local.notifyOnWarn ? 'bg-emerald-500' : 'bg-slate-600'
              ]"
              @click="local.notifyOnWarn = !local.notifyOnWarn"
            >
              <span
                :class="['absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                         local.notifyOnWarn ? 'left-6' : 'left-1']"
              />
            </button>
          </div>
        </div>

        <!-- 目前條件預覽 -->
        <div class="text-xs bg-slate-900/60 rounded-xl px-3 py-2.5 space-y-1 text-slate-500">
          <div class="text-slate-400 font-medium mb-1.5">目前設定摘要</div>
          <div>
            🔺 黃金交叉：K 向上穿越 D
            <span v-if="local.goldenCrossMaxK !== null" class="text-yellow-500/80">
              且 K &lt; {{ local.goldenCrossMaxK }}
            </span>
            <span v-if="local.minKDDiff > 0" class="text-blue-500/80">
              且差距 ≥ {{ local.minKDDiff }}
            </span>
          </div>
          <div>
            🔻 死亡交叉：K 向下穿越 D
            <span v-if="local.deathCrossMinK !== null" class="text-yellow-500/80">
              且 K &gt; {{ local.deathCrossMinK }}
            </span>
            <span v-if="local.minKDDiff > 0" class="text-blue-500/80">
              且差距 ≥ {{ local.minKDDiff }}
            </span>
          </div>
          <div>
            ⚡ 即將交叉：
            <span v-if="local.crossWarnGap > 0" class="text-rose-400/80">
              K-D 差距 ≤ {{ local.crossWarnGap }} 且連續 3 根收斂
            </span>
            <span v-else class="text-slate-600">已關閉</span>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex gap-3 px-5 pb-5">
        <button
          class="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors"
          @click="emit('close')">
          取消
        </button>
        <button
          class="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-blue-500/20"
          @click="apply">
          套用設定
        </button>
      </div>
    </div>
  </div>
</template>
