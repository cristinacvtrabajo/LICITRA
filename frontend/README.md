# Frontend — LicitLab

Interfaz web construida con **HTML5, CSS3, JavaScript ES6+** y **Vue 3**.

## Estructura

```
frontend/
├── index.html          # Aplicación principal (dashboard)
├── login.html          # Pantalla de autenticación
├── main.js             # Entrada principal (Vite)
├── vite.config.js      # Configuración del bundler
├── package.json
│
├── css/
│   └── styles.css      # Estilos globales y temas
│
├── js/
│   ├── auth.js         # Gestión de autenticación en cliente
│   ├── bbdd.js         # Acceso a base de datos desde cliente
│   ├── config.js       # Configuración y constantes globales
│   ├── data.js         # Carga y transformación de datos
│   ├── idb-cache.js    # Caché con IndexedDB
│   ├── main.js         # Inicialización de la app
│   ├── state.js        # Estado global de la aplicación
│   ├── tab-analisis.js # Pestaña de análisis
│   ├── tab-datos.js    # Pestaña de datos / licitaciones
│   ├── tab-ia.js       # Pestaña de inteligencia artificial
│   ├── tab-relaciones.js # Pestaña de relaciones entre entidades
│   ├── theme.js        # Gestión de tema claro/oscuro
│   ├── utils.js        # Funciones utilitarias
│   └── worker-relaciones.js  # Web Worker para cálculos pesados
│
├── src/
│   └── components/
│       └── VueAnalytics.vue  # Componente Vue de analíticas
│
└── vue-components/
    ├── App.vue         # Componente raíz Vue
    └── VueTab.js       # Helper para pestañas Vue
```

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Acceder en `http://localhost:5173`

## Build para producción

```bash
npm run build
```

Los archivos compilados se generan en `dist/`.
