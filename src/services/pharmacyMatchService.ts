import { PharmacySaleRow, normalizeText } from './pharmacySalesService';
import { Consultation, PrescriptionItem } from '../types';
import { MedicineCatalogItem } from './reportsService';

export interface MatchedItem {
  productName: string;
  patientName: string;
  patientId?: string;
  doctorName?: string;
  sellerName?: string;
  documentNumber?: number;
  soldQuantity: number;
  prescribedQuantity: number;
  isDiscount: boolean;
  discountAmount: number;
  dateMs?: number;
}

export interface SoldOnlyItem {
  productName: string;
  patientName: string;
  sellerName?: string;
  documentNumber?: number;
  soldQuantity: number;
  isDiscount: boolean;
  discountAmount: number;
  dateMs?: number;
}

export interface PrescribedItem {
  productName: string;
  patientName: string;
  doctorName?: string;
  patientId?: string;
  prescribedQuantity: number;
}

export interface PatientMatchSummary {
  patientName: string;
  totalPurchases: number;
  totalPrescriptions: number;
  matchedCount: number;
  soldOnlyCount: number;
  prescribedOnlyCount: number;
  totalDiscount: number;
  items: MatchedItem[];
}

export interface ExternalSaleFlag {
  productName: string;
  productCode: string;
  patientName: string;
  sellerName?: string;
  documentNumber?: number;
  dateMs?: number;
  /** 'not-in-catalog' = product not found in medicineIndex; 'marked-external' = product is in catalog but isExternal=true */
  reason: 'not-in-catalog' | 'marked-external';
  soldQuantity: number;
}

export interface PharmacyMatchResult {
  totalSalesItems: number;
  totalPrescriptionItems: number;
  /** Number of prescribed items that are INTERNAL (isExternal === false in medicineIndex) */
  internalPrescriptionItems: number;
  matchRate: number;
  matched: MatchedItem[];
  soldOnly: SoldOnlyItem[];
  prescribedOnly: PrescribedItem[];
  totalDiscounts: number;
  discountAmount: number;
  patientBreakdown: PatientMatchSummary[];
  /** Number of consultations (with FAR prescription) where ALL items were fully sold */
  completePrescriptionsCount: number;
  /** Rate: complete prescriptions / total consultations that had FAR prescription */
  completePrescriptionsRate: number;
  /** Number of consultations where all prescribed items are internal (!isExternal) */
  prescriptionsWithInternalMeds: number;
  /** Total consultations in the date range that had at least one FAR medication prescribed */
  totalConsultationsWithPrescription: number;
  /** Sales of products marked as external (or not in catalog) — for directors to reclassify */
  externalSalesDetected: ExternalSaleFlag[];
}

const MEDICATION_PREFIXES = ['FAR'];

const isMedicationProduct = (code: string): boolean => {
  const upper = code.toUpperCase();
  if (MEDICATION_PREFIXES.some(prefix => upper.startsWith(prefix))) return true;
  if (upper === 'DES') return false;
  if (upper.startsWith('LAB') || upper.startsWith('CIR') || upper.startsWith('RMN')) return false;
  if (upper.startsWith('PC') || upper.startsWith('RC') || upper.startsWith('EKG')) return false;
  if (upper.startsWith('VEEG') || upper.startsWith('DOM')) return false;
  return false;
};

const CONNECTOR_WORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'or', 'of', 'the']);

const normalizePatientWords = (name: string): string[] => {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[,.\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !CONNECTOR_WORDS.has(w));
};

const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
};

export const patientNamesMatch = (excelName: string, systemName: string): boolean => {
  if (!excelName || !systemName) return false;
  const excelWords = normalizePatientWords(excelName);
  const systemWords = normalizePatientWords(systemName);
  if (excelWords.length === 0 || systemWords.length === 0) return false;

  const excelSet = new Set(excelWords);
  const systemSet = new Set(systemWords);

  const intersection = [...excelSet].filter(w => systemSet.has(w));
  const union = new Set([...excelSet, ...systemSet]);

  if (intersection.length / union.size >= 0.75) return true;

  const unmatched = [...excelSet].filter(w => !systemSet.has(w));
  const fuzzyMatches = unmatched.filter(ew =>
    [...systemSet].some(sw => levenshtein(ew, sw) / Math.max(ew.length, sw.length) < 0.3)
  );

  const totalMatched = intersection.length + fuzzyMatches.length;
  return totalMatched / union.size >= 0.75;
};

export function performPharmacyMatch(
  salesRows: PharmacySaleRow[],
  consultations: Consultation[],
  medicineIndex: Map<string, MedicineCatalogItem>
): PharmacyMatchResult {
  let totalDiscounts = 0;
  let discountAmount = 0;
  salesRows.forEach(row => {
    if (row.isDiscount || (row.productCode && row.productCode.toUpperCase() === 'DES')) {
      totalDiscounts++;
      discountAmount += row.total || 0;
    }
  });

  const medicationSales = salesRows.filter(row => {
    if (!row.productCode) return false;
    return isMedicationProduct(row.productCode);
  });

  const prescriptionItems: Array<PrescriptionItem & { doctorId?: string; doctorName?: string; patientId?: string; patientName?: string }> = [];
  consultations.forEach(c => {
    (c.prescription || []).forEach(item => {
      prescriptionItems.push({
        ...item,
        doctorId: c.doctorId,
        doctorName: c.doctorName,
        patientId: c.patientId,
        patientName: c.patientName,
      });
    });
  });

  const salesByPatient = new Map<string, PharmacySaleRow[]>();
  medicationSales.forEach(row => {
    const key = normalizeText(row.patientName || '');
    if (!key) return;
    if (!salesByPatient.has(key)) salesByPatient.set(key, []);
    salesByPatient.get(key)!.push(row);
  });

  const prescriptionsByPatient = new Map<string, Array<PrescriptionItem & { doctorName?: string; patientId?: string; patientName?: string }>>();
  prescriptionItems.forEach(item => {
    const key = normalizeText(item.patientName || '');
    if (!key) return;
    if (!prescriptionsByPatient.has(key)) prescriptionsByPatient.set(key, []);
    prescriptionsByPatient.get(key)!.push(item);
  });

  const matched: MatchedItem[] = [];
  const soldOnly: SoldOnlyItem[] = [];
  const prescribedOnly: PrescribedItem[] = [];

  const matchedSalesKeys = new Set<string>();
  const matchedPrescKeys = new Set<string>();

  salesByPatient.forEach((patientSales, salesPatientKey) => {
    let bestMatchSystemName = '';
    let bestMatchPatientId = '';

    prescriptionsByPatient.forEach((_, prescPatientKey) => {
      const sysName = consultations.find(c => normalizeText(c.patientName || '') === prescPatientKey)?.patientName || '';
      if (patientNamesMatch(salesPatientKey, prescPatientKey)) {
        bestMatchSystemName = sysName;
        bestMatchPatientId = consultations.find(c => normalizeText(c.patientName || '') === prescPatientKey)?.patientId || '';
      }
    });

    if (!bestMatchSystemName) {
      patientSales.forEach(sale => {
        const key = `${normalizeText(sale.patientName || '')}|${normalizeText(sale.product || '')}|${sale.dateMs || 0}`;
        if (sale.isDiscount) {
          // Discounts already counted above
        } else {
          soldOnly.push({
            productName: sale.product || '',
            patientName: sale.patientName || '',
            sellerName: sale.sellerName,
            documentNumber: sale.documentNumber,
            soldQuantity: sale.quantity || 1,
            isDiscount: sale.isDiscount || false,
            discountAmount: 0,
            dateMs: sale.dateMs,
          });
        }
        matchedSalesKeys.add(key);
      });
      return;
    }

    const patientPrescriptions = prescriptionsByPatient.get(
      [...prescriptionsByPatient.keys()].find(k => patientNamesMatch(salesPatientKey, k)) || ''
    ) || [];

    const salesByProduct = new Map<string, PharmacySaleRow[]>();
    patientSales.forEach(sale => {
      if (sale.isDiscount) {
        // Discounts already counted above
        return;
      }
      const pKey = normalizeText(sale.product || '');
      if (!salesByProduct.has(pKey)) salesByProduct.set(pKey, []);
      salesByProduct.get(pKey)!.push(sale);
    });

    const prescByProduct = new Map<string, Array<PrescriptionItem & { doctorName?: string; patientId?: string; patientName?: string }>>();
    patientPrescriptions.forEach(p => {
      const pKey = normalizeText(p.name || '');
      if (!prescByProduct.has(pKey)) prescByProduct.set(pKey, []);
      prescByProduct.get(pKey)!.push(p);
    });

    salesByProduct.forEach((productSales, prodKey) => {
      const totalSold = productSales.reduce((acc, s) => acc + (s.quantity || 1), 0);
      const firstSale = productSales[0];

      if (prescByProduct.has(prodKey)) {
        const prescItems = prescByProduct.get(prodKey)!;
        const totalPrescribed = prescItems.reduce((acc, p) => acc + (p.quantity || 1), 0);
        matched.push({
          productName: firstSale.product || '',
          patientName: bestMatchSystemName || firstSale.patientName || '',
          patientId: bestMatchPatientId,
          doctorName: prescItems[0]?.doctorName,
          sellerName: firstSale.sellerName,
          documentNumber: firstSale.documentNumber,
          soldQuantity: totalSold,
          prescribedQuantity: totalPrescribed,
          isDiscount: false,
          discountAmount: 0,
          dateMs: firstSale.dateMs,
        });
        productSales.forEach(s => matchedSalesKeys.add(`${normalizeText(s.patientName || '')}|${normalizeText(s.product || '')}|${s.dateMs || 0}`));
        prescItems.forEach(p => matchedPrescKeys.add(`${bestMatchSystemName}|${normalizeText(p.name || '')}`));
      } else {
        soldOnly.push({
          productName: firstSale.product || '',
          patientName: bestMatchSystemName || firstSale.patientName || '',
          sellerName: firstSale.sellerName,
          documentNumber: firstSale.documentNumber,
          soldQuantity: totalSold,
          isDiscount: false,
          discountAmount: 0,
          dateMs: firstSale.dateMs,
        });
        productSales.forEach(s => matchedSalesKeys.add(`${normalizeText(s.patientName || '')}|${normalizeText(s.product || '')}|${s.dateMs || 0}`));
      }
    });

    prescByProduct.forEach((prescItems, prodKey) => {
      if (!salesByProduct.has(prodKey)) {
        prescItems.forEach(p => {
          prescribedOnly.push({
            productName: p.name || '',
            patientName: bestMatchSystemName || p.patientName || '',
            doctorName: p.doctorName,
            patientId: bestMatchPatientId,
            prescribedQuantity: p.quantity || 1,
          });
          matchedPrescKeys.add(`${bestMatchSystemName}|${normalizeText(p.name || '')}`);
        });
      }
    });
  });

  prescriptionsByPatient.forEach((patientPrescriptions, prescPatientKey) => {
    const hasMatchingSale = [...salesByPatient.keys()].some(sk => patientNamesMatch(sk, prescPatientKey));
    if (!hasMatchingSale) {
      patientPrescriptions.forEach(p => {
        const sysName = consultations.find(c => normalizeText(c.patientName || '') === prescPatientKey)?.patientName || '';
        prescribedOnly.push({
          productName: p.name || '',
          patientName: sysName || p.patientName || '',
          doctorName: p.doctorName,
          patientId: p.patientId,
          prescribedQuantity: p.quantity || 1,
        });
      });
    }
  });

  const totalSalesItems = medicationSales.filter(r => !r.isDiscount).reduce((acc, r) => acc + (r.quantity || 1), 0);
  const totalPrescriptionItems = prescriptionItems.reduce((acc, p) => acc + (p.quantity || 1), 0);
  const matchedQty = matched.reduce((acc, m) => acc + Math.min(m.soldQuantity, m.prescribedQuantity), 0);
  const matchRate = totalPrescriptionItems === 0 ? 0 : matchedQty / totalPrescriptionItems;

  const patientMap = new Map<string, PatientMatchSummary>();
  const addPatient = (name: string) => {
    if (!patientMap.has(name)) {
      patientMap.set(name, {
        patientName: name,
        totalPurchases: 0,
        totalPrescriptions: 0,
        matchedCount: 0,
        soldOnlyCount: 0,
        prescribedOnlyCount: 0,
        totalDiscount: 0,
        items: [],
      });
    }
    return patientMap.get(name)!;
  };

  matched.forEach(m => {
    const p = addPatient(m.patientName);
    p.totalPurchases += m.soldQuantity;
    p.totalPrescriptions += m.prescribedQuantity;
    p.matchedCount++;
    p.items.push(m);
  });
  soldOnly.forEach(s => {
    const p = addPatient(s.patientName);
    p.totalPurchases += s.soldQuantity;
    p.soldOnlyCount++;
    if (s.isDiscount) p.totalDiscount += s.discountAmount;
  });
  prescribedOnly.forEach(presc => {
    const p = addPatient(presc.patientName);
    p.totalPrescriptions += presc.prescribedQuantity;
    p.prescribedOnlyCount++;
  });

  const deduplicated: MatchedItem[] = [];
  const seenMatched = new Set<string>();
  matched.forEach(m => {
    const key = `${normalizeText(m.patientName)}|${normalizeText(m.productName)}`;
    if (!seenMatched.has(key)) {
      seenMatched.add(key);
      deduplicated.push(m);
    }
  });

  const deduplicatedSoldOnly: SoldOnlyItem[] = [];
  const seenSold = new Set<string>();
  soldOnly.forEach(s => {
    const key = `${normalizeText(s.patientName)}|${normalizeText(s.productName)}`;
    if (!seenSold.has(key)) {
      seenSold.add(key);
      deduplicatedSoldOnly.push(s);
    }
  });

  const deduplicatedPrescribedOnly: PrescribedItem[] = [];
  const seenPresc = new Set<string>();
  prescribedOnly.forEach(p => {
    const key = `${normalizeText(p.patientName)}|${normalizeText(p.productName)}`;
    if (!seenPresc.has(key)) {
      seenPresc.add(key);
      deduplicatedPrescribedOnly.push(p);
    }
  });

  // Count internal prescription items (only items marked as internal in medicineIndex)
  let internalPrescriptionItems = 0;
  prescriptionItems.forEach(p => {
    const medInfo = medicineIndex.get(normalizeText(p.name || ''));
    if (medInfo && !medInfo.isExternal) {
      internalPrescriptionItems += p.quantity || 1;
    }
  });

  // Count unique consultations that had at least one internal FAR prescription
  const consultationsWithFarPrescription = new Set<string>();
  consultations.forEach(c => {
    if (!c.prescription || c.prescription.length === 0) return;
    const hasInternalFar = c.prescription.some(p => {
      const medInfo = medicineIndex.get(normalizeText(p.name || ''));
      return medInfo && !medInfo.isExternal;
    });
    if (hasInternalFar) {
      consultationsWithFarPrescription.add(c.id);
    }
  });
  const totalConsultationsWithPrescription = consultationsWithFarPrescription.size;

  // Group matched items by virtual consultation key (patient + doctor + date) for prescription completion stats
  const consultationsWithPrescriptions = new Map<string, { items: MatchedItem[]; consultationId?: string }>();
  deduplicated.forEach(m => {
    const dateKey = m.dateMs || 0;
    const cKey = `${normalizeText(m.patientName)}|${normalizeText(m.doctorName || '')}|${dateKey}`;
    if (!consultationsWithPrescriptions.has(cKey)) {
      consultationsWithPrescriptions.set(cKey, { items: [], consultationId: m.patientId });
    }
    consultationsWithPrescriptions.get(cKey)!.items.push(m);
  });

  let completePrescriptionsCount = 0;
  let prescriptionsWithInternalMeds = 0;

  consultationsWithPrescriptions.forEach(({ items }, cKey) => {
    // Only count items whose products are INTERNAL in catalog
    const internalItems = items.filter(m => {
      const medInfo = medicineIndex.get(normalizeText(m.productName));
      return medInfo && !medInfo.isExternal;
    });
    if (internalItems.length === 0) return; // skip consultations with no internal items

    const allFullySold = internalItems.every(m => m.soldQuantity >= m.prescribedQuantity);
    if (allFullySold) completePrescriptionsCount++;

    const allInternal = internalItems.every(m => {
      const medInfo = medicineIndex.get(normalizeText(m.productName));
      return medInfo && !medInfo.isExternal;
    });
    if (allInternal) prescriptionsWithInternalMeds++;
  });

  const completePrescriptionsRate = totalConsultationsWithPrescription === 0 ? 0 : completePrescriptionsCount / totalConsultationsWithPrescription;

  // Detect external sales: sales of products marked external OR not in catalog
  const externalSalesMap = new Map<string, ExternalSaleFlag>();
  medicationSales.forEach(row => {
    if (row.isDiscount) return;
    const productName = row.product || '';
    const normalized = normalizeText(productName);
    if (!normalized) return;
    const medInfo = medicineIndex.get(normalized);
    let reason: 'not-in-catalog' | 'marked-external' | null = null;
    if (!medInfo) reason = 'not-in-catalog';
    else if (medInfo.isExternal) reason = 'marked-external';
    if (!reason) return;

    const key = `${normalizeText(row.patientName || '')}|${normalized}|${row.dateMs || 0}`;
    const existing = externalSalesMap.get(key);
    if (existing) {
      existing.soldQuantity += row.quantity || 1;
    } else {
      externalSalesMap.set(key, {
        productName,
        productCode: row.productCode || '',
        patientName: row.patientName || '',
        sellerName: row.sellerName,
        documentNumber: row.documentNumber,
        dateMs: row.dateMs,
        reason,
        soldQuantity: row.quantity || 1,
      });
    }
  });
  const externalSalesDetected = Array.from(externalSalesMap.values()).sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));

  return {
    totalSalesItems,
    totalPrescriptionItems,
    internalPrescriptionItems,
    matchRate,
    matched: deduplicated,
    soldOnly: deduplicatedSoldOnly,
    prescribedOnly: deduplicatedPrescribedOnly,
    totalDiscounts,
    discountAmount,
    patientBreakdown: Array.from(patientMap.values()).sort((a, b) => b.totalPurchases - a.totalPurchases),
    completePrescriptionsCount,
    completePrescriptionsRate,
    prescriptionsWithInternalMeds,
    totalConsultationsWithPrescription,
    externalSalesDetected,
  };
}
