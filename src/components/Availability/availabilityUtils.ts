import { Appointment, DoctorDaySchedule } from '../../types';

export const normalizeText = (value?: string) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const ensureDate = (value: any): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (value instanceof Object && 'toDate' in value) return (value as any).toDate();
  if (typeof value === 'number') return new Date(value);
  if ((value as any)?.seconds) {
    return new Date((value as any).seconds * 1000);
  }
  return new Date(value);
};

const parseTimeToMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getAppointmentRangeMinutes = (appt: Appointment) => {
  const start = ensureDate(appt.date);
  const end = appt.endDate ? ensureDate(appt.endDate) : null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  if (end) {
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    return { startMinutes, endMinutes };
  }
  const duration =
    typeof appt.duration === 'number' && appt.duration > 0
      ? appt.duration
      : appt.consultationType === 'Nueva'
      ? 60
      : 30;
  return { startMinutes, endMinutes: startMinutes + duration };
};

export const buildAvailableSlots = ({
  schedule,
  appointments,
  slotMinutes
}: {
  schedule: DoctorDaySchedule | undefined;
  appointments: Appointment[];
  slotMinutes: number;
}) => {
  if (!schedule || schedule.mode !== 'available') return [];
  if (!schedule.startTime || !schedule.endTime) return [];
  const startMinutes = parseTimeToMinutes(schedule.startTime);
  const endMinutes = parseTimeToMinutes(schedule.endTime);
  if (endMinutes <= startMinutes) return [];

  const effectiveAppointments = appointments.filter(
    appt => appt.status !== 'cancelled' && appt.status !== 'no_show'
  );

  if (typeof schedule.maxPatients === 'number' && schedule.maxPatients > 0) {
    if (effectiveAppointments.length >= schedule.maxPatients) return [];
  }

  const ranges = effectiveAppointments.map(getAppointmentRangeMinutes);
  const slots: string[] = [];

  for (let t = startMinutes; t + slotMinutes <= endMinutes; t += slotMinutes) {
    const slotStart = t;
    const slotEnd = t + slotMinutes;
    const overlaps = ranges.some(r => slotStart < r.endMinutes && slotEnd > r.startMinutes);
    if (!overlaps) {
      slots.push(minutesToTime(slotStart));
    }
  }

  return slots;
};
