<template>
 <!-- Estado vacío -->
 <div v-if="!store.tienedatos" class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Carga un archivo para detectar relaciones</div>
 <div class="empty-sub">Se analizarán patrones entre órganos contratantes y adjudicatarios</div>
 </div>

 <!-- Contenido -->
 <div v-else>
 <!-- Alerta alto riesgo -->
 <div v-if="tieneAltaConcentracion" class="alert alert-warning">
 Se han detectado relaciones con alta concentración. Un mismo órgano adjudica repetidamente a la misma empresa.
 </div>

 <!-- Filtros -->
 <div class="rel-filter-bar">
 <div class="filter-group" style="flex:2;min-width:220px">
 <label class="filter-label">Buscar empresa / órgano</label>
 <input type="text" class="filter-input" v-model="searchQuery"
 placeholder="Escribe al menos 2 caracteres..."
 @input="onSearchInput">
 </div>
 <div class="filter-group">
 <label class="filter-label">Concentración mínima</label>
 <select class="filter-select" v-model.number="minConc" @change="applyFilters">
 <option value="1">≥ 1 contrato</option>
 <option value="2">≥ 2 contratos</option>
 <option value="3">≥ 3 contratos</option>
 <option value="5">≥ 5 contratos</option>
 </select>
 </div>
 <div class="filter-group">
 <label class="filter-label">Ordenar por</label>
 <select class="filter-select" v-model="sortBy" @change="applyFilters">
 <option value="score">Riesgo (score)</option>
 <option value="count">Nº contratos</option>
 <option value="amount">Importe total</option>
 </select>
 </div>
 <div class="filter-group">
 <label class="filter-label">Resultados por página</label>
 <select class="filter-select" v-model.number="pageSize" @change="onPageSizeChange">
 <option value="10">10 por página</option>
 <option value="25">25 por página</option>
 <option value="50">50 por página</option>
 </select>
 </div>
 <div class="filter-group" style="align-self:flex-end">
 <button class="btn btn-primary" :disabled="iaEnCurso || !indexReady"
 @click="analizarRelacionesConIA">
 {{ iaEnCurso ? '⏳ Analizando…' : ' Analizar con IA' }}
 </button>
 </div>
 </div>

 <!-- Summary KPIs -->
 <div class="rel-summary">
 <div class="stat-card cyan">
 <div class="stat-label">Resultados encontrados</div>
 <div class="stat-value cyan">{{ filteredResults.length.toLocaleString('es-ES') }}</div>
 <div class="stat-sub">pares Órgano→Empresa</div>
 </div>
 <div class="stat-card red">
 <div class="stat-label">Alta concentración</div>
 <div class="stat-value red">{{ highRiskCount.toLocaleString('es-ES') }}</div>
 <div class="stat-sub">score ≥ 80</div>
 </div>
 <div class="stat-card lime">
 <div class="stat-label">Importe total</div>
 <div class="stat-value lime">{{ fmt(totalAmount) }}</div>
 <div class="stat-sub">adjudicado</div>
 </div>
 </div>

 <!-- Panel IA global -->
 <div v-if="iaPanelVisible" style="margin-bottom:16px">
 <div :style="`background:var(--surface2);border:1px solid ${iaPanelColor};border-radius:10px;overflow:hidden`">
 <div :style="`display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:color-mix(in srgb,${iaPanelColor} 12%,transparent);border-bottom:1px solid ${iaPanelColor}`">
 <strong :style="`color:${iaPanelColor};font-size:.9rem`">{{ iaPanelTitle }}</strong>
 <button @click="iaPanelVisible=false"
 style="background:none;border:none;cursor:pointer;color:var(--text2);font-size:1.1rem"> </button>
 </div>
 <div style="padding:16px 20px;font-size:.85rem;line-height:1.6" v-html="iaPanelContent"></div>
 </div>
 </div>

 <!-- Loader (indexando) -->
 <div v-if="!indexReady && store.tienedatos"
 style="padding:20px;text-align:center;color:var(--text2);font-size:.85rem;font-family:'JetBrains Mono',monospace">
 <div class="ia-spinner" style="margin:0 auto 12px"></div>
 Construyendo índice de relaciones…
 </div>

 <!-- Lista de cards -->
 <div v-if="indexReady">
 <template v-if="pagina.length === 0">
 <div class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Sin resultados</div>
 <div class="empty-sub">{{ baseResults.length === 0 ? 'Analizando relaciones…' : 'Prueba con otro nombre de empresa u órgano contratante.' }}</div>
 </div>
 </template>

 <template v-else>
 <div v-for="r in pagina" :key="r.organo + '|||' + r.adjudicatario"
 class="rel-card" :class="`risk-${riskLevel(r.risk.score)}`"
 :data-org="r.organo" :data-adj="r.adjudicatario">

 <!-- Cabecera card -->
 <div class="rel-card-header">
 <div class="rel-org">
 <strong>{{ r.organo }}</strong>
 <small>{{ r.adjudicatario }}</small>
 </div>
 <div class="rel-risk-badge">
 <span :class="`badge badge-${riskColor(r.risk.score)}`"
 :title="`${r.risk.n} contratos · ${fmt(r.risk.totalAmount)} · ${pct(r.risk.concentration)}% concentración`">
 {{ r.risk.score }} pts · {{ pct(r.risk.concentration) }}%
 </span>
 </div>
 </div>

 <!-- Métricas -->
 <div style="display:flex;gap:16px;margin:10px 0;font-size:.8rem;color:var(--text2)">
 <span>{{ r.risk.n }} contrato{{ r.risk.n !== 1 ? 's' : '' }}</span>
 <span>{{ fmt(r.risk.totalAmount) }}</span>
 <span v-if="r.risk.avg > 0">Promedio: {{ fmt(r.risk.avg) }}</span>
 </div>

 <!-- Barra de concentración -->
 <div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:8px 0">
 <div :style="`width:${Math.min(100,r.risk.concentration*100)}%;height:100%;background:var(--${riskColor(r.risk.score)})`"></div>
 </div>

 <!-- Adjudicatario row -->
 <div style="margin-top:10px">
 <div style="background:var(--surface2);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
 <span>{{ r.adjudicatario }}</span>
 <div style="display:flex;gap:16px;font-size:.75rem;font-family:'JetBrains Mono',monospace">
 <span><strong>{{ r.risk.n }}</strong> contratos</span>
 <span><strong>{{ pct(r.risk.concentration) }}%</strong> del órgano</span>
 </div>
 </div>
 </div>

 <!-- Footer botones -->
 <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:8px">
 <button class="btn btn-ghost btn-sm" @click="verDetalle(r.organo, r.adjudicatario)">
 Ver contratos
 </button>
 <button class="btn btn-ghost btn-sm"
 :disabled="iaCardLoading[cardKey(r)]"
 @click="analizarParConIA(r)">
 {{ iaCardLoading[cardKey(r)] ? '⏳ Analizando…' : ' Analizar con IA' }}
 </button>
 </div>

 <!-- Resultado IA de la card -->
 <div v-if="iaCardResults[cardKey(r)]"
 style="margin-top:12px" v-html="iaCardResults[cardKey(r)]">
 </div>
 </div>

 <!-- Paginación -->
 <div v-if="totalPages > 1"
 style="display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 0;flex-wrap:wrap">
 <button class="btn btn-ghost btn-sm" :disabled="page === 1" @click="goPage(page - 1)">‹</button>
 <template v-for="p in pageButtons" :key="p">
 <span v-if="p === '...'" style="color:var(--text3)">…</span>
 <button v-else class="btn btn-ghost btn-sm"
 :style="p === page ? 'background:var(--primary,#6366f1);color:#fff;border-color:var(--primary,#6366f1)' : ''"
 @click="goPage(p)">{{ p }}</button>
 </template>
 <button class="btn btn-ghost btn-sm" :disabled="page === totalPages" @click="goPage(page + 1)">›</button>
 <span style="font-size:.75rem;color:var(--text3);margin-left:8px">
 {{ (page-1)*pageSize+1 }}–{{ Math.min(page*pageSize, filteredResults.length) }} de {{ filteredResults.length.toLocaleString('es-ES') }}
 </span>
 </div>
 </template>
 </div>
 </div>

 <!-- Modal detalle (usa el modal global de index.html) -->
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, reactive, toRaw } from 'vue'
import { useLicitacionesStore } from '../stores/licitaciones.js'
import { formatEUR } from '../stores/licitaciones.js'

const store = useLicitacionesStore()

// Estado 
let worker = null
const indexReady = ref(false)
const baseResults = ref([])
const relCache = new Map()
const iaCardCache = new Map()

const searchQuery = ref('')
const minConc = ref(2)
const sortBy = ref('score')
const pageSize = ref(10)
const page = ref(1)

let pendingTerm = null
let currentTerm = ''
let searchTimer = null

// IA global
const iaEnCurso = ref(false)
const iaPanelVisible = ref(false)
const iaPanelTitle = ref('')
const iaPanelContent = ref('')
const iaPanelColor = ref('var(--lime,#a3e635)')

// IA por card
const iaCardLoading = reactive({})
const iaCardResults = reactive({})

// Helpers 
function fmt(v) { return formatEUR(v) }
function pct(c) { return (c * 100).toFixed(0) }
function cardKey(r) { return r.organo + '|||' + r.adjudicatario }

function riskLevel(score) {
 return score >= 80 ? 'high' : score >= 50 ? 'med' : 'low'
}
function riskColor(score) {
 return score >= 80 ? 'red' : score >= 50 ? 'amber' : 'lime'
}

function esc(s) {
 return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function bold(s) {
 return esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
}

// Computed 
const filteredResults = computed(() => {
 let arr = baseResults.value.filter(r => r.risk.n >= minConc.value)
 if (sortBy.value === 'amount') arr.sort((a,b) => b.risk.totalAmount - a.risk.totalAmount)
 else if (sortBy.value === 'count') arr.sort((a,b) => b.risk.n - a.risk.n)
 else arr.sort((a,b) => b.risk.score - a.risk.score)
 return arr
})

const highRiskCount = computed(() => filteredResults.value.filter(r => r.risk.score >= 80).length)
const totalAmount = computed(() => filteredResults.value.reduce((s,r) => s + (r.risk.totalAmount||0), 0))
const tieneAltaConcentracion = computed(() => filteredResults.value.some(r => r.risk.score >= 80))

const totalPages = computed(() => Math.ceil(filteredResults.value.length / pageSize.value))

const pagina = computed(() => {
 const start = (page.value - 1) * pageSize.value
 return filteredResults.value.slice(start, start + pageSize.value)
})

const pageButtons = computed(() => {
 const total = totalPages.value
 const cur = page.value
 if (total <= 7) return Array.from({length: total}, (_,i) => i+1)
 const pages = [1]
 if (cur > 3) pages.push('...')
 for (let i = Math.max(2, cur-1); i <= Math.min(total-1, cur+1); i++) pages.push(i)
 if (cur < total - 2) pages.push('...')
 pages.push(total)
 return pages
})

// Worker 
function initWorker() {
 if (worker) { worker.terminate(); worker = null }
 indexReady.value = false
 baseResults.value = []
 relCache.clear()
 Object.keys(iaCardCache).forEach(k => delete iaCardCache[k])
 Object.keys(iaCardResults).forEach(k => delete iaCardResults[k])
 currentTerm = ''
 pendingTerm = null

 worker = new Worker('/js/worker-relaciones.js')

 worker.onmessage = ({ data: { type, payload } }) => {
 if (type === 'INDEX_READY') {
 indexReady.value = true
 const term = pendingTerm !== null ? pendingTerm : ''
 pendingTerm = null
 _doSearch(term)
 }
 if (type === 'RESULT') {
 baseResults.value = payload
 relCache.set(currentTerm, payload)
 }
 if (type === 'ERROR') {
 console.error('[Relaciones Worker]', payload)
 }
 }

 worker.onerror = (err) => {
 console.error('[Relaciones] Worker falló:', err.message)
 indexReady.value = true // mostrar algo
 }

 // toRaw() extrae el array plano sin los Proxy reactivos de Vue,
 // necesario porque postMessage usa structured clone que no admite Proxy.
 worker.postMessage({ type: 'BUILD_INDEX', payload: toRaw(store.datos) })
}

function _doSearch(term) {
 currentTerm = term
 if (relCache.has(term)) {
 baseResults.value = relCache.get(term)
 return
 }
 worker?.postMessage({ type: 'SEARCH', payload: { term } })
}

function performSearch(term) {
 if (!worker || !indexReady.value) { pendingTerm = term; return }
 _doSearch(term)
}

// Eventos de filtros 
function onSearchInput() {
 clearTimeout(searchTimer)
 const term = searchQuery.value.trim()
 if (term.length === 0) { performSearch(''); return }
 if (term.length < 2) return
 searchTimer = setTimeout(() => performSearch(term), 300)
}

function applyFilters() {
 // filteredResults es computed — solo reseteamos la página
 page.value = 1
}

function onPageSizeChange() {
 page.value = 1
}

function goPage(p) {
 if (p < 1 || p > totalPages.value) return
 page.value = p
 document.getElementById('tab-relaciones')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Detalle en modal global 
function verDetalle(organo, adjudicatario) {
 const contratos = store.datos.filter(r => r.organo === organo && r.adjudicatario === adjudicatario)
 if (!contratos.length) return
 const totalImporte = contratos.reduce((s,r) => s + (r.importeConIVA || 0), 0)

 const modalTitle = document.getElementById('modalTitle')
 const modalBody = document.getElementById('modalBody')
 const overlay = document.getElementById('modalOverlay')
 if (!modalBody || !modalTitle || !overlay) return

 modalTitle.textContent = `Relación: ${organo} → ${adjudicatario}`
 modalBody.innerHTML = `
 <div class="detail-grid">
 <div class="detail-section">Resumen</div>
 <div class="detail-item"><div class="detail-key">Contratos totales</div><div class="detail-val"><strong>${contratos.length}</strong></div></div>
 <div class="detail-item"><div class="detail-key">Importe total</div><div class="detail-val amount">${fmt(totalImporte)}</div></div>
 <div class="detail-section">Lista de contratos</div>
 <div class="detail-item full">
 <table style="width:100%;border-collapse:collapse;font-size:.8rem">
 <thead><tr style="border-bottom:1px solid var(--border)">
 <th style="text-align:left;padding:6px">Objeto</th>
 <th style="text-align:right;padding:6px">Importe</th>
 <th style="text-align:left;padding:6px">Estado</th>
 </tr></thead>
 <tbody>${contratos.slice(0,20).map(c => `
 <tr style="border-bottom:1px solid var(--border)">
 <td style="padding:6px">${esc((c.objeto||'—').slice(0,80))}${(c.objeto||'').length>80?'…':''}</td>
 <td style="padding:6px;text-align:right;font-family:'JetBrains Mono',monospace">${fmt(c.importeConIVA)}</td>
 <td style="padding:6px">${esc(c.estado||'')}</td>
 </tr>`).join('')}</tbody>
 </table>
 ${contratos.length > 20 ? `<p style="margin-top:8px;font-size:.7rem;color:var(--text3)">… y ${contratos.length - 20} más</p>` : ''}
 </div>
 </div>`
 overlay.classList.add('open')
}

// IA por card 
async function analizarParConIA(r) {
 const key = cardKey(r)

 // toggle si ya hay resultado
 if (iaCardCache.has(key)) {
 iaCardResults[key] = iaCardResults[key] ? '' : iaCardCache.get(key)
 return
 }

 iaCardLoading[key] = true

 const loaderHtml = `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;
 background:color-mix(in srgb,var(--cyan,#22d3ee) 8%,transparent);
 border-radius:8px;border:1px solid var(--border);font-size:.8rem;color:var(--text2)">
 <div style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border);
 border-top-color:var(--cyan,#22d3ee);animation:spin 0.8s linear infinite;flex-shrink:0"></div>
 Consultando al modelo…</div>`
 iaCardResults[key] = loaderHtml

 try {
 const contratos = store.datos.filter(d => d.organo === r.organo && d.adjudicatario === r.adjudicatario)
 const prompt = buildParIAPrompt(r.organo, r.adjudicatario, r.risk, contratos)
 const texto = await callGroq(prompt)
 const html = renderParIAResult(r.risk, texto)
 iaCardCache.set(key, html)
 iaCardResults[key] = html
 } catch (err) {
 iaCardResults[key] = `<p style="color:var(--red);font-size:.8rem;padding:8px"> ${esc(err.message)}</p>`
 } finally {
 iaCardLoading[key] = false
 }
}

function buildParIAPrompt(organo, adjudicatario, risk, contratos) {
 const e = v => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v||0)
 const san = v => String(v||'').replace(/[\x00-\x1F\x7F]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)
 const pctV = (risk.concentration * 100).toFixed(1)
 const muestra = contratos.slice(0,10).map((c,i) =>
 ` ${i+1}. "${san(c.objeto)}" — ${e(c.importeConIVA)} — ${san(c.estado)}`
 ).join('\n')
 return `Eres un analista experto en contratación pública española.
Analiza la relación entre este órgano contratante y este adjudicatario.

ÓRGANO CONTRATANTE: "${san(organo)}"
ADJUDICATARIO: "${san(adjudicatario)}"

MÉTRICAS:
- Contratos: ${risk.n}
- Importe total: ${e(risk.totalAmount)}
- Importe medio: ${e(risk.avg)}
- Concentración: ${pctV}% del órgano
- Score de riesgo: ${risk.score}/100

MUESTRA DE CONTRATOS:
${muestra||' (sin contratos disponibles)'}

INSTRUCCIONES:
## Valoración del riesgo
## Indicadores relevantes
## Conclusión
Sé conciso. No repitas los datos, interprételos.`
}

function renderParIAResult(risk, texto) {
 const score = risk.score
 const color = score >= 80 ? 'var(--red,#f87171)' : score >= 50 ? 'var(--amber,#fbbf24)' : 'var(--lime,#a3e635)'
 return `<div style="border:1px solid ${color};border-radius:8px;overflow:hidden;font-size:.82rem">
 <div style="padding:8px 12px;background:color-mix(in srgb,${color} 12%,transparent);
 display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${color}">
 <strong style="color:${color}"> Análisis IA — score ${score}/100</strong>
 </div>
 <div style="padding:12px 14px;line-height:1.6;color:var(--text1)">
 ${renderRelIAMarkdown(texto)}
 </div>
 </div>`
}

// IA global (top 15) 
async function analizarRelacionesConIA() {
 if (iaEnCurso.value) return
 const fuente = filteredResults.value.length > 0 ? filteredResults.value : baseResults.value
 if (!fuente.length) {
 setIAPanel('warning', ' Sin datos para analizar',
 '<p>Espera a que el índice termine o aplica algún filtro primero.</p>')
 return
 }
 const top = fuente.slice().sort((a,b) => b.risk.score - a.risk.score).slice(0,15)
 iaEnCurso.value = true
 setIAPanel('loading', ' Analizando patrones con IA…', relIALoader())

 try {
 const prompt = buildRelIAPrompt(top, fuente.length)
 const texto = await callGroq(prompt)
 setIAPanel('result', ' Análisis de relaciones — IA', renderRelIAMarkdown(texto))
 } catch (err) {
 setIAPanel('error', ' Error en el análisis',
 `<p style="color:var(--red)">${esc(err.message||'Error desconocido')}</p>`)
 } finally {
 iaEnCurso.value = false
 }
}

function setIAPanel(tipo, titulo, contenido) {
 const colores = { loading:'var(--cyan,#22d3ee)', result:'var(--lime,#a3e635)', warning:'var(--amber,#fbbf24)', error:'var(--red,#f87171)' }
 iaPanelColor.value = colores[tipo] || colores.result
 iaPanelTitle.value = titulo
 iaPanelContent.value = contenido
 iaPanelVisible.value = true
}

function relIALoader() {
 return `<div style="display:flex;align-items:center;gap:12px;color:var(--text2)">
 <div style="width:20px;height:20px;border-radius:50%;border:2px solid var(--border);
 border-top-color:var(--cyan,#22d3ee);animation:spin 0.8s linear infinite;flex-shrink:0"></div>
 <span>Enviando datos al modelo… puede tardar unos segundos.</span>
 </div>`
}

function buildRelIAPrompt(top, totalPares) {
 const e = v => v ? new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v) : '0 €'
 const san = v => String(v||'').replace(/[\x00-\x1F\x7F]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)
 const filas = top.map((r,i) => {
 const pctV = (r.risk.concentration * 100).toFixed(1)
 return `${i+1}. Órgano: "${san(r.organo)}"\n Empresa: "${san(r.adjudicatario)}"\n Contratos: ${r.risk.n} | Importe total: ${e(r.risk.totalAmount)} | Importe medio: ${e(r.risk.avg)}\n Concentración: ${pctV}% | Score: ${r.risk.score}/100`
 }).join('\n\n')
 return `Eres un analista experto en contratación pública española.
CONTEXTO: ${totalPares} pares analizados. Se muestran los ${top.length} de mayor score.
PARES DE MAYOR RIESGO:\n${filas}

INSTRUCCIONES:
## Resumen general
## Relaciones más preocupantes
## Patrones comunes detectados
## Recomendaciones
Sé directo, preciso y evita frases genéricas.`
}

// Llamada a Groq 
async function callGroq(prompt) {
 const res = await fetch('/api/ia/groq', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ messages: [{ role:'user', content: prompt }], max_tokens: 1200, temperature: 0.3 })
 })
 if (!res.ok) throw new Error(`Error del servidor (${res.status})`)
 const json = await res.json()
 if (!json.success) throw new Error(json.error || 'Error del servidor')
 const content = json.data?.choices?.[0]?.message?.content
 if (!content) throw new Error('Respuesta vacía del modelo')
 return content
}

// Markdown → HTML 
function renderRelIAMarkdown(texto) {
 if (!texto) return ''
 const lines = texto.split('\n')
 const chunks = []
 let listOpen = false
 const closeList = () => { if (listOpen) { chunks.push('</ul>'); listOpen = false } }
 for (const raw of lines) {
 const line = raw.trimEnd()
 if (/^#{2,3}\s+/.test(line)) {
 closeList()
 const txt = line.replace(/^#{2,3}\s+/,'')
 chunks.push(`<div style="margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border);font-weight:700;color:var(--lime,#a3e635);font-size:.9rem">${bold(txt)}</div>`)
 continue
 }
 if (/^[-*•]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
 if (!listOpen) { chunks.push('<ul style="margin:6px 0 6px 16px;padding:0;list-style:none">'); listOpen = true }
 const txt = line.replace(/^[-*•]\s+/,'').replace(/^\d+[.)]\s+/,'')
 chunks.push(`<li style="margin:4px 0;display:flex;gap:8px"><span style="color:var(--lime,#a3e635);flex-shrink:0">›</span><span>${bold(txt)}</span></li>`)
 continue
 }
 if (!line.trim()) { closeList(); continue }
 closeList()
 chunks.push(`<p style="margin:6px 0">${bold(line)}</p>`)
 }
 closeList()
 return chunks.join('\n')
}

// Ciclo de vida 
function onDataUpdated(e) {
 store.cargarDatos(e.detail || window.allData || [])
}

watch(() => store.datos.length, (n) => {
 if (n > 0) initWorker()
})

onMounted(() => {
 if (window.allData?.length) store.cargarDatos(window.allData)
 window.addEventListener('dataUpdated', onDataUpdated)
 if (store.tienedatos) initWorker()

 // Exponer para que el vanilla main.js pueda seguir llamando buildRelaciones()
 window.buildRelaciones = () => {
 if (store.tienedatos) initWorker()
 }
})

onUnmounted(() => {
 window.removeEventListener('dataUpdated', onDataUpdated)
 if (worker) { worker.terminate(); worker = null }
})</script>
