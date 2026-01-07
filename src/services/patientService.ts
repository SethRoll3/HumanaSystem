import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    getDocs, 
    getDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    Timestamp,
    serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Patient, Consultation } from '../types';

const COLLECTION_NAME = 'patients';

// --- FUNCIONES EXPORTADAS INDIVIDUALMENTE (Legacy Support) ---

export const searchPatients = async (searchTerm: string): Promise<Patient[]> => {
    if (!searchTerm) return [];
    
    // Búsqueda simple por nombre (se puede mejorar con Algolia o similar si crece mucho)
    // Nota: Firestore no tiene "LIKE" nativo, así que esto es un workaround simple
    // para búsquedas exactas o prefijos si se ordenara por nombre.
    // Para este MVP, traemos los últimos 50 y filtramos en cliente si la base no es gigante,
    // o usamos índices compuestos.
    
    // Opción A: Buscar por BillingCode (Exacto)
    const qCode = query(collection(db, COLLECTION_NAME), where('billingCode', '==', searchTerm));
    const snapCode = await getDocs(qCode);
    if (!snapCode.empty) {
        return snapCode.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient));
    }

    // Opción B: Buscar por Nombre (Client-side filtering de un subset reciente)
    // ESTO NO ES OPTIMO PARA MILLONES DE REGISTROS, PERO FUNCIONA PARA CIENTOS
    const qRecent = query(collection(db, COLLECTION_NAME), limit(100));
    const snapRecent = await getDocs(qRecent);
    const all = snapRecent.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient));
    
    const lowerTerm = searchTerm.toLowerCase();
    return all.filter(p => p.fullName.toLowerCase().includes(lowerTerm) || p.id.includes(searchTerm));
};

export const getPatientByDPI = async (id: string): Promise<Patient | null> => {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return { id: snap.id, ...(snap.data() as any) } as Patient;
    }
    return null;
};

export const createPatient = async (data: any): Promise<string> => {
    // Generar código de facturación si no existe
    const billingCode = data.billingCode || `P-${Date.now().toString().slice(-6)}`;
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...data,
        billingCode,
        createdAt: serverTimestamp()
    });
    return docRef.id;
};

export const checkAndSwitchToReconsultation = async (patientId: string) => {
    const patientRef = doc(db, COLLECTION_NAME, patientId);
    await updateDoc(patientRef, {
        consultationType: 'Reconsulta'
    });
};

export const deleteWaitingConsultation = async (consultationId: string) => {
    await deleteDoc(doc(db, 'consultations', consultationId));
};

import { logAuditAction } from './auditService';

export const updateConsultation = async (patientId: string, consultationId: string, data: Partial<Consultation>, userEmail: string) => {
    const consultRef = doc(db, 'consultations', consultationId);
    
    // Update main fields
    await updateDoc(consultRef, {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: userEmail
    });

    // Log Audit
    await logAuditAction(userEmail, "UPDATE_CONSULTATION", `Consulta ${consultationId} del paciente ${patientId} actualizada`);
};

// --- OBJECTO SERVICE UNIFICADO (Nuevo Estándar) ---

export const patientService = {
  async getAll() {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('fullName', 'asc'),
      limit(100) 
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Patient));
  },

  async create(data: any) {
      return createPatient(data);
  },

  async search(term: string) {
      return searchPatients(term);
  }
};
