/* 
   LICIT·LAB — tab-analisis.js  v3
   Dashboard de empresa: column chart + charts rediseñados.
*/

function buildAnalysis() {
  document.getElementById('analysisEmpty').style.display   = 'none';
  document.getElementById('analysisContent').style.display = 'block';
  initEmpresaCombo();
}

function limpiarEmpresa() {
  const input  = document.getElementById('comboEmpresaInput');
  const hidden = document.getElementById('empresaSeleccionada');
  const btn    = document.getElementById('btnLimpiarEmpresa');
  if (input)  input.value  = '';
  if (hidden) hidden.value = '';
  if (btn)    btn.style.display = 'none';
  document.getElementById('empresaEmpty').style.display     = 'block';
  document.getElementById('empresaDashboard').style.display = 'none';
}

function initEmpresaCombo() {
  const seen = new Map();
  allData.forEach(r => {
    const raw = r.adjudicatario;
    if (!raw) return;
    const key = normEmpresa(raw);
    if (!seen.has(key)) seen.set(key, normEmpresaDisplay(raw));
  });
  const options = [...seen.values()].sort((a,b) => a.localeCompare(b,'es'));

  const input  = document.getElementById('comboEmpresaInput');
  const list   = document.getElementById('comboEmpresaList');
  const hidden = document.getElementById('empresaSeleccionada');
  const btn    = document.getElementById('btnLimpiarEmpresa');
  if (!input || !list || !hidden) return;

  function renderList(query) {
    const q = normEmpresa(query.trim());
    const filtered = q ? options.filter(o => normEmpresa(o).includes(q)) : options.slice(0,60);
    list.innerHTML = filtered.slice(0,80).map(o => {
      let label = escHtml(o);
      if (q) {
        const idx = normEmpresa(o).indexOf(q);
        if (idx >= 0)
          label = escHtml(o.slice(0,idx))+'<mark>'+escHtml(o.slice(idx,idx+q.length))+'</mark>'+escHtml(o.slice(idx+q.length));
      }
      return '<div class="combo-option" data-value="'+escHtml(o)+'">'+label+'</div>';
    }).join('') || '<div class="combo-empty">Sin coincidencias</div>';

    list.querySelectorAll('.combo-option').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value  = el.dataset.value;
        hidden.value = el.dataset.value;
        if (btn) btn.style.display = 'inline-flex';
        list.classList.remove('open');
        buildEmpresaDashboard(el.dataset.value);
      });
    });
  }

  input.addEventListener('focus',   () => { renderList(input.value); list.classList.add('open'); });
  input.addEventListener('input',   () => { hidden.value=''; renderList(input.value); list.classList.add('open'); });
  input.addEventListener('blur',    () => setTimeout(() => list.classList.remove('open'), 160));
  input.addEventListener('keydown', e => {
    if (e.key==='Escape') { limpiarEmpresa(); list.classList.remove('open'); }
    if (e.key==='Enter' && hidden.value) buildEmpresaDashboard(hidden.value);
  });
}

// ── COLUMN CHART (barras verticales) ─────────────────────────────────────────
const COL_PALETTE = ['col-teal','col-blue1','col-blue2','col-blue3','col-blue4',
  'col-blue5','col-blue6','col-blue7','col-blue8','col-blue9','col-blue10'];

function buildColChart(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items.length) { el.innerHTML='<p style="color:var(--text3);font-size:12px;padding:10px 0">Sin datos</p>'; return; }

  const max = Math.max(...items.map(i=>i.value));

  const bars = items.map((item, i) => {
    const hPct = max ? Math.max(4, Math.round(item.value/max*100)) : 4;
    const color = COL_PALETTE[i % COL_PALETTE.length];
    return '<div class="col-bar-group">'+
      '<div class="col-bar '+color+'" style="height:'+hPct+'%">'+
        '<div class="col-bar-val">'+item.value+'</div>'+
      '</div>'+
    '</div>';
  }).join('');

  const labels = items.map(item =>
    '<div class="col-chart-label" title="'+escHtml(item.label)+'">'+escHtml(item.label)+'</div>'
  ).join('');

  el.innerHTML =
    '<div class="col-chart-wrap">'+
      '<div class="col-chart-grid-lines">'+
        '<div class="col-grid-mid"></div>'+
        '<div class="col-grid-75"></div>'+
        bars+
      '</div>'+
      '<div class="col-chart-labels">'+labels+'</div>'+
    '</div>';
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function buildEmpresaDashboard(empresa) {
  const norm = normEmpresa(empresa || '');
  const data = allData.filter(r => normEmpresa(r.adjudicatario || '') === norm);

  document.getElementById('empresaEmpty').style.display     = data.length ? 'none'  : 'block';
  document.getElementById('empresaDashboard').style.display = data.length ? 'block' : 'none';
  const btn = document.getElementById('btnLimpiarEmpresa');
  if (btn) btn.style.display = data.length ? 'inline-flex' : 'none';
  if (!data.length) return;

  const totalImporte   = data.reduce((s,r)=>s+(r._importeConIVA||0),0);
  const totalContratos = data.length;
  const organos        = [...new Set(data.map(r=>r.organo).filter(Boolean))];
  const importeMax     = Math.max(...data.map(r=>r._importeConIVA||0));
  const importeMedio   = totalImporte / totalContratos;
  const NIF_PLACEHOLDER = /^(nif|cif|nie|id|identificador|-)$/i;
  const nifCounts = {};
  data.forEach(r => {
    const v = String(r.idAdjudicatario || '').trim();
    if (v && !NIF_PLACEHOLDER.test(v) && v !== 'null' && v !== 'undefined' && v !== '0') {
      nifCounts[v] = (nifCounts[v]||0)+1;
    }
  });
  const nifRaw = Object.entries(nifCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
  const isPyme         = data.some(r=>/s[ií]|yes|true/i.test(r.esPyme||''));
  const adjCount       = data.filter(r=>/adjudicad|formalizado/i.test(r.estado||'')).length;
  const tasaExito      = totalContratos>0 ? Math.round(adjCount/totalContratos*100) : 0;

  // Años
  const porAnio = {}, importeAnio = {};
  data.forEach(r => {
    const y = (r.primeraPublicacion||r.fechaActualizacion||'').slice(0,4);
    if (y && /^20\d\d$/.test(y)) {
      porAnio[y]     = (porAnio[y]||0)+1;
      importeAnio[y] = (importeAnio[y]||0)+(r._importeConIVA||0);
    }
  });
  const anioMax = Object.entries(porAnio).sort((a,b)=>b[1]-a[1])[0];

  // ── Hero
  document.getElementById('empresaNombre').textContent = normEmpresaDisplay(empresa);
  const metaParts = [];
  if (nifRaw) metaParts.push('NIF: ' + nifRaw);
  metaParts.push(organos.length + ' órgano' + (organos.length!==1?'s':'') + ' contratante' + (organos.length!==1?'s':''));
  if (isPyme) metaParts.push('PYME');
  document.getElementById('empresaMeta').textContent = metaParts.join('  ·  ');
  document.getElementById('empresaBadge').textContent  = formatEUR(totalImporte)+' total adj.';

  // ── KPIs
  const kpiData = [
    { label:'Contratos totales', value:totalContratos,          color:'blue', sub:'registros en BBDD' },
    { label:'Importe total',     value:formatEUR(totalImporte), color:'blue', sub:'adjudicado con IVA',  raw:true },
    { label:'Importe medio',     value:formatEUR(importeMedio), color:'cyan', sub:'por contrato',        raw:true },
    { label:'Contrato más alto', value:formatEUR(importeMax),   color:'',     sub:'importe máximo',      raw:true },
    { label:'Órganos únicos',    value:organos.length,          color:'',     sub:'administraciones' },
    { label:'PYME',              value:isPyme?'Sí':'No',        color:isPyme?'blue':'amber', sub:'clasificación', raw:true },
    { label:'Adj. / Total',      value:adjCount+' / '+totalContratos, color:'', sub:tasaExito+'% adjudicado', raw:true },
  ];
  if (anioMax) kpiData.push({ label:'Año más activo', value:anioMax[0], color:'cyan', sub:anioMax[1]+' contratos', raw:true });

  document.getElementById('empresaKpis').innerHTML = kpiData.map(k =>
    '<div class="kpi-card">'+
    '<div class="kpi-label">'+k.label+'</div>'+
    '<div class="kpi-value '+k.color+'">'+(k.raw ? k.value : k.value.toLocaleString('es-ES'))+'</div>'+
    '<div class="kpi-sub">'+k.sub+'</div></div>'
  ).join('');

  // ── Timeline
  const dotColor = e => /adjudicad|formalizado/i.test(e)?'lime':/pendiente/i.test(e)?'amber':/anulad|desistid/i.test(e)?'red':'cyan';
  const sorted   = [...data].sort((a,b)=>new Date(b.primeraPublicacion||b.fechaActualizacion||0)-new Date(a.primeraPublicacion||a.fechaActualizacion||0)).slice(0,8);
  document.getElementById('empresaTimeline').innerHTML = sorted.map(r =>
    '<div class="timeline-item">'+
    '<div class="timeline-dot '+dotColor(r.estado||'')+'"></div>'+
    '<div class="timeline-body">'+
    '<div class="timeline-title" title="'+escHtml(r.objeto||'')+'">'+escHtml((r.objeto||'Sin objeto').slice(0,70))+((r.objeto||'').length>70?'…':'')+'</div>'+
    '<div class="timeline-meta">'+escHtml(r.organo||'—')+' · '+escHtml(r.estado||'—')+' · '+escHtml((r.primeraPublicacion||r.fechaActualizacion||'').slice(0,10))+'</div>'+
    '</div>'+
    (r._importeConIVA?'<div class="timeline-amount">'+formatEUR(r._importeConIVA)+'</div>':'')+
    '</div>'
  ).join('') || '<p style="color:var(--text3);font-size:12px">Sin contratos</p>';

  // ── Órganos
  const orgMap = {};
  data.forEach(r=>{ if(!r.organo) return; if(!orgMap[r.organo]) orgMap[r.organo]={count:0,importe:0}; orgMap[r.organo].count++; orgMap[r.organo].importe+=(r._importeConIVA||0); });
  const orgList = Object.entries(orgMap).sort((a,b)=>b[1].count-a[1].count).slice(0,8);
  document.getElementById('empresaOrganos').innerHTML =
    '<thead><tr><th>Órgano</th><th style="text-align:right">Contratos</th><th style="text-align:right">Importe</th></tr></thead>'+
    '<tbody>'+orgList.map(([o,v])=>
      '<tr><td title="'+escHtml(o)+'">'+escHtml(o.length>42?o.slice(0,42)+'…':o)+'</td>'+
      '<td class="num"><span class="pill">'+v.count+'</span></td>'+
      '<td class="num">'+formatEUR(v.importe)+'</td></tr>'
    ).join('')+'</tbody>';

  // ── Column chart: evolución anual
  const anios = Object.keys(porAnio).sort();
  buildColChart('empresaColChart', anios.map(y=>({ label:y, value:porAnio[y] })));

  // ── Donuts tipo contrato
  const tipoMap    = {};
  data.forEach(r=>{ const t=r.tipoContrato||'Otro'; tipoMap[t]=(tipoMap[t]||0)+1; });
  const tipoColorsConic = ['#2563eb','#0284c7','#0d9488','#7c3aed','#4f46e5'];
  const tipoList   = Object.entries(tipoMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  document.getElementById('empresaDonutTipos').innerHTML = tipoList.map(([t,c],i) => {
    const pct = Math.round(c/totalContratos*100);
    const color = tipoColorsConic[i]||'#2563eb';
    return '<div class="donut-item">'+
      '<div class="donut-ring" style="background:conic-gradient('+color+' 0% '+pct+'%,var(--border) '+pct+'% 100%)">'+
      '<span class="donut-inner">'+pct+'%</span></div>'+
      '<div class="donut-label">'+escHtml(t.length>14?t.slice(0,14)+'…':t)+'</div>'+
      '</div>';
  }).join('');

  // ── vbar estados
  const estadoMap = {};
  data.forEach(r=>{ const e=r.estado||'Desconocido'; estadoMap[e]=(estadoMap[e]||0)+1; });
  const estadoColorKey = { 'Adjudicada':'blue1','Adjudicado':'blue1','Formalizado':'teal','Pendiente':'amber','Resuelta':'blue2','Anulado':'red','Desistido':'red' };
  buildVBarChart('empresaBarEstados',
    Object.entries(estadoMap).sort((a,b)=>b[1]-a[1]).map(([l,c])=>({label:l,value:c,colorKey:estadoColorKey[l]||'slate'})),
    v=>v+' contratos');

  // ── vbar rangos
  const rangos = [
    {label:'< 10k €',min:0,max:10000,ck:'teal'},
    {label:'10k – 50k €',min:10000,max:50000,ck:'blue1'},
    {label:'50k – 100k €',min:50000,max:100000,ck:'blue2'},
    {label:'100k – 500k €',min:100000,max:500000,ck:'blue3'},
    {label:'500k – 1M €',min:500000,max:1000000,ck:'amber'},
    {label:'> 1M €',min:1000000,max:Infinity,ck:'red'},
  ];
  buildVBarChart('empresaBarRangos',
    rangos.map(r=>({label:r.label,value:data.filter(d=>(d._importeConIVA||0)>r.min&&(d._importeConIVA||0)<=r.max).length,colorKey:r.ck})).filter(r=>r.value>0),
    v=>v+' contratos');

  // ── vbar procedimientos
  const procMap = {};
  data.forEach(r=>{ const p=r.tipoProcedimiento||'Sin datos'; procMap[p]=(procMap[p]||0)+1; });
  buildVBarChart('empresaBarProc',
    Object.entries(procMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([l,c],i)=>({label:l,value:c,colorKey:['blue1','blue2','teal','blue3','amber','slate'][i]||'slate'})),
    v=>v+' contratos');

  // ── Importe por año (barras horizontales con €)
  const iaEl = document.getElementById('empresaImporteAnioWrap');
  if (iaEl && anios.length > 0) {
    const maxImp = Math.max(...anios.map(y=>importeAnio[y]||0));
    iaEl.innerHTML = '<div class="importe-anio-chart">'+
      anios.map(y=>{
        const v   = importeAnio[y]||0;
        const pct = maxImp ? Math.max(4,Math.round(v/maxImp*100)) : 4;
        return '<div class="importe-anio-row">'+
          '<div class="importe-anio-label">'+y+'</div>'+
          '<div class="importe-anio-track"><div class="importe-anio-fill" style="width:'+pct+'%"></div></div>'+
          '<div class="importe-anio-val">'+formatEUR(v)+'</div>'+
          '</div>';
      }).join('')+
    '</div>';
  } else if (iaEl) {
    iaEl.innerHTML = '<p style="color:var(--text3);font-size:12px;padding:10px 0">Sin datos anuales</p>';
  }
}

// ── VBAR horizontal ───────────────────────────────────────────────────────────
function buildVBarChart(id, items, formatter) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!items.length) { el.innerHTML='<p style="color:var(--text3);font-size:12px">Sin datos</p>'; return; }
  const max = Math.max(...items.map(i=>i.value));
  el.innerHTML = items.map(item=>{
    const pct  = max ? Math.max(4,Math.round(item.value/max*100)) : 4;
    const color = item.colorKey||'blue1';
    return '<div class="vbar-row">'+
      '<div class="vbar-label" title="'+escHtml(item.label)+'">'+escHtml(item.label)+'</div>'+
      '<div class="vbar-track"><div class="vbar-fill '+color+'" style="width:'+pct+'%"></div></div>'+
      '<div class="vbar-val">'+formatter(item.value)+'</div>'+
    '</div>';
  }).join('');
}

// ── Helpers legacy ────────────────────────────────────────────────────────────
function topN(data,key,n,amountKey){
  const map={};
  data.forEach(r=>{const k=r[key];if(!k)return;if(!map[k])map[k]={label:k,count:0,amount:0};map[k].count++;if(amountKey)map[k].amount+=r[amountKey]||0;});
  return Object.values(map).sort((a,b)=>amountKey?b.amount-a.amount:b.count-a.count).slice(0,n);
}
function buildBarChart(id,items,metric,color,formatter){
  const el=document.getElementById(id);if(!el)return;
  if(!items.length){el.innerHTML='<p style="color:var(--text3);font-size:12px">Sin datos</p>';return;}
  const max=Math.max(...items.map(i=>i[metric]));
  el.innerHTML=items.map(item=>{
    const pct=max?(item[metric]/max*100).toFixed(1):0;
    return '<div class="bar-row"><div class="bar-label" title="'+escHtml(item.label)+'">'+escHtml(item.label)+'</div><div class="bar-track"><div class="bar-fill '+color+'" style="width:'+pct+'%"></div></div><div class="bar-val">'+formatter(item[metric])+'</div></div>';
  }).join('');
}