// relaciones.worker.js
let index = null;

function computeRisk(group, totalOrg) {
  const n = group.length;

  const totalAmount = group.reduce((s, r) => s + (r._importeConIVA || 0), 0);

  const avg = totalAmount / n;

  const concentration = totalOrg ? (n / totalOrg) : 0;

  let score = 0;

  // 🔥 reglas de riesgo
  if (concentration > 0.8) score += 40;
  if (n >= 5) score += 20;
  if (avg > 100000) score += 20;
  if (n >= 10) score += 20;

  return {
    n,
    totalAmount,
    avg,
    concentration,
    score
  };
}

self.onmessage = function (e) {
  const { type, payload } = e.data;

  if (type === 'BUILD_INDEX') {
    const allData = payload;

    const byOrgano = {};
    const pairs = {};

    allData.forEach(r => {
      if (!r.organo || !r.adjudicatario) return;

      const ko = r.organo.toLowerCase();
      const ka = r.adjudicatario.toLowerCase();

      const key = ko + '|||' + ka;

      byOrgano[ko] = (byOrgano[ko] || 0) + 1;

      if (!pairs[key]) pairs[key] = [];
      pairs[key].push(r);
    });

    // Pre-calcular risk para cada grupo (optimización)
    const pairsWithRisk = {};
    Object.entries(pairs).forEach(([key, group]) => {
      const [ko] = key.split('|||');
      const risk = computeRisk(group, byOrgano[ko]);
      pairsWithRisk[key] = {
        group,
        risk,
        organo: group[0].organo,
        adjudicatario: group[0].adjudicatario,
      };
    });

    index = { pairsWithRisk };

    postMessage({ type: 'INDEX_READY' });
  }

  if (type === 'SEARCH') {
    const term = payload.term.toLowerCase();
    const results = [];

    Object.entries(index.pairsWithRisk).forEach(([key, data]) => {
      const [ko, ka] = key.split('|||');

      if (!ko.includes(term) && !ka.includes(term)) return;

      results.push({
        organo: data.organo,
        adjudicatario: data.adjudicatario,
        risk: data.risk,
        contratos: data.group.slice(0, 10)
      });
    });

    // 🔥 ordenar por riesgo
    results.sort((a, b) => b.risk.score - a.risk.score);

    postMessage({ type: 'RESULT', payload: results });
  }
};