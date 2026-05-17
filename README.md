# LICITRA — El arte de la oferta perfecta

Aplicación web full-stack para el análisis inteligente de licitaciones públicas españolas.  
Desarrollada como Trabajo de Fin de Grado del ciclo DAW por **Kentia Molina** y **Cristina Cobos**.

---

## Índice

1. [Descripción](#descripción)
2. [Requisitos previos](#requisitos-previos)
3. [Instalación](#instalación)
4. [Configuración](#configuración)
5. [Arranque](#arranque)
6. [Estructura del proyecto](#estructura-del-proyecto)
7. [Roles de usuario](#roles-de-usuario)
8. [Stack tecnológico](#stack-tecnológico)

---

## Descripción

LICITRA permite a profesionales y empresas analizar datos de contratación pública extraídos de la Plataforma de Contratación del Sector Público (PLACSP). Incluye:

- **Módulo Datos**: carga de CSV/XLSX, tabla interactiva con filtros y búsqueda.
- **Módulo Análisis**: dashboard con KPIs, gráficos de distribución y ranking de adjudicatarios.
- **Módulo Relaciones**: detección de patrones órgano-empresa con score de concentración de riesgo (Web Worker).
- **Módulo IA**: análisis semántico y generación de documentos con LLaMA 3.3 70B (Groq).
- **Módulo BBDD**: sincronización con Supabase, backup, restauración y rollback con historial.

---

## Requisitos previos

| Herramienta | Versión mínima | Enlace |
|-------------|---------------|--------|
| Node.js     | 18.x          | https://nodejs.org |
| npm         | 9.x           | (incluido con Node.js) |
| Supabase    | —             | https://supabase.com (cuenta gratuita) |
| Groq API    | —             | https://console.groq.com (cuenta gratuita) |

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone <url-del-repo>
cd licitlab_arreglado
```

### 2. Instalar dependencias del backend

```bash
cd backend
npm install
```

### 3. Instalar dependencias del frontend (solo para desarrollo con Vite)

```bash
cd ../frontend
npm install
```

---

## Configuración

Copia la plantilla de variables de entorno y rellena los valores:

```bash
cp backend/.env.example backend/.env
```

Edita `backend/.env` con tus claves reales:

```env
PORT=3000
SESSION_SECRET=<cadena-aleatoria-larga>

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<tu-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>

# Opcional — activa sesiones persistentes (sobreviven reinicios del servidor)
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-eu-west-3.pooler.supabase.com:6543/postgres

GROQ_API_KEY=<tu-api-key-de-groq>
GROQ_MODEL=llama-3.3-70b-versatile
```

### Base de datos Supabase

Ejecuta el esquema SQL completo en Supabase Dashboard → SQL Editor:

```
supabase_schema.sql   (en la raíz del repositorio)
```

### Asignar rol de administrador

Tras crear tu usuario desde la app, ejecuta en el SQL Editor de Supabase:

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'tu-email@ejemplo.com';
```

---

## Arranque

### Modo producción (servidor único en puerto 3000)

```bash
cd backend
node server.js
```

Abre el navegador en **http://localhost:3000**

> El backend sirve automáticamente el frontend desde la carpeta `/frontend`.

### Modo desarrollo (hot-reload con Vite)

Terminal 1 — backend:

```bash
cd backend
node server.js
```

Terminal 2 — frontend:

```bash
cd frontend
npm run dev
```

Abre **http://localhost:5173**

---

## Estructura del proyecto

```
licitlab_arreglado/
├── backend/
│   ├── middleware/
│   │   └── auth.js            # requireAuth, requireManager, requireAdmin
│   ├── routes/
│   │   ├── auth.js            # Login, logout, sesión, perfil
│   │   ├── analisis.js        # Estadísticas y KPIs
│   │   ├── sync.js            # Sincronización, backup, rollback
│   │   ├── ia.js              # Proxy a Groq API (LLaMA 3.3 70B)
│   │   └── documentos.js      # Scraping y descarga de documentos
│   ├── server.js              # Punto de entrada Express
│   ├── .env                   # Variables de entorno (NO subir a git)
│   └── .env.example           # Plantilla de configuración
│
├── frontend/
│   ├── css/styles.css         # Estilos globales + variables CSS (tema claro/oscuro)
│   ├── js/
│   │   ├── utils.js           # Utilidades, apiFetch(), showToast()
│   │   ├── auth.js            # Verificación de sesión
│   │   ├── config.js          # Mapeo columnas CSV↔Supabase
│   │   ├── data.js            # Carga CSV/XLSX/Supabase
│   │   ├── bbdd.js            # Panel administración BBDD
│   │   ├── tab-datos.js       # Tabla de licitaciones
│   │   ├── tab-ia.js          # Módulo IA
│   │   ├── tab-relaciones.js  # Módulo Relaciones
│   │   ├── state.js           # Estado global
│   │   ├── idb-cache.js       # Caché IndexedDB
│   │   ├── theme.js           # Toggle tema claro/oscuro
│   │   └── worker-relaciones.js  # Web Worker relaciones
│   ├── src/components/
│   │   ├── TabAnalisis.vue    # Dashboard estadístico (Vue 3 + Pinia)
│   │   ├── TabRelaciones.vue  # Módulo relaciones (Vue 3)
│   │   └── TabIA.vue          # Módulo IA (Vue 3)
│   ├── src/stores/
│   │   └── licitaciones.js    # Store Pinia con getters KPI
│   ├── index.html             # SPA principal
│   └── login.html             # Pantalla de login
│
├── supabase_schema.sql        # Esquema SQL completo
├── .gitignore
└── README.md
```

---

## Roles de usuario

| Rol       | Acceso |
|-----------|--------|
| `admin`   | Todo: sync, rollback, log, BBDD, IA, análisis |
| `manager` | BBDD, sync, análisis, visualización |
| `user`    | Solo lectura (datos y análisis básico) |

Los nuevos usuarios no tienen rol por defecto. Asígnalos manualmente en Supabase.

---

## Stack tecnológico

| Capa           | Tecnología                                      |
|----------------|-------------------------------------------------|
| Frontend       | HTML5, CSS3, JavaScript ES2022, Vue 3, Pinia    |
| Build tool     | Vite 8                                          |
| Backend        | Node.js 18+, Express 5                          |
| Base de datos  | Supabase (PostgreSQL 15) con RLS                |
| Autenticación  | Supabase Auth + express-session (cookies)       |
| IA             | Groq API — LLaMA 3.3 70B                        |
| Seguridad      | Helmet, express-rate-limit, CORS                |
| Procesado      | Papa Parse (CSV), SheetJS (XLSX), Web Workers   |
| Caché local    | IndexedDB                                       |
