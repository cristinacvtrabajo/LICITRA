<template>
 <div class="empresa-selector">
 <label>Analizar empresa</label>
 <div class="combo-wrapper" :class="{ open: abierto }" ref="wrapperRef">

 <!-- Input de búsqueda -->
 <input
 ref="inputRef"
 type="text"
 class="combo-input"
 placeholder="Busca o selecciona una empresa..."
 autocomplete="off"
 v-model="query"
 @focus="abrir"
 @input="onInput"
 @keydown.escape="cerrar"
 @keydown.enter="onEnter"
 @keydown.arrow-down.prevent="moverCursor(1)"
 @keydown.arrow-up.prevent="moverCursor(-1)"
 />
 <span class="combo-arrow" @mousedown.prevent="toggleDesplegable"> </span>

 <!-- Desplegable -->
 <div class="combo-dropdown" v-show="abierto" ref="dropdownRef">

 <!-- Contador -->
 <div class="combo-header-info">
 {{ opcionesFiltradas.length.toLocaleString('es-ES') }} empresa{{ opcionesFiltradas.length !== 1 ? 's' : '' }}
 <span v-if="query"> · búsqueda: "{{ query }}"</span>
 </div>

 <!-- Opciones -->
 <div class="combo-list" ref="listRef">
 <div
 v-for="(grupo, i) in opcionesFiltradas"
 :key="grupo.clave"
 :class="['combo-option', { 'combo-option--active': i === cursorIdx, 'combo-option--selected': store.empresaSeleccionada === grupo.clave }]"
 @mousedown.prevent="seleccionar(grupo)"
 @mousemove="cursorIdx = i"
 >
 <div class="combo-option-nombre" v-html="resaltar(grupo.nombre)"></div>
 <div class="combo-option-meta">
 <span class="combo-badge">{{ grupo.count.toLocaleString('es-ES') }} contratos</span>
 <span class="combo-importe">{{ formatEUR(grupo.importe) }}</span>
 </div>
 </div>
 <div v-if="!opcionesFiltradas.length" class="combo-empty">
 Sin coincidencias para "{{ query }}"
 </div>
 </div>
 </div>
 </div>

 <button v-if="store.empresaSeleccionada" class="btn-limpiar-empresa" @click="limpiar">
 Limpiar
 </button>
 </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useLicitacionesStore } from '../../stores/licitaciones.js'
import { formatEUR } from '../../stores/licitaciones.js'

const store = useLicitacionesStore()

const query = ref('')
const abierto = ref(false)
const cursorIdx = ref(0)
const inputRef = ref(null)
const listRef = ref(null)
const wrapperRef = ref(null)

const opcionesFiltradas = computed(() => {
 const q = norm(query.value.trim())
 if (!q) return store.empresasOrdenadas
 // Busca en nombre y también en variantes
 return store.empresasOrdenadas.filter(g => {
 if (norm(g.nombre).includes(q)) return true
 for (const v of g.variantes) {
 if (norm(v).includes(q)) return true
 }
 return false
 })
})

watch(opcionesFiltradas, () => { cursorIdx.value = 0 })

function abrir() {
 abierto.value = true
 nextTick(() => scrollToCursor())
}

function cerrar() {
 abierto.value = false
 cursorIdx.value = 0
}

function toggleDesplegable() {
 if (abierto.value) cerrar()
 else { abrir(); inputRef.value?.focus() }
}

function onInput() {
 abierto.value = true
 if (store.empresaSeleccionada) {
 const g = store.gruposEmpresa.get(store.empresaSeleccionada)
 if (g && !norm(g.nombre).includes(norm(query.value))) {
 store.limpiarEmpresa()
 }
 }
}

function seleccionar(grupo) {
 query.value = grupo.nombre
 store.seleccionarEmpresa(grupo.clave)
 cerrar()
}

function onEnter() {
 const opcion = opcionesFiltradas.value[cursorIdx.value]
 if (opcion) seleccionar(opcion)
}

function moverCursor(dir) {
 const max = opcionesFiltradas.value.length - 1
 cursorIdx.value = Math.max(0, Math.min(max, cursorIdx.value + dir))
 scrollToCursor()
}

function scrollToCursor() {
 nextTick(() => {
 const list = listRef.value
 if (!list) return
 const item = list.children[cursorIdx.value]
 if (item) item.scrollIntoView({ block: 'nearest' })
 })
}

function limpiar() {
 query.value = ''
 store.limpiarEmpresa()
 cerrar()
}

// Cerrar al hacer click fuera
function onClickOutside(e) {
 if (wrapperRef.value && !wrapperRef.value.contains(e.target)) cerrar()
}
import { onMounted, onUnmounted } from 'vue'
onMounted(() => document.addEventListener('mousedown', onClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', onClickOutside))

function resaltar(nombre) {
 const q = norm(query.value.trim())
 if (!q) return esc(nombre)
 const n = norm(nombre)
 const idx = n.indexOf(q)
 if (idx < 0) return esc(nombre)
 return esc(nombre.slice(0, idx)) + '<mark>' + esc(nombre.slice(idx, idx + q.length)) + '</mark>' + esc(nombre.slice(idx + q.length))
}

function norm(s) {
 return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}
function esc(s) {
 return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
</script>

<style scoped>
.combo-dropdown {
 max-height: 420px;
 display: flex;
 flex-direction: column;
}

.combo-header-info {
 padding: 8px 14px;
 font-size: 11px;
 color: var(--text3);
 border-bottom: 1px solid var(--border);
 background: var(--surface2);
 flex-shrink: 0;
 font-family: 'JetBrains Mono', monospace;
}

.combo-list {
 overflow-y: auto;
 flex: 1;
}

.combo-option {
 padding: 8px 14px;
 cursor: pointer;
 border-bottom: 1px solid var(--border);
 transition: background 0.1s;
}

.combo-option:hover,
.combo-option--active {
 background: var(--row-hover-bg, rgba(255,255,255,0.05));
}

.combo-option--selected {
 background: rgba(37, 99, 235, 0.15);
 border-left: 2px solid var(--accent, #2563eb);
}

.combo-option-nombre {
 font-size: 13px;
 font-weight: 500;
 color: var(--text1);
 white-space: nowrap;
 overflow: hidden;
 text-overflow: ellipsis;
}

.combo-option-meta {
 display: flex;
 gap: 10px;
 margin-top: 2px;
 align-items: center;
}

.combo-badge {
 font-size: 11px;
 background: var(--surface2);
 color: var(--text3);
 padding: 1px 6px;
 border-radius: 4px;
 font-family: 'JetBrains Mono', monospace;
}

.combo-importe {
 font-size: 11px;
 color: var(--text3);
 font-family: 'JetBrains Mono', monospace;
}

.combo-option--selected .combo-badge {
 background: rgba(37, 99, 235, 0.2);
 color: var(--accent, #60a5fa);
}

:deep(mark) {
 background: rgba(250, 204, 21, 0.3);
 color: inherit;
 border-radius: 2px;
 padding: 0 1px;
}
</style>
