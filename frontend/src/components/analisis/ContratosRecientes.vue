<template>
 <div class="panel" style="grid-column:unset">
 <div class="panel-header">
 <span class="panel-title">Contratos recientes</span>
 </div>
 <div class="timeline">
 <div
 v-for="r in store.contratosRecientes"
 :key="r.id || r.objeto"
 class="timeline-item"
 >
 <div :class="['timeline-dot', dotColor(r.estado)]"></div>
 <div class="timeline-body">
 <div class="timeline-title" :title="r.objeto || ''">
 {{ truncar(r.objeto || 'Sin objeto', 70) }}
 </div>
 <div class="timeline-meta">
 {{ r.organo || '—' }} · {{ r.estado || '—' }} · {{ fecha(r) }}
 </div>
 </div>
 <div v-if="r._importeConIVA" class="timeline-amount">
 {{ formatEUR(r._importeConIVA) }}
 </div>
 </div>
 <p v-if="!store.contratosRecientes.length" style="color:var(--text3);font-size:12px">
 Sin contratos
 </p>
 </div>
 </div>
</template>

<script setup>
import { useLicitacionesStore } from '../../stores/licitaciones.js'
import { formatEUR } from '../../stores/licitaciones.js'

const store = useLicitacionesStore()

function dotColor(estado) {
 if (/adjudicad|formalizado/i.test(estado || '')) return 'lime'
 if (/pendiente/i.test(estado || '')) return 'amber'
 if (/anulad|desistid/i.test(estado || '')) return 'red'
 return 'cyan'
}
function truncar(s, n) { return s.length > n ? s.slice(0, n) + '…' : s }
function fecha(r) { return (r.primeraPublicacion || r.fechaActualizacion || '').slice(0, 10) }
</script>
