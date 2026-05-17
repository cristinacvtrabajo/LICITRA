import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useLicitacionesStore = defineStore('licitaciones', () => {
 // Estado 
 const datos = ref([])
 const empresaSeleccionada = ref(null) // clave canónica agrupada

 // Getters 
 const tienedatos = computed(() => datos.value.length > 0)

 // Mapa de grupos: clave canónica → { nombre, count, importe, variantes[], registros[] }
 const gruposEmpresa = computed(() => {
 const map = new Map()
 datos.value.forEach(r => {
 const raw = r.adjudicatario
 if (!raw) return
 const clave = claveCanonica(raw)
 if (!map.has(clave)) {
 map.set(clave, {
 nombre: elegirNombreCanónico(raw),
 clave,
 count: 0,
 importe: 0,
 variantes: new Set(),
 registros: []
 })
 }
 const g = map.get(clave)
 g.count++
 g.importe += r._importeConIVA || 0
 g.variantes.add(raw.trim())
 g.registros.push(r)
 })
 return map
 })

 // Lista ordenada alfabéticamente por defecto
 const empresasOrdenadas = computed(() => {
 return [...gruposEmpresa.value.values()]
 .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
 })

 const datosEmpresa = computed(() => {
 if (!empresaSeleccionada.value) return []
 const g = gruposEmpresa.value.get(empresaSeleccionada.value)
 return g ? g.registros : []
 })

 // KPIs 
 const kpis = computed(() => {
 const data = datosEmpresa.value
 if (!data.length) return null
 const totalImporte = data.reduce((s, r) => s + (r._importeConIVA || 0), 0)
 const totalContratos = data.length
 const organos = [...new Set(data.map(r => r.organo).filter(Boolean))]
 const importeMax = Math.max(...data.map(r => r._importeConIVA || 0))
 const importeMedio = totalImporte / totalContratos
 const isPyme = data.some(r => /s[ií]|yes|true/i.test(r.esPyme || ''))
 const adjCount = data.filter(r => /adjudicad|formalizado/i.test(r.estado || '')).length
 const tasaExito = totalContratos > 0 ? Math.round(adjCount / totalContratos * 100) : 0
 const NIF_PLACEHOLDER = /^(nif|cif|nie|id|identificador|-)$/i
 const nifCounts = {}
 data.forEach(r => {
 const v = String(r.idAdjudicatario || '').trim()
 if (v && !NIF_PLACEHOLDER.test(v) && v !== 'null' && v !== 'undefined' && v !== '0')
 nifCounts[v] = (nifCounts[v] || 0) + 1
 })
 const nif = Object.entries(nifCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
 return { totalContratos, totalImporte, importeMedio, importeMax, organosCount: organos.length, isPyme, adjCount, tasaExito, nif, importeTotal: totalImporte }
 })

 const metaEmpresa = computed(() => {
 const k = kpis.value
 if (!k) return ''
 const g = gruposEmpresa.value.get(empresaSeleccionada.value)
 const parts = []
 if (k.nif) parts.push('NIF: ' + k.nif)
 parts.push(k.organosCount + ' órgano' + (k.organosCount !== 1 ? 's' : '') + ' contratante' + (k.organosCount !== 1 ? 's' : ''))
 if (k.isPyme) parts.push('PYME')
 if (g && g.variantes.size > 1) parts.push(g.variantes.size + ' variantes de nombre')
 return parts.join(' · ')
 })

 const nombreEmpresaMostrado = computed(() => {
 if (!empresaSeleccionada.value) return ''
 return gruposEmpresa.value.get(empresaSeleccionada.value)?.nombre || empresaSeleccionada.value
 })

 const kpisCards = computed(() => {
 const k = kpis.value
 if (!k) return []
 const anioMax = anioMasActivo.value
 const cards = [
 { label: 'Contratos totales', value: k.totalContratos.toLocaleString('es-ES'), color: 'blue', sub: 'registros en BBDD' },
 { label: 'Importe total', value: formatEUR(k.totalImporte), color: 'blue', sub: 'adjudicado con IVA' },
 { label: 'Importe medio', value: formatEUR(k.importeMedio), color: 'cyan', sub: 'por contrato' },
 { label: 'Contrato más alto', value: formatEUR(k.importeMax), color: '', sub: 'importe máximo' },
 { label: 'Órganos únicos', value: k.organosCount, color: '', sub: 'administraciones' },
 { label: 'PYME', value: k.isPyme ? 'Sí' : 'No', color: k.isPyme ? 'blue' : 'amber', sub: 'clasificación' },
 { label: 'Adj. / Total', value: k.adjCount + ' / ' + k.totalContratos, color: '', sub: k.tasaExito + '% adjudicado' },
 ]
 if (anioMax) cards.push({ label: 'Año más activo', value: anioMax.anio, color: 'cyan', sub: anioMax.count + ' contratos' })
 return cards
 })

 // Charts 
 const evolucionAnual = computed(() => {
 const porAnio = {}
 datosEmpresa.value.forEach(r => {
 const y = (r.primeraPublicacion || r.fechaActualizacion || '').slice(0, 4)
 if (y && /^20\d\d$/.test(y)) porAnio[y] = (porAnio[y] || 0) + 1
 })
 return Object.keys(porAnio).sort().map(y => ({ anio: y, count: porAnio[y] }))
 })

 const importePorAnio = computed(() => {
 const imp = {}
 datosEmpresa.value.forEach(r => {
 const y = (r.primeraPublicacion || r.fechaActualizacion || '').slice(0, 4)
 if (y && /^20\d\d$/.test(y)) imp[y] = (imp[y] || 0) + (r._importeConIVA || 0)
 })
 const anios = Object.keys(imp).sort()
 const max = Math.max(...Object.values(imp), 1)
 return anios.map(y => ({ anio: y, importe: imp[y], pct: Math.max(4, Math.round(imp[y] / max * 100)) }))
 })

 const anioMasActivo = computed(() => {
 const e = evolucionAnual.value
 return e.length ? e.reduce((best, cur) => cur.count > best.count ? cur : best, e[0]) : null
 })

 const tiposContrato = computed(() => {
 const map = {}
 const total = datosEmpresa.value.length
 datosEmpresa.value.forEach(r => { const t = r.tipoContrato || 'Otro'; map[t] = (map[t] || 0) + 1 })
 const COLORS = ['#2563eb', '#0284c7', '#0d9488', '#7c3aed', '#4f46e5']
 return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
 .map(([tipo, count], i) => ({ tipo, count, pct: Math.round(count / total * 100), color: COLORS[i] || '#2563eb' }))
 })

 const estadosContrato = computed(() => {
 const map = {}
 datosEmpresa.value.forEach(r => { const e = r.estado || 'Desconocido'; map[e] = (map[e] || 0) + 1 })
 const COLOR_KEY = { 'Adjudicada': 'blue1', 'Adjudicado': 'blue1', 'Formalizado': 'teal', 'Pendiente': 'amber', 'Resuelta': 'blue2', 'Anulado': 'red', 'Desistido': 'red' }
 const items = Object.entries(map).sort((a, b) => b[1] - a[1])
 const max = Math.max(...items.map(([, v]) => v), 1)
 return items.map(([label, value]) => ({ label, value, colorKey: COLOR_KEY[label] || 'slate', pct: Math.max(4, Math.round(value / max * 100)) }))
 })

 const rangosImporte = computed(() => {
 const RANGOS = [
 { label: '< 10k €', min: 0, max: 10000, colorKey: 'teal' },
 { label: '10k – 50k €', min: 10000, max: 50000, colorKey: 'blue1' },
 { label: '50k – 100k €', min: 50000, max: 100000, colorKey: 'blue2' },
 { label: '100k – 500k €', min: 100000, max: 500000, colorKey: 'blue3' },
 { label: '500k – 1M €', min: 500000, max: 1000000, colorKey: 'amber' },
 { label: '> 1M €', min: 1000000, max: Infinity, colorKey: 'red' },
 ]
 const data = datosEmpresa.value
 const items = RANGOS.map(r => ({ label: r.label, colorKey: r.colorKey, value: data.filter(d => (d._importeConIVA || 0) > r.min && (d._importeConIVA || 0) <= r.max).length })).filter(r => r.value > 0)
 const max = Math.max(...items.map(i => i.value), 1)
 return items.map(i => ({ ...i, pct: Math.max(4, Math.round(i.value / max * 100)) }))
 })

 const procedimientos = computed(() => {
 const map = {}
 datosEmpresa.value.forEach(r => { const p = r.tipoProcedimiento || 'Sin datos'; map[p] = (map[p] || 0) + 1 })
 const COLORS = ['blue1', 'blue2', 'teal', 'blue3', 'amber', 'slate']
 const items = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
 const max = Math.max(...items.map(([, v]) => v), 1)
 return items.map(([label, value], i) => ({ label, value, colorKey: COLORS[i] || 'slate', pct: Math.max(4, Math.round(value / max * 100)) }))
 })

 const organosPrincipales = computed(() => {
 const map = {}
 datosEmpresa.value.forEach(r => {
 if (!r.organo) return
 if (!map[r.organo]) map[r.organo] = { count: 0, importe: 0 }
 map[r.organo].count++
 map[r.organo].importe += (r._importeConIVA || 0)
 })
 return Object.entries(map).sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([organo, v]) => ({ organo, ...v }))
 })

 const contratosRecientes = computed(() => {
 return [...datosEmpresa.value]
 .sort((a, b) => new Date(b.primeraPublicacion || b.fechaActualizacion || 0) - new Date(a.primeraPublicacion || a.fechaActualizacion || 0))
 .slice(0, 8)
 })

 // Acciones 
 function cargarDatos(nuevoDato) {
 datos.value = nuevoDato || []
 empresaSeleccionada.value = null
 }

 function seleccionarEmpresa(clave) {
 empresaSeleccionada.value = clave || null
 }

 function limpiarEmpresa() {
 empresaSeleccionada.value = null
 }

 return {
 datos, empresaSeleccionada,
 tienedatos, gruposEmpresa, empresasOrdenadas,
 datosEmpresa, kpis, metaEmpresa, nombreEmpresaMostrado, kpisCards,
 evolucionAnual, importePorAnio, anioMasActivo,
 tiposContrato, estadosContrato, rangosImporte, procedimientos,
 organosPrincipales, contratosRecientes,
 cargarDatos, seleccionarEmpresa, limpiarEmpresa
 }
})

// Agrupación canónica 
// Elimina sufijos legales, puntuación y normaliza para agrupar variantes
function claveCanonica(s) {
 return String(s || '')
 .toLowerCase()
 .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
 .replace(/\b(s\.?a\.?u?\.?|s\.?l\.?u?\.?|s\.?l\.?|s\.?a\.?|s\.?c\.?|s\.?l\.?p\.?|s\.?a\.?t\.?|s\.?c\.?o\.?p\.?|s\.?r\.?l\.?|a\.?i\.?e\.?|u\.?t\.?e\.?|s\.?l\.?n\.?e\.?|sociedad anonima|sociedad limitada|sociedad unipersonal)\b/g, '')
 .replace(/[^a-z0-9]/g, ' ')
 .replace(/\s+/g, ' ')
 .trim()
}

function elegirNombreCanónico(raw) {
 // Capitaliza correctamente, limpiando sufijos legales del display
 return String(raw || '').trim()
 .replace(/\s+/g, ' ')
 .replace(/\b(S\.A\.U\.|S\.A\.|S\.L\.|S\.L\.U\.|SAU|SAU\.|SLU|SLU\.|S\.A|S\.L)\s*$/i, '')
 .trim()
 .replace(/\b\w/g, c => c.toUpperCase())
}

export function formatEUR(n) {
 if (!n && n !== 0) return '—'
 return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

// Alias público para Relaciones e IA 
// Permite que otros stores / composables lean store.allData en lugar de
// acceder a window.allData, manteniendo reactividad Vue.
// (datos ya expone lo mismo; este alias es azúcar para claridad)
