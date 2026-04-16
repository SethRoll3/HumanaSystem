import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Plus, Filter, Search, Calendar as CalendarIcon, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Stethoscope, Video, Users } from 'lucide-react';
import { appointmentService } from '../services/appointmentService';
import { userService } from '../services/userService';
import { getSpecialties } from '../services/inventoryService';
import { notifyAppointmentCancelled } from '../services/notificationService';
import { notifyAppointmentCancellationToAdmins } from '../services/emailService';
import { patientService } from '../services/patientService';
import { Appointment, UserProfile, Patient, Specialty } from '../types';
import { CreateAppointmentModal } from '../components/Appointments/CreateAppointmentModal';
import { AppointmentDetailsModal } from '../components/Appointments/AppointmentDetailsModal';
import { ResidentIntakeModal } from '../components/Appointments/ResidentIntakeModal';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';
import i18next from 'i18next';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const messages = {
  allDay: 'Todo el día',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Evento',
  noEventsInRange: 'No hay citas en este rango',
};

type CalendarAppointment = Appointment & { resourceId?: string };

const statusStyles = {
  scheduled: { bg: '#F1F5F9', border: '#94A3B8', text: '#475569' },
  confirmed_phone: { bg: '#FEF9C3', border: '#FACC15', text: '#854D0E' },
  paid_checked_in: { bg: '#DCFCE7', border: '#4ADE80', text: '#166534' },
  resident_intake: { bg: '#E0F2FE', border: '#38BDF8', text: '#0EA5E9' },
  in_progress: { bg: '#DBEAFE', border: '#60A5FA', text: '#1E40AF' },
  completed: { bg: '#E2E8F0', border: '#CBD5E1', text: '#64748B' },
  cancelled: { bg: '#FEE2E2', border: '#F87171', text: '#991B1B' },
  no_show: { bg: '#E5E7EB', border: '#6B7280', text: '#111827' }, // Más oscuro para diferenciar
} as const;

type AppointmentStatusKey = keyof typeof statusStyles;

if (!i18next.isInitialized) {
  i18next.init({
    lng: 'es',
    fallbackLng: 'es',
    resources: {
      es: {
        translation: {
          appointmentStatus: {
            scheduled: 'Agendada',
            confirmed_phone: 'Confirmada por teléfono',
            paid_checked_in: 'Pagada / Check-in',
            resident_intake: 'Con enfermería',
            in_progress: 'En consulta',
            completed: 'Finalizada',
            cancelled: 'Cancelada',
            no_show: 'No se presentó'
          }
        }
      }
    }
  });
}

const translateStatus = (status: string) => {
  return i18next.t(`appointmentStatus.${status}`, {
    defaultValue: status.replace(/_/g, ' ')
  });
};

const statusOptions: { key: AppointmentStatusKey; label: string }[] = [
  { key: 'scheduled',        label: 'Creada' },
  { key: 'confirmed_phone',  label: 'Confirmada' },
  { key: 'paid_checked_in',  label: 'Pagada / Check-in' },
  { key: 'resident_intake',  label: 'Con enfermería' },
  { key: 'in_progress',      label: 'En consulta' },
  { key: 'completed',        label: 'Finalizada' },
  { key: 'cancelled',        label: 'Cancelada' },
  { key: 'no_show',          label: 'No se presentó' },
];

interface AppointmentCalendarProps {
    user?: UserProfile; 
}

const CustomMonthView = ({ 
    date, 
    appointments, 
    onSelectSlot, 
    onSelectEvent,
    onShowDayAppointments
}: { 
    date: Date, 
    appointments: CalendarAppointment[], 
    onSelectSlot: (d: Date) => void,
    onSelectEvent: (app: Appointment) => void,
    onShowDayAppointments: (day: Date, apps: CalendarAppointment[]) => void
}) => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); 
    const endDate = startOfWeek(monthEnd, { weekStartsOn: 0 });
    endDate.setDate(endDate.getDate() + 6);

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    return (
        <div className="flex flex-col h-full bg-white overflow-hidden">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {weekDays.map(day => (
                    <div key={day} className="py-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                        {day}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-fr flex-1 overflow-y-auto">
                {calendarDays.map((day, idx) => {
                    const dayApps = appointments.filter(app => isSameDay(app.date, day));
                    const isCurrentMonth = isSameMonth(day, date);
                    
                    return (
                        <div 
                            key={day.toISOString()} 
                            onClick={() => onSelectSlot(day)}
                            className={`
                                min-h-[100px] border-b border-r border-slate-100 p-2 transition-colors cursor-pointer hover:bg-slate-50
                                ${!isCurrentMonth ? 'bg-slate-50/50 text-slate-400' : 'bg-white'}
                                ${isSameDay(day, new Date()) ? 'bg-blue-50/30' : ''}
                            `}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`text-sm font-bold ${isSameDay(day, new Date()) ? 'bg-blue-600 text-white w-6 h-6 flex items-center justify-center rounded-full' : ''}`}>
                                    {format(day, 'd')}
                                </span>
                            </div>
                            
                            <div className="space-y-1">
                                {dayApps.slice(0, 3).map(app => (
                                    <div 
                                        key={app.id}
                                        onClick={(e) => { e.stopPropagation(); onSelectEvent(app); }}
                                        className="text-xs px-1.5 py-0.5 rounded border truncate font-medium cursor-pointer hover:brightness-95 transition-all"
                                        style={{ 
                                            backgroundColor: statusStyles[app.status]?.bg || '#eee',
                                            borderColor: statusStyles[app.status]?.border || '#ccc',
                                            color: statusStyles[app.status]?.text || '#333'
                                        }}
                                        title={`${format(app.date, 'HH:mm')} - ${app.patientName}`}
                                    >
                                        <div className="flex items-center gap-1">
                                            {app.isIGSS && (
                                                <span className="px-1 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-300 text-[9px] font-extrabold uppercase tracking-[0.12em]">
                                                    IGSS
                                                </span>
                                            )}
                                            {app.modality === 'Virtual' ? <Video className="w-3 h-3 flex-shrink-0" /> : <Users className="w-3 h-3 flex-shrink-0" />}
                                            <span className="truncate">{format(app.date, 'HH:mm')} {app.patientName}</span>
                                        </div>
                                    </div>
                                ))}
                                {dayApps.length > 3 && (
                                    <button
                                        type="button"
                                        className="w-full text-xs text-blue-600 font-bold text-center mt-0.5 hover:underline"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onShowDayAppointments(day, dayApps);
                                        }}
                                    >
                                        + {dayApps.length - 3} más
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const AppointmentCalendar: React.FC<AppointmentCalendarProps> = ({ user }) => {
  const isDoctor = user?.role === 'doctor' || user?.role === 'licenciado';
  const isAdmin = user?.role === 'admin';
  const isReceptionist = user?.role === 'receptionist';
  const isResident = user?.role === 'resident';
  // DESACTIVACION TEMPORAL: enfermeria/residente.
  const ENABLE_NURSE_RESIDENT_FLOW = false;

  const canCreate = isAdmin || isReceptionist;

    const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [doctors, setDoctors] = useState<UserProfile[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [showResidentIntakeModal, setShowResidentIntakeModal] = useState(false);
  const [residentAppointment, setResidentAppointment] = useState<Appointment | null>(null);
  const [residentPatient, setResidentPatient] = useState<Patient | null>(null);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(isDoctor ? user?.uid || '' : 'all');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('all');
  const [viewDate, setViewDate] = useState(new Date());
  
  const [currentView, setCurrentView] = useState<any>('month'); 
  const [zoomLevel, setZoomLevel] = useState(4); 

  const [dayAppointmentsModal, setDayAppointmentsModal] = useState<{
      date: Date;
      apps: CalendarAppointment[];
  } | null>(null);
  const [dayAppointmentsSearchTerm, setDayAppointmentsSearchTerm] = useState('');

  const [selectedStatus, setSelectedStatus] = useState<'all' | AppointmentStatusKey>('all');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  useEffect(() => {
    if (dayAppointmentsModal) {
      setDayAppointmentsSearchTerm('');
    }
  }, [dayAppointmentsModal]);

  const getPatientSearchableText = (appointment: CalendarAppointment) => {
    const patient = patients.find(p => p.id === appointment.patientId);
    const parts = [
      appointment.patientName,
      patient?.dpi,
      patient?.billingCode,
      appointment.patientId
    ].filter(Boolean);
    return parts.join(' ').toLowerCase();
  };

  const filteredDayAppointments = dayAppointmentsModal
    ? dayAppointmentsModal.apps.filter(app => {
        const term = dayAppointmentsSearchTerm.trim().toLowerCase();
        if (!term) return true;
        return getPatientSearchableText(app).includes(term);
      })
    : [];

  const doctorHasSpecialty = (doctor: UserProfile, specialty: string) => {
    const list = Array.isArray(doctor.specialties) && doctor.specialties.length > 0
      ? doctor.specialties
      : (doctor.specialty ? [doctor.specialty] : []);
    return list.includes(specialty);
  };

  const getCalendarConfig = (level: number) => {
      switch(level) {
          case 1: return { step: 60, minHeight: 60 }; 
          case 2: return { step: 30, minHeight: 80 }; 
          case 3: return { step: 15, minHeight: 100 }; 
          case 4: return { step: 10, minHeight: 120 }; 
          default: return { step: 10, minHeight: 120 };
      }
  };

  const zoomConfig = getCalendarConfig(zoomLevel);

  const normalizeSearch = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const patientLookup = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(p => {
      if (p.id) {
        map.set(p.id, p);
      }
    });
    return map;
  }, [patients]);

  useEffect(() => {
    if (isDoctor && user?.uid) {
        setSelectedDoctorId(user.uid);
    }
  }, [user, isDoctor]);

  useEffect(() => {
    // Cargar datos estáticos (doctores, especialidades, pacientes) UNA VEZ
    const loadStaticData = async () => {
        try {
            if (!isDoctor) {
                const [docs, specialtiesList] = await Promise.all([
                    userService.getDoctors(),
                    getSpecialties()
                ]);
                setDoctors(docs);
                setSpecialties(specialtiesList);
            }
            
            const [pats, users] = await Promise.all([
                patientService.getAll(),
                userService.getAllUsers()
            ]);
            setPatients(pats);
            setAllUsers(users);
        } catch (error) {
            console.error("Error loading static data:", error);
        }
    };
    loadStaticData();
  }, [isDoctor]);

  // SUSCRIPCIÓN EN TIEMPO REAL A CITAS
  useEffect(() => {
    let start = startOfMonth(viewDate);
    let end = endOfMonth(viewDate);

    if (currentView === Views.WEEK) {
        start = startOfWeek(viewDate, { locale: es });
        end = new Date(start); end.setDate(end.getDate() + 7);
    } else if (currentView === Views.DAY) {
        start = new Date(viewDate); start.setHours(0,0,0,0);
        end = new Date(viewDate); end.setHours(23,59,59,999);
    } else {
        start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 0 });
        end = startOfWeek(endOfMonth(viewDate), { weekStartsOn: 0 });
        end.setDate(end.getDate() + 6);
    }

    // Usar la nueva función de suscripción
    const unsubscribe = appointmentService.subscribeToAppointmentsByRange(start, end, (updatedApps) => {
        let apps = updatedApps.map(app => ({
            ...app,
            date: app.date instanceof Object && 'toDate' in app.date ? app.date.toDate() : new Date(app.date),
            endDate: app.endDate instanceof Object && 'toDate' in app.endDate ? app.endDate.toDate() : new Date(app.endDate),
            resourceId: app.doctorId
        })) as CalendarAppointment[];

        if (isDoctor) {
            apps = apps.filter(app => app.doctorId === user?.uid);
        } else {
            if (selectedSpecialty !== 'all') {
                if (doctors.length > 0) {
                     const specialtyDoctors = doctors
                        .filter(d => doctorHasSpecialty(d, selectedSpecialty))
                        .map(d => d.uid);
                     apps = specialtyDoctors.length > 0 ? apps.filter(app => specialtyDoctors.includes(app.doctorId)) : [];
                }
            }
            if (selectedDoctorId !== 'all') {
                apps = apps.filter(app => app.doctorId === selectedDoctorId);
            }
        }

        if (selectedStatus !== 'all') {
            apps = apps.filter(app => app.status === selectedStatus);
        }

        const normalizedTerm = normalizeSearch(patientSearchTerm);
        if (normalizedTerm) {
            apps = apps.filter(app => {
                const patient = patientLookup.get(app.patientId);
                const fullName = patient?.fullName || app.patientName || '';
                const dpi = patient?.dpi || '';
                const billingCode = patient?.billingCode || '';
                const haystack = normalizeSearch(`${fullName} ${dpi} ${billingCode} ${app.patientName || ''}`);
                return haystack.includes(normalizedTerm);
            });
        }

        setAppointments(apps);
    });

    return () => unsubscribe(); // Limpiar suscripción al desmontar o cambiar filtros

  }, [viewDate, selectedDoctorId, selectedSpecialty, currentView, selectedStatus, isDoctor, user, doctors, patientSearchTerm, patientLookup]);

  /* DEPRECATED: loadData manual
  const loadData = async () => { ... } 
  */
  
  // Función auxiliar para recargar SOLO si es necesario (ej. después de crear), 
  // aunque con onSnapshot ya no es estrictamente necesario llamar a loadData() para ver cambios.
  // Mantenemos una versión simplificada o vacía para compatibilidad con el código existente que llama a loadData()
  const loadData = async () => {
      // No-op: La suscripción se encarga de actualizar.
      // Opcional: Podríamos refrescar datos estáticos si fuera necesario, pero raramente cambian.
      console.log("Data refresh handled by realtime subscription");
  };

  const handleNavigate = (action: 'PREV' | 'NEXT' | 'TODAY') => {
      let newDate = new Date(viewDate);
      
      if (action === 'TODAY') {
          newDate = new Date();
      } else {
          const direction = action === 'NEXT' ? 1 : -1;
          if (currentView === 'month') {
              newDate = addMonths(viewDate, direction);
          } else if (currentView === Views.WEEK) {
              newDate = addWeeks(viewDate, direction);
          } else if (currentView === Views.DAY) {
              newDate = addDays(viewDate, direction);
          }
      }
      setViewDate(newDate);
  };

  const handleCreateAppointment = async (data: any) => {
    try {
      await appointmentService.createAppointment({ ...data, createdBy: user?.uid || 'system' }, user?.email || 'system@humana.com');
      toast.success("Cita agendada correctamente");
      loadData();
    } catch (error: any) {
      console.error("Error al guardar la cita:", error);
      const message = typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : "Ocurrió un error al guardar la cita.";
      toast.error(message);
    }
  };

  const handleConfirmPhone = async (id: string, method: string) => {
    try { 
        await appointmentService.confirmByPhone(id, user?.uid || 'unknown', method); 
        toast.success("Confirmada exitosamente"); 
        setIsDetailsModalOpen(false); 
        loadData(); 
    } catch (e) { toast.error("Error al confirmar"); }
  };

  const handleRegisterPayment = async (id: string, receipt: string, amt: number) => {
    try { await appointmentService.registerPayment(id, user?.uid || 'unknown', receipt, amt); toast.success("Pagada"); setIsDetailsModalOpen(false); loadData(); } catch (e) { toast.error("Error"); }
  };

  const handleCancelAppointment = async (id: string, reason: string) => {
    if (isDoctor || isResident) {
        toast.error("No tiene permisos para cancelar citas.");
        return;
    }
    try { 
        if (reason === 'no_show_internal') {
            await appointmentService.markNoShow(id, user?.email || 'system@humana.com');
            toast.success("Cita marcada como 'No se presentó'");
        } else {
            await appointmentService.cancelAppointment(id, reason, user?.email || 'system@humana.com'); 
            toast.success("Cancelada");
        }
        
        if (selectedAppointment && reason !== 'no_show_internal') {
            await notifyAppointmentCancelled(
                selectedAppointment.patientName,
                selectedAppointment.doctorName,
                selectedAppointment.doctorId,
                reason,
                user?.name || 'Administrador'
            );

            // Enviar correo a administradores
            await notifyAppointmentCancellationToAdmins(
                selectedAppointment.patientName,
                selectedAppointment.doctorName,
                format(selectedAppointment.date instanceof Date ? selectedAppointment.date : new Date(), "dd/MM/yyyy HH:mm"),
                user?.name || 'Administrador',
                reason
            );
        }
        
        setIsDetailsModalOpen(false); 
        loadData(); 
    } catch (e) { 
        console.error(e);
        toast.error("Error al cancelar"); 
    }
  };

  const handleOpenResidentIntake = () => {
    if (!selectedAppointment || !user) return;
    const p = patients.find(pt => pt.id === selectedAppointment.patientId);
    if (!p) {
      toast.error("Paciente no encontrado");
      return;
    }
    setResidentAppointment(selectedAppointment);
    setResidentPatient(p);
    setShowResidentIntakeModal(true);
  };

  const handleUpdateAppointment = async (id: string, updates: Partial<Appointment>) => {
    try {
        await appointmentService.updateAppointment(id, updates, {
            editorId: user?.uid || 'unknown',
            editorName: user?.name || 'Unknown',
            editorEmail: user?.email || 'system@humana.com'
        });
        toast.success("Cita actualizada");
        setIsDetailsModalOpen(false);
        loadData();
    } catch (error) {
        console.error("Error al actualizar cita", error);
        toast.error("No se pudieron guardar los cambios de la cita. Verifique permisos.");
    }
  };

  const eventStyleGetter = (event: Appointment) => {
    const style = statusStyles[event.status] || statusStyles.scheduled;
    return {
      style: {
        backgroundColor: style.bg,
        borderColor: style.border,
        color: style.text,
        borderLeft: `4px solid ${style.border}`,
        fontSize: '0.85rem',
        fontWeight: '500',
        borderRadius: '4px',
        padding: '2px 5px',
        display: 'flex' as const, // FIX: 'as const' para que TS infiera el tipo literal
        flexDirection: 'column' as const,
        justifyContent: 'center' as const
      }
    };
  };

  const EventComponent = ({ event }: { event: Appointment }) => (
    <div className="h-full flex flex-col overflow-hidden leading-tight justify-center px-1">
      <div className="font-bold truncate text-xs flex items-center gap-1">
        {event.isIGSS && (
          <span className="px-1 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-300 text-[9px] font-extrabold uppercase tracking-[0.12em]">
            IGSS
          </span>
        )}
        {event.modality === 'Virtual' ? <Video className="w-3 h-3 flex-shrink-0" /> : <Users className="w-3 h-3 flex-shrink-0" />}
        {event.patientName}
      </div>
      {zoomLevel >= 2 && <div className="text-[10px] opacity-80 truncate">{event.reason}</div>}
    </div>
  );

  const getCurrentLabel = () => {
      if (currentView === 'month') return format(viewDate, 'MMMM yyyy', { locale: es });
      if (currentView === Views.DAY) return format(viewDate, "EEEE d 'de' MMMM", { locale: es });
      const start = startOfWeek(viewDate, { locale: es });
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${format(start, 'd MMM', { locale: es })} - ${format(end, 'd MMM yyyy', { locale: es })}`;
  };

  return (
    <div className="h-full flex flex-col space-y-4 p-4 max-w-[1600px] mx-auto w-full">
      
      {/* Header Controls */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col xl:flex-row justify-between items-center gap-4">
        
        <div className="flex items-center gap-6 w-full xl:w-auto justify-between xl:justify-start">
            <div>
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <CalendarIcon className="w-6 h-6 text-blue-600" />
                    Agenda
                </h1>
            </div>

            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 p-1">
                <button onClick={() => handleNavigate('PREV')} className="p-1.5 hover:bg-white rounded-md shadow-sm transition"><ChevronLeft className="w-4 h-4 text-slate-600"/></button>
                <button onClick={() => handleNavigate('TODAY')} className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white rounded-md transition mx-1">Hoy</button>
                <button onClick={() => handleNavigate('NEXT')} className="p-1.5 hover:bg-white rounded-md shadow-sm transition"><ChevronRight className="w-4 h-4 text-slate-600"/></button>
            </div>

            <div className="hidden md:block font-bold text-slate-700 capitalize min-w-[150px] text-center">
                {getCurrentLabel()}
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
          
          {(currentView === Views.WEEK || currentView === Views.DAY) && (
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg mr-2">
                  <button onClick={() => setZoomLevel(p => Math.max(1, p - 1))} disabled={zoomLevel === 1} className="p-1.5 hover:bg-white rounded disabled:opacity-30"><ZoomOut className="w-4 h-4" /></button>
                  <span className="text-xs font-bold text-slate-600 w-8 text-center">{zoomLevel * 25}%</span>
                  <button onClick={() => setZoomLevel(p => Math.min(4, p + 1))} disabled={zoomLevel === 4} className="p-1.5 hover:bg-white rounded disabled:opacity-30"><ZoomIn className="w-4 h-4" /></button>
              </div>
          )}

          <div className="bg-slate-100 p-1 rounded-lg flex text-sm font-medium">
              <button onClick={() => setCurrentView('month')} className={`px-3 py-1.5 rounded-md transition ${currentView === 'month' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Mes</button>
              <button onClick={() => setCurrentView(Views.WEEK)} className={`px-3 py-1.5 rounded-md transition ${currentView === Views.WEEK ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Semana</button>
              <button onClick={() => setCurrentView(Views.DAY)} className={`px-3 py-1.5 rounded-md transition ${currentView === Views.DAY ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Día</button>
          </div>

          {!isDoctor && (
              <div className="flex gap-2">
                  <div className="relative">
                    <Stethoscope className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <select 
                        value={selectedSpecialty} 
                        onChange={(e) => {
                          setSelectedSpecialty(e.target.value);
                          setSelectedDoctorId('all');
                        }} 
                        className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none cursor-pointer hover:bg-slate-100"
                    >
                      <option value="all">Todas las Especialidades</option>
                      {specialties.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedSpecialty !== 'all' && (
                      <div className="relative animate-in fade-in slide-in-from-left-2 duration-200">
                        <Users className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <select 
                            value={selectedDoctorId} 
                            onChange={(e) => setSelectedDoctorId(e.target.value)} 
                            className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none cursor-pointer hover:bg-slate-100"
                        >
                          <option value="all">Todos los Profesionales</option>
                          {doctors
                            .filter(d => doctorHasSpecialty(d, selectedSpecialty))
                            .map(d => <option key={d.uid} value={d.uid}>{d.name}</option>)}
                        </select>
                      </div>
                  )}
              </div>
          )}

          <div className="relative">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as 'all' | AppointmentStatusKey)}
              className="pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none cursor-pointer hover:bg-slate-100"
            >
              <option value="all">Todos los estados</option>
              {statusOptions.map(s => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={patientSearchTerm}
              onChange={(e) => setPatientSearchTerm(e.target.value)}
              placeholder="Buscar paciente, DPI o código"
              className="pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none hover:bg-slate-100 focus:ring-2 focus:ring-brand-300"
            />
          </div>

          <button onClick={() => loadData()} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><RefreshCw className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="bg-white px-4 pt-1 pb-3 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {statusOptions.map(s => {
            const style = statusStyles[s.key];
            return (
              <div
                key={s.key}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-200 bg-slate-50"
              >
                <span
                  className="w-3 h-3 rounded-full border"
                  style={{
                    backgroundColor: style.bg,
                    borderColor: style.border,
                  }}
                />
                <span className="font-semibold text-slate-700">
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 h-[800px] overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
          
          {currentView === 'month' ? (
              <CustomMonthView 
                  date={viewDate} 
                  appointments={appointments} 
                  onSelectSlot={(d) => {
                      if (!canCreate) return; 
                      if(d < new Date(new Date().setHours(0,0,0,0))) { toast.error("No se puede agendar en el pasado"); return; }
                      setSelectedDate(d); setIsModalOpen(true);
                  }}
                  onSelectEvent={(app) => { setSelectedAppointment(app); setIsDetailsModalOpen(true); }}
                  onShowDayAppointments={(day, apps) => setDayAppointmentsModal({ date: day, apps })}
              />
          ) : (
              <>
                <style>{`
                    .rbc-time-view .rbc-timeslot-group { min-height: ${zoomConfig.minHeight}px !important; }
                    .rbc-time-view .rbc-time-slot { min-height: ${zoomConfig.minHeight}px !important; border-top: 1px solid #f8fafc; }
                `}</style>
                <div className="h-full p-4 overflow-auto">
                    <Calendar
                        localizer={localizer}
                        events={appointments}
                        startAccessor="date"
                        endAccessor="endDate"
                        style={{ height: '100%', minWidth: '100%' }}
                        
                        view={currentView} 
                        onView={(v) => setCurrentView(v)}
                        date={viewDate}
                        onNavigate={(d) => setViewDate(d)}

                        toolbar={false} 
                        culture="es" // <--- Aquí es donde se forza el idioma

                        step={zoomConfig.step} 
                        timeslots={1} 
                        
                        formats={{ 
                            timeGutterFormat: (d, c, l) => l!.format(d, 'HH:mm', c),
                            dayFormat: (d, c, l) => l!.format(d, 'EEEE d', c), 
                            dayHeaderFormat: (d, c, l) => l!.format(d, 'EEEE d MMMM', c)
                        }}
                        
                        min={new Date(0, 0, 0, 6, 0, 0)} max={new Date(0, 0, 0, 22, 0, 0)}
                        
                        onSelectSlot={(slotInfo) => {
                            if (!canCreate) return; 
                            if (slotInfo.start < new Date()) { toast.error("No pasado"); return; }
                            setSelectedDate(slotInfo.start); setIsModalOpen(true);
                        }}
                        onSelectEvent={(e) => { setSelectedAppointment(e); setIsDetailsModalOpen(true); }}
                        selectable
                        eventPropGetter={eventStyleGetter}
                        components={{ event: EventComponent }}
                    />
                </div>
              </>
          )}
      </div>

      <CreateAppointmentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateAppointment}
        doctors={isDoctor ? [{ ...user, uid: user.uid } as UserProfile] : doctors} 
        patients={patients}
        initialDate={selectedDate}
        onCreatePatientClick={() => {}} 
        preSelectedPatientId={null}
        existingAppointments={appointments} 
      />

      <AppointmentDetailsModal 
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedAppointment(null);
        }}
        appointment={selectedAppointment}
        userRole={user?.role || ''}
        currentUser={user}
        users={allUsers}
        onConfirmPhone={handleConfirmPhone}
        onRegisterPayment={handleRegisterPayment}
        onCancel={handleCancelAppointment}
        onOpenResidentIntake={ENABLE_NURSE_RESIDENT_FLOW && user?.role === 'nurse' ? handleOpenResidentIntake : undefined}
        onUpdateAppointment={handleUpdateAppointment}
      />

      {ENABLE_NURSE_RESIDENT_FLOW && user?.role === 'nurse' && user && residentAppointment && residentPatient && (
        <ResidentIntakeModal
          isOpen={showResidentIntakeModal}
          onClose={() => setShowResidentIntakeModal(false)}
          patient={residentPatient}
          currentUser={user}
          onSaveComplete={async () => {
            if (!residentAppointment.id) return;
            await appointmentService.completeResidentIntake(residentAppointment.id);
            setSelectedAppointment(prev =>
              prev && prev.id === residentAppointment.id ? { ...prev, status: 'resident_intake' } : prev
            );
            setResidentAppointment(null);
            setResidentPatient(null);
            setShowResidentIntakeModal(false);
            setIsDetailsModalOpen(false);
            await loadData();
          }}
        />
      )}

      {dayAppointmentsModal && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-slate-500">Citas del día</p>
                <p className="text-sm font-bold text-slate-800">
                  {format(dayAppointmentsModal.date, "EEEE d 'de' MMMM", { locale: es })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDayAppointmentsModal(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Cerrar
              </button>
            </div>
            <div className="px-4 pt-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={dayAppointmentsSearchTerm}
                  onChange={(e) => setDayAppointmentsSearchTerm(e.target.value)}
                  placeholder="Buscar por paciente, DPI o código..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:ring-2 focus:ring-brand-400 outline-none"
                />
              </div>
            </div>
            <div className="p-3 space-y-2 overflow-y-auto">
              {filteredDayAppointments
                .slice()
                .sort((a, b) => a.date.getTime() - b.date.getTime())
                .map(app => (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      setSelectedAppointment(app);
                      setIsDetailsModalOpen(true);
                      setDayAppointmentsModal(null);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl border border-slate-100 hover:bg-slate-50 flex flex-col gap-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        {format(app.date, 'HH:mm')}
                        {app.modality === 'Virtual' ? <Video className="w-3 h-3 text-slate-400" /> : <Users className="w-3 h-3 text-slate-400" />}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          {translateStatus(app.status)}
                        </span>
                        {app.isIGSS && (
                          <span className="px-1.5 py-0.5 rounded bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-300 text-[9px] font-extrabold uppercase tracking-[0.12em]">
                            IGSS
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-slate-800 truncate">
                      {app.patientName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {app.doctorName}
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
