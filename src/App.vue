<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useStockStore } from '@/stores/stockStore'
import StockMonitorPage from '@/components/StockMonitorPage.vue'

const store = useStockStore()

onMounted(() => store.initialize())
onUnmounted(() => store.stopAutoRefresh())
</script>

<template>
  <StockMonitorPage />
</template>
