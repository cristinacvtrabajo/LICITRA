/* 
 LICITRA — tab-ia.js
 Lógica de la pestaña "Recomendación IA":
 motor de reglas de puntuación + análisis narrativo vía Groq API (Manual),
 renderizado de tarjetas y paginación de resultados.
 Añadida ordenación por fecha, importe, etc.
 MEJORADO: Botón de documentos con múltiples estrategias de enlace
 */

// GROQ: caché de análisis narrativos 
const groqCache = new Map(); // key: licit.id o índice → texto narrativo
let groqEnCurso = 0; // peticiones simultáneas en vuelo
const GROQ_MAX_CONCURRENTE = 2; // máximo 2 a la vez para no saturar

/** groqSanear — definida en utils.js (cargado antes). No redeclarar aquí. */
// function groqSanear — ver utils.js

/** @deprecated usar groqSanear() de utils.js directamente */
function _groqSanearLegacy(val) {
 if (val === null || val === undefined) return 'No especificado';
 return String(val).replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || 'No especificado';
}

/* 
 RENDERER VISUAL — convierte el texto Markdown de Groq en HTML
 estructurado con las secciones del análisis.
 */

/**
 * Convierte el texto plano/markdown de Groq en HTML formateado
 * para las secciones del análisis de licitación.
 */
function groqRenderHTML(texto) {
 if (!texto) return '';

 // helpers 
 function esc(s) {
 return String(s || '')
 .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 }
 function bold(s) {
 return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
 }

 // Parsear tablas Markdown residuales → filas card 
 // (fallback por si Groq genera tabla a pesar del prompt)
 function renderTable(block) {
 const lines = block.trim().split('\n').filter(l => l.trim() && !l.match(/^\|[-| ]+\|$/));
 if (lines.length < 2) return `<p class="groq-p">${bold(block)}</p>`;
 const rows = lines.slice(1).map(l => l.split('|').map(c => c.trim()).filter(Boolean));
 return `<div class="groq-rows">${rows.map(r => `
 <div class="groq-row-card">
 <div class="groq-row-top">
 <span class="groq-row-title">${bold(r[0] || '')}</span>
 ${r[1] ? `<span class="groq-row-badge">${esc(r[1])}</span>` : ''}
 </div>
 ${r[2] ? `<div class="groq-row-extras"><div class="groq-row-extra">${bold(r[2])}</div></div>` : ''}
 </div>`).join('')}</div>`;
 }

 // Detectar badge de impacto/cumplimiento 
 function impactBadge(val) {
 const v = (val || '').toLowerCase();
 if (/alto|sí\b|si\b|recomendada/.test(v)) return `style="background:rgba(229,115,115,.15);color:#e57373"`;
 if (/medio|parcial|estudio/.test(v)) return `style="background:rgba(245,166,35,.15);color:#f5a623"`;
 if (/bajo|no\b|descartada/.test(v)) return `style="background:rgba(67,217,162,.15);color:#34d399"`;
 return '';
 }

 // Parsear listas 
 function renderList(block) {
 const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
 const items = [];
 let current = null;

 for (const line of lines) {
 if (/^→/.test(line) && current) {
 current.detail = line.replace(/^→\s*/, '');
 continue;
 }
 const mStructured = line.match(/^\*\*(.+?)\*\*\s*[·•]\s*(.+)$/);
 if (mStructured) {
 if (current) items.push(current);
 current = { title: mStructured[1], meta: mStructured[2], detail: null };
 continue;
 }
 const mSimple = line.match(/^[-*•]\s+(.+)$/) || line.match(/^\d+[.)]\s+(.+)$/);
 if (mSimple) {
 if (current) items.push(current);
 current = { title: null, meta: null, detail: mSimple[1] };
 continue;
 }
 if (current) {
 current.detail = (current.detail ? current.detail + ' ' : '') + line;
 } else {
 current = { title: null, meta: null, detail: line };
 }
 }
 if (current) items.push(current);

 return `<div class="groq-rows">${items.map(item => {
 if (item.title && item.meta) {
 const badge = impactBadge(item.meta);
 return `
 <div class="groq-row-card">
 <div class="groq-row-top">
 <span class="groq-row-title">${bold(item.title)}</span>
 <span class="groq-row-badge" ${badge}>${esc(item.meta)}</span>
 </div>
 ${item.detail ? `<div class="groq-row-detail">${bold(item.detail)}</div>` : ''}
 </div>`;
 }
 return `
 <div class="groq-row-simple">
 <span class="groq-row-bullet">›</span>
 <span>${bold(item.detail || item.title || '')}</span>
 </div>`;
 }).join('')}</div>`;
 }

 const SECCIONES = [
 { label: 'Resumen ejecutivo', color: '#1d4ed8', icon: '' },
 { label: '¿Es renovación?', color: '#f5a623', icon: '' },
 { label: 'Riesgos y oportunidades', color: '#34d399', icon: '' },
 { label: 'Checklist de cumplimiento', color: '#64b5f6', icon: '' },
 { label: 'Recomendación final', color: '#e57373', icon: '' },
 ];

 const SECTION_KEYWORDS = [
 /resumen\s*ejecutivo/i,
 /[¿¡]?\s*es\s*renovaci[oó]n\s*[?!]?$/i,
 /riesgos?\s*y\s*oportunidades?/i,
 /checklist|cumplimiento/i,
 /recomendaci[oó]n\s*final/i,
 ];

 function stripDecor(l) {
 return l
 .replace(/^[#\s*_|>→•\-\d.º)]+/, '')
 .replace(/[#\s*_|]+$/, '')
 .replace(/1⃣|2⃣|3⃣|4⃣|5⃣/g, '')
 .trim();
 }

 const lines = texto.split('\n');
 const rawSections = [];

 lines.forEach((line, idx) => {
 const clean = stripDecor(line);
 if (!clean || clean.length > 80) return;
 if (/^→/.test(line.trim())) return;
 const ki = SECTION_KEYWORDS.findIndex(re => re.test(clean));
 if (ki !== -1) {
 if (!rawSections.find(s => s.sectionIdx === ki)) {
 rawSections.push({ sectionIdx: ki, lineIdx: idx });
 }
 }
 });

 if (!rawSections.length) return renderFallback(texto);
 rawSections.sort((a, b) => a.lineIdx - b.lineIdx);

 const seccionesEncontradas = rawSections.map((s, i) => {
 const startLine = s.lineIdx + 1;
 const endLine = i + 1 < rawSections.length ? rawSections[i + 1].lineIdx : lines.length;
 const content = lines.slice(startLine, endLine).join('\n').trim();
 return { sectionIdx: s.sectionIdx, content };
 });

 function detectarEstadoRec(content) {
 const m = content.match(/\b(RECOMENDADA|EN ESTUDIO|DESCARTADA)\b/i);
 return m ? m[1].toUpperCase() : null;
 }

 function detectarVeredictoRen(content) {
 const m = content.match(/\b(PROBABLE RENOVACI[ÓO]N|PROBABLEMENTE NUEVA|INDETERMINADO)\b/i);
 if (!m) return null;
 const v = m[1].toUpperCase();
 if (v.includes('RENOVACI')) return { label: 'PROBABLE RENOVACIÓN', color: '#f5a623', bg: 'rgba(245,166,35,.12)' };
 if (v.includes('NUEVA')) return { label: 'PROBABLEMENTE NUEVA', color: '#34d399', bg: 'rgba(67,217,162,.12)' };
 return { label: 'INDETERMINADO', color: '#aaa', bg: 'rgba(170,170,170,.1)' };
 }

 function renderContentBlock(content) {
 if (!content.trim()) return '';
 const contentLines = content.split('\n');
 let html = '';
 let buffer = [];
 let mode = 'text';

 function flush() {
 if (!buffer.length) return;
 const joined = buffer.join('\n');
 if (mode === 'list') html += renderList(joined);
 else if (mode === 'table') html += renderTable(joined);
 else {
 const trimmed = joined.trim();
 if (trimmed) html += `<p class="groq-p">${bold(trimmed)}</p>`;
 }
 buffer = [];
 }

 for (const line of contentLines) {
 const trimmed = line.trim();
 if (!trimmed) { flush(); mode = 'text'; continue; }
 const isListItem = /^[-*•]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed);
 const isTableLine = trimmed.startsWith('|');
 if (isListItem) { if (mode !== 'list') { flush(); mode = 'list'; } buffer.push(trimmed); }
 else if (isTableLine) { if (mode !== 'table') { flush(); mode = 'table'; } buffer.push(trimmed); }
 else { if (mode !== 'text') { flush(); mode = 'text'; } buffer.push(trimmed); }
 }
 flush();
 return html;
 }

 let html = '<div class="groq-report">';
 seccionesEncontradas.forEach((sec) => {
 const i = sec.sectionIdx;
 const cfg = SECCIONES[i] || { label: 'Sección', color: '#1d4ed8', icon: '' };
 const content = renderContentBlock(sec.content);
 let badge = '';
 if (i === 4) {
 const estado = detectarEstadoRec(sec.content);
 if (estado) {
 const colores = {
 'RECOMENDADA': { bg: 'rgba(67,217,162,.15)', color: '#34d399', border: '#34d399' },
 'EN ESTUDIO': { bg: 'rgba(245,166,35,.15)', color: '#f5a623', border: '#f5a623' },
 'DESCARTADA': { bg: 'rgba(229,115,115,.15)', color: '#e57373', border: '#e57373' },
 };
 const c = colores[estado] || colores['EN ESTUDIO'];
 badge = `<span class="groq-estado-badge" style="background:${c.bg};color:${c.color};border:1px solid ${c.border}">${estado}</span>`;
 }
 }
 if (i === 1) {
 const v = detectarVeredictoRen(sec.content);
 if (v) {
 badge = `<span class="groq-estado-badge" style="background:${v.bg};color:${v.color};border:1px solid ${v.color}">${v.label}</span>`;
 }
 }
 html += `
 <div class="groq-section" style="--sec-color:${cfg.color}">
 <div class="groq-section-header">
 <span class="groq-section-icon">${cfg.icon}</span>
 <span class="groq-section-title">${cfg.label.toUpperCase()}</span>
 ${badge}
 </div>
 <div class="groq-section-body">${content}</div>
 </div>`;
 });
 html += '</div>';
 return html;
}

/**
 * Fallback: renderiza el texto como markdown simple.
 */
function renderFallback(texto) {
 const lines = texto.split('\n');
 let html = '<div class="groq-report groq-fallback">';
 for (const line of lines) {
 const t = line.trim();
 if (!t) { html += '<br>'; continue; }
 if (/^#{1,3}\s+/.test(t)) {
 const title = t.replace(/^#{1,3}\s+/, '');
 html += `<h4 class="groq-h">${title}</h4>`;
 } else if (/^[-*•]\s+/.test(t)) {
 html += `<div class="groq-li">· ${t.replace(/^[-*•]\s+/,'').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</div>`;
 } else {
 html += `<p class="groq-p">${t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</p>`;
 }
 }
 html += '</div>';
 return html;
}

/**
 * Inyecta el CSS del renderer una sola vez en el <head>.
 */
function groqInjectStyles() {
 if (document.getElementById('groq-report-styles')) return;
 const style = document.createElement('style');
 style.id = 'groq-report-styles';
 style.textContent = `
 .groq-report {
 display: flex;
 flex-direction: column;
 gap: 8px;
 font-size: .82rem;
 line-height: 1.6;
 }
 .groq-section {
 border: 1px solid rgba(255,255,255,.06);
 border-left: 3px solid var(--sec-color, #1d4ed8);
 border-radius: 8px;
 background: rgba(255,255,255,.025);
 overflow: hidden;
 transition: box-shadow .2s;
 }
 [data-theme="light"] .groq-section {
 background: rgba(0,0,0,.018);
 border-color: rgba(0,0,0,.07);
 border-left-color: var(--sec-color, #1d4ed8);
 }
 .groq-section:hover {
 box-shadow: 0 0 0 1px var(--sec-color, #1d4ed8), 0 4px 16px rgba(0,0,0,.15);
 }
 .groq-section-header {
 display: flex;
 align-items: center;
 gap: 8px;
 padding: 7px 12px;
 background: rgba(255,255,255,.03);
 border-bottom: 1px solid rgba(255,255,255,.05);
 flex-wrap: wrap;
 }
 [data-theme="light"] .groq-section-header {
 background: rgba(0,0,0,.025);
 border-bottom-color: rgba(0,0,0,.06);
 }
 .groq-section-icon { font-size: .95rem; line-height: 1; }
 .groq-section-title {
 font-family: 'JetBrains Mono', monospace;
 font-size: .66rem;
 font-weight: 700;
 letter-spacing: .1em;
 color: var(--sec-color, #1d4ed8);
 flex: 1;
 }
 .groq-estado-badge {
 font-family: 'JetBrains Mono', monospace;
 font-size: .63rem;
 font-weight: 700;
 letter-spacing: .06em;
 padding: 2px 8px;
 border-radius: 20px;
 white-space: nowrap;
 }
 .groq-section-body { padding: 10px 14px 12px; }
 .groq-p {
 margin: 0 0 5px;
 color: var(--text, #e0e0e0);
 font-size: .81rem;
 }
 .groq-p:last-child { margin-bottom: 0; }
 .groq-rows {
 display: flex;
 flex-direction: column;
 gap: 5px;
 margin: 4px 0 8px;
 }
 .groq-row-card {
 border: 1px solid rgba(255,255,255,.06);
 border-radius: 6px;
 padding: 7px 10px;
 background: rgba(255,255,255,.02);
 }
 [data-theme="light"] .groq-row-card {
 border-color: rgba(0,0,0,.07);
 background: rgba(0,0,0,.015);
 }
 .groq-row-top {
 display: flex;
 align-items: flex-start;
 justify-content: space-between;
 gap: 8px;
 flex-wrap: wrap;
 }
 .groq-row-title {
 font-size: .81rem;
 font-weight: 600;
 color: var(--text, #e0e0e0);
 line-height: 1.4;
 flex: 1;
 }
 .groq-row-badge {
 font-family: 'JetBrains Mono', monospace;
 font-size: .62rem;
 font-weight: 700;
 letter-spacing: .04em;
 padding: 2px 7px;
 border-radius: 20px;
 white-space: nowrap;
 background: rgba(29,78,216,.1);
 color: var(--text2, #888);
 flex-shrink: 0;
 align-self: flex-start;
 margin-top: 1px;
 }
 .groq-row-detail {
 margin-top: 4px;
 font-size: .78rem;
 color: var(--text2, #888);
 line-height: 1.45;
 }
 .groq-row-simple {
 display: flex;
 align-items: flex-start;
 gap: 7px;
 font-size: .8rem;
 color: var(--text, #e0e0e0);
 line-height: 1.5;
 padding: 1px 0;
 }
 .groq-row-bullet {
 color: var(--sec-color, #1d4ed8);
 font-weight: 700;
 flex-shrink: 0;
 margin-top: 1px;
 }
 .groq-h {
 font-family: 'JetBrains Mono', monospace;
 font-size: .74rem;
 font-weight: 700;
 letter-spacing: .07em;
 color: var(--text2, #888);
 margin: 10px 0 4px;
 text-transform: uppercase;
 }
 .groq-label {
 display: block;
 font-family: 'JetBrains Mono', monospace;
 font-size: .66rem;
 font-weight: 700;
 letter-spacing: .1em;
 text-transform: uppercase;
 color: #1d4ed8;
 margin-bottom: 8px;
 }
 .groq-loading {
 display: flex;
 align-items: center;
 gap: 8px;
 font-size: .8rem;
 color: #1d4ed8;
 font-weight: 500;
 padding: 10px 0;
 }
 .groq-error { font-size: .8rem; color: var(--red, #e74c3c); }
 `;
 document.head.appendChild(style);
}

/**
 * Llama a la API de Groq para obtener un análisis narrativo breve
 */
async function groqAnalizarLicitacion(licit, sector, veredicto, puntuacion) {
 const cacheKey = groqSanear(licit.id || licit.expediente || licit.objeto).slice(0, 60);
 if (groqCache.has(cacheKey)) return groqCache.get(cacheKey);

 while (groqEnCurso >= GROQ_MAX_CONCURRENTE) {
 await new Promise(r => setTimeout(r, 300));
 }
 groqEnCurso++;

 let importeTexto = 'No especificado';
 try {
 const imp = licit._importeConIVA || parseAmount(licit.presupuestoConIVA) || parseAmount(licit.presupuestoSinIVA) || 0;
 if (imp > 0) importeTexto = imp.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
 } catch(e) { /* ignorar */ }

 const prompt = `Eres un consultor senior especializado en licitaciones públicas y privadas en España.
Tu conocimiento abarca análisis jurídico de pliegos, estrategia competitiva, redacción técnica de propuestas y evaluación de riesgos y oportunidades.
Tu tono es profesional, directo y claro.

OBJETIVO:
Analizar esta licitación y determinar si es recomendable participar según criterios estratégicos y de descarte definidos.

DATOS DE LA LICITACIÓN:
Objeto: ${groqSanear(licit.objeto)}
Sector del usuario: ${groqSanear(sector)}
Órgano contratante: ${groqSanear(licit.organo)}
CPV: ${groqSanear(licit.cpv)}
Presupuesto: ${importeTexto}
Procedimiento: ${groqSanear(licit.tipoProcedimiento)}
Estado: ${groqSanear(licit.estado)}
Adjudicatario anterior: ${groqSanear(licit.adjudicatario)}
Veredicto automático previo del sistema: ${veredicto} (${puntuacion}/10)

CRITERIOS AUTOMÁTICOS DE DESCARTE:
Marca como DESCARTADA si detectas cualquiera de estos:
- Solvencia económica superior a 120.000 €
- Exigencia de ISO 27001
- Exigencia de ENS
- Trabajo presencial fuera de Madrid
- Partner obligatorio de fabricante
- Software propietario con fabricante adjudicatario actual
- Compromiso de medios personales
- Desarrollo de apps móviles iOS/Android
- Órgano contratante del País Vasco

CRITERIOS DE PRIORIDAD:
Prioriza positivamente:
- Desarrollos evolutivos web
- Libertad tecnológica
- Uso de JavaScript, Angular o Wordpress
- CMS Wordpress permitido

Marca como riesgo:
- Creación audiovisual presencial
- CMS obligatorio distinto de Wordpress

FABRICANTES Y SaaS CON LOS QUE EL USUARIO TIENE CAPACIDAD:
ACELERAPYME, ADOBE, AMAZON, BITDEFENDER, GITHUB, GOOGLE, MICROSOFT, ODOO,
SALESFORCE, WATCHGUARD, VEEAM, MAILCHIMP, HEROKU, CONTABO, DIGICERT,
PAESSLER, PALOALTO, SESAME, GENIALLY, HOLDed, IONOS, NAMECHEAP, etc.

FORMATO DE RESPUESTA OBLIGATORIO:

1⃣ RESUMEN EJECUTIVO
- Objeto
- Presupuesto
- Plazos relevantes
- Criterios clave

2⃣ ¿ES RENOVACIÓN?
Veredicto: PROBABLE RENOVACIÓN / PROBABLEMENTE NUEVA / INDETERMINADO

3⃣ RIESGOS Y OPORTUNIDADES
**[Riesgo/Oportunidad]** · Impacto: Alto/Medio/Bajo
→ Explicación breve.

4⃣ CHECKLIST DE CUMPLIMIENTO
**Administrativo** · Sí/No/Parcial
→ Acción breve.
**Técnico** · Sí/No/Parcial
→ Acción breve.
**Económico** · Sí/No/Parcial
→ Acción breve.

5⃣ RECOMENDACIÓN FINAL
Estado: RECOMENDADA / EN ESTUDIO / DESCARTADA
Justificación clara.`;

 try {
 const res = await fetch('/api/ia/groq', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 messages: [{ role: 'user', content: prompt }],
 max_tokens: 1000,
 temperature: 0.4
 })
 });

 if (!res.ok) {
 groqEnCurso--;
 return null;
 }

 const envelope = await res.json();
 const data = envelope.data ?? envelope;
 const texto = data.choices?.[0]?.message?.content?.trim() ?? null;
 if (texto) groqCache.set(cacheKey, texto);
 groqEnCurso--;
 return texto;
 } catch (err) {
 console.warn('[Groq] Fallo:', err.message);
 groqEnCurso--;
 return null;
 }
}

// ============================================================
// FUNCIONES MEJORADAS PARA DOCUMENTOS
// ============================================================

/**
 * Obtiene la mejor URL disponible para una licitación
 * @param {Object} licit - Objeto de licitación
 * @returns {Object|null} - { url, tipo, esConstruida }
 */
function obtenerMejorUrl(licit) {
 // Prioridad 1: Enlace directo a licitación
 if (licit.link && licit.link.startsWith('http')) {
 return { url: licit.link, tipo: 'licitacion_directa', esConstruida: false };
 }
 
 // Prioridad 2: Perfil del contratante
 if (licit.enlacePerfil && licit.enlacePerfil.startsWith('http')) {
 return { url: licit.enlacePerfil, tipo: 'perfil_contratante', esConstruida: false };
 }
 
 // Prioridad 3: Construir URL PLACSP válida a partir del expediente
 if (licit.expediente && licit.expediente.trim()) {
 const expedienteLimpio = licit.expediente.trim();
 if (expedienteLimpio.length > 3) {
 // URL correcta de PLACSP (WebSphere portal)
 return {
 url: `https://contrataciondelestado.es/wps/portal/plataforma?pagina=NS_NWKP0W&lang=es&idExpediente=${encodeURIComponent(expedienteLimpio)}`,
 tipo: 'construida_expediente',
 esConstruida: true
 };
 }
 }

 // Prioridad 4: Búsqueda por órgano en PLACSP
 if (licit.organo && licit.organo.trim()) {
 return {
 url: `https://contrataciondelestado.es/wps/portal/plataforma?pagina=NS_NWKP0W&lang=es&organoContratacion=${encodeURIComponent(licit.organo)}`,
 tipo: 'busqueda_organo',
 esConstruida: true
 };
 }
 
 return null;
}

/**
 * Abre los documentos de una licitación
 * @param {Object} licit - Objeto de licitación
 */
function verDocumentos(licit) {
 if (!licit) {
 alert(' No hay datos de licitación disponibles.');
 return;
 }
 
 const urlInfo = obtenerMejorUrl(licit);
 
 if (!urlInfo) {
 alert(' No hay enlace disponible para esta licitación.\n\n Posibles razones:\n• Licitación antigua o anulada\n• Datos incompletos en el archivo\n• Portal de contratación no soportado\n\n Sugerencia: Busca manualmente por expediente o licitador.');
 return;
 }
 
 let mensaje = '';
 let consejo = '';
 
 switch (urlInfo.tipo) {
 case 'licitacion_directa':
 mensaje = ' Abriendo enlace directo a la licitación...';
 break;
 case 'perfil_contratante':
 mensaje = ' Abriendo perfil del contratante.';
 consejo = '\n\n Busca la licitación por expediente en la página del perfil.';
 break;
 case 'construida_expediente':
 mensaje = ` Enlace construido a partir del expediente: ${licit.expediente}`;
 consejo = '\n\n El enlace puede no funcionar si el portal ha cambiado.';
 break;
 case 'busqueda_organo':
 mensaje = ` Abriendo búsqueda por órgano: ${licit.organo}`;
 consejo = '\n\n Busca la licitación por título o expediente.';
 break;
 default:
 mensaje = 'Abriendo enlace...';
 }
 
 const confirmar = confirm(`${mensaje}${consejo}\n\n¿Abrir enlace?`);
 
 if (confirmar) {
 window.open(urlInfo.url, '_blank', 'noopener,noreferrer');
 console.log(`[Documentos] Abriendo: ${urlInfo.tipo} - ${urlInfo.url}`);
 }
}

// DATOS DE SECTORES Y CPV 
const CPV_TI = [
 '30','31','32','35','38','48','50','51','52','64','72','73','79','80','85','90','95',
 '302','303','304','315','316','318','320','321','322','325','326','327','350','351',
 '352','380','381','384','385','386','480','481','482','483','484','485','487','488',
 '489','500','501','502','503','504','505','506','507','508','509','510','511','512',
 '513','514','515','516','517','518','519','640','641','642','643','644','720','721',
 '722','723','724','725','726','727','728','729','730','731','732','733','734','735',
 '736','737','738','739','790','791','792','793','794','795','796','797','798','799'
];

const SECTOR_CPV = {
 'Tecnología e informática': ['72','48','30','31','32','35','38','50','51','64','73','79','80'],
 'Construcción y obras': ['45'],
 'Limpieza y mantenimiento': ['90','77','50'],
 'Consultoría y servicios profesionales': ['79','73','72','80']
};

const SECTORES_LISTA = [
 'Tecnología e informática',
 'Construcción y obras',
 'Limpieza y mantenimiento',
 'Consultoría y servicios profesionales',
 'Suministros y equipamiento',
 'Servicios de salud y sociales',
 'Transporte y logística',
 'Servicios de seguridad',
 'Ingeniería y arquitectura',
 'Comunicación y marketing',
 'Formación y educación',
 'Medio ambiente y sostenibilidad',
 'Otro / General'
];

// ESTADO INTERNO DE LA PESTAÑA IA 
let iaResults = [];
let iaSource = [];
let iaBlockSize = 50;
let iaOffset = 0;
let iaPageSize = 10;
let iaPage = 1;
let iaFiltroVeredicto = null;
let iaSortBy = 'puntuacion';
let iaSortDir = 'desc';
let iaLugaresExcluidos = new Set();

// FILTRO DE LUGARES (buscador) 
function _iaLugarGetAll() {
 return [...new Set(
 allData.flatMap(r => [r.lugarEjecucion, r.lugarLote].filter(Boolean))
 )].sort((a, b) => a.localeCompare(b, 'es'));
}

let _iaDropdownFocus = -1;

function iaLugarOnInput() {
 const input = document.getElementById('iaLugarSearch');
 const dropdown = document.getElementById('iaLugarDropdown');
 if (!input || !dropdown) return;
 const q = input.value.trim().toLowerCase();
 _iaDropdownFocus = -1;
 if (!q) { dropdown.style.display = 'none'; return; }
 const todos = _iaLugarGetAll();
 const matches = todos.filter(v => v.toLowerCase().includes(q) && !iaLugaresExcluidos.has(v));
 if (!matches.length) {
 dropdown.innerHTML = '<div class="ia-lugar-option" style="color:var(--text3);cursor:default">Sin resultados</div>';
 dropdown.style.display = 'block';
 return;
 }
 dropdown.innerHTML = matches.map((v, i) => {
 const idx = v.toLowerCase().indexOf(q);
 const highlighted = escHtml(v.slice(0, idx)) + '<mark>' + escHtml(v.slice(idx, idx + q.length)) + '</mark>' + escHtml(v.slice(idx + q.length));
 return `<div class="ia-lugar-option" data-i="${i}" data-val="${escHtml(v)}" onmousedown="iaLugarAdd('${escHtml(v).replace(/'/g,"\\'")}');event.preventDefault()">${highlighted}</div>`;
 }).join('');
 dropdown.style.display = 'block';
}

function iaLugarOnKey(e) {
 const dropdown = document.getElementById('iaLugarDropdown');
 if (!dropdown || dropdown.style.display === 'none') return;
 const opts = dropdown.querySelectorAll('.ia-lugar-option[data-val]');
 if (!opts.length) return;
 if (e.key === 'ArrowDown') { e.preventDefault(); _iaDropdownFocus = Math.min(_iaDropdownFocus + 1, opts.length - 1); }
 else if (e.key === 'ArrowUp') { e.preventDefault(); _iaDropdownFocus = Math.max(_iaDropdownFocus - 1, 0); }
 else if (e.key === 'Enter') { e.preventDefault(); if (_iaDropdownFocus >= 0) opts[_iaDropdownFocus].dispatchEvent(new MouseEvent('mousedown')); return; }
 else if (e.key === 'Escape') { dropdown.style.display = 'none'; return; }
 opts.forEach((o, i) => o.classList.toggle('focused', i === _iaDropdownFocus));
 if (_iaDropdownFocus >= 0) opts[_iaDropdownFocus].scrollIntoView({ block: 'nearest' });
}

function iaLugarAdd(lugar) {
 iaLugaresExcluidos.add(lugar);
 const input = document.getElementById('iaLugarSearch');
 const dropdown = document.getElementById('iaLugarDropdown');
 if (input) input.value = '';
 if (dropdown) dropdown.style.display = 'none';
 _renderIALugarTags();
 _updateIALugarBadge();
}

function iaLugarRemove(lugar) {
 iaLugaresExcluidos.delete(lugar);
 _renderIALugarTags();
 _updateIALugarBadge();
}

function iaLugarLimpiar() {
 iaLugaresExcluidos.clear();
 _renderIALugarTags();
 _updateIALugarBadge();
}

function _renderIALugarTags() {
 const container = document.getElementById('iaLugarTags');
 if (!container) return;
 if (!iaLugaresExcluidos.size) { container.innerHTML = ''; return; }
 container.innerHTML = [...iaLugaresExcluidos].map(v => `<span class="ia-lugar-tag" title="${escHtml(v)}"><span style="overflow:hidden;text-overflow:ellipsis;max-width:220px">${escHtml(v)}</span><span class="ia-lugar-tag-x" onclick="iaLugarRemove('${escHtml(v).replace(/'/g,"\\'")}')"></span></span>`).join('');
}

function _updateIALugarBadge() {
 const badge = document.getElementById('iaLugarBadge');
 if (!badge) return;
 const n = iaLugaresExcluidos.size;
 badge.textContent = n === 1 ? '1 excluido' : `${n} excluidos`;
 badge.style.opacity = n > 0 ? '1' : '0';
}

document.addEventListener('click', e => {
 const dropdown = document.getElementById('iaLugarDropdown');
 const input = document.getElementById('iaLugarSearch');
 if (dropdown && input && !input.contains(e.target) && !dropdown.contains(e.target)) dropdown.style.display = 'none';
});

function buildIALugarChips() {
 _renderIALugarTags();
 _updateIALugarBadge();
}

function initIATab() {
 document.getElementById('iaEmpty').style.display = 'none';
 document.getElementById('iaContent').style.display = 'block';
 const sel = document.getElementById('iaSector');
 if (sel && sel.options.length <= 1) {
 SECTORES_LISTA.forEach(s => {
 const opt = document.createElement('option');
 opt.value = s;
 opt.textContent = s;
 if (s === 'Tecnología e informática') opt.selected = true;
 sel.appendChild(opt);
 });
 }
 buildIALugarChips();
}

function resetIATabState() {
 iaResults = [];
 iaSource = [];
 iaOffset = 0;
 iaPage = 1;
 iaFiltroVeredicto = null;
 iaLugaresExcluidos.clear();
 const summary = document.getElementById('iaSummaryBlock');
 const results = document.getElementById('iaResults');
 const progress = document.getElementById('iaProgress');
 const fill = document.getElementById('iaProgressFill');
 const text = document.getElementById('iaProgressText');
 if (summary) summary.style.display = 'none';
 if (results) results.innerHTML = '';
 if (progress) progress.style.display = 'none';
 if (fill) fill.style.width = '0%';
 if (text) text.textContent = 'Analizando...';
}

function runIAAnalysis() {
 const sector = document.getElementById('iaSector').value;
 const scope = document.getElementById('iaScope').value;
 iaBlockSize = parseInt(document.getElementById('iaLimit').value) || 10;
 iaPageSize = iaBlockSize;
 if (!sector) { alert('Selecciona tu sector antes de analizar.'); return; }
 const source = scope === 'filtered' ? filteredData : allData;
 let sourceBase = Array.isArray(source) && source.length > 0 ? [...source] : [...allData];
 if (iaLugaresExcluidos.size > 0) {
 sourceBase = sourceBase.filter(r => {
 const lugar = r.lugarEjecucion || r.lugarLote || '';
 return !iaLugaresExcluidos.has(lugar);
 });
 }
 iaSource = sourceBase;
 if (!iaSource.length) { alert('No hay licitaciones para analizar. Carga un archivo primero.'); return; }
 iaResults = [];
 iaOffset = 0;
 iaPage = 1;
 document.getElementById('iaSummaryBlock').style.display = 'none';
 document.getElementById('iaResults').innerHTML = '';
 const progress = document.getElementById('iaProgress');
 if (progress) progress.style.display = 'block';
 analizarBloque(sector);
}

function analizarBloque(sector) {
 if (!sector) sector = document.getElementById('iaSector').value;
 const bloque = iaSource.slice(iaOffset, iaOffset + iaBlockSize);
 if (!bloque.length) {
 const progress = document.getElementById('iaProgress');
 if (progress) progress.style.display = 'none';
 return;
 }
 const progressText = document.getElementById('iaProgressText');
 const progressFill = document.getElementById('iaProgressFill');
 if (progressText) progressText.textContent = `Analizando ${iaOffset + 1}–${Math.min(iaOffset + iaBlockSize, iaSource.length)} de ${iaSource.length}...`;
 if (progressFill) progressFill.style.width = (iaOffset / iaSource.length * 100) + '%';
 setTimeout(() => {
 try {
 const nuevos = bloque.map(licit => ({ licit, result: analizarLicitacion(licit, sector) }));
 iaResults = [...iaResults, ...nuevos];
 iaOffset += bloque.length;
 ordenarResultados();
 const progress = document.getElementById('iaProgress');
 if (progress) progress.style.display = 'none';
 actualizarSummary();
 renderIAPage();
 } catch(err) {
 console.error('[IA] Error:', err);
 const progress = document.getElementById('iaProgress');
 if (progress) progress.style.display = 'none';
 document.getElementById('iaResults').innerHTML = `<div class="empty-state"><div class="empty-icon"></div><div class="empty-title">Error en el análisis</div><div class="empty-sub">${err.message}</div></div>`;
 }
 }, 0);
}

function ordenarResultados() {
 iaResults.sort((a, b) => {
 let comparison = 0;
 switch(iaSortBy) {
 case 'fecha':
 const fechaA = a.licit.fechaActualizacion || a.licit.primeraPublicacion || a.licit.fechaOfertas || '';
 const fechaB = b.licit.fechaActualizacion || b.licit.primeraPublicacion || b.licit.fechaOfertas || '';
 comparison = (parseFecha(fechaA) || 0) - (parseFecha(fechaB) || 0);
 break;
 case 'importe':
 comparison = (a.licit._importeConIVA || 0) - (b.licit._importeConIVA || 0);
 break;
 default:
 const orden = { 'RECOMENDABLE': 0, 'NEUTRAL': 1, 'NO RECOMENDABLE': 2 };
 comparison = (orden[a.result.veredicto] - orden[b.result.veredicto]) || (a.result.puntuacion - b.result.puntuacion);
 }
 return iaSortDir === 'asc' ? comparison : -comparison;
 });
}

function parseFecha(fechaStr) {
 if (!fechaStr) return null;
 try {
 const match = fechaStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
 if (match) {
 const [_, d, m, y] = match;
 let year = parseInt(y);
 if (year < 100) year += 2000;
 return new Date(year, parseInt(m) - 1, parseInt(d)).getTime();
 }
 return new Date(fechaStr).getTime();
 } catch(e) { return null; }
}

function cambiarOrdenacion(criterio) {
 if (iaSortBy === criterio) iaSortDir = iaSortDir === 'asc' ? 'desc' : 'asc';
 else { iaSortBy = criterio; iaSortDir = 'desc'; }
 ordenarResultados();
 renderIAPage();
}

function analizarConcentracion(organo) {
 const contratos = allData.filter(r => r.organo === organo && r.adjudicatario);
 if (!contratos.length) return { concentrada: false, bloqueante: false, pctMax: 0, top: [], total: 0, adjUnico: false, nombreTop: '' };
 const total = contratos.length;
 const porAdj = {};
 contratos.forEach(r => { const k = r.adjudicatario.trim().toUpperCase(); porAdj[k] = (porAdj[k] || 0) + 1; });
 const sorted = Object.entries(porAdj).sort((a, b) => b[1] - a[1]);
 const pctMax = (sorted[0][1] / total) * 100;
 const totalAdj = sorted.length;
 const top = sorted.slice(0, 3).map(([adj, n]) => ({ adj, n, pct: (n / total * 100).toFixed(1) }));
 const adjUnico = totalAdj === 1;
 const umbralRaw = parseInt(document.getElementById('iaUmbralConc')?.value || '60');
 const umbral = isNaN(umbralRaw) ? 60 : Math.max(0, Math.min(100, umbralRaw));
 return { concentrada: pctMax >= umbral, bloqueante: pctMax >= umbral && total >= 2, pctMax: parseFloat(pctMax.toFixed(1)), top, total, totalAdj, adjUnico, nombreTop: sorted[0][0] };
}

function cpvMatchSector(cpvStr, sector) {
 if (!cpvStr || !cpvStr.trim()) return null;
 const cpv = cpvStr.trim().replace(/\s/g, '');
 const prefijos = SECTOR_CPV[sector] || [];
 if (!prefijos.length) return true;
 return prefijos.some(p => cpv.startsWith(p));
}

function analizarCompetencia(numOfertasStr, ofertaBajaStr, ofertaAltaStr, importeStr) {
 const nOfertas = parseInt(numOfertasStr) || 0;
 const baja = parseAmount(ofertaBajaStr);
 const alta = parseAmount(ofertaAltaStr);
 let nivelComp = 'desconocido';
 if (nOfertas === 0) nivelComp = 'desconocido';
 else if (nOfertas === 1) nivelComp = 'sin_competencia';
 else if (nOfertas <= 3) nivelComp = 'baja';
 else if (nOfertas <= 7) nivelComp = 'media';
 else nivelComp = 'alta';
 let dispersion = null;
 if (baja > 0 && alta > 0) dispersion = ((alta - baja) / baja * 100).toFixed(0);
 return { nOfertas, nivelComp, dispersion, baja, alta };
}

function analizarLicitacion(licit, sector) {
 let puntos = 5;
 const favor = [];
 const contra = [];
 const consejos = [];
 const matchCpv = cpvMatchSector(licit.cpv, sector);
 if (matchCpv === false) { puntos -= 3; contra.push(`CPV (${licit.cpv}) no corresponde al sector "${sector}"`); consejos.push('Verifica si tu empresa puede justificar capacidad en este CPV.'); }
 else if (matchCpv === true) { puntos += 2; favor.push(`CPV ${licit.cpv} alineado con tu sector`); }
 const conc = analizarConcentracion(licit.organo);
 if (conc.bloqueante) { puntos = 1; contra.push(`BLOQUEANTE: ${conc.pctMax}% de contratos van a "${conc.nombreTop}"`); consejos.push('Mercado cerrado. No recomendable.'); }
 else if (conc.concentrada) { puntos -= 3; contra.push(`Alta concentración: ${conc.pctMax}% a "${conc.nombreTop}"`); consejos.push('Diferénciate claramente en precio y calidad.'); }
 else if (conc.total >= 2 && !conc.concentrada) { puntos += 2; favor.push(`Órgano diversificado (${conc.totalAdj} adjudicatarios)`); }
 else if (conc.total === 0) { favor.push('Sin historial previo — mercado abierto'); }
 const comp = analizarCompetencia(licit.numOfertas, licit.ofertaMasBaja, licit.ofertaMasAlta, licit.importeConIVA);
 if (comp.nivelComp === 'sin_competencia') { puntos += 1; favor.push('Solo 1 oferta anterior — poca competencia'); }
 else if (comp.nivelComp === 'baja') { puntos += 2; favor.push(`Competencia baja: ${comp.nOfertas} ofertas`); }
 else if (comp.nivelComp === 'media') { favor.push(`Competencia moderada: ${comp.nOfertas} ofertas`); }
 else if (comp.nivelComp === 'alta') { puntos -= 2; contra.push(`Alta competencia: ${comp.nOfertas} ofertas`); consejos.push('Precio competitivo y buena propuesta.'); }
 else { favor.push('Sin datos de competencia previos'); }
 if (comp.dispersion !== null) {
 if (parseFloat(comp.dispersion) > 30) { puntos += 1; favor.push(`Gran dispersión de precios (${comp.dispersion}%) — hay margen`); }
 else if (parseFloat(comp.dispersion) < 10) { puntos -= 1; contra.push(`Precios muy ajustados (${comp.dispersion}%)`); }
 }
 const importe = (licit._importeConIVA > 0 ? licit._importeConIVA : 0) || parseAmount(licit.presupuestoConIVA) || parseAmount(licit.presupuestoSinIVA) || 0;
 const importeMin = parseFloat(document.getElementById('iaImporteMin')?.value) || 0;
 const importeMaxRaw = document.getElementById('iaImporteMax')?.value;
 const importeMax = (importeMaxRaw && importeMaxRaw !== '' && importeMaxRaw !== '0') ? parseFloat(importeMaxRaw) : Infinity;
 if (importe > 0 && importeMin > 0 && importe < importeMin) { puntos = 1; contra.push(`BLOQUEANTE: Importe (${formatEUR(importe)}) < mínimo (${formatEUR(importeMin)})`); }
 else if (importe > 0 && importeMax < Infinity && importe > importeMax) { puntos = 1; contra.push(`BLOQUEANTE: Importe (${formatEUR(importe)}) > máximo (${formatEUR(importeMax)})`); }
 else if (importe >= 500000) { puntos += 1; favor.push(`Alto valor: ${formatEUR(importe)}`); }
 else if (importe > 0 && importe < 5000) { puntos -= 1; contra.push(`Importe bajo (${formatEUR(importe)})`); }
 else if (importe >= 5000) { favor.push(`Importe razonable: ${formatEUR(importe)}`); }
 const proc = (licit.tipoProcedimiento || '').toLowerCase();
 if (proc.includes('abierto')) { puntos += 1; favor.push('Procedimiento abierto'); }
 else if (proc.includes('negociado sin')) { puntos -= 2; contra.push('Negociado sin publicidad'); }
 else if (proc.includes('negociado con')) { puntos -= 1; contra.push('Negociado con publicidad'); }
 else if (proc.includes('restringido')) { puntos -= 1; contra.push('Procedimiento restringido'); }
 const estado = (licit.estado || '').toLowerCase();
 const vigencia = (licit.vigencia || '').toLowerCase();
 let plazoVencido = false;
 if (licit.fechaOfertas) { try { const [d, m, y] = licit.fechaOfertas.split('/'); plazoVencido = new Date(+y, +m - 1, +d) < new Date(); } catch(e) {} }
 if (vigencia.includes('anulad')) { puntos = 1; contra.push('Licitación anulada'); }
 else if (estado.includes('adjudicad') || estado.includes('resuelt')) { puntos = 1; contra.push('Ya adjudicada'); }
 else if (estado.includes('desistid') || estado.includes('renunci')) { puntos = 1; contra.push('Desistida'); }
 else if (plazoVencido) { puntos = 1; contra.push(`Plazo vencido (${licit.fechaOfertas})`); }
 else if (estado.includes('pendiente')) { puntos += 1; favor.push('Pendiente de adjudicación'); }
 else if (vigencia.includes('vigente')) { favor.push('Licitación activa'); }
 puntos = Math.max(1, Math.min(10, puntos));
 let veredicto, resumen;
 if (puntos >= 7) { veredicto = 'RECOMENDABLE'; resumen = 'Buena oportunidad: mercado accesible y condiciones favorables.'; }
 else if (puntos >= 4) { veredicto = 'NEUTRAL'; resumen = 'Evaluar con detalle: hay riesgos relevantes.'; }
 else { veredicto = 'NO RECOMENDABLE'; resumen = 'Riesgo elevado o baja probabilidad de éxito.'; }
 const consejo = consejos.length ? consejos[0] : (veredicto === 'RECOMENDABLE' ? 'Prepara una propuesta técnica sólida.' : (veredicto === 'NEUTRAL' ? 'Analiza coste vs beneficio.' : 'Solo participar si tienes ventaja clara.'));
 return { veredicto, puntuacion: puntos, resumen, puntos_favor: favor, puntos_contra: contra, consejo };
}

function actualizarSummary() {
 const rec = iaResults.filter(r => r.result.veredicto === 'RECOMENDABLE').length;
 const neut = iaResults.filter(r => r.result.veredicto === 'NEUTRAL').length;
 const noRec = iaResults.filter(r => r.result.veredicto === 'NO RECOMENDABLE').length;
 const avg = iaResults.length ? (iaResults.reduce((s, r) => s + r.result.puntuacion, 0) / iaResults.length).toFixed(1) : '0';
 const quedan = iaSource.length - iaOffset;
 const mkCard = (color, val, label, sub, filtro) => {
 const active = iaFiltroVeredicto === filtro ? 'style="outline:2px solid #1d4ed8;outline-offset:3px;cursor:pointer"' : 'style="cursor:pointer"';
 const click = filtro ? `onclick="filtrarIAVeredicto('${filtro}')"` : `onclick="filtrarIAVeredicto(null)"`;
 return `<div class="stat-card ${color}" ${active} ${click} title="${filtro ? 'Filtrar por: ' + filtro : 'Ver todas'}"><div class="stat-label">${label}</div><div class="stat-value ${color}">${val}</div><div class="stat-sub">${sub}</div></div>`;
 };
 document.getElementById('iaSummaryGrid').innerHTML = mkCard('lime', rec, 'Recomendables', 'clic para filtrar', 'RECOMENDABLE') + mkCard('amber', neut, 'Neutras', 'clic para filtrar', 'NEUTRAL') + mkCard('red', noRec, 'No recomendables', 'clic para filtrar', 'NO RECOMENDABLE') + mkCard('cyan', avg, 'Puntuación media', 'sobre 10', null) + mkCard('green', iaResults.length, 'Analizadas', 'de ' + iaSource.length + ' totales', null);
 document.getElementById('iaSummaryBlock').style.display = 'block';
 const btnSig = document.getElementById('iaBtnSiguiente');
 if (btnSig) { if (quedan > 0) { btnSig.style.display = 'block'; btnSig.textContent = ` Analizar siguiente bloque (${Math.min(iaBlockSize, quedan)} de ${quedan} restantes)`; } else { btnSig.style.display = 'none'; } }
}

function renderIAPage() {
 const base = iaFiltroVeredicto ? iaResults.filter(r => r.result.veredicto === iaFiltroVeredicto) : iaResults;
 const total = base.length;
 const totalPags = Math.ceil(total / iaPageSize);
 const start = (iaPage - 1) * iaPageSize;
 const end = Math.min(start + iaPageSize, total);
 const slice = base.slice(start, end);
 const sortSelector = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:15px;background:var(--surface);padding:10px 15px;border-radius:8px;border:1px solid var(--border);"><span style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text2);">Ordenar por:</span><button class="btn btn-ghost btn-sm ${iaSortBy === 'puntuacion' ? 'active' : ''}" onclick="cambiarOrdenacion('puntuacion')" style="${iaSortBy === 'puntuacion' ? 'background:var(--lime-dim);color:var(--lime);' : ''}">Puntuación ${iaSortBy === 'puntuacion' ? (iaSortDir === 'asc' ? '↑' : '↓') : ''}</button><button class="btn btn-ghost btn-sm ${iaSortBy === 'fecha' ? 'active' : ''}" onclick="cambiarOrdenacion('fecha')" style="${iaSortBy === 'fecha' ? 'background:var(--lime-dim);color:var(--lime);' : ''}">Fecha ${iaSortBy === 'fecha' ? (iaSortDir === 'asc' ? '↑' : '↓') : ''}</button><button class="btn btn-ghost btn-sm ${iaSortBy === 'importe' ? 'active' : ''}" onclick="cambiarOrdenacion('importe')" style="${iaSortBy === 'importe' ? 'background:var(--lime-dim);color:var(--lime);' : ''}">Importe ${iaSortBy === 'importe' ? (iaSortDir === 'asc' ? '↑' : '↓') : ''}</button></div>`;
 const filtroLabel = iaFiltroVeredicto ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:var(--text2,#888)">Filtrando: <strong style="color:var(--text)">${iaFiltroVeredicto}</strong><button onclick="filtrarIAVeredicto(null)" class="btn btn-ghost btn-sm"> Ver todas</button></div>` : '';
 document.getElementById('iaResults').innerHTML = sortSelector + filtroLabel + (slice.length ? slice.map((r, i) => renderIACard(r.licit, r.result, start + i)).join('') : '<div class="empty-state"><div class="empty-icon"></div><div class="empty-title">No hay resultados con este filtro</div></div>') + renderIAPagination(total, totalPags);
}

function renderIACard(licit, result, idx) {
 const colors = { 'RECOMENDABLE': { cls: 'ia-green', icon: '', badge: 'badge-green' }, 'NEUTRAL': { cls: 'ia-amber', icon: '', badge: 'badge-amber' }, 'NO RECOMENDABLE': { cls: 'ia-red', icon: '', badge: 'badge-red' } };
 const c = colors[result.veredicto] || colors['NEUTRAL'];
 const dots = Array.from({ length: 10 }, (_, i) => `<span style="color:${i < result.puntuacion ? '#1d4ed8' : 'var(--border-hi,#2a2a3e)'}">•</span>`).join('');
 const favor = result.puntos_favor?.map(p => `<li>${escHtml(p)}</li>`).join('') || '';
 const contra = result.puntos_contra?.map(p => `<li>${escHtml(p)}</li>`).join('') || '';
 const importe = licit._importeConIVA || parseAmount(licit.presupuestoConIVA) || 0;
 const fecha = licit.fechaActualizacion || licit.primeraPublicacion || licit.fechaOfertas || '';
 const fechaDisplay = fecha ? `<span style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;color:var(--text2);margin-left:8px;">${fecha}</span>` : '';
 const portalButton = licit.link ? `<a href="${licit.link}" target="_blank" rel="noopener" class="btn btn-primary" style="margin-left:8px;padding:4px 10px;font-size:.75rem;background:#1d4ed8;color:white;text-decoration:none;border-radius:4px;display:inline-flex;align-items:center;gap:4px;"><span>↗</span> Ver en portal</a>` : '';
 const cacheKey = groqSanear(licit.id || licit.expediente || licit.objeto).slice(0, 60);
 // Añade esto ANTES del return, donde están las otras variables (después de const cacheKey = ...)
 const licitId = licit.id || licit.expediente;
 const enSeguimiento = estaEnSeguimiento(licitId);

const seguimientoButton = `
 <button onclick="toggleSeguimientoSinRecarga('${licitId}', ${JSON.stringify(licit).replace(/"/g, '&quot;')}, this)"
 style="padding:4px 10px;font-size:.85rem;background:transparent;color:${enSeguimiento ? '#f5a623' : 'var(--text2)'};
 border:1px solid ${enSeguimiento ? '#f5a623' : 'var(--border)'};border-radius:6px;cursor:pointer;"
 title="${enSeguimiento ? 'Eliminar seguimiento' : 'Marcar para seguimiento'}">
 ${enSeguimiento ? ' En seguimiento' : ' Marcar seguimiento'}
 </button>
`;
const generarDocButton = `<button onclick="abrirModalGenerarDocumento(${JSON.stringify(licit).replace(/"/g, '&quot;')})" style="padding:4px 12px;font-size:.75rem;background:#8b5cf6;color:white;border:none;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><span style="font-size:1rem"> </span> Generar documento</button>`;
 let groqContent = '';
 if (groqCache.has(cacheKey)) { groqInjectStyles(); groqContent = `<div style="margin-bottom:8px"><span class="groq-label"> Análisis IA (Groq)</span></div>${groqRenderHTML(groqCache.get(cacheKey))}`; }
 else { groqContent = `<button onclick="solicitarAnalisisGroq(${idx})" style="cursor:pointer;font-size:.85rem;font-weight:500;padding:6px 14px;border-radius:6px;background:#1d4ed8;color:white;border:none;transition:.2s;box-shadow:0 2px 4px rgba(0,0,0,.1)"> Analizar con IA</button>`; }
 
 return `<div class="ia-card ${c.cls}">
 <div class="ia-card-header">
 <div class="ia-card-title">
 <span class="ia-verdict-icon">${c.icon}</span>
<div><div class="ia-objeto" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${escHtml(licit.objeto || '—')}${portalButton}${fechaDisplay}</div>
<div class="ia-organo">${escHtml(licit.organo || '—')}</div>
</div>
</div>
<div class="ia-card-meta">
<span class="badge ${c.badge}">${result.veredicto}</span>
<div class="ia-score">${dots}</div>
<div class="ia-score-num">${result.puntuacion}/10</div></div></div><div class="ia-resumen">${escHtml(result.resumen)}</div>
<div class="ia-licit-data">${importe ? 
 `<span>${formatEUR(importe)}</span>` : ''}${licit.numOfertas ? 
 `<span>${escHtml(licit.numOfertas)} ofertas previas</span>` : ''}${licit.tipoProcedimiento ? 
 `<span>${escHtml(licit.tipoProcedimiento)}</span>`
 : ''}${licit.cpv ? `<span>CPV ${escHtml(licit.cpv)}</span>` : ''}${licit.adjudicatario ? 
 `<span>Adj. anterior: ${escHtml(licit.adjudicatario)}</span>` : ''}</div><div class="ia-pros-cons">${favor ? `<ul class="ia-list ia-list-favor">${favor}</ul>` : ''}${contra ? `<ul class="ia-list ia-list-contra">${contra}</ul>` : ''}</div>${result.consejo ? `<div class="ia-consejo"><span class="ia-consejo-label">Consejo:</span> ${escHtml(result.consejo)}</div>` : ''}<div style="display:flex;align-items:center;gap:8px;margin-top:12px;margin-bottom:8px;flex-wrap:wrap;">${seguimientoButton} ${generarDocButton}<button onclick="verDocumentosScraping(${JSON.stringify(licit).replace(/"/g, '&quot;')})" style="padding:4px 12px;font-size:.75rem;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:'Instrument Sans',sans-serif;font-weight:500;"><span style="font-size:1rem"> </span> Buscar documentos</button></div><div class="ia-groq-analysis" id="ia-groq-${idx}" style="margin-top:15px;">${groqContent}</div></div>`;
}

function escHtml(str) { 
 return String(str || '').replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;'); 
}
function parseAmount(amountStr) {
 if (!amountStr) return 0; const cleaned = String(amountStr).replace(/[€$£\s]/g, '').replace(/\./g, '').replace(/,/, '.'); 
 const num = parseFloat(cleaned); return isNaN(num) ? 0 : num; }
function formatEUR(amount) {
 return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount); 
 }

async function solicitarAnalisisGroq(idx) {
 const base = iaFiltroVeredicto ? iaResults.filter(r => r.result.veredicto === iaFiltroVeredicto) : iaResults;
 const item = base[idx];
 if (!item) return;
 const { licit, result } = item;
 const sector = document.getElementById('iaSector')?.value || 'No especificado';
 const container = document.getElementById('ia-groq-' + idx);
 if (!container) return;
 groqInjectStyles();
 container.innerHTML = `<span class="groq-loading"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-linecap="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg> Analizando con IA…</span>`;
 const texto = await groqAnalizarLicitacion(licit, sector, result.veredicto, result.puntuacion);
 if (!container.isConnected) return;
 if (texto) { container.innerHTML = `<div style="margin-bottom:8px"><span class="groq-label"> Análisis IA (Groq)</span></div>${groqRenderHTML(texto)}`; }
 else { container.innerHTML = `<span class="groq-error"> Sin análisis IA — error de conexión o límite de la API.</span><button onclick="solicitarAnalisisGroq(${idx})" style="margin-top:10px;padding:6px 12px;cursor:pointer;border:1px solid #ccc;background:transparent;border-radius:4px;color:var(--text)">Reintentar</button>`; }
}

function filtrarIAVeredicto(veredicto) { iaFiltroVeredicto = (iaFiltroVeredicto === veredicto) ? null : veredicto; iaPage = 1; actualizarSummary(); renderIAPage(); }

function renderIAPagination(total, totalPags) {
 if (totalPags <= 1) return '';
 const start = (iaPage - 1) * iaPageSize + 1;
 const end = Math.min(iaPage * iaPageSize, total);
 let pages = [];
 if (totalPags <= 7) { pages = Array.from({ length: totalPags }, (_, i) => i + 1); }
 else { pages = [1]; if (iaPage > 3) pages.push('...'); for (let i = Math.max(2, iaPage - 1); i <= Math.min(totalPags - 1, iaPage + 1); i++) pages.push(i); if (iaPage < totalPags - 2) pages.push('...'); pages.push(totalPags); }
 const btns = pages.map(p => { if (p === '...') return `<span class="page-btn" style="cursor:default;opacity:.4">…</span>`; return `<button class="page-btn ${p === iaPage ? 'active' : ''}" onclick="goIAPage(${p})">${p}</button>`; }).join('');
 return `<div class="pagination" style="margin-top:16px"><span class="page-info">Mostrando ${start}–${end} de ${total} analizadas</span><div class="page-btns"><button class="page-btn" onclick="goIAPage(${iaPage - 1})" ${iaPage === 1 ? 'disabled' : ''}>&#8249;</button>${btns}<button class="page-btn" onclick="goIAPage(${iaPage + 1})" ${iaPage === totalPags ? 'disabled' : ''}>&#8250;</button></div></div>`;
}

function goIAPage(p) { const base = iaFiltroVeredicto ? iaResults.filter(r => r.result.veredicto === iaFiltroVeredicto) : iaResults; const totalPags = Math.ceil(base.length / iaPageSize); if (p < 1 || p > totalPags) return; iaPage = p; renderIAPage(); document.getElementById('iaSummaryBlock').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

// ============================================================
// FUNCIONES AVANZADAS PARA DOCUMENTOS (Scraping)
// ============================================================

let modalDocumentos = null;

/**
 * Crea el modal de documentos si no existe
 */
function crearModalDocumentos() {
 if (document.getElementById('modalDocumentos')) return;
 
 const modalHTML = `
 <div id="modalDocumentos" class="modal-overlay" style="display:none;z-index:1000" onclick="cerrarModalDocumentos(event)">
 <div class="modal" style="max-width:700px;width:90%" onclick="event.stopPropagation()">
 <div class="modal-head">
 <div class="modal-title" id="modalDocTitle">Documentos de la licitación</div>
 <button class="modal-close" onclick="cerrarModalDocumentos()" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 <div class="modal-body" id="modalDocBody" style="max-height:60vh;overflow-y:auto">
 <div style="text-align:center;padding:40px">
 <div class="ia-spinner"></div>
 <p style="margin-top:12px;color:var(--text2)">Buscando documentos...</p>
 </div>
 </div>
 <div class="modal-foot" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
 <button id="modalDocDescargarZip" class="btn btn-primary" style="display:none" onclick="descargarSeleccionados()">
 Descargar seleccionados (ZIP)
 </button>
 <button class="btn btn-ghost" onclick="cerrarModalDocumentos()">Cerrar</button>
 </div>
 </div>
 </div>
 `;
 
 document.body.insertAdjacentHTML('beforeend', modalHTML);
 modalDocumentos = document.getElementById('modalDocumentos');
}

/**
 * Abre el modal y busca documentos
 */
async function verDocumentosScraping(licit) {
 crearModalDocumentos();

 const urlInfo = obtenerMejorUrl(licit);
 const tituloLicit = (licit.objeto || 'Licitación').substring(0, 55);

 if (!urlInfo || !urlInfo.url) {
 document.getElementById('modalDocBody').innerHTML = `
 <div class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">Sin enlace disponible</div>
 <div class="empty-sub">Esta licitación no tiene URL asociada.<br>Busca por expediente en el portal correspondiente.</div>
 </div>`;
 modalDocumentos.style.display = 'flex';
 return;
 }

 document.getElementById('modalDocTitle').innerHTML = ` Documentos — ${tituloLicit}...`;
 document.getElementById('modalDocBody').innerHTML = `
 <div style="text-align:center;padding:40px">
 <div class="ia-spinner"></div>
 <p style="margin-top:12px;color:var(--text2)">Analizando portal…</p>
 <p style="font-size:.75rem;color:var(--text2);margin-top:6px;word-break:break-all">${urlInfo.url.substring(0, 80)}…</p>
 </div>`;
 modalDocumentos.style.display = 'flex';

 // Botón de enlace directo al portal (siempre disponible en el footer)
 const btnZip = document.getElementById('modalDocDescargarZip');
 if (btnZip) { btnZip.style.display = 'none'; btnZip.disabled = false; }

 try {
 const response = await fetch(`/api/documentos/scrape?url=${encodeURIComponent(urlInfo.url)}`);
 const data = await response.json();

 // Helper — construir botón de enlace al portal
 const btnPortal = (label, href) =>
 `<a href="${escHtml(href)}" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;
 background:var(--accent);color:white;border-radius:8px;
 text-decoration:none;font-weight:600;font-size:.85rem;margin-top:10px">
 ${label}
 </a>`;

 const enlacePerfil = licit.enlacePerfil && licit.enlacePerfil.startsWith('http') ? licit.enlacePerfil : null;

 // Caso A: portal JS-rendered (PLACSP y equivalentes) 
 // Estas páginas cargan sus documentos con JavaScript; cheerio recibe
 // solo el shell HTML vacío → no podemos extraer documentos automáticamente.
 if (data.jsRendered) {
 document.getElementById('modalDocBody').innerHTML = `
 <div style="padding:24px 4px">
 <div style="font-size:2.2rem;margin-bottom:10px"> </div>
 <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">
 ${escHtml(data.portal)} usa JavaScript para cargar los documentos
 </div>
 <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:4px">
 Este portal (IBM WebSphere / React) renderiza el listado de documentos
 dinámicamente en el navegador. El servidor no puede obtenerlos de forma
 automática sin ejecutar JavaScript.<br><br>
 <strong>Abre la licitación en tu navegador</strong> y busca
 la pestaña <em>"Documentos"</em> o <em>"Pliegos"</em>:
 </div>
 ${btnPortal('Ver documentos en ' + escHtml(data.portal), urlInfo.url)}
 ${enlacePerfil ? '<br>' + btnPortal('Perfil del contratante', enlacePerfil) : ''}
 <div style="margin-top:16px;padding:10px 14px;background:rgba(251,191,36,.12);
 border-left:3px solid #f59e0b;border-radius:0 6px 6px 0;
 font-size:.75rem;color:var(--text2);line-height:1.5">
 <strong>Consejo:</strong> En PLACSP, una vez en la página de la licitación,
 haz clic en la pestaña <em>"Documentos del expediente"</em> para ver
 el Pliego de Cláusulas, Prescripciones Técnicas y demás anexos.
 </div>
 </div>`;
 return;
 }

 // Caso B: portal bloqueó el acceso (403) 
 if (!data.success && data.blocked) {
 document.getElementById('modalDocBody').innerHTML = `
 <div style="padding:24px 4px">
 <div style="font-size:2.2rem;margin-bottom:10px"> </div>
 <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">
 El portal bloqueó el acceso automático
 </div>
 <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:4px">
 El servidor recibió un error <strong>403 Forbidden</strong> al intentar
 acceder a los documentos. El portal tiene protección anti-bot activa.<br><br>
 Accede directamente desde tu navegador:
 </div>
 ${btnPortal('Abrir licitación en ' + escHtml(data.portal || 'portal'), urlInfo.url)}
 ${enlacePerfil ? '<br>' + btnPortal('Perfil del contratante', enlacePerfil) : ''}
 <p style="margin-top:12px;font-size:.72rem;color:var(--text2)">
 Portal: ${escHtml(data.portal || 'Desconocido')}
 </p>
 </div>`;
 return;
 }

 // Caso C: sin documentos detectados 
 if (!data.success || !data.documentos || data.documentos.length === 0) {
 document.getElementById('modalDocBody').innerHTML = `
 <div style="padding:24px 4px">
 <div style="font-size:2.2rem;margin-bottom:10px"> </div>
 <div style="font-weight:700;font-size:.95rem;margin-bottom:10px">
 No se detectaron documentos descargables
 </div>
 <div style="font-size:.83rem;color:var(--text2);line-height:1.65;margin-bottom:4px">
 La página del portal cargó correctamente pero no contiene
 enlaces a archivos descargables (PDF, ZIP, DOC…) en su HTML estático.
 Es posible que los documentos estén en otra sección del portal:
 </div>
 ${btnPortal('Abrir licitación en ' + escHtml(data.portal || 'portal'), urlInfo.url)}
 ${enlacePerfil ? '<br>' + btnPortal('Perfil del contratante', enlacePerfil) : ''}
 <p style="margin-top:12px;font-size:.72rem;color:var(--text2)">
 Portal: ${escHtml(data.portal || 'Desconocido')}
 ${data.error ? ' · ' + escHtml(data.error) : ''}
 </p>
 </div>`;
 return;
 }

 // Caso: documentos encontrados 
 const escHtmlAttr = s => String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

 const documentosHTML = `
 <div style="margin-bottom:12px">
 <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;cursor:pointer">
 <input type="checkbox" id="seleccionarTodos" onchange="toggleSeleccionarTodosDocumentos()">
 <strong>Seleccionar todos (${data.documentos.length})</strong>
 </label>
 <div style="background:rgba(59,130,246,.08);padding:7px 12px;border-radius:6px;font-size:.75rem;color:var(--text2);display:flex;align-items:center;gap:6px">
 <span> Portal: ${escHtmlAttr(data.portal)}</span>
 ${data.method === 'api' ? '<span style="margin-left:auto;background:var(--green);color:white;border-radius:4px;padding:1px 6px;font-size:.7rem">API oficial</span>' : ''}
 </div>
 </div>
 <div id="listaDocumentos">
 ${data.documentos.map((doc) => `
 <div class="documento-item" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
 <input type="checkbox" class="doc-checkbox"
 data-url="${escHtmlAttr(doc.url)}"
 data-nombre="${escHtmlAttr(doc.nombre)}"
 value="${escHtmlAttr(doc.url)}"
 style="flex-shrink:0">
 <span style="font-size:1.2rem;flex-shrink:0">${doc.tipo === 'PDF' ? ' ' : ' '}</span>
 <div style="flex:1;min-width:0">
 <div style="font-size:.85rem;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtmlAttr(doc.nombre)}">${escHtmlAttr(doc.nombre)}</div>
 <div style="font-size:.7rem;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtmlAttr(doc.url)}">${doc.url.substring(0, 70)}${doc.url.length > 70 ? '…' : ''}</div>
 </div>
 <a href="${escHtmlAttr(doc.url)}" target="_blank" rel="noopener"
 class="btn btn-ghost btn-sm"
 style="flex-shrink:0;padding:4px 10px;font-size:.75rem"
 title="Abrir / descargar este documento"> </a>
 </div>
 `).join('')}
 </div>`;

 document.getElementById('modalDocBody').innerHTML = documentosHTML;

 if (btnZip) {
 btnZip.innerHTML = ` Descargar seleccionados (ZIP)`;
 btnZip.style.display = 'flex';
 window.documentosActuales = data.documentos;
 }

 } catch (error) {
 console.error('[Documentos] Error de red:', error);
 document.getElementById('modalDocBody').innerHTML = `
 <div class="empty-state" style="padding:28px 20px">
 <div style="font-size:2rem;margin-bottom:10px"> </div>
 <div class="empty-title">Error de conexión</div>
 <div class="empty-sub" style="text-align:left;max-width:400px">
 <p style="margin:8px 0">No se pudo conectar con el servidor. Verifica que el backend esté en marcha.</p>
 <a href="${urlInfo.url}" target="_blank" rel="noopener"
 style="display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 16px;
 background:var(--accent);color:white;border-radius:8px;text-decoration:none;font-weight:500;font-size:.85rem">
 Abrir portal manualmente
 </a>
 <p style="margin-top:12px;font-size:.72rem;color:var(--text2)">${error.message}</p>
 </div>
 </div>`;
 }
}

function toggleSeleccionarTodosDocumentos() {
 const chkTodos = document.getElementById('seleccionarTodos');
 const checkboxes = document.querySelectorAll('.doc-checkbox');
 checkboxes.forEach(cb => cb.checked = chkTodos.checked);
}

function cerrarModalDocumentos(event) {
 if (event && event.target !== event.currentTarget) return;
 const modal = document.getElementById('modalDocumentos');
 if (modal) modal.style.display = 'none';
}

function descargarSeleccionados() {
 const checkboxes = document.querySelectorAll('.doc-checkbox:checked');
 if (checkboxes.length === 0) {
 alert('Selecciona al menos un documento');
 return;
 }
 
 const urls = Array.from(checkboxes).map(cb => cb.dataset.url);
 
 const btnZip = document.getElementById('modalDocDescargarZip');
 const textoOriginal = btnZip?.innerHTML;
 if (btnZip) {
 btnZip.innerHTML = 'Generando ZIP...';
 btnZip.disabled = true;
 }
 
 fetch('/api/documentos/descargar', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ urls })
 })
 .then(response => {
 if (!response.ok) throw new Error('Error en descarga');
 return response.blob();
 })
 .then(blob => {
 const link = document.createElement('a');
 const url = URL.createObjectURL(blob);
 link.href = url;
 link.download = `documentos_${Date.now()}.zip`;
 link.click();
 URL.revokeObjectURL(url);
 })
 .catch(error => {
 console.error('[Descarga ZIP] Error:', error);
 alert('Error al descargar los documentos');
 })
 .finally(() => {
 if (btnZip) {
 btnZip.innerHTML = textoOriginal;
 btnZip.disabled = false;
 }
 });
}
// ============================================================
// SISTEMA DE NOTIFICACIONES (Seguimiento de licitaciones)
// ============================================================

const SEGUIMIENTOS_KEY = 'licitra_seguimientos';

/**
 * Carga los seguimientos guardados
 */
function cargarSeguimientos() {
 const guardados = localStorage.getItem(SEGUIMIENTOS_KEY);
 return guardados ? JSON.parse(guardados) : {};
}

/**
 * Guarda un seguimiento
 */
function guardarSeguimiento(licitId, data) {
 const seguimientos = cargarSeguimientos();
 seguimientos[licitId] = {
 ...data,
 ultimoEstado: data.estadoActual,
 ultimaVigencia: data.vigenciaActual,
 fechaActualizacion: new Date().toISOString()
 };
 localStorage.setItem(SEGUIMIENTOS_KEY, JSON.stringify(seguimientos));
}

/**
 * Elimina un seguimiento
 */
function eliminarSeguimiento(licitId) {
 const seguimientos = cargarSeguimientos();
 delete seguimientos[licitId];
 localStorage.setItem(SEGUIMIENTOS_KEY, JSON.stringify(seguimientos));
}

/**
 * Verifica si una licitación está en seguimiento
 */
function estaEnSeguimiento(licitId) {
 const seguimientos = cargarSeguimientos();
 return !!seguimientos[licitId];
}

/**
 * Marca o desmarca una licitación para seguimiento
 */
function toggleSeguimiento(licitId, licit) {
 if (estaEnSeguimiento(licitId)) {
 eliminarSeguimiento(licitId);
 mostrarToast('Seguimiento eliminado', 'info');
 return false;
 } else {
 guardarSeguimiento(licitId, {
 nombre: licit.objeto?.substring(0, 80) || 'Licitación',
 organo: licit.organo,
 importe: licit._importeConIVA || licit.presupuestoConIVA,
 estadoActual: licit.estado || 'Desconocido',
 vigenciaActual: licit.vigencia || 'Desconocida',
 fechaInicio: new Date().toISOString()
 });
 mostrarToast('Licitación agregada a seguimiento', 'success');
 return true;
 }
}

/**
 * Muestra un toast (notificación temporal)
 */
function mostrarToast(mensaje, tipo = 'info') {
 // Eliminar toast existente
 const toastExistente = document.querySelector('.licit-toast');
 if (toastExistente) toastExistente.remove();
 
 const colores = {
 success: '#10b981',
 info: '#1d4ed8',
 warning: '#f5a623',
 error: '#ef4444'
 };
 
 const toast = document.createElement('div');
 toast.className = 'licit-toast';
 toast.innerHTML = `
 <div style="position:fixed;bottom:20px;right:20px;z-index:10000;
 background:${colores[tipo]};color:white;padding:12px 20px;
 border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);
 font-family:'Instrument Sans',sans-serif;font-size:.85rem;
 display:flex;align-items:center;gap:8px;animation:slideIn 0.3s ease;">
 <span>${tipo === 'success' ? '' : tipo === 'warning' ? ' ' : ''}</span>
 <span>${mensaje}</span>
 </div>
 <style>
 @keyframes slideIn {
 from { transform: translateX(100%); opacity: 0; }
 to { transform: translateX(0); opacity: 1; }
 }
 </style>
 `;
 document.body.appendChild(toast);
 setTimeout(() => toast.remove(), 3000);
}

/**
 * Verifica cambios de estado en todas las licitaciones en seguimiento
 * Debe llamarse cuando se cargan nuevos datos
 */
function verificarCambiosEstado() {
 const seguimientos = cargarSeguimientos();
 const cambios = [];
 
 for (const [id, seguimiento] of Object.entries(seguimientos)) {
 // Buscar la licitación actual en los datos
 const licitActual = allData?.find(l => l.id === id || l.expediente === id);
 
 if (!licitActual) continue;
 
 const estadoActual = licitActual.estado || 'Desconocido';
 const vigenciaActual = licitActual.vigencia || 'Desconocida';
 const estadoAnterior = seguimiento.ultimoEstado;
 const vigenciaAnterior = seguimiento.ultimaVigencia;
 
 if (estadoActual !== estadoAnterior || vigenciaActual !== vigenciaAnterior) {
 cambios.push({
 id,
 nombre: seguimiento.nombre,
 estadoAnterior,
 estadoActual,
 vigenciaAnterior,
 vigenciaActual,
 licit: licitActual
 });
 
 // Actualizar el estado guardado
 seguimiento.ultimoEstado = estadoActual;
 seguimiento.ultimaVigencia = vigenciaActual;
 seguimiento.fechaActualizacion = new Date().toISOString();
 }
 }
 
 // Guardar cambios actualizados
 localStorage.setItem(SEGUIMIENTOS_KEY, JSON.stringify(seguimientos));
 
 // Mostrar notificaciones de cambios
 if (cambios.length > 0) {
 mostrarNotificacionesCambios(cambios);
 }
}

/**
 * Muestra notificaciones de cambios (puede ser múltiple)
 */
function mostrarNotificacionesCambios(cambios) {
 // Notificación del navegador (si está permitido)
 if (Notification.permission === 'granted') {
 cambios.forEach(cambio => {
 new Notification(` Cambio en licitación: ${cambio.nombre.substring(0, 40)}...`, {
 body: `Estado: ${cambio.estadoAnterior} → ${cambio.estadoActual}`,
 icon: '/favicon.ico'
 });
 });
 }
 
 // Mostrar resumen en toast
 if (cambios.length === 1) {
 const c = cambios[0];
 mostrarToast(` "${c.nombre.substring(0, 40)}..." cambió: ${c.estadoAnterior} → ${c.estadoActual}`, 'warning');
 } else {
 mostrarToast(` ${cambios.length} licitaciones cambiaron de estado`, 'warning');
 }
 
 // Opcional: reproducir sonido
 reproducirSonidoNotificacion();
}

/**
 * Reproduce un sonido de notificación
 */
function reproducirSonidoNotificacion() {
 try {
 const audio = new Audio('data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==');
 audio.volume = 0.3;
 audio.play().catch(e => console.log('Sonido no soportado'));
 } catch(e) {}
}

/**
 * Solicita permiso para notificaciones del navegador
 */
function solicitarPermisoNotificaciones() {
 if (Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
 Notification.requestPermission();
 }
}

/**
 * Renderiza el panel de seguimientos (mini panel en la UI)
 */
function renderizarPanelSeguimiento() {
 const seguimientos = cargarSeguimientos();
 const total = Object.keys(seguimientos).length;
 
 // Buscar o crear el panel
 let panel = document.getElementById('iaSeguimientoPanel');
 if (!panel) {
 const configPanel = document.getElementById('iaConfigPanel');
 if (configPanel) {
 const panelHTML = `
 <div id="iaSeguimientoPanel" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">
 <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
 <span style="font-size:.75rem;font-weight:600;font-family:'JetBrains Mono',monospace"> MIS SEGUIMIENTOS</span>
 <button class="btn btn-ghost btn-sm" onclick="abrirModalSeguimientos()" style="font-size:.65rem">Ver todos</button>
 </div>
 <div id="iaSeguimientoLista" style="font-size:.75rem;color:var(--text2)">
 ${total === 0 ? 'No hay licitaciones en seguimiento. Marca una licitación con ' : `${total} licitación(es) en seguimiento`}
 </div>
 </div>
 `;
 configPanel.insertAdjacentHTML('beforeend', panelHTML);
 panel = document.getElementById('iaSeguimientoPanel');
 }
 }
}

/**
 * Abre el modal con todos los seguimientos
 */
function abrirModalSeguimientos() {
 const seguimientos = cargarSeguimientos();
 
 let modal = document.getElementById('modalSeguimientos');
 if (!modal) {
 const modalHTML = `
 <div id="modalSeguimientos" class="modal-overlay" style="display:none;z-index:1001" onclick="cerrarModalSeguimientos(event)">
 <div class="modal" style="max-width:600px;width:90%" onclick="event.stopPropagation()">
 <div class="modal-head">
 <div class="modal-title">Licitaciones en seguimiento</div>
 <button class="modal-close" onclick="cerrarModalSeguimientos()" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 <div class="modal-body" id="modalSeguimientosBody" style="max-height:60vh;overflow-y:auto"></div>
 <div class="modal-foot" style="padding:12px 20px;border-top:1px solid var(--border)">
 <button class="btn btn-ghost" onclick="cerrarModalSeguimientos()">Cerrar</button>
 </div>
 </div>
 </div>
 `;
 document.body.insertAdjacentHTML('beforeend', modalHTML);
 modal = document.getElementById('modalSeguimientos');
 }
 
 if (Object.keys(seguimientos).length === 0) {
 document.getElementById('modalSeguimientosBody').innerHTML = `
 <div class="empty-state" style="padding:40px">
 <div class="empty-icon"></div>
 <div class="empty-title">No hay seguimientos</div>
 <div class="empty-sub">Marca una licitación con para recibir notificaciones</div>
 </div>
 `;
 } else {
 document.getElementById('modalSeguimientosBody').innerHTML = `
 <div style="display:flex;flex-direction:column;gap:12px">
 ${Object.entries(seguimientos).map(([id, seg]) => `
 <div style="border:1px solid var(--border);border-radius:8px;padding:12px">
 <div style="display:flex;justify-content:space-between;align-items:flex-start">
 <div style="flex:1">
 <div style="font-weight:600;margin-bottom:4px">${seg.nombre || 'Licitación'}</div>
 <div style="font-size:.7rem;color:var(--text2);display:flex;gap:12px;flex-wrap:wrap">
 <span> ${new Date(seg.fechaInicio).toLocaleDateString()}</span>
 <span> Estado: ${seg.ultimoEstado || seg.estadoActual}</span>
 ${seg.importe ? `<span> ${formatEUR(seg.importe)}</span>` : ''}
 </div>
 </div>
 <button class="btn btn-ghost btn-sm" onclick="eliminarSeguimiento('${id}'); location.reload()" style="color:var(--red)"> </button>
 </div>
 </div>
 `).join('')}
 </div>
 `;
 }
 
 modal.style.display = 'flex';
}

function cerrarModalSeguimientos(event) {
 if (event && event.target !== event.currentTarget) return;
 const modal = document.getElementById('modalSeguimientos');
 if (modal) modal.style.display = 'none';
}
function toggleSeguimientoSinRecarga(licitId, licit, boton) {
 if (estaEnSeguimiento(licitId)) {
 eliminarSeguimiento(licitId);
 mostrarToast('Seguimiento eliminado', 'info');
 boton.innerHTML = ' Marcar seguimiento';
 boton.style.color = 'var(--text2)';
 boton.style.borderColor = 'var(--border)';
 boton.title = 'Marcar para seguimiento';
 } else {
 guardarSeguimiento(licitId, {
 nombre: licit.objeto?.substring(0, 80) || 'Licitación',
 organo: licit.organo,
 importe: licit._importeConIVA || licit.presupuestoConIVA,
 estadoActual: licit.estado || 'Desconocido',
 vigenciaActual: licit.vigencia || 'Desconocida',
 fechaInicio: new Date().toISOString()
 });
 mostrarToast(' Licitación agregada a seguimiento', 'success');
 boton.innerHTML = ' En seguimiento';
 boton.style.color = '#f5a623';
 boton.style.borderColor = '#f5a623';
 boton.title = 'Eliminar seguimiento';
 }
 
 // Actualizar el panel de seguimientos
 const panel = document.getElementById('iaSeguimientoLista');
 if (panel) {
 const seguimientos = cargarSeguimientos();
 const total = Object.keys(seguimientos).length;
 panel.innerHTML = total === 0 ? 'No hay licitaciones en seguimiento. Marca una licitación con ' : `${total} licitación(es) en seguimiento`;
 }
}
// ============================================================
// ASISTENTE IA PARA RELLENAR DOCUMENTOS
// ============================================================

let modalGenerador = null;
let licitacionActual = null;
let tipoDocumentoActual = null;
let contenidoGenerado = null;

const TIPOS_DOCUMENTO = [
 { id: 'presentacion', nombre: ' Carta de presentación', descripcion: 'Carta formal para presentar la oferta' },
 { id: 'tecnica', nombre: ' Oferta técnica', descripcion: 'Descripción detallada de la solución técnica' },
 { id: 'economica', nombre: ' Oferta económica', descripcion: 'Desglose de precios y presupuesto' },
 { id: 'anexos', nombre: ' Anexos', descripcion: 'Documentación complementaria requerida' },
 { id: 'cv', nombre: ' Perfil del equipo', descripcion: 'Currículums del equipo propuesto' }
];

function crearModalGenerador() {
 if (document.getElementById('modalGenerador')) return;
 const modalHTML = `
 <div id="modalGenerador" class="modal-overlay" style="display:none;z-index:1002" onclick="cerrarModalGenerador(event)">
 <div class="modal" style="max-width:800px;width:90%" onclick="event.stopPropagation()">
 <div class="modal-head">
 <div class="modal-title"> Asistente IA - Generar documento</div>
 <button class="modal-close" onclick="cerrarModalGenerador()" aria-label="Cerrar"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg></button>
 </div>
 <div class="modal-body" style="max-height:70vh;overflow-y:auto;padding:20px">
 <div id="generadorContenido">
 <div style="text-align:center;padding:40px">
 <div class="ia-spinner"></div>
 <p>Cargando...</p>
 </div>
 </div>
 </div>
 <div class="modal-foot" style="padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
 <div>
 <button class="btn btn-primary" id="btnRegenerar" onclick="regenerarDocumento()" style="display:none"> Regenerar</button>
 <button class="btn btn-success" id="btnDescargarDoc" onclick="descargarDocumento()" style="display:none;background:#10b981"> Descargar</button>
 </div>
 <button class="btn btn-ghost" onclick="cerrarModalGenerador()">Cerrar</button>
 </div>
 </div>
 </div>
 `;
 document.body.insertAdjacentHTML('beforeend', modalHTML);
 modalGenerador = document.getElementById('modalGenerador');
}

async function abrirModalGenerarDocumento(licit) {
 console.log('abrirModalGenerarDocumento llamado', licit);
 crearModalGenerador();
 licitacionActual = licit;
 
 document.getElementById('generadorContenido').innerHTML = `
 <div style="margin-bottom:20px">
 <label style="display:block;margin-bottom:8px;font-weight:600"> Licitación seleccionada</label>
 <div style="background:var(--surface2);padding:12px;border-radius:8px;font-size:.85rem">
 <strong>${escHtml(licit.objeto || 'Sin objeto')}</strong>
 <div style="margin-top:4px;color:var(--text2);font-size:.75rem">
 ${licit.organo ? ` ${escHtml(licit.organo)}` : ''}
 ${licit.cpv ? ` | CPV: ${escHtml(licit.cpv)}` : ''}
 </div>
 </div>
 </div>
 <div style="margin-bottom:20px">
 <label style="display:block;margin-bottom:8px;font-weight:600"> Tipo de documento</label>
 <div style="display:flex;flex-wrap:wrap;gap:8px">
 ${TIPOS_DOCUMENTO.map(tipo => `
 <button onclick="seleccionarTipoDocumento('${tipo.id}', '${tipo.nombre}')" 
 style="padding:8px 16px;background:var(--surface);border:1px solid var(--border);
 border-radius:8px;cursor:pointer;font-size:.8rem">
 ${tipo.nombre}
 </button>
 `).join('')}
 </div>
 </div>
 <div id="areaGeneracion" style="display:none">
 <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center">
 <label style="font-weight:600"> Documento generado</label>
 <span id="generandoSpinner" style="display:none" class="ia-spinner"></span>
 </div>
 <div id="documentoPreview" style="border:1px solid var(--border);border-radius:8px;padding:20px;background:var(--surface);font-family:'Instrument Sans',sans-serif;font-size:.85rem;line-height:1.6;max-height:400px;overflow-y:auto;white-space:pre-wrap">
 </div>
 </div>
 `;
 modalGenerador.style.display = 'flex';
}

async function seleccionarTipoDocumento(tipoId, tipoNombre) {
 console.log('seleccionarTipoDocumento', tipoId, tipoNombre);
 window.tipoDocSeleccionado = tipoId;
 tipoDocumentoActual = tipoNombre;
 
 const areaGen = document.getElementById('areaGeneracion');
 const preview = document.getElementById('documentoPreview');
 const spinner = document.getElementById('generandoSpinner');
 
 areaGen.style.display = 'block';
 preview.innerHTML = '<div style="text-align:center;padding:40px"><div class="ia-spinner"></div><p>Generando documento con IA...</p></div>';
 spinner.style.display = 'inline-block';
 
 
 try {
 const licit = licitacionActual;
 if (!licit) {
 preview.innerHTML = '<div style="color:var(--red)">Error: no hay licitación seleccionada.</div>';
 spinner.style.display = 'none';
 return;
 }

 const importe = licit.importeConIVA || licit.importeSinIVA || 0;

 const PROMPTS_TIPO = {
 presentacion: 'Redacta una carta de presentación formal y profesional para presentar la oferta a esta licitación pública. Incluye: introducción de la empresa, experiencia relevante, compromiso con los requisitos del pliego, y cierre formal.',
 tecnica: 'Redacta una oferta técnica detallada para esta licitación. Incluye: descripción de la solución técnica propuesta, metodología de trabajo, equipo técnico asignado, cronograma de ejecución y medidas de calidad.',
 economica: 'Redacta una oferta económica estructurada para esta licitación. Incluye: desglose de costes, precio total ofertado, justificación del precio, condiciones de pago y posibles descuentos por volumen.',
 anexos: 'Redacta los anexos complementarios necesarios para esta licitación. Incluye: declaraciones responsables, certificaciones de capacidad técnica, referencias de trabajos similares y cualquier documentación adicional relevante.',
 cv: 'Redacta los perfiles del equipo de trabajo propuesto para esta licitación. Incluye: director de proyecto, técnicos principales y especialistas, con su experiencia relevante y roles en el proyecto.'
 };

 const tipoId = window.tipoDocSeleccionado || 'presentacion';
 const instruccion = PROMPTS_TIPO[tipoId] || PROMPTS_TIPO.presentacion;

 const promptText = `Eres un asistente especializado en redacción de documentación para licitaciones públicas españolas.

DATOS DE LA LICITACIÓN:
- Objeto: ${(licit.objeto || 'No especificado').substring(0, 300)}
- Órgano contratante: ${licit.organo || 'No especificado'}
- CPV: ${licit.cpv || 'No especificado'}
- Presupuesto: ${importe > 0 ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(importe) : 'No especificado'}
- Tipo de procedimiento: ${licit.tipoProcedimiento || 'No especificado'}
- Expediente: ${licit.expediente || 'No especificado'}

TIPO DE DOCUMENTO: ${tipoDocumentoActual || 'Carta de presentación'}

INSTRUCCIONES: ${instruccion}

IMPORTANTE: 
- Usa español formal y profesional
- La empresa se llama [Nombre de tu empresa] — el usuario lo reemplazará
- Devuelve SOLO el contenido del documento, sin explicaciones adicionales
- Usa formato de texto plano con saltos de línea, no HTML`;

 const res = await fetch('/api/ia/groq', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 messages: [{ role: 'user', content: promptText }],
 max_tokens: 1200,
 temperature: 0.5
 })
 });

 if (!res.ok) {
 throw new Error('Error ' + res.status + ' al llamar a la API de IA');
 }

 const envelope = await res.json();
 const texto = envelope.data?.choices?.[0]?.message?.content?.trim()
 ?? envelope.choices?.[0]?.message?.content?.trim()
 ?? null;

 if (!texto) throw new Error('La IA no devolvió contenido');

 contenidoGenerado = texto;
 preview.textContent = texto;
 spinner.style.display = 'none';

 const btnReg = document.getElementById('btnRegenerar');
 const btnDl = document.getElementById('btnDescargarDoc');
 if (btnReg) btnReg.style.display = 'inline-flex';
 if (btnDl) btnDl.style.display = 'inline-flex';

 } catch (error) {
 console.error('Error generando documento:', error);
 preview.innerHTML = '<div style="color:var(--red)"> Error al generar el documento: ' + error.message + '<br><br>Verifica que el servidor esté activo y que la API de IA esté configurada.</div>';
 spinner.style.display = 'none';
 }
}

function regenerarDocumento() {
 if (window.tipoDocSeleccionado && tipoDocumentoActual) {
 seleccionarTipoDocumento(window.tipoDocSeleccionado, tipoDocumentoActual);
 }
}

function descargarDocumento() {
 if (!contenidoGenerado) return;
 const blob = new Blob([contenidoGenerado], { type: 'text/plain;charset=utf-8' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = 'documento_' + (tipoDocumentoActual || 'generado').replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + new Date().toISOString().slice(0, 10) + '.txt';
 document.body.appendChild(link);
 link.click();
 document.body.removeChild(link);
 URL.revokeObjectURL(url);
}

function cerrarModalGenerador(event) {
 if (event && event.target !== event.currentTarget) return;
 const modal = document.getElementById('modalGenerador');
 if (modal) modal.style.display = 'none';
}
