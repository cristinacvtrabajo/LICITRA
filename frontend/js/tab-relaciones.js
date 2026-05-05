/* 
   LICIT·LAB — tab-relaciones.js (Enterprise version con Worker)
   Dependencias: utils.js (escHtml, formatEUR)
*/

let worker;
let cache = new Map();
let currentResults = [];
let currentTerm = '';
const REL_PAGE_SIZE = 30;
let isLoadingMore = false;
let scrollHandlerAttached = false;

//  INICIALIZACIÓN 
function buildRelaciones() {
  // Verificar si hay datos
  if (!allData || allData.length === 0) {
    document.getElementById('relEmpty').style.display = 'block';
    document.getElementById('relContent').style.display = 'none';
    return;
  }
  
  document.getElementById('relEmpty').style.display = 'none';
  document.getElementById('relContent').style.display = 'block';
  
  // Limpiar estado anterior
  if (worker) {
    worker.terminate();
    worker = null;
  }
  cache.clear();
  currentResults = [];
  currentTerm = '';
  currentPage = 0;
  
  initWorker();
  attachEvents();
  attachScrollHandler();
}

function initWorker() {
  if (worker) {
    worker.terminate();
  }
  
  worker = new Worker('./Frontend/JS/worker-relaciones.js');

  worker.onmessage = (e) => {
    const data = e.data;
    
    if (data.type === 'INDEX_READY') {
      console.log('[Worker] Índice de relaciones construido con', allData.length, 'registros');
      // Si hay una búsqueda pendiente, ejecutarla
      const searchInput = document.getElementById('relSearch');
      if (searchInput && searchInput.value.trim().length >= 2) {
        performSearch(searchInput.value.trim());
      } else {
        // Mostrar resultados iniciales (primeros 30)
        applyFiltersToResults();
      }
    }
    
    if (data.type === 'RESULT') {
      const term = currentTerm;
      currentResults = data.payload;
      cache.set(term, currentResults);
      renderResults();
    }
  };

  // Enviar datos al worker
  worker.postMessage({
    type: 'BUILD_INDEX',
    payload: allData.slice() // Enviar copia
  });
}

function attachEvents() {
  const input = document.getElementById('relSearch');
  const minConc = document.getElementById('relMinConc');
  const sortBy = document.getElementById('relSortBy');
  
  if (!input) return;
  
  // Limpiar listener anterior clonando el nodo
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  
  newInput.addEventListener('input', debounce((e) => {
    const term = e.target.value.trim();
    currentTerm = term;
    
    if (term.length < 2) {
      currentResults = [];
      renderResults();
      return;
    }
    
    if (cache.has(term)) {
      currentResults = cache.get(term);
      renderResults();
      return;
    }
    
    performSearch(term);
    
  }, 300));
  
  if (minConc) {
    const newMinConc = minConc.cloneNode(true);
    minConc.parentNode.replaceChild(newMinConc, minConc);
    newMinConc.addEventListener('change', () => applyFiltersToResults());
  }
  
  if (sortBy) {
    const newSortBy = sortBy.cloneNode(true);
    sortBy.parentNode.replaceChild(newSortBy, sortBy);
    newSortBy.addEventListener('change', () => applyFiltersToResults());
  }
}

function performSearch(term) {
  if (!worker) {
    console.warn('[Relaciones] Worker no inicializado, reintentando...');
    initWorker();
    setTimeout(() => performSearch(term), 500);
    return;
  }
  
  worker.postMessage({
    type: 'SEARCH',
    payload: { term }
  });
}

function applyFiltersToResults() {
  const minConc = parseInt(document.getElementById('relMinConc')?.value || '1', 10);
  const sortKey = document.getElementById('relSortBy')?.value || 'score';
  
  let filtered = [];
  
  if (currentTerm && currentTerm.length >= 2 && cache.has(currentTerm)) {
    filtered = [...cache.get(currentTerm)];
  } else if (!currentTerm || currentTerm.length < 2) {
    // Sin búsqueda, mostrar resultados del worker? 
    // En este caso, necesitamos que el worker nos dé todos los resultados
    if (worker && !currentTerm) {
      // Si no hay término de búsqueda, simulamos búsqueda vacía para obtener todos
      worker.postMessage({
        type: 'SEARCH',
        payload: { term: '' }
      });
      return;
    }
    filtered = [...currentResults];
  } else {
    filtered = [...currentResults];
  }
  
  // Filtrar por concentración mínima
  filtered = filtered.filter(r => r.risk.n >= minConc);
  
  // Ordenar
  if (sortKey === 'amount') {
    filtered.sort((a, b) => b.risk.totalAmount - a.risk.totalAmount);
  } else if (sortKey === 'count') {
    filtered.sort((a, b) => b.risk.n - a.risk.n);
  } else {
    filtered.sort((a, b) => b.risk.score - a.risk.score);
  }
  
  currentResults = filtered;
  renderResults();
}

//  RENDER PRO (scroll infinito)
function renderResults() {
  const container = document.getElementById('relList');
  const summary = document.getElementById('relSummary');
  
  if (!container) return;
  
  // Mostrar resumen
  if (summary) {
    const highRisk = currentResults.filter(r => r.risk.score >= 80);
    const totalAmount = currentResults.reduce((s, r) => s + (r.risk.totalAmount || 0), 0);
    
    summary.innerHTML = `
      <div class="stat-card cyan">
        <div class="stat-label">Resultados encontrados</div>
        <div class="stat-value cyan">${currentResults.length}</div>
        <div class="stat-sub">pares Órgano→Empresa</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">Alta concentración</div>
        <div class="stat-value red">${highRisk.length}</div>
        <div class="stat-sub">score ≥80</div>
      </div>
      <div class="stat-card lime">
        <div class="stat-label">Importe total</div>
        <div class="stat-value lime">${formatEUR(totalAmount)}</div>
        <div class="stat-sub">adjudicado</div>
      </div>
    `;
  }
  
  // Alert de alto riesgo
  const alertEl = document.getElementById('relAlertHighRisk');
  const hasHighRisk = currentResults.some(r => r.risk.score >= 80);
  if (alertEl) {
    alertEl.style.display = hasHighRisk ? 'block' : 'none';
  }
  
  // Resetear paginación
  currentPage = 0;
  container.innerHTML = '';
  
  if (currentResults.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Sin resultados</div>
        <div class="empty-sub">Prueba con otro nombre de empresa u órgano contratante</div>
      </div>`;
    return;
  }
  
  // Renderizar primer chunk
  renderChunk();
}

function renderChunk() {
  const container = document.getElementById('relList');
  if (!container) return;
  
  const start = currentPage * REL_PAGE_SIZE;
  const end = start + REL_PAGE_SIZE;
  const slice = currentResults.slice(start, end);
  
  if (slice.length === 0) return;
  
  container.insertAdjacentHTML(
    'beforeend',
    slice.map(r => renderEnterpriseCard(r)).join('')
  );
  
  currentPage++;
}

function attachScrollHandler() {
  if (scrollHandlerAttached) return;
  
  const container = document.getElementById('relList');
  if (!container) return;
  
  const handleScroll = () => {
    if (!container || isLoadingMore) return;
    
    const scrollBottom = container.scrollTop + container.clientHeight;
    const threshold = container.scrollHeight - 200;
    
    if (scrollBottom >= threshold && currentPage * REL_PAGE_SIZE < currentResults.length) {
      isLoadingMore = true;
      renderChunk();
      setTimeout(() => { isLoadingMore = false; }, 100);
    }
  };
  
  container.addEventListener('scroll', handleScroll);
  scrollHandlerAttached = true;
}

//  CARD ENTERPRISE
function renderEnterpriseCard(r) {
  const risk = r.risk;
  
  const riskLevel = 
    risk.score >= 80 ? 'high' :
    risk.score >= 50 ? 'med' : 'low';
  
  const riskColor = 
    riskLevel === 'high' ? 'red' :
    riskLevel === 'med' ? 'amber' : 'lime';
  
  const concentrationPct = (risk.concentration * 100).toFixed(0);
  
  const tooltip = `📊 ${risk.n} contratos · ${formatEUR(risk.totalAmount)} · ${concentrationPct}% concentración`;
  
  return `
    <div class="rel-card risk-${riskLevel}" data-org="${escHtml(r.organo)}" data-adj="${escHtml(r.adjudicatario)}">
      <div class="rel-card-header">
        <div class="rel-org">
          <strong>🏛️ ${escHtml(r.organo)}</strong>
          <small>${escHtml(r.adjudicatario)}</small>
        </div>
        <div class="rel-risk-badge">
          <span class="badge badge-${riskColor}" title="${tooltip}">
            🔥 ${risk.score} pts · ${concentrationPct}%
          </span>
        </div>
      </div>
      
      <div class="rel-metrics" style="display:flex;gap:16px;margin:10px 0;font-size:.8rem;color:var(--text2)">
        <span>📋 ${risk.n} contrato${risk.n !== 1 ? 's' : ''}</span>
        <span>💰 ${formatEUR(risk.totalAmount)}</span>
        ${risk.avg > 0 ? `<span>📊 Promedio: ${formatEUR(risk.avg)}</span>` : ''}
      </div>
      
      <div class="rel-progress" style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin:8px 0">
        <div class="rel-progress-fill" style="width:${Math.min(100, risk.concentration * 100)}%;height:100%;background:var(--${riskColor})"></div>
      </div>
      
      <div class="rel-adjudicatarios" style="margin-top:10px">
        <div class="rel-adj-row" style="background:var(--surface2);border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
          <span class="rel-adj-name">${escHtml(r.adjudicatario)}</span>
          <div class="rel-adj-stats" style="display:flex;gap:16px;font-size:.75rem;font-family:'JetBrains Mono',monospace">
            <span><strong>${risk.n}</strong> contratos</span>
            <span><strong>${concentrationPct}%</strong> del órgano</span>
          </div>
        </div>
      </div>
      
      <div class="rel-card-footer" style="margin-top:12px;display:flex;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="verDetalleRelacion('${escHtml(r.organo).replace(/'/g, "\\'")}', '${escHtml(r.adjudicatario).replace(/'/g, "\\'")}')">
          📋 Ver contratos
        </button>
      </div>
    </div>
  `;
}

// Helper para ver detalle completo
function verDetalleRelacion(organo, adjudicatario) {
  if (!allData || !allData.length) return;
  
  const contratos = allData.filter(r => 
    r.organo === organo && 
    r.adjudicatario === adjudicatario
  );
  
  if (!contratos.length) return;
  
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  if (modalBody && modalTitle) {
    modalTitle.textContent = `Relación: ${organo} → ${adjudicatario}`;
    
    const totalImporte = contratos.reduce((s, r) => s + (r._importeConIVA || 0), 0);
    
    modalBody.innerHTML = `
      <div class="detail-grid">
        <div class="detail-section">Resumen</div>
        <div class="detail-item">
          <div class="detail-key">Contratos totales</div>
          <div class="detail-val"><strong>${contratos.length}</strong></div>
        </div>
        <div class="detail-item">
          <div class="detail-key">Importe total</div>
          <div class="detail-val amount">${formatEUR(totalImporte)}</div>
        </div>
        <div class="detail-section">Lista de contratos</div>
        <div class="detail-item full">
          <table style="width:100%;border-collapse:collapse;font-size:.8rem">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:6px">Objeto</th>
                <th style="text-align:right;padding:6px">Importe</th>
                <th style="text-align:left;padding:6px">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${contratos.slice(0, 20).map(c => `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:6px">${escHtml(c.objeto || '—').slice(0, 80)}${(c.objeto || '').length > 80 ? '…' : ''}</td>
                  <td style="padding:6px;text-align:right;font-family:'JetBrains Mono',monospace">${formatEUR(c._importeConIVA)}</td>
                  <td style="padding:6px">${badgeEstado(c.estado)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${contratos.length > 20 ? `<p style="margin-top:8px;font-size:.7rem;color:var(--text3)">... y ${contratos.length - 20} más</p>` : ''}
        </div>
      </div>
    `;
    
    document.getElementById('modalOverlay').classList.add('open');
  }
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function limpiarBusquedaRel() {
  const input = document.getElementById('relSearch');
  if (input) {
    input.value = '';
    currentTerm = '';
    currentResults = [];
    renderResults();
  }
}

// Re-exportar función global
window.verDetalleRelacion = verDetalleRelacion;
window.limpiarBusquedaRel = limpiarBusquedaRel;