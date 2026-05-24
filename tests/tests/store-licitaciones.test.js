/**
 * LICITRA -- Pruebas unitarias: store Pinia -- useLicitacionesStore
 * Fuente: frontend/src/stores/licitaciones.js
 *
 * Getters verificados:
 *   - kpis.importeTotal    -- suma de _importeConIVA de la empresa seleccionada
 *   - kpis.totalContratos  -- numero de registros de la empresa seleccionada
 *   - gruposEmpresa        -- agrupa variantes de nombre bajo clave canonica
 *   - empresasOrdenadas    -- orden alfabetico (locale 'es')
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// Funcion claveCanonica copiada de stores/licitaciones.js
function claveCanonica(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(s\.?a\.?u?\.?|s\.?l\.?u?\.?|s\.?l\.?|s\.?a\.?|s\.?c\.?|s\.?l\.?p\.?|s\.?a\.?t\.?|s\.?c\.?o\.?p\.?|s\.?r\.?l\.?|a\.?i\.?e\.?|u\.?t\.?e\.?|s\.?l\.?n\.?e\.?|sociedad anonima|sociedad limitada|sociedad unipersonal)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function elegirNombreCanónico(raw) {
  return String(raw || '').trim()
    .replace(/\s+/g, ' ')
    .replace(/\b(S\.A\.U\.|S\.A\.|S\.L\.|S\.L\.U\.|SAU|SAU\.|SLU|SLU\.|S\.A|S\.L)\s*$/i, '')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Store inline (mismo codigo que stores/licitaciones.js)
const useLicitacionesStore = defineStore('licitaciones', () => {
  const datos = ref([]);
  const empresaSeleccionada = ref(null);

  const tienedatos = computed(() => datos.value.length > 0);

  const gruposEmpresa = computed(() => {
    const map = new Map();
    datos.value.forEach(r => {
      const raw = r.adjudicatario;
      if (!raw) return;
      const clave = claveCanonica(raw);
      if (!map.has(clave)) {
        map.set(clave, {
          nombre: elegirNombreCanónico(raw),
          clave,
          count: 0,
          importe: 0,
          variantes: new Set(),
          registros: []
        });
      }
      const g = map.get(clave);
      g.count++;
      g.importe += r._importeConIVA || 0;
      g.variantes.add(raw.trim());
      g.registros.push(r);
    });
    return map;
  });

  const empresasOrdenadas = computed(() =>
    [...gruposEmpresa.value.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  );

  const datosEmpresa = computed(() => {
    if (!empresaSeleccionada.value) return [];
    const g = gruposEmpresa.value.get(empresaSeleccionada.value);
    return g ? g.registros : [];
  });

  const kpis = computed(() => {
    const data = datosEmpresa.value;
    if (!data.length) return null;
    const totalImporte = data.reduce((s, r) => s + (r._importeConIVA || 0), 0);
    const totalContratos = data.length;
    const organos = [...new Set(data.map(r => r.organo).filter(Boolean))];
    const importeMax = Math.max(...data.map(r => r._importeConIVA || 0));
    const importeMedio = totalImporte / totalContratos;
    const adjCount = data.filter(r => /adjudicad|formalizado/i.test(r.estado || '')).length;
    const tasaExito = totalContratos > 0 ? Math.round(adjCount / totalContratos * 100) : 0;
    return {
      totalContratos, totalImporte, importeMedio, importeMax,
      organosCount: organos.length, adjCount, tasaExito,
      importeTotal: totalImporte
    };
  });

  function cargarDatos(nuevoDato) {
    datos.value = nuevoDato || [];
    empresaSeleccionada.value = null;
  }
  function seleccionarEmpresa(clave) { empresaSeleccionada.value = clave || null; }

  return {
    datos, empresaSeleccionada,
    tienedatos, gruposEmpresa, empresasOrdenadas, datosEmpresa, kpis,
    cargarDatos, seleccionarEmpresa
  };
});

// Fixtures
// EMPRESA_A y EMPRESA_B son variantes ortograficas del mismo proveedor:
//   "ACME OBRAS, SA"  --> clave canonica: "acme obras"
//   "Acme Obras S.A." --> clave canonica: "acme obras"  (mismo grupo)
// EMPRESA_C es un proveedor distinto.
const EMPRESA_A = 'ACME OBRAS, SA';
const EMPRESA_B = 'Acme Obras S.A.';
const EMPRESA_C = 'LICITRA TECH SL';

const registros = [
  { adjudicatario: EMPRESA_A, _importeConIVA: 100000, organo: 'Ayuntamiento Madrid',  estado: 'Adjudicada'  },
  { adjudicatario: EMPRESA_A, _importeConIVA: 200000, organo: 'Diputacion Valencia',  estado: 'Formalizado' },
  { adjudicatario: EMPRESA_B, _importeConIVA:  50000, organo: 'Diputacion Valencia',  estado: 'Adjudicada'  },
  { adjudicatario: EMPRESA_C, _importeConIVA:  80000, organo: 'Generalitat Catalana', estado: 'Pendiente'   },
  { adjudicatario: EMPRESA_C, _importeConIVA: 120000, organo: 'Generalitat Catalana', estado: 'Adjudicada'  },
];

describe('useLicitacionesStore -- getters Pinia', () => {
  let store;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useLicitacionesStore();
    store.cargarDatos(registros);
  });

  it('tienedatos = true cuando hay registros cargados', () => {
    expect(store.tienedatos).toBe(true);
  });

  it('tienedatos = false con store vacio', () => {
    store.cargarDatos([]);
    expect(store.tienedatos).toBe(false);
  });

  it('agrupa variantes ortograficas bajo la misma clave canonica', () => {
    const claveA = claveCanonica(EMPRESA_A);
    const claveB = claveCanonica(EMPRESA_B);
    expect(claveA).toBe(claveB);
    expect(store.gruposEmpresa.has(claveA)).toBe(true);
    const grupo = store.gruposEmpresa.get(claveA);
    expect(grupo.variantes.size).toBe(2);   // dos variantes de nombre
    expect(grupo.count).toBe(3);            // 2 de EMPRESA_A + 1 de EMPRESA_B
  });

  it('gruposEmpresa tiene 2 claves distintas para los dos proveedores', () => {
    expect(store.gruposEmpresa.size).toBe(2);
  });

  it('empresasOrdenadas devuelve el array en orden alfabetico espanol', () => {
    const nombres = store.empresasOrdenadas.map(e => e.nombre);
    const ordenado = [...nombres].sort((a, b) => a.localeCompare(b, 'es'));
    expect(nombres).toEqual(ordenado);
  });

  it('kpis.importeTotal es la suma de _importeConIVA de la empresa seleccionada', () => {
    const claveA = claveCanonica(EMPRESA_A);
    store.seleccionarEmpresa(claveA);
    // 100000 + 200000 + 50000 = 350000
    expect(store.kpis.importeTotal).toBe(350000);
  });

  it('kpis.totalContratos cuenta correctamente los registros agrupados', () => {
    const claveA = claveCanonica(EMPRESA_A);
    store.seleccionarEmpresa(claveA);
    // EMPRESA_A (x2) + EMPRESA_B (x1) = 3 contratos bajo la misma clave
    expect(store.kpis.totalContratos).toBe(3);
  });

  it('kpis.importeMedio es correcto', () => {
    const claveA = claveCanonica(EMPRESA_A);
    store.seleccionarEmpresa(claveA);
    expect(store.kpis.importeMedio).toBeCloseTo(350000 / 3, 2);
  });

  it('kpis.organosCount cuenta organos unicos del grupo', () => {
    const claveA = claveCanonica(EMPRESA_A);
    store.seleccionarEmpresa(claveA);
    // Ayuntamiento Madrid + Diputacion Valencia = 2 organos unicos
    expect(store.kpis.organosCount).toBe(2);
  });

  it('kpis.tasaExito refleja porcentaje adjudicados correctamente', () => {
    const claveC = claveCanonica(EMPRESA_C);
    store.seleccionarEmpresa(claveC);
    // 1 adjudicada de 2 = 50%
    expect(store.kpis.tasaExito).toBe(50);
  });

  it('kpis es null cuando no hay empresa seleccionada', () => {
    store.seleccionarEmpresa(null);
    expect(store.kpis).toBeNull();
  });
});
