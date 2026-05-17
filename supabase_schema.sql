-- ============================================================
--  LICITRA — Schema completo para Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query
--  Orden: 1) licitaciones_filtradas  2) perfiles
--          3) sync_batches  4) sync_changes  5) subidas_log
-- ============================================================


-- ============================================================
-- 1. TABLA PRINCIPAL: licitaciones_filtradas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.licitaciones_filtradas (
  -- Identificador único (clave natural del CSV)
  identificador               TEXT        PRIMARY KEY,

  -- Generales
  link_licitacion             TEXT,
  enlace_al_perfil_de_        TEXT,
  fecha_actualizacion         TEXT,
  estado                      TEXT,
  numero_de_expediente        TEXT,
  objeto_del_contrato         TEXT,
  valor_estimado_del_         NUMERIC,
  presupuesto_base_si_        NUMERIC,
  presupuesto_base_c_         NUMERIC,
  cpv                         TEXT,
  lugar_de_ejecucion          TEXT,
  organo_de_contratac_        TEXT,
  tipo_de_administracion      TEXT,
  codigo_postal               TEXT,
  tipo_de_procedimiento       TEXT,
  fecha_de_presentaci_        TEXT,

  -- Por licitación / lote
  lote                        TEXT,
  objeto_licitacion_lote      TEXT,
  presupuesto_base_c2_        NUMERIC,
  presupuesto_base_si2_       NUMERIC,
  cpv_licitacion_lote         TEXT,
  lugar_ejecucion_licit_      TEXT,
  resultado_licitacion_l_     TEXT,
  fecha_acuerdo_licitacion_lote TEXT,
  numero_de_ofertas_r_        INTEGER,
  precio_de_la_oferta_1_      NUMERIC,
  precio_de_la_oferta_2_      NUMERIC,
  excluidas_anormalm_         TEXT,
  numero_del_contrato_        TEXT,
  fecha_formalizacion_contrato TEXT,
  fecha_entrada_vigor         TEXT,

  -- Adjudicación
  adjudicatario_licitaci_     TEXT,
  identificador_adjudic_      TEXT,
  el_adjudicatario_es_        BOOLEAN,      -- true = PYME
  importe_adjudicacio_1_      NUMERIC,      -- con IVA
  importe_adjudicacio_2_      NUMERIC       -- sin IVA
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_lic_estado
  ON public.licitaciones_filtradas (estado);

CREATE INDEX IF NOT EXISTS idx_lic_tipo_procedimiento
  ON public.licitaciones_filtradas (tipo_de_procedimiento);

CREATE INDEX IF NOT EXISTS idx_lic_adjudicatario
  ON public.licitaciones_filtradas (adjudicatario_licitaci_);

CREATE INDEX IF NOT EXISTS idx_lic_organo
  ON public.licitaciones_filtradas (organo_de_contratac_);

CREATE INDEX IF NOT EXISTS idx_lic_pyme
  ON public.licitaciones_filtradas (el_adjudicatario_es_);

-- Búsqueda de texto en objeto del contrato
CREATE INDEX IF NOT EXISTS idx_lic_objeto_gin
  ON public.licitaciones_filtradas
  USING gin (to_tsvector('spanish', coalesce(objeto_del_contrato, '')));

-- RLS: activar (el backend usa service_role que lo bypasea)
ALTER TABLE public.licitaciones_filtradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.licitaciones_filtradas
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 2. TABLA DE PERFILES DE USUARIO: perfiles
--    Vinculada a auth.users de Supabase
-- ============================================================
CREATE TABLE IF NOT EXISTS public.perfiles (
  id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo              TEXT        NOT NULL CHECK (tipo IN ('profesional', 'empresa')),
  email_contacto    TEXT        NOT NULL,

  -- Datos comunes
  telefono          TEXT,
  direccion_fiscal  TEXT,
  pais              TEXT,

  -- Solo profesional
  nombre_apellidos  TEXT,
  dni_nif           TEXT,
  especialidad      TEXT,
  anios_experiencia INTEGER,
  portfolio_web     TEXT,

  -- Solo empresa
  nombre_empresa    TEXT,
  cif               TEXT,
  persona_contacto  TEXT,
  cargo_contacto    TEXT,
  num_empleados     TEXT,
  sector            TEXT,
  web_empresa       TEXT,

  -- Auditoría
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_perfiles_updated_at
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.perfiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Cada usuario puede ver y editar su propio perfil
CREATE POLICY "usuario_propio_perfil" ON public.perfiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- ============================================================
-- 3. CABECERA DE LOTES DE SINCRONIZACIÓN: sync_batches
--    Una fila por operación de sync. El backend la inserta en
--    routes/sync.js → POST /api/sync/upload.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_batches (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email     TEXT        NOT NULL,
  file_name      TEXT        NOT NULL,
  rows_total     INTEGER     NOT NULL DEFAULT 0,
  rows_inserted  INTEGER     NOT NULL DEFAULT 0,
  rows_updated   INTEGER     NOT NULL DEFAULT 0,
  status         TEXT        NOT NULL DEFAULT 'completed',
                             -- valores: 'completed', 'rolled_back'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_batches_created_at
  ON public.sync_batches (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_batches_status
  ON public.sync_batches (status);

ALTER TABLE public.sync_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.sync_batches
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 4. DETALLE DE CAMBIOS POR LOTE: sync_changes
--    Una fila por registro afectado en cada sync_batch.
--    Permite rollback granular: old_row restaura el estado previo.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_changes (
  id             BIGSERIAL   PRIMARY KEY,
  batch_id       UUID        NOT NULL REFERENCES public.sync_batches(id) ON DELETE CASCADE,
  identificador  TEXT        NOT NULL,
  action         TEXT        NOT NULL CHECK (action IN ('insert', 'update')),
  old_row        JSONB,      -- NULL para inserts; estado anterior para updates
  new_row        JSONB,      -- reservado para uso futuro
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_batch_id
  ON public.sync_changes (batch_id);

CREATE INDEX IF NOT EXISTS idx_sync_changes_identificador
  ON public.sync_changes (identificador);

ALTER TABLE public.sync_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.sync_changes
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 5. LOG AUXILIAR DE SUBIDAS: subidas_log
--    Registro ligero de cada operación de carga (sin detalle
--    de cambios). Complementa a sync_batches.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subidas_log (
  id             BIGSERIAL   PRIMARY KEY,
  admin_email    TEXT        NOT NULL,
  total_filas    INTEGER     NOT NULL DEFAULT 0,
  nombre_archivo TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subidas_log_created_at
  ON public.subidas_log (created_at DESC);

ALTER TABLE public.subidas_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.subidas_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ============================================================
-- 6. ASIGNAR ROL AL PRIMER USUARIO ADMIN
--    Ejecutar DESPUÉS de crear el usuario desde la app o
--    desde Supabase Dashboard → Authentication → Users
--
--    Sustituye 'tu-email@ejemplo.com' por el email real.
-- ============================================================

-- Opción A: asignar rol admin por email (recomendado)
/*
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'tu-email@ejemplo.com';
*/

-- Opción B: asignar rol manager
/*
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "manager"}'::jsonb
WHERE email = 'otro-email@ejemplo.com';
*/

-- ============================================================
-- NOTAS IMPORTANTES
-- ============================================================
-- • Roles disponibles en la app: 'admin', 'manager', 'user'
--   - admin   → acceso total (sync, rollback, log, bbdd, IA)
--   - manager → acceso a bbdd, backup, restauración e historial
--   - user    → solo lectura: datos y análisis
--
-- • Los usuarios nuevos NO tienen rol por defecto. Asignar
--   'admin' o 'manager' manualmente con el UPDATE de arriba.
--
-- • El backend usa SUPABASE_SERVICE_ROLE_KEY (bypasea RLS).
--   Nunca expongas esa clave en el frontend.
--
-- • Los datos se cargan vía la pestaña Base de Datos de la app
--   (CSV/XLSX) o mediante restauración desde backup JSON.
-- ============================================================


-- ============================================================
-- 7. SEGUIMIENTOS DE LICITACIONES: seguimientos
--    Registra qué licitaciones sigue cada usuario.
--    Permite enviar notificaciones por email tras cada sync.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.seguimientos (
  id               BIGSERIAL   PRIMARY KEY,
  user_email       TEXT        NOT NULL,
  identificador    TEXT        NOT NULL,
  nombre           TEXT,
  expediente       TEXT,
  estado_al_marcar TEXT,
  importe          NUMERIC,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_seguimiento UNIQUE (user_email, identificador)
);

CREATE INDEX IF NOT EXISTS idx_seguimientos_user
  ON public.seguimientos (user_email);

CREATE INDEX IF NOT EXISTS idx_seguimientos_identificador
  ON public.seguimientos (identificador);

ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.seguimientos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
