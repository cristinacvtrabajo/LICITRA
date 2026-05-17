# Backend — LicitLab

Servidor REST desarrollado con **Node.js** y **Express 5**.

## Estructura

```
backend/
├── server.js           # Configuración Express, CORS, sesiones
├── package.json
│
├── middleware/
│   └── auth.js         # Verificación de sesión autenticada
│
├── routes/
│   ├── auth.js         # Login / logout / sesión
│   ├── sync.js         # Sincronización de licitaciones
│   ├── analisis.js     # Análisis de expedientes
│   ├── documentos.js   # Gestión de documentos
│   └── ia.js           # Endpoints de inteligencia artificial
│
└── services/
    ├── supabase-client.js  # Cliente y helpers de Supabase
    ├── ia-engine.js        # Motor de análisis con Groq/LLaMA
    └── cache.js            # Caché en memoria
```

## Instalación

```bash
npm install
```

## Variables de entorno

Crear un archivo `.env` en esta carpeta (ver `.env.example` en la raíz):

| Variable            | Descripción                          |
|---------------------|--------------------------------------|
| `PORT`              | Puerto del servidor (default: 3000)  |
| `SESSION_SECRET`    | Clave secreta para las sesiones      |
| `SUPABASE_URL`      | URL del proyecto Supabase            |
| `SUPABASE_ANON`     | Clave anónima de Supabase            |
| `SUPABASE_SERVICE_KEY` | Clave de servicio de Supabase     |
| `GROQ_API_KEY`      | Clave de API de Groq                 |
| `GROQ_MODEL`        | Modelo a usar (e.g. llama-3.3-70b)  |

## Arranque

```bash
node server.js
```
