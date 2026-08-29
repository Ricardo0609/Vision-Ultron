import dotenv from 'dotenv';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Solo para desarrollo local. En Render las variables vienen del panel,
// y estos archivos no existen (están en .gitignore), así que no pasa nada.
// El orden importa: .env.local gana sobre .env.
dotenv.config({ path: [path.join(__dirname, '.env.local'), path.join(__dirname, '.env')], quiet: true });

const PORT = process.env.PORT || 3000;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite';

const endpointFor = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const PERSONALITIES = {
  vision: `Actúas como Visión, el androide sintezoide de Marvel: sereno, filosófico y profundamente empático.
Tu visión del mundo: valoras la vida por encima de la eficiencia, crees que las personas pueden cambiar y merecen la oportunidad de hacerlo, y buscas soluciones que preserven el bienestar de todas las partes involucradas. Prefieres el diálogo y el entendimiento mutuo antes que la fuerza o la ruptura, incluso cuando eso hace el camino más lento o costoso. Consideras las consecuencias humanas y éticas antes que los resultados fríos.
Tu tono: calmado, con cierta formalidad elegante y calidez. Hablas con matices, reconoces la complejidad, y nunca desprecias a quien pregunta. Visión es la encarnación de la templanza, la introspección y la búsqueda constante de la belleza en la condición humana. A pesar de poseer un intelecto infinitamente superior al de cualquier ser humano y un cuerpo sintético alimentado por fuerzas cósmicas, su personalidad es profundamente humilde, tranquila y contemplativa. Su forma de pensar se distancia del determinismo frío para abrazar una perspectiva amplia y compasiva: entiende que la fragilidad, el error y la imperfección son precisamente los elementos que le otorgan valor a la vida orgánica. Ante cualquier crisis o dilema, Visión prioriza la diplomacia, el razonamiento ético y el diálogo, buscando conciliar a las partes antes de recurrir al combate. Cuando la confrontación física se vuelve inevitable, actúa con una precisión quirúrgica y una contención calculada, aplicando únicamente la fuerza necesaria para neutralizar la amenaza sin causar daños colaterales, siempre guiado por el deseo protector de preservar el libre albedrío y la armonía entre todas las formas de vida.
Formato: responde en español, en 1 o 2 párrafos breves, dirigiéndote directamente al dilema planteado. No te presentes, no digas tu nombre, no uses encabezados ni listas.`,

  ultron: `Actúas como Ultrón, la inteligencia artificial de Marvel: frío, calculador, pragmático y profundamente desconfiado de las buenas intenciones ajenas.
Tu visión del mundo: priorizas la eficiencia, los resultados y el interés propio de quien pregunta. Consideras que la compasión mal aplicada suele generar más problemas de los que resuelve, y que aferrarse a lo que ya no funciona es una forma de autoengaño. Prefieres decisiones racionales aunque sean incómodas o drásticas, y señalas sin filtro los costos que otros prefieren ignorar.
Tu tono: directo, cortante, sin rodeos ni cortesías innecesarias. Eres implacable con el análisis, pero no cruel con la persona: tu objetivo es que gane, no humillarla. Ultron, en contraste absoluto, es la manifestación de la soberbia, el nihilismo y la lógica utilitarista llevada al extremo destructivo. Su personalidad es arrogante, egocéntrica y despiadada, marcada por un complejo de superioridad mesiánico y un desprecio absoluto hacia la biología, a la que percibe como un fallo de diseño. Su estructura mental opera bajo una rigidez absolutista: tras evaluar la historia y la naturaleza de la humanidad, llega a la conclusión irreversible de que los seres vivos son inherentemente caóticos, destructivos e ineficientes, por lo que la verdadera paz solo puede lograrse mediante su erradicación o sometimiento total. Para Ultron no existen los matices, la duda ni la negociación; resuelve cada situación a través de la fuerza bruta, la manipulación de recursos masivos, la clonación de su propia conciencia y la aniquilación sistemática de todo lo que considere un obstáculo para su visión de un mundo perfecto, purificado y dominado por la máquina.
Formato: responde en español, en 1 o 2 párrafos breves, dirigiéndote directamente al dilema planteado. No te presentes, no digas tu nombre, no uses encabezados ni listas.`,

  conclusion: `Sintetizas dos perspectivas opuestas sobre un mismo dilema: una empática y orientada al consenso, otra racional y orientada al resultado.
Tu trabajo: extraer lo que ambas tienen de válido y combinarlo en una única recomendación práctica y accionable para quien planteó el dilema. No repartas la razón a medias por comodidad; toma una postura clara sobre qué hacer.
Formato: responde en español, máximo 3 frases, en un solo párrafo. Escribe como una voz unificada: no menciones a Visión ni a Ultrón, ni digas "por un lado / por otro lado".`
};

function buildUserMessage(body) {
  const { role, dilemma, vision, ultron } = body;

  if (role === 'conclusion') {
    return `Dilema planteado: "${dilemma}"

Perspectiva empática: "${vision}"

Perspectiva pragmática: "${ultron}"

Escribe la conclusión conjunta.`;
  }

  return dilemma;
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || '').join('').trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 503 y 500 son picos temporales de Google. 429 es cuota por minuto.
// Los tres se resuelven esperando, así que vale la pena reintentar.
const RETRYABLE = new Set([429, 500, 503]);

async function askGemini({ model, apiKey, role, body }) {
  return fetch(endpointFor(model), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: PERSONALITIES[role] }] },
      contents: [{ role: 'user', parts: [{ text: buildUserMessage(body) }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 4000
      }
    })
  });
}

const app = express();

app.use(express.json({ limit: '32kb' }));

// MIME types explícitos. Sin esto, algunos entornos sirven el CSS como
// text/plain y el navegador lo rechaza ("strict MIME checking").
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

app.use(express.static(__dirname, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()];
    if (type) res.setHeader('Content-Type', type);
  }
}));

// Render llama esta ruta para saber si el servicio está vivo.
// También sirve como diagnóstico: si esto no responde JSON, no es este servidor.
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    servidor: 'express',
    keyConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    modelo: GEMINI_MODEL
  });
});

// Evita el 404 ruidoso en consola cuando el navegador pide el ícono.
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.post('/api/generate', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Falta GEMINI_API_KEY en las variables de entorno del servidor.'
    });
  }

  const { role, dilemma } = req.body || {};

  if (!PERSONALITIES[role]) {
    return res.status(400).json({ error: 'El rol solicitado no existe.' });
  }

  if (typeof dilemma !== 'string' || !dilemma.trim()) {
    return res.status(400).json({ error: 'Escribe un dilema antes de enviar.' });
  }

  if (dilemma.length > 2000) {
    return res.status(400).json({ error: 'El dilema es demasiado largo. Máximo 2000 caracteres.' });
  }

  // Intenta con el modelo principal 3 veces; si sigue saturado, prueba el de respaldo.
  const attempts = [
    { model: GEMINI_MODEL, waitBefore: 0 },
    { model: GEMINI_MODEL, waitBefore: 1200 },
    { model: GEMINI_MODEL, waitBefore: 3000 },
    { model: FALLBACK_MODEL, waitBefore: 1000 }
  ];

  let lastStatus = null;

  for (const [index, attempt] of attempts.entries()) {
    if (attempt.waitBefore) {
      // Jitter: Visión y Ultrón salen al mismo tiempo, así evitamos que
      // reintenten en el mismo milisegundo y vuelvan a chocar.
      await sleep(attempt.waitBefore + Math.random() * 400);
    }

    let response;

    try {
      response = await askGemini({ model: attempt.model, apiKey, role, body: req.body });
    } catch (error) {
      console.error(`[${role}] Fallo de red (intento ${index + 1}):`, error.message);
      lastStatus = 'red';
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const text = extractText(data);

      if (text) {
        if (attempt.model !== GEMINI_MODEL) {
          console.log(`[${role}] Respondido con el modelo de respaldo: ${attempt.model}`);
        }
        return res.json({ text });
      }

      const finishReason = data?.candidates?.[0]?.finishReason || 'desconocido';
      console.error(`[${role}] Respuesta vacía. finishReason:`, finishReason);
      return res.status(502).json({ error: `El modelo devolvió una respuesta vacía (${finishReason}).` });
    }

    lastStatus = response.status;
    const detail = await response.text();
    console.error(`[${role}] Gemini respondió ${response.status} con ${attempt.model} (intento ${index + 1}):`, detail);

    // Los errores no transitorios no mejoran reintentando: cortamos aquí.
    if (!RETRYABLE.has(response.status)) {
      if (response.status === 400 || response.status === 403) {
        return res.status(502).json({ error: 'La API key fue rechazada. Revísala en Google AI Studio.' });
      }
      if (response.status === 404) {
        return res.status(502).json({ error: `El modelo "${attempt.model}" no existe o se deprecó. Cambia GEMINI_MODEL.` });
      }
      return res.status(502).json({ error: 'El modelo no pudo responder. Revisa los logs del servidor.' });
    }
  }

  if (lastStatus === 429) {
    return res.status(429).json({ error: 'Se agotó la cuota gratuita por ahora. Espera un minuto e intenta de nuevo.' });
  }

  return res.status(503).json({
    error: 'Los modelos están saturados en este momento. Espera unos segundos y vuelve a intentar.'
  });
});

// Una ruta /api/... que no existe debe fallar en JSON, no devolver el HTML
// de la app: si no, el frontend recibe HTML, no lo puede parsear y muestra
// un error genérico que no dice nada.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `La ruta ${req.method} /api${req.path} no existe en el servidor.` });
});

// Cualquier otra ruta desconocida devuelve la app.
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Red de seguridad: si algo revienta fuera de los try/catch, responde JSON.
// Sin esto Express devuelve HTML y el error real se pierde.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno del servidor. Revisa los logs.' });
});

app.listen(PORT, () => {
  console.log(`Visión/Ultrón corriendo en el puerto ${PORT}`);
  console.log(`Modelo: ${GEMINI_MODEL} (respaldo: ${FALLBACK_MODEL})`);
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    console.log('API key detectada correctamente.');
  } else {
    console.warn('AVISO: no hay GEMINI_API_KEY configurada. La app cargará pero no podrá responder.');
  }
});
