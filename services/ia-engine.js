function parseAmount(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  
  let s = String(val).replace(/\u00a0/g, ' ').trim();
  if (!s || s === '-') return null;
  s = s.replace(/[€$]/g, '').replace(/\s/g, '');
  if (!s || s === '-') return null;
  s = s.replace(/[^0-9.,-]/g, '');
  
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    s = s.replace(',', '.');
  }
  
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatEUR(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2
  }).format(n);
}

const SECTOR_CPV = {
  'Tecnología e informática': ['72', '48', '30', '31', '32', '35', '38', '50', '51', '64', '73', '79', '80'],
  'Construcción y obras': ['45'],
  'Limpieza y mantenimiento': ['90', '77', '50'],
  'Consultoría y servicios profesionales': ['79', '73', '72', '80']
};

function cpvMatchSector(cpvStr, sector) {
  if (!cpvStr || !cpvStr.trim()) return null;
  const cpv = cpvStr.trim().replace(/\s/g, '');
  const prefijos = SECTOR_CPV[sector] || [];
  if (!prefijos.length) return true;
  return prefijos.some(p => cpv.startsWith(p));
}

function analizarLicitacion(licit, sector, config = {}) {
  const importeMin = config.importeMin || 0;
  const importeMax = config.importeMax || Infinity;
  
  let puntos = 5;
  const favor = [];
  const contra = [];
  
  const matchCpv = cpvMatchSector(licit.cpv, sector);
  if (matchCpv === false) {
    puntos -= 3;
    contra.push(`CPV (${licit.cpv}) no corresponde al sector "${sector}"`);
  } else if (matchCpv === true) {
    puntos += 2;
    favor.push(`CPV ${licit.cpv} alineado con tu sector`);
  }
  
  const importe = parseAmount(licit.importe_adjudicacio_1_) || 
                  parseAmount(licit.presupuesto_base_c_) || 0;
  
  if (importe > 0 && importeMin > 0 && importe < importeMin) {
    puntos = 1;
    contra.push(`🚫 Importe (${formatEUR(importe)}) por debajo del mínimo (${formatEUR(importeMin)})`);
  } else if (importe > 0 && importeMax < Infinity && importe > importeMax) {
    puntos = 1;
    contra.push(`🚫 Importe (${formatEUR(importe)}) por encima del máximo (${formatEUR(importeMax)})`);
  } else if (importe >= 500000) {
    puntos += 1;
    favor.push(`Contrato de alto valor: ${formatEUR(importe)}`);
  } else if (importe > 0 && importe < 5000) {
    puntos -= 1;
    contra.push(`Importe muy bajo (${formatEUR(importe)})`);
  } else if (importe >= 5000) {
    favor.push(`Importe razonable: ${formatEUR(importe)}`);
  }
  
  const estado = (licit.estado || '').toLowerCase();
  if (estado.includes('adjudicad') || estado.includes('resuelt')) {
    puntos = 1;
    contra.push('🚫 Ya adjudicada — contrato cerrado');
  } else if (estado.includes('pendiente')) {
    puntos += 1;
    favor.push('Pendiente de adjudicación — aún a tiempo');
  }
  
  puntos = Math.max(1, Math.min(10, puntos));
  
  let veredicto, resumen;
  if (puntos >= 7) {
    veredicto = 'RECOMENDABLE';
    resumen = 'Buena oportunidad: el mercado está abierto, el CPV encaja.';
  } else if (puntos >= 4) {
    veredicto = 'NEUTRAL';
    resumen = 'Valorar caso a caso: hay factores favorables pero también riesgos.';
  } else {
    veredicto = 'NO RECOMENDABLE';
    resumen = 'Riesgo elevado: sector no alineado o licitación cerrada.';
  }
  
  return {
    veredicto,
    puntuacion: puntos,
    resumen,
    puntos_favor: favor,
    puntos_contra: contra,
    importe,
    organo: licit.organo_de_contratac_,
    objeto: licit.objeto_del_contrato,
    cpv: licit.cpv
  };
}

function analizarLote(licitaciones, sector, config = {}) {
  return licitaciones.map(licit => ({
    licitacion: {
      id: licit.identificador,
      objeto: licit.objeto_del_contrato,
      organo: licit.organo_de_contratac_,
      cpv: licit.cpv,
      estado: licit.estado,
      importeConIVA: licit.importe_adjudicacio_1_
    },
    analisis: analizarLicitacion(licit, sector, config)
  }));
}

module.exports = { analizarLicitacion, analizarLote, parseAmount, formatEUR };