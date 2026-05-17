const express = require('express');
const { analizarLote } = require('../services/ia-engine');
const { getAllLicitaciones } = require('../services/supabase-client');
const router = express.Router();

router.post('/recomendar', async (req, res) => {
  try {
    const { filtros, paginacion } = req.body;
    
    console.log('📊 Análisis IA solicitado:', filtros?.sector);
    
    const licitaciones = await getAllLicitaciones();
    
    if (!licitaciones || licitaciones.length === 0) {
      return res.json({
        success: true,
        resultados: [],
        total: 0,
        resumen: { recomendables: 0, neutras: 0, noRecomendables: 0, puntuacionMedia: 0 }
      });
    }
    
    const resultados = analizarLote(licitaciones, filtros?.sector || 'Tecnología e informática', {
      importeMin: filtros?.importeMin || 0,
      importeMax: filtros?.importeMax || Infinity
    });
    
    const recomendables = resultados.filter(r => r.analisis.veredicto === 'RECOMENDABLE').length;
    const neutras = resultados.filter(r => r.analisis.veredicto === 'NEUTRAL').length;
    const noRecomendables = resultados.filter(r => r.analisis.veredicto === 'NO RECOMENDABLE').length;
    const puntuacionMedia = resultados.length > 0 
      ? (resultados.reduce((s, r) => s + r.analisis.puntuacion, 0) / resultados.length).toFixed(1)
      : 0;
    
    const page = paginacion?.page || 1;
    const limit = paginacion?.limit || 10;
    const start = (page - 1) * limit;
    const paginated = resultados.slice(start, start + limit);
    
    res.json({
      success: true,
      resultados: paginated,
      total: resultados.length,
      page,
      limit,
      resumen: { recomendables, neutras, noRecomendables, puntuacionMedia }
    });
    
  } catch (error) {
    console.error('Error en análisis IA:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;