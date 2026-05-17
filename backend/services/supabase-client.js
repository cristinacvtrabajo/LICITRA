const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Cliente estándar (anon) — para lecturas públicas
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

// Cliente admin (service_role) — bypasa RLS completamente
// Solo usar en rutas protegidas del servidor, NUNCA exponer al frontend
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

async function getAllLicitaciones() {
  let allData = [];
  let from = 0;
  const BATCH = 500;

  while (true) {
    const { data, error } = await supabase
      .from('licitaciones_filtradas')
      .select('*')
      .range(from, from + BATCH - 1)
      .order('identificador', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return allData;
}

module.exports = { supabase, supabaseAdmin, getAllLicitaciones };