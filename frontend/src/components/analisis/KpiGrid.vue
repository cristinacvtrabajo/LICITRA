<template>
 <div class="kpi-grid">
 <div v-for="kpi in store.kpisCards" :key="kpi.label" class="kpi-card">
 <div class="kpi-label">{{ kpi.label }}</div>
 <div :class="['kpi-value', kpi.color]">{{ kpi.value }}</div>
 <div class="kpi-sub">{{ kpi.sub }}</div>
 </div>
 </div>
</template>

<script setup>
import { useLicitacionesStore } from '../../stores/licitaciones.js'
const store = useLicitacionesStore()
</script>
