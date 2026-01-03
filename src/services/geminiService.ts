
const API_KEY = process.env.API_KEY;

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

        if (!response.ok) return null;
        
        const data = await response.json();
        const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
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


export const improveMedicalText = async (text: string): Promise<string> => {
  if (!text.trim()) return "";
  try {
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
