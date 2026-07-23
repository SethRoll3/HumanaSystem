/**
 * Categorización inteligente de diagnósticos de consulta.
 *
 * Flujo (4 niveles):
 *   1. Cache en memoria (Map) — instantáneo, se pierde al refrescar
 *   2. Cache en Firestore (`diagnosis_categories_cache`) — persistente
 *   3. Keyword matching contra lista hardcoded de categorías comunes
 *   4. Gemini AI — fallback para textos largos/desconocidos
 *
 * Devuelve un CategorizationResult con discriminante `kind`:
 *   - 'predefined' → categoría de las 13 hardcoded
 *   - 'otro' → categoría "Otro" con `subtype` que Gemini inventó
 */
import { Pathology } from '../types';
import { normalizeText } from '../services/pharmacySalesService';
import { collection, doc, getDoc, getDocs, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { hasGeminiKey } from '../services/geminiService';

export type CategorizationResult =
  | { kind: 'predefined'; category: string }
  | { kind: 'otro'; category: 'Otro'; subtype: string };

// Cache en memoria (sesión actual)
const memoryCache = new Map<string, CategorizationResult>();

// Lista base de categorías hardcoded (las más comunes en neurología)
const KEYWORD_MAP: Record<string, string[]> = {
  'Epilepsia': ['epilepsia', 'epilepsy', 'epilept', 'convulsion', 'convulsiva', 'crisis', 'tonico-clonic', 'lennox', 'ausencia', 'mioclonica', 'epileptiform', 'status epilepticus'],
  'Parkinson': ['parkinson', 'bradicinesia', 'rigidez', 'temblor en reposo', 'hiposmia', 'discinesia', 'parkinsonismo'],
  'Migraña/Dolor de cabeza': ['migrana', 'migraña', 'cefalea', 'jaqueca', 'hemicranea', 'cefaleas'],
  'Dolor neuropático': ['dolor neuropatico', 'neuropatia', 'neuralgia', 'lumbalgia', 'ciatica', 'polineuropatia dolorosa'],
  'Tumores cerebrales': ['tumor cerebral', 'glioma', 'meningioma', 'neoplasia', 'metastasis cerebral', 'masacre craneal', 'astrocitoma', 'oligodendroglioma'],
  'Esclerosis múltiple': ['esclerosis multiple', 'placa desmielinizante', 'banda oligoclonal', 'em ', 'sclerois multiple'],
  'ACV': ['acv', 'evento vascular', 'evento cerebrovascular', 'infarto cerebral', 'derrame', 'isquemia cerebral', 'hemorragia cerebral', 'trombosis cerebral'],
  'Demencia': ['demencia', 'alzheimer', 'deterioro cognitivo', 'cuerpos de lewy', 'demencia frontotemporal', 'demencia vascular', 'mci'],
  'Trastornos del movimiento': ['distonia', 'corea', 'tics', 'tourette', 'hemifacial', 'discinesia tardia', 'temblor esencial'],
  'Neuropatía': ['polineuropatia', 'mononeuropatia', 'guillain-barre', 'sindrome de guillain', 'cidp', 'meralgia'],
  'Cefalea tensional': ['cefalea tensional', 'cefalea de tipo tensional'],
  'Enfermedad neuromuscular': ['miopatia', 'distrofia muscular', 'esclerosis lateral', 'ela', 'enfermedad de neuron motor', 'sma', 'polimiositis'],
  'Trastorno del sueño': ['apnea del sueno', 'insomnio', 'narcolepsia', 'parasomnia', 'piernas inquietas'],
};

// Firestore cache
const CACHE_COLLECTION = 'diagnosis_categories_cache';

interface FirestoreCacheEntry {
  category: string;
  subtype: string | null;
  source: 'keyword' | 'pathology' | 'gemini';
  occurrences: number;
  createdAt: any;
  updatedAt: any;
}

async function getCachedEntry(normalized: string): Promise<CategorizationResult | null> {
  try {
    const ref = doc(db, CACHE_COLLECTION, normalized);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as FirestoreCacheEntry;
    if (data.category === 'Otro' && data.subtype) {
      return { kind: 'otro', category: 'Otro', subtype: data.subtype };
    }
    return { kind: 'predefined', category: data.category };
  } catch (e) {
    console.warn('Cache read failed:', e);
    return null;
  }
}

async function saveCacheToFirestore(
  normalized: string,
  result: CategorizationResult,
  source: 'keyword' | 'pathology' | 'gemini'
): Promise<void> {
  try {
    const ref = doc(db, CACHE_COLLECTION, normalized);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // Incrementar occurrences
      await setDoc(ref, {
        category: result.category,
        subtype: result.kind === 'otro' ? result.subtype : null,
        source,
        updatedAt: serverTimestamp(),
        occurrences: (existing.data() as FirestoreCacheEntry).occurrences + 1,
      }, { merge: true });
    } else {
      await setDoc(ref, {
        category: result.category,
        subtype: result.kind === 'otro' ? result.subtype : null,
        source,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        occurrences: 1,
      });
    }
  } catch (e) {
    console.warn('Cache write failed:', e);
  }
}

function cacheLocally(normalized: string, result: CategorizationResult) {
  memoryCache.set(normalized, result);
}

interface GeminiRawResponse {
  categoria: string;
  subtipo: string | null;
}

async function callGemini(diagnosis: string): Promise<GeminiRawResponse | null> {
  if (!hasGeminiKey()) return null;
  try {
    const { geminiClassifyDiagnosis } = await import('../services/geminiService');
    return await geminiClassifyDiagnosis(diagnosis);
  } catch (e) {
    console.warn('Gemini classify diagnosis failed:', e);
    return null;
  }
}

/**
 * Categoriza un diagnóstico en una de las categorías conocidas o
 * devuelve "Otro" con un subtipo inventado por Gemini.
 */
export async function categorizeDiagnosis(
  diagnosis: string | undefined,
  pathologiesList: Pathology[] = []
): Promise<CategorizationResult> {
  if (!diagnosis || !diagnosis.trim()) {
    return { kind: 'predefined', category: 'Otro' };
  }
  const normalized = normalizeText(diagnosis);
  if (!normalized) {
    return { kind: 'predefined', category: 'Otro' };
  }

  // Nivel 1: Cache en memoria
  if (memoryCache.has(normalized)) {
    return memoryCache.get(normalized)!;
  }

  // Nivel 2: Cache en Firestore
  const firestoreCached = await getCachedEntry(normalized);
  if (firestoreCached) {
    cacheLocally(normalized, firestoreCached);
    return firestoreCached;
  }

  // Nivel 3: Keyword matching
  for (const [category, keywords] of Object.entries(KEYWORD_MAP)) {
    if (keywords.some(kw => normalized.includes(kw))) {
      const result: CategorizationResult = { kind: 'predefined', category };
      cacheLocally(normalized, result);
      // No bloqueamos por Firestore; guardamos async
      void saveCacheToFirestore(normalized, result, 'keyword');
      return result;
    }
  }

  // Nivel 4: Pathologies catalog
  for (const p of pathologiesList) {
    const pNorm = normalizeText(p.name);
    if (pNorm && (normalized.includes(pNorm) || normalized.split(' ')[0] === pNorm.split(' ')[0])) {
      const result: CategorizationResult = { kind: 'predefined', category: p.name };
      cacheLocally(normalized, result);
      void saveCacheToFirestore(normalized, result, 'pathology');
      return result;
    }
  }

  // Nivel 5: Gemini fallback
  const gemini = await callGemini(diagnosis);
  let result: CategorizationResult;
  if (gemini && gemini.categoria) {
    if (gemini.categoria === 'Otro' && gemini.subtipo) {
      result = { kind: 'otro', category: 'Otro', subtype: gemini.subtipo };
    } else {
      result = { kind: 'predefined', category: gemini.categoria };
    }
  } else {
    result = { kind: 'predefined', category: 'Otro' };
  }
  cacheLocally(normalized, result);
  void saveCacheToFirestore(normalized, result, 'gemini');
  return result;
}

/**
 * Carga todo el cache de Firestore a la memoria (batch hydration).
 * Llamar al montar el dashboard.
 */
export async function loadAllCache(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, CACHE_COLLECTION));
    snap.docs.forEach(d => {
      const data = d.data() as FirestoreCacheEntry;
      const result: CategorizationResult = data.category === 'Otro' && data.subtype
        ? { kind: 'otro', category: 'Otro', subtype: data.subtype }
        : { kind: 'predefined', category: data.category };
      memoryCache.set(d.id, result);
    });
  } catch (e) {
    console.warn('Cache hydration failed:', e);
  }
}

/**
 * Devuelve un resumen de los subtipos descubiertos por Gemini (kind: 'otro'),
 * agrupados por subtipo y ordenados por occurrences.
 */
export function getRecentSubtypes(): Array<{ subtype: string; occurrences: number }> {
  const counts = new Map<string, number>();
  memoryCache.forEach(result => {
    if (result.kind === 'otro') {
      counts.set(result.subtype, (counts.get(result.subtype) || 0) + 1);
    }
  });
  return Array.from(counts.entries())
    .map(([subtype, occurrences]) => ({ subtype, occurrences }))
    .sort((a, b) => b.occurrences - a.occurrences);
}
