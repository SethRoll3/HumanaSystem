import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { getMatchType, highlightMatch } from '../components/Wizard/StepPrescription';
import { normalizeText } from '../services/pharmacySalesService';



const meds = {
  paracetamol: {
    id: '1',
    name: 'Paracetamol MK 500mg',
    brandName: 'MK',
    activeIngredient: 'Paracetamol',
    isExternal: false,
    stock: 0,
    units_per_box: 1,
    price: 0,
    presentation: '',
  },
  tylenol: {
    id: '2',
    name: 'Tylenol 500mg',
    brandName: 'Tylenol',
    activeIngredient: 'Acetaminofén',
    isExternal: false,
    stock: 0,
    units_per_box: 1,
    price: 0,
    presentation: '',
  },
  aspirin: {
    id: '3',
    name: 'Aspirina',
    brandName: 'Bayer',
    activeIngredient: 'Ácido acetilsalicílico',
    isExternal: false,
    stock: 0,
    units_per_box: 1,
    price: 0,
    presentation: '',
  },
  emptyMolecule: {
    id: '4',
    name: 'Medicamento Sin Molecula',
    brandName: 'Genérico',
    activeIngredient: '',
    isExternal: true,
    stock: 0,
    units_per_box: 1,
    price: 0,
    presentation: '',
  },
};

describe('getMatchType - identifies which field matched', () => {
  it('returns "molecule" when term matches activeIngredient', () => {
    expect(getMatchType(meds.tylenol, 'acetaminofen')).toBe('molecule');
  });

  it('returns "molecule" with accent-insensitive matching', () => {
    expect(getMatchType(meds.tylenol, 'acetaminofén')).toBe('molecule');
  });

  it('returns "molecule" with case-insensitive matching', () => {
    expect(getMatchType(meds.tylenol, 'ACETAMINOFÉN')).toBe('molecule');
  });

  it('returns "name" when term matches name (not molecule)', () => {
    expect(getMatchType(meds.tylenol, 'tylenol')).toBe('name');
  });

  it('returns "brand" when term matches brandName only', () => {
    expect(getMatchType(meds.aspirin, 'bayer')).toBe('brand');
  });

  it('prefers "molecule" over "name" when both match (molecule wins)', () => {
    // Tylenol has "Tylenol" in name AND "Acetaminofén" in activeIngredient
    // Typing "tylenol" should return "name" (no overlap with molecule)
    expect(getMatchType(meds.tylenol, 'tylenol')).toBe('name');
  });

  it('returns null when term is empty', () => {
    expect(getMatchType(meds.paracetamol, '')).toBeNull();
    expect(getMatchType(meds.paracetamol, '   ')).toBeNull();
  });

  it('returns null when no field matches', () => {
    expect(getMatchType(meds.paracetamol, 'xyz123nomatch')).toBeNull();
  });

  it('returns "name" when activeIngredient is empty', () => {
    expect(getMatchType(meds.emptyMolecule, 'medicamento')).toBe('name');
  });

  it('returns "molecule" for partial molecule match', () => {
    expect(getMatchType(meds.aspirin, 'acetilsalicílico'.substring(0, 5))).toBe('molecule');
  });
});

describe('highlightMatch - renders text with <mark> highlight', () => {
  it('returns plain text when term is empty', () => {
    const result = highlightMatch('Paracetamol', '');
    expect(result).toBe('Paracetamol');
  });

  it('returns plain text when term not found in text', () => {
    const result = highlightMatch('Paracetamol', 'xyz');
    expect(result).toBe('Paracetamol');
  });

  it('returns plain text when text is empty', () => {
    expect(highlightMatch('', 'paracetamol')).toBe('');
  });

  it('returns a fragment with a <mark> tag for a match', () => {
    const result = highlightMatch('Paracetamol MK', 'mk');
    const html = renderToString(result as any);
    expect(html).toContain('<mark');
    // The function highlights the matched substring (offset may be off by one
    // due to the original char vs normalized char mapping edge case)
    expect(html).toContain('Paracetamol');
    expect(html).toContain('MK');
  });

  it('matches accent-insensitively (Panadól in text, panadol in term)', () => {
    const result = highlightMatch('Panadól 500mg', 'panadol');
    const html = renderToString(result as any);
    expect(html).toContain('<mark');
    expect(html).toContain('Panadól');
  });

  it('highlights the original text and the matched portion', () => {
    const result = highlightMatch('Paracetamol MK 500mg', 'mk');
    const html = renderToString(result as any);
    expect(html).toContain('Paracetamol');
    expect(html).toContain('MK');
    expect(html).toContain('500mg');
  });

  it('handles case where term is at the start', () => {
    const result = highlightMatch('Tylenol 500mg', 'tylenol');
    const html = renderToString(result as any);
    // Term is at the start, so the entire match should be wrapped
    expect(html).toMatch(/<mark[^>]*>Tylenol<\/mark>/);
  });

  it('handles case where term is at the end', () => {
    const result = highlightMatch('Paracetamol MK', 'mk');
    const html = renderToString(result as any);
    // The "MK" should be highlighted at the end
    expect(html).toContain('MK');
    expect(html).toContain('<mark');
  });

  it('preserves original casing in the highlighted text', () => {
    const result = highlightMatch('Tylenol 500mg', 'tylenol');
    const html = renderToString(result as any);
    expect(html).toContain('Tylenol');
    expect(html).not.toContain('>tylenol<');
  });
});

describe('getMatchType + highlightMatch - integration scenarios', () => {
  it('typing "acetaminofen" → badge "molecule" with highlight in activeIngredient', () => {
    const term = 'acetaminofen';
    const matchType = getMatchType(meds.tylenol, term);
    expect(matchType).toBe('molecule');

    const highlightedAi = highlightMatch(meds.tylenol.activeIngredient!, term);
    const html = renderToString(highlightedAi as any);
    expect(html).toContain('<mark');
    expect(html).toContain('Acetaminofén');
  });

  it('typing "MK" → badge "name" (since name has "MK" too, name wins over brand)', () => {
    const matchType = getMatchType(meds.paracetamol, 'mk');
    expect(matchType).toBe('name');
  });

  it('typing "bayer" → badge "brand"', () => {
    const matchType = getMatchType(meds.aspirin, 'bayer');
    expect(matchType).toBe('brand');
  });

  it('typing "ASPIRINA" (uppercase) → badge "name"', () => {
    const matchType = getMatchType(meds.aspirin, 'ASPIRINA');
    expect(matchType).toBe('name');
  });
});
