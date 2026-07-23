import { collection, query, where, getDocs, setDoc, updateDoc, doc, getDoc, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { Consultation, PrescriptionItem } from '../types.ts';

export type ReviewStatus = 'pending' | 'approved' | 'flagged' | 'rejected';

export interface PrescriptionReview {
  id: string;
  consultationId: string;
  prescriptionItemIndex: number;
  medId: string;
  medName: string;
  activeIngredient?: string;
  doctorName: string;
  patientName: string;
  consultationDate: number;
  status: ReviewStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: number;
  notes?: string;
  flags?: string[];
  createdAt: number;
}

const COLLECTION = 'prescription_reviews';

const buildId = (consultationId: string, itemIndex: number, medId: string) =>
  `${consultationId}_${itemIndex}_${medId}`;

const toReview = (data: any, id: string): PrescriptionReview => {
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : (data.createdAt || Date.now());
  const reviewedAt = data.reviewedAt instanceof Timestamp ? data.reviewedAt.toMillis() : data.reviewedAt;
  return {
    id,
    consultationId: data.consultationId,
    prescriptionItemIndex: data.prescriptionItemIndex ?? 0,
    medId: data.medId,
    medName: data.medName,
    activeIngredient: data.activeIngredient,
    doctorName: data.doctorName,
    patientName: data.patientName,
    consultationDate: data.consultationDate,
    status: data.status || 'pending',
    reviewedBy: data.reviewedBy,
    reviewedByName: data.reviewedByName,
    reviewedAt,
    notes: data.notes,
    flags: data.flags || [],
    createdAt
  };
};

export const createPrescriptionReviewsForConsultation = async (
  consultation: Consultation
): Promise<number> => {
  if (!consultation.id) return 0;
  if (!consultation.prescription || consultation.prescription.length === 0) return 0;
  if (consultation.status !== 'finished' && consultation.status !== 'delivered') return 0;

  let created = 0;
  for (let i = 0; i < consultation.prescription.length; i++) {
    const item: PrescriptionItem = consultation.prescription[i];
    if (!item.medId) continue;
    const reviewId = buildId(consultation.id, i, item.medId);
    const ref = doc(db, COLLECTION, reviewId);
    const existing = await getDoc(ref);
    if (existing.exists()) continue;
    await setDoc(doc(db, COLLECTION, reviewId), {
      id: reviewId,
      consultationId: consultation.id,
      prescriptionItemIndex: i,
      medId: item.medId,
      medName: item.name,
      activeIngredient: item.presentation || '',
      doctorName: consultation.doctorName || '',
      patientName: consultation.patientName || '',
      consultationDate: consultation.date || Date.now(),
      status: 'pending',
      flags: [],
      createdAt: serverTimestamp()
    });
    created++;
  }
  return created;
};

export const getPrescriptionReviews = async (filters: {
  status?: ReviewStatus;
  doctorName?: string;
  startDate?: number;
  endDate?: number;
} = {}): Promise<PrescriptionReview[]> => {
  const constraints: any[] = [];
  if (filters.status) constraints.push(where('status', '==', filters.status));
  if (filters.doctorName) constraints.push(where('doctorName', '==', filters.doctorName));
  if (filters.startDate) constraints.push(where('consultationDate', '>=', filters.startDate));
  if (filters.endDate) constraints.push(where('consultationDate', '<=', filters.endDate));
  constraints.push(orderBy('consultationDate', 'desc'));
  const ref = collection(db, COLLECTION);
  const q = constraints.length > 0 ? query(ref, ...constraints) : query(ref, orderBy('consultationDate', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => toReview(d.data(), d.id));
};

export const updateReviewStatus = async (
  reviewId: string,
  status: ReviewStatus,
  reviewedBy: string,
  reviewedByName: string,
  notes?: string,
  flags?: string[]
): Promise<void> => {
  const ref = doc(db, COLLECTION, reviewId);
  const update: any = {
    status,
    reviewedBy,
    reviewedByName,
    reviewedAt: serverTimestamp()
  };
  if (notes !== undefined) update.notes = notes;
  if (flags !== undefined) update.flags = flags;
  await updateDoc(ref, update);
};

export const getReviewStats = async (startDate?: number, endDate?: number): Promise<{
  total: number;
  pending: number;
  approved: number;
  flagged: number;
  rejected: number;
}> => {
  const all = await getPrescriptionReviews({ startDate, endDate });
  return {
    total: all.length,
    pending: all.filter(r => r.status === 'pending').length,
    approved: all.filter(r => r.status === 'approved').length,
    flagged: all.filter(r => r.status === 'flagged').length,
    rejected: all.filter(r => r.status === 'rejected').length
  };
};

export const getReviewerStats = async (startDate?: number, endDate?: number): Promise<{
  reviewerName: string;
  total: number;
  approved: number;
  flagged: number;
  rejected: number;
}[]> => {
  const all = await getPrescriptionReviews({ startDate, endDate });
  const map = new Map<string, { total: number; approved: number; flagged: number; rejected: number }>();
  all.forEach(r => {
    if (!r.reviewedByName) return;
    const cur = map.get(r.reviewedByName) || { total: 0, approved: 0, flagged: 0, rejected: 0 };
    cur.total++;
    if (r.status === 'approved') cur.approved++;
    else if (r.status === 'flagged') cur.flagged++;
    else if (r.status === 'rejected') cur.rejected++;
    map.set(r.reviewedByName, cur);
  });
  return Array.from(map.entries()).map(([reviewerName, stats]) => ({
    reviewerName,
    ...stats
  })).sort((a, b) => b.total - a.total);
};

export const COMMON_FLAGS = [
  { id: 'dosage-unclear', label: 'Dosis poco clara' },
  { id: 'wrong-frequency', label: 'Frecuencia incorrecta' },
  { id: 'duration-mismatch', label: 'Duración no coincide con diagnóstico' },
  { id: 'duplicate-med', label: 'Duplicado con otro medicamento' },
  { id: 'interaction', label: 'Posible interacción' },
  { id: 'unavailable-stock', label: 'No disponible en inventario' }
];
