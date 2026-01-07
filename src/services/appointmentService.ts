import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  Timestamp,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Appointment, AppointmentStatus } from '../types';
import { notifyAppointmentCreated } from './notificationService';

const COLLECTION_NAME = 'appointments';

export const appointmentService = {
  // 1. Crear una nueva cita (Estado inicial: scheduled)
  async createAppointment(data: Omit<Appointment, 'id' | 'status' | 'createdAt'>) {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      status: 'scheduled',
      createdAt: serverTimestamp(),
    });

    // NOTIFICAR CREACIÓN (Doctor + Admins)
    try {
      const dateObj = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
      const dateStr = dateObj.toLocaleString('es-GT', { dateStyle: 'long', timeStyle: 'short' });
      await notifyAppointmentCreated(data.patientName, data.doctorName, data.doctorId, dateStr);
    } catch (error) {
      console.error("Error sending notification:", error);
    }

    return docRef.id;
  },

  // 2. Obtener citas por rango de fechas (para el Calendario)
  async getAppointmentsByRange(startDate: Date, endDate: Date) {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate))
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any)
    } as Appointment));
  },

  // 3. Obtener citas del día
  async getAppointmentsForToday(doctorId?: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let q;

    if (doctorId) {
        q = query(
          collection(db, COLLECTION_NAME),
          where('doctorId', '==', doctorId),
          where('date', '>=', Timestamp.fromDate(startOfDay)),
          where('date', '<=', Timestamp.fromDate(endOfDay)),
          orderBy('date', 'asc')
        );
    } else {
        q = query(
          collection(db, COLLECTION_NAME),
          where('date', '>=', Timestamp.fromDate(startOfDay)),
          where('date', '<=', Timestamp.fromDate(endOfDay)),
          orderBy('date', 'asc')
        );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any)
    } as Appointment));
  },

  // 4. MÁQUINA DE ESTADOS: Transiciones seguras
  
  // Paso A: Confirmar (NUEVO: Acepta método)
  async confirmByPhone(id: string, receptionistId: string, method?: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'confirmed_phone',
      confirmedBy: receptionistId,
      confirmedAt: serverTimestamp(),
      confirmationMethod: method || 'Por Teléfono' // Default fallback
    });
  },

  // Paso B: Pagar en caja (Check-in)
  async registerPayment(id: string, cashierId: string, receiptNumber: string, amount: number) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'paid_checked_in',
      paymentReceipt: receiptNumber,
      paymentAmount: amount,
      paidBy: cashierId,
      paidAt: serverTimestamp()
    });
  },

  // Paso B2: Completar evaluación por residente
  async completeResidentIntake(id: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'resident_intake'
    });
  },

  // Paso C: Iniciar Consulta
  async startConsultation(id: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'in_progress'
    });
  },

  // Paso D: Finalizar
  async completeAppointment(id: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'completed'
    });
  },

  // Cancelación
  async cancelAppointment(id: string, reason?: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'cancelled',
      reason: reason 
    });
  }
};
