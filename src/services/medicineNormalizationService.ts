import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { extractActiveIngredient } from './geminiService';

const hasGeminiKey = (): boolean => {
  const env = (import.meta as any)?.env;
  const key = env?.VITE_GEMINI_API_KEY || env?.VITE_API_KEY || (process as any)?.env?.API_KEY;
  return Boolean(key);
};

const activeIngredientCache = new Map<string, string>();

const fetchActiveIngredientSafe = async (canonicalName: string): Promise<string> => {
  if (activeIngredientCache.has(canonicalName)) {
    return activeIngredientCache.get(canonicalName)!;
  }
  if (!hasGeminiKey()) {
    activeIngredientCache.set(canonicalName, '');
    return '';
  }
  try {
    const value = await extractActiveIngredient(canonicalName);
    activeIngredientCache.set(canonicalName, value || '');
    return value || '';
  } catch {
    activeIngredientCache.set(canonicalName, '');
    return '';
  }
};

export interface MedNormalizationRule {
  id: string;
  dirtyName: string;
  canonicalName: string;
  activeIngredient?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
  approvedBy?: string;
  approvedAt?: any;
}

export interface DuplicateCluster {
  canonicalCandidate: string;
  variants: { name: string; count: number }[];
  totalCount: number;
  hasRule: boolean; // If there's already a rule for this cluster
}

// --- Levenshtein Distance ---
const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};

const similarity = (a: string, b: string): number => {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
};

// Extract dosage from string (e.g. 50mg, 100 mg, 5ml, 1g, 250/25mg, 100/25mg, 28/10, 14/10)
const extractDosage = (name: string): string | null => {
  // Match compound dosages with unit: "250/25 mg", "100/25mg", "50 mg"
  const compoundMatch = name.match(/(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*(mg|ml|g|mcg|ui|u|mEq|mEq\/ml)\b/i);
  if (compoundMatch) {
    return `${compoundMatch[1]}${compoundMatch[2].toLowerCase()}`;
  }
  // Fallback: bare compound numbers like "28/10", "14/10" (no unit suffix)
  const bareMatch = name.match(/(\d+(?:\.\d+)?\/\d+(?:\.\d+)?)/);
  if (bareMatch) {
    return bareMatch[1];
  }
  return null;
};

// Normalize text for comparison: lowercase, remove accents, strip parenthetical brand names
const normalizeForComparison = (name: string): string => {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // Remove (Inderal), (Marca), etc.
    .replace(/\s+/g, ' ')
    .trim();
};

// --- Duplicate Detection ---
export const detectDuplicateClusters = (
  medNames: { name: string; count: number }[],
  existingRules: MedNormalizationRule[],
  threshold = 0.78
): DuplicateCluster[] => {
  const normalized = medNames.map(m => ({
    ...m,
    norm: normalizeForComparison(m.name),
    dosage: extractDosage(m.name)
  }));

  // Build a set of already-ruled dirty names for quick lookup
  const ruledDirtyNames = new Set(existingRules.map(r => normalizeForComparison(r.dirtyName)));

  const visited = new Set<number>();
  const clusters: DuplicateCluster[] = [];

  for (let i = 0; i < normalized.length; i++) {
    if (visited.has(i)) continue;
    if (normalized[i].norm.length < 3) continue; // Skip very short names

    const cluster: typeof normalized = [normalized[i]];
    visited.add(i);

    for (let j = i + 1; j < normalized.length; j++) {
      if (visited.has(j)) continue;
      if (normalized[j].norm.length < 3) continue;

      // DO NOT group if dosages are explicitly different (e.g. 50mg vs 100mg)
      if (normalized[i].dosage && normalized[j].dosage && normalized[i].dosage !== normalized[j].dosage) {
        continue;
      }

      const sim = similarity(normalized[i].norm, normalized[j].norm);
      if (sim >= threshold) {
        cluster.push(normalized[j]);
        visited.add(j);
      }
    }

    // Only report clusters with 2+ variants (duplicates exist)
    if (cluster.length >= 2) {
      // The most frequent name is the canonical candidate
      const sorted = [...cluster].sort((a, b) => b.count - a.count);
      const hasRule = cluster.some(c => ruledDirtyNames.has(c.norm));

      clusters.push({
        canonicalCandidate: sorted[0].name,
        variants: sorted.map(s => ({ name: s.name, count: s.count })),
        totalCount: sorted.reduce((acc, s) => acc + s.count, 0),
        hasRule
      });
    }
  }

  return clusters.sort((a, b) => b.totalCount - a.totalCount);
};

// --- Apply Normalization ---
export const applyNormalization = (name: string, rules: MedNormalizationRule[]): string => {
  const norm = normalizeForComparison(name);
  for (const rule of rules) {
    if (rule.status !== 'approved') continue;
    if (normalizeForComparison(rule.dirtyName) === norm) {
      return rule.canonicalName;
    }
  }
  return name; // No rule found, return original
};

// Build a normalization map for fast lookup
export const buildNormalizationMap = (rules: MedNormalizationRule[]): Map<string, string> => {
  const map = new Map<string, string>();
  rules.filter(r => r.status === 'approved').forEach(r => {
    map.set(normalizeForComparison(r.dirtyName), r.canonicalName);
  });
  return map;
};

export const buildActiveIngredientMap = (rules: MedNormalizationRule[]): Map<string, string> => {
  const map = new Map<string, string>();
  rules.filter(r => r.status === 'approved' && r.activeIngredient).forEach(r => {
    map.set(r.canonicalName, r.activeIngredient!);
  });
  return map;
};

export const normalizeWithMap = (name: string, normMap: Map<string, string>): string => {
  const norm = normalizeForComparison(name);
  return normMap.get(norm) || name;
};

// --- Firestore CRUD ---
const COLLECTION = 'med_normalization_rules';

export const medicineNormalizationService = {
  async getRules(): Promise<MedNormalizationRule[]> {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MedNormalizationRule, 'id'>) }));
  },

  async getApprovedRules(): Promise<MedNormalizationRule[]> {
    const snap = await getDocs(query(collection(db, COLLECTION), where('status', '==', 'approved')));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<MedNormalizationRule, 'id'>) }));
  },

  async addRule(dirtyName: string, canonicalName: string, activeIngredient?: string): Promise<string> {
    const aiIngredient = activeIngredient || await fetchActiveIngredientSafe(canonicalName);

    const docRef = await addDoc(collection(db, COLLECTION), {
      dirtyName,
      canonicalName,
      activeIngredient: aiIngredient || '',
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return docRef.id;
  },

  async approveRule(ruleId: string, userId: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, ruleId), {
      status: 'approved',
      approvedBy: userId,
      approvedAt: serverTimestamp()
    });
  },

  async rejectRule(ruleId: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, ruleId), { status: 'rejected' });
  },

  async deleteRule(ruleId: string): Promise<void> {
    await deleteDoc(doc(db, COLLECTION, ruleId));
  },

  // Bulk approve a cluster: creates approved rules for all variants pointing to canonical
  async approveCluster(canonicalName: string, variants: string[], userId: string): Promise<void> {
    const aiIngredient = await fetchActiveIngredientSafe(canonicalName);

    const promises = variants
      .filter(v => v !== canonicalName) // Don't create a rule for canonical → canonical
      .map(dirtyName =>
        addDoc(collection(db, COLLECTION), {
          dirtyName,
          canonicalName,
          activeIngredient: aiIngredient || '',
          status: 'approved',
          approvedBy: userId,
          approvedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        })
      );
    await Promise.all(promises);
  },

  // Bulk reject a cluster: creates rejected rules so these variants don't prompt again
  async rejectCluster(variants: string[], userId: string): Promise<void> {
    const promises = variants.map(dirtyName =>
      addDoc(collection(db, COLLECTION), {
        dirtyName,
        canonicalName: dirtyName,
        activeIngredient: '',
        status: 'rejected',
        approvedBy: userId,
        approvedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      })
    );
    await Promise.all(promises);
  }
};
