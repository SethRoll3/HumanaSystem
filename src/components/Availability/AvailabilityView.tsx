import React, { useEffect, useMemo, useState } from 'react';
import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import { Calendar, Clock } from 'lucide-react';
import { Appointment, DoctorDaySchedule, UserProfile } from '../../types';
import { appointmentService } from '../../services/appointmentService';
import { doctorScheduleService } from '../../services/doctorScheduleService';
import { AvailabilityDoctorSelect } from './AvailabilityDoctorSelect';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { AvailabilitySlots } from './AvailabilitySlots';
import { buildAvailableSlots, ensureDate, toDateKey } from './availabilityUtils';

interface AvailabilityViewProps {
  currentUser: UserProfile;
  doctors: UserProfile[];
}

const SLOT_MINUTES = 15;

export const AvailabilityView: React.FC<AvailabilityViewProps> = ({ currentUser, doctors }) => {
  const isDoctor = currentUser.role === 'doctor' || currentUser.role === 'licenciado';
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(isDoctor ? currentUser.uid : '');
  const [doctorSearchTerm, setDoctorSearchTerm] = useState('');
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [schedules, setSchedules] = useState<DoctorDaySchedule[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedDoctorId && doctors.length > 0) {
      setSelectedDoctorId(doctors[0].uid);
    }
  }, [doctors, selectedDoctorId]);

  useEffect(() => {
    if (!selectedDoctorId) return;
    const load = async () => {
      setLoading(true);
      try {
        const [scheduleList, appointmentList] = await Promise.all([
          doctorScheduleService.getSchedulesByDoctor(selectedDoctorId),
          appointmentService.getAppointmentsByRange(startOfMonth(monthDate), endOfMonth(monthDate))
        ]);
        const doctorAppointments = appointmentList.filter(a => a.doctorId === selectedDoctorId);
        setSchedules(scheduleList);
        setAppointments(doctorAppointments);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedDoctorId, monthDate]);

  const scheduleByDate = useMemo(() => {
    const map: Record<string, DoctorDaySchedule> = {};
    schedules.forEach(s => {
      map[s.date] = s;
    });
    return map;
  }, [schedules]);

  const currentDoctor = useMemo(() => doctors.find(d => d.uid === selectedDoctorId), [doctors, selectedDoctorId]);

  const getScheduleForDate = (date: Date): DoctorDaySchedule | null => {
    const key = toDateKey(date);
    if (scheduleByDate[key]) return scheduleByDate[key];
    
    if (currentDoctor?.weeklySchedule) {
      const dayOfWeek = date.getDay();
      const rule = currentDoctor.weeklySchedule[dayOfWeek];
      if (rule) {
        return {
          id: `weekly-${key}`,
          doctorId: selectedDoctorId,
          doctorName: currentDoctor.name,
          date: key,
          mode: rule.mode,
          startTime: rule.startTime,
          endTime: rule.endTime,
          createdAt: new Date(),
          createdBy: 'system'
        };
      }
    }
    return null;
  };

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    appointments.forEach(appt => {
      const date = ensureDate(appt.date);
      const key = toDateKey(date);
      if (!map[key]) map[key] = [];
      map[key].push(appt);
    });
    return map;
  }, [appointments]);

  const availabilityByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      const key = toDateKey(date);
      const schedule = getScheduleForDate(date);
      if (schedule && schedule.mode === 'available') {
        const slots = buildAvailableSlots({
          schedule,
          appointments: appointmentsByDate[key] || [],
          slotMinutes: SLOT_MINUTES
        });
        map[key] = slots.length > 0;
      } else {
        map[key] = false;
      }
    }
    return map;
  }, [scheduleByDate, appointmentsByDate, currentDoctor, monthDate]);

  const selectedDateKey = toDateKey(selectedDate);
  const selectedSchedule = getScheduleForDate(selectedDate);
  const selectedAppointments = appointmentsByDate[selectedDateKey] || [];
  const selectedSlots = buildAvailableSlots({
    schedule: selectedSchedule,
    appointments: selectedAppointments,
    slotMinutes: SLOT_MINUTES
  });
  const scheduleLabel = selectedSchedule?.mode === 'available'
    ? `${selectedSchedule.startTime || '--:--'} - ${selectedSchedule.endTime || '--:--'}`
    : selectedSchedule?.mode === 'unavailable'
    ? 'No disponible'
    : 'Sin horario';
  const isUnavailable = selectedSchedule?.mode === 'unavailable';

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-500/30">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-slate-400">
              Disponibilidad
            </p>
            <h2 className="text-lg font-bold text-slate-900">
              Horarios disponibles por doctor
            </h2>
            <p className="text-xs text-slate-500">
              Se calcula con base en horarios registrados y citas existentes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-blue-50 border border-blue-100 px-3 py-2 rounded-xl">
          <Clock className="w-4 h-4 text-blue-600" />
          Intervalo de {SLOT_MINUTES} minutos
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <AvailabilityDoctorSelect
          doctors={doctors}
          selectedDoctorId={selectedDoctorId}
          onSelectDoctor={setSelectedDoctorId}
          searchTerm={doctorSearchTerm}
          onSearchTermChange={setDoctorSearchTerm}
        />

        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
          <AvailabilityCalendar
            monthDate={monthDate}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            availabilityByDate={availabilityByDate}
            onPrevMonth={() => setMonthDate(prev => addMonths(prev, -1))}
            onNextMonth={() => setMonthDate(prev => addMonths(prev, 1))}
          />

          <AvailabilitySlots
            date={selectedDate}
            slots={selectedSlots}
            scheduleLabel={loading ? 'Cargando...' : scheduleLabel}
            isUnavailable={!!isUnavailable}
          />
        </div>
      </div>
    </div>
  );
};
