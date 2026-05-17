// routes/documentos.js
// ─────────────────────────────────────────────────────────────────────────────
//  Obtiene los documentos REALES de una licitación pública española.
//
//  ESTRATEGIA POR PORTAL:
//  ┌─────────────────────────────┬────────────────────────────────────────────┐
//  │ PLACSP (contratacion.es)    │ JS-rendered → no scrapeamos. Devolvemos   │
//  │                             │ aviso + URL directa para acceso manual.    │
//  ├─────────────────────────────┼────────────────────────────────────────────┤
//  │ Euskadi (euskadi.eus)       │ 1º API REST del portal. 2º scraping HTML  │
//  │                             │   estático con filtro ESTRICTO.            │
//  ├─────────────────────────────┼────────────────────────────────────────────┤
//  │ Resto de portales           │ Scraping HTML con filtro ESTRICTO:        │
//  │                             │   solo .pdf/.zip/.doc O rutas CDN conocidas│
//  └─────────────────────────────┴────────────────────────────────────────────┘
//
//  FILTRO ESTRICTO (evita falsos positivos de nav-bars):
//  Un enlace es documento REAL sólo si:
//    a) Su URL tiene extensión de archivo descargable (.pdf, .zip, .doc…), O
//    b) Su ruta pertenece a un CDN/repositorio de documentos conocido.
//  Nunca se aceptan links de navegación, aunque el texto diga "pliego".
// ─────────────────────────────────────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const archiver = require('archiver');
const stream   = require('stream');

let axios, cheerio;
try { axios   = require('axios');   } catch(e) { axios   = null; }
try { cheerio = require('cheerio'); } catch(e) { cheerio = null; }

// ════════════════════════════════════════════════════════════════════════
//  USER AGENTS
// ════════════════════════════════════════════════════════════════════════
const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
];
const rndUA = () => UAS[Math.floor(Math.random() * UAS.length)];

function hdrs(url, referer) {
  return {
    'User-Agent': rndUA(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
    'Sec-Fetch-User': '?1',
    ...(referer ? { 'Referer': referer } : {}),
  };
}

// ════════════════════════════════════════════════════════════════════════
//  DETECCIÓN DE PORTALES JS-RENDERED (cheerio no puede scrapearlo)
// ════════════════════════════════════════════════════════════════════════
const JS_RENDERED_PORTALS = [
  // PLACSP - IBM WebSphere Portal, todo el contenido lo carga JS
  { pattern: /contrataciondelestado\.es/i,           nombre: 'PLACSP' },
  { pattern: /contratacion\.gob\.es/i,               nombre: 'Contratación.gob.es' },
  { pattern: /contratosdelsectorpublico\.es/i,        nombre: 'Sector Público' },
];

function esPortalJsRendered(url) {
  return JS_RENDERED_PORTALS.find(p => p.pattern.test(url)) || null;
}

// ════════════════════════════════════════════════════════════════════════
//  FILTRO ESTRICTO: ¿es un documento descargable real?
//
//  Problema a resolver: los nav-bars de los portales tienen links como
//  "Documentación de contratos" → /portal/documentacion?pagina=XX
//  que coinciden con selectores genéricos pero NO son documentos.
//  Este filtro solo acepta URLs con extensión de archivo O ruta CDN conocida.
// ════════════════════════════════════════════════════════════════════════

// Extensiones de archivo descargable
const FILE_EXT = /\.(pdf|zip|doc|docx|xls|xlsx|odt|ods|ppt|pptx|rar|7z|xml|csv|txt)(\?[^#]*)?(\#.*)?$/i;

// Rutas de repositorios/CDN conocidos por portal (no cambian entre licitaciones)
const CDN_PATHS = [
  /\/wcm\/connect\//i,          // PLACSP Content Management CDN
  /\/repositorio\//i,            // Portal Vasco — documentos
  /\/contenidos\/anuncio_cont/i, // Portal Vasco — anuncio HTML
  /webkpe[0-9a-z-]+/i,          // Portal Vasco — formularios DEUC/KPE
  /\/agiriak\//i,                // Euskera "documentos"
  /\/fitxategi\//i,              // Euskera "archivo"
  /\/fitxer\//i,                 // Catalán "archivo"
  /\/document-library\//i,       // Liferay DMS
  /\/alfresco\/s\//i,            // Alfresco ECM
  /\/descargar-documento\//i,    // Patrón común portales autonómicos
  /\/descarga\/[a-z0-9_-]{6}/i, // Descargas con hash/ID
];

// Patrones que EXCLUYEN un enlace (navegación, assets, login...)
const NAV_EXCL = [
  /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)(\?.*)?$/i,
  /\/(login|logout|signin|signout|register|home|inicio|portada|principal)(\/|$|\?)/i,
  /\/(ayuda|help|soporte|faq|contacto|contact|mapa-web|sitemap|privacidad|cookies|aviso-legal|accesibilidad)(\/|$|\?)/i,
  /[?&]pagina=[^&]*/i,          // PLACSP paginación
  /[?&]lang=[a-z]{2}(&.*)?$/i, // solo cambio de idioma
  /\/wps\/portal\/[a-z]+$/i,    // WebSphere portal pages sin doc
  /^(https?:\/\/)?(www\.)?(google|bing|youtube|facebook|twitter|linkedin|instagram)\./i,
];

function esDocumentoReal(nombre, url) {
  // 1. Descartar siempre: assets estáticos, nav, login…
  if (NAV_EXCL.some(p => p.test(url))) return false;

  // 2. Aceptar siempre: extensión de archivo descargable
  if (FILE_EXT.test(url)) return true;

  // 3. Aceptar siempre: ruta CDN/repositorio conocida
  if (CDN_PATHS.some(p => p.test(url))) return true;

  // 4. NO ACEPTAR nada más — evita los falsos positivos del nav-bar
  return false;
}

// ════════════════════════════════════════════════════════════════════════
//  SELECTORES por portal (solo para encontrar los enlaces, el filtro
//  estricto de arriba es quien decide si son documentos reales)
// ════════════════════════════════════════════════════════════════════════
const PORTAL_SELECTORS = {
  'contratacion.euskadi.eus': [
    'a[href$=".pdf"]', 'a[href$=".PDF"]', 'a[href$=".zip"]', 'a[href$=".doc"]', 'a[href$=".docx"]',
    'a[href*="repositorio"]', 'a[href*="contenidos/anuncio"]',
    'a[href*="webkpe"]', 'a[href*="agiriak"]', 'a[href*="fitxategi"]',
    'table.doc-table a', 'ul.doc-list a', '.document-list a',
    'section#documentos a', '#secDocumentos a', '#tab-documentos a',
    'main a[href]', 'article a[href]', '.main-content a[href]',
  ],
  'contrataciopublica.cat': [
    'a[href$=".pdf"]', 'a[href$=".zip"]', 'a[href$=".doc"]', 'a[href$=".docx"]',
    'a[href*="fitxer"]', 'a[href*="document"]', '.fitxer a', '.documents a',
  ],
  'contratos-publicos.comunidad.madrid': [
    'a[href$=".pdf"]', 'a[href$=".zip"]', 'a[href$=".doc"]',
    '.fichero a', '.adjunto a', '.documento a', 'main a[href]',
  ],
  'juntadeandalucia.es': [
    'a[href$=".pdf"]', 'a[href$=".zip"]', 'a[href$=".doc"]',
    '.documento a', '.adjunto a', 'main a[href]',
  ],
  'contratacion.aragon.es': [
    'a[href$=".pdf"]', 'a[href$=".zip"]', 'a[href$=".doc"]',
    '.adjunto a', '.documento a', 'main a[href]',
  ],
};

// Selectores genéricos de fallback
const GENERIC_SELECTORS = [
  'a[href$=".pdf"]', 'a[href$=".PDF"]',
  'a[href$=".zip"]', 'a[href$=".doc"]', 'a[href$=".docx"]',
  'a[href$=".odt"]', 'a[href$=".xls"]', 'a[href$=".xlsx"]',
  'a[href*="wcm/connect"]', 'a[href*="repositorio"]',
  'a[href*="webkpe"]', 'a[href*="agiriak"]', 'a[href*="fitxategi"]',
];

function getSelectors(url) {
  for (const [domain, sels] of Object.entries(PORTAL_SELECTORS)) {
    if (url.includes(domain)) return sels;
  }
  return GENERIC_SELECTORS;
}

function getPortalName(url) {
  const map = {
    'contratacion.euskadi.eus':            'Pais Vasco',
    'contrataciopublica.cat':              'Generalitat Catalunya',
    'contratos-publicos.comunidad.madrid': 'Comunidad Madrid',
    'juntadeandalucia.es':                 'Junta Andalucia',
    'contratacion.gva.es':                 'Generalitat Valenciana',
    'contratacion.aragon.es':              'Aragon',
    'contrataciondelestado.es':            'PLACSP',
    'contratacion.castillalamancha.es':    'Castilla-La Mancha',
  };
  for (const [dom, name] of Object.entries(map)) {
    if (url.includes(dom)) return name;
  }
  return 'Portal de contratacion';
}

// ════════════════════════════════════════════════════════════════════════
//  API REST PORTAL VASCO
// ════════════════════════════════════════════════════════════════════════
async function getDocumentosEuskadi(url) {
  // Extraer codigoExp del path: .../exp2025017101_24/...
  const m = url.match(/\/(exp[\w-]+)\//i) || url.match(/codigoExp=([\w-]+)/i);
  if (!m) return null;

  const cod = m[1];
  const endpoints = [
    `https://www.contratacion.euskadi.eus/ac10BEWar/rest/expDocumentosExpediente?codigoExp=${cod}&locale=es`,
    `https://www.contratacion.euskadi.eus/ac10BEWar/rest/expLicitaciones/${cod}/documentos`,
    `https://www.contratacion.euskadi.eus/ac10BEWar/rest/expDocumentosLicitacion?codigoExp=${cod}&locale=es`,
  ];

  for (const ep of endpoints) {
    try {
      const r = await axios.get(ep, {
        headers: { Accept: 'application/json', Referer: url, 'User-Agent': rndUA(), 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 10000,
      });
      const d = r.data;
      const items = Array.isArray(d) ? d : (d.documentos || d.listaDocumentos || d.docs || d.files || []);
      if (!items.length) continue;

      const docs = items.reduce((acc, item) => {
        const nombre  = String(item.nombre || item.titulo || item.name || 'Documento').trim();
        const rawUrl  = item.url || item.urlDescarga || item.href || item.link || item.path || '';
        if (!rawUrl) return acc;
        const urlFinal = rawUrl.startsWith('http') ? rawUrl : 'https://www.contratacion.euskadi.eus' + rawUrl;
        acc.push({
          nombre: nombre.substring(0, 120),
          url: urlFinal,
          tipo: FILE_EXT.test(urlFinal) ? (urlFinal.match(/\.(\w+)(\?|$)/i)?.[1]?.toUpperCase() || 'Archivo') : 'Enlace',
        });
        return acc;
      }, []);

      if (docs.length) { console.log('[Euskadi API] ' + docs.length + ' docs via ' + ep); return docs; }
    } catch (e) {
      console.log('[Euskadi API] fallo ' + ep + ': ' + (e.response && e.response.status || e.message));
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════
//  FETCH HTML con reintentos
// ════════════════════════════════════════════════════════════════════════
async function fetchHtml(url) {
  let origin = '';
  try { origin = new URL(url).origin + '/'; } catch(_) {}

  for (let i = 0; i < 3; i++) {
    try {
      const r = await axios.get(url, {
        headers: hdrs(url, i > 0 ? origin : null),
        timeout: 22000,
        maxRedirects: 5,
        validateStatus: s => s < 400,
      });
      console.log('[Fetch] OK intento ' + (i+1) + ' (' + r.data.length + ' bytes)');
      return r.data;
    } catch (e) {
      console.log('[Fetch] intento ' + (i+1) + ' fallido: ' + (e.response && e.response.status || e.message));
      if (i < 2) await new Promise(res => setTimeout(res, 700));
      else throw e;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════
//  PARSEO CHEERIO — con filtro ESTRICTO
// ════════════════════════════════════════════════════════════════════════
function parsearDocumentos(html, baseUrl) {
  const $   = cheerio.load(html);
  const sel = getSelectors(baseUrl);
  const all = Array.from(new Set([...sel, ...GENERIC_SELECTORS]));
  const seen = new Set();
  const docs = [];

  for (const s of all) {
    try {
      $(s).each(function(_i, el) {
        const href = $(el).attr('href');
        if (!href || /^(#|javascript:|mailto:)/i.test(href)) return;

        let full;
        try { full = new URL(href, baseUrl).href; } catch(_) { return; }

        if (seen.has(full)) return;

        // Filtro estricto — rechaza nav-links
        let nombre = $(el).text().trim().replace(/\s+/g, ' ');
        const alt  = $(el).attr('title') || $(el).attr('aria-label') || '';
        if (alt && alt.length > nombre.length) nombre = alt.trim();
        if (nombre.length > 120) nombre = nombre.substring(0, 117) + '...';

        if (!esDocumentoReal(nombre, full)) return;

        seen.add(full);
        const extMatch = full.match(/\.(\w{2,4})(\?|#|$)/i);
        const tipo = extMatch ? extMatch[1].toUpperCase() : 'Enlace';
        if (!nombre || nombre.length < 2) {
          try {
            nombre = decodeURIComponent(new URL(full).pathname.split('/').pop()) || ('Doc_' + (docs.length+1));
          } catch(_) { nombre = 'Doc_' + (docs.length+1); }
        }
        docs.push({ nombre, url: full, tipo });
      });
    } catch(_) {}
  }
  return docs;
}

// ════════════════════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL
// ════════════════════════════════════════════════════════════════════════
async function obtenerDocumentos(url) {
  const portal = getPortalName(url);

  // ── A. Portal JS-rendered: no scrapeamos, informamos ──────────────────
  const jsPortal = esPortalJsRendered(url);
  if (jsPortal) {
    console.log('[Documentos] Portal JS-rendered:', jsPortal.nombre, '→ no scrapeamos');
    return {
      portal,
      documentos: [],
      total: 0,
      jsRendered: true,
      method: 'js_rendered_skip',
    };
  }

  // ── B. Euskadi: API REST primero ───────────────────────────────────────
  if (url.includes('contratacion.euskadi.eus')) {
    try {
      const apiDocs = await getDocumentosEuskadi(url);
      if (apiDocs && apiDocs.length) {
        return { portal, documentos: apiDocs, total: apiDocs.length, method: 'api' };
      }
    } catch (e) { console.warn('[Euskadi] API falló:', e.message); }
  }

  // ── C. Scraping HTML con filtro estricto ──────────────────────────────
  const html = await fetchHtml(url);
  const docs = parsearDocumentos(html, url);
  console.log('[Documentos] ' + docs.length + ' docs reales encontrados por scraping');
  return { portal, documentos: docs, total: docs.length, method: 'scraping' };
}

// ════════════════════════════════════════════════════════════════════════
//  RUTA GET /api/documentos/scrape?url=...
// ════════════════════════════════════════════════════════════════════════
router.get('/scrape', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, error: 'URL requerida' });
  if (!axios || !cheerio) {
    return res.status(503).json({ success: false, error: 'Instala dependencias: npm install axios cheerio' });
  }

  try {
    const result = await obtenerDocumentos(url);
    return res.json({
      success: true,
      portal:      result.portal,
      documentos:  result.documentos,
      total:       result.total,
      method:      result.method,
      jsRendered:  result.jsRendered || false,
      sourceUrl:   url,
    });
  } catch (err) {
    console.error('[Scrape] Error:', err.message);
    const st       = err.response && err.response.status;
    const blocked  = st === 403 || st === 429 || (err.message && (err.message.includes('403') || err.message.includes('blocked')));
    const timeout  = err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'));
    const noNet    = err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED';
    return res.json({
      success:    false,
      documentos: [],
      total:      0,
      sourceUrl:  url,
      blocked,
      jsRendered: false,
      error: blocked ? 'El portal bloquea el acceso automatico (403)'
           : timeout ? 'Tiempo de espera agotado'
           : noNet   ? 'No se pudo conectar con el portal'
                     : 'Error: ' + err.message,
    });
  }
});

// ════════════════════════════════════════════════════════════════════════
//  RUTA POST /api/documentos/descargar  { urls: [...] }
// ════════════════════════════════════════════════════════════════════════
router.post('/descargar', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !urls.length) return res.status(400).json({ error: 'Se requiere al menos una URL' });
  if (!axios) return res.status(503).json({ error: 'Instala axios: npm install axios' });

  try {
    const archive     = archiver('zip', { zlib: { level: 6 } });
    const passthrough = new stream.PassThrough();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=documentos_licitacion_' + Date.now() + '.zip');
    archive.pipe(passthrough);
    passthrough.pipe(res);
    archive.on('error', e => console.error('[ZIP]', e));

    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      try {
        let ref = '';
        try { ref = new URL(urls[i]).origin + '/'; } catch(_) {}
        const r = await axios.get(urls[i], {
          responseType: 'arraybuffer',
          headers: { 'User-Agent': rndUA(), Accept: 'application/pdf,application/octet-stream,*/*', ...(ref ? { Referer: ref } : {}) },
          timeout: 30000, maxRedirects: 5,
        });
        const rawName = urls[i].split('/').pop().split('?')[0] || ('documento_' + (i+1));
        const nombre  = rawName.includes('.') ? rawName : rawName + '.pdf';
        archive.append(Buffer.from(r.data), { name: nombre });
        ok++;
      } catch (e) { console.warn('[ZIP] fallo URL ' + (i+1) + ':', e.message); }
    }
    await archive.finalize();
    console.log('[ZIP] generado ' + ok + '/' + urls.length + ' docs');
  } catch (err) {
    console.error('[ZIP] error general:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Error al generar ZIP' });
  }
});

module.exports = router;
