import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Firebase firestore
vi.mock('firebase/firestore', () => {
  const addDocMock = vi.fn(async (_col, data) => ({ id: `mock-${Math.random()}`, data: () => data }));
  const getDocsMock = vi.fn(async () => ({ docs: [] }));
  const updateDocMock = vi.fn(async () => undefined);
  const deleteDocMock = vi.fn(async () => undefined);
  const docMock = vi.fn((_db, _coll, _id) => ({ id: _id }));
  const collectionMock = vi.fn((_db, name) => ({ _name: name }));
  const queryMock = vi.fn((col) => col);
  const whereMock = vi.fn(() => ({}));
  const serverTimestampMock = vi.fn(() => 'SERVER_TIMESTAMP');

  return {
    collection: collectionMock,
    getDocs: getDocsMock,
    addDoc: addDocMock,
    updateDoc: updateDocMock,
    deleteDoc: deleteDocMock,
    doc: docMock,
    serverTimestamp: serverTimestampMock,
    query: queryMock,
    where: whereMock,
  };
});

// Mock firebase config (no real Firebase)
vi.mock('../firebase/config', () => ({ db: { _mock: true } }));

// Mock geminiService
vi.mock('../services/geminiService', () => ({
  extractActiveIngredient: vi.fn(async (name: string) => {
    if (name === 'THROW') throw new Error('Gemini down');
    return `MOCK_INGREDIENT:${name}`;
  }),
}));

import { addDoc } from 'firebase/firestore';
import { extractActiveIngredient } from '../services/geminiService';
import { medicineNormalizationService } from '../services/medicineNormalizationService';

const addDocMock = vi.mocked(addDoc);
const extractMock = vi.mocked(extractActiveIngredient);

describe('medicineNormalizationService - Gemini handling', () => {
  beforeEach(() => {
    addDocMock.mockClear();
    extractMock.mockClear();
    vi.unstubAllEnvs();
  });

  it('does NOT call extractActiveIngredient when no API key is configured', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    await medicineNormalizationService.approveCluster('Conect 10mg', ['Conect 10mg', 'Conect 10 mg'], 'admin');
    expect(extractMock).not.toHaveBeenCalled();
    expect(addDocMock).toHaveBeenCalledTimes(1); // only the variant (canonical skipped)
    const call = addDocMock.mock.calls[0][1] as any;
    expect(call.activeIngredient).toBe('');
    expect(call.dirtyName).toBe('Conect 10 mg');
    expect(call.status).toBe('approved');
  });

  it('writes rules successfully even when Gemini throws', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'fake-key');
    await medicineNormalizationService.approveCluster('THROW', ['THROW', 'THROW variant'], 'admin');
    // Should not throw, rule should still be saved with empty ingredient
    expect(addDocMock).toHaveBeenCalled();
    const call = addDocMock.mock.calls[0][1] as any;
    expect(call.activeIngredient).toBe('');
    expect(call.dirtyName).toBe('THROW variant');
  });

  it('caches active ingredient per canonical name to avoid repeated API calls', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'fake-key');
    await medicineNormalizationService.approveCluster('Paracetamol', ['Paracetamol', 'Tylenol'], 'admin');
    await medicineNormalizationService.approveCluster('Paracetamol', ['Paracetamol', 'Acetaminofen'], 'admin');
    // Only first call should hit Gemini
    expect(extractMock).toHaveBeenCalledTimes(1);
    expect(extractMock).toHaveBeenCalledWith('Paracetamol');
  });

  it('uses cached value on second call for same canonical name', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', 'fake-key');
    await medicineNormalizationService.approveCluster('Ibuprofen', ['Ibuprofen', 'Advil'], 'admin');
    const firstCallIngredient = (addDocMock.mock.calls[0][1] as any).activeIngredient;
    expect(firstCallIngredient).toBe('MOCK_INGREDIENT:Ibuprofen');

    // Now call again — should use cache
    await medicineNormalizationService.approveCluster('Ibuprofen', ['Ibuprofen', 'Motrin'], 'admin');
    expect(extractMock).toHaveBeenCalledTimes(1);
    expect((addDocMock.mock.calls[1][1] as any).activeIngredient).toBe('MOCK_INGREDIENT:Ibuprofen');
  });

  it('skips the canonical name itself when creating rules (no canonical→canonical rule)', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    await medicineNormalizationService.approveCluster('Conect 10mg', ['Conect 10mg', 'Conect 10 mg'], 'admin');
    // Only 1 rule created (for the variant 'Conect 10 mg'), not for the canonical 'Conect 10mg'
    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect((addDocMock.mock.calls[0][1] as any).dirtyName).toBe('Conect 10 mg');
  });
});

describe('medicineNormalizationService - addRule', () => {
  beforeEach(() => {
    addDocMock.mockClear();
    extractMock.mockClear();
    vi.unstubAllEnvs();
  });

  it('skips Gemini call when no key configured', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    await medicineNormalizationService.addRule('dirty-name', 'Clean Name');
    expect(extractMock).not.toHaveBeenCalled();
    const data = addDocMock.mock.calls[0][1] as any;
    expect(data.activeIngredient).toBe('');
    expect(data.status).toBe('pending');
  });

  it('uses provided activeIngredient without calling Gemini', async () => {
    vi.stubEnv('VITE_GEMINI_API_KEY', '');
    await medicineNormalizationService.addRule('dirty', 'Clean', 'Aspirina');
    expect(extractMock).not.toHaveBeenCalled();
    expect((addDocMock.mock.calls[0][1] as any).activeIngredient).toBe('Aspirina');
  });
});
