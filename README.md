# Visión / Ultrón

Plantea un dilema y recibe dos perspectivas opuestas —la empática de Visión y la pragmática de Ultrón— más una conclusión que combina ambas.

## Cómo funciona

El navegador envía el dilema a `/api/generate`, una función serverless que guarda la API key de Gemini y las personalidades del lado del servidor. La key nunca llega al cliente.

```
Navegador  →  /api/generate  →  Gemini API
                (tu key vive aquí)
```

Cada dilema son 3 llamadas: Visión y Ultrón en paralelo, y luego la conclusión que recibe ambas respuestas como contexto.

## Correrlo en local

1. Instala la CLI de Vercel:
   ```bash
   npm i -g vercel
   ```
2. Copia `.env.example` como `.env.local` y pon tu key de [Google AI Studio](https://aistudio.google.com/apikey).
3. Levanta el servidor:
   ```bash
   vercel dev
   ```
4. Abre http://localhost:3000

> No abras `index.html` con doble clic ni con Live Server: la ruta `/api/generate` solo existe cuando corre `vercel dev`.

## Publicarlo

```bash
vercel --prod
```

Antes del primer deploy, agrega `GEMINI_API_KEY` en Vercel → Settings → Environment Variables.

## Estructura

```
vision-ultron/
├── index.html          Estructura de la pantalla
├── styles.css          Estilos, mobile-first
├── script.js           Lógica del input y render de respuestas
├── api/
│   └── generate.js     Función serverless: personalidades + llamada a Gemini
├── package.json
├── vercel.json
├── .env.example
└── .gitignore
```

## Cambiar de modelo

Si Gemini deprecia el modelo (error 404), cambia la variable `GEMINI_MODEL` en Vercel o en tu `.env.local`. No hace falta tocar código.

## Stack

HTML, CSS y JavaScript vanilla. Sin frameworks ni paso de build.
