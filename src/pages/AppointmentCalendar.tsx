import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { es } from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { Plus, Filter, Search, Calendar as CalendarIcon, RefreshCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { appointmentService } from '../services/appointmentService';
import { userService } from '../services/userService';
import { patientService } from '../services/patientService';
import { Appointment, UserProfile, Patient } from '../types';
import { CreateAppointmentModal } from '../components/Appointments/CreateAppointmentModal';
import { AppointmentDetailsModal } from '../components/Appointments/AppointmentDetailsModal';
import { toast } from 'sonner';
import { startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays } from 'date-fns';

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

const statusStyles = {
  scheduled: { bg: '#F1F5F9', border: '#94A3B8', text: '#475569' },
  confirmed_phone: { bg: '#FEF9C3', border: '#FACC15', text: '#854D0E' },
  paid_checked_in: { bg: '#DCFCE7', border: '#4ADE80', text: '#166534' },
  in_progress: { bg: '#DBEAFE', border: '#60A5FA', text: '#1E40AF' },
  completed: { bg: '#E2E8F0', border: '#CBD5E1', text: '#64748B' },
  cancelled: { bg: '#FEE2E2', border: '#F87171', text: '#991B1B' },
  no_show: { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151' },
};

interface AppointmentCalendarProps {
    user?: UserProfile; 
}

const CustomMonthView = ({ 
    date, 
    appointments, 
    onSelectSlot, 
    onSelectEvent 
}: { 
    date: Date, 
    appointments: Appointment[], 
    onSelectSlot: (d: Date) => void,
    onSelectEvent: (app: Appointment) => void
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
                                        className="text-[10px] px-1.5 py-0.5 rounded border truncate font-medium cursor-pointer hover:brightness-95 transition-all"
                                        style={{ 
                                            backgroundColor: statusStyles[app.status]?.bg || '#eee',
                                            borderColor: statusStyles[app.status]?.border || '#ccc',
                                            color: statusStyles[app.status]?.text || '#333'
                                        }}
                                        title={`${format(app.date, 'HH:mm')} - ${app.patientName}`}
                                    >
                                        {format(app.date, 'HH:mm')} {app.patientName}
                                    </div>
                                ))}
                                {dayApps.length > 3 && (
                                    <div className="text-[10px] text-slate-400 font-bold text-center">
                                        + {dayApps.length - 3} más
                                    </div>
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
  const isDoctor = user?.role === 'doctor';
  const isAdmin = user?.role === 'admin';
  const isReceptionist = user?.role === 'receptionist';

  // Si no es doctor, puede crear citas
  const canCreate = !isDoctor;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<UserProfile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(isDoctor ? user?.uid || '' : 'all');
  const [viewDate, setViewDate] = useState(new Date());
  
  const [currentView, setCurrentView] = useState<any>('month'); 
  const [zoomLevel, setZoomLevel] = useState(4); 

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

  useEffect(() => {
    if (isDoctor && user?.uid) {
        setSelectedDoctorId(user.uid);
    }
  }, [user, isDoctor]);

  useEffect(() => {
    loadData();
  }, [viewDate, selectedDoctorId, currentView]);

  const loadData = async () => {
    try {
      if (!isDoctor) {
          const docs = await userService.getDoctors();
          setDoctors(docs);
      }
      
      const pats = await patientService.getAll();
      setPatients(pats);

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

      let apps = await appointmentService.getAppointmentsByRange(start, end);
      
      apps = apps.map(app => ({
        ...app,
        date: app.date instanceof Object && 'toDate' in app.date ? app.date.toDate() : new Date(app.date),
        endDate: app.endDate instanceof Object && 'toDate' in app.endDate ? app.endDate.toDate() : new Date(app.endDate)
      }));

      if (isDoctor) {
          apps = apps.filter(app => app.doctorId === user?.uid);
      } else if (selectedDoctorId !== 'all') {
          apps = apps.filter(app => app.doctorId === selectedDoctorId);
      }

      setAppointments(apps);
    } catch (error) {
      console.error("Error loading calendar data:", error);
    }
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
      await appointmentService.createAppointment({ ...data, createdBy: user?.uid || 'system' });
      toast.success("Cita agendada correctamente");
      loadData();
    } catch (error) { console.error(error); toast.error("Error al guardar la cita"); }
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
    if (isDoctor) {
        toast.error("No tiene permisos para cancelar citas.");
        return;
    }
    try { await appointmentService.cancelAppointment(id, reason); toast.success("Cancelada"); setIsDetailsModalOpen(false); loadData(); } catch (e) { toast.error("Error"); }
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
      <div className="font-bold truncate text-xs">{event.patientName}</div>
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
              <div className="relative">
                <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <select value={selectedDoctorId} onChange={(e) => setSelectedDoctorId(e.target.value)} className="pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none cursor-pointer hover:bg-slate-100">
                  <option value="all">Todos los Médicos</option>
                  {doctors.map(d => <option key={d.uid} value={d.uid}>Dr. {d.name}</option>)}
                </select>
              </div>
          )}

          <button onClick={() => loadData()} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"><RefreshCw className="w-5 h-5" /></button>

          {canCreate && (
              <button onClick={() => { setSelectedDate(new Date()); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-lg">
                <Plus className="w-4 h-4" /> Nueva Cita
              </button>
          )}
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
        onClose={() => setIsDetailsModalOpen(false)}
        appointment={selectedAppointment}
        onConfirmPhone={handleConfirmPhone}
        onRegisterPayment={handleRegisterPayment}
        onCancel={handleCancelAppointment}
        userRole={user?.role || ''}
      />
    </div>
  );
};
