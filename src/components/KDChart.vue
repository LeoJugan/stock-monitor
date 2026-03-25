<script setup lang="ts">
import { computed } from 'vue'
import type { KDValue } from '@/types/stock'
import { formatMMDD } from '@/utils/marketTime'

const props = withDefaults(
  defineProps<{ kd: KDValue[]; days?: number }>(),
  { days: 60 }
)

const data = computed(() => props.kd.slice(-props.days))

// SVG layout constants
const W = 580, H = 180
const PL = 36, PR = 12, PT = 18, PB = 26
const CW = W - PL - PR
const CH = H - PT - PB

function xp(i: number): number {
  const n = data.value.length
  return n <= 1 ? PL + CW / 2 : PL + (i / (n - 1)) * CW
}
function yp(v: number): number {
  return PT + (1 - v / 100) * CH
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
  // always include last
  if (arr.length > 1)
    out.push({ x: xp(arr.length - 1), label: formatMMDD(arr[arr.length - 1].date) })
  return out
})

// Golden/Death cross markers
const crossMarkers = computed(() => {
  const arr = data.value
  const markers: { x: number; y: number; type: 'golden' | 'death' }[] = []
  for (let i = 1; i < arr.length; i++) {
    const p = arr[i - 1], c = arr[i]
    if (p.k <= p.d && c.k > c.d)
      markers.push({ x: xp(i), y: yp(c.k), type: 'golden' })
    else if (p.k >= p.d && c.k < c.d)
      markers.push({ x: xp(i), y: yp(c.k), type: 'death' })
  }
  return markers
})
</script>

<template>
  <div class="w-full">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full"
      style="height: auto; min-width: 240px"
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
    </svg>
  </div>
</template>
