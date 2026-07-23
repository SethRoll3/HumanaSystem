/**
 * Lógica pura para calcular el fill rate de recetas contra el inventario actual.
 * Extraída de ReportsDashboard.tsx para que sea testeable de forma aislada.
 */

import { Medicine, PrescriptionItem } from '../types';
import { normalizeText } from '../services/pharmacySalesService';

/** Safe wrapper that returns '' for undefined/null input. */
function safeNormalize(value: string | undefined | null): string {
  if (!value) return '';
  return normalizeText(value);
}

export type FillBucket = '100%' | '75-99%' | '50-74%' | '25-49%' | '0-24%';

export interface PharmacyFillRateResult {
  totalRecipes: number;
  buckets: Record<FillBucket, number>;
  averageRate: number;
  uniqueMedicinesPrescribed: number;
  uniqueMedicinesInternal: number;
  uniqueMedicinesExternal: number;
  totalItemsPrescribed: number;
  topPrescribed: Array<{
    name: string;
    count: number;
    isExternal: boolean;
    currentStock: number;
  }>;
}

const EMPTY_BUCKETS: Record<FillBucket, number> = {
  '100%': 0,
  '75-99%': 0,
  '50-74%': 0,
  '25-49%': 0,
  '0-24%': 0,
};

/** Builds a name→Medicine index from non-external inventory. */
export function buildInventoryStockIndex(inventory: Medicine[]): Map<string, Medicine> {
  const idx = new Map<string, Medicine>();
  for (const med of inventory) {
    if (med.isExternal) continue;
    const key = safeNormalize(med.name);
    if (key) idx.set(key, med);
  }
  return idx;
}

/** Returns 0..1 ratio of fillability for one prescription, or null if empty. */
export function calculateRecipeFillRate(
  prescription: PrescriptionItem[],
  stockIndex: Map<string, Medicine>
): number | null {
  if (!prescription || prescription.length === 0) return null;
  let totalRatio = 0;
  for (const item of prescription) {
    if (item.isExternal) continue;
    const key = safeNormalize(item.name);
    const inv = key ? stockIndex.get(key) : undefined;
    if (!inv || (inv.stock || 0) <= 0) continue;
    const qty = item.quantity || 1;
    totalRatio += Math.min(1, (inv.stock || 0) / qty);
  }
  return totalRatio / prescription.length;
}

/** Returns the bucket for a given fill rate (0..1). */
export function bucketize(rate: number): FillBucket {
  const pct = rate * 100;
  if (pct >= 100) return '100%';
  if (pct >= 75) return '75-99%';
  if (pct >= 50) return '50-74%';
  if (pct >= 25) return '25-49%';
  return '0-24%';
}

/**
 * Aggregates fill rate across all consultations and returns the full result.
 * - `totalRecipes`: count of consultations with a prescription
 * - `uniqueMedicinesPrescribed`: distinct medicine names in the period (unique count)
 * - `topPrescribed`: top 10 medicines by prescription count, with current stock
 */
export function calculatePharmacyFillRate(
  consultations: Array<{ prescription?: PrescriptionItem[] }>,
  inventory: Medicine[]
): PharmacyFillRateResult {
  const stockIndex = buildInventoryStockIndex(inventory);
  const buckets: Record<FillBucket, number> = { ...EMPTY_BUCKETS };
  const medicineNameSet = new Set<string>();
  const medicineNamesInternal = new Set<string>();
  const medicineNamesExternal = new Set<string>();
  const medCounter = new Map<string, { count: number; isExternal: boolean; originalName: string }>();
  let totalRecipes = 0;
  let totalItems = 0;
  let totalRate = 0;
  let recipeCount = 0;

  for (const c of consultations) {
    if (!c.prescription || c.prescription.length === 0) continue;
    totalRecipes++;
    const rate = calculateRecipeFillRate(c.prescription, stockIndex);
    if (rate !== null) {
      totalRate += rate;
      recipeCount++;
      buckets[bucketize(rate)]++;
    }
    for (const item of c.prescription) {
      totalItems += item.quantity || 1;
      const originalName = (item.name || '').trim();
      if (!originalName) continue;
      const key = safeNormalize(originalName);
      if (!medicineNameSet.has(key)) {
        medicineNameSet.add(key);
        if (item.isExternal) medicineNamesExternal.add(key);
        else medicineNamesInternal.add(key);
      }
      const existing = medCounter.get(key) || { count: 0, isExternal: false, originalName };
      existing.count += 1;
      existing.isExternal = existing.isExternal || !!item.isExternal;
      // Prefer the longest original name (more readable)
      if (originalName.length > existing.originalName.length) {
        existing.originalName = originalName;
      }
      medCounter.set(key, existing);
    }
  }

  const topPrescribed = Array.from(medCounter.entries())
    .map(([key, info]) => {
      const inv = stockIndex.get(key);
      return {
        name: info.originalName,
        count: info.count,
        isExternal: info.isExternal,
        currentStock: inv ? inv.stock || 0 : 0,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRecipes,
    buckets,
    averageRate: recipeCount > 0 ? totalRate / recipeCount : 0,
    uniqueMedicinesPrescribed: medicineNameSet.size,
    uniqueMedicinesInternal: medicineNamesInternal.size,
    uniqueMedicinesExternal: medicineNamesExternal.size,
    totalItemsPrescribed: totalItems,
    topPrescribed,
  };
}
