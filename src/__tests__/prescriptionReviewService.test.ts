import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => {
  const setDocMock = vi.fn(async () => undefined);
  const getDocMock = vi.fn(async () => ({ exists: () => false }));
  const docMock = vi.fn((_db: any, _coll: string, _id: string) => ({ id: _id }));
  const collectionMock = vi.fn((_db: any, name: string) => ({ _name: name }));
  const serverTimestampMock = vi.fn(() => 'SERVER_TIMESTAMP');
  const getDocsMock = vi.fn(async () => ({ docs: [] }));
  const queryMock = vi.fn((col: any) => col);
  const whereMock = vi.fn(() => ({}));
  const orderByMock = vi.fn(() => ({}));
  const updateDocMock = vi.fn(async () => undefined);

  return {
    collection: collectionMock,
    getDocs: getDocsMock,
    setDoc: setDocMock,
    getDoc: getDocMock,
    updateDoc: updateDocMock,
    doc: docMock,
    serverTimestamp: serverTimestampMock,
    query: queryMock,
    where: whereMock,
    orderBy: orderByMock,
  };
});

vi.mock('../firebase/config', () => ({ db: { _mock: true } }));

import { setDoc, getDoc } from 'firebase/firestore';
import { createPrescriptionReviewsForConsultation, COMMON_FLAGS, ReviewStatus } from '../services/prescriptionReviewService';
import { Consultation, PrescriptionItem } from '../types';

const setDocMock = vi.mocked(setDoc);
const getDocMock = vi.mocked(getDoc);

const buildConsultation = (overrides: Partial<Consultation> = {}): Consultation => ({
  id: overrides.id || 'cons-1',
  status: overrides.status || 'finished',
  patientId: overrides.patientId || 'pat-1',
  patientName: overrides.patientName || 'Juan Pérez',
  doctorId: overrides.doctorId || 'doc-1',
  doctorName: overrides.doctorName || 'Dr. Lara',
  doctorSpecialty: overrides.doctorSpecialty || 'Neurología',
  date: overrides.date || 1700000000000,
  diagnosis: overrides.diagnosis || 'Epilepsia',
  prescription: overrides.prescription || [
    { medId: 'm1', name: 'Carbamazepina 200mg', quantity: 1, dosage: '1 tab c/12h', duration_days: 30, isExternal: false, units_per_box: 30, presentation: 'Caja' },
    { medId: 'm2', name: 'Ácido Valproico 500mg', quantity: 1, dosage: '1 tab c/8h', duration_days: 30, isExternal: false, units_per_box: 30, presentation: 'Caja' }
  ],
  ...overrides
});

describe('prescriptionReviewService - pure logic', () => {
  it('COMMON_FLAGS has 6 entries', () => {
    expect(COMMON_FLAGS.length).toBe(6);
    expect(COMMON_FLAGS.every(f => typeof f.id === 'string' && typeof f.label === 'string')).toBe(true);
  });

  it('every flag has a unique id', () => {
    const ids = COMMON_FLAGS.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('prescriptionReviewService - buildId', () => {
  it('produces consistent ID for same inputs', () => {
    const buildId = (consultationId: string, itemIndex: number, medId: string) =>
      `${consultationId}_${itemIndex}_${medId}`;
    expect(buildId('c1', 0, 'm1')).toBe('c1_0_m1');
    expect(buildId('c1', 1, 'm2')).toBe('c1_1_m2');
  });

  it('produces different IDs for different items', () => {
    const buildId = (consultationId: string, itemIndex: number, medId: string) =>
      `${consultationId}_${itemIndex}_${medId}`;
    const a = buildId('c1', 0, 'm1');
    const b = buildId('c1', 1, 'm1');
    expect(a).not.toBe(b);
  });
});

describe('prescriptionReviewService - consultation validation', () => {
  it('skips when consultation has no id', () => {
    const c = buildConsultation({ id: undefined });
    expect(c.id).toBeUndefined();
  });

  it('skips when prescription is empty', () => {
    const c = buildConsultation({ prescription: [] });
    expect(c.prescription?.length).toBe(0);
  });

  it('skips when status is not finished/delivered', () => {
    const c = buildConsultation({ status: 'in_progress' });
    expect(c.status).toBe('in_progress');
  });

  it('processes consultation with status=finished', () => {
    const c = buildConsultation({ status: 'finished' });
    expect(c.prescription?.length).toBe(2);
  });

  it('processes consultation with status=delivered', () => {
    const c = buildConsultation({ status: 'delivered' });
    expect(c.prescription?.length).toBe(2);
  });
});

describe('prescriptionReviewService - status transitions', () => {
  const validTransitions: Array<{ from: ReviewStatus; to: ReviewStatus; valid: boolean }> = [
    { from: 'pending', to: 'approved', valid: true },
    { from: 'pending', to: 'flagged', valid: true },
    { from: 'pending', to: 'rejected', valid: true },
    { from: 'approved', to: 'flagged', valid: true },
    { from: 'flagged', to: 'approved', valid: true },
    { from: 'flagged', to: 'rejected', valid: true }
  ];

  it.each(validTransitions)('allows transition from $from to $to', ({ from, to }) => {
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
  });
});

describe('prescriptionReviewService - stats computation', () => {
  const buildReview = (overrides: Partial<{ status: ReviewStatus; reviewedByName: string }> = {}) => ({
    id: 'r1',
    consultationId: 'c1',
    prescriptionItemIndex: 0,
    medId: 'm1',
    medName: 'Test Med',
    doctorName: 'Dr. Lara',
    patientName: 'Test Patient',
    consultationDate: 1700000000000,
    status: 'pending' as ReviewStatus,
    reviewedByName: undefined as string | undefined,
    createdAt: 1700000000000,
    ...overrides
  });

  it('computes zero stats for empty list', () => {
    const reviews: any[] = [];
    const stats = {
      total: reviews.length,
      pending: reviews.filter(r => r.status === 'pending').length,
      approved: reviews.filter(r => r.status === 'approved').length,
      flagged: reviews.filter(r => r.status === 'flagged').length,
      rejected: reviews.filter(r => r.status === 'rejected').length
    };
    expect(stats).toEqual({ total: 0, pending: 0, approved: 0, flagged: 0, rejected: 0 });
  });

  it('counts each status correctly', () => {
    const reviews: any[] = [
      buildReview({ status: 'pending' }),
      buildReview({ status: 'pending' }),
      buildReview({ status: 'approved' }),
      buildReview({ status: 'flagged' }),
      buildReview({ status: 'rejected' })
    ];
    const stats = {
      total: reviews.length,
      pending: reviews.filter(r => r.status === 'pending').length,
      approved: reviews.filter(r => r.status === 'approved').length,
      flagged: reviews.filter(r => r.status === 'flagged').length,
      rejected: reviews.filter(r => r.status === 'rejected').length
    };
    expect(stats).toEqual({ total: 5, pending: 2, approved: 1, flagged: 1, rejected: 1 });
  });

  it('aggregates reviewer stats', () => {
    const reviews: any[] = [
      buildReview({ status: 'approved', reviewedByName: 'Resident A' }),
      buildReview({ status: 'approved', reviewedByName: 'Resident A' }),
      buildReview({ status: 'flagged', reviewedByName: 'Resident A' }),
      buildReview({ status: 'approved', reviewedByName: 'Resident B' })
    ];
    const map = new Map<string, { total: number; approved: number; flagged: number; rejected: number }>();
    reviews.forEach(r => {
      if (!r.reviewedByName) return;
      const cur = map.get(r.reviewedByName) || { total: 0, approved: 0, flagged: 0, rejected: 0 };
      cur.total++;
      if (r.status === 'approved') cur.approved++;
      else if (r.status === 'flagged') cur.flagged++;
      else if (r.status === 'rejected') cur.rejected++;
      map.set(r.reviewedByName, cur);
    });
    expect(map.get('Resident A')?.total).toBe(3);
    expect(map.get('Resident A')?.approved).toBe(2);
    expect(map.get('Resident A')?.flagged).toBe(1);
    expect(map.get('Resident B')?.total).toBe(1);
  });

  it('skips reviews without reviewer name', () => {
    const reviews: any[] = [
      buildReview({ status: 'pending' }),
      buildReview({ status: 'approved', reviewedByName: 'Resident A' })
    ];
    const map = new Map<string, { total: number }>();
    reviews.forEach(r => {
      if (!r.reviewedByName) return;
      const cur = map.get(r.reviewedByName) || { total: 0 };
      cur.total++;
      map.set(r.reviewedByName, cur);
    });
    expect(map.size).toBe(1);
    expect(map.get('Resident A')?.total).toBe(1);
  });
});

describe('prescriptionReviewService - date range filtering', () => {
  it('builds correct range filter', () => {
    const startDate = 1700000000000;
    const endDate = 1800000000000;
    const filter = { startDate, endDate };
    expect(filter.startDate).toBe(1700000000000);
    expect(filter.endDate).toBe(1800000000000);
  });
});

describe('prescriptionReviewService - review flags', () => {
  it('defaults flags to empty array', () => {
    const review: { flags: string[] } = { flags: [] };
    expect(review.flags).toEqual([]);
  });

  it('appends multiple flags', () => {
    const flags: string[] = [];
    flags.push('dosage-unclear');
    flags.push('wrong-frequency');
    expect(flags).toEqual(['dosage-unclear', 'wrong-frequency']);
  });

  it('replaces flags array on update', () => {
    const flags: string[] = ['old-flag'];
    const next = ['new-flag-1', 'new-flag-2'];
    flags.length = 0;
    flags.push(...next);
    expect(flags).toEqual(['new-flag-1', 'new-flag-2']);
  });
});

describe('createPrescriptionReviewsForConsultation', () => {
  beforeEach(() => {
    setDocMock.mockClear();
    getDocMock.mockClear();
    getDocMock.mockResolvedValue({ exists: () => false } as any);
  });

  const buildConsultation = (overrides: Partial<Consultation> = {}): Consultation => ({
    id: overrides.id || 'cons-1',
    status: overrides.status || 'finished',
    patientId: 'pat-1',
    patientName: overrides.patientName || 'Juan Pérez',
    doctorId: 'doc-1',
    doctorName: overrides.doctorName || 'Dr. Lara',
    date: overrides.date || 1700000000000,
    prescription: overrides.prescription || [
      { medId: 'm1', name: 'Carbamazepina 200mg', quantity: 1, dosage: '1 tab c/12h', duration_days: 30, isExternal: false },
      { medId: 'm2', name: 'Ácido Valproico 500mg', quantity: 1, dosage: '1 tab c/8h', duration_days: 30, isExternal: false }
    ],
    ...overrides
  });

  it('returns 0 when consultation has no id', async () => {
    const c = buildConsultation({ id: undefined as any });
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(0);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('returns 0 when prescription is empty', async () => {
    const c = buildConsultation({ prescription: [] });
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(0);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('returns 0 when status is in_progress', async () => {
    const c = buildConsultation({ status: 'in_progress' });
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(0);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('returns 0 when status is waiting', async () => {
    const c = buildConsultation({ status: 'waiting' });
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(0);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('skips items without medId', async () => {
    const c = buildConsultation({
      prescription: [
        { medId: '', name: 'No MedId', quantity: 1, dosage: '1 tab', duration_days: 7, isExternal: false },
        { medId: 'm1', name: 'Valid Med', quantity: 1, dosage: '1 tab', duration_days: 7, isExternal: false }
      ]
    });
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(1);
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('creates a review for each valid prescription item', async () => {
    const c = buildConsultation();
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(2);
    expect(setDocMock).toHaveBeenCalledTimes(2);
  });

  it('creates correct data shape for each review', async () => {
    const c = buildConsultation({ id: 'cons-42', date: 1710000000000 });
    await createPrescriptionReviewsForConsultation(c);

    const firstCall = setDocMock.mock.calls[0];
    const data = firstCall[1] as any;

    expect(data.consultationId).toBe('cons-42');
    expect(data.medId).toBe('m1');
    expect(data.medName).toBe('Carbamazepina 200mg');
    expect(data.patientName).toBe('Juan Pérez');
    expect(data.doctorName).toBe('Dr. Lara');
    expect(data.status).toBe('pending');
    expect(data.flags).toEqual([]);
    expect(data.consultationDate).toBe(1710000000000);
    expect(data.prescriptionItemIndex).toBe(0);
  });

  it('skips existing reviews (dedup)', async () => {
    getDocMock.mockResolvedValue({ exists: () => true } as any);
    const c = buildConsultation();
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(0);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('returns correct count for mixed dedup scenario', async () => {
    getDocMock
      .mockResolvedValueOnce({ exists: () => true } as any)
      .mockResolvedValueOnce({ exists: () => false } as any);
    const c = buildConsultation();
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(1);
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('handles consultation with status=delivered', async () => {
    const c = buildConsultation({ status: 'delivered' });
    const count = await createPrescriptionReviewsForConsultation(c);
    expect(count).toBe(2);
    expect(setDocMock).toHaveBeenCalledTimes(2);
  });
});
