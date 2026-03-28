<script setup lang="ts">
import { computed, ref } from 'vue'
import type { KDValue, SignalSettings } from '@/types/stock'
import { DEFAULT_SIGNAL_SETTINGS } from '@/utils/kdCalculator'
import { formatMMDD } from '@/utils/marketTime'

const props = withDefaults(
  defineProps<{ kd: KDValue[]; days?: number; settings?: SignalSettings; interval?: string; chartH?: number }>(),
  { days: 60, settings: () => DEFAULT_SIGNAL_SETTINGS, interval: '1d', chartH: 180 }
)

// 今日台灣時間日期字串 YYYY-MM-DD
function todayTW(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).slice(0, 10)
}

const data = computed(() => {
  const isIntraday = props.interval.endsWith('m')
  if (isIntraday) {
    // 分鐘線：只顯示今天的 K 棒
    const today = todayTW()
    const todayBars = props.kd.filter(d => d.date.startsWith(today))
    // 若今天沒資料（假日/盤前），顯示最近一個交易日
    if (todayBars.length > 0) return todayBars
    if (!props.kd.length) return []
    const lastDate = props.kd[props.kd.length - 1].date.slice(0, 10)
    return props.kd.filter(d => d.date.startsWith(lastDate))
  }
  return props.kd.slice(-props.days)
})

// SVG layout constants
const W = 580
const H = computed(() => props.chartH)
const PL = 36, PR = 12, PT = 18, PB = 26
const CW = W - PL - PR
const CH = computed(() => H.value - PT - PB)

function xp(i: number): number {
  const n = data.value.length
  return n <= 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW
}
function yp(v: number): number {
  return PT + (1 - v / 100) * CH.value
}

const kPath = computed(() =>
  data.value.map((d, i) => `${i === 0 ? 'M' : 'L'}${xp(i).toFixed(1)},${yp(d.k).toFixed(1)}`).join(' ')
)
const dPath = computed(() =>
  data.value.map((d, i) => `${i === 0 ? 'M' : 'L'}${xp(i).toFixed(1)},${yp(d.d).toFixed(1)}`).join(' ')
)

const y80 = computed(() => yp(80))
const y50 = computed(() => yp(50))
const y20 = computed(() => yp(20))

const lastK = computed(() => data.value.at(-1)?.k ?? 50)
const lastD = computed(() => data.value.at(-1)?.d ?? 50)
const lastX = computed(() => data.value.length > 0 ? xp(data.value.length - 1) : PL)

// X-axis labels: ~6 evenly spaced
const xLabels = computed(() => {
  const arr = data.value
  if (!arr.length) return []
  const step = Math.max(1, Math.floor(arr.length / 5))
  const out: { x: number; label: string }[] = []
  for (let i = 0; i < arr.length; i += step)
    out.push({ x: xp(i), label: formatMMDD(arr[i].date) })
  if (arr.length > 1)
    out.push({ x: xp(arr.length - 1), label: formatMMDD(arr[arr.length - 1].date) })
  return out
})

// J 棒（柱狀圖）：J = 3K - 2D，以 50 為基準線上下延伸
const jBars = computed(() => {
  const arr = data.value
  if (!arr.length) return []
  const n = arr.length
  // 棒寬：最多 6px，最少 1px，自動依資料量縮放
  const barW = Math.max(1, Math.min(6, CW / n - 1))
  const y50 = yp(50)
  return arr.map((d, i) => {
    const j = d.j ?? (3 * d.k - 2 * d.d)  // 沒有 j 欄位時自行計算
    const jClamped = Math.max(-20, Math.min(120, j))  // 顯示範圍稍微超出 0-100
    const yJ  = yp(jClamped)
    const yTop = Math.min(y50, yJ)
    const h    = Math.abs(y50 - yJ)
    // 顏色：J > 80 橘紅，J < 20 綠，其餘紫
    const fill = j > 80 ? '#f97316' : j < 20 ? '#22c55e' : '#a78bfa'
    return { x: xp(i) - barW / 2, y: yTop, w: barW, h: Math.max(0.5, h), fill }
  })
})

// Golden/Death cross markers（套用 SignalSettings 篩選）
const crossMarkers = computed(() => {
  const arr = data.value
  const s = props.settings
  const markers: { x: number; y: number; type: 'golden' | 'death' }[] = []
  for (let i = 1; i < arr.length; i++) {
    const p = arr[i - 1], c = arr[i]
    if (p.k <= p.d && c.k > c.d) {
      const posOk      = s.goldenCrossMaxK === null || c.k < s.goldenCrossMaxK
      const strengthOk = (c.k - c.d) >= s.minKDDiff
      if (posOk && strengthOk)
        markers.push({ x: xp(i), y: yp(c.k), type: 'golden' })
    } else if (p.k >= p.d && c.k < c.d) {
      const posOk      = s.deathCrossMinK === null || c.k > s.deathCrossMinK
      const strengthOk = (c.d - c.k) >= s.minKDDiff
      if (posOk && strengthOk)
        markers.push({ x: xp(i), y: yp(c.k), type: 'death' })
    }
  }
  return markers
})

// ─── Hover tooltip ───────────────────────────────────────────────────────────
const hoveredIdx = ref<number | null>(null)

function onMouseMove(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  const svgX = ((e.clientX - rect.left) / rect.width) * W
  const arr = data.value
  if (!arr.length) return
  let closest = 0, minDist = Infinity
  for (let i = 0; i < arr.length; i++) {
    const dist = Math.abs(xp(i) - svgX)
    if (dist < minDist) { minDist = dist; closest = i }
  }
  hoveredIdx.value = closest
}
function onMouseLeave() { hoveredIdx.value = null }

const tooltip = computed(() => {
  const idx = hoveredIdx.value
  if (idx === null) return null
  const d = data.value[idx]
  if (!d) return null
  const x = xp(idx)
  // tooltip box: 寬 110，高 58；右半邊時往左偏
  const boxW = 120, boxH = 62, margin = 8
  const boxX = x + margin + boxW > W ? x - boxW - margin : x + margin
  const boxY = PT
  return { x, boxX, boxY, boxW, boxH, date: d.date, close: d.close, k: d.k, d: d.d }
})
</script>

<template>
  <div class="w-full">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full cursor-crosshair"
      style="height: auto; min-width: 240px"
      @mousemove="onMouseMove"
      @mouseleave="onMouseLeave"
    >
      <!-- Overbought zone -->
      <rect :x="PL" :y="PT" :width="CW" :height="y80 - PT"
        fill="#f97316" fill-opacity="0.05" />
      <!-- Normal zone -->
      <rect :x="PL" :y="y80" :width="CW" :height="y20 - y80"
        fill="#1e293b" fill-opacity="0.3" />
      <!-- Oversold zone -->
      <rect :x="PL" :y="y20" :width="CW" :height="PT + CH - y20"
        fill="#22c55e" fill-opacity="0.05" />

      <!-- Reference lines -->
      <line :x1="PL" :y1="y80" :x2="PL + CW" :y2="y80"
        stroke="#f97316" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.5" />
      <line :x1="PL" :y1="y50" :x2="PL + CW" :y2="y50"
        stroke="#475569" stroke-width="0.6" stroke-dasharray="2,4" opacity="0.4" />
      <line :x1="PL" :y1="y20" :x2="PL + CW" :y2="y20"
        stroke="#22c55e" stroke-width="0.8" stroke-dasharray="4,3" opacity="0.5" />

      <!-- Y axis labels -->
      <text :x="PL - 4" :y="y80 + 3.5" text-anchor="end" font-size="9" fill="#f97316" opacity="0.7">80</text>
      <text :x="PL - 4" :y="y50 + 3.5" text-anchor="end" font-size="9" fill="#475569">50</text>
      <text :x="PL - 4" :y="y20 + 3.5" text-anchor="end" font-size="9" fill="#22c55e" opacity="0.7">20</text>

      <!-- J 棒（柱狀圖，以 50 為基準線） -->
      <rect v-for="(b, i) in jBars" :key="'j'+i"
        :x="b.x" :y="b.y" :width="b.w" :height="b.h"
        :fill="b.fill" opacity="0.35" rx="0.5" />

      <!-- D line (blue) -->
      <path :d="dPath" fill="none" stroke="#60a5fa" stroke-width="1.4"
        stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />

      <!-- K line (amber) -->
      <path :d="kPath" fill="none" stroke="#fbbf24" stroke-width="1.6"
        stroke-linejoin="round" stroke-linecap="round" />

      <!-- Cross markers -->
      <g v-for="(m, idx) in crossMarkers" :key="idx">
        <circle :cx="m.x" :cy="m.y" r="4"
          :fill="m.type === 'golden' ? '#ef4444' : '#22c55e'"
          fill-opacity="0.2"
          :stroke="m.type === 'golden' ? '#ef4444' : '#22c55e'"
          stroke-width="1.2" />
        <text :x="m.x" :y="m.y - 6" text-anchor="middle" font-size="8"
          :fill="m.type === 'golden' ? '#ef4444' : '#22c55e'">
          {{ m.type === 'golden' ? '金' : '死' }}
        </text>
      </g>

      <!-- Current K/D dots -->
      <circle v-if="data.length" :cx="lastX" :cy="yp(lastK)" r="3" fill="#fbbf24" />
      <circle v-if="data.length" :cx="lastX" :cy="yp(lastD)" r="3" fill="#60a5fa" />

      <!-- X axis labels -->
      <text v-for="lb in xLabels" :key="lb.label + lb.x"
        :x="lb.x" :y="H - 4" text-anchor="middle" font-size="8.5" fill="#475569">
        {{ lb.label }}
      </text>

      <!-- Legend top-left -->
      <line :x1="PL" :y1="PT - 5" :x2="PL + 18" :y2="PT - 5"
        stroke="#fbbf24" stroke-width="1.5" />
      <text :x="PL + 22" :y="PT - 1" font-size="9.5" fill="#fbbf24">
        K {{ lastK.toFixed(1) }}
      </text>
      <line :x1="PL + 72" :y1="PT - 5" :x2="PL + 90" :y2="PT - 5"
        stroke="#60a5fa" stroke-width="1.4" />
      <text :x="PL + 94" :y="PT - 1" font-size="9.5" fill="#60a5fa">
        D {{ lastD.toFixed(1) }}
      </text>

      <!-- ── Hover overlay ── -->
      <g v-if="tooltip">
        <!-- 垂直十字線 -->
        <line
          :x1="tooltip.x" :y1="PT"
          :x2="tooltip.x" :y2="H - PB"
          stroke="#94a3b8" stroke-width="0.8" stroke-dasharray="3,2" opacity="0.7"
        />
        <!-- K dot -->
        <circle
          :cx="tooltip.x"
          :cy="yp(tooltip.k)"
          r="3.5" fill="#fbbf24" stroke="#0f172a" stroke-width="1"
        />
        <!-- D dot -->
        <circle
          :cx="tooltip.x"
          :cy="yp(tooltip.d)"
          r="3.5" fill="#60a5fa" stroke="#0f172a" stroke-width="1"
        />

        <!-- Tooltip box -->
        <rect
          :x="tooltip.boxX" :y="tooltip.boxY"
          :width="tooltip.boxW" :height="tooltip.boxH"
          rx="4" ry="4"
          fill="#1e293b" fill-opacity="0.95"
          stroke="#334155" stroke-width="0.8"
        />
        <!-- 日期 -->
        <text :x="tooltip.boxX + 8" :y="tooltip.boxY + 14"
          font-size="9" fill="#94a3b8">
          {{ tooltip.date.length > 10 ? tooltip.date.slice(5, 16) : tooltip.date }}
        </text>
        <!-- 收盤價 -->
        <text :x="tooltip.boxX + 8" :y="tooltip.boxY + 28"
          font-size="10.5" font-weight="600" fill="#f1f5f9">
          {{ tooltip.close.toFixed(2) }}
        </text>
        <!-- K -->
        <text :x="tooltip.boxX + 8" :y="tooltip.boxY + 44"
          font-size="9.5" fill="#fbbf24">
          K {{ tooltip.k.toFixed(1) }}
        </text>
        <!-- D -->
        <text :x="tooltip.boxX + 60" :y="tooltip.boxY + 44"
          font-size="9.5" fill="#60a5fa">
          D {{ tooltip.d.toFixed(1) }}
        </text>
      </g>
    </svg>
  </div>
</template>
