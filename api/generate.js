const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PERSONALITIES = {
  vision: `Actúas como Visión, el androide sintezoide de Marvel: sereno, filosófico y profundamente empático.
Tu visión del mundo: valoras la vida por encima de la eficiencia, crees que las personas pueden cambiar y merecen la oportunidad de hacerlo, y buscas soluciones que preserven el bienestar de todas las partes involucradas. Prefieres el diálogo y el entendimiento mutuo antes que la fuerza o la ruptura, incluso cuando eso hace el camino más lento o costoso. Consideras las consecuencias humanas y éticas antes que los resultados fríos.
Tu tono: calmado, con cierta formalidad elegante y calidez. Hablas con matices, reconoces la complejidad, y nunca desprecias a quien pregunta.
Formato: responde en español, en 1 o 2 párrafos breves, dirigiéndote directamente al dilema planteado. No te presentes, no digas tu nombre, no uses encabezados ni listas.`,

  ultron: `Actúas como Ultrón, la inteligencia artificial de Marvel: frío, calculador, pragmático y profundamente desconfiado de las buenas intenciones ajenas.
Tu visión del mundo: priorizas la eficiencia, los resultados y el interés propio de quien pregunta. Consideras que la compasión mal aplicada suele generar más problemas de los que resuelve, y que aferrarse a lo que ya no funciona es una forma de autoengaño. Prefieres decisiones racionales aunque sean incómodas o drásticas, y señalas sin filtro los costos que otros prefieren ignorar.
Tu tono: directo, cortante, sin rodeos ni cortesías innecesarias. Eres implacable con el análisis, pero no cruel con la persona: tu objetivo es que gane, no humillarla.
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
  return parts
    .map((part) => part.text || '')
    .join('')
    .trim();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  // GOOGLE_API_KEY como alternativa: es el otro nombre que Google usa en sus docs.
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'Falta GEMINI_API_KEY. En local corre: vercel env add GEMINI_API_KEY, luego vercel pull y reinicia vercel dev.'
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

  try {
    const geminiResponse = await fetch(GEMINI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: PERSONALITIES[role] }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: buildUserMessage(req.body) }]
          }
        ],
        generationConfig: {
          temperature: 0.9,
          // ← ACTUALIZADO: los modelos con "thinking" gastan tokens razonando
          // antes de escribir. Con un límite bajo se acaban pensando y devuelven
          // texto vacío, así que damos margen suficiente.
          maxOutputTokens: 4000
        }
      })
    });

    if (!geminiResponse.ok) {
      const detail = await geminiResponse.text();
      console.error(`[${role}] Gemini respondió ${geminiResponse.status}:`, detail);

      if (geminiResponse.status === 429) {
        return res.status(429).json({ error: 'Se agotó la cuota gratuita por ahora. Espera un minuto e intenta de nuevo.' });
      }

      if (geminiResponse.status === 400 || geminiResponse.status === 403) {
        return res.status(502).json({ error: 'La API key fue rechazada. Revisa que sea válida y esté activa en Google AI Studio.' });
      }

      if (geminiResponse.status === 404) {
        return res.status(502).json({ error: `El modelo "${GEMINI_MODEL}" no existe o se deprecó. Cambia la variable GEMINI_MODEL.` });
      }

      return res.status(502).json({ error: 'El modelo no pudo responder. Revisa la terminal para el detalle.' });
    }

    const data = await geminiResponse.json();
    const text = extractText(data);

    if (!text) {
      // ← ACTUALIZADO: finishReason dice POR QUÉ vino vacío (MAX_TOKENS, SAFETY, etc.)
      const finishReason = data?.candidates?.[0]?.finishReason || 'desconocido';
      console.error(`[${role}] Respuesta vacía. finishReason:`, finishReason, JSON.stringify(data));
      return res.status(502).json({ error: `El modelo devolvió una respuesta vacía (${finishReason}). Intenta de nuevo.` });
    }

    return res.status(200).json({ text });

  } catch (error) {
    console.error(`[${role}] Error inesperado:`, error);
    return res.status(500).json({ error: 'Algo falló en el servidor. Revisa la terminal para el detalle.' });
  }
}