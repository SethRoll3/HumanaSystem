
import { addDays, addWeeks, addMonths, differenceInCalendarDays } from 'date-fns';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY || (process as any).env?.API_KEY;

export const hasGeminiKey = (): boolean => Boolean(API_KEY);

// --- FALLBACK: CÁLCULO LOCAL (REGEX) ---
const calculateLocalFallback = (text: string, unitsPerBox: number = 0): { quantity: number; duration: string } => {
  const lower = text.toLowerCase();
  
  let dailyFreq = 1;
  if (lower.match(/cada 24|1 vez|una vez|om|od/)) dailyFreq = 1;
  else if (lower.match(/cada 12|2 veces|dos veces|bid/)) dailyFreq = 2;
  else if (lower.match(/cada 8|3 veces|tres veces|tid/)) dailyFreq = 3;
  else if (lower.match(/cada 6|4 veces|cuatro veces|qid/)) dailyFreq = 4;
  else if (lower.match(/cada 4|6 veces|seis veces/)) dailyFreq = 6;

  let amountPerDose = 1;
  const doseMatch = lower.match(/(\d+)\s*(?:tab|cap|comp|ml|cc|unid)/);
  if (doseMatch) amountPerDose = parseInt(doseMatch[1]);
  else if (lower.match(/^\d+\s/)) amountPerDose = parseInt(lower.match(/^(\d+)/)![0]);

  // Lógica de Duración Fallback
  let days = 0; 
  let durationText = "Según evolución"; 

  const daysMatch = lower.match(/(\d+)\s*(?:dias|día|dia|semana|mes)/);
  
  if (daysMatch) {
     // CASO 1: HAY DURACIÓN EXPLÍCITA EN TEXTO
     const val = parseInt(daysMatch[1]);
     if (lower.includes('semana')) days = val * 7;
     else if (lower.includes('mes')) days = val * 30;
     else days = val;
     
     durationText = `${days} días`;
     const total = dailyFreq * amountPerDose * days;
     return { quantity: total > 0 ? total : 1, duration: durationText };
  } 
  else if (unitsPerBox > 1) {
     // CASO 2: NO HAY DURACIÓN, PERO SABEMOS EL TAMAÑO DE CAJA (INTERNO)
     // Calculamos cuánto dura la caja
     const dailyDose = dailyFreq * amountPerDose;
     if (dailyDose > 0) {
        const calculatedDays = Math.floor(unitsPerBox / dailyDose);
        return { 
            quantity: unitsPerBox, 
            duration: `${calculatedDays} días (1 Caja)` 
        };
     }
  }

  // CASO 3: EXTERNO O INDEFINIDO
  return {
      quantity: 1,
      duration: "Hasta terminar / Según indicación"
  };
};

export const parsePrescriptionWithAI = async (
  medName: string, 
  instructions: string,
  unitsPerBox: number = 0
): Promise<{ quantity: number; duration: string; explanation?: string }> => {
  
  if (!instructions.trim()) return { quantity: 1, duration: "Indefinido" };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    
    // Prompt corregido: Prioridad a Caja si no hay duración, y NO inventar "3 días" para externos.
    const promptText = `
      Eres un farmacéutico calculando dosis.
      
      DATOS:
      - Medicamento: "${medName}"
      - Indicación: "${instructions}"
      - Stock/Presentación (Unidades en caja): ${unitsPerBox > 1 ? unitsPerBox : "Desconocido/Unitario"}

      REGLAS DE CÁLCULO (EN ORDEN):
      1. ¿DURACIÓN EXPLÍCITA? (Ej: "por 7 días", "por 1 semana"):
         - Calcula CANTIDAD = (Dosis Diaria * Días).
         - Duración = Texto original.

      2. ¿SIN DURACIÓN Y ES MEDICAMENTO DE CAJA CONOCIDA? (UnitsPerBox > 1):
         - Asume que se receta LA CAJA ENTERA para que no sobre.
         - CANTIDAD = UnitsPerBox (o múltiplos si la dosis es muy alta).
         - CALCULA LA DURACIÓN: (UnitsPerBox / Dosis Diaria).
         - Ejemplo: Caja de 30, toma 3 al día -> Duración: "10 días (1 Caja)".

      3. ¿SIN DURACIÓN Y ES EXTERNO/DESCONOCIDO? (UnitsPerBox <= 1):
         - NO INVENTES DÍAS. NO PONGAS "3 DÍAS".
         - CANTIDAD = 1 (Unidad estándar de venta).
         - Duración = "Según indicación médica" o "Hasta terminar".

      Responde ÚNICAMENTE JSON:
      { "quantity": NUMBER, "duration": "STRING" }
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!jsonStr) throw new Error("Sin respuesta de texto");

    const cleanJsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanJsonStr);
    
    return {
        quantity: typeof result.quantity === 'number' ? result.quantity : 1,
        duration: result.duration || "Según indicación",
        explanation: "IA"
    };

  } catch (error) {
    const local = calculateLocalFallback(instructions, unitsPerBox);
    return { ...local, explanation: "Local" };
  }
};

// --- NUEVA FUNCIÓN: ANALIZAR MEDICAMENTO EXTERNO ---
export const analyzeExternalMedicine = async (medName: string) => {
    try {
        if (!API_KEY) throw new Error("Missing API key");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
        
        const promptText = `
            Actúa como un experto farmacéutico en Guatemala.
            Analiza el nombre del medicamento ingresado: "${medName}".
            
            Necesito que identifiques:
            1. Componente Activo / Molécula.
            2. Distribuidor probable en Guatemala.
            3. Farmacia común donde se encuentra.
            4. Nombre comercial estándar.

            Responde ÚNICAMENTE con este JSON:
            {
                "activeIngredient": "string",
                "distributorGT": "string",
                "pharmacy": "string",
                "commercialName": "string"
            }
        `;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonStr) throw new Error("Sin respuesta de texto");
        const cleanJsonStr = jsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJsonStr);

    } catch (e) {
        console.error("Error analyzing external med:", e);
        return {
            activeIngredient: "No identificado",
            distributorGT: "Desconocido",
            pharmacy: "Farmacias Generales",
            commercialName: medName
        };
    }
};


export const extractActiveIngredient = async (medName: string): Promise<string> => {
  if (!medName.trim()) return "";
  try {
    if (!API_KEY) throw new Error("Missing API key");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    
    const promptText = `
      Actúa como un experto farmacéutico.
      Analiza el siguiente nombre comercial o presentación de medicamento: "${medName}".
      Tu única tarea es identificar el principio activo (la molécula principal).
      NO devuelvas explicaciones, saludos ni la dosis.
      SÓLO devuelve el nombre del principio activo en formato Título (ej: Paracetamol, Ibuprofeno).
      Por ejemplo, para "Tylenol 500mg" responde "Paracetamol". Para "Inderal" responde "Propranolol".
      Si no puedes identificarlo, responde "Desconocido".
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    if (!response.ok) throw new Error("API Error");
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.trim();
    if (text.toLowerCase() === "desconocido") return "";
    return text;
  } catch (e) {
    console.error("Error extracting active ingredient:", e);
    return "";
  }
};

export const improveMedicalText = async (text: string): Promise<string> => {
  if (!text.trim()) return "";
  try {
    if (!API_KEY) throw new Error("Missing API key");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const promptText = `
      Actúa como un médico especialista redactor de informes clínicos.
      Texto original: "${text}"
      Reescribe este texto para que sea una "Referencia a Especialidad" o "Nota de Salud Mental" profesional, formal y concisa.
      Solo devuelve el texto mejorado.
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }]
      })
    });

    if (!response.ok) throw new Error("Error API");
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || text;

  } catch (error) {
    return text;
  }
};

export interface FollowUpAnalysisResult {
  hasFollowUp: boolean;
  days?: number;
  rawText?: string;
}

const normalizeFollowUpText = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/[^\w\s]/g, ' ');
};

const numberWords: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  treintaiuno: 31
};

const parseFollowUpDays = (text: string) => {
  const normalized = normalizeFollowUpText(text);
  const unitRegex = '(dia|dias|semana|semanas|mes|meses)';
  const digitMatch = normalized.match(new RegExp(`(\\d+)\\s*${unitRegex}`));
  const wordMatch = normalized.match(new RegExp(`(${Object.keys(numberWords).join('|')})\\s*${unitRegex}`));

  let count: number | undefined;
  let unit: string | undefined;

  if (digitMatch) {
    count = parseInt(digitMatch[1], 10);
    unit = digitMatch[2];
  } else if (wordMatch) {
    count = numberWords[wordMatch[1]];
    unit = wordMatch[2];
  }

  if (!count || !unit) return null;

  const baseDate = new Date();
  let targetDate = baseDate;
  if (unit.startsWith('mes')) {
    targetDate = addMonths(baseDate, count);
  } else if (unit.startsWith('semana')) {
    targetDate = addWeeks(baseDate, count);
  } else {
    targetDate = addDays(baseDate, count);
  }

  const days = differenceInCalendarDays(targetDate, baseDate);
  return days > 0 ? days : null;
};

export const analyzeFollowUpIntent = async (notes: string): Promise<FollowUpAnalysisResult> => {
  const trimmed = notes.trim();
  if (!trimmed) return { hasFollowUp: false };

  try {
    const localDays = parseFollowUpDays(trimmed);
    if (localDays) {
      return { hasFollowUp: true, days: localDays };
    }
    if (!API_KEY) throw new Error("Missing API key");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const promptText = `
      Actúa como un asistente para agenda médica en Guatemala.
      Texto escrito por el doctor:
      "${trimmed}"

      Tu tarea es detectar si el doctor desea volver a ver al paciente en una RECONSULTA.
      
      Debes reconocer frases como:
      - "quiero verlo en 15 días"
      - "en dos semanas"
      - "reconsulta en 1 mes"
      - "control en 3 semanas"
      - "cita de seguimiento en 10 dias"

      Instrucciones:
      1. Si NO encuentras intención clara de reconsulta futura, responde:
         { "hasFollowUp": false, "days": null }
      2. Si SÍ hay intención de reconsulta:
         - hasFollowUp = true
         - days = número de días exactos desde hoy hasta la reconsulta.
           Convierte semanas o meses a días aproximados:
             - 1 semana = 7 días
             - 1 mes = 30 días

      Responde ÚNICAMENTE este JSON:
      {
        "hasFollowUp": boolean,
        "days": number | null
      }
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });

    if (!response.ok) throw new Error("Error API");
    const data = await response.json();
    const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonStr) return { hasFollowUp: false, rawText: trimmed };

    const parsed = JSON.parse(jsonStr);
    const hasFollowUp = !!parsed.hasFollowUp;
    const days = typeof parsed.days === 'number' && parsed.days > 0 ? parsed.days : undefined;

    if (!hasFollowUp) return { hasFollowUp: false, rawText: trimmed };

    return { hasFollowUp: true, days, rawText: trimmed };
  } catch (e) {
    console.error("Follow-up AI error", e);
    return { hasFollowUp: false, rawText: trimmed };
  }
};

/**
 * Classifies a doctor's reason for NOT prescribing any medication into one of 10 predefined categories.
 * 
 * @param text The free text reason provided by the doctor
 * @returns A promise that resolves to the matched category string.
 */
export const classifyNoPrescriptionReason = async (text: string): Promise<string> => {
  const trimmed = (text || '').trim();
  if (!trimmed) return "Otro";
  
  const API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;
  if (!API_KEY) return "Otro";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

  const promptText = `
    Eres un asistente médico experto. El doctor no recetó ningún medicamento al paciente en esta consulta.
    El doctor escribió el siguiente motivo: "${trimmed}"

    Tu tarea es clasificar este motivo en EXACTAMENTE UNA de las siguientes 10 categorías:
    1. Referencia a especialista
    2. Tratamiento no farmacológico
    3. Paciente ya cuenta con medicación
    4. Alta médica / Fin de tratamiento
    5. Evaluación de laboratorio o imágenes pendiente
    6. Paciente se niega a recibir medicación
    7. Interacciones o contraindicaciones evaluadas
    8. Tratamiento quirúrgico indicado
    9. Remisión a emergencias o cuidado hospitalario
    10. Otro

    Instrucciones:
    1. Lee el motivo e identifica cuál de las 10 categorías lo describe mejor.
    2. Responde ÚNICAMENTE con el texto de la categoría elegida, exactamente como está escrito arriba. No incluyas el número ni ningún otro texto adicional.
    3. Si el motivo no encaja claramente en ninguna de las primeras 9 categorías, responde "Otro".
  `;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { 
          temperature: 0.1,
          maxOutputTokens: 50
        }
      })
    });

    if (!response.ok) throw new Error("Error API de Gemini");
    
    const data = await response.json();
    let result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    
    // Validar que el resultado esté en las opciones
    const validCategories = [
      "Referencia a especialista",
      "Tratamiento no farmacológico",
      "Paciente ya cuenta con medicación",
      "Alta médica / Fin de tratamiento",
      "Evaluación de laboratorio o imágenes pendiente",
      "Paciente se niega a recibir medicación",
      "Interacciones o contraindicaciones evaluadas",
      "Tratamiento quirúrgico indicado",
      "Remisión a emergencias o cuidado hospitalario",
      "Otro"
    ];
    
    const matched = validCategories.find(cat => cat.toLowerCase() === result.toLowerCase());
    return matched || "Otro";
    
  } catch (error) {
    console.error("AI classification error for no prescription reason:", error);
    return "Otro";
  }
};

/**
 * Classifies a free-text diagnosis into either a predefined neurological
 * category or a custom "Otro" subtype (invented by Gemini).
 * Returns `{ categoria, subtipo }` — subtipo is set only when categoria === 'Otro'.
 * Handles non-Spanish input by interpreting and translating to Latin-American Spanish.
 */
export const geminiClassifyDiagnosis = async (diagnosis: string): Promise<{ categoria: string; subtipo: string | null } | null> => {
  const trimmed = (diagnosis || '').trim();
  if (!trimmed) return null;

  const API_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY;
  if (!API_KEY) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

  const promptText = `Eres un neurólogo experto. Tu tarea es clasificar el siguiente diagnóstico en UNA categoría de esta lista:

- Epilepsia
- Parkinson
- Migraña/Dolor de cabeza
- Dolor neuropático
- Tumores cerebrales
- Esclerosis múltiple
- ACV
- Demencia
- Trastornos del movimiento
- Neuropatía
- Cefalea tensional
- Enfermedad neuromuscular
- Trastorno del sueño
- Otro (si no encaja en ninguna de las anteriores)

Si el diagnóstico está en otro idioma (inglés u otro), interprétalo y clasifícalo en la categoría apropiada EN ESPAÑOL LATINOAMERICANO.

Diagnóstico: "${trimmed}"

Responde ÚNICAMENTE en este formato JSON (sin markdown, sin texto adicional):
{
  "categoria": "Una de las 13 categorías o 'Otro'",
  "subtipo": "Si categoria es 'Otro', describe el tipo en 1-3 palabras en español (ej: 'Síndrome de Tourette', 'Trastorno del espectro autista'); si no es 'Otro', null"
}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 200,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini classify diagnosis error:', errorText);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleanJson);
    return {
      categoria: typeof parsed.categoria === 'string' ? parsed.categoria.trim() : 'Otro',
      subtipo: typeof parsed.subtipo === 'string' && parsed.subtipo.trim() ? parsed.subtipo.trim() : null,
    };
  } catch (error) {
    console.error('Gemini classify diagnosis error:', error);
    return null;
  }
};
