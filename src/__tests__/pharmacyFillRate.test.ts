import { describe, it, expect } from 'vitest';
import {
  buildInventoryStockIndex,
  calculateRecipeFillRate,
  bucketize,
  calculatePharmacyFillRate,
  FillBucket,
} from '../utils/pharmacyFillRate';
import { Medicine, PrescriptionItem } from '../types';

const med = (overrides: Partial<Medicine>): Medicine => ({
  id: 'med-1',
  name: 'Paracetamol 500mg',
  stock: 100,
  units_per_box: 1,
  price: 10,
  presentation: 'Caja',
  isExternal: false,
  ...overrides,
});

const item = (overrides: Partial<PrescriptionItem>): PrescriptionItem => ({
  medId: 'med-1',
  name: 'Paracetamol 500mg',
  quantity: 1,
  dosage: '500mg',
  duration_days: '7',
  isExternal: false,
  ...overrides,
});

describe('buildInventoryStockIndex', () => {
  it('builds an index keyed by normalized name', () => {
    const idx = buildInventoryStockIndex([med({ name: 'Paracetamol 500mg', stock: 50 })]);
    expect(idx.get('paracetamol 500mg')?.stock).toBe(50);
  });

  it('excludes external medicines from the index', () => {
    const idx = buildInventoryStockIndex([med({ name: 'Externo 1', isExternal: true, stock: 999 })]);
    expect(idx.size).toBe(0);
  });

  it('handles empty inventory', () => {
    expect(buildInventoryStockIndex([]).size).toBe(0);
  });
});

describe('calculateRecipeFillRate', () => {
  it('returns null for empty prescription', () => {
    expect(calculateRecipeFillRate([], new Map())).toBeNull();
  });

  it('returns 1.0 when all items fully fillable', () => {
    const stockIndex = new Map([['paracetamol 500mg', med({ name: 'Paracetamol 500mg', stock: 100 })]]);
    const rate = calculateRecipeFillRate([item({ quantity: 1 })], stockIndex);
    expect(rate).toBe(1.0);
  });

  it('returns 0 when all items not in inventory', () => {
    const stockIndex = new Map();
    const rate = calculateRecipeFillRate([item({ name: 'X' }), item({ name: 'Y' })], stockIndex);
    expect(rate).toBe(0);
  });

  it('returns partial rate when stock < quantity', () => {
    // 2 out of 4 units = 0.5 for this item; 1 of 1 = 1; avg = 0.75
    const stockIndex = new Map([
      ['paracetamol 500mg', med({ name: 'Paracetamol 500mg', stock: 2 })],
      ['ibuprofeno 400mg', med({ name: 'Ibuprofeno 400mg', stock: 1 })],
    ]);
    const rate = calculateRecipeFillRate([
      item({ name: 'Paracetamol 500mg', quantity: 4 }),
      item({ name: 'Ibuprofeno 400mg', medId: 'med-2', quantity: 1 }),
    ], stockIndex);
    expect(rate).toBeCloseTo(0.75, 5);
  });

  it('external items count as 0 (not fillable from our inventory)', () => {
    const stockIndex = new Map([['paracetamol 500mg', med({ stock: 100 })]]);
    const rate = calculateRecipeFillRate([
      item({ quantity: 1 }), // internal, fillable
      item({ name: 'Externo', medId: 'ext-1', isExternal: true, quantity: 1 }), // external, not fillable
    ], stockIndex);
    expect(rate).toBe(0.5);
  });

  it('handles stock=0 as not fillable', () => {
    const stockIndex = new Map([['paracetamol 500mg', med({ stock: 0 })]]);
    const rate = calculateRecipeFillRate([item({ quantity: 1 })], stockIndex);
    expect(rate).toBe(0);
  });
});

describe('bucketize', () => {
  it('returns 100% for rate >= 1.0', () => {
    expect(bucketize(1.0)).toBe<FillBucket>('100%');
    expect(bucketize(1.5)).toBe<FillBucket>('100%');
  });
  it('returns 75-99% for rate 0.75-0.99', () => {
    expect(bucketize(0.75)).toBe<FillBucket>('75-99%');
    expect(bucketize(0.99)).toBe<FillBucket>('75-99%');
  });
  it('returns 50-74% for rate 0.5-0.74', () => {
    expect(bucketize(0.5)).toBe<FillBucket>('50-74%');
    expect(bucketize(0.74)).toBe<FillBucket>('50-74%');
  });
  it('returns 25-49% for rate 0.25-0.49', () => {
    expect(bucketize(0.25)).toBe<FillBucket>('25-49%');
    expect(bucketize(0.49)).toBe<FillBucket>('25-49%');
  });
  it('returns 0-24% for rate < 0.25', () => {
    expect(bucketize(0.0)).toBe<FillBucket>('0-24%');
    expect(bucketize(0.1)).toBe<FillBucket>('0-24%');
    expect(bucketize(0.24)).toBe<FillBucket>('0-24%');
  });
});

describe('calculatePharmacyFillRate', () => {
  it('returns all zeros for no consultations', () => {
    const r = calculatePharmacyFillRate([], []);
    expect(r.totalRecipes).toBe(0);
    expect(r.uniqueMedicinesPrescribed).toBe(0);
    expect(r.averageRate).toBe(0);
    expect(r.buckets['100%']).toBe(0);
  });

  it('counts unique medicines (not instances)', () => {
    // Same med "Paracetamol 500mg" prescribed 3 times = 1 unique
    const consultations = [
      { prescription: [item({ quantity: 1 }), item({ quantity: 2 })] },
      { prescription: [item({ quantity: 1 })] },
    ];
    const r = calculatePharmacyFillRate(consultations, []);
    expect(r.uniqueMedicinesPrescribed).toBe(1);
    expect(r.totalItemsPrescribed).toBe(4); // 1+2+1
    expect(r.totalRecipes).toBe(2);
  });

  it('separates internal vs external unique counts', () => {
    const consultations = [
      { prescription: [
        item({ name: 'Paracetamol 500mg' }), // internal
        item({ name: 'Aspirina', isExternal: true, medId: 'ext-1' }), // external
      ]},
    ];
    const r = calculatePharmacyFillRate(consultations, []);
    expect(r.uniqueMedicinesPrescribed).toBe(2);
    expect(r.uniqueMedicinesInternal).toBe(1);
    expect(r.uniqueMedicinesExternal).toBe(1);
  });

  it('skips consultations without prescription', () => {
    const consultations = [
      { prescription: [] },
      { prescription: undefined },
      { prescription: [item({ quantity: 1 })] },
    ];
    const r = calculatePharmacyFillRate(consultations, []);
    expect(r.totalRecipes).toBe(1);
  });

  it('buckets recipes correctly based on fill rate', () => {
    const inventory = [
      med({ name: 'Paracetamol 500mg', stock: 100 }),
      med({ name: 'Ibuprofeno 400mg', stock: 5 }),
    ];
    const consultations = [
      { prescription: [item({ name: 'Paracetamol 500mg', quantity: 1 })] }, // 100%
      { prescription: [item({ name: 'Ibuprofeno 400mg', quantity: 10 })] }, // 5/10 = 50%
      { prescription: [item({ name: 'X', medId: 'med-x', quantity: 1 })] }, // not in inventory = 0%
    ];
    const r = calculatePharmacyFillRate(consultations, inventory);
    expect(r.buckets['100%']).toBe(1);
    expect(r.buckets['50-74%']).toBe(1);
    expect(r.buckets['0-24%']).toBe(1);
  });

  it('builds topPrescribed with current stock', () => {
    const inventory = [med({ name: 'Paracetamol 500mg', stock: 42 })];
    const consultations = [
      { prescription: [item({ name: 'Paracetamol 500mg' })] },
    ];
    const r = calculatePharmacyFillRate(consultations, inventory);
    expect(r.topPrescribed).toHaveLength(1);
    expect(r.topPrescribed[0].name).toBe('Paracetamol 500mg');
    expect(r.topPrescribed[0].count).toBe(1);
    expect(r.topPrescribed[0].currentStock).toBe(42);
    expect(r.topPrescribed[0].isExternal).toBe(false);
  });

  it('averages fill rate across all recipes', () => {
    const inventory = [med({ name: 'Paracetamol 500mg', stock: 100 })];
    const consultations = [
      { prescription: [item({ quantity: 1 })] }, // 100%
      { prescription: [item({ quantity: 1 })] }, // 100%
    ];
    const r = calculatePharmacyFillRate(consultations, inventory);
    expect(r.averageRate).toBe(1.0);
  });

  it('marks external items as not fillable (0%)', () => {
    const consultations = [
      { prescription: [item({ name: 'X', isExternal: true, medId: 'ext-1' })] },
    ];
    const r = calculatePharmacyFillRate(consultations, []);
    expect(r.buckets['0-24%']).toBe(1);
  });
});
