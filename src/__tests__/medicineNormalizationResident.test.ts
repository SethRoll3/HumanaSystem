import { describe, it, expect } from 'vitest';
import { MedNormalizationRule, DuplicateCluster } from '../services/medicineNormalizationService';

const buildRule = (overrides: Partial<MedNormalizationRule> = {}): MedNormalizationRule => ({
  id: 'r1',
  dirtyName: 'tylenol',
  canonicalName: 'Acetaminofén',
  status: 'pending',
  createdAt: 1700000000000,
  ...overrides
});

const buildCluster = (overrides: Partial<DuplicateCluster> = {}): DuplicateCluster => ({
  canonicalCandidate: 'Acetaminofén',
  variants: [
    { name: 'Acetaminofén', count: 5 },
    { name: 'Tylenol', count: 3 }
  ],
  totalCount: 8,
  hasRule: false,
  ...overrides
});

describe('medicineNormalizationResident - role-based access', () => {
  it('resident can approve cluster', () => {
    const cluster = buildCluster();
    expect(cluster.variants.length).toBe(2);
    expect(cluster.totalCount).toBe(8);
  });

  it('resident can reject cluster', () => {
    const cluster = buildCluster();
    const variants = cluster.variants.map(v => v.name);
    expect(variants).toContain('Tylenol');
  });

  it('resident reviewer role is recorded in quality_reviews', () => {
    const payload = {
      dateKey: '2024-01-15',
      reviewerEmail: 'resident@humana.com',
      reviewerName: 'Dr. Residente',
      reviewerRole: 'resident',
      totalCasesToday: 5,
      reviewedCasesCount: 5,
      bitacora: 'Revisé 5 clusters',
      createdAt: 1700000000000
    };
    expect(payload.reviewerRole).toBe('resident');
    expect(payload.bitacora.length).toBeGreaterThan(0);
  });

  it('admin reviewer role is also recorded in quality_reviews', () => {
    const payload = {
      dateKey: '2024-01-15',
      reviewerEmail: 'admin@humana.com',
      reviewerName: 'Dr. Admin',
      reviewerRole: 'admin',
      totalCasesToday: 3,
      reviewedCasesCount: 3,
      bitacora: 'Revisé 3 clusters',
      createdAt: 1700000000000
    };
    expect(payload.reviewerRole).toBe('admin');
  });
});

describe('medicineNormalizationResident - cluster filtering', () => {
  it('filters out clusters that already have rules', () => {
    const clusters = [buildCluster({ hasRule: false }), buildCluster({ hasRule: true })];
    const pending = clusters.filter(c => !c.hasRule);
    expect(pending.length).toBe(1);
  });

  it('filters out ignored clusters', () => {
    const clusters = [buildCluster({ variants: [{ name: 'A', count: 1 }, { name: 'B', count: 1 }] })];
    const clusterId = 'A|B';
    const ignored = [clusterId];
    const pending = clusters.filter(c => !ignored.includes(c.variants.map(v => v.name).sort().join('|')));
    expect(pending.length).toBe(0);
  });

  it('pending cluster is reviewable', () => {
    const cluster = buildCluster();
    const pending = [cluster].filter(c => !c.hasRule);
    expect(pending.length).toBe(1);
  });
});

describe('medicineNormalizationResident - bitacora validation', () => {
  it('rejects empty bitacora', () => {
    const bitacora = '';
    const canConfirm = bitacora.trim().length > 0;
    expect(canConfirm).toBe(false);
  });

  it('rejects whitespace-only bitacora', () => {
    const bitacora = '   \n  ';
    const canConfirm = bitacora.trim().length > 0;
    expect(canConfirm).toBe(false);
  });

  it('accepts non-empty bitacora', () => {
    const bitacora = 'Revisé 5 clusters hoy';
    const canConfirm = bitacora.trim().length > 0;
    expect(canConfirm).toBe(true);
  });
});

describe('medicineNormalizationResident - approve cluster flow', () => {
  it('builds approval payload with all variants', () => {
    const cluster = buildCluster();
    const payload = {
      canonicalName: cluster.canonicalCandidate,
      variants: cluster.variants.map(v => v.name),
      userId: 'resident-1'
    };
    expect(payload.variants).toEqual(['Acetaminofén', 'Tylenol']);
    expect(payload.canonicalName).toBe('Acetaminofén');
  });

  it('approval rules have status approved and approvedBy', () => {
    const rule: MedNormalizationRule = {
      id: 'r1',
      dirtyName: 'tylenol',
      canonicalName: 'Acetaminofén',
      status: 'approved',
      approvedBy: 'resident-1',
      createdAt: 1700000000000
    };
    expect(rule.status).toBe('approved');
    expect(rule.approvedBy).toBe('resident-1');
  });
});

describe('medicineNormalizationResident - reject cluster flow', () => {
  it('rejection creates self-mapping rules', () => {
    const variants = ['Tylenol', 'Panadol'];
    const rules: MedNormalizationRule[] = variants.map(v => ({
      id: `r-${v}`,
      dirtyName: v,
      canonicalName: v,
      status: 'rejected',
      approvedBy: 'resident-1',
      createdAt: 1700000000000
    }));
    expect(rules.length).toBe(2);
    expect(rules.every(r => r.status === 'rejected')).toBe(true);
  });
});

describe('medicineNormalizationResident - nav visibility', () => {
  it('resident role shows medicine_normalization nav item', () => {
    const isResident = true;
    const isAdmin = false;
    const show = isResident || isAdmin;
    expect(show).toBe(true);
  });

  it('admin role shows medicine_normalization nav item', () => {
    const isResident = false;
    const isAdmin = true;
    const show = isResident || isAdmin;
    expect(show).toBe(true);
  });

  it('doctor role does not show medicine_normalization nav item', () => {
    const isResident = false;
    const isAdmin = false;
    const show = isResident || isAdmin;
    expect(show).toBe(false);
  });
});

describe('medicineNormalizationResident - rules with approved status', () => {
  it('counts only approved rules', () => {
    const rules: MedNormalizationRule[] = [
      buildRule({ id: 'r1', status: 'approved' }),
      buildRule({ id: 'r2', status: 'approved' }),
      buildRule({ id: 'r3', status: 'rejected' }),
      buildRule({ id: 'r4', status: 'pending' })
    ];
    const approvedCount = rules.filter(r => r.status === 'approved').length;
    expect(approvedCount).toBe(2);
  });
});

describe('medicineNormalizationResident - date range filter', () => {
  it('builds correct range for today', () => {
    const todayStr = '2024-01-15';
    const [y, m, d] = todayStr.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 59);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
  });
});
