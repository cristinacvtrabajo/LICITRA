/**
 * migrate-supabase.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Script ONE-TIME: copia TODOS los registros de la Supabase antigua
 * a la Supabase nueva, preservando todos los campos (incluidos los monetarios
 * y el campo PYME que estaban vacíos en la nueva base de datos).
 *
 * Supabase ORIGEN  : yigtzeoilweytxbpcdqb.supabase.co  (datos completos)
 * Supabase DESTINO : ulhdbphfowkhvtticxxd.supabase.co  (campos vacíos → se rellenan)
 *
 * Uso:
 *   cd backend
 *   node scripts/migrate-supabase.js
 *
 * Opciones de entorno (opcionales):
 *   DRY_RUN=true   → Solo cuenta registros, no escribe nada
 *   BATCH_READ=1000 → Filas por página al leer (defecto: 1000)
 *   BATCH_WRITE=200 → Filas por upsert al escribir (defecto: 200)
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// ─── Credenciales ORIGEN (Supabase antigua — datos completos) ────────────────
const ORIGEN_URL = 'https://yigtzeoilweytxbpcdqb.supabase.co';
const ORIGEN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpZ3R6ZW9pbHdleXR4YnBjZHFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjY4NDE1NiwiZXhwIjoyMDkyMjYwMTU2fQ.JiV5PySRVOrW4bFEXGWf14sF38cL6nYW71BUDoPzoUA';

// ─── Credenciales DESTINO (Supabase nueva — donde hay campos vacíos) ─────────
const DESTINO_URL = process.env.SUPABASE_URL || 'https://ulhdbphfowkhvtticxxd.supabase.co';
const DESTINO_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ─── Configuración ───────────────────────────────────────────────────────────
const TABLE       = 'licitaciones_filtradas';
const BATCH_READ  = parseInt(process.env.BATCH_READ  || '1000');
const BATCH_WRITE = parseInt(process.env.BATCH_WRITE || '200');
const DRY_RUN     = process.env.DRY_RUN === 'true';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // ms entre reintentos

// ─── Validaciones ─────────────────────────────────────────────────────────────
if (!DESTINO_KEY) {
  console.error('❌  Falta SUPABASE_SERVICE_ROLE_KEY en el archivo .env');
  process.exit(1);
}

// ─── Clientes Supabase ────────────────────────────────────────────────────────
const origen = createClient(ORIGEN_URL, ORIGEN_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const destino = createClient(DESTINO_URL.replace(/\/$/, ''), DESTINO_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fmt(n) { return n.toLocaleString('es-ES'); }

function bar(done, total, width = 30) {
  const pct   = total > 0 ? Math.round((done / total) * width) : 0;
  const filled = '█'.repeat(pct);
  const empty  = '░'.repeat(width - pct);
  const pctTxt = total > 0 ? Math.round((done / total) * 100) : 0;
  return `[${filled}${empty}] ${pctTxt}%`;
}

// ─── Lectura desde ORIGEN ─────────────────────────────────────────────────────
async function fetchAllFromOrigen() {
  console.log(`\n📥  Leyendo registros del origen (${ORIGEN_URL.split('//')[1].split('.')[0]})…`);

  let allRows = [];
  let from = 0;
  let page = 0;

  while (true) {
    page++;
    const { data, error } = await origen
      .from(TABLE)
      .select('*')
      .range(from, from + BATCH_READ - 1)
      .order('identificador', { ascending: true });

    if (error) {
      throw new Error(`Error leyendo página ${page} (filas ${from}-${from + BATCH_READ - 1}): ${error.message}`);
    }

    if (!data || data.length === 0) break;

    allRows = allRows.concat(data);
    process.stdout.write(`\r   Leídas: ${fmt(allRows.length)} filas… (página ${page})`);

    if (data.length < BATCH_READ) break;  // última página
    from += BATCH_READ;
  }

  console.log(`\n✅  Total leídas del origen: ${fmt(allRows.length)} filas`);
  return allRows;
}

// ─── Upsert en DESTINO con reintentos ─────────────────────────────────────────
async function upsertBatch(rows, attempt = 1) {
  const { error } = await destino
    .from(TABLE)
    .upsert(rows, { onConflict: 'identificador' });

  if (!error) return { ok: rows.length, err: 0 };

  if (attempt < MAX_RETRIES) {
    await sleep(RETRY_DELAY * attempt);
    return upsertBatch(rows, attempt + 1);
  }

  console.error(`\n⚠️  Batch fallido tras ${MAX_RETRIES} intentos: ${error.message}`);
  return { ok: 0, err: rows.length };
}

// ─── Escritura en DESTINO ─────────────────────────────────────────────────────
async function writeToDestino(allRows) {
  const total = allRows.length;
  let done  = 0;
  let errCount = 0;
  const startTime = Date.now();

  console.log(`\n📤  Escribiendo ${fmt(total)} filas en el destino (${DESTINO_URL.split('//')[1].split('.')[0]})…`);
  if (DRY_RUN) {
    console.log('   ⚠️  DRY_RUN=true — simulación, no se escribirá nada');
  }
  console.log('');

  for (let i = 0; i < total; i += BATCH_WRITE) {
    const batch = allRows.slice(i, i + BATCH_WRITE);

    if (!DRY_RUN) {
      const { ok, err } = await upsertBatch(batch);
      done     += ok;
      errCount += err;
    } else {
      done += batch.length;
    }

    // Progreso
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rowsPerSec = done > 0 ? Math.round(done / ((Date.now() - startTime) / 1000)) : 0;
    const eta = rowsPerSec > 0 ? Math.round((total - done) / rowsPerSec) : '?';
    process.stdout.write(
      `\r   ${bar(done, total)} ${fmt(done)}/${fmt(total)}  ` +
      `${rowsPerSec} filas/s  ETA: ${eta}s  Errores: ${errCount}   `
    );

    // Pequeña pausa para no saturar la API
    if (!DRY_RUN) await sleep(30);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n✅  Escritura completada en ${elapsed}s`);
  return { done, errCount };
}

// ─── Diagnóstico previo ───────────────────────────────────────────────────────
async function diagnose() {
  console.log('\n🔍  Diagnóstico previo…');

  // Contar registros en origen
  const { count: cOrigen } = await origen
    .from(TABLE)
    .select('*', { count: 'exact', head: true });

  // Contar registros en destino
  const { count: cDestino } = await destino
    .from(TABLE)
    .select('*', { count: 'exact', head: true });

  // Contar campos monetarios vacíos en destino
  const { count: conImporte } = await destino
    .from(TABLE)
    .select('*', { count: 'exact', head: true })
    .not('importe_adjudicacio_1_', 'is', null);

  console.log(`\n   ┌─────────────────────────────────────────┐`);
  console.log(`   │  ORIGEN  (antigua):  ${String(fmt(cOrigen || 0)).padStart(10)} registros  │`);
  console.log(`   │  DESTINO (nueva):    ${String(fmt(cDestino || 0)).padStart(10)} registros  │`);
  console.log(`   │  Con importe relleno en destino: ${String(fmt(conImporte || 0)).padStart(6)}  │`);
  console.log(`   └─────────────────────────────────────────┘`);

  return { cOrigen, cDestino, conImporte };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  LICITRA — Migración Supabase antigua → Supabase nueva    ');
  console.log('═══════════════════════════════════════════════════════════');

  try {
    // 1. Diagnóstico
    const { cOrigen, cDestino } = await diagnose();

    if (!cOrigen || cOrigen === 0) {
      console.error('\n❌  El origen no tiene registros. Abortando.');
      process.exit(1);
    }

    // 2. Confirmación
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const modoTexto = DRY_RUN ? ' [DRY RUN — sin cambios]' : '';
    const pregunta  = `\n⚠️  Se van a copiar ~${fmt(cOrigen)} filas al destino${modoTexto}.\n   ¿Continuar? (s/N): `;

    await new Promise((resolve) => {
      rl.question(pregunta, async (answer) => {
        rl.close();
        if (answer.trim().toLowerCase() !== 's') {
          console.log('\nCancelado. No se realizaron cambios.');
          process.exit(0);
        }
        resolve();
      });
    });

    // 3. Leer todo del origen
    const allRows = await fetchAllFromOrigen();

    // 4. Verificar muestra de datos antes de escribir
    const muestra = allRows[0] || {};
    const tieneImporte = muestra.importe_adjudicacio_1_ !== null && muestra.importe_adjudicacio_1_ !== undefined;
    const tienePyme    = muestra.el_adjudicatario_es_ !== null && muestra.el_adjudicatario_es_ !== undefined;

    console.log('\n📋  Muestra del primer registro del origen:');
    console.log(`   importe_adjudicacio_1_ : ${muestra.importe_adjudicacio_1_}`);
    console.log(`   presupuesto_base_c_    : ${muestra.presupuesto_base_c_}`);
    console.log(`   presupuesto_base_c2_   : ${muestra.presupuesto_base_c2_}`);
    console.log(`   el_adjudicatario_es_   : ${muestra.el_adjudicatario_es_}`);
    console.log(`   identificador          : ${muestra.identificador}`);

    if (!tieneImporte && !tienePyme) {
      console.warn('\n⚠️  ADVERTENCIA: El origen también parece tener campos vacíos.');
      console.warn('   Revisa que estás apuntando a la base de datos correcta.');
    }

    // 5. Escribir en destino
    const { done, errCount } = await writeToDestino(allRows);

    // 6. Diagnóstico final
    console.log('\n🔍  Verificación post-migración…');
    await diagnose();

    // 7. Resumen
    console.log('\n══════════════════════════════════');
    if (DRY_RUN) {
      console.log('  ✅  DRY RUN completado (sin cambios reales)');
    } else {
      console.log(`  ✅  Migración completada:`);
      console.log(`      • Filas copiadas : ${fmt(done)}`);
      console.log(`      • Errores        : ${errCount}`);
    }
    console.log('══════════════════════════════════\n');

    if (!DRY_RUN && errCount === 0) {
      console.log('🎉  Los KPIs de LICITRA deberían funcionar ahora correctamente.');
      console.log('   Recarga la aplicación y verifica las pestañas Datos y BBDD.\n');
    }

  } catch (err) {
    console.error('\n❌  Error fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
