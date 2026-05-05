import { createApp } from 'vue'
import NewTab from './NewTab.vue'

// Esperar a que el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Crear el contenedor para la pestaña Vue
  const vueTabContainer = document.createElement('div')
  vueTabContainer.id = 'vueTabContent'
  vueTabContainer.className = 'tab-content'
  vueTabContainer.style.display = 'none'
  
  // Insertar después de las pestañas existentes
  const main = document.querySelector('main')
  if (main) main.appendChild(vueTabContainer)
  
  // Montar Vue
  const vueApp = createApp(NewTab)
  vueApp.mount('#vueTabContent')
  
  // Añadir la pestaña al selector de tabs
  const tabsContainer = document.querySelector('.tabs')
  if (tabsContainer) {
    const vueTab = document.createElement('div')
    vueTab.className = 'tab'
    vueTab.setAttribute('data-tab', 'vue')
    vueTab.innerHTML = '<span class="tab-icon"></span> VUE ANALYTICS'
    vueTab.onclick = () => {
      // Ocultar todas las pestañas
      document.querySelectorAll('.tab-content').forEach(tc => tc.style.display = 'none')
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      
      // Mostrar la nuestra
      vueTabContainer.style.display = 'block'
      vueTab.classList.add('active')
    }
    tabsContainer.appendChild(vueTab)
  }
})

// Exponer función para actualizar datos desde vanilla JS
window.updateVueData = (data) => {
  window.allData = data
  window.dispatchEvent(new CustomEvent('dataUpdated', { detail: data }))
}