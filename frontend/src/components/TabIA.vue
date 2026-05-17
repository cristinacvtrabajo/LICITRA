<template>
 <!-- Estado vacío -->
 <div v-if="!store.tienedatos" class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Carga un archivo para obtener recomendaciones</div>
 <div class="empty-sub">La IA analizará cada licitación y te dirá si merece la pena presentarte</div>
 </div>

 <!-- Contenido -->
 <div v-else id="iaContent">

 <!-- Config panel -->
 <div class="panel" id="iaConfigPanel">
 <div class="panel-header"><span class="panel-title">Análisis IA de licitaciones</span></div>
 <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">

 <div class="filter-group" style="flex:1;min-width:220px">
 <label class="filter-label">Tu sector / especialidad</label>
 <select class="filter-select" v-model="sector" style="width:100%">
 <option value="">-- Selecciona tu sector --</option>
 <option v-for="s in SECTORES_LISTA" :key="s" :value="s">{{ s }}</option>
 </select>
 </div>

 <div class="filter-group">
 <label class="filter-label">Analizar</label>
 <select class="filter-select" v-model="scope">
 <option value="filtered">Licitaciones filtradas (tabla actual)</option>
 <option value="all">Todas las licitaciones</option>
 </select>
 </div>

 <div class="filter-group">
 <label class="filter-label">Resultados por página</label>
 <select class="filter-select" v-model.number="iaLimit">
 <option value="10">10 por página</option>
 <option value="20">20 por página</option>
 <option value="50">50 por página</option>
 <option value="100">100 por página</option>
 </select>
 </div>

 <div class="filter-group">
 <label class="filter-label">Importe mínimo</label>
 <select class="filter-select" v-model.number="importeMin" style="width:100%">
 <option value="0">Sin mínimo</option>
 <option value="5000">5.000 €</option>
 <option value="10000">10.000 €</option>
 <option value="20000">20.000 €</option>
 <option value="50000">50.000 €</option>
 <option value="75000">75.000 €</option>
 <option value="100000">100.000 €</option>
 <option value="200000">200.000 €</option>
 <option value="500000">500.000 €</option>
 <option value="1000000">1.000.000 €</option>
 </select>
 </div>

 <div class="filter-group">
 <label class="filter-label">Importe máximo</label>
 <select class="filter-select" v-model="importeMaxStr" style="width:100%">
 <option value="">Sin máximo</option>
 <option value="10000">10.000 €</option>
 <option value="20000">20.000 €</option>
 <option value="50000">50.000 €</option>
 <option value="75000">75.000 €</option>
 <option value="100000">100.000 €</option>
 <option value="200000">200.000 €</option>
 <option value="500000">500.000 €</option>
 <option value="1000000">1.000.000 €</option>
 <option value="5000000">5.000.000 €</option>
 </select>
 </div>

 <div class="filter-group">
 <label class="filter-label">Concentración bloqueante</label>
 <div style="display:flex;align-items:center;gap:6px">
 <input type="number" class="filter-input" v-model.number="umbralConc"
 min="0" max="100" step="1" style="width:80px;text-align:right">
 <span style="font-size:.9rem;color:var(--text2)">%</span>
 </div>
 </div>

 <div class="filter-group" style="align-self:flex-end">
 <button class="btn btn-primary" :disabled="loading" @click="runAnalysis">
 {{ loading ? 'Analizando…' : 'Analizar con IA' }}
 </button>
 </div>
 </div>

 <div style="margin-top:12px;font-size:.78rem;color:var(--text2);font-family:'JetBrains Mono',monospace">
 El análisis evalúa: CPV vs tu sector · concentración del adjudicatario · nº de ofertas previas · dispersión de precios · tipo de procedimiento · importe
 </div>

 <!-- Filtro de lugar -->
 <div class="ia-lugar-filter">
 <div class="ia-lugar-filter-header">
 <span class="ia-lugar-filter-title">
 Excluir por lugar de ejecución
 <span class="ia-lugar-badge" :style="`opacity:${lugaresExcluidos.size>0?1:0}`">
 {{ lugaresExcluidos.size === 1 ? '1 excluido' : `${lugaresExcluidos.size} excluidos` }}
 </span>
 </span>
 <button class="btn btn-ghost btn-sm" @click="lugarLimpiar">Limpiar todo</button>
 </div>
 <div style="position:relative">
 <input type="text" class="filter-input" v-model="lugarSearch"
 placeholder="Buscar lugar de ejecución para excluir…"
 style="width:100%;box-sizing:border-box"
 @input="onLugarInput" @keydown="onLugarKey" @blur="lugarDropdownVisible=false">
 <div v-if="lugarDropdownVisible && lugarDropdownOpts.length"
 style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:200;max-height:200px;overflow-y:auto">
 <div v-for="(opt, i) in lugarDropdownOpts" :key="opt"
 class="ia-lugar-option" :class="{focused: i === lugarFocusIdx}"
 @mousedown.prevent="lugarAdd(opt)">
 <span v-html="highlightLugar(opt)"></span>
 </div>
 </div>
 </div>
 <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
 <span v-for="v in lugaresExcluidos" :key="v" class="ia-lugar-tag" :title="v">
 <span style="overflow:hidden;text-overflow:ellipsis;max-width:220px">{{ v }}</span>
 <span class="ia-lugar-tag-x" @click="lugarRemove(v)"> </span>
 </span>
 </div>
 </div>

 <!-- Panel seguimiento -->
 <div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
 <span style="font-size:.75rem;font-weight:600;font-family:'JetBrains Mono',monospace"> MIS SEGUIMIENTOS</span>
 <button class="btn btn-ghost btn-sm" @click="showSeguimientosModal=true" style="font-size:.65rem">Ver todos</button>
 </div>
 <div style="font-size:.75rem;color:var(--text2)">
 {{ seguimientosCount === 0 ? 'No hay licitaciones en seguimiento. Marca una con ' : `${seguimientosCount} licitación(es) en seguimiento` }}
 </div>
 </div>
 </div>

 <!-- Progreso -->
 <div v-if="loading" class="panel">
 <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
 <div class="ia-spinner"></div>
 <span style="font-family:'JetBrains Mono',monospace;font-size:.85rem">{{ progressText }}</span>
 </div>
 <div class="ia-progress-bar">
 <div class="ia-progress-fill" :style="`width:${progressPct}%`"></div>
 </div>
 </div>

 <!-- Summary -->
 <div v-if="iaResults.length > 0">
 <div class="stats-grid">
 <div class="stat-card lime" style="cursor:pointer"
 :style="filtroVeredicto==='RECOMENDABLE'?'outline:2px solid #1d4ed8;outline-offset:3px':''"
 @click="setFiltro('RECOMENDABLE')">
 <div class="stat-label">Recomendables</div>
 <div class="stat-value lime">{{ countVeredicto('RECOMENDABLE') }}</div>
 <div class="stat-sub">clic para filtrar</div>
 </div>
 <div class="stat-card amber" style="cursor:pointer"
 :style="filtroVeredicto==='NEUTRAL'?'outline:2px solid #1d4ed8;outline-offset:3px':''"
 @click="setFiltro('NEUTRAL')">
 <div class="stat-label">Neutras</div>
 <div class="stat-value amber">{{ countVeredicto('NEUTRAL') }}</div>
 <div class="stat-sub">clic para filtrar</div>
 </div>
 <div class="stat-card red" style="cursor:pointer"
 :style="filtroVeredicto==='NO RECOMENDABLE'?'outline:2px solid #1d4ed8;outline-offset:3px':''"
 @click="setFiltro('NO RECOMENDABLE')">
 <div class="stat-label">No recomendables</div>
 <div class="stat-value red">{{ countVeredicto('NO RECOMENDABLE') }}</div>
 <div class="stat-sub">clic para filtrar</div>
 </div>
 <div class="stat-card cyan">
 <div class="stat-label">Puntuación media</div>
 <div class="stat-value cyan">{{ avgPuntuacion }}</div>
 <div class="stat-sub">sobre 10</div>
 </div>
 <div class="stat-card green">
 <div class="stat-label">Analizadas</div>
 <div class="stat-value green">{{ iaResults.length }}</div>
 <div class="stat-sub">de {{ iaSource.length }} totales</div>
 </div>
 </div>
 <div style="text-align:center;margin:8px 0 16px">
 <button v-if="quedan > 0" class="btn btn-primary" @click="analizarBloque">
 Analizar siguiente bloque ({{ Math.min(iaLimit, quedan) }} de {{ quedan }} restantes)
 </button>
 </div>
 </div>

 <!-- Resultados -->
 <div v-if="baseIA.length > 0">
 <!-- Ordenación -->
 <div style="display:flex;align-items:center;gap:10px;margin-bottom:15px;background:var(--surface);padding:10px 15px;border-radius:8px;border:1px solid var(--border)">
 <span style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text2)">Ordenar por:</span>
 <button v-for="crit in ['puntuacion','fecha','importe']" :key="crit"
 class="btn btn-ghost btn-sm"
 :style="sortBy===crit?'background:var(--lime-dim);color:var(--lime);':'' "
 @click="setSortBy(crit)">
 {{ {puntuacion:'Puntuación',fecha:'Fecha',importe:'Importe'}[crit] }}
 {{ sortBy===crit ? (sortDir==='asc'?'↑':'↓') : '' }}
 </button>
 </div>

 <!-- Filtro activo -->
 <div v-if="filtroVeredicto" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--text2)">
 Filtrando: <strong style="color:var(--text)">{{ filtroVeredicto }}</strong>
 <button class="btn btn-ghost btn-sm" @click="setFiltro(null)"> Ver todas</button>
 </div>

 <!-- Cards -->
 <div v-if="paginaIA.length === 0" class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">No hay resultados con este filtro</div>
 </div>
 <div v-for="(item, i) in paginaIA" :key="item.licit.id || item.licit.expediente || i">
 <div class="ia-card" :class="veredictoClass(item.result.veredicto)">
 <div class="ia-card-header">
 <div class="ia-card-title">
 <span class="ia-verdict-icon">{{ veredictoIcon(item.result.veredicto) }}</span>
 <div>
 <div class="ia-objeto" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
 {{ item.licit.objeto || '—' }}
 <button @click="openDetalleModal(item.licit)"
 style="margin-left:8px;padding:4px 10px;font-size:.75rem;background:#1d4ed8;color:white;border:none;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px">
 📋 Ver detalle
 </button>
 <span v-if="fechaDisplay(item.licit)"
 style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--text2);margin-left:8px">
 {{ fechaDisplay(item.licit) }}
 </span>
 </div>
 <div class="ia-organo">{{ item.licit.organo || '—' }}</div>
 </div>
 </div>
 <div class="ia-card-meta">
 <span class="badge" :class="veredictoBadge(item.result.veredicto)">{{ item.result.veredicto }}</span>
 <div class="ia-score">
 <span v-for="n in 10" :key="n"
 :style="`color:${n <= item.result.puntuacion ? '#1d4ed8' : 'var(--border-hi,#2a2a3e)'}`">•</span>
 </div>
 <div class="ia-score-num">{{ item.result.puntuacion }}/10</div>
 </div>
 </div>

 <div class="ia-resumen">{{ item.result.resumen }}</div>

 <div class="ia-licit-data">
 <span v-if="importeCard(item.licit)">{{ importeCard(item.licit) }}</span>
 <span v-if="item.licit.numOfertas">{{ item.licit.numOfertas }} ofertas previas</span>
 <span v-if="item.licit.tipoProcedimiento">{{ item.licit.tipoProcedimiento }}</span>
 <span v-if="item.licit.cpv">CPV {{ item.licit.cpv }}</span>
 <span v-if="item.licit.adjudicatario">Adj. anterior: {{ item.licit.adjudicatario }}</span>
 </div>

 <div class="ia-pros-cons">
 <ul v-if="item.result.puntos_favor?.length" class="ia-list ia-list-favor">
 <li v-for="p in item.result.puntos_favor" :key="p">{{ p }}</li>
 </ul>
 <ul v-if="item.result.puntos_contra?.length" class="ia-list ia-list-contra">
 <li v-for="p in item.result.puntos_contra" :key="p">{{ p }}</li>
 </ul>
 </div>

 <div v-if="item.result.consejo" class="ia-consejo">
 <span class="ia-consejo-label">Consejo:</span> {{ item.result.consejo }}
 </div>

 <!-- Botones de acción -->
 <div style="display:flex;align-items:center;gap:8px;margin-top:12px;margin-bottom:8px;flex-wrap:wrap">
 <button @click="toggleSeguimiento(item.licit)"
 :style="`padding:4px 10px;font-size:.85rem;background:transparent;border-radius:6px;cursor:pointer;border:1px solid ${enSeguimiento(item.licit)?'#f5a623':'var(--border)'};color:${enSeguimiento(item.licit)?'#f5a623':'var(--text2)'}`">
 {{ enSeguimiento(item.licit) ? '⭐ En seguimiento' : '☆ Marcar seguimiento' }}
 </button>
 <button @click="openGenModal(item.licit)"
 style="padding:4px 12px;font-size:.75rem;background:#8b5cf6;color:white;border:none;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
 <span> </span> Generar documento
 </button>
 <button @click="openDocsModal(item.licit)"
 style="padding:4px 12px;font-size:.75rem;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
 <span> </span> Buscar documentos
 </button>
 </div>

 <!-- Groq análisis -->
 <div class="ia-groq-analysis" style="margin-top:15px">
 <div v-if="groqCache[groqKey(item.licit)]" v-html="renderGroqHTML(groqCache[groqKey(item.licit)])"></div>
 <button v-else @click="solicitarGroq(item)"
 style="cursor:pointer;font-size:.85rem;font-weight:500;padding:6px 14px;border-radius:6px;background:#1d4ed8;color:white;border:none">
 Analizar con IA
 </button>
 <div v-if="groqLoading[groqKey(item.licit)]" class="groq-loading">
 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-linecap="round">
 <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
 <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
 </path>
 </svg>
 Analizando con IA…
 </div>
 </div>
 </div>
 </div>

 <!-- Paginación -->
 <div v-if="totalIAPages > 1" class="pagination" style="margin-top:16px">
 <span class="page-info">Mostrando {{ iaPageStart }}–{{ iaPageEnd }} de {{ baseIA.length }} analizadas</span>
 <div class="page-btns">
 <button class="page-btn" :disabled="iaPage===1" @click="goIAPage(iaPage-1)">&#8249;</button>
 <button v-for="p in iaPagButtons" :key="p"
 class="page-btn" :class="{active: p===iaPage}"
 :disabled="p==='...'"
 @click="p!=='...' && goIAPage(p)">{{ p }}</button>
 <button class="page-btn" :disabled="iaPage===totalIAPages" @click="goIAPage(iaPage+1)">&#8250;</button>
 </div>
 </div>
 </div>
 </div>

 <!-- Modal: detalle licitación (datos locales) -->
 <Teleport to="body">
 <div v-if="showDetalleModal && detalleLicit" class="modal-overlay" style="display:flex;z-index:1050"
 @click.self="showDetalleModal=false">
 <div class="modal" style="max-width:780px;width:94%;max-height:90vh;display:flex;flex-direction:column" @click.stop>
 <div class="modal-head" style="flex-shrink:0">
 <div class="modal-title" style="font-size:.95rem;line-height:1.4;max-width:640px">
 📋 {{ detalleLicit.objeto || 'Detalle de licitación' }}
 </div>
 <button class="modal-close" @click="showDetalleModal=false" aria-label="Cerrar">
 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
 <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/>
 </svg>
 </button>
 </div>
 <div class="modal-body" style="overflow-y:auto;flex:1;padding:20px">
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 20px">

 <!-- Expediente y estado -->
 <div v-if="detalleField(detalleLicit,'expediente')" style="grid-column:1/-1">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Nº Expediente</div>
 <div style="font-size:.9rem;font-family:'JetBrains Mono',monospace;color:var(--lime)">{{ detalleLicit.expediente }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'organo')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Órgano de contratación</div>
 <div style="font-size:.85rem;color:var(--text)">{{ detalleLicit.organo }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'estado')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Estado</div>
 <div style="font-size:.85rem">
 <span :style="`display:inline-block;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:600;background:${detalleLicit.estado?.toLowerCase().includes('adjudicad')?'rgba(16,185,129,.15)':detalleLicit.estado?.toLowerCase().includes('publicad')?'rgba(29,78,216,.15)':'rgba(100,100,120,.15)'};color:${detalleLicit.estado?.toLowerCase().includes('adjudicad')?'#10b981':detalleLicit.estado?.toLowerCase().includes('publicad')?'#60a5fa':'var(--text2)'}`">
 {{ detalleLicit.estado }}
 </span>
 </div>
 </div>

 <div v-if="detalleField(detalleLicit,'tipoProcedimiento')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Tipo procedimiento</div>
 <div style="font-size:.85rem;color:var(--text)">{{ detalleLicit.tipoProcedimiento }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'cpv')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">CPV</div>
 <div style="font-size:.85rem;font-family:'JetBrains Mono',monospace;color:var(--text)">{{ detalleLicit.cpv }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'lugarEjecucion')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Lugar de ejecución</div>
 <div style="font-size:.85rem;color:var(--text)">{{ detalleLicit.lugarEjecucion }}</div>
 </div>

 <!-- Fechas -->
 <div v-if="detalleField(detalleLicit,'primeraPublicacion')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Primera publicación</div>
 <div style="font-size:.85rem;font-family:'JetBrains Mono',monospace;color:var(--text)">{{ detalleLicit.primeraPublicacion }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'fechaActualizacion')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Última actualización</div>
 <div style="font-size:.85rem;font-family:'JetBrains Mono',monospace;color:var(--text)">{{ detalleLicit.fechaActualizacion }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'fechaOfertas')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Fin plazo ofertas</div>
 <div style="font-size:.85rem;font-family:'JetBrains Mono',monospace;color:var(--text)">{{ detalleLicit.fechaOfertas }}</div>
 </div>

 <!-- Importes -->
 <div v-if="detalleImporte(detalleLicit,'presupuestoSinIVA')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Presupuesto base (sin IVA)</div>
 <div style="font-size:.9rem;font-weight:700;color:var(--lime)">{{ detalleImporte(detalleLicit,'presupuestoSinIVA') }}</div>
 </div>

 <div v-if="detalleImporte(detalleLicit,'presupuestoConIVA')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Presupuesto base (con IVA)</div>
 <div style="font-size:.9rem;font-weight:700;color:var(--lime)">{{ detalleImporte(detalleLicit,'presupuestoConIVA') }}</div>
 </div>

 <div v-if="detalleImporte(detalleLicit,'valorEstimado')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Valor estimado del contrato</div>
 <div style="font-size:.9rem;font-weight:700;color:#f59e0b">{{ detalleImporte(detalleLicit,'valorEstimado') }}</div>
 </div>

 <div v-if="detalleImporte(detalleLicit,'importeAdjudicacion')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Importe adjudicación</div>
 <div style="font-size:.9rem;font-weight:700;color:#60a5fa">{{ detalleImporte(detalleLicit,'importeAdjudicacion') }}</div>
 </div>

 <!-- Adjudicación -->
 <div v-if="detalleField(detalleLicit,'adjudicatario')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Adjudicatario</div>
 <div style="font-size:.85rem;color:var(--text)">{{ detalleLicit.adjudicatario }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'esPyme')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">PYME</div>
 <div style="font-size:.85rem">
 <span :style="`display:inline-block;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:600;background:${/s[ií]|yes|true/i.test(detalleLicit.esPyme)?'rgba(163,230,53,.15)':'rgba(100,100,120,.15)'};color:${/s[ií]|yes|true/i.test(detalleLicit.esPyme)?'#a3e635':'var(--text2)'}`">
 {{ /s[ií]|yes|true/i.test(detalleLicit.esPyme) ? 'Sí, PYME' : detalleLicit.esPyme }}
 </span>
 </div>
 </div>

 <div v-if="detalleField(detalleLicit,'numOfertas')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Nº ofertas anteriores</div>
 <div style="font-size:.85rem;font-weight:600;color:var(--text)">{{ detalleLicit.numOfertas }}</div>
 </div>

 <div v-if="detalleField(detalleLicit,'concentracion')">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Concentración adj. (%)</div>
 <div style="font-size:.85rem;font-family:'JetBrains Mono',monospace;color:var(--text)">{{ detalleLicit.concentracion }}%</div>
 </div>

 <!-- Links externos (si están disponibles) -->
 <div v-if="detalleLink(detalleLicit) || detallePerfil(detalleLicit)" style="grid-column:1/-1;margin-top:4px;padding-top:12px;border-top:1px solid var(--border)">
 <div style="font-size:.72rem;color:var(--text2);margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em">Enlaces externos</div>
 <div style="display:flex;gap:10px;flex-wrap:wrap">
 <a v-if="detalleLink(detalleLicit)" :href="detalleLink(detalleLicit)" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:var(--accent,#1d4ed8);color:white;border-radius:6px;text-decoration:none;font-size:.8rem;font-weight:600">
 ↗ Ver en portal de contratación
 </a>
 <a v-if="detallePerfil(detalleLicit)" :href="detallePerfil(detalleLicit)" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:transparent;border:1px solid var(--border);color:var(--text2);border-radius:6px;text-decoration:none;font-size:.8rem;font-weight:600">
 ↗ Ver perfil del contratante
 </a>
 </div>
 </div>

 </div>
 </div>
 </div>
 </div>
 </Teleport>

 <!-- Modal: documentos -->
 <Teleport to="body">
 <div v-if="showDocsModal" class="modal-overlay" style="display:flex;z-index:1000"
 @click.self="showDocsModal=false">
 <div class="modal" style="max-width:700px;width:90%" @click.stop>
 <div class="modal-head">
 <div class="modal-title"> {{ docsTitle }}</div>
 <button class="modal-close" @click="showDocsModal=false" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 <div class="modal-body" style="max-height:60vh;overflow-y:auto">
 <!-- Cargando -->
 <div v-if="docsLoading" style="text-align:center;padding:40px">
 <div class="ia-spinner"></div>
 <p style="margin-top:12px;color:var(--text2)">Analizando portal…</p>
 </div>
 <!-- JS-rendered -->
 <div v-else-if="docsState==='jsRendered'" style="padding:24px 4px">
 <div style="font-size:2.2rem;margin-bottom:10px"> </div>
 <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">{{ docsData.portal }} usa JavaScript para cargar los documentos</div>
 <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:4px">
 Este portal renderiza los documentos dinámicamente. Ábrelo en tu navegador y busca la pestaña <em>"Documentos"</em> o <em>"Pliegos"</em>:
 </div>
 <a :href="docsUrl" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:.85rem;margin-top:10px">
 Ver documentos en {{ docsData.portal }}
 </a>
 <br v-if="docsEnlacePerfil">
 <a v-if="docsEnlacePerfil" :href="docsEnlacePerfil" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:.85rem;margin-top:10px">
 Perfil del contratante
 </a>
 <div style="margin-top:16px;padding:10px 14px;background:rgba(251,191,36,.12);border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;font-size:.75rem;color:var(--text2)">
 <strong>Consejo:</strong> En PLACSP haz clic en <em>"Documentos del expediente"</em>.
 </div>
 </div>
 <!-- Bloqueado -->
 <div v-else-if="docsState==='blocked'" style="padding:24px 4px">
 <div style="font-size:2.2rem;margin-bottom:10px"> </div>
 <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">El portal bloqueó el acceso automático</div>
 <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:4px">
 Error <strong>403 Forbidden</strong> — el portal tiene protección anti-bot. Accede desde tu navegador:
 </div>
 <a :href="docsUrl" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:.85rem;margin-top:10px">
 Abrir licitación
 </a>
 </div>
 <!-- Sin docs -->
 <div v-else-if="docsState==='empty'" style="padding:24px 4px">
 <div style="font-size:2.2rem;margin-bottom:10px"> </div>
 <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">No se detectaron documentos descargables</div>
 <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:4px">
 La página cargó pero no contiene archivos (PDF, ZIP, DOC…) en su HTML estático:
 </div>
 <a :href="docsUrl" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-weight:600;font-size:.85rem;margin-top:10px">
 Abrir licitación
 </a>
 </div>
 <!-- Documentos encontrados -->
 <div v-else-if="docsState==='ok'">
 <div style="margin-bottom:12px">
 <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
 <input type="checkbox" v-model="seleccionarTodos" @change="toggleTodosDocumentos">
 <strong>Seleccionar todos ({{ docsData.documentos.length }})</strong>
 </label>
 <div style="background:rgba(59,130,246,.08);padding:7px 12px;border-radius:6px;font-size:.75rem;color:var(--text2);display:flex;align-items:center;gap:6px">
 Portal: {{ docsData.portal }}
 <span v-if="docsData.method==='api'"
 style="margin-left:auto;background:var(--green);color:white;border-radius:4px;padding:1px 6px;font-size:.7rem">
 API oficial
 </span>
 </div>
 </div>
 <div v-for="doc in docsData.documentos" :key="doc.url"
 style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
 <input type="checkbox" v-model="docsSeleccionados" :value="doc.url" style="flex-shrink:0">
 <span style="font-size:1.2rem;flex-shrink:0">{{ doc.tipo==='PDF'?' ':' ' }}</span>
 <div style="flex:1;min-width:0">
 <div style="font-size:.85rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="doc.nombre">{{ doc.nombre }}</div>
 <div style="font-size:.7rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="doc.url">
 {{ doc.url.substring(0,70) }}{{ doc.url.length>70?'…':'' }}
 </div>
 </div>
 <a :href="doc.url" target="_blank" rel="noopener"
 class="btn btn-ghost btn-sm" style="flex-shrink:0;padding:4px 10px;font-size:.75rem"> </a>
 </div>
 </div>
 <!-- Error -->
 <div v-else-if="docsState==='error'" style="padding:28px 20px">
 <div style="font-size:2rem;margin-bottom:10px"> </div>
 <div class="empty-title">Error de conexión</div>
 <p style="margin:8px 0;font-size:.85rem">No se pudo conectar con el servidor.</p>
 <a :href="docsUrl" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 16px;background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-size:.85rem">
 Abrir portal manualmente
 </a>
 <p style="margin-top:12px;font-size:.72rem;color:var(--text2)">{{ docsError }}</p>
 </div>
 </div>
 <div class="modal-foot" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
 <button v-if="docsState==='ok' && docsSeleccionados.length > 0"
 class="btn btn-primary" :disabled="zipLoading" @click="descargarZip">
 {{ zipLoading ? 'Generando ZIP…' : ` Descargar seleccionados (${docsSeleccionados.length})` }}
 </button>
 <span v-else></span>
 <button class="btn btn-ghost" @click="showDocsModal=false">Cerrar</button>
 </div>
 </div>
 </div>
 </Teleport>

 <!-- Modal: generador de documentos -->
 <Teleport to="body">
 <div v-if="showGenModal" class="modal-overlay" style="display:flex;z-index:1002"
 @click.self="showGenModal=false">
 <div class="modal" style="max-width:800px;width:90%" @click.stop>
 <div class="modal-head">
 <div class="modal-title"> Asistente IA — Generar documento</div>
 <button class="modal-close" @click="showGenModal=false" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 <div class="modal-body" style="max-height:70vh;overflow-y:auto;padding:20px">
 <!-- Licitación info -->
 <div style="margin-bottom:20px">
 <label style="display:block;margin-bottom:8px;font-weight:600"> Licitación seleccionada</label>
 <div style="background:var(--surface2);padding:12px;border-radius:8px;font-size:.85rem">
 <strong>{{ genLicit?.objeto || 'Sin objeto' }}</strong>
 <div style="margin-top:4px;color:var(--text2);font-size:.75rem">
 {{ genLicit?.organo ? ` ${genLicit.organo}` : '' }}
 {{ genLicit?.cpv ? ` | CPV: ${genLicit.cpv}` : '' }}
 </div>
 </div>
 </div>
 <!-- Tipo de documento -->
 <div style="margin-bottom:20px">
 <label style="display:block;margin-bottom:8px;font-weight:600"> Tipo de documento</label>
 <div style="display:flex;flex-wrap:wrap;gap:8px">
 <button v-for="tipo in TIPOS_DOCUMENTO" :key="tipo.id"
 @click="generarDocumento(tipo.id, tipo.nombre)"
 :style="`padding:8px 16px;background:${genTipoId===tipo.id?'var(--accent)':'var(--surface)'};color:${genTipoId===tipo.id?'white':'var(--text)'};border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:.8rem`">
 {{ tipo.nombre }}
 </button>
 </div>
 </div>
 <!-- Preview -->
 <div v-if="genPhase !== 'idle'">
 <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
 <label style="font-weight:600"> Documento generado</label>
 <div v-if="genPhase==='generating'" class="ia-spinner"></div>
 </div>
 <div v-if="genPhase==='generating'"
 style="border:1px solid var(--border);border-radius:8px;padding:20px;text-align:center;color:var(--text2)">
 <div class="ia-spinner" style="margin:0 auto 12px"></div>
 Generando documento con IA…
 </div>
 <pre v-else-if="genPhase==='done'"
 style="border:1px solid var(--border);border-radius:8px;padding:20px;background:var(--surface);font-family:'Instrument Sans',sans-serif;font-size:.85rem;line-height:1.6;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-word">{{ genContent }}</pre>
 <div v-else-if="genPhase==='error'"
 style="border:1px solid var(--red);border-radius:8px;padding:20px;color:var(--red);font-size:.85rem">
 {{ genError }}
 </div>
 </div>
 </div>
 <div class="modal-foot" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
 <div>
 <button v-if="genPhase==='done'" class="btn btn-primary" @click="regenerarDocumento"> Regenerar</button>
 <button v-if="genPhase==='done'" class="btn" style="background:#10b981;color:white;border:none;margin-left:8px" @click="descargarDocumento"> Descargar</button>
 </div>
 <button class="btn btn-ghost" @click="showGenModal=false">Cerrar</button>
 </div>
 </div>
 </div>
 </Teleport>

 <!-- Modal: seguimientos -->
 <Teleport to="body">
 <div v-if="showSeguimientosModal" class="modal-overlay" style="display:flex;z-index:1001"
 @click.self="showSeguimientosModal=false">
 <div class="modal" style="max-width:600px;width:90%" @click.stop>
 <div class="modal-head">
 <div class="modal-title"> Licitaciones en seguimiento</div>
 <button class="modal-close" @click="showSeguimientosModal=false" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 <div class="modal-body" style="max-height:60vh;overflow-y:auto">
 <div v-if="seguimientosCount===0" class="empty-state" style="padding:40px">
 <div class="empty-icon"></div>
 <div class="empty-title">No hay seguimientos</div>
 <div class="empty-sub">Marca una licitación con para seguirla</div>
 </div>
 <div v-else style="display:flex;flex-direction:column;gap:12px">
 <div v-for="(seg, id) in seguimientos" :key="id"
 style="border:1px solid var(--border);border-radius:8px;padding:12px">
 <div style="display:flex;justify-content:space-between;align-items:flex-start">
 <div style="flex:1">
 <div style="font-weight:600;margin-bottom:4px">{{ seg.nombre || 'Licitación' }}</div>
 <div style="font-size:.7rem;color:var(--text2);display:flex;gap:12px;flex-wrap:wrap">
 <span> {{ new Date(seg.fechaInicio).toLocaleDateString() }}</span>
 <span> {{ seg.ultimoEstado }}</span>
 <span v-if="seg.importe"> {{ fmt(seg.importe) }}</span>
 </div>
 </div>
 <button class="btn btn-ghost btn-sm" style="color:var(--red)"
 @click="borrarSeguimiento(id)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 </div>
 </div>
 </div>
 <div class="modal-foot" style="padding:12px 20px;border-top:1px solid var(--border)">
 <button class="btn btn-ghost" @click="showSeguimientosModal=false">Cerrar</button>
 </div>
 </div>
 </div>
 </Teleport>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue'
import { useLicitacionesStore } from '../stores/licitaciones.js'
import { formatEUR } from '../stores/licitaciones.js'

const store = useLicitacionesStore()

// Constantes 
const SECTORES_LISTA = [
 'Tecnología e informática','Construcción y obras','Limpieza y mantenimiento',
 'Consultoría y servicios profesionales','Suministros y equipamiento',
 'Servicios de salud y sociales','Transporte y logística','Servicios de seguridad',
 'Ingeniería y arquitectura','Comunicación y marketing','Formación y educación',
 'Medio ambiente y sostenibilidad','Otro / General'
]
const SECTOR_CPV = {
 'Tecnología e informática': ['72','48','30','31','32','35','38','50','51','64','73','79','80'],
 'Construcción y obras': ['45'],
 'Limpieza y mantenimiento': ['90','77','50'],
 'Consultoría y servicios profesionales': ['79','73','72','80']
}
const TIPOS_DOCUMENTO = [
 { id:'presentacion', nombre:' Carta de presentación' },
 { id:'tecnica', nombre:' Oferta técnica' },
 { id:'economica', nombre:' Oferta económica' },
 { id:'anexos', nombre:' Anexos' },
 { id:'cv', nombre:' Perfil del equipo' }
]
const PROMPTS_TIPO = {
 presentacion: 'Redacta una carta de presentación formal y profesional para presentar la oferta.',
 tecnica: 'Redacta una oferta técnica detallada: solución propuesta, metodología, equipo, cronograma, calidad.',
 economica: 'Redacta una oferta económica estructurada: desglose de costes, precio total, justificación, condiciones.',
 anexos: 'Redacta los anexos: declaraciones responsables, certificaciones, referencias de trabajos similares.',
 cv: 'Redacta perfiles del equipo: director de proyecto, técnicos principales, especialistas.'
}
// seguimientos almacenados en Supabase via /api/seguimientos

// Estado de la pestaña 
const sector = ref('Tecnología e informática')
const scope = ref('filtered')
const iaLimit = ref(10)
const importeMin = ref(0)
const importeMaxStr = ref('')
const umbralConc = ref(60)

const lugaresExcluidos = ref(new Set())
const lugarSearch = ref('')
const lugarDropdownVisible = ref(false)
const lugarDropdownOpts = ref([])
const lugarFocusIdx = ref(-1)

const iaResults = ref([])
const iaSource = ref([])
const iaOffset = ref(0)
const loading = ref(false)
const progressText = ref('Analizando...')
const progressPct = ref(0)
const filtroVeredicto = ref(null)
const sortBy = ref('puntuacion')
const sortDir = ref('desc')
const iaPage = ref(1)

const groqCache = reactive({})
const groqLoading = reactive({})
const groqEnCurso = ref(0)
const GROQ_MAX = 2

// Modales
const showDocsModal = ref(false)
const docsTitle = ref('')
const docsLoading = ref(false)
const docsState = ref('') // jsRendered | blocked | empty | ok | error
const docsData = ref(null)
const docsUrl = ref('')
const docsEnlacePerfil = ref('')
const docsError = ref('')
const docsSeleccionados = ref([])
const seleccionarTodos = ref(false)
const zipLoading = ref(false)

const showGenModal = ref(false)
const genLicit = ref(null)
const genPhase = ref('idle') // idle | generating | done | error
const genContent = ref('')
const genError = ref('')
const genTipoId = ref('')
const genTipoNombre = ref('')

const showSeguimientosModal = ref(false)
const seguimientos = ref({})

const showDetalleModal = ref(false)
const detalleLicit = ref(null)

function openDetalleModal(licit) {
 detalleLicit.value = licit
 showDetalleModal.value = true
}
function detalleField(licit, key) {
 return licit[key] != null && licit[key] !== '' ? String(licit[key]) : null
}
function detalleImporte(licit, key) {
 const v = parseAmount(licit[key])
 return v ? formatEUR(v) : null
}
function detalleLink(licit) {
 const l = licit.link || ''
 return l.startsWith('http') && !l.includes('!ut/p/') ? l : null
}
function detallePerfil(licit) {
 const l = licit.enlacePerfil || ''
 return l.startsWith('http') && !l.includes('!ut/p/') ? l : null

}

// Seguimientos (API — Supabase via backend)
async function loadSeguimientos() {
 try {
  const res = await fetch('/api/seguimientos', { credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const map = {}
  for (const seg of (json.data || [])) {
   map[seg.identificador] = {
    nombre: seg.nombre || '(sin nombre)',
    expediente: seg.expediente || '—',
    ultimoEstado: seg.estado_al_marcar || '—',
    importe: seg.importe || 0,
    fechaInicio: seg.created_at
   }
  }
  seguimientos.value = map
 } catch(e) {
  console.warn('[seguimientos] Error cargando:', e.message)
  seguimientos.value = {}
 }
}
function enSeguimiento(licit) {
 return !!seguimientos.value[licit.id || licit.expediente || licit.objeto]
}
async function toggleSeguimiento(licit) {
 const identificador = licit.id || licit.expediente || licit.objeto
 if (!identificador) return
 if (seguimientos.value[identificador]) {
  // Eliminar — optimistic UI
  const backup = { ...seguimientos.value }
  delete seguimientos.value[identificador]
  seguimientos.value = { ...seguimientos.value }
  try {
   const res = await fetch(`/api/seguimientos/${encodeURIComponent(identificador)}`, {
    method: 'DELETE', credentials: 'include'
   })
   if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch(e) {
   seguimientos.value = backup // revertir si falla
   console.error('[seguimientos] Error al eliminar:', e.message)
  }
 } else {
  // Añadir — optimistic UI
  const payload = {
   identificador,
   nombre:     licit.objeto || 'Licitación',
   expediente: licit.expediente || '',
   estado:     licit.estado || '—',
   importe:    licit._importeConIVA || parseAmount(licit.presupuestoConIVA) || 0,
  }
  seguimientos.value = {
   ...seguimientos.value,
   [identificador]: {
    nombre: payload.nombre,
    expediente: payload.expediente,
    ultimoEstado: payload.estado,
    importe: payload.importe,
    fechaInicio: new Date().toISOString()
   }
  }
  try {
   const res = await fetch('/api/seguimientos', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
   })
   if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch(e) {
   // Revertir si falla
   const copy = { ...seguimientos.value }
   delete copy[identificador]
   seguimientos.value = copy
   console.error('[seguimientos] Error al añadir:', e.message)
  }
 }
}
async function borrarSeguimiento(identificador) {
 const backup = { ...seguimientos.value }
 delete seguimientos.value[identificador]
 seguimientos.value = { ...seguimientos.value }
 try {
  const res = await fetch(`/api/seguimientos/${encodeURIComponent(identificador)}`, {
   method: 'DELETE', credentials: 'include'
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
 } catch(e) {
  seguimientos.value = backup
  console.error('[seguimientos] Error al borrar:', e.message)
 }
}

// Modal generador de documentos 
function openGenModal(licit) {
 genLicit.value = licit
 genPhase.value = 'idle'
 genContent.value = ''
 genError.value = ''
 genTipoId.value = ''
 genTipoNombre.value = ''
 showGenModal.value = true
}
async function generarDocumento(tipoId, tipoNombre) {
 genTipoId.value = tipoId
 genTipoNombre.value = tipoNombre
 genPhase.value = 'generating'
 genContent.value = ''
 genError.value = ''
 const licit = genLicit.value
 const imp = licit._importeConIVA || parseAmount(licit.presupuestoConIVA) || 0
 const impTexto = imp > 0 ? imp.toLocaleString('es-ES',{style:'currency',currency:'EUR'}) : 'No especificado'
 const san = v => String(v||'').replace(/[ -]/g,' ').replace(/\s+/g,' ').trim().slice(0,300)||'No especificado'
 const instruccion = PROMPTS_TIPO[tipoId] || 'Redacta el documento correspondiente.'
 const prompt = `${instruccion}

DATOS DE LA LICITACIÓN:
Objeto: ${san(licit.objeto)}
Órgano de contratación: ${san(licit.organo)}
Expediente: ${san(licit.expediente)}
CPV: ${san(licit.cpv)}
Presupuesto: ${impTexto}
Tipo de procedimiento: ${san(licit.tipoProcedimiento)}
Estado: ${san(licit.estado)}
Lugar de ejecución: ${san(licit.lugarEjecucion)}

INSTRUCCIONES:
- Usa un tono profesional y formal.
- Adapta el contenido específicamente a esta licitación.
- Incluye todos los apartados habituales del documento.`
 try {
  const res = await fetch('/api/ia/groq', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.5 })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const env = await res.json()
  const txt = env.data?.choices?.[0]?.message?.content?.trim() ?? env.choices?.[0]?.message?.content?.trim() ?? null
  if (!txt) throw new Error('Respuesta vacía')
  genContent.value = txt
  genPhase.value = 'done'
 } catch(err) {
  genError.value = err.message || 'Error desconocido'
  genPhase.value = 'error'
 }
}
function regenerarDocumento() {
 generarDocumento(genTipoId.value, genTipoNombre.value)
}
async function copiarPortapapeles() {
 try {
  await navigator.clipboard.writeText(genContent.value)
  showToast('Copiado al portapapeles', 'ok')
 } catch { showToast('No se pudo copiar', 'error') }
}

// Modal documentos 
async function openDocsModal(licit) {
 const link = licit.link || ''
 const enlacePerfil = licit.enlacePerfil || ''
 const urlDirecta = (link.startsWith('http') && !link.includes('!ut/p/')) ? link
                  : (enlacePerfil.startsWith('http') && !enlacePerfil.includes('!ut/p/')) ? enlacePerfil
                  : null
 docsTitle.value = `Documentos — ${(licit.objeto||'Licitación').substring(0,55)}…`
 docsEnlacePerfil.value = (enlacePerfil.startsWith('http') && !enlacePerfil.includes('!ut/p/')) ? enlacePerfil : ''
 docsSeleccionados.value = []
 seleccionarTodos.value = false
 showDocsModal.value = true
 if (!urlDirecta) { docsState.value = 'empty'; docsLoading.value = false; return }
 docsUrl.value = urlDirecta
 docsState.value = ''
 docsLoading.value = true
 docsData.value = null
 docsError.value = ''
 try {
  const res = await fetch(`/api/documentos/scrape?url=${encodeURIComponent(urlDirecta)}`)
  if (!res.ok) {
   if (res.status === 403) { docsState.value = 'blocked'; docsLoading.value = false; return }
   throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json()
  docsData.value = data
  if (data.jsRendered) { docsState.value = 'jsRendered' }
  else if (!data.documentos?.length) { docsState.value = 'empty' }
  else { docsState.value = 'ok' }
 } catch(err) {
  docsError.value = err.message
  docsState.value = 'error'
 } finally {
  docsLoading.value = false
 }
}
function toggleTodosDocumentos() {
 if (seleccionarTodos.value) {
  docsSeleccionados.value = (docsData.value?.documentos || []).map(d => d.url)
 } else {
  docsSeleccionados.value = []
 }
}
async function descargarZip() {
 if (!docsSeleccionados.value.length) return
 zipLoading.value = true
 try {
  const res = await fetch('/api/documentos/descargar', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ urls: docsSeleccionados.value, nombre: docsTitle.value.slice(0,40) })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'documentos_licitacion.zip'
  a.click()
  URL.revokeObjectURL(a.href)
 } catch(err) {
  showToast('Error al descargar: ' + err.message, 'error')
 } finally {
  zipLoading.value = false
 }
}

// Renderizado Groq 
function renderGroqHTML(texto) {
 if (!texto) return ''
 return renderFallback(texto)
}
function renderFallback(txt) {
 return txt.split('\n').map(l => {
  const t = l.trim()
  if (!t) return '<br>'
  if (/^#{1,3}\s+/.test(t)) return `<h4 class="groq-h">${t.replace(/^#{1,3}\s+/,'')}</h4>`
  if (/^[-*•]\s+/.test(t)) return `<div class="groq-li">· ${t.replace(/^[-*•]\s+/,'').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</div>`
  if (/^\d+[.)⃣]/.test(t)) return `<div class="groq-li"><strong>${t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</strong></div>`
  return `<p class="groq-p">${t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</p>`
 }).join('')
}

// Helpers 
function fmt(v) { return formatEUR(v) }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function parseAmount(s) {
 if (!s) return 0
 const n = parseFloat(String(s).replace(/[€$£\s]/g,'').replace(/\./g,'').replace(/,/,'.'))
 return isNaN(n) ? 0 : n
}
function parseFecha(s) {
 if (!s) return null
 try {
 const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
 if (m) { let y=parseInt(m[3]); if(y<100) y+=2000; return new Date(y, parseInt(m[2])-1, parseInt(m[1])).getTime() }
 return new Date(s).getTime()
 } catch { return null }
}
function fechaDisplay(licit) {
 return licit.fechaActualizacion || licit.primeraPublicacion || licit.fechaOfertas || ''
}
// Devuelve una URL estable al portal de contratación, o null si no hay ninguna disponible.
// El campo link_licitacion puede contener:
//   - Links directos de cualquier portal (contractaciopublica.cat, PLACE deeplinks, etc.) → usar siempre ✓
//   - URLs de sesión WebSphere: !ut/p/z1/... → expiran con la sesión ✗
// Prioridad: link directo → búsqueda por expediente en PLACE → null
function portalUrl(licit) {
 // Solo usar el link directo almacenado. Sin fallbacks inventados.
 const link = licit.link || ''
 return (link.startsWith('http') && !link.includes('!ut/p/')) ? link : null
}
function importeCard(licit) {
 const v = licit._importeConIVA || parseAmount(licit.presupuestoConIVA) || 0
 return v ? fmt(v) : ''
}
function groqKey(licit) {
 const san = v => String(v||'').replace(/[\x00-\x1F\x7F]/g,' ').replace(/\s+/g,' ').trim().slice(0,60)
 return san(licit.id || licit.expediente || licit.objeto)
}

// Computed 
const quedan = computed(() => Math.max(0, iaSource.value.length - iaOffset.value))
const avgPuntuacion = computed(() => {
 if (!iaResults.value.length) return '0'
 return (iaResults.value.reduce((s,r) => s + r.result.puntuacion, 0) / iaResults.value.length).toFixed(1)
})
function countVeredicto(v) { return iaResults.value.filter(r => r.result.veredicto === v).length }

const baseIA = computed(() => {
 const arr = filtroVeredicto.value
 ? iaResults.value.filter(r => r.result.veredicto === filtroVeredicto.value)
 : iaResults.value
 return [...arr].sort((a,b) => {
 let c = 0
 if (sortBy.value === 'fecha') {
 c = (parseFecha(fechaDisplay(a.licit))||0) - (parseFecha(fechaDisplay(b.licit))||0)
 } else if (sortBy.value === 'importe') {
 c = (a.licit._importeConIVA||0) - (b.licit._importeConIVA||0)
 } else {
 const ord = {'RECOMENDABLE':0,'NEUTRAL':1,'NO RECOMENDABLE':2}
 c = (ord[a.result.veredicto]-ord[b.result.veredicto]) || (a.result.puntuacion - b.result.puntuacion)
 }
 return sortDir.value === 'asc' ? c : -c
 })
})

const totalIAPages = computed(() => Math.ceil(baseIA.value.length / iaLimit.value))
const iaPageStart = computed(() => (iaPage.value-1)*iaLimit.value+1)
const iaPageEnd = computed(() => Math.min(iaPage.value*iaLimit.value, baseIA.value.length))
const paginaIA = computed(() => {
 const s = (iaPage.value-1)*iaLimit.value
 return baseIA.value.slice(s, s+iaLimit.value)
})
const iaPagButtons = computed(() => {
 const total = totalIAPages.value, cur = iaPage.value
 if (total <= 7) return Array.from({length:total},(_,i)=>i+1)
 const p=[1]
 if (cur>3) p.push('...')
 for(let i=Math.max(2,cur-1);i<=Math.min(total-1,cur+1);i++) p.push(i)
 if(cur<total-2) p.push('...')
 p.push(total)
 return p
})
const seguimientosCount = computed(() => Object.keys(seguimientos.value).length)

// Veredicto helpers 
function veredictoClass(v) { return v==='RECOMENDABLE'?'ia-green':v==='NEUTRAL'?'ia-amber':'ia-red' }
function veredictoIcon(v) { return v==='RECOMENDABLE'?' ':v==='NEUTRAL'?' ':' ' }
function veredictobadge(v) { return v==='RECOMENDABLE'?'badge-green':v==='NEUTRAL'?'badge-amber':'badge-red' }
function veredictoBadge(v) { return veredictobadge(v) }
// (alias para la plantilla que usa veredictoBadge)

// Lugar filter 
function getAllLugares() {
 return [...new Set(store.datos.flatMap(r => [r.lugarEjecucion, r.lugarLote].filter(Boolean)))].sort((a,b)=>a.localeCompare(b,'es'))
}
function onLugarInput() {
 const q = lugarSearch.value.trim().toLowerCase()
 lugarFocusIdx.value = -1
 if (!q) { lugarDropdownVisible.value = false; return }
 const opts = getAllLugares().filter(v => v.toLowerCase().includes(q) && !lugaresExcluidos.value.has(v))
 lugarDropdownOpts.value = opts.slice(0, 40)
 lugarDropdownVisible.value = !!opts.length
}
function onLugarKey(e) {
 if (!lugarDropdownVisible.value) return
 if (e.key==='ArrowDown') { e.preventDefault(); lugarFocusIdx.value = Math.min(lugarFocusIdx.value+1, lugarDropdownOpts.value.length-1) }
 else if (e.key==='ArrowUp') { e.preventDefault(); lugarFocusIdx.value = Math.max(lugarFocusIdx.value-1, 0) }
 else if (e.key==='Enter') { e.preventDefault(); if(lugarFocusIdx.value>=0) lugarAdd(lugarDropdownOpts.value[lugarFocusIdx.value]) }
 else if (e.key==='Escape') lugarDropdownVisible.value = false
}
function lugarAdd(v) {
 lugaresExcluidos.value = new Set([...lugaresExcluidos.value, v])
 lugarSearch.value = ''
 lugarDropdownVisible.value = false
}
function lugarRemove(v) {
 const s = new Set(lugaresExcluidos.value)
 s.delete(v)
 lugaresExcluidos.value = s
}
function lugarLimpiar() { lugaresExcluidos.value = new Set() }
function highlightLugar(opt) {
 const q = lugarSearch.value.trim().toLowerCase()
 if (!q) return esc(opt)
 const idx = opt.toLowerCase().indexOf(q)
 if (idx < 0) return esc(opt)
 return esc(opt.slice(0,idx)) + '<mark>' + esc(opt.slice(idx,idx+q.length)) + '</mark>' + esc(opt.slice(idx+q.length))
}

// Motor de análisis 
function cpvMatchSector(cpvStr, sec) {
 if (!cpvStr?.trim()) return null
 const cpv = cpvStr.trim().replace(/\s/g,'')
 const pref = SECTOR_CPV[sec] || []
 if (!pref.length) return true
 return pref.some(p => cpv.startsWith(p))
}
function analizarConcentracion(organo) {
 const contratos = store.datos.filter(r => r.organo === organo && r.adjudicatario)
 if (!contratos.length) return { concentrada:false, bloqueante:false, pctMax:0, top:[], total:0, adjUnico:false, nombreTop:'' }
 const total = contratos.length
 const porAdj = {}
 contratos.forEach(r => { const k=r.adjudicatario.trim().toUpperCase(); porAdj[k]=(porAdj[k]||0)+1 })
 const sorted = Object.entries(porAdj).sort((a,b) => b[1]-a[1])
 const pctMax = (sorted[0][1]/total)*100
 const top = sorted.slice(0,3).map(([adj,n]) => ({adj,n,pct:(n/total*100).toFixed(1)}))
 const umbral = isNaN(umbralConc.value) ? 60 : Math.max(0, Math.min(100, umbralConc.value))
 return { concentrada:pctMax>=umbral, bloqueante:pctMax>=umbral&&total>=2, pctMax:parseFloat(pctMax.toFixed(1)), top, total, totalAdj:sorted.length, adjUnico:sorted.length===1, nombreTop:sorted[0][0] }
}
function analizarCompetencia(numOfertasStr, ofertaBajaStr, ofertaAltaStr) {
 const n = parseInt(numOfertasStr)||0
 const baja = parseAmount(ofertaBajaStr), alta = parseAmount(ofertaAltaStr)
 let nivelComp = n===0?'desconocido':n===1?'sin_competencia':n<=3?'baja':n<=7?'media':'alta'
 const dispersion = (baja>0&&alta>0) ? ((alta-baja)/baja*100).toFixed(0) : null
 return { nOfertas:n, nivelComp, dispersion, baja, alta }
}
function analizarLicitacion(licit, sec) {
 let puntos = 5
 const favor = [], contra = [], consejos = []
 const matchCpv = cpvMatchSector(licit.cpv, sec)
 if (matchCpv===false) { puntos-=3; contra.push(`CPV (${licit.cpv}) no corresponde al sector "${sec}"`); consejos.push('Verifica si tu empresa puede justificar capacidad en este CPV.') }
 else if (matchCpv===true) { puntos+=2; favor.push(`CPV ${licit.cpv} alineado con tu sector`) }
 const conc = analizarConcentracion(licit.organo)
 if (conc.bloqueante) { puntos=1; contra.push(`BLOQUEANTE: ${conc.pctMax}% de contratos van a "${conc.nombreTop}"`); consejos.push('Mercado cerrado. No recomendable.') }
 else if (conc.concentrada) { puntos-=3; contra.push(`Alta concentración: ${conc.pctMax}% a "${conc.nombreTop}"`); consejos.push('Diferénciate claramente.') }
 else if (conc.total>=2) { puntos+=2; favor.push(`Órgano diversificado (${conc.totalAdj} adjudicatarios)`) }
 else if (conc.total===0) { favor.push('Sin historial — mercado abierto') }
 const comp = analizarCompetencia(licit.numOfertas, licit.ofertaMasBaja, licit.ofertaMasAlta)
 if (comp.nivelComp==='sin_competencia') { puntos+=1; favor.push('Solo 1 oferta anterior') }
 else if (comp.nivelComp==='baja') { puntos+=2; favor.push(`Competencia baja: ${comp.nOfertas} ofertas`) }
 else if (comp.nivelComp==='media') { favor.push(`Competencia moderada: ${comp.nOfertas} ofertas`) }
 else if (comp.nivelComp==='alta') { puntos-=2; contra.push(`Alta competencia: ${comp.nOfertas} ofertas`) }
 if (comp.dispersion!==null) {
 if (parseFloat(comp.dispersion)>30) { puntos+=1; favor.push(`Gran dispersión de precios (${comp.dispersion}%)`) }
 else if (parseFloat(comp.dispersion)<10) { puntos-=1; contra.push(`Precios muy ajustados (${comp.dispersion}%)`) }
 }
 const importe = (licit._importeConIVA>0?licit._importeConIVA:0) || parseAmount(licit.presupuestoConIVA) || parseAmount(licit.presupuestoSinIVA) || 0
 const impMax = importeMaxStr.value ? parseFloat(importeMaxStr.value) : Infinity
 if (importe>0 && importeMin.value>0 && importe<importeMin.value) { puntos=1; contra.push(`BLOQUEANTE: Importe (${fmt(importe)}) < mínimo (${fmt(importeMin.value)})`) }
 else if (importe>0 && impMax<Infinity && importe>impMax) { puntos=1; contra.push(`BLOQUEANTE: Importe (${fmt(importe)}) > máximo (${fmt(impMax)})`) }
 else if (importe>=500000) { puntos+=1; favor.push(`Alto valor: ${fmt(importe)}`) }
 else if (importe>0 && importe<5000) { puntos-=1; contra.push(`Importe bajo (${fmt(importe)})`) }
 else if (importe>=5000) { favor.push(`Importe razonable: ${fmt(importe)}`) }
 const proc = (licit.tipoProcedimiento||'').toLowerCase()
 if (proc.includes('abierto')) { puntos+=1; favor.push('Procedimiento abierto') }
 else if (proc.includes('negociado sin')) { puntos-=2; contra.push('Negociado sin publicidad') }
 else if (proc.includes('negociado con')||proc.includes('restringido')) { puntos-=1; contra.push('Procedimiento limitado') }
 const estado = (licit.estado||'').toLowerCase()
 if (/adjudicad|resuelt/.test(estado)) { puntos=1; contra.push('Ya adjudicada') }
 else if (/desistid|renunci/.test(estado)) { puntos=1; contra.push('Desistida') }
 else if (/pendiente/.test(estado)) { puntos+=1; favor.push('Pendiente de adjudicación') }
 puntos = Math.max(1, Math.min(10, puntos))
 let veredicto, resumen
 if (puntos>=7) { veredicto='RECOMENDABLE'; resumen='Buena oportunidad: mercado accesible y condiciones favorables.' }
 else if (puntos>=4) { veredicto='NEUTRAL'; resumen='Evaluar con detalle: hay riesgos relevantes.' }
 else { veredicto='NO RECOMENDABLE'; resumen='Riesgo elevado o baja probabilidad de éxito.' }
 const consejo = consejos[0] || (veredicto==='RECOMENDABLE'?'Prepara una propuesta técnica sólida.':(veredicto==='NEUTRAL'?'Analiza coste vs beneficio.':'Solo participar si tienes ventaja clara.'))
 return { veredicto, puntuacion:puntos, resumen, puntos_favor:favor, puntos_contra:contra, consejo }
}

// Ejecución del análisis 
function runAnalysis() {
 if (!sector.value) { alert('Selecciona tu sector antes de analizar.'); return }
 let sourceBase = scope.value === 'filtered'
 ? (window.filteredData?.length ? [...window.filteredData] : [...store.datos])
 : [...store.datos]
 if (lugaresExcluidos.value.size > 0) {
 sourceBase = sourceBase.filter(r => !lugaresExcluidos.value.has(r.lugarEjecucion||r.lugarLote||''))
 }
 if (!sourceBase.length) { alert('No hay licitaciones para analizar.'); return }
 iaSource.value = sourceBase
 iaResults.value = []
 iaOffset.value = 0
 iaPage.value = 1
 filtroVeredicto.value = null
 loading.value = true
 analizarBloque()
}

function analizarBloque() {
 const bloque = iaSource.value.slice(iaOffset.value, iaOffset.value + iaLimit.value)
 if (!bloque.length) { loading.value = false; return }
 progressText.value = `Analizando ${iaOffset.value+1}–${Math.min(iaOffset.value+iaLimit.value, iaSource.value.length)} de ${iaSource.value.length}...`
 progressPct.value = (iaOffset.value / iaSource.value.length * 100)
 setTimeout(() => {
 try {
 const nuevos = bloque.map(licit => ({ licit, result: analizarLicitacion(licit, sector.value) }))
 iaResults.value = [...iaResults.value, ...nuevos]
 iaOffset.value += bloque.length
 loading.value = false
 } catch(err) {
 console.error('[IA] Error:', err)
 loading.value = false
 }
 }, 0)
}

function setFiltro(v) { filtroVeredicto.value = filtroVeredicto.value === v ? null : v; iaPage.value = 1 }
function setSortBy(c) { if(sortBy.value===c) sortDir.value = sortDir.value==='asc'?'desc':'asc'; else{sortBy.value=c;sortDir.value='desc'} }
function goIAPage(p) {
 if (p<1||p>totalIAPages.value) return
 iaPage.value = p
 document.getElementById('iaContent')?.scrollIntoView({ behavior:'smooth', block:'start' })
}

// Groq por card 
async function solicitarGroq(item) {
 const key = groqKey(item.licit)
 if (groqCache[key]) return
 while (groqEnCurso.value >= GROQ_MAX) { await new Promise(r=>setTimeout(r,300)) }
 groqEnCurso.value++
 groqLoading[key] = true

 const impTexto = (() => {
 const imp = item.licit._importeConIVA || parseAmount(item.licit.presupuestoConIVA) || 0
 return imp>0 ? imp.toLocaleString('es-ES',{style:'currency',currency:'EUR'}) : 'No especificado'
 })()
 const san = v => String(v||'').replace(/[\x00-\x1F\x7F]/g,' ').replace(/\s+/g,' ').trim().slice(0,300)||'No especificado'

 const prompt = `Eres un consultor senior en licitaciones públicas españolas.
OBJETIVO: Analizar esta licitación y determinar si es recomendable participar.

DATOS:
Objeto: ${san(item.licit.objeto)}
Sector usuario: ${san(sector.value)}
Órgano: ${san(item.licit.organo)}
CPV: ${san(item.licit.cpv)}
Presupuesto: ${impTexto}
Procedimiento: ${san(item.licit.tipoProcedimiento)}
Estado: ${san(item.licit.estado)}
Adjudicatario anterior: ${san(item.licit.adjudicatario)}
Veredicto automático: ${item.result.veredicto} (${item.result.puntuacion}/10)

FORMATO OBLIGATORIO:
1⃣ RESUMEN EJECUTIVO
2⃣ ¿ES RENOVACIÓN?
Veredicto: PROBABLE RENOVACIÓN / PROBABLEMENTE NUEVA / INDETERMINADO
3⃣ RIESGOS Y OPORTUNIDADES
4⃣ CHECKLIST DE CUMPLIMIENTO
5⃣ RECOMENDACIÓN FINAL
Estado: RECOMENDADA / EN ESTUDIO / DESCARTADA`

 try {
 const res = await fetch('/api/ia/groq', {
 method:'POST',
 headers:{'Content-Type':'application/json'},
 body: JSON.stringify({ messages:[{role:'user',content:prompt}], max_tokens:1000, temperature:0.4 })
   })
   if (!res.ok) throw new Error(`HTTP ${res.status}`)
   const env = await res.json()
   const txt = env.data?.choices?.[0]?.message?.content?.trim() ?? env.choices?.[0]?.message?.content?.trim() ?? null
   if (txt) groqCache[key] = txt
  } catch(err) {
   console.error('[Groq]', err)
  } finally {
   groqLoading[key] = false
   groqEnCurso.value--
  }
}

// Toast 
function showToast(msg, tipo='info') {
 const colores = { info:'#1d4ed8', ok:'#10b981', warn:'#f59e0b', error:'#ef4444' }
 const t = document.createElement('div')
 t.innerHTML = `<div style="position:fixed;bottom:20px;right:20px;z-index:10000;background:${colores[tipo]||colores.info};color:white;padding:12px 20px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,.4);font-size:.9rem;max-width:360px;font-weight:500;line-height:1.4">${msg}</div>`
 document.body.appendChild(t)
 setTimeout(() => t.remove(), 3000)
}
function onDataUpdated(e) { store.cargarDatos(e.detail || window.allData || []) }
onMounted(async () => {
 await loadSeguimientos()
 if (window.allData?.length) store.cargarDatos(window.allData)
 window.addEventListener('dataUpdated', onDataUpdated)
 window.updateVueData = (data) => store.cargarDatos(data || [])
})
onUnmounted(() => { window.removeEventListener('dataUpdated', onDataUpdated) })
</script>
