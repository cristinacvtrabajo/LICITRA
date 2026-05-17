<template>
 <div class="panel chart-panel">
 <div class="chart-panel-header">
 <span class="chart-panel-icon">{{ icono }}</span>
 <span class="chart-panel-title">{{ titulo }}</span>
 </div>
 <div v-if="items.length" class="vbar-chart">
 <div v-for="item in items" :key="item.label" class="vbar-row">
 <div class="vbar-label" :title="item.label">{{ item.label }}</div>
 <div class="vbar-track">
 <div :class="['vbar-fill', item.colorKey]" :style="{ width: item.pct + '%' }"></div>
 </div>
 <div class="vbar-val">{{ item.value }} contratos</div>
 </div>
 </div>
 <p v-else style="color:var(--text3);font-size:12px">Sin datos</p>
 </div>
</template>

<script setup>
defineProps({
 items: { type: Array, required: true },
 titulo: { type: String, required: true },
 icono: { type: String, default: ' ' }
})
</script>
