// routes/documentos.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');
const archiver = require('archiver');
const stream = require('stream');

// Configuración de portales y sus selectores
const PORTALES = {
  'contrataciondelestado.es': {
    nombre: 'PLACSP',
    selectores: ['a[href$=".pdf"]', 'a:contains("Pliego")', 'a:contains("pliego")', 'a:contains("documento")']
  },
  'contrataciopublica.cat': {
    nombre: 'Generalitat Catalunya',
    selectores: ['a[href$=".pdf"]', 'a:contains("plec")', 'a:contains("document")', '.document-download a']
  },
  'contratos-publicos.comunidad.madrid': {
    nombre: 'Comunidad Madrid',
    selectores: ['a[href$=".pdf"]', 'a:contains("Pliego")', '.fichero a']
  },
  'juntadeandalucia.es': {
    nombre: 'Junta Andalucía',
    selectores: ['a[href$=".pdf"]', 'a:contains("Pliego")', 'a:contains("documento")']
  },
  'contratacion.euskadi.eus': {
    nombre: 'País Vasco',
    selectores: ['a[href$=".pdf"]', 'a:contains("Pliego")', 'a:contains("agiriak")']
  },
  'contratacion.gva.es': {
    nombre: 'Generalitat Valenciana',
    selectores: ['a[href$=".pdf"]', 'a:contains("Pliego")', '.documento a']
  },
  'contratacion.aragon.es': {
    nombre: 'Aragón',
    selectores: ['a[href$=".pdf"]', 'a:contains("Pliego")']
  }
};

// Función para detectar el portal a partir de la URL
function detectarPortal(url) {
  for (const [dominio, config] of Object.entries(PORTALES)) {
    if (url.includes(dominio)) {
      return { dominio, ...config };
    }
  }
  return { nombre: 'Genérico', selectores: ['a[href$=".pdf"]'] };
}

// Endpoint: Extraer documentos de una URL
router.get('/scrape', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL requerida' });
  }

  try {
    console.log(`[Scrape] Analizando: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const portalInfo = detectarPortal(url);
    const documentos = [];

    // Buscar enlaces según los selectores del portal
    for (const selector of portalInfo.selectores) {
      $(selector).each((i, element) => {
        const href = $(element).attr('href');
        if (!href) return;
        
        let urlCompleta = href;
        try {
          urlCompleta = new URL(href, url).href;
        } catch (e) {
          urlCompleta = href;
        }
        
        let nombre = $(element).text().trim();
        if (!nombre || nombre.length < 3) {
          nombre = `Documento_${i+1}`;
        }
        
        if (urlCompleta.toLowerCase().includes('.pdf') || 
            nombre.toLowerCase().includes('pliego') ||
            nombre.toLowerCase().includes('documento') ||
            nombre.toLowerCase().includes('anexo')) {
          
          documentos.push({
            url: urlCompleta,
            nombre: nombre.length > 80 ? nombre.substring(0, 77) + '...' : nombre,
            tipo: urlCompleta.toLowerCase().includes('.pdf') ? 'PDF' : 'Enlace'
          });
        }
      });
    }

    // Eliminar duplicados
    const documentosUnicos = [];
    const urlsVistas = new Set();
    for (const doc of documentos) {
      if (!urlsVistas.has(doc.url)) {
        urlsVistas.add(doc.url);
        documentosUnicos.push(doc);
      }
    }

    console.log(`[Scrape] Encontrados ${documentosUnicos.length} documentos en ${portalInfo.nombre}`);

    res.json({
      success: true,
      portal: portalInfo.nombre,
      url_original: url,
      documentos: documentosUnicos,
      total: documentosUnicos.length
    });

  } catch (error) {
    console.error('[Scrape] Error:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'No se pudieron extraer documentos',
      mensaje: error.message 
    });
  }
});

// Endpoint: Descargar múltiples documentos (ZIP)
router.post('/descargar', async (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !urls.length) {
    return res.status(400).json({ error: 'Se requiere al menos una URL' });
  }

  try {
    const zipBuffer = [];
    const zipStream = new stream.PassThrough();
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      console.error('[Archive] Error:', err);
    });
    
    archive.pipe(zipStream);
    
    let descargados = 0;
    
    for (let i = 0; i < urls.length; i++) {
      const docUrl = urls[i];
      try {
        console.log(`[Descarga] Descargando: ${docUrl}`);
        
        const response = await axios.get(docUrl, {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 30000
        });
        
        let nombreArchivo = `documento_${i+1}.pdf`;
        const nombreDesdeUrl = docUrl.split('/').pop();
        if (nombreDesdeUrl && nombreDesdeUrl.includes('.pdf')) {
          nombreArchivo = nombreDesdeUrl;
        }
        
        archive.append(response.data, { name: nombreArchivo });
        descargados++;
      } catch (e) {
        console.error(`[Descarga] Error con ${docUrl}:`, e.message);
      }
    }
    
    await archive.finalize();
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=documentos_licitacion.zip');
    
    zipStream.pipe(res);
    
    console.log(`[Descarga] ZIP generado con ${descargados} documentos`);
    
  } catch (error) {
    console.error('[Descarga] Error:', error);
    res.status(500).json({ error: 'Error al generar el ZIP' });
  }
});

module.exports = router;