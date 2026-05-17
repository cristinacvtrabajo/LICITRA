<template>
 <div class="vue-analytics">
 <!-- Stats cards -->
 <div class="stats-grid">
 <div class="stat-card lime">
 <div class="stat-label"> Total licitaciones</div>
 <div class="stat-value">{{ totalLicitaciones }}</div>
 <div class="stat-sub">registros cargados</div>
 </div>
 <div class="stat-card cyan">
 <div class="stat-label"> Importe total</div>
 <div class="stat-value">{{ formatEUR(importeTotal) }}</div>
 <div class="stat-sub">con IVA</div>
 </div>
 <div class="stat-card purple">
 <div class="stat-label"> Órganos distintos</div>
 <div class="stat-value">{{ organosUnicos }}</div>
 <div class="stat-sub">contratantes</div>
 </div>
 <div class="stat-card orange">
 <div class="stat-label"> Contratos</div>
 <div class="stat-value">{{ contratosAdjudicados }}</div>
 <div class="stat-sub">adjudicados</div>
 </div>
 </div>

 <!-- Filtros -->
 <div class="panel">
 <div class="panel-header">
 <span class="panel-title"> Filtros Vue</span>
 </div>
 <div class="filter-grid">
 <div class="filter-group">
 <label class="filter-label">Buscar órgano</label>
 <input 
 v-model="filtroOrgano" 
 class="filter-input"
 placeholder="Escribe para filtrar..."
 />
 </div>
 <div class="filter-group">
 <label class="filter-label">Importe mínimo</label>
 <input 
 v-model.number="importeMin" 
 type="number"
 class="filter-input"
 placeholder="0"
 />
 </div>
 <div class="filter-group">
 <label class="filter-label">Ordenar por</label>
 <select v-model="ordenPor" class="filter-select">
 <option value="importe">Importe total</option>
 <option value="count">Nº contratos</option>
 <option value="nombre">Nombre (A-Z)</option>
 </select>
 </div>
 </div>
 </div>

 <!-- Tabla de órganos -->
 <div class="panel" style="padding:0">
 <div class="table-toolbar">
 <span class="table-count">
 Mostrando <strong>{{ organosFiltrados.length }}</strong> órganos
 </span>
 <button class="btn btn-primary btn-sm" @click="exportarCSV">
 Exportar CSV
 </button>
 </div>
 <div class="table-scroll">
 <table class="vue-table">
 <thead>
 <tr>
 <th @click="ordenarPor = 'nombre'" style="cursor:pointer">
 Órgano contratante 
 <span v-if="ordenPor === 'nombre'">{{ ordenDir === 'asc' ? '↑' : '↓' }}</span>
 </th>
 <th @click="ordenarPor = 'count'" style="cursor:pointer;text-align:right">
 Contratos 
 <span v-if="ordenPor === 'count'">{{ ordenDir === 'asc' ? '↑' : '↓' }}</span>
 </th>
 <th @click="ordenarPor = 'importe'" style="cursor:pointer;text-align:right">
 Importe total 
 <span v-if="ordenPor === 'importe'">{{ ordenDir === 'asc' ? '↑' : '↓' }}</span>
 </th>
 <th>Importe medio</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="item in organosPaginados" :key="item.organo" @click="verDetalle(item)">
 <td class="org-link" :title="item.organo">
 {{ item.organo }}
 </td>
 <td class="num">
 <span class="badge badge-cyan">{{ item.count }}</span>
 </td>
 <td class="num amount">{{ formatEUR(item.importe) }}</td>
 <td class="num">{{ formatEUR(item.importe / item.count) }}</td>
 </tr>
 <tr v-if="organosFiltrados.length === 0">
 <td colspan="4" class="no-data">
 No hay datos. Carga un archivo en la pestaña "Datos" primero.
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 
 <!-- Paginación -->
 <div class="pagination" v-if="totalPages > 1">
 <span class="page-info">Página {{ currentPage }} de {{ totalPages }}</span>
 <div class="page-btns">
 <button class="page-btn" @click="currentPage--" :disabled="currentPage === 1">‹</button>
 <button 
 v-for="page in visiblePages" 
 :key="page"
 :class="['page-btn', { active: page === currentPage }]"
 @click="currentPage = page"
 v-html="page"
 ></button>
 <button class="page-btn" @click="currentPage++" :disabled="currentPage === totalPages">›</button>
 </div>
 </div>
 </div>

 <!-- Modal de detalle -->
 <div class="modal-overlay" :class="{ open: modalVisible }" @click.self="modalVisible = false">
 <div class="modal">
 <div class="modal-head">
 <div class="modal-title">{{ modalOrgano }}</div>
 <button class="modal-close" @click="modalVisible = false"></button>
 </div>
 <div class="modal-body">
 <div class="detail-grid" v-if="modalContratos.length">
 <div class="detail-section"> Contratos con este órgano</div>
 <div class="detail-item full">
 <table class="organos-table">
 <thead>
 <tr>
 <th>Adjudicatario</th>
 <th style="text-align:right">Contratos</th>
 <th style="text-align:right">Importe total</th>
 </tr>
 </thead>
 <tbody>
 <tr v-for="adj in modalAdjudicatarios" :key="adj.nombre">
 <td>{{ adj.nombre }}</td>
 <td class="num">{{ adj.count }}</td>
 <td class="num amount">{{ formatEUR(adj.importe) }}</td>
 </tr>
 </tbody>
 </table>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
</template>

<script>
export default {
 name: 'VueAnalytics',
 data() {
 return {
 licitaciones: [],
 filtroOrgano: '',
 importeMin: 0,
 ordenPor: 'importe',
 ordenDir: 'desc',
 currentPage: 1,
 pageSize: 15,
 modalVisible: false,
 modalOrgano: '',
 modalContratos: []
 }
 },
 computed: {
 totalLicitaciones() {
 return this.licitaciones.length
 },
 importeTotal() {
 return this.licitaciones.reduce((s, r) => s + (r._importeConIVA || 0), 0)
 },
 organosUnicos() {
 return new Set(this.licitaciones.map(r => r.organo).filter(Boolean)).size
 },
 contratosAdjudicados() {
 return this.licitaciones.filter(r => /adjudicad|formalizado/i.test(r.estado || '')).length
 },
 organosMap() {
 const map = new Map()
 
 this.licitaciones.forEach(r => {
 if (!r.organo) return
 if (this.importeMin > 0 && (r._importeConIVA || 0) < this.importeMin) return
 
 if (!map.has(r.organo)) {
 map.set(r.organo, { organo: r.organo, count: 0, importe: 0, contratos: [] })
 }
 const item = map.get(r.organo)
 item.count++
 item.importe += r._importeConIVA || 0
 item.contratos.push(r)
 })
 
 return map
 },
 organosFiltrados() {
 let items = Array.from(this.organosMap.values())
 
 // Aplicar filtro por nombre
 if (this.filtroOrgano) {
 const term = this.filtroOrgano.toLowerCase()
 items = items.filter(item => item.organo.toLowerCase().includes(term))
 }
 
 // Ordenar
 items.sort((a, b) => {
 let comparison = 0
 if (this.ordenPor === 'importe') comparison = a.importe - b.importe
 else if (this.ordenPor === 'count') comparison = a.count - b.count
 else comparison = a.organo.localeCompare(b.organo, 'es')
 return this.ordenDir === 'asc' ? comparison : -comparison
 })
 
 return items
 },
 totalPages() {
 return Math.ceil(this.organosFiltrados.length / this.pageSize)
 },
 organosPaginados() {
 const start = (this.currentPage - 1) * this.pageSize
 return this.organosFiltrados.slice(start, start + this.pageSize)
 },
 visiblePages() {
 const total = this.totalPages
 const current = this.currentPage
 const pages = []
 
 if (total <= 7) {
 for (let i = 1; i <= total; i++) pages.push(i)
 } else {
 pages.push(1)
 if (current > 3) pages.push('…')
 for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
 if (current < total - 2) pages.push('…')
 pages.push(total)
 }
 return pages
 },
 modalAdjudicatarios() {
 const map = new Map()
 this.modalContratos.forEach(c => {
 const nombre = c.adjudicatario || 'Sin adjudicatario'
 if (!map.has(nombre)) {
 map.set(nombre, { nombre, count: 0, importe: 0 })
 }
 const item = map.get(nombre)
 item.count++
 item.importe += c._importeConIVA || 0
 })
 return Array.from(map.values()).sort((a, b) => b.importe - a.importe)
 }
 },
 watch: {
 filtroOrgano() { this.currentPage = 1 },
 importeMin() { this.currentPage = 1 },
 ordenPor() { this.ordenDir = this.ordenPor === 'nombre' ? 'asc' : 'desc' }
 },
 mounted() {
 // Cargar datos globales
 this.licitaciones = window.allData || []
 
 // Escuchar cambios
 window.addEventListener('dataUpdated', (e) => {
 this.licitaciones = e.detail || window.allData || []
 })
 },
 methods: {
 formatEUR(n) {
 if (!n) return '—'
 return new Intl.NumberFormat('es-ES', {
 style: 'currency', currency: 'EUR', maximumFractionDigits: 0
 }).format(n)
 },
 exportarCSV() {
 const headers = ['Órgano', 'Contratos', 'Importe total']
 const rows = this.organosFiltrados.map(item => [
 item.organo,
 item.count,
 item.importe
 ])
 
 const csv = [headers, ...rows].map(row => row.join(';')).join('\n')
 const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
 const url = URL.createObjectURL(blob)
 const a = document.createElement('a')
 a.href = url
 a.download = 'organos_contratantes.csv'
 a.click()
 URL.revokeObjectURL(url)
 },
 verDetalle(item) {
 this.modalOrgano = item.organo
 this.modalContratos = item.contratos
 this.modalVisible = true
 }
 }
}
</script>

<style scoped>
.vue-analytics {
 animation: fadeIn 0.3s ease;
}

.org-link {
 cursor: pointer;
 color: var(--lime, #1d4ed8);
 font-weight: 500;
 max-width: 300px;
 white-space: nowrap;
 overflow: hidden;
 text-overflow: ellipsis;
}

.org-link:hover {
 text-decoration: underline;
 color: var(--cyan, #0284c7);
}

.stat-card.purple {
 background: linear-gradient(135deg, #8b5cf6, #7c3aed);
}
.stat-card.purple .stat-value {
 color: #c4b5fd;
}

.stat-card.orange {
 background: linear-gradient(135deg, #f97316, #ea580c);
}
.stat-card.orange .stat-value {
 color: #fed7aa;
}

.num {
 text-align: right;
 font-family: 'JetBrains Mono', monospace;
}

.vue-table {
 width: 100%;
 border-collapse: collapse;
}

.vue-table th {
 background: var(--surface2);
 padding: 12px 16px;
 border-bottom: 1px solid var(--border);
 font-family: 'JetBrains Mono', monospace;
 font-size: 11px;
 letter-spacing: 0.5px;
 font-weight: 600;
}

.vue-table td {
 padding: 10px 16px;
 border-bottom: 1px solid var(--border);
 cursor: pointer;
 transition: background 0.15s;
}

.vue-table tr:hover td {
 background: var(--row-hover-bg);
}

@keyframes fadeIn {
 from { opacity: 0; transform: translateY(10px); }
 to { opacity: 1; transform: translateY(0); }
}
</style>