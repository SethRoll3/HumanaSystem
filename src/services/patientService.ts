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
    startAfter,
    DocumentSnapshot,
    serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Patient, Consultation, Appointment } from '../types';

const COLLECTION_NAME = 'patients';

// --- FUNCIONES EXPORTADAS INDIVIDUALMENTE (Legacy Support) ---

export const searchPatients = async (searchTerm: string): Promise<Patient[]> => {
    if (!searchTerm) return [];
    
    // Búsqueda simple por nombre
    // Nota: Firestore no tiene "LIKE" nativo.
    // Para conjuntos de datos medianos (< 2000), traer todo y filtrar es aceptable.
    // Para conjuntos grandes, se recomienda Algolia o ElasticSearch.
    
    // Opción A: Buscar por DPI (Exacto)
    const qDpi = query(collection(db, COLLECTION_NAME), where('dpi', '==', searchTerm));
    const snapDpi = await getDocs(qDpi);
    if (!snapDpi.empty) {
        return snapDpi.docs.map(doc => ({ ...(doc.data() as any), id: doc.id } as Patient));
    }

    // Opción B: Buscar por BillingCode (Exacto)
    const qCode = query(collection(db, COLLECTION_NAME), where('billingCode', '==', searchTerm));
    const snapCode = await getDocs(qCode);
    if (!snapCode.empty) {
        return snapCode.docs.map(doc => ({ ...(doc.data() as any), id: doc.id } as Patient));
    }

    // Opción B: Buscar por Nombre (Client-side filtering con límite aumentado)
    // Aumentamos el límite para cubrir más casos mientras la base crece
    const qRecent = query(collection(db, COLLECTION_NAME), limit(1000));
    const snapRecent = await getDocs(qRecent);
    const all = snapRecent.docs.map(doc => ({ ...(doc.data() as any), id: doc.id } as Patient));
    
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

    // 4. Fallback: Buscar por 'dpi'
    const q3 = query(collection(db, COLLECTION_NAME), where('dpi', '==', id));
    const querySnap3 = await getDocs(q3);
    if (!querySnap3.empty) {
        const d = querySnap3.docs[0];
        const data = d.data() as any;
        return { ...data, id: d.id } as Patient;
    }
    } catch (e) {
        console.error("Error searching patient fallback", e);
    }

    return null;
};

export const createPatient = async (data: any): Promise<string> => {
    const payload = { ...data };
    if (!payload.billingCode) delete payload.billingCode;
    if (!payload.dpi) delete payload.dpi;
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
        ...payload,
        createdAt: serverTimestamp()
    });
    return docRef.id;
};

const normalizePatientName = (name: string) => {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const isSamePatientName = (left: string, right: string) => {
    const a = normalizePatientName(left);
    const b = normalizePatientName(right);
    if (!a || !b) return false;
    return a === b;
};

export const checkPatientDuplicates = async ({
    fullName,
    billingCode,
    dpi,
    excludeId
}: {
    fullName?: string;
    billingCode?: string;
    dpi?: string;
    excludeId?: string;
}) => {
    const trimmedName = (fullName || '').trim();
    const trimmedCode = (billingCode || '').trim();
    const trimmedDpi = (dpi || '').trim();
    let billingCodeMatch: Patient | null = null;
    let dpiMatch: Patient | null = null;
    let nameMatch: Patient | null = null;

    if (trimmedCode) {
        const codeQuery = query(collection(db, COLLECTION_NAME), where('billingCode', '==', trimmedCode));
        const codeSnap = await getDocs(codeQuery);
        const codeMatch = codeSnap.docs
            .map(doc => ({ ...(doc.data() as any), id: doc.id } as Patient))
            .find(p => p.id !== excludeId);
        if (codeMatch) billingCodeMatch = codeMatch;
    }

    if (trimmedDpi) {
        const dpiQuery = query(collection(db, COLLECTION_NAME), where('dpi', '==', trimmedDpi));
        const dpiSnap = await getDocs(dpiQuery);
        const dpiFound = dpiSnap.docs
            .map(doc => ({ ...(doc.data() as any), id: doc.id } as Patient))
            .find(p => p.id !== excludeId);
        if (dpiFound) dpiMatch = dpiFound;
    }

    if (trimmedName) {
        const nameSnap = await getDocs(query(collection(db, COLLECTION_NAME), limit(1000)));
        const candidates = nameSnap.docs.map(doc => ({ ...(doc.data() as any), id: doc.id } as Patient));
        const match = candidates.find(p => p.id !== excludeId && p.fullName && isSamePatientName(trimmedName, p.fullName));
        if (match) nameMatch = match;
    }

    return { billingCodeMatch, dpiMatch, nameMatch };
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
        const consultations = snap.docs
            .map(doc => ({ ...(doc.data() as any), id: doc.id } as Consultation))
            .filter(c => {
                const hasStatus = c.status === 'finished' || c.status === 'delivered';
                // La "ficha" se define por tener specialtyData (datos de especialidad)
                const hasFicha = c.specialtyData && Object.keys(c.specialtyData).length > 0;
                return hasStatus && hasFicha;
            })
            .sort((a, b) => a.date - b.date);

        const consultationAppointmentIds = new Set(
            consultations.map(c => c.appointmentId).filter(Boolean) as string[]
        );

        const apptQuery = query(
            collection(db, 'appointments'),
            where('patientId', '==', patientId)
        );
        const apptSnap = await getDocs(apptQuery);
        const appointmentFichas = apptSnap.docs
            .map(doc => ({ ...(doc.data() as any), id: doc.id } as Appointment))
            .filter(appt => {
                if (consultationAppointmentIds.has(appt.id || '')) return false;
                if (['cancelled', 'no_show'].includes(appt.status)) return false;
                const hasFicha = appt.residentSpecialtyData && Object.keys(appt.residentSpecialtyData).length > 0;
                return appt.residentClinicalCompleted === true && hasFicha;
            })
            .map(appt => {
                const dateValue = appt.date as any;
                const dateMs = dateValue?.toDate
                    ? dateValue.toDate().getTime()
                    : dateValue?.seconds
                    ? new Date(dateValue.seconds * 1000).getTime()
                    : new Date(dateValue).getTime();
                return {
                    id: `appt_${appt.id}`,
                    status: 'finished',
                    patientId: appt.patientId,
                    patientName: appt.patientName,
                    doctorId: appt.doctorId,
                    doctorName: appt.doctorName,
                    date: dateMs,
                    appointmentId: appt.id,
                    specialtyData: appt.residentSpecialtyData,
                    specialtyFormId: appt.residentSpecialtyFormId,
                    specialtyFormName: appt.residentSpecialtyFormName
                } as Consultation;
            });

        return [...consultations, ...appointmentFichas].sort((a, b) => a.date - b.date);
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
            .map(doc => ({ ...(doc.data() as any), id: doc.id } as Consultation))
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
  async getPaginated(limitCount: number, lastDoc: DocumentSnapshot | null = null) {
    let q;
    
    if (lastDoc) {
      q = query(
        collection(db, COLLECTION_NAME),
        orderBy('fullName', 'asc'),
        startAfter(lastDoc),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, COLLECTION_NAME),
        orderBy('fullName', 'asc'),
        limit(limitCount)
      );
    }

    const snapshot = await getDocs(q);
    const patients = snapshot.docs.map(doc => ({
      ...(doc.data() as any),
      id: doc.id
    } as Patient));

    return {
      patients,
      lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
      hasMore: snapshot.docs.length === limitCount
    };
  },

  async getAll() {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('fullName', 'asc'),
      limit(1000) 
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
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

      // Último intento: buscar por dpi
      const q3 = query(collection(db, COLLECTION_NAME), where('dpi', '==', patientId));
      const qs3 = await getDocs(q3);
      if (!qs3.empty) {
          const d = qs3.docs[0];
          const ref = doc(db, COLLECTION_NAME, d.id);
          await updateDoc(ref, { billingCode });
          return;
      }

      throw new Error('Paciente no encontrado para actualizar código de facturación');
  }
};
