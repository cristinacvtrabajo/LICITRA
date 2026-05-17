/* 
 LICITRA — theme.js
 Gestión completa de temas (claro / oscuro).
 • Aplica el tema guardado en localStorage inmediatamente (IIFE)
 para evitar parpadeo (FOUC).
 • Inicializa el botón de toggle en DOMContentLoaded.
 • Expone toggleTheme() como función global para el onclick del botón.
 */

const THEME_KEY = 'licitra-theme';
const THEME_DEFAULT = 'light';

/* 1. IIFE — Aplicar tema ANTES de que el navegador pinte */
/* Esto evita el flash de tema oscuro/claro incorrecto en carga. */
(function () {
 const saved = localStorage.getItem(THEME_KEY) || THEME_DEFAULT;
 document.documentElement.setAttribute('data-theme', saved);
})();

/* 2. SVG ICONS */
/* Moon: se muestra cuando el tema activo es CLARO (click → oscuro) */
const SVG_MOON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
 viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
 <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
</svg>`;

/* Sun: se muestra cuando el tema activo es OSCURO (click → claro) */
const SVG_SUN = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
 viewBox="0 0 24 24" fill="none" stroke="currentColor"
 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
 <circle cx="12" cy="12" r="5"/>
 <line x1="12" y1="1" x2="12" y2="3"/>
 <line x1="12" y1="21" x2="12" y2="23"/>
 <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
 <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
 <line x1="1" y1="12" x2="3" y2="12"/>
 <line x1="21" y1="12" x2="23" y2="12"/>
 <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
 <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
</svg>`;

/* 3. APPLY THEME */
/**
 * Aplica un tema concreto ('light' | 'dark'), actualiza el botón
 * y, opcionalmente, lo guarda en localStorage.
 */
function applyTheme(theme, persist = true) {
 document.documentElement.setAttribute('data-theme', theme);
 if (persist) localStorage.setItem(THEME_KEY, theme);
 _updateToggleButton(theme);
}

/* 4. TOGGLE */
/** Alterna entre tema claro y oscuro. Global — llamado por onclick. */
function toggleTheme() {
 const current = document.documentElement.getAttribute('data-theme') || THEME_DEFAULT;
 applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* 5. UPDATE BUTTON UI */
function _updateToggleButton(theme) {
 const btn = document.getElementById('themeToggle');
 const icon = document.getElementById('themeIcon');
 if (!btn || !icon) return;

 const isDark = theme === 'dark';

 /* En modo oscuro → mostramos el sol (clic para pasar a claro) */
 /* En modo claro → mostramos la luna (clic para pasar a oscuro) */
 icon.innerHTML = isDark ? SVG_SUN : SVG_MOON;

 const label = isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
 btn.setAttribute('aria-label', label);
 btn.setAttribute('title', label);
}

/* 6. INIT ON DOM READY */
document.addEventListener('DOMContentLoaded', () => {
 const saved = localStorage.getItem(THEME_KEY) || THEME_DEFAULT;
 /* data-theme ya está aplicado al <html> por la IIFE;
 aquí solo sincronizamos el icono del botón. */
 _updateToggleButton(saved);
});
