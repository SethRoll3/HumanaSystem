import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, User, Plus, Edit2, Trash2, Loader2, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { DoctorDaySchedule, DoctorScheduleSettings, UserProfile } from '../../types';
import { userService } from '../../services/userService';
import { doctorScheduleService } from '../../services/doctorScheduleService';

interface DoctorScheduleAdminProps {
  currentUser: UserProfile;
  fixedDoctorId?: string;
}

interface ScheduleFormState {
  date: string;
  mode: 'available' | 'unavailable';
  startTime: string;
  endTime: string;
  maxPatients: string;
}

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return dateStr;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('es-GT', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Guatemala',
  });
};

const buildInitialForm = (): ScheduleFormState => ({
  date: '',
  mode: 'available',
  startTime: '08:00',
  endTime: '17:00',
  maxPatients: '10',
});

const mapScheduleToForm = (s: DoctorDaySchedule): ScheduleFormState => ({
  date: s.date,
  mode: s.mode,
  startTime: s.startTime || '08:00',
  endTime: s.endTime || '17:00',
  maxPatients: typeof s.maxPatients === 'number' && s.maxPatients >= 0 ? String(s.maxPatients) : '',
});

export const DoctorScheduleAdmin: React.FC<DoctorScheduleAdminProps> = ({ currentUser, fixedDoctorId }) => {
  const [settings, setSettings] = useState<DoctorScheduleSettings>({ allowDoctorSelfManage: false });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [doctors, setDoctors] = useState<UserProfile[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');

  const [schedules, setSchedules] = useState<DoctorDaySchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<ScheduleFormState>(buildInitialForm());
  const [editingSchedule, setEditingSchedule] = useState<DoctorDaySchedule | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const schedulesByDate = useMemo(() => {
    const map: Record<string, DoctorDaySchedule> = {};
    schedules.forEach(s => {
      if (s.date) {
        map[s.date] = s;
      }
    });
    return map;
  }, [schedules]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const formatShortDay = (date: Date) => {
    return date.toLocaleDateString('es-GT', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: 'America/Guatemala',
    });
  };

  const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      try {
        const s = await doctorScheduleService.getGlobalSettings();
        if (!active) return;
        setSettings(s);
      } catch (e) {
        console.error('Error cargando configuración de horarios (admin):', e);
        toast.error('Error cargando configuración de horarios');
      } finally {
        if (active) setSettingsLoading(false);
      }
    };

    const loadDoctors = async () => {
      if (fixedDoctorId) {
        setDoctors([currentUser]);
        setSelectedDoctorId(fixedDoctorId);
        setDoctorsLoading(false);
        return;
      }

      try {
        const list = await userService.getDoctors();
        if (!active) return;
        setDoctors(list);
        if (list.length > 0) {
          setSelectedDoctorId(list[0].uid);
        }
      } catch (e) {
        toast.error('Error cargando doctores');
      } finally {
        if (active) setDoctorsLoading(false);
      }
    };

    loadSettings();
    loadDoctors();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadSchedules = async () => {
      if (!selectedDoctorId) {
        setSchedules([]);
        return;
      }
      setSchedulesLoading(true);
      try {
        const list = await doctorScheduleService.getSchedulesByDoctor(selectedDoctorId);
        if (!active) return;
        setSchedules(list);
      } catch (e) {
        console.error('Error cargando horarios del doctor (admin):', e);
        toast.error('Error cargando horarios del doctor');
      } finally {
        if (active) setSchedulesLoading(false);
      }
    };

    loadSchedules();

    return () => {
      active = false;
    };
  }, [selectedDoctorId]);

  const handleToggleSelfManage = async () => {
    try {
      setSettingsSaving(true);
      const next = !settings.allowDoctorSelfManage;
      await doctorScheduleService.updateGlobalSettings({ allowDoctorSelfManage: next });
      setSettings({ allowDoctorSelfManage: next });
      toast.success(
        next
          ? 'Los doctores ahora pueden gestionar su propio horario.'
          : 'Los doctores ya no pueden gestionar su propio horario.'
      );
    } catch (e) {
      toast.error('No se pudo actualizar la configuración');
    } finally {
      setSettingsSaving(false);
    }
  };

  const openNewForm = () => {
    if (!selectedDoctorId) {
      toast.error('Seleccione un doctor primero');
      return;
    }
    setEditingSchedule(null);
    setFormState(buildInitialForm());
    setIsFormOpen(true);
  };

  const openEditForm = (s: DoctorDaySchedule) => {
    setEditingSchedule(s);
    setFormState(mapScheduleToForm(s));
    setIsFormOpen(true);
  };

  const openWeeklyDayEditor = (date: Date) => {
    if (!selectedDoctorId) {
      toast.error('Seleccione un doctor');
      return;
    }
    const dateKey = toDateKey(date);
    const existing = schedulesByDate[dateKey] || null;
    if (existing) {
      setEditingSchedule(existing);
      setFormState(mapScheduleToForm(existing));
    } else {
      setEditingSchedule(null);
      setFormState({
        ...buildInitialForm(),
        date: dateKey,
      });
    }
    setIsFormOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!selectedDoctorId) {
      toast.error('Seleccione un doctor');
      return;
    }
    if (!formState.date) {
      toast.error('Seleccione una fecha');
      return;
    }
    if (formState.mode === 'available') {
      if (!formState.startTime || !formState.endTime) {
        toast.error('Defina horario de inicio y fin');
        return;
      }
      if (formState.startTime >= formState.endTime) {
        toast.error('La hora de inicio debe ser menor que la de fin');
        return;
      }
    }

    const maxPatientsNumber =
      formState.mode === 'available' && formState.maxPatients.trim()
        ? parseInt(formState.maxPatients, 10)
        : undefined;

    if (formState.mode === 'available' && Number.isNaN(maxPatientsNumber as number)) {
      toast.error('El máximo de pacientes debe ser un número válido');
      return;
    }

    try {
      setIsSavingSchedule(true);
      const doctor = doctors.find(d => d.uid === selectedDoctorId);

      if (editingSchedule && editingSchedule.id) {
        await doctorScheduleService.updateSchedule(editingSchedule.id, {
          date: formState.date,
          mode: formState.mode,
          startTime: formState.mode === 'available' ? formState.startTime : undefined,
          endTime: formState.mode === 'available' ? formState.endTime : undefined,
          maxPatients:
            formState.mode === 'available' && typeof maxPatientsNumber === 'number'
              ? maxPatientsNumber
              : undefined,
        });
        toast.success('Horario actualizado');
      } else {
        await doctorScheduleService.createSchedule({
          doctorId: selectedDoctorId,
          doctorName: doctor?.name || 'Sin nombre',
          date: formState.date,
          mode: formState.mode,
          startTime: formState.mode === 'available' ? formState.startTime : undefined,
          endTime: formState.mode === 'available' ? formState.endTime : undefined,
          maxPatients:
            formState.mode === 'available' && typeof maxPatientsNumber === 'number'
              ? maxPatientsNumber
              : undefined,
          createdBy: currentUser.uid,
        });
        toast.success('Horario creado');
      }

      const list = await doctorScheduleService.getSchedulesByDoctor(selectedDoctorId);
      setSchedules(list);
      setIsFormOpen(false);
      setEditingSchedule(null);
    } catch (e) {
      console.error('Error guardando horario de doctor (admin):', e);
      toast.error('No se pudo guardar el horario');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!selectedDoctorId) return;
    setDeletingId(id);
    try {
      await doctorScheduleService.deleteSchedule(id);
      const list = await doctorScheduleService.getSchedulesByDoctor(selectedDoctorId);
      setSchedules(list);
      toast.success('Horario eliminado');
    } catch (e) {
      console.error('Error eliminando horario de doctor (admin):', e);
      toast.error('No se pudo eliminar el horario');
    } finally {
      setDeletingId(null);
    }
  };

  const selectedDoctor = doctors.find(d => d.uid === selectedDoctorId) || null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b bg-slate-50/60 flex flex-col md:flex-row gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-500/30">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-slate-400">
              {fixedDoctorId ? 'Mi Agenda' : 'Agenda personalizada'}
            </p>
            <h2 className="text-xl font-bold text-slate-900">
              {fixedDoctorId ? 'Gestión de Horario' : 'Horario de doctores'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {fixedDoctorId ? 'Gestione sus días disponibles y horarios de atención.' : 'Defina días disponibles, horarios y cupos máximos por doctor.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-stretch md:items-end gap-2">
          {!fixedDoctorId && (
            <>
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Autogestión de horario
                  </span>
                  <span className="text-xs font-semibold text-slate-700">
                    {settings.allowDoctorSelfManage
                      ? 'Habilitada para doctores'
                      : 'Solo administradores pueden editar'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleToggleSelfManage}
                  disabled={settingsLoading || settingsSaving}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                    settings.allowDoctorSelfManage
                      ? 'bg-emerald-500'
                      : 'bg-slate-300'
                  } ${settingsSaving ? 'opacity-70 cursor-wait' : ''}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition ${
                      settings.allowDoctorSelfManage ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 max-w-xs text-right">
                Si está activado, los doctores verán una sección llamada
                <span className="font-bold text-slate-600"> “Mi horario”</span>{' '}
                en su panel para gestionar solo sus propios días.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row">
        {!fixedDoctorId && (
          <div className="md:w-72 border-r border-slate-100 bg-slate-50/40 p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white rounded-xl border border-slate-200">
                  <User className="w-4 h-4 text-brand-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Selección de doctor
                  </p>
                  <p className="text-xs font-semibold text-slate-800">
                    {selectedDoctor ? selectedDoctor.name : 'No seleccionado'}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Doctores activos
                </span>
                {doctorsLoading && (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                )}
              </div>
              <div className="max-h-72 overflow-y-auto custom-scrollbar">
                {doctors.length === 0 && !doctorsLoading ? (
                  <div className="p-4 text-xs text-slate-400 text-center">
                    No hay doctores registrados.
                  </div>
                ) : (
                  doctors.map(doc => (
                    <button
                      key={doc.uid}
                      type="button"
                      onClick={() => setSelectedDoctorId(doc.uid)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs border-b last:border-b-0 border-slate-100 ${
                        selectedDoctorId === doc.uid
                          ? 'bg-brand-50 text-brand-700 font-semibold'
                          : 'bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <span className="truncate">{doc.name}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                        {doc.specialty || 'Sin especialidad'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-600" />
              <span className="text-xs font-semibold text-slate-700">
                {selectedDoctor
                  ? `Agenda de ${selectedDoctor.name}`
                  : 'Seleccione un doctor para ver y editar su agenda'}
              </span>
            </div>
            <button
              type="button"
              onClick={openNewForm}
              disabled={!selectedDoctorId}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold shadow-md hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Nuevo día
            </button>
          </div>

          <div className="px-4 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                Semana
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {weekDays[0]
                  ? formatShortDay(weekDays[0])
                  : ''}{' '}
                -{' '}
                {weekDays[weekDays.length - 1]
                  ? formatShortDay(weekDays[weekDays.length - 1])
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const prev = new Date(weekStart);
                  prev.setDate(weekStart.getDate() - 7);
                  setWeekStart(prev);
                }}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = new Date(weekStart);
                  next.setDate(weekStart.getDate() + 7);
                  setWeekStart(next);
                }}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="px-4 py-3 bg-white border-b border-slate-100">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {weekDays.map(d => {
                const dateKey = toDateKey(d);
                const schedule = schedulesByDate[dateKey];
                const isUnavailable = schedule?.mode === 'unavailable';
                const isAvailable = schedule?.mode === 'available';
                const hasRule = !!schedule;
                const label =
                  !hasRule
                    ? 'Sin configuración'
                    : isUnavailable
                    ? 'No disponible'
                    : 'Atendiendo';
                const maxLabel =
                  isAvailable && typeof schedule?.maxPatients === 'number' && schedule.maxPatients > 0
                    ? `${schedule.maxPatients} pacientes máximo`
                    : isAvailable
                    ? 'Sin límite específico de pacientes'
                    : '';

                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => openWeeklyDayEditor(d)}
                    disabled={!selectedDoctorId}
                    className={`flex flex-col items-start gap-1 px-3 py-2 rounded-2xl border text-left transition ${
                      !hasRule
                        ? 'border-slate-200 bg-slate-50/40 hover:bg-slate-50'
                        : isUnavailable
                        ? 'border-red-100 bg-red-50/40'
                        : 'border-emerald-100 bg-emerald-50/40'
                    } ${!selectedDoctorId ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    <span className="text-[11px] font-semibold text-slate-700">
                      {formatShortDay(d)}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
                        !hasRule
                          ? 'text-slate-400'
                          : isUnavailable
                          ? 'text-red-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {label}
                    </span>
                    {maxLabel && (
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        {maxLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Los domingos no se incluyen en este plano semanal.
            </p>
          </div>

          <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar bg-white">
            {schedulesLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs font-semibold">
                  Cargando horarios del doctor...
                </span>
              </div>
            ) : schedules.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-dashed border-slate-200 rounded-3xl p-6 flex flex-col items-center justify-center text-center bg-slate-50/40"
              >
                <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center mb-3">
                  <CalendarIcon className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Aún no hay días configurados para este doctor.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Agregue días de disponibilidad, marque ausencias o limite la
                  cantidad de pacientes.
                </p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {schedules.map(s => {
                  const isUnavailable = s.mode === 'unavailable';
                  const maxLabel = isUnavailable
                    ? 'No se atiende este día'
                    : typeof s.maxPatients === 'number' && s.maxPatients > 0
                      ? `${s.maxPatients} pacientes máximo`
                      : 'Sin límite específico de pacientes';
                  const hasHours = s.startTime && s.endTime;
                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm overflow-hidden flex items-stretch"
                    >
                      <div
                        className={`w-1 ${
                          isUnavailable ? 'bg-red-400' : 'bg-emerald-500'
                        }`}
                      />
                      <div className="flex-1 p-3 flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                              {formatDateDisplay(s.date)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] ${
                                isUnavailable
                                  ? 'bg-red-50 text-red-600 border border-red-100'
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              }`}
                            >
                              {isUnavailable ? 'No disponible' : 'Atendiendo'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditForm(s)}
                              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-brand-600 hover:border-brand-200 text-xs font-semibold flex items-center gap-1"
                            >
                              <Edit2 className="w-3 h-3" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                s.id && !deletingId && handleDeleteSchedule(s.id)
                              }
                              disabled={deletingId === s.id}
                              className="p-2 rounded-xl bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                            >
                              {deletingId === s.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                              Eliminar
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 mt-1">
                          {hasHours && (
                            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-slate-100">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span className="font-semibold">
                                {s.startTime} - {s.endTime}
                              </span>
                            </div>
                          )}
                          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-slate-100">
                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                            <span>{maxLabel}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-md">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      {editingSchedule ? 'Editar día' : 'Nuevo día'}
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {selectedDoctor ? selectedDoctor.name : 'Sin doctor seleccionado'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isSavingSchedule) {
                      setIsFormOpen(false);
                      setEditingSchedule(null);
                    }
                  }}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
                >
                  Cerrar
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                    value={formState.date}
                    onChange={e =>
                      setFormState(prev => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                    Modo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState(prev => ({ ...prev, mode: 'available' }))
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                        formState.mode === 'available'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Atendiendo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState(prev => ({ ...prev, mode: 'unavailable' }))
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                        formState.mode === 'unavailable'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      No disponible
                    </button>
                  </div>
                </div>

                {formState.mode === 'available' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                        Hora inicio
                      </label>
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                        value={formState.startTime}
                        onChange={e =>
                          setFormState(prev => ({
                            ...prev,
                            startTime: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                        Hora fin
                      </label>
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                        value={formState.endTime}
                        onChange={e =>
                          setFormState(prev => ({
                            ...prev,
                            endTime: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                {formState.mode === 'available' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                      Máximo de pacientes para ese día
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                      value={formState.maxPatients}
                      onChange={e =>
                        setFormState(prev => ({
                          ...prev,
                          maxPatients: e.target.value.replace(/[^0-9]/g, ''),
                        }))
                      }
                      placeholder="Opcional, 0 = sin límite explícito"
                    />
                  </div>
                )}

                <div className="flex items-start gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Estas reglas se aplican por día completo. Cuando un día
                    está marcado como no disponible o se alcanza el máximo de
                    pacientes, ya no será posible agendar nuevas citas en esa
                    fecha para este doctor.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSavingSchedule) {
                      setIsFormOpen(false);
                      setEditingSchedule(null);
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={isSavingSchedule}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-700 flex items-center gap-2 disabled:opacity-60"
                >
                  {isSavingSchedule && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Guardar horario
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

interface DoctorSelfScheduleProps {
  currentUser: UserProfile;
}

export const DoctorSelfSchedule: React.FC<DoctorSelfScheduleProps> = ({
  currentUser,
}) => {
  const [settings, setSettings] = useState<DoctorScheduleSettings>({
    allowDoctorSelfManage: false,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [schedules, setSchedules] = useState<DoctorDaySchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formState, setFormState] = useState<ScheduleFormState>(buildInitialForm());
  const [editingSchedule, setEditingSchedule] = useState<DoctorDaySchedule | null>(
    null
  );
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const s = await doctorScheduleService.getGlobalSettings();
        if (!active) return;
        setSettings(s);
      } catch (e) {
        console.error('Error cargando configuración de horario (self):', e);
        toast.error('Error cargando configuración de horario');
      } finally {
        if (active) setSettingsLoading(false);
      }

      try {
        setSchedulesLoading(true);
        const list = await doctorScheduleService.getSchedulesByDoctor(
          currentUser.uid
        );
        if (!active) return;
        setSchedules(list);
      } catch (e) {
        console.error('Error cargando sus horarios de doctor (self):', e);
        toast.error('Error cargando sus horarios');
      } finally {
        if (active) setSchedulesLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [currentUser.uid]);

  const openNewForm = () => {
    if (!settings.allowDoctorSelfManage) {
      toast.error('La autogestión de horario está desactivada por el administrador');
      return;
    }
    setEditingSchedule(null);
    setFormState(buildInitialForm());
    setIsFormOpen(true);
  };

  const openEditForm = (s: DoctorDaySchedule) => {
    if (!settings.allowDoctorSelfManage) {
      toast.error('Actualmente solo lectura. Consulte con el administrador.');
      return;
    }
    setEditingSchedule(s);
    setFormState(mapScheduleToForm(s));
    setIsFormOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!settings.allowDoctorSelfManage) {
      toast.error('La autogestión de horario está desactivada');
      return;
    }
    if (!formState.date) {
      toast.error('Seleccione una fecha');
      return;
    }
    if (formState.mode === 'available') {
      if (!formState.startTime || !formState.endTime) {
        toast.error('Defina horario de inicio y fin');
        return;
      }
      if (formState.startTime >= formState.endTime) {
        toast.error('La hora de inicio debe ser menor que la de fin');
        return;
      }
    }

    const maxPatientsNumber =
      formState.mode === 'available' && formState.maxPatients.trim()
        ? parseInt(formState.maxPatients, 10)
        : undefined;

    if (formState.mode === 'available' && Number.isNaN(maxPatientsNumber as number)) {
      toast.error('El máximo de pacientes debe ser un número válido');
      return;
    }

    try {
      setIsSavingSchedule(true);

      if (editingSchedule && editingSchedule.id) {
        await doctorScheduleService.updateSchedule(editingSchedule.id, {
          date: formState.date,
          mode: formState.mode,
          startTime: formState.mode === 'available' ? formState.startTime : undefined,
          endTime: formState.mode === 'available' ? formState.endTime : undefined,
          maxPatients:
            formState.mode === 'available' && typeof maxPatientsNumber === 'number'
              ? maxPatientsNumber
              : undefined,
        });
        toast.success('Horario actualizado');
      } else {
        await doctorScheduleService.createSchedule({
          doctorId: currentUser.uid,
          doctorName: currentUser.name,
          date: formState.date,
          mode: formState.mode,
          startTime: formState.mode === 'available' ? formState.startTime : undefined,
          endTime: formState.mode === 'available' ? formState.endTime : undefined,
          maxPatients:
            formState.mode === 'available' && typeof maxPatientsNumber === 'number'
              ? maxPatientsNumber
              : undefined,
          createdBy: currentUser.uid,
        });
        toast.success('Horario creado');
      }

      const list = await doctorScheduleService.getSchedulesByDoctor(currentUser.uid);
      setSchedules(list);
      setIsFormOpen(false);
      setEditingSchedule(null);
    } catch (e) {
      console.error('Error guardando horario de doctor (self):', e);
      toast.error('No se pudo guardar el horario');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!settings.allowDoctorSelfManage) {
      toast.error('La autogestión de horario está desactivada');
      return;
    }
    setDeletingId(id);
    try {
      await doctorScheduleService.deleteSchedule(id);
      const list = await doctorScheduleService.getSchedulesByDoctor(currentUser.uid);
      setSchedules(list);
      toast.success('Horario eliminado');
    } catch (e) {
      console.error('Error eliminando horario de doctor (self):', e);
      toast.error('No se pudo eliminar el horario');
    } finally {
      setDeletingId(null);
    }
  };

  const canEdit = settings.allowDoctorSelfManage;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  Mi horario de atención
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  Defina sus días disponibles y cupos máximos
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={openNewForm}
              disabled={!canEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Nuevo día
            </button>
          </div>
          <div className="px-6 py-3 bg-slate-50/60 border-b flex items-center gap-3">
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verificando permisos de autogestión...
              </div>
            ) : canEdit ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle className="w-4 h-4" />
                Autogestión habilitada. Los cambios que haga afectan nuevas citas.
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                El administrador ha desactivado la autogestión. Su horario es solo de
                consulta.
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <div className="space-y-3">
        {schedulesLoading ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs font-semibold">
              Cargando sus horarios configurados...
            </span>
          </div>
        ) : schedules.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-600"
          >
            Aún no ha definido días personalizados. Si no configura nada, el sistema
            asumirá disponibilidad general y sin límite explícito de pacientes, según
            las políticas de la clínica.
          </motion.div>
        ) : (
          schedules.map(s => {
            const isUnavailable = s.mode === 'unavailable';
            const maxLabel = isUnavailable
              ? 'No se atiende este día'
              : typeof s.maxPatients === 'number' && s.maxPatients > 0
                ? `${s.maxPatients} pacientes máximo`
                : 'Sin límite específico de pacientes';
            const hasHours = s.startTime && s.endTime;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex items-stretch"
              >
                <div
                  className={`w-1 ${
                    isUnavailable ? 'bg-red-400' : 'bg-emerald-500'
                  }`}
                />
                <div className="flex-1 p-3 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        {formatDateDisplay(s.date)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.18em] ${
                          isUnavailable
                            ? 'bg-red-50 text-red-600 border border-red-100'
                            : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}
                      >
                        {isUnavailable ? 'No atiende' : 'Atendiendo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEditForm(s)}
                        disabled={!canEdit}
                        className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-brand-600 hover:border-brand-200 text-xs font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Edit2 className="w-3 h-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => s.id && handleDeleteSchedule(s.id)}
                        disabled={!canEdit || deletingId === s.id}
                        className="p-2 rounded-xl bg-red-50 border border-red-100 text-red-500 hover:bg-red-100 text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        {deletingId === s.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Eliminar
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 mt-1">
                    {hasHours && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 border border-slate-100">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="font-semibold">
                          {s.startTime} - {s.endTime}
                        </span>
                      </div>
                    )}
                    <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 border border-slate-100">
                      <CheckCircle className="w-3 h-3 text-emerald-500" />
                      <span>{maxLabel}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="px-6 py-4 border-b flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      {editingSchedule ? 'Editar día' : 'Nuevo día'}
                    </p>
                    <p className="text-sm font-semibold text-slate-800">
                      {currentUser.name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!isSavingSchedule) {
                      setIsFormOpen(false);
                      setEditingSchedule(null);
                    }
                  }}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
                >
                  Cerrar
                </button>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                    Fecha
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                    value={formState.date}
                    onChange={e =>
                      setFormState(prev => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                    Modo
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState(prev => ({ ...prev, mode: 'available' }))
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                        formState.mode === 'available'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      Atendiendo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormState(prev => ({ ...prev, mode: 'unavailable' }))
                      }
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                        formState.mode === 'unavailable'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      No atiende
                    </button>
                  </div>
                </div>

                {formState.mode === 'available' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                        Hora inicio
                      </label>
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                        value={formState.startTime}
                        onChange={e =>
                          setFormState(prev => ({
                            ...prev,
                            startTime: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                        Hora fin
                      </label>
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                        value={formState.endTime}
                        onChange={e =>
                          setFormState(prev => ({
                            ...prev,
                            endTime: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.18em]">
                    Máximo de pacientes para ese día
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-400"
                    value={formState.maxPatients}
                    onChange={e =>
                      setFormState(prev => ({
                        ...prev,
                        maxPatients: e.target.value.replace(/[^0-9]/g, ''),
                      }))
                    }
                    placeholder="Opcional, 0 = sin límite explícito"
                  />
                </div>

                <div className="flex items-start gap-2 mt-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Este horario se usa para bloquear días completos o limitar la
                    carga diaria de pacientes. Si marca un día como no disponible,
                    no se podrán crear nuevas citas para esa fecha.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSavingSchedule) {
                      setIsFormOpen(false);
                      setEditingSchedule(null);
                    }
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={isSavingSchedule}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-2 disabled:opacity-60"
                >
                  {isSavingSchedule && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Guardar horario
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
