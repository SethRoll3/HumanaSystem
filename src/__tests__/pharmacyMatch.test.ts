import { describe, it, expect } from 'vitest';
import {
  performPharmacyMatch,
  patientNamesMatch,
} from '../services/pharmacyMatchService';
import { PharmacySaleRow } from '../services/pharmacySalesService';
import { Consultation } from '../types';

describe('patientNamesMatch', () => {
  it('matches same name different order', () => {
    expect(patientNamesMatch('RAMIREZ ESTRADA EDGAR ROBERTO', 'Edgar Roberto Ramírez Estrada')).toBe(true);
  });

  it('matches same name same order', () => {
    expect(patientNamesMatch('RAMIREZ ESTRADA EDGAR', 'Ramirez Estrada Edgar')).toBe(true);
  });

  it('matches with partial overlap', () => {
    expect(patientNamesMatch('GARCIA OR BRIAN', 'Brian Garcia')).toBe(true);
  });

  it('does not match completely different names', () => {
    expect(patientNamesMatch('RAMIREZ ESTRADA EDGAR', 'LOPEZ SANCHEZ MARIA')).toBe(false);
  });

  it('handles empty strings', () => {
    expect(patientNamesMatch('', 'Edgar')).toBe(false);
    expect(patientNamesMatch('Edgar', '')).toBe(false);
  });

  it('matches names with commas', () => {
    expect(patientNamesMatch('SUSANA BEATRIZ, PATZAN COTZOJAY', 'Patzan Cotzojay Susana Beatriz')).toBe(true);
  });
});

describe('performPharmacyMatch', () => {
  const createSale = (overrides: Partial<PharmacySaleRow> = {}): PharmacySaleRow => ({
    dateMs: new Date('2026-05-08').getTime(),
    patientName: 'EDGAR RAMIREZ',
    product: 'Acetaminofen 500 Mg',
    productCode: 'FAR00001',
    quantity: 2,
    total: 100,
    sellerName: 'Juan Carlos',
    documentNumber: 19782,
    isDiscount: false,
    ...overrides,
  });

  const createConsultation = (overrides: Partial<Consultation> = {}): Consultation => ({
    id: 'cons1',
    status: 'finished',
    patientId: 'pat1',
    patientName: 'Edgar Ramirez',
    doctorId: 'doc1',
    doctorName: 'Dr. Mimo',
    date: new Date('2026-05-08').getTime(),
    prescription: [
      { medId: 'med1', name: 'Acetaminofen 500 Mg', quantity: 1, dosage: '500mg', duration_days: 7, isExternal: false },
    ],
    ...overrides,
  });

  it('matches patient + medication correctly', () => {
    const sales = [createSale()];
    const consultations = [createConsultation()];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.matched.length).toBe(1);
    expect(result.matched[0].productName).toBe('Acetaminofen 500 Mg');
    expect(result.matched[0].patientName).toBe('Edgar Ramirez');
    expect(result.matched[0].doctorName).toBe('Dr. Mimo');
    expect(result.matched[0].soldQuantity).toBe(2);
    expect(result.matched[0].prescribedQuantity).toBe(1);
  });

  it('identifies sold without prescription', () => {
    const sales = [createSale({ product: 'Ibuprofeno', productCode: 'FAR00002' })];
    const consultations = [createConsultation()];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.soldOnly.length).toBe(1);
    expect(result.soldOnly[0].productName).toBe('Ibuprofeno');
    expect(result.matched.length).toBe(0);
  });

  it('identifies prescribed without sale', () => {
    const sales: PharmacySaleRow[] = [];
    const consultations = [createConsultation()];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.prescribedOnly.length).toBe(1);
    expect(result.prescribedOnly[0].productName).toBe('Acetaminofen 500 Mg');
  });

  it('excludes non-medication products (LAB*, CIR*, DES)', () => {
    const sales = [
      createSale({ productCode: 'LAB0027', product: 'Creatinina' }),
      createSale({ productCode: 'CIR009', product: 'Cirugía de Tumor' }),
      createSale({ productCode: 'DES', product: '', isDiscount: true }),
    ];
    const consultations = [createConsultation()];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.totalSalesItems).toBe(0);
    expect(result.matched.length).toBe(0);
    expect(result.soldOnly.length).toBe(0);
  });

  it('counts discounts separately', () => {
    const sales = [
      createSale(),
      createSale({ productCode: 'DES', product: '', isDiscount: true, total: 50 }),
    ];
    const consultations = [createConsultation()];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.totalDiscounts).toBe(1);
    expect(result.discountAmount).toBe(50);
  });

  it('builds patient breakdown', () => {
    const sales = [createSale()];
    const consultations = [createConsultation()];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.patientBreakdown.length).toBe(1);
    expect(result.patientBreakdown[0].patientName).toBe('Edgar Ramirez');
    expect(result.patientBreakdown[0].matchedCount).toBe(1);
  });

  it('handles multiple patients', () => {
    const sales = [
      createSale({ patientName: 'EDGAR RAMIREZ', product: 'Acetaminofen', productCode: 'FAR00001' }),
      createSale({ patientName: 'MARIA LOPEZ', product: 'Ibuprofeno', productCode: 'FAR00002' }),
    ];
    const consultations = [
      createConsultation({ patientName: 'Edgar Ramirez', prescription: [{ medId: '1', name: 'Acetaminofen', quantity: 1, dosage: '', duration_days: 7, isExternal: false }] }),
      createConsultation({ id: 'cons2', patientId: 'pat2', patientName: 'Maria Lopez', prescription: [{ medId: '2', name: 'Ibuprofeno', quantity: 1, dosage: '', duration_days: 7, isExternal: false }] }),
    ];
    const medicineIndex = new Map();

    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.matched.length).toBe(2);
    expect(result.patientBreakdown.length).toBe(2);
  });

  it('returns empty result for empty sales', () => {
    const result = performPharmacyMatch([], [], new Map());
    expect(result.totalSalesItems).toBe(0);
    expect(result.totalPrescriptionItems).toBe(0);
    expect(result.internalPrescriptionItems).toBe(0);
    expect(result.matched.length).toBe(0);
    expect(result.completePrescriptionsCount).toBe(0);
    expect(result.completePrescriptionsRate).toBe(0);
    expect(result.prescriptionsWithInternalMeds).toBe(0);
    expect(result.totalConsultationsWithPrescription).toBe(0);
    expect(result.externalSalesDetected.length).toBe(0);
  });

  it('calculates match rate correctly', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 2 }),
    ];
    const consultations = [
      createConsultation({
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 3, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
    ];
    const result = performPharmacyMatch(sales, consultations, new Map());
    expect(result.totalSalesItems).toBe(2);
    expect(result.totalPrescriptionItems).toBe(3);
    expect(result.matched.length).toBe(1);
  });

  it('marks prescription as complete when all items fully sold', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 5 }),
    ];
    const consultations = [
      createConsultation({
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 3, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
    ];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: false, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.completePrescriptionsCount).toBe(1);
    expect(result.completePrescriptionsRate).toBe(1);
  });

  it('marks prescription as incomplete when items not fully sold', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 1 }),
    ];
    const consultations = [
      createConsultation({
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 3, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
    ];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: false, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.completePrescriptionsCount).toBe(0);
    expect(result.completePrescriptionsRate).toBe(0);
  });

  it('counts prescriptions with internal meds correctly', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 2 }),
    ];
    const consultations = [
      createConsultation({
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 2, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
    ];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: false, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.prescriptionsWithInternalMeds).toBe(1);
  });

  it('does not count prescriptions with external meds as internal', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 2 }),
    ];
    const consultations = [
      createConsultation({
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 2, dosage: '', duration_days: 7, isExternal: true },
        ],
      }),
    ];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: true, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.prescriptionsWithInternalMeds).toBe(0);
  });

  it('counts internalPrescriptionItems only for items marked internal', () => {
    const consultations = [
      createConsultation({
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 3, dosage: '', duration_days: 7, isExternal: false },
          { medId: '2', name: 'Ibuprofeno', quantity: 2, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
    ];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: false, activeIngredient: '', provider: '' });
    medicineIndex.set('ibuprofeno', { name: 'Ibuprofeno', isExternal: true, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch([], consultations, medicineIndex);
    expect(result.internalPrescriptionItems).toBe(3);
    expect(result.totalPrescriptionItems).toBe(5);
  });

  it('counts totalConsultationsWithPrescription correctly', () => {
    const consultations = [
      createConsultation({
        id: 'c1', patientId: 'p1', patientName: 'Patient One',
        prescription: [
          { medId: '1', name: 'Acetaminofen', quantity: 1, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
      createConsultation({
        id: 'c2', patientId: 'p2', patientName: 'Patient Two',
        prescription: [
          { medId: '1', name: 'Ibuprofeno', quantity: 1, dosage: '', duration_days: 7, isExternal: true },
        ],
      }),
      createConsultation({
        id: 'c3', patientId: 'p3', patientName: 'Patient Three',
        prescription: [
          { medId: '1', name: 'Aspirina', quantity: 1, dosage: '', duration_days: 7, isExternal: false },
        ],
      }),
    ];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: false, activeIngredient: '', provider: '' });
    medicineIndex.set('ibuprofeno', { name: 'Ibuprofeno', isExternal: true, activeIngredient: '', provider: '' });
    medicineIndex.set('aspirina', { name: 'Aspirina', isExternal: false, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch([], consultations, medicineIndex);
    expect(result.totalConsultationsWithPrescription).toBe(2);
  });

  it('detects external sales of products not in catalog', () => {
    const sales = [
      createSale({ product: 'Medicamento Desconocido', productCode: 'FAR00999', quantity: 2 }),
    ];
    const consultations: Consultation[] = [];
    const result = performPharmacyMatch(sales, consultations, new Map());
    expect(result.externalSalesDetected.length).toBe(1);
    expect(result.externalSalesDetected[0].reason).toBe('not-in-catalog');
    expect(result.externalSalesDetected[0].productName).toBe('Medicamento Desconocido');
  });

  it('detects external sales of products marked as external in catalog', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 2 }),
    ];
    const consultations: Consultation[] = [];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: true, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.externalSalesDetected.length).toBe(1);
    expect(result.externalSalesDetected[0].reason).toBe('marked-external');
  });

  it('does not flag internal products in externalSalesDetected', () => {
    const sales = [
      createSale({ product: 'Acetaminofen', productCode: 'FAR00001', quantity: 2 }),
    ];
    const consultations: Consultation[] = [];
    const medicineIndex = new Map();
    medicineIndex.set('acetaminofen', { name: 'Acetaminofen', isExternal: false, activeIngredient: '', provider: '' });
    const result = performPharmacyMatch(sales, consultations, medicineIndex);
    expect(result.externalSalesDetected.length).toBe(0);
  });
});
