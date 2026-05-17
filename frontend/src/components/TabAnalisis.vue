<template>
 <div>
 <!-- Estado vacío -->
 <div v-if="!store.tienedatos" id="analysisEmpty" class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Carga un archivo para ver el análisis</div>
 <div class="empty-sub">Los gráficos y estadísticas aparecerán aquí</div>
 </div>

 <div v-else id="analysisContent">
 <!-- Selector de empresa -->
 <EmpresaCombo />

 <!-- Sin empresa seleccionada -->
 <div v-if="!store.empresaSeleccionada" class="empresa-empty">
 Selecciona una empresa para ver su ficha completa
 </div>

 <!-- Dashboard empresa -->
 <Transition name="fade">
 <div v-if="store.empresaSeleccionada && store.kpis" id="empresaDashboard">

 <!-- Hero -->
 <div class="empresa-hero">
 <div class="empresa-info">
 <div class="empresa-name">{{ store.nombreEmpresaMostrado }}</div>
 <div class="empresa-meta">{{ store.metaEmpresa }}</div>
 </div>
 <div class="empresa-badge">{{ formatEUR(store.kpis.importeTotal) }} total adj.</div>
 </div>

 <!-- KPIs -->
 <KpiGrid style="margin:16px 0" />

 <!-- Fila: timeline + órganos -->
 <div class="analysis-grid" style="margin-bottom:16px">
 <ContratosRecientes />
 <OrganosPrincipales />
 </div>

 <!-- Fila: col chart + donuts -->
 <div class="charts-main-row" style="margin-bottom:14px">
 <ColChart />
 <DonutTipos />
 </div>

 <!-- Fila: estados + rangos -->
 <div class="charts-bottom-grid" style="margin-bottom:14px">
 <VBarChart :items="store.estadosContrato" titulo="Estado de contratos" icono=" " />
 <VBarChart :items="store.rangosImporte" titulo="Rangos de importe" icono=" " />
 </div>

 <!-- Fila: procedimientos + importe por año -->
 <div class="charts-bottom-grid">
 <VBarChart :items="store.procedimientos" titulo="Top procedimientos" icono=" " />
 <ImportePorAnio />
 </div>

 </div>
 </Transition>
 </div>
 </div>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useLicitacionesStore } from '../stores/licitaciones.js'
import { formatEUR } from '../stores/licitaciones.js'

import EmpresaCombo from './analisis/EmpresaCombo.vue'
import KpiGrid from './analisis/KpiGrid.vue'
import ContratosRecientes from './analisis/ContratosRecientes.vue'
import OrganosPrincipales from './analisis/OrganosPrincipales.vue'
import ColChart from './analisis/ColChart.vue'
import DonutTipos from './analisis/DonutTipos.vue'
import VBarChart from './analisis/VBarChart.vue'
import ImportePorAnio from './analisis/ImportePorAnio.vue'

const store = useLicitacionesStore()

// Recibir datos del vanilla JS cuando se cargue un archivo
function onDataUpdated(e) {
 store.cargarDatos(e.detail || window.allData || [])
}

onMounted(() => {
 // Cargar datos ya disponibles al montar
 if (window.allData?.length) store.cargarDatos(window.allData)
 window.addEventListener('dataUpdated', onDataUpdated)
})

onUnmounted(() => {
 window.removeEventListener('dataUpdated', onDataUpdated)
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(8px); }
</style>
