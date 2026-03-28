<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { TW_STOCK_NAMES } from '@/services/dataService'
import { useStockStore } from '@/stores/stockStore'

const emit = defineEmits<{
  add: [symbol: string, name: string]
  close: []
}>()

const store = useStockStore()

const symbolInput  = ref('')
const nameInput    = ref('')
const error        = ref('')
const showDropdown = ref(false)
const activeIdx    = ref(-1)
const apiResults   = ref<[string, string][]>([])  // [symbol, name]
const searching    = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const QUICK = [
  { s: '2330', n: '台積電' },   { s: '2317', n: '鴻海' },
  { s: '2454', n: '聯發科' },   { s: '2308', n: '台達電' },
  { s: '0050', n: '元大台灣50' },{ s: '0056', n: '元大高股息' },
  { s: '2882', n: '國泰金' },   { s: '2886', n: '兆豐金' },
  { s: '2412', n: '中華電' },   { s: '2303', n: '聯電' },
  { s: '2603', n: '長榮' },     { s: '2609', n: '陽明' },
  { s: '^TWII', n: '加權指數' },
]

// 本地靜態庫（即時顯示，無需等待 API）
const localResults = computed(() => {
  const q = symbolInput.value.trim()
  if (!q) return []
  const ql = q.toLowerCase()
  const entries = Object.entries(TW_STOCK_NAMES)
  const results = entries.filter(([code, name]) =>
    code.toLowerCase().startsWith(ql) || name.includes(q)
  )
  results.sort(([a], [b]) => {
    const aExact = a.toLowerCase().startsWith(ql) ? 0 : 1
    const bExact = b.toLowerCase().startsWith(ql) ? 0 : 1
    return aExact - bExact || a.localeCompare(b)
  })
  return results.slice(0, 8) as [string, string][]
})

// 合併本地 + API（用裸碼去重，API 完整 symbol 優先覆蓋本地裸碼）
const suggestions = computed<[string, string][]>(() => {
  if (!symbolInput.value.trim()) return []

  // 建立 API 的裸碼 → [完整symbol, label] 對照表
  const apiMap = new Map<string, [string, string]>()
  for (const item of apiResults.value) {
    const bare = item[0].replace(/\.TW[O]?$/, '')
    apiMap.set(bare, item)
  }

  const seenBare = new Set<string>()
  const merged: [string, string][] = []

  // 本地結果：若 API 已有相同裸碼，用 API 的完整 symbol（保留 .TWO）
  for (const [code, label] of localResults.value) {
    seenBare.add(code)
    merged.push(apiMap.has(code) ? apiMap.get(code)! : [code, label])
  }

  // API 補充本地沒有的
  for (const item of apiResults.value) {
    const bare = item[0].replace(/\.TW[O]?$/, '')
    if (!seenBare.has(bare)) {
      seenBare.add(bare)
      merged.push(item)
    }
  }

  return merged.slice(0, 10)
})

// 解析 Yahoo Finance quotes 回應成標準格式
function parseQuotes(quotes: any[]): [string, string][] {
  return quotes
    .filter((qt: any) =>
      qt.symbol?.endsWith('.TW') || qt.symbol?.endsWith('.TWO') ||
      qt.symbol?.startsWith('^TW')
    )
    .map((qt: any): [string, string] => {
      const bare = qt.symbol.replace(/\.TW[O]?$/, '')
      const name = TW_STOCK_NAMES[bare] || qt.shortname || qt.longname || qt.symbol
      return [qt.symbol, `${name}（${qt.symbol}）`]
    })
    .slice(0, 8)
}

// 用關鍵字查詢 API（英數）
async function searchAPI(q: string) {
  const trimmed = q.trim()
  if (!trimmed) { apiResults.value = []; return }
  searching.value = true
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
    if (!res.ok) return
    const json = await res.json()
    const quotes: any[] = json?.quotes ?? json?.finance?.result?.quotes ?? []
    apiResults.value = parseQuotes(quotes)
  } catch {
    // 靜默失敗，僅使用本地結果
  } finally {
    searching.value = false
  }
}

// 用裸碼逐一查詢 API，確認 .TW 或 .TWO（中文搜尋後補查）
async function resolveExchanges(bareCodes: string[]) {
  if (!bareCodes.length) return
  searching.value = true
  try {
    const results: [string, string][] = []
    await Promise.all(bareCodes.slice(0, 5).map(async (code) => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(code)}`)
        if (!res.ok) return
        const json = await res.json()
        const quotes: any[] = json?.quotes ?? json?.finance?.result?.quotes ?? []
        const parsed = parseQuotes(quotes).filter(([sym]) =>
          sym.replace(/\.TW[O]?$/, '') === code
        )
        results.push(...parsed)
      } catch { /* 忽略單一失敗 */ }
    }))
    // 合併到 apiResults（不覆蓋已有的）
    const existing = new Set(apiResults.value.map(([s]) => s))
    for (const item of results) {
      if (!existing.has(item[0])) {
        apiResults.value = [...apiResults.value, item]
        existing.add(item[0])
      }
    }
  } finally {
    searching.value = false
  }
}

watch(symbolInput, (q) => {
  activeIdx.value = -1
  apiResults.value = []
  if (debounceTimer) clearTimeout(debounceTimer)

  const isChinese = /[\u4e00-\u9fff]/.test(q.trim())
  if (isChinese) {
    // 中文：本地庫即時顯示，同時用裸碼向 API 確認交易所
    debounceTimer = setTimeout(() => {
      const codes = localResults.value.map(([code]) => code)
      resolveExchanges(codes)
    }, 400)
  } else {
    debounceTimer = setTimeout(() => searchAPI(q), 300)
  }
})

const canSubmit = computed(() => symbolInput.value.trim().length > 0)

function select(s: string, n: string) {
  symbolInput.value = s
  // 用裸碼查中文名（s 可能是 "6568.TWO"，TW_STOCK_NAMES key 是 "6568"）
  const bare = s.replace(/\.TW[O]?$/, '')
  nameInput.value = TW_STOCK_NAMES[bare] ?? n.replace(/（.*）$/, '').trim()
  error.value       = ''
  showDropdown.value = false
  activeIdx.value   = -1
}

function onInput() {
  error.value = ''
  showDropdown.value = true
}

function onBlur() {
  setTimeout(() => { showDropdown.value = false }, 150)
}

function onKeydown(e: KeyboardEvent) {
  if (!showDropdown.value || !suggestions.value.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = Math.min(activeIdx.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = Math.max(activeIdx.value - 1, 0)
  } else if (e.key === 'Enter' && activeIdx.value >= 0) {
    e.preventDefault()
    const [code, name] = suggestions.value[activeIdx.value]
    select(code, name)
  } else if (e.key === 'Escape') {
    showDropdown.value = false
  }
}

function onEnter() {
  // 若鍵盤選了某一項，由 onKeydown 處理；否則直接 submit（會自動套用第一筆）
  if (showDropdown.value && activeIdx.value >= 0) {
    const [code, name] = suggestions.value[activeIdx.value]
    select(code, name)
    return
  }
  showDropdown.value = false
  submit()
}

// 等待 searching 變 false（最多 3 秒）
function waitForSearch(): Promise<void> {
  if (!searching.value) return Promise.resolve()
  return new Promise(resolve => {
    const timeout = setTimeout(resolve, 3000)
    const stop = watch(searching, (val) => {
      if (!val) { stop(); clearTimeout(timeout); resolve() }
    })
  })
}

async function submit() {
  if (!canSubmit.value) { error.value = '請輸入股票代碼'; return }

  // API 還在查詢中（中文搜尋補查交易所）→ 等待完成再提交
  await waitForSearch()

  // 自動套用第一筆建議（此時 suggestions 已含正確的 .TWO）
  if (suggestions.value.length > 0) {
    const [code, name] = suggestions.value[0]
    select(code, name)
  }
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
        <!-- 口袋清單 -->
        <div v-if="store.pocketList.length > 0">
          <div class="flex items-center gap-1.5 text-xs font-medium text-yellow-500 mb-2.5">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            口袋清單
          </div>
          <div class="flex flex-wrap gap-1.5">
            <div
              v-for="p in store.pocketList" :key="p.symbol"
              :class="[
                'group flex items-center gap-1 text-xs rounded-lg border transition-all overflow-hidden',
                symbolInput === p.symbol.replace(/\.TW[O]?$/, '')
                  ? 'border-yellow-500 bg-yellow-500/20'
                  : 'border-yellow-800/50 bg-yellow-900/20 hover:bg-yellow-900/40'
              ]"
            >
              <!-- 選取按鈕 -->
              <button
                class="flex items-center gap-1.5 px-2.5 py-1"
                :class="symbolInput === p.symbol.replace(/\.TW[O]?$/, '')
                  ? 'text-yellow-300 font-semibold'
                  : 'text-yellow-400 hover:text-yellow-300'"
                @click="select(p.symbol, p.name)"
              >
                <span class="font-mono text-yellow-600 text-[10px]">{{ p.symbol.replace(/\.TW[O]?$/, '') }}</span>
                {{ p.name }}
              </button>
              <!-- 移除按鈕 -->
              <button
                class="px-1.5 py-1 text-yellow-800 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                title="從口袋清單移除"
                @click.stop="store.removeFromPocket(p.symbol)"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

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

        <!-- Symbol + autocomplete -->
        <div>
          <label class="block text-xs font-medium text-slate-400 mb-1.5">
            股票代碼 <span class="text-red-400">*</span>
          </label>
          <div class="relative">
            <input
              v-model="symbolInput"
              type="text"
              placeholder="輸入代碼或名稱，例：6547 / 高端疫苗"
              autocomplete="off"
              class="w-full bg-slate-900 border border-slate-600/80 rounded-xl px-3.5 py-2.5
                     text-sm text-slate-100 placeholder-slate-600 font-mono
                     focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
              @input="onInput"
              @keydown="onKeydown"
              @keyup.enter="onEnter"
              @blur="onBlur"
              @focus="showDropdown = suggestions.length > 0"
            />

            <!-- 搜尋中指示 -->
            <div v-if="searching"
                 class="absolute right-3 top-1/2 -translate-y-1/2">
              <svg class="w-4 h-4 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            </div>

            <!-- Dropdown -->
            <div
              v-if="showDropdown && suggestions.length > 0"
              class="absolute z-10 left-0 right-0 mt-1 bg-slate-900 border border-slate-700
                     rounded-xl shadow-2xl overflow-hidden"
            >
              <button
                v-for="([code, name], i) in suggestions"
                :key="code"
                :class="[
                  'w-full flex items-center gap-3 px-3.5 py-2 text-sm text-left transition-colors',
                  i === activeIdx
                    ? 'bg-blue-600/30 text-white'
                    : 'hover:bg-slate-800 text-slate-300'
                ]"
                @mousedown.prevent="select(code, name)"
              >
                <span class="font-mono text-blue-400 w-16 shrink-0">{{ code }}</span>
                <span class="text-slate-200 truncate">{{ name }}</span>
              </button>
            </div>
          </div>
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
            'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2',
            canSubmit
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          ]"
          :disabled="!canSubmit"
          @click="submit">
          <svg v-if="searching" class="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          {{ searching ? '查詢中...' : '加入清單' }}
        </button>
      </div>
    </div>
  </div>
</template>
