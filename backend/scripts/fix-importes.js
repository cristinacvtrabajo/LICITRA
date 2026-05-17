/**
 * fix-importes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script de migración ONE-TIME: corrige los importes monetarios en Supabase
 * que llegaron multiplicados por 100 desde los CSV fuente.
 *
 * Columnas afectadas (tabla licitaciones_filtradas):
 *   importe_adjudicacio_1_  (importeConIVA)
 *   importe_adjudicacio_2_  (importeSinIVA)
 *   valor_estimado_del_     (valorEstimado)
 *   presupuesto_base_c_     (presupuestoConIVA)
 *   presupuesto_base_si_    (presupuestoSinIVA)
 *   presupuesto_base_c2_    (presupuestoLoteConIVA)
 *   presupuesto_base_si2_   (presupuestoLoteSinIVA)
 *   precio_de_la_oferta_1_  (ofertaMasBaja)
 *   precio_de_la_oferta_2_  (ofertaMasAlta)
 *
 * Lógica: si el valor > 1.000.000  →  dividir entre 100
 * (Mismo criterio que usa actualmente el frontend como parche temporal)
 *
 * Uso:
 *   cd backend
 *   node scripts/fix-importes.js
 *
 * ⚠️  EJECUTAR UNA SOLA VEZ. Una vez aplicado, eliminar el heurístico /100
 *     del frontend (data.js y bbdd.js).
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// ─── Configuración ───────────────────────────────────────────────────────────
const TABLE   = 'licitaciones_filtradas';
const BATCH   = 500;   // filas por página al leer
const UPDATE_BATCH = 50; // filas por llamada upsert (Supabase recomienda ≤100)
const UMBRAL  = 1_000_000; // valores > esto se dividen entre 100

// Columnas monetarias a corregir
const MONEY_COLS = [
  'importe_adjudicacio_1_',   // importeConIVA
  'importe_adjudicacio_2_',   // importeSinIVA
  'valor_estimado_del_',      // valorEstimado
  'presupuesto_base_c_',      // presupuestoConIVA
  'presupuesto_base_si_',     // presupuestoSinIVA
  'presupuesto_base_c2_',     // presupuestoLoteConIVA
  'presupuesto_base_si2_',    // presupuestoLoteSinIVA
  'precio_de_la_oferta_1_',   // ofertaMasBaja
  'precio_de_la_oferta_2_',   // ofertaMasAlta
];

// ─── Cliente Supabase (service_role para poder hacer UPDATE sin RLS) ─────────
const supabaseUrl      = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌  Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllRows() {
  const cols = ['identificador', ...MONEY_COLS].join(',');
  let allRows = [];
  let from = 0;

  console.log('📥  Leyendo registros de Supabase…');
  while (true) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(cols)
      .range(from, from + BATCH - 1)
      .order('identificador', { ascending: true });

    if (error) throw new Error(`Error leyendo filas ${from}-${from+BATCH}: ${error.message}`);
    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    process.stdout.write(`\r   Leídas ${allRows.length} filas…`);

    if (data.length < BATCH) break;
    from += BATCH;
  }
  console.log(`\n✅  Total leídas: ${allRows.length} filas`);
  return allRows;
}

function buildUpdates(rows) {
  const toUpdate = [];

  for (const row of rows) {
    const patch = { identificador: row.identificador };
    let needsUpdate = false;

    for (const col of MONEY_COLS) {
      const val = row[col];
      if (val !== null && val !== undefined && val !== '' && !isNaN(val)) {
        const num = Number(val);
        if (num > UMBRAL) {
          patch[col] = num / 100;
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) toUpdate.push(patch);
  }

  return toUpdate;
}

async function applyUpdates(updates) {
  if (updates.length === 0) {
    console.log('ℹ️   No hay filas que corregir. Los datos ya estaban limpios.');
    return;
  }

  console.log(`\n🔧  Corrigiendo ${updates.length} filas…`);
  let done = 0;
  let errors = 0;

  for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
    const batch = updates.slice(i, i + UPDATE_BATCH);

    const { error } = await supabase
      .from(TABLE)
      .upsert(batch, { onConflict: 'identificador' });

    if (error) {
      console.error(`\n⚠️  Error en batch ${i}-${i+UPDATE_BATCH}: ${error.message}`);
      errors++;
    } else {
      done += batch.length;
    }

    process.stdout.write(`\r   Actualizadas ${done}/${updates.length} filas…`);
    await sleep(50); // pequeña pausa para no saturar la API
  }

  console.log(`\n\n✅  Migración completada: ${done} filas corregidas, ${errors} batches con error.`);
}

// ─── Preview: muestra un resumen antes de aplicar ────────────────────────────
function printPreview(updates) {
  if (updates.length === 0) return;

  console.log(`\n📋  Muestra de las primeras 5 correcciones:`);
  updates.slice(0, 5).forEach(u => {
    const cols = Object.entries(u)
      .filter(([k]) => k !== 'identificador')
      .map(([k, v]) => `${k}: ${(v * 100).toLocaleString('es-ES')} → ${v.toLocaleString('es-ES')}`)
      .join('\n       ');
    console.log(`  [id=${u.identificador}]\n       ${cols}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  LicitLab — Migración: corrección de importes × 100   ');
    console.log('═══════════════════════════════════════════════════════\n');

    const rows    = await fetchAllRows();
    const updates = buildUpdates(rows);

    printPreview(updates);

    if (updates.length === 0) {
      console.log('\n✅  Nada que hacer. Base de datos ya correcta.');
      process.exit(0);
    }

    // Confirmación interactiva
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n⚠️  Se van a corregir ${updates.length} filas. ¿Continuar? (s/N): `, async (answer) => {
      rl.close();
      if (answer.trim().toLowerCase() !== 's') {
        console.log('Cancelado. No se realizaron cambios.');
        process.exit(0);
      }
      await applyUpdates(updates);
      console.log('\n🎉  Ahora puedes eliminar el heurístico /100 del frontend.');
      console.log('    Archivos a modificar:');
      console.log('      frontend/js/data.js  → función normalizeRow() y buildStats()');
      console.log('      frontend/js/bbdd.js  → función _calcBBDDStatsDesdeAllData()');
    });

  } catch (err) {
    console.error('\n❌  Error fatal:', err.message);
    process.exit(1);
  }
})();
