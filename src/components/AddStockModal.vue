<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{
  add: [symbol: string, name: string]
  close: []
}>()

const symbolInput = ref('')
const nameInput   = ref('')
const error       = ref('')

const QUICK = [
  { s: '2330', n: '台積電' },   { s: '2317', n: '鴻海' },
  { s: '2454', n: '聯發科' },   { s: '2308', n: '台達電' },
  { s: '0050', n: '元大台灣50' },{ s: '0056', n: '元大高股息' },
  { s: '2882', n: '國泰金' },   { s: '2886', n: '兆豐金' },
  { s: '2412', n: '中華電' },   { s: '2303', n: '聯電' },
  { s: '2603', n: '長榮' },     { s: '2609', n: '陽明' },
  { s: '^TWII', n: '加權指數' },
]

const canSubmit = computed(() => symbolInput.value.trim().length > 0)

function select(s: string, n: string) {
  symbolInput.value = s
  nameInput.value   = n
  error.value       = ''
}

function submit() {
  if (!canSubmit.value) { error.value = '請輸入股票代碼'; return }
  error.value = ''
  emit('add', symbolInput.value.trim(), nameInput.value.trim())
}
</script>

<template>
  <!-- Backdrop -->
  <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
       @click.self="emit('close')">
    <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')" />

    <!-- Panel -->
    <div class="relative w-full max-w-lg bg-slate-800 border border-slate-700/80
                rounded-2xl shadow-2xl overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-700/50">
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <span class="text-xl">＋</span> 新增股票
        </h2>
        <button class="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-700"
                @click="emit('close')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="p-5 space-y-5">
        <!-- Quick pick -->
        <div>
          <div class="text-xs font-medium text-slate-500 mb-2.5">快速選擇</div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="q in QUICK" :key="q.s"
              :class="[
                'text-xs px-2.5 py-1 rounded-lg border transition-all',
                symbolInput === q.s
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                  : 'border-slate-700 bg-slate-700/40 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              ]"
              @click="select(q.s, q.n)"
            >{{ q.n }}</button>
          </div>
        </div>

        <!-- Symbol -->
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1.5">
            股票代碼 <span class="text-red-400">*</span>
          </label>
          <input
            v-model="symbolInput"
            type="text"
            placeholder="例：2330　0050　^TWII　6505.TWO"
            class="w-full bg-slate-900 border border-slate-600/80 rounded-xl px-3.5 py-2.5
                   text-sm text-slate-100 placeholder-slate-600 font-mono
                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            @keyup.enter="submit"
            @input="error = ''"
          />
          <p class="text-[11px] text-slate-600 mt-1.5">
            上市加 <code class="text-slate-500">.TW</code>，上櫃加
            <code class="text-slate-500">.TWO</code>（未填自動補 .TW）
          </p>
          <p v-if="error" class="text-red-400 text-xs mt-1">{{ error }}</p>
        </div>

        <!-- Custom name -->
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1.5">
            自訂顯示名稱 <span class="text-slate-600 font-normal">（選填，留空自動抓取）</span>
          </label>
          <input
            v-model="nameInput"
            type="text"
            placeholder="例：我的台積電"
            class="w-full bg-slate-900 border border-slate-600/80 rounded-xl px-3.5 py-2.5
                   text-sm text-slate-100 placeholder-slate-600
                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            @keyup.enter="submit"
          />
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
          :class="[
            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors',
            canSubmit
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          ]"
          :disabled="!canSubmit"
          @click="submit">
          加入清單
        </button>
      </div>
    </div>
  </div>
</template>
