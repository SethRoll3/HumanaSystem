import { describe, it, expect } from 'vitest';
import { normalizeText } from '../services/pharmacySalesService';

interface MockMed {
  id: string;
  name: string;
  brandName?: string;
  activeIngredient?: string;
  isExternal: boolean;
}

/**
 * Pure helper that mirrors `performLocalSearch` in StepPrescription.tsx.
 * Keeping the logic in a testable form lets us assert accent + case behavior
 * without spinning up React + RHF + Firebase.
 */
const performLocalSearch = (
  allMeds: MockMed[],
  term: string,
  source: 'all' | 'external' | 'inventory'
): MockMed[] => {
  let filtered = allMeds;
  if (source === 'external') filtered = filtered.filter(m => m.isExternal);
  else if (source === 'inventory') filtered = filtered.filter(m => !m.isExternal);

  if (term.trim()) {
    const lower = normalizeText(term);
    filtered = filtered.filter(m =>
      normalizeText(m.name).includes(lower) ||
      (m.brandName && normalizeText(m.brandName).includes(lower)) ||
      (m.activeIngredient && normalizeText(m.activeIngredient).includes(lower))
    );
  }
  return filtered;
};

const findExactMatch = (results: MockMed[], term: string): MockMed | undefined => {
  const normalizedSearch = normalizeText(term);
  return results.find(r => normalizeText(r.name) === normalizedSearch);
};

describe('normalizeText - search helper', () => {
  it('removes accents and lowercases', () => {
    expect(normalizeText('Panadól')).toBe('panadol');
    expect(normalizeText('TYLENOL')).toBe('tylenol');
    expect(normalizeText('Acetaminofén')).toBe('acetaminofen');
  });

  it('handles empty/whitespace', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });
});

describe('StepPrescription search - accent & case insensitive', () => {
  const meds: MockMed[] = [
    { id: '1', name: 'Paracetamol', brandName: 'Tylenol', activeIngredient: 'Paracetamol', isExternal: false },
    { id: '2', name: 'Panadol 500mg', brandName: 'Panadol', activeIngredient: 'Paracetamol', isExternal: false },
    { id: '3', name: 'Tylenól', brandName: 'Tylenol Forte', activeIngredient: 'Acetaminofén', isExternal: true },
    { id: '4', name: 'Ibuprofeno MK', activeIngredient: 'Ibuprofeno', isExternal: true },
    { id: '5', name: 'Acetaminofen', isExternal: false },
  ];

  it('finds "Tylenol" when searching "Tylenól" (accent in search)', () => {
    const results = performLocalSearch(meds, 'Tylenól', 'all');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => normalizeText(r.name) === 'tylenol')).toBe(true);
  });

  it('finds "Panadol" when searching "panadol" (case insensitive)', () => {
    const results = performLocalSearch(meds, 'panadol', 'all');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => normalizeText(r.name).includes('panadol'))).toBe(true);
  });

  it('finds "Paracetamol" when searching "PARACETAMOL" (uppercase)', () => {
    const results = performLocalSearch(meds, 'PARACETAMOL', 'all');
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r =>
      normalizeText(r.name).includes('paracetamol') ||
      normalizeText(r.brandName || '').includes('paracetamol') ||
      normalizeText(r.activeIngredient || '').includes('paracetamol')
    )).toBe(true);
  });

  it('finds by active ingredient "Acetaminofén" when searching "Acetaminofen"', () => {
    const results = performLocalSearch(meds, 'Acetaminofen', 'all');
    expect(results.some(r => normalizeText(r.name) === 'tylenol' || normalizeText(r.activeIngredient || '') === 'acetaminofen')).toBe(true);
  });

  it('finds via brand name with accents on both sides', () => {
    const results = performLocalSearch(meds, 'tÿlenol', 'all');
    expect(results.length).toBeGreaterThan(0);
  });

  it('filters by source: only external meds when filterSource=external', () => {
    const results = performLocalSearch(meds, '', 'external');
    expect(results.every(r => r.isExternal)).toBe(true);
    expect(results.length).toBe(2);
  });

  it('filters by source: only inventory when filterSource=inventory', () => {
    const results = performLocalSearch(meds, '', 'inventory');
    expect(results.every(r => !r.isExternal)).toBe(true);
    expect(results.length).toBe(3);
  });

  it('returns all meds when source=all and term is empty', () => {
    const results = performLocalSearch(meds, '', 'all');
    expect(results.length).toBe(5);
  });

  it('partial match works (e.g. "para" finds "Paracetamol" and "Panadol")', () => {
    const results = performLocalSearch(meds, 'para', 'all');
    const names = results.map(r => r.name);
    expect(names).toContain('Paracetamol');
    expect(names).toContain('Panadol 500mg');
  });
});

describe('StepPrescription - exact match dedupe (addManualExternal)', () => {
  const meds: MockMed[] = [
    { id: '1', name: 'Panadol', isExternal: true },
    { id: '2', name: 'Tylenól', isExternal: true },
    { id: '3', name: 'Aspirina', isExternal: true },
  ];

  it('dedupes exact match with different case ("panadol" matches "Panadol")', () => {
    const found = findExactMatch(meds, 'panadol');
    expect(found?.id).toBe('1');
  });

  it('dedupes exact match with different accent ("Tylenol" matches "Tylenól")', () => {
    const found = findExactMatch(meds, 'Tylenol');
    expect(found?.id).toBe('2');
  });

  it('dedupes exact match with all-caps ("ASPIRINA" matches "Aspirina")', () => {
    const found = findExactMatch(meds, 'ASPIRINA');
    expect(found?.id).toBe('3');
  });

  it('returns undefined when no exact match', () => {
    const found = findExactMatch(meds, 'Ibuprofeno');
    expect(found).toBeUndefined();
  });

  it('does NOT match partial (only full string match)', () => {
    const found = findExactMatch(meds, 'Pan');
    expect(found).toBeUndefined();
  });
});
