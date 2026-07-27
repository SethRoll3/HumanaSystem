import { collection, addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, Timestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Appointment, DoctorDaySchedule, DoctorScheduleSettings } from '../types';

const SCHEDULE_COLLECTION = 'doctor_day_schedules';
const SETTINGS_COLLECTION = 'doctor_schedule_settings';
const SETTINGS_DOC_ID = 'global';

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDayBounds = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const removeUndefined = <T extends Record<string, any>>(obj: T): T => {
  const clean: any = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (value !== undefined) {
      clean[key] = value;
    }
  });
  return clean;
};

export const doctorScheduleService = {
  async getGlobalSettings(): Promise<DoctorScheduleSettings> {
    const ref = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { allowDoctorSelfManage: false, qualityReportTime: '16:00' };
    }
    const data = snap.data() as Partial<DoctorScheduleSettings>;
    return {
      allowDoctorSelfManage: data.allowDoctorSelfManage ?? false,
      qualityReportTime: data.qualityReportTime ?? '16:00',
    };
  },

  async updateGlobalSettings(updates: Partial<DoctorScheduleSettings>): Promise<void> {
    const ref = doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    const current = snap.exists() ? (snap.data() as DoctorScheduleSettings) : { allowDoctorSelfManage: false, qualityReportTime: '16:00' };
    await setDoc(ref, { ...current, ...updates }, { merge: true });
  },

  async getSchedulesByDoctor(doctorId: string): Promise<DoctorDaySchedule[]> {
    const q = query(collection(db, SCHEDULE_COLLECTION), where('doctorId', '==', doctorId));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...(d.data() as any) } as DoctorDaySchedule))
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  async getSchedulesByDoctorAndDate(doctorId: string, date: Date): Promise<DoctorDaySchedule[]> {
    const dateKey = formatDateKey(date);
    const q = query(
      collection(db, SCHEDULE_COLLECTION),
      where('doctorId', '==', doctorId),
      where('date', '==', dateKey)
    );

    let exceptions: DoctorDaySchedule[] = [];
    let queryFailed = false;
    try {
      const snap = await getDocs(q);
      exceptions = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as DoctorDaySchedule));
    } catch (queryError) {
      console.error(`[Schedule] Error en query doctor_day_schedules para doctorId=${doctorId}, date=${dateKey}:`, queryError);
      queryFailed = true;
    }

    if (exceptions.length === 0 && queryFailed) {
      console.warn(`[Schedule] Query compuesta fallo. Usando fallback: query por doctorId y filtrando en memoria...`);
      try {
        const allSchedules = await this.getSchedulesByDoctor(doctorId);
        exceptions = allSchedules.filter(s => s.date === dateKey);
        if (exceptions.length > 0) {
          console.log(`[Schedule] Fallback exitoso: encontro ${exceptions.length} schedule(s) para ${dateKey}`);
        }
      } catch (fallbackError) {
        console.error(`[Schedule] Fallback tambien fallo:`, fallbackError);
      }
    }

    if (exceptions.length > 0) {
      const ex = exceptions[0];
      console.log(`[Schedule] Override diario encontrado: date=${ex.date}, mode=${ex.mode}, startTime=${ex.startTime}, endTime=${ex.endTime}`);
      return exceptions;
    }

    console.warn(`[Schedule] No se encontro override diario para doctorId=${doctorId}, date=${dateKey}. Verificando weeklySchedule...`);

    // No exception found, fallback to weekly schedule
    const userDoc = await getDoc(doc(db, 'users', doctorId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      if (userData.weeklySchedule) {
        const dayOfWeek = date.getDay();
        const rule = userData.weeklySchedule[dayOfWeek];
        if (rule) {
          console.log(`[Schedule] Usando weeklySchedule: dayOfWeek=${dayOfWeek}, mode=${rule.mode}, startTime=${rule.startTime}, endTime=${rule.endTime}`);
          return [{
            id: `weekly-${dateKey}`,
            doctorId,
            doctorName: userData.name || '',
            date: dateKey,
            mode: rule.mode,
            startTime: rule.startTime,
            endTime: rule.endTime,
            createdAt: Timestamp.now(),
            createdBy: 'system'
          }];
        }
      }
      console.warn(`[Schedule] Doctor ${doctorId} no tiene weeklySchedule configurado para dayOfWeek=${date.getDay()}`);
    }
    
    return [];
  },

  async createSchedule(data: Omit<DoctorDaySchedule, 'id' | 'createdAt'>): Promise<string> {
    const cleanData = removeUndefined(data as any);
    const ref = await addDoc(collection(db, SCHEDULE_COLLECTION), {
      ...cleanData,
      createdAt: Timestamp.now(),
    });
    return ref.id;
  },

  async updateSchedule(id: string, updates: Partial<DoctorDaySchedule>): Promise<void> {
    const ref = doc(db, SCHEDULE_COLLECTION, id);
    const cleanUpdates = removeUndefined(updates as any);
    await updateDoc(ref, cleanUpdates);
  },

  async deleteSchedule(id: string): Promise<void> {
    const ref = doc(db, SCHEDULE_COLLECTION, id);
    await deleteDoc(ref);
  },

  async validateAppointmentForDoctor(doctorId: string, dateTime: Date): Promise<{ ok: boolean; message?: string }> {
    const schedules = await this.getSchedulesByDoctorAndDate(doctorId, dateTime);

    if (schedules.length === 0) {
      console.warn(`[Schedule] validate: sin horarios para doctorId=${doctorId}. Permitiendo cita.`);
      return { ok: true };
    }

    const schedule = schedules[0];
    console.log(`[Schedule] validate: usando schedule id=${schedule.id} date=${schedule.date} mode=${schedule.mode} start=${schedule.startTime} end=${schedule.endTime}`);

    if (schedule.mode === 'unavailable') {
      return {
        ok: false,
        message: 'El doctor no está disponible en la fecha seleccionada.',
      };
    }

    if (schedule.startTime && schedule.endTime) {
      const [startHour, startMin] = schedule.startTime.split(':').map(Number);
      const [endHour, endMin] = schedule.endTime.split(':').map(Number);

      const windowStart = new Date(dateTime);
      windowStart.setHours(startHour, startMin, 0, 0);

      const windowEnd = new Date(dateTime);
      windowEnd.setHours(endHour, endMin, 0, 0);

      const appointmentTime = `${String(dateTime.getHours()).padStart(2, '0')}:${String(dateTime.getMinutes()).padStart(2, '0')}`;
      console.log(`[Schedule] validate: appointmentTime=${appointmentTime}, window=[${schedule.startTime}, ${schedule.endTime}), dateTime=${dateTime.toISOString()}, windowEnd=${windowEnd.toISOString()}`);

      if (dateTime < windowStart || dateTime >= windowEnd) {
        console.warn(`[Schedule] validate: RECHAZADA - ${appointmentTime} fuera de ventana [${schedule.startTime}, ${schedule.endTime})`);
        return {
          ok: false,
          message: `El doctor solo atiende de ${schedule.startTime} a ${schedule.endTime} ese día.`,
        };
      }
    }

    if (typeof schedule.maxPatients === 'number' && schedule.maxPatients > 0) {
      const { start, end } = getDayBounds(dateTime);

      const q = query(
        collection(db, 'appointments'),
        where('doctorId', '==', doctorId),
        where('date', '>=', start),
        where('date', '<=', end)
      );

      const snap = await getDocs(q);
      const appointments = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Appointment));
      const effectiveAppointments = appointments.filter(a => a.status !== 'cancelled');

      if (effectiveAppointments.length >= schedule.maxPatients) {
        return {
          ok: false,
          message: `El doctor ya alcanzó el máximo de pacientes (${schedule.maxPatients}) para ese día.`,
        };
      }
    }

    return { ok: true };
  },
};
