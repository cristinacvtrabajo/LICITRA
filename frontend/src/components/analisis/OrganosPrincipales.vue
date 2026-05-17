<template>
 <div class="panel" style="grid-column:unset">
 <div class="panel-header">
 <span class="panel-title">Órganos contratantes</span>
 </div>
 <table class="organos-table">
 <thead>
 <tr>
 <th>Órgano</th>
 <th style="text-align:right">Contratos</th>
 <th style="text-align:right">Importe</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in store.organosPrincipales" :key="item.organo">
 <td :title="item.organo">{{ truncar(item.organo, 42) }}</td>
 <td class="num"><span class="pill">{{ item.count }}</span></td>
 <td class="num">{{ formatEUR(item.importe) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
</template>

<script setup>
import { useLicitacionesStore } from '../../stores/licitaciones.js'
import { formatEUR } from '../../stores/licitaciones.js'

const store = useLicitacionesStore()
function truncar(s, n) { return s.length > n ? s.slice(0, n) + '…' : s }
</script>
