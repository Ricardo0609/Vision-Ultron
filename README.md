# Visión / Ultrón

Plantea un dilema y recibe dos perspectivas opuestas —la empática de Visión y la pragmática de Ultrón— más una conclusión que combina ambas.

## Cómo funciona

```
Navegador  →  server.js (/api/generate)  →  Gemini API
                  (tu key vive aquí)
```

El mismo servidor Express sirve el frontend y expone la ruta `/api/generate`. La API key nunca llega al navegador.

Cada dilema son 3 llamadas: Visión y Ultrón en paralelo, y luego la conclusión que recibe ambas respuestas como contexto. Si Gemini responde 429, 500 o 503 (errores temporales), el servidor reintenta con espera creciente y, si hace falta, cae a un modelo de respaldo.

## Correrlo en local

```bash
npm install
```

Copia `.env.example` como `.env.local` y pon tu key de [Google AI Studio](https://aistudio.google.com/apikey):

```
GEMINI_API_KEY=tu_key_aqui
```

Levanta el servidor:

```bash
npm run dev
```

Abre http://localhost:3000. Con `npm run dev` el servidor se reinicia solo al guardar cambios.

## Publicarlo en Render

1. Sube el proyecto a GitHub
2. En Render: **New → Web Service** (no "Static Site": este proyecto necesita Node corriendo)
3. Conecta el repo y usa:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. En **Environment**, agrega `GEMINI_API_KEY` con tu key
5. Create Web Service

El archivo `render.yaml` ya trae esta configuración si prefieres usar un Blueprint.

## Variables de entorno

| Variable | Requerida | Default |
|---|---|---|
| `GEMINI_API_KEY` | Sí | — |
| `GEMINI_MODEL` | No | `gemini-3.6-flash` |
| `GEMINI_FALLBACK_MODEL` | No | `gemini-3.5-flash-lite` |
| `PORT` | No | `3000` (Render la define solo) |

## Estructura

```
vision-ultron/
├── index.html          Estructura de la pantalla
├── styles.css          Estilos, mobile-first
├── script.js           Lógica del input y render de respuestas
├── server.js           Servidor Express: personalidades + llamada a Gemini
├── render.yaml         Configuración de despliegue
├── package.json
├── .env.example
└── .gitignore
```

## Diagnóstico

`GET /healthz` devuelve `{ ok: true, keyConfigured: true }`. Si `keyConfigured` es `false`, falta la variable de entorno.

## Stack

HTML, CSS y JavaScript vanilla en el front. Express en el back. Sin paso de build.
