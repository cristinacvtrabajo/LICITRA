<template>
 <div class="panel chart-panel">
 <div class="chart-panel-header">
 <span class="chart-panel-icon"> </span>
 <span class="chart-panel-title">Importe adjudicado por año</span>
 </div>
 <div v-if="items.length" class="importe-anio-chart">
 <div v-for="item in items" :key="item.anio" class="importe-anio-row">
 <div class="importe-anio-label">{{ item.anio }}</div>
 <div class="importe-anio-track">
 <div class="importe-anio-fill" :style="{ width: item.pct + '%' }"></div>
 </div>
 <div class="importe-anio-val">{{ formatEUR(item.importe) }}</div>
 </div>
 </div>
 <p v-else style="color:var(--text3);font-size:12px;padding:10px 0">Sin datos anuales</p>
 </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLicitacionesStore } from '../../stores/licitaciones.js'
import { formatEUR } from '../../stores/licitaciones.js'

const store = useLicitacionesStore()
const items = computed(() => store.importePorAnio)
</script>
