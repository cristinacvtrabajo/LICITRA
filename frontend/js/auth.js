// auth.js — Autenticación vía servidor Node + cliente Supabase para datos
// ──────────────────────────────────────────────────────────────────────────
// • La sesión/login usa el servidor Node (/api/auth/*)   → cookies HTTP-only
// • Las operaciones de datos (leer/escribir Supabase)    → cliente sb directo
// ──────────────────────────────────────────────────────────────────────────

window.API_URL = window.location.origin + '/api';

// ── Cliente Supabase (solo para operaciones de datos, NO para auth) ────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ── Autenticación (sesión Node) ────────────────────────────────────────────
async function checkAuth() {
  try {
    const response = await fetch(`${window.API_URL}/auth/session`, {
      credentials: 'include'
    });
    const data = await response.json();

    if (!data.success || !data.user) {
      window.location.href = './login.html';
      return false;
    }

    // Guardar usuario globalmente (bbdd.js lo usa para saber si es admin)
    window.currentUser = data.user;

    const headerStats = document.querySelector('.header-stats');
    if (headerStats) {
      const userChip = document.createElement('div');
      userChip.className = 'hstat active';
      userChip.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:default;max-width:260px';
      userChip.innerHTML = `
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px"
              title="${data.user.email}">👤 ${data.user.email}</span>
        <button onclick="doLogout()"
          style="background:none;border:1px solid rgba(29,78,216,.4);border-radius:4px;
                 color:var(--text2,#888);cursor:pointer;padding:2px 8px;font-size:.7rem;
                 font-family:inherit;white-space:nowrap;transition:all .2s"
          onmouseover="this.style.borderColor='#1d4ed8';this.style.color='#1d4ed8'"
          onmouseout="this.style.borderColor='rgba(29,78,216,.4)';this.style.color=''">
          Salir
        </button>`;
      headerStats.prepend(userChip);
    }

    console.log('✅ Usuario autenticado:', data.user.email, '| rol:', data.user.role);
    return true;
  } catch (error) {
    console.error('Error verificando sesión:', error);
    window.location.href = './login.html';
    return false;
  }
}

async function doLogout() {
  await fetch(`${window.API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include'
  });
  window.location.href = './login.html';
}

// Verificar sesión al cargar
checkAuth();
