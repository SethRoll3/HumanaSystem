import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Firebase firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => null })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}));

// Mock firebase config (no real Firebase)
vi.mock('../firebase/config', () => ({ db: { _mock: true } }));

// Mock geminiService
vi.mock('../services/geminiService', () => ({
  hasGeminiKey: vi.fn(() => false),
  geminiClassifyDiagnosis: vi.fn(),
}));

import { categorizeDiagnosis, loadAllCache, getRecentSubtypes } from '../utils/diagnosisCategorization';
import { geminiClassifyDiagnosis, hasGeminiKey } from '../services/geminiService';
import { Pathology } from '../types';

const geminiMock = vi.mocked(geminiClassifyDiagnosis);
const hasKeyMock = vi.mocked(hasGeminiKey);

beforeEach(() => {
  geminiMock.mockReset();
  hasKeyMock.mockReset();
  hasKeyMock.mockReturnValue(false); // default: no Gemini
});

describe('categorizeDiagnosis - keyword matching', () => {
  it('returns "Epilepsia" for "epilepsia"', async () => {
    const r = await categorizeDiagnosis('epilepsia', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Epilepsia');
  });

  it('matches with case and accent insensitivity', async () => {
    const r1 = await categorizeDiagnosis('EPILEPSIA', []);
    const r2 = await categorizeDiagnosis('Epilépsia Refractaria', []);
    const r3 = await categorizeDiagnosis('crisis convulsiva', []);
    expect(r1.kind).toBe('predefined');
    expect(r2.kind).toBe('predefined');
    expect(r3.kind).toBe('predefined');
    if (r1.kind === 'predefined') expect(r1.category).toBe('Epilepsia');
    if (r2.kind === 'predefined') expect(r2.category).toBe('Epilepsia');
    if (r3.kind === 'predefined') expect(r3.category).toBe('Epilepsia');
  });

  it('"convulsiones febriles" → Epilepsia', async () => {
    const r = await categorizeDiagnosis('Convulsiones febriles en paciente pediátrico', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Epilepsia');
  });

  it('"status epilepticus" → Epilepsia', async () => {
    const r = await categorizeDiagnosis('Status epilepticus refractario', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Epilepsia');
  });

  it('"Parkinson" detection', async () => {
    const r = await categorizeDiagnosis('Enfermedad de Parkinson idiopática', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Parkinson');
  });

  it('"Migraña/Dolor de cabeza" detection', async () => {
    const r = await categorizeDiagnosis('Migraña crónica con aura', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Migraña/Dolor de cabeza');
  });

  it('"Demencia" detection', async () => {
    const r = await categorizeDiagnosis('Enfermedad de Alzheimer probable', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Demencia');
  });

  it('"Esclerosis múltiple" detection', async () => {
    const r = await categorizeDiagnosis('Esclerosis múltiple remitente recurrente', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Esclerosis múltiple');
  });

  it('"Tumores cerebrales" detection', async () => {
    const r = await categorizeDiagnosis('Glioma cerebral de alto grado', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Tumores cerebrales');
  });

  it('"ACV" detection', async () => {
    const r = await categorizeDiagnosis('ACV isquémico de ACM izquierda', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('ACV');
  });
});

describe('categorizeDiagnosis - empty/undefined input', () => {
  it('returns "Otro" for undefined diagnosis', async () => {
    const r = await categorizeDiagnosis(undefined, []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Otro');
  });

  it('returns "Otro" for empty string', async () => {
    const r = await categorizeDiagnosis('', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Otro');
  });

  it('returns "Otro" for whitespace-only', async () => {
    const r = await categorizeDiagnosis('   ', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Otro');
  });
});

describe('categorizeDiagnosis - cache (memory)', () => {
  it('returns cached result on second call (no second Gemini call)', async () => {
    hasKeyMock.mockReturnValue(true);
    geminiMock.mockResolvedValue({ categoria: 'Epilepsia', subtipo: null });
    const uniqueText = `cache test ${Date.now()}`;

    // First call
    const r1 = await categorizeDiagnosis(uniqueText, []);
    expect(r1.kind).toBe('predefined');
    const callsAfter1 = geminiMock.mock.calls.length;

    // Second call (same normalized text) — should hit cache
    const r2 = await categorizeDiagnosis(uniqueText, []);
    expect(r2.kind).toBe('predefined');
    // geminiMock should NOT have been called again (cache hit)
    expect(geminiMock.mock.calls.length).toBe(callsAfter1);
  });
});

describe('categorizeDiagnosis - pathologies catalog', () => {
  it('matches by pathology name in diagnosis', async () => {
    const pathologies: Pathology[] = [
      { id: '1', name: 'Síndrome de Fabry', exams: [] },
      { id: '2', name: 'ELA', exams: [] },
    ];
    hasKeyMock.mockReturnValue(false);
    // Use a diagnosis that doesn't match any keyword but contains pathology name
    const r = await categorizeDiagnosis('Sospecha de síndrome de Fabry por antecedentes familiares', pathologies);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Síndrome de Fabry');
  });
});

describe('categorizeDiagnosis - Gemini fallback', () => {
  it('returns Gemini category when no keyword matches and no pathologies match', async () => {
    hasKeyMock.mockReturnValue(true);
    geminiMock.mockResolvedValue({ categoria: 'Epilepsia', subtipo: null });
    const r = await categorizeDiagnosis('Diagnóstico raro de neurología que no matchea nada', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Epilepsia');
  });

  it('returns "Otro" with subtype when Gemini returns Otro', async () => {
    hasKeyMock.mockReturnValue(true);
    geminiMock.mockResolvedValue({ categoria: 'Otro', subtipo: 'Síndrome de Rett' });
    const r = await categorizeDiagnosis('Sospecha de síndrome de Rett en paciente joven', []);
    expect(r.kind).toBe('otro');
    if (r.kind === 'otro') {
      expect(r.category).toBe('Otro');
      expect(r.subtype).toBe('Síndrome de Rett');
    }
  });

  it('returns "Otro" (predefined) when Gemini returns Otro without subtipo', async () => {
    hasKeyMock.mockReturnValue(true);
    geminiMock.mockResolvedValue({ categoria: 'Otro', subtipo: null });
    const r = await categorizeDiagnosis('Diagnóstico no clasificable', []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Otro');
  });

  it('returns "Otro" when Gemini fails and no keyword matches', async () => {
    hasKeyMock.mockReturnValue(true);
    geminiMock.mockRejectedValue(new Error('API down'));
    const uniqueText = `Diagnóstico único ${Date.now()}_${Math.random()} cuando Gemini falla`;
    const r = await categorizeDiagnosis(uniqueText, []);
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Otro');
  });

  it('falls back to "Otro" when no Gemini key is configured', async () => {
    hasKeyMock.mockReturnValue(false);
    const r = await categorizeDiagnosis('Diagnóstico de prueba sin Gemini', []);
    expect(geminiMock).not.toHaveBeenCalled();
    expect(r.kind).toBe('predefined');
    if (r.kind === 'predefined') expect(r.category).toBe('Otro');
  });
});

describe('getRecentSubtypes', () => {
  it('returns an array (may contain entries from previous tests)', () => {
    const result = getRecentSubtypes();
    expect(Array.isArray(result)).toBe(true);
    // Each entry has subtype and occurrences fields
    for (const item of result) {
      expect(item).toHaveProperty('subtype');
      expect(item).toHaveProperty('occurrences');
      expect(typeof item.subtype).toBe('string');
      expect(typeof item.occurrences).toBe('number');
    }
  });
});

describe('loadAllCache', () => {
  it('runs without crashing when db is mocked', async () => {
    // Should not throw even with mocked firestore
    await loadAllCache();
  });
});
