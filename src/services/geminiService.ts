
import { addDays, addWeeks, addMonths, differenceInCalendarDays } from 'date-fns';

const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY || (process as any).env?.API_KEY;

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

    const result = JSON.parse(jsonStr);
    
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
        return JSON.parse(jsonStr);

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
