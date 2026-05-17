<template>
 <div class="panel chart-panel">
 <div class="chart-panel-header">
 <span class="chart-panel-icon"> </span>
 <span class="chart-panel-title">Tipo de contrato</span>
 </div>
 <div v-if="items.length" class="donut-row">
 <div v-for="item in items" :key="item.tipo" class="donut-item">
 <div
 class="donut-ring"
 :style="{ background: `conic-gradient(${item.color} 0% ${item.pct}%, var(--border) ${item.pct}% 100%)` }"
 >
 <span class="donut-inner">{{ item.pct }}%</span>
 </div>
 <div class="donut-label" :title="item.tipo">
 {{ truncar(item.tipo, 14) }}
 </div>
 </div>
 </div>
 <p v-else style="color:var(--text3);font-size:12px">Sin datos</p>
 </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLicitacionesStore } from '../../stores/licitaciones.js'

const store = useLicitacionesStore()
const items = computed(() => store.tiposContrato)
function truncar(s, n) { return s.length > n ? s.slice(0, n) + '…' : s }
</script>
