import { collection, getDocs, query, where, Timestamp, orderBy, documentId } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Appointment, Consultation, Patient, UserProfile, Medicine, DoctorDaySchedule } from '../types';

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export interface MedicineCatalogItem {
  id: string;
  name: string;
  activeIngredient?: string;
  provider?: string;
  isExternal?: boolean;
}

export const reportsService = {
  async getPatientsByRange(start: Date, end: Date): Promise<Patient[]> {
    const snap = await getDocs(query(
      collection(db, 'patients'),
      where('createdAt', '>=', Timestamp.fromDate(start)),
      where('createdAt', '<=', Timestamp.fromDate(end))
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Patient));
  },

  async getPatientsByIds(ids: string[]): Promise<Patient[]> {
    if (ids.length === 0) return [];
    const chunks = chunkArray(ids, 10);
    const results: Patient[] = [];
    for (const chunk of chunks) {
      const snap = await getDocs(query(
        collection(db, 'patients'),
        where(documentId(), 'in', chunk)
      ));
      results.push(...snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Patient)));
    }
    return results;
  },

  async getConsultationsByRange(start: Date, end: Date): Promise<Consultation[]> {
    const startTs = start.getTime();
    const endTs = end.getTime();
    const snap = await getDocs(query(
      collection(db, 'consultations'),
      where('date', '>=', startTs),
      where('date', '<=', endTs),
      orderBy('date', 'desc')
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Consultation));
  },

  async getAppointmentsByRange(start: Date, end: Date): Promise<Appointment[]> {
    const snap = await getDocs(query(
      collection(db, 'appointments'),
      where('date', '>=', Timestamp.fromDate(start)),
      where('date', '<=', Timestamp.fromDate(end))
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Appointment));
  },

  async getDoctors(): Promise<UserProfile[]> {
    const snap = await getDocs(query(collection(db, 'users')));
    return snap.docs
      .map(d => ({ uid: d.id, ...(d.data() as object) } as UserProfile))
      .filter(u => (u.role === 'doctor' || u.role === 'licenciado') && u.isActive !== false);
  },

  async getInventoryMedicines(): Promise<MedicineCatalogItem[]> {
    const snap = await getDocs(query(collection(db, 'inventory')));
    return snap.docs.map(d => {
      const data = d.data() as Medicine;
      return {
        id: d.id,
        name: data.name,
        activeIngredient: data.activeIngredient,
        provider: 'Inventario Humana',
        isExternal: false
      };
    });
  },

  async getExternalMedicines(): Promise<MedicineCatalogItem[]> {
    const snap = await getDocs(query(collection(db, 'external_medicines')));
    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        id: d.id,
        name: data.commercialName || data.name || '',
        activeIngredient: data.activeIngredient || '',
        provider: data.pharmacy || data.distributorGT || 'Proveedor externo',
        isExternal: true
      };
    });
  },

  async getDoctorSchedulesByRange(startStr: string, endStr: string): Promise<DoctorDaySchedule[]> {
    const snap = await getDocs(query(
      collection(db, 'doctor_day_schedules'),
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    ));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as DoctorDaySchedule));
  }
};
