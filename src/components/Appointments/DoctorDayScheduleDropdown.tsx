import React, { useEffect, useState } from 'react';
import { ChevronDown, CheckCircle, AlertTriangle, User, Clock, Users } from 'lucide-react';
import { UserProfile, DoctorDaySchedule } from '../../types';
import { userService } from '../../services/userService';
import { doctorScheduleService } from '../../services/doctorScheduleService';

type DoctorScheduleInfo = {
  doctor: UserProfile;
  scheduleMode: 'available' | 'unavailable' | 'no_rules';
  schedule?: DoctorDaySchedule;
};

interface DoctorDayScheduleDropdownProps {
  disabled?: boolean;
}

export const DoctorDayScheduleDropdown: React.FC<DoctorDayScheduleDropdownProps> = ({ disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorScheduleInfo[]>([]);

  const loadDoctorSchedules = async () => {
    if (disabled) {
      return;
    }

    setLoading(true);
    try {
      const doctors = await userService.getDoctors();
      const today = new Date();

      const entries = await Promise.all(
        doctors.map(async doctor => {
          const schedules = await doctorScheduleService.getSchedulesByDoctorAndDate(doctor.uid, today);

          if (schedules.length === 0) {
            return {
              doctor,
              scheduleMode: 'no_rules' as const,
            };
          }

          const schedule = schedules[0];

          if (schedule.mode === 'unavailable') {
            return {
              doctor,
              scheduleMode: 'unavailable' as const,
              schedule,
            };
          }

          return {
            doctor,
            scheduleMode: 'available' as const,
            schedule,
          };
        })
      );

      setDoctorSchedules(entries);
    } catch (error: any) {
      // Silently fail for permission errors to avoid console noise for restricted roles
      if (error?.code !== 'permission-denied') {
        console.warn('Error cargando horarios de doctores:', error);
      }
      setDoctorSchedules([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctorSchedules();
  }, [disabled]);

  const attending = doctorSchedules.filter(d => d.scheduleMode === 'available' || d.scheduleMode === 'no_rules');
  const notAttending = doctorSchedules.filter(d => d.scheduleMode === 'unavailable');

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(prev => !prev);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled || loading}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold shadow-sm transition-colors ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
        }`}
      >
        <Users className="w-4 h-4 text-slate-500" />
        <span>Doctores de hoy</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute right-0 mt-2 w-[min(100vw-2rem,640px)] z-40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-brand-600" />
                <span className="text-xs font-semibold text-slate-700">Resumen de doctores del día</span>
              </div>
              {loading && (
                <span className="text-[10px] text-slate-400">Actualizando...</span>
              )}
            </div>
            <div className="p-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-red-50 text-red-600 flex items-center justify-center text-[10px] font-bold">
                    !
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      No atienden hoy
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Doctores con el día bloqueado.
                    </p>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {notAttending.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic">
                      Todos los doctores tienen disponibilidad o no tienen reglas para hoy.
                    </p>
                  )}
                  {notAttending.map(item => (
                    <div
                      key={item.doctor.uid}
                      className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-[11px] text-red-700 flex flex-col gap-0.5"
                    >
                      <span className="font-semibold">
                        Dr. {item.doctor.name}
                      </span>
                      {item.doctor.specialty && (
                        <span className="text-[10px] text-red-600/80">
                          {item.doctor.specialty}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle className="w-3 h-3" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      Atienden hoy
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Horarios y límites de pacientes por doctor.
                    </p>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {attending.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic">
                      No hay doctores con disponibilidad registrada para hoy.
                    </p>
                  )}
                  {attending.map(item => {
                    const schedule = item.schedule;
                    const hasHours = schedule && schedule.startTime && schedule.endTime;
                    const hasMaxPatients =
                      schedule && typeof schedule.maxPatients === 'number' && schedule.maxPatients > 0;

                    return (
                      <div
                        key={item.doctor.uid}
                        className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-[11px] text-emerald-800 flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            Dr. {item.doctor.name}
                          </span>
                          {item.doctor.specialty && (
                            <span className="text-[10px] text-emerald-700/80">
                              {item.doctor.specialty}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-emerald-700 border border-emerald-100">
                            <Clock className="w-3 h-3" />
                            <span className="font-semibold">
                              {hasHours
                                ? `${schedule?.startTime} - ${schedule?.endTime}`
                                : 'Sin horario fijo'}
                            </span>
                          </div>
                          {hasMaxPatients && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-emerald-700 border border-emerald-100">
                              <span className="text-[10px] font-semibold">
                                {schedule?.maxPatients} pacientes máx.
                              </span>
                            </div>
                          )}
                          {!schedule && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-slate-600 border border-slate-100">
                              <span className="text-[10px] font-semibold">
                                Sin reglas configuradas para hoy
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

