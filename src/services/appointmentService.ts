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
  orderBy,
  limit,
  startAfter,
  arrayUnion,
  getDoc,
  onSnapshot,
  DocumentSnapshot
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { Appointment, AppointmentStatus } from '../types';
import { doctorScheduleService } from './doctorScheduleService';
import { notifyAppointmentCreated, notifyAppointmentNoShow } from './notificationService';
import { logAuditAction } from './auditService';

const COLLECTION_NAME = 'appointments';

export const appointmentService = {
  // 1. Crear una nueva cita (Estado inicial: scheduled)
  async createAppointment(data: Omit<Appointment, 'id' | 'status' | 'createdAt'>, userEmail?: string) {
    const dateObj = data.date instanceof Timestamp ? data.date.toDate() : new Date(data.date);
    dateObj.setSeconds(0, 0);
    const ensureDate = (value: any) => {
      if (!value) return new Date();
      if (value instanceof Date) return value;
      if (value instanceof Timestamp) return value.toDate();
      if (typeof value === 'number') return new Date(value);
      if (value?.seconds) return new Timestamp(value.seconds, value.nanoseconds).toDate();
      return new Date(value);
    };
    const baseDuration = data.consultationType === 'Nueva' ? 60 : 30;
    const durationMinutes = Number.isFinite(data.duration as number)
      ? Number(data.duration)
      : baseDuration;
    const endDateObj = data.endDate ? ensureDate(data.endDate) : new Date(dateObj.getTime() + durationMinutes * 60000);
    endDateObj.setSeconds(0, 0);

    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const validation = await doctorScheduleService.validateAppointmentForDoctor(data.doctorId, dateObj);
    if (!validation.ok) {
      throw new Error(validation.message || 'El doctor no tiene horario disponible para esta fecha.');
    }

    const exactQuery = query(
      collection(db, COLLECTION_NAME),
      where('doctorId', '==', data.doctorId),
      where('date', '==', Timestamp.fromDate(dateObj))
    );
    const exactSnap = await getDocs(exactQuery);
    const exactMatches = exactSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Appointment))
      .filter(appt => appt.status !== 'cancelled');
    const exactMatch = exactMatches[0];
    if (exactMatch) {
      if (exactMatch.patientId === data.patientId) {
        throw new Error('El paciente ya tiene una cita con este médico en esa hora.');
      }
      throw new Error('El médico ya tiene una cita asignada en esa hora.');
    }

    const conflictQuery = query(
      collection(db, COLLECTION_NAME),
      where('doctorId', '==', data.doctorId),
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<=', Timestamp.fromDate(endOfDay))
    );
    const conflictSnap = await getDocs(conflictQuery);
    const conflicts = conflictSnap.docs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Appointment))
      .filter(appt => appt.status !== 'cancelled')
      .some(appt => {
        const apptStart = ensureDate(appt.date);
        const apptEnd = ensureDate(appt.endDate);
        const overlaps = dateObj < apptEnd && endDateObj > apptStart;
        if (!overlaps) return false;
        if (appt.patientId === data.patientId) {
          throw new Error('El paciente ya tiene una cita con este médico en ese horario.');
        }
        return true;
      });

    if (conflicts) {
      throw new Error('El médico ya tiene una cita asignada en ese horario.');
    }

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      status: 'scheduled',
      createdAt: serverTimestamp(),
    });

    // AUDIT LOG
    if (userEmail) {
      await logAuditAction(
        userEmail,
        "Crear Cita",
        `Cita creada para paciente ${data.patientName} con Dr. ${data.doctorName} el ${dateObj.toLocaleString()}`
      );
    }

    // NOTIFICAR CREACIÓN (Doctor + Admins)
    try {
      const dateStr = dateObj.toLocaleString('es-GT', { dateStyle: 'long', timeStyle: 'short' });
      await notifyAppointmentCreated(data.patientName, data.doctorName, data.doctorId, dateStr);
    } catch (error) {
      console.error("Error sending notification:", error);
    }

    return docRef.id;
  },

  // 2. Suscripción en tiempo real a citas por rango de fechas (para el Calendario)
  subscribeToAppointmentsByRange(startDate: Date, endDate: Date, onUpdate: (appointments: Appointment[]) => void) {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate))
    );
    
    // onSnapshot returns an unsubscribe function
    return onSnapshot(q, (snapshot) => {
      const appointments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      } as Appointment));
      onUpdate(appointments);
    });
  },

  // 2b. (DEPRECATED for Calendar, keep for other uses) Obtener citas por rango de fechas (One-time fetch)
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

  async getAppointmentsForResidentList() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, COLLECTION_NAME),
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as any)
    } as Appointment));
  },

  async getAppointmentsPaginated(params: {
    doctorId?: string;
    startDate: Date;
    endDate?: Date;
    limitCount: number;
    lastDoc?: DocumentSnapshot | null;
  }) {
    const { doctorId, startDate, endDate, limitCount, lastDoc } = params;
    const baseConstraints: any[] = [
      where('date', '>=', Timestamp.fromDate(startDate)),
      orderBy('date', 'asc')
    ];
    if (endDate) {
      baseConstraints.splice(1, 0, where('date', '<=', Timestamp.fromDate(endDate)));
    }
    if (doctorId) {
      baseConstraints.unshift(where('doctorId', '==', doctorId));
    }
    if (lastDoc) {
      baseConstraints.push(startAfter(lastDoc));
    }
    baseConstraints.push(limit(limitCount + 1));

    const q = query(collection(db, COLLECTION_NAME), ...baseConstraints);
    const snapshot = await getDocs(q);
    const docs = snapshot.docs;
    const hasMore = docs.length > limitCount;
    const pageDocs = hasMore ? docs.slice(0, limitCount) : docs;
    const nextCursor = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null;

    return {
      appointments: pageDocs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      } as Appointment)),
      lastDoc: nextCursor,
      hasMore
    };
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
    const snapshot = await getDoc(ref);
    const data = snapshot.exists() ? (snapshot.data() as Appointment) : undefined;
    const consultationType = data?.consultationType;
    const goToNurse = data?.goToNurse;
    const shouldSkipNurse = consultationType === 'Reconsulta' && goToNurse === false;

    await updateDoc(ref, {
      status: shouldSkipNurse ? 'resident_intake' : 'paid_checked_in',
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

  // Marcar como no se presentó
  async markNoShow(id: string, userEmail?: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    const snapshot = await getDoc(ref);
    
    if (snapshot.exists()) {
        const appt = snapshot.data() as Appointment;
        await updateDoc(ref, {
          status: 'no_show'
        });

        // Audit Log
        if (userEmail) {
            await logAuditAction(
                userEmail,
                "Marcar No Show",
                `Paciente ${appt.patientName} marcado como no presentado (Cita ID: ${id})`
            );
        }

        // Notificaciones
        try {
            const dateVal = appt.date instanceof Timestamp ? appt.date.toDate() : new Date(appt.date);
            const dateStr = dateVal.toLocaleString('es-GT');
            await notifyAppointmentNoShow(appt.patientName, appt.doctorName, appt.doctorId, dateStr);
        } catch (e) {
            console.error("Error sending no-show notification", e);
        }
    }
  },

  // Cancelación
  async cancelAppointment(id: string, reason?: string, userEmail?: string) {
    const ref = doc(db, COLLECTION_NAME, id);
    await updateDoc(ref, {
      status: 'cancelled',
      reason: reason 
    });

    // Audit Log
    if (userEmail) {
        await logAuditAction(
            userEmail,
            "Cancelar Cita",
            `Cita ${id} cancelada. Razón: ${reason || 'Sin razón'}`
        );
    }
  },

  async updateAppointment(
    id: string,
    updates: Partial<Appointment>,
    audit?: { editorId: string; editorName?: string; editorEmail?: string }
  ) {
    const ref = doc(db, COLLECTION_NAME, id);
    const payload: any = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    if (updates.date instanceof Date) {
      payload.date = Timestamp.fromDate(updates.date);
    }
    if (updates.endDate instanceof Date) {
      payload.endDate = Timestamp.fromDate(updates.endDate);
    }

    if (audit) {
      const auditEntry = {
        editorId: audit.editorId,
        editorName: audit.editorName || null,
        changes: payload,
        timestamp: Date.now()
      };
      await updateDoc(ref, {
        ...payload,
        auditTrail: arrayUnion(auditEntry)
      });

      // GLOBAL AUDIT LOG
      if (audit.editorEmail) {
        await logAuditAction(
            audit.editorEmail,
            "Editar Cita",
            `Cita ${id} actualizada. Campos: ${Object.keys(updates).join(', ')}`
        );
      }
    } else {
      await updateDoc(ref, payload);
    }
  }
};
