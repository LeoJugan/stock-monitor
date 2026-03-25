import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5200,
    proxy: {
      '/api/stock': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          const qs = path.split('?')[1] ?? ''
          const params = new URLSearchParams(qs)
          const symbol   = encodeURIComponent(params.get('symbol')   ?? '')
          const interval = params.get('interval') ?? '1d'
          const range    = params.get('range')    ?? '6mo'
          return `/v8/finance/chart/${symbol}?interval=${interval}&range=${range}&includePrePost=false&events=`
        },
      },
    },
  },
})
