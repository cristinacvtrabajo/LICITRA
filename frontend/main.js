import { createApp } from 'vue'
import { createPinia } from 'pinia'
import TabAnalisis from './src/components/TabAnalisis.vue'
import TabRelaciones from './src/components/TabRelaciones.vue'
import TabIA from './src/components/TabIA.vue'

// Instancia Pinia compartida 
// Una sola instancia para que los tres componentes compartan el mismo store.
const pinia = createPinia()

// Puente de datos 
// vanilla JS (data.js) llama a window.updateVueData(allData) cuando el usuario
// carga un CSV/XLSX o sincroniza desde Supabase.
// Los componentes Vue escuchan el evento 'dataUpdated' y actualizan el store.
window.updateVueData = (data) => {
 window.allData = data
 window.dispatchEvent(new CustomEvent('dataUpdated', { detail: data }))
}

// Montaje de componentes Vue 
document.addEventListener('DOMContentLoaded', () => {
 _mountComponent('tab-analisis', 'vue-analisis-root', TabAnalisis)
 _mountComponent('tab-relaciones', 'vue-relaciones-root', TabRelaciones)
 _mountComponent('tab-ia', 'vue-ia-root', TabIA)
})

/**
 * Crea un div raíz dentro del contenedor de la pestaña y monta el componente
 * Vue dado, usando la instancia Pinia compartida.
 */
function _mountComponent(tabId, rootId, Component) {
 const tabEl = document.getElementById(tabId)
 if (!tabEl) {
 console.warn(`[Vue] No se encontró #${tabId}`)
 return
 }

 // Limpiar HTML estático — Vue lo reemplaza completamente
 tabEl.innerHTML = `<div id="${rootId}"></div>`

 const app = createApp(Component)
 app.use(pinia)
 app.mount(`#${rootId}`)
}
