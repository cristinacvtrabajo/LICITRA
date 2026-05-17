<template>
 <div class="panel chart-panel chart-panel--tall">
 <div class="chart-panel-header">
 <span class="chart-panel-icon"> </span>
 <span class="chart-panel-title">Evolución anual de contratos</span>
 </div>
 <div v-if="items.length" class="col-chart-wrap">
 <div class="col-chart-grid-lines">
 <div class="col-grid-mid"></div>
 <div class="col-grid-75"></div>
 <div
 v-for="(item, i) in items"
 :key="item.anio"
 class="col-bar-group"
 >
 <div
 :class="['col-bar', PALETTE[i % PALETTE.length]]"
 :style="{ height: pct(item.count) + '%' }"
 >
 <div class="col-bar-val">{{ item.count }}</div>
 </div>
 </div>
 </div>
 <div class="col-chart-labels">
 <div
 v-for="item in items"
 :key="item.anio"
 class="col-chart-label"
 :title="item.anio"
 >
 {{ item.anio }}
 </div>
 </div>
 </div>
 <p v-else style="color:var(--text3);font-size:12px;padding:10px 0">Sin datos</p>
 </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLicitacionesStore } from '../../stores/licitaciones.js'

const store = useLicitacionesStore()
const items = computed(() => store.evolucionAnual)

const PALETTE = ['col-teal','col-blue1','col-blue2','col-blue3','col-blue4',
 'col-blue5','col-blue6','col-blue7','col-blue8','col-blue9','col-blue10']

const max = computed(() => Math.max(...items.value.map(i => i.count), 1))
function pct(v) { return Math.max(4, Math.round(v / max.value * 100)) }
</script>
