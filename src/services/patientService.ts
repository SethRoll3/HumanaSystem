
import { doc, getDoc, setDoc, updateDoc, deleteDoc, Timestamp, collection, query, where, orderBy, startAt, endAt, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { Patient, Consultation } from '../../types.ts';

const toTitleCase = (str: string) => {
  return str
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const getPatientByDPI = async (dpi: string): Promise<Patient | null> => {
  try {
    const docRef = doc(db, 'patients', dpi);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...(docSnap.data() as any) } as Patient;
    }
    return null;
  } catch (error) {
    console.error("Error getting patient:", error);
    throw error;
  }
};

export const searchPatients = async (term: string): Promise<Patient[]> => {
  try {
    const patientsRef = collection(db, 'patients');
    
    // Si no hay término, devolver los 10 pacientes más recientes
    if (!term || term.trim() === '') {
        const q = query(patientsRef, orderBy('createdAt', 'desc'), limit(10));
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient));
    }

    const cleanTerm = term.trim();

    // 1. Búsqueda por Código Numérico o DPI
    if (/^\d+$/.test(cleanTerm)) {
        const qCode = query(patientsRef, where('billingCode', '==', cleanTerm), limit(5));
        const snapCode = await getDocs(qCode);
        if (!snapCode.empty) return snapCode.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient));
        
        const qId = query(patientsRef, orderBy('id'), startAt(cleanTerm), endAt(cleanTerm + '\uf8ff'), limit(5));
        const snapId = await getDocs(qId);
        return snapId.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient));
    }

    // 2. Búsqueda por Nombre (Normalización a Title Case + Fallback Local)
    // Firestore es Case-Sensitive, así que normalizamos "mayn" -> "Mayn" para que coincida con "Maynor"
    const formattedTerm = toTitleCase(cleanTerm);
    
    // Intentar búsqueda por prefijo formateado
    const qName = query(
        patientsRef,
        orderBy('fullName'),
        startAt(formattedTerm),
        endAt(formattedTerm + '\uf8ff'),
        limit(20)
    );
    
    const snapshot = await getDocs(qName);
    let results = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient));

    // 3. Fallback: Si no hay resultados exactos (ej. buscaron un apellido en medio), 
    // hacemos un fetch pequeño y filtramos localmente para garantizar que "mayn" encuentre a "Maynor Boteo"
    if (results.length === 0) {
        const qAll = query(patientsRef, limit(50)); // Traemos un set pequeño razonable
        const snapAll = await getDocs(qAll);
        const searchLower = cleanTerm.toLowerCase();
        results = snapAll.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Patient))
            .filter(p => p.fullName.toLowerCase().includes(searchLower));
    }

    return results;

  } catch (error) {
    console.error("Error searching patients:", error);
    return [];
  }
};

export const createPatient = async (patient: Patient): Promise<void> => {
  try {
    const docId = patient.id || patient.billingCode;
    const docRef = doc(db, 'patients', docId); 
    const cleanName = toTitleCase(patient.fullName);
    await setDoc(docRef, {
      ...patient,
      id: docId,
      fullName: cleanName,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error("Error creating patient:", error);
    throw error;
  }
};

export const getWaitingConsultations = async (): Promise<Consultation[]> => {
    const ref = collection(db, 'consultations');
    const q = query(ref, where('status', '==', 'waiting'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Consultation))
               .sort((a, b) => a.date - b.date);
};

export const checkAndSwitchToReconsultation = async (patientId: string) => {
    try {
        const ref = collection(db, 'consultations');
        const q = query(ref, where('patientId', '==', patientId), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const patientRef = doc(db, 'patients', patientId);
            await updateDoc(patientRef, { consultationType: 'Reconsulta', updatedAt: Timestamp.now() });
            return true;
        }
        return false;
    } catch (e) {
        console.error("Error checking reconsultation:", e);
        return false;
    }
};

export const deleteWaitingConsultation = async (consultationId: string) => {
    try {
        await deleteDoc(doc(db, 'consultations', consultationId));
    } catch (error) {
        console.error("Error deleting consultation:", error);
        throw error;
    }
};
