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
    // 1. Intentar buscar por Document ID (Lo más común)
    const docRef = doc(db, COLLECTION_NAME, id);
    try {
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            const data = snap.data() as any;
            // Asegurar que el ID del objeto sea el ID del documento, no el campo 'id' interno si existe
            return { ...data, id: snap.id } as Patient;
        }
    } catch (e) {
        console.log("Error fetching by Doc ID, trying query...", e);
    }

    // 2. Fallback: Buscar por campo 'id' (ID interno/legacy)
    // Esto soluciona el caso donde la cita guardó el ID interno en lugar del Doc ID
    try {
        const q = query(collection(db, COLLECTION_NAME), where('id', '==', id));
        const querySnap = await getDocs(q);
        if (!querySnap.empty) {
            const d = querySnap.docs[0];
            const data = d.data() as any;
            return { ...data, id: d.id } as Patient;
        }
        
        // 3. Fallback: Buscar por 'billingCode'
        const q2 = query(collection(db, COLLECTION_NAME), where('billingCode', '==', id));
        const querySnap2 = await getDocs(q2);
        if (!querySnap2.empty) {
            const d = querySnap2.docs[0];
            const data = d.data() as any;
            return { ...data, id: d.id } as Patient;
        }
    } catch (e) {
        console.error("Error searching patient fallback", e);
    }

    return null;
};

export const createPatient = async (data: any): Promise<string> => {
    const billingCode = data.billingCode ?? '';
    
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

export const getPatientConsultations = async (patientId: string): Promise<Consultation[]> => {
    try {
        const q = query(
            collection(db, 'consultations'),
            where('patientId', '==', patientId)
        );
        const snap = await getDocs(q);
        return snap.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Consultation))
            .filter(c => {
                const hasStatus = c.status === 'finished' || c.status === 'delivered';
                // La "ficha" se define por tener specialtyData (datos de especialidad)
                const hasFicha = c.specialtyData && Object.keys(c.specialtyData).length > 0;
                return hasStatus && hasFicha;
            })
            .sort((a, b) => a.date - b.date); // ASC para que la primera sea la primera llenada
    } catch (error) {
        console.error("Error fetching patient consultations:", error);
        return [];
    }
};

export const getPatientImportantNotices = async (patientId: string): Promise<Consultation[]> => {
    try {
        const q = query(
            collection(db, 'consultations'),
            where('patientId', '==', patientId),
            where('status', 'in', ['finished', 'delivered'])
        );
        const snap = await getDocs(q);
        return snap.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Consultation))
            .filter(c => c.importantNotices && c.importantNotices.trim().length > 0)
            .sort((a, b) => a.date - b.date);
    } catch (error) {
        console.error("Error fetching patient important notices:", error);
        return [];
    }
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
  },

  async getHistory(patientId: string) {
      return getPatientConsultations(patientId);
  },

  async getImportantNotices(patientId: string) {
      return getPatientImportantNotices(patientId);
  },

  async updateBillingCode(patientId: string, billingCode: string) {
      // Resolver correctamente el ID del documento en Firestore,
      // ya que en algunas citas se guarda el ID interno en el campo 'id'
      // y NO el ID del documento.
      const tryDocRef = doc(db, COLLECTION_NAME, patientId);
      try {
          const snap = await getDoc(tryDocRef);
          if (snap.exists()) {
              await updateDoc(tryDocRef, { billingCode });
              return;
          }
      } catch {}

      // Fallback: buscar por campo 'id' (ID interno/legacy)
      const q = query(collection(db, COLLECTION_NAME), where('id', '==', patientId));
      const qs = await getDocs(q);
      if (!qs.empty) {
          const d = qs.docs[0];
          const ref = doc(db, COLLECTION_NAME, d.id);
          await updateDoc(ref, { billingCode });
          return;
      }

      // Último intento: buscar por billingCode si el input coincide (poco probable aquí)
      const q2 = query(collection(db, COLLECTION_NAME), where('billingCode', '==', patientId));
      const qs2 = await getDocs(q2);
      if (!qs2.empty) {
          const d = qs2.docs[0];
          const ref = doc(db, COLLECTION_NAME, d.id);
          await updateDoc(ref, { billingCode });
          return;
      }

      throw new Error('Paciente no encontrado para actualizar código de facturación');
  }
};
