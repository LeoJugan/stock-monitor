import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fugleKey = env.FUGLE_API_KEY || ''

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5200,
      proxy: {
        // ── Fugle Market Data API ───────────────────────────────────────────
        '/fugle': {
          target: 'https://api.fugle.tw/marketdata/v1.0/stock',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/fugle/, ''),
          headers: { 'X-API-KEY': fugleKey },
        },

        // ── Yahoo Finance（autocomplete 股票搜尋）──────────────────────────
        '/api/search': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => {
            const q = p.split('?')[1] ?? ''
            return `/v1/finance/search?${q}&newsCount=0&quotesCount=8&region=TW&lang=zh-TW`
          },
        },
      },
    },
  }
})
