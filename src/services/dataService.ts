/// <reference types="vite/client" />

/**
 * 統一資料服務入口
 *
 * 本地 dev  (VITE_DATA_SOURCE=fugle) → FugleService（即時）
 * Vercel    (VITE_DATA_SOURCE=yahoo) → StockService Yahoo Finance（延遲 15 分）
 *
 * 切換方式：
 *   .env.local       → VITE_DATA_SOURCE=fugle
 *   .env.production  → VITE_DATA_SOURCE=yahoo
 */

import * as FugleService from './FugleService'
import * as StockService from './StockService'

const isFugle = import.meta.env.VITE_DATA_SOURCE === 'fugle'

const svc = isFugle ? FugleService : StockService

export const fetchStockData  = svc.fetchStockData
export const normalizeSymbol = svc.normalizeSymbol
export const PERIOD_OPTIONS  = svc.PERIOD_OPTIONS
export const TW_STOCK_NAMES  = svc.TW_STOCK_NAMES

/** 目前使用的資料來源名稱（顯示用） */
export const DATA_SOURCE_LABEL = isFugle ? 'Fugle（即時）' : 'Yahoo Finance'
