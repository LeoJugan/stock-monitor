/**
 * 從 TWSE / TPEx 公開 API 抓取全部上市上櫃股票中文簡稱
 * 輸出至 src/data/stockNames.ts
 *
 * 用法：node scripts/fetchStockNames.mjs
 */

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT   = resolve(__dir, '../src/data/stockNames.ts')

// ── 抓資料 ──────────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

console.log('📡 抓取上市公司 (TWSE)…')
const twse = await fetchJSON('https://openapi.twse.com.tw/v1/opendata/t187ap03_L')

console.log('📡 抓取上市每日行情（含 ETF）(TWSE)…')
const twseDay = await fetchJSON('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')

console.log('📡 抓取上櫃公司 (TPEx)…')
const tpex = await fetchJSON('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O')

console.log('📡 抓取上櫃每日行情（含 ETF）(TPEx)…')
const tpexDay = await fetchJSON('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes').catch(() => [])

// ── 整理資料 ────────────────────────────────────────────────────────────
const map = new Map()

// 每日行情（ETF + 股票）—— 先放，會被後面簡稱覆蓋
for (const row of twseDay) {
  const code = (row['Code'] ?? '').trim()
  const name = (row['Name'] ?? '').trim()
  if (code && name) map.set(code, name)
}
for (const row of tpexDay) {
  const code = (row['SecuritiesCompanyCode'] ?? row['代號'] ?? '').trim()
  const name = (row['CompanyName'] ?? row['名稱'] ?? '').trim()
  if (code && name) map.set(code, name)
}

// 公司簡稱（較準確）覆蓋行情名稱
for (const row of twse) {
  const code = (row['公司代號'] ?? '').trim()
  const name = (row['公司簡稱'] ?? '').trim()
  if (code && name) map.set(code, name)
}
for (const row of tpex) {
  const code = (row['SecuritiesCompanyCode'] ?? '').trim()
  const name = (row['CompanyAbbreviation'] ?? '').trim()
  if (code && name) map.set(code, name)
}

// 依代碼排序
const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-TW'))

console.log(`✅ 共 ${sorted.length} 支股票`)

// ── 輸出 TypeScript ─────────────────────────────────────────────────────
const lines = sorted.map(([code, name]) => `  '${code}': '${name}',`)

const content = `// 自動產生 — 請勿手動修改，執行 node scripts/fetchStockNames.mjs 更新
// 最後更新：${new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
// 上市 + 上櫃共 ${sorted.length} 支

export const TW_STOCK_NAMES: Record<string, string> = {
${lines.join('\n')}
}
`

mkdirSync(resolve(__dir, '../src/data'), { recursive: true })
writeFileSync(OUT, content, 'utf-8')
console.log(`📄 已寫入 ${OUT}`)
