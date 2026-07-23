import { describe, it, expect } from 'vitest';
import { findMoleculeOverlaps, findMoleculeOverlapsFromPrescriptions, MoleculeOverlap, MoleculeOverlapReport } from '../services/inventoryService';
import { Medicine } from '../types';

const med = (overrides: Partial<Medicine>): Medicine => ({
  id: overrides.id || 'id-' + Math.random(),
  name: overrides.name || 'Test Med',
  stock: overrides.stock ?? 0,
  price: overrides.price ?? 0,
  presentation: overrides.presentation || 'Caja',
  units_per_box: overrides.units_per_box ?? 1,
  isExternal: overrides.isExternal,
  activeIngredient: overrides.activeIngredient,
  brandName: overrides.brandName,
  category: overrides.category,
  code: overrides.code,
  cost: overrides.cost,
});

describe('findMoleculeOverlaps', () => {
  it('returns empty report when no medicines provided', () => {
    const result = findMoleculeOverlaps([]);
    expect(result.overlaps).toEqual([]);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(0);
    expect(result.uniqueMoleculesCount).toBe(0);
    expect(result.totalInternalMeds).toBe(0);
    expect(result.totalExternalMeds).toBe(0);
  });

  it('returns empty when there are no external medicines', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
    ]);
    expect(result.overlaps).toEqual([]);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(0);
    expect(result.totalInternalMeds).toBe(1);
    expect(result.totalExternalMeds).toBe(0);
  });

  it('returns empty when external has no activeIngredient', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Mystery Box', activeIngredient: '', isExternal: true }),
    ]);
    expect(result.overlaps).toEqual([]);
  });

  it('returns empty when no molecule overlap exists', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Vitamin C 1000', activeIngredient: 'Ascorbic Acid', isExternal: true }),
    ]);
    expect(result.overlaps).toEqual([]);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(0);
    expect(result.uniqueMoleculesCount).toBe(0);
  });

  it('detects a single molecule overlap (Paracetamol)', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg Caja', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Tylenol Extra', activeIngredient: 'Paracetamol', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0].molecule).toBe('Paracetamol');
    expect(result.overlaps[0].externalMedicine.name).toBe('Tylenol Extra');
    expect(result.overlaps[0].internalMatches).toHaveLength(1);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(1);
    expect(result.uniqueMoleculesCount).toBe(1);
  });

  it('matches case- and accent-insensitively', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Ibuprofeno 400mg', activeIngredient: 'Ibuprofeno', isExternal: false }),
      med({ name: 'Advil Gel', activeIngredient: 'ibuprofeno', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0].internalMatches[0].name).toBe('Ibuprofeno 400mg');
  });

  it('matches across accent differences (Paracetamol vs Paracetamól)', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamól', isExternal: false }),
      med({ name: 'Tylenol', activeIngredient: 'Paracetamol', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(1);
  });

  it('returns all internal matches when multiple share the same molecule', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol MK 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Paracetamol Gen 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Tylenol 500mg', activeIngredient: 'Paracetamol', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0].internalMatches).toHaveLength(2);
    expect(result.uniqueMoleculesCount).toBe(1);
  });

  it('handles multiple distinct molecule overlaps', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Ibuprofeno 400mg', activeIngredient: 'Ibuprofeno', isExternal: false }),
      med({ name: 'Tylenol', activeIngredient: 'Paracetamol', isExternal: true }),
      med({ name: 'Advil', activeIngredient: 'Ibuprofeno', isExternal: true }),
      med({ name: 'Vitamin C', activeIngredient: 'Ascorbic Acid', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(2);
    expect(result.uniqueMoleculesCount).toBe(2);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(2);
  });

  it('uses canonical molecule name from internal med when present', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Amoxicilina 500mg', activeIngredient: 'Amoxicilina', isExternal: false }),
      med({ name: 'Amoxil Caps', activeIngredient: 'AMOXICILINA', isExternal: true }),
    ]);
    expect(result.overlaps[0].molecule).toBe('Amoxicilina');
  });

  it('handles whitespace-only activeIngredient gracefully', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Mystery', activeIngredient: '   ', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(0);
  });

  it('counts totalInternalMeds and totalExternalMeds correctly', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'A', activeIngredient: 'X', isExternal: false }),
      med({ name: 'B', activeIngredient: 'Y', isExternal: false }),
      med({ name: 'C', activeIngredient: 'X', isExternal: true }),
      med({ name: 'D', activeIngredient: 'Z', isExternal: true }),
    ]);
    expect(result.totalInternalMeds).toBe(2);
    expect(result.totalExternalMeds).toBe(2);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(1);
  });

  it('does not count overlap for external med with no activeIngredient', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'A', activeIngredient: 'X', isExternal: false }),
      med({ name: 'B', isExternal: true }),
    ]);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(0);
    expect(result.totalExternalMeds).toBe(1);
  });

  it('does not duplicate same external medicine with same molecule', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false }),
      med({ name: 'Tylenol A', activeIngredient: 'Paracetamol', isExternal: true }),
      med({ name: 'Tylenol B', activeIngredient: 'Paracetamol', isExternal: true }),
    ]);
    expect(result.overlaps).toHaveLength(2);
  });

  it('sorts by molecule then external medicine name', () => {
    const result = findMoleculeOverlaps([
      med({ name: 'Z', activeIngredient: 'Zinc', isExternal: false }),
      med({ name: 'A', activeIngredient: 'Aspirina', isExternal: false }),
      med({ name: 'ZincMed', activeIngredient: 'Zinc', isExternal: true }),
      med({ name: 'AspirinBrand', activeIngredient: 'Aspirina', isExternal: true }),
    ]);
    expect(result.overlaps[0].molecule).toBe('Aspirina');
    expect(result.overlaps[1].molecule).toBe('Zinc');
  });
});

describe('findMoleculeOverlapsFromPrescriptions', () => {
  const catalog: Medicine[] = [
    med({ id: 'int-1', name: 'Paracetamol 500mg', activeIngredient: 'Paracetamol', isExternal: false, stock: 100, price: 85 }),
    med({ id: 'int-2', name: 'Ibuprofeno 400mg', activeIngredient: 'Ibuprofeno', isExternal: false, stock: 50, price: 120 }),
    med({ id: 'ext-1', name: 'Tylenol Extra', activeIngredient: 'Paracetamol', isExternal: true }),
    med({ id: 'ext-2', name: 'Advil Gel', activeIngredient: 'Ibuprofeno', isExternal: true }),
    med({ id: 'ext-3', name: 'Vitamin C', activeIngredient: 'Ascorbic Acid', isExternal: true }),
  ];

  it('returns empty when no prescription items provided', () => {
    const result = findMoleculeOverlapsFromPrescriptions([], catalog);
    expect(result.overlaps).toEqual([]);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(0);
    expect(result.totalInternalMeds).toBe(2);
    expect(result.totalExternalMeds).toBe(0);
  });

  it('detects overlap only for prescribed external medicines', () => {
    const prescribed = [
      { name: 'Tylenol Extra', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0].externalMedicine.name).toBe('Tylenol Extra');
    expect(result.overlaps[0].internalMatches[0].stock).toBe(100);
  });

  it('excludes non-prescribed external medicines from overlap', () => {
    const prescribed = [
      { name: 'Advil Gel', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0].externalMedicine.name).toBe('Advil Gel');
    expect(result.overlaps[0].molecule).toBe('Ibuprofeno');
  });

  it('returns empty when prescribed external has no overlap with internal', () => {
    const prescribed = [
      { name: 'Vitamin C', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(0);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(0);
    expect(result.totalExternalMeds).toBe(1);
  });

  it('ignores internal items in prescription list (only external matter)', () => {
    const prescribed = [
      { name: 'Paracetamol 500mg', isExternal: false },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(0);
    expect(result.totalExternalMeds).toBe(0);
  });

  it('handles multiple prescribed external medicines', () => {
    const prescribed = [
      { name: 'Tylenol Extra', isExternal: true },
      { name: 'Advil Gel', isExternal: true },
      { name: 'Vitamin C', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(2);
    expect(result.totalExternalMedsWithInternalMolecule).toBe(2);
  });

  it('preserves internal stock and price from catalog', () => {
    const prescribed = [
      { name: 'Tylenol Extra', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps[0].internalMatches[0].stock).toBe(100);
    expect(result.overlaps[0].internalMatches[0].price).toBe(85);
  });

  it('matches case-insensitively by medicine name', () => {
    const prescribed = [
      { name: 'tylenol extra', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(1);
  });

  it('returns empty when prescribed external name not found in catalog', () => {
    const prescribed = [
      { name: 'NonExistent Med', isExternal: true },
    ];
    const result = findMoleculeOverlapsFromPrescriptions(prescribed, catalog);
    expect(result.overlaps).toHaveLength(0);
    expect(result.totalExternalMeds).toBe(0);
  });
});
