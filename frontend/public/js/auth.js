// auth.js — Autenticación vía servidor Node (/api/auth/*)
// Toda comunicación con Supabase la gestiona el backend.
// El frontend solo verifica sesión mediante cookies HTTP-only.

window.API_URL = window.location.origin + '/api';

// Autenticación (sesión Node)
async function checkAuth() {
  try {
    // Usamos fetch directo (no apiFetch) para evitar que el handler de 401
    // de apiFetch interfiera con el flujo de autenticación inicial.
    const response = await fetch(`${window.API_URL}/auth/session`, {
      credentials: 'include'
    });

    if (!response.ok) {
      // 429 u otro error HTTP — no redirigir, solo loguear
      console.warn('[Auth] Session check respondió con:', response.status);
      return false;
    }

    const data = await response.json();

    if (!data.success || !data.user) {
      window.location.href = './login.html';
      return false;
    }

    window.currentUser = data.user;

    // Mostrar chip de usuario en el header
    const chip = document.getElementById('userChip');
    const chipEmail = document.getElementById('userChipEmail');
    if (chip && chipEmail) {
      chipEmail.textContent = data.user.email;
      chipEmail.title = data.user.email;
      chip.style.display = 'flex';
    }

    console.log('\u2705 Usuario autenticado:', data.user.email, '| rol:', data.user.role);

    if (typeof window.onAuthReady === 'function') {
      window.onAuthReady(data.user);
    }

    return true;
  } catch (error) {
    // Error de red (servidor caído) — mostrar toast si está disponible
    console.error('[Auth] Error verificando sesión:', error);
    if (typeof showToast === 'function') {
      showToast(
        'Sin conexión con el servidor',
        'Comprueba que el servidor está en marcha.',
        'error', 0
      );
    }
    return false;
  }
}

async function doLogout() {
  try {
    await fetch(`${window.API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (_) {}
  window.location.href = './login.html';
}

// Verificar sesión al cargar
checkAuth();
