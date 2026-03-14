import React from 'react';
import { CheckCircle, FileText, List, Lock, Zap, Search } from 'lucide-react';
import { Appointment } from '../../types';

interface AgendaListViewPagination {
  currentPage: number;
  totalPages?: number;
  hasNext?: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface AgendaListViewProps {
  appointments: Appointment[];
  isDoctor: boolean;
  isResident: boolean;
  isNurse: boolean;
  isReceptionist: boolean;
  isAdmin: boolean;
  isSaving: boolean;
  onOpenDetails: (appt: Appointment) => void;
  onOpenNurseIntake: (appt: Appointment) => void;
  onOpenResidentClinical: (appt: Appointment) => void;
  onStartConsultation: (appt: Appointment) => void;
  onToggleNurseFlow: (appt: Appointment) => void;
  onViewSummary: (appt: Appointment) => void;
  pagination?: AgendaListViewPagination;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  dateFilter?: string;
  onDateFilterChange?: (value: string) => void;
  onClearDateFilter?: () => void;
}

export const AgendaListView: React.FC<AgendaListViewProps> = ({
  appointments,
  isDoctor,
  isResident,
  isNurse,
  isReceptionist,
  isAdmin,
  isSaving,
  onOpenDetails,
  onOpenNurseIntake,
  onOpenResidentClinical,
  onStartConsultation,
  onToggleNurseFlow,
  onViewSummary,
  pagination,
  searchTerm,
  onSearchTermChange,
  dateFilter,
  onDateFilterChange,
  onClearDateFilter
}) => {
  const showPagination = !!pagination;
  const showSearch = typeof searchTerm === 'string' && !!onSearchTermChange;
  const showDateFilter = typeof dateFilter === 'string' && !!onDateFilterChange;

  return (
    <div className="overflow-x-auto h-full flex flex-col">
      {showSearch && (
        <div className="p-4 border-b bg-slate-50/60">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => onSearchTermChange?.(e.target.value)}
                placeholder="Buscar paciente o médico..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-400 outline-none"
              />
            </div>
            {showDateFilter && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={e => onDateFilterChange?.(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 focus:ring-2 focus:ring-brand-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => onClearDateFilter?.()}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Todos
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <table className="w-full text-left min-w-[700px]">
        <thead className="bg-slate-200 text-[10px] text-slate-600 uppercase font-bold tracking-widest border-b border-slate-300">
          <tr>
            <th className="p-4">Hora</th>
            <th className="p-4">Paciente</th>
            <th className="p-4">Motivo</th>
            <th className="p-4">Médico</th>
            <th className="p-4">Estado</th>
            <th className="p-4 text-right">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {appointments
            .filter(appt => {
              if (!showSearch || !searchTerm) return true;
              const p = (appt.patientName || '').toLowerCase();
              const d = (appt.doctorName || '').toLowerCase();
              const term = searchTerm.toLowerCase().trim();
              return p.includes(term) || d.includes(term);
            })
            .map(appt => {
            const appointmentDate = appt.date instanceof Date ? appt.date : new Date(appt.date);
            const timeString = appointmentDate.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guatemala' });
            const isToday = appointmentDate.toDateString() === new Date().toDateString();
            const dateLabel = appointmentDate.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const isReadyForDoctor = appt.status === 'resident_intake';
            const isInProgress = appt.status === 'in_progress';
            const canStartFromPaid = appt.status === 'paid_checked_in' && appt.consultationType === 'Reconsulta' && appt.goToNurse === false;
            const showDoctorButton = isDoctor && (isReadyForDoctor || isInProgress || canStartFromPaid);
            const isLocked = isDoctor && ((appt.consultationType === 'Nueva' && !appt.residentClinicalCompleted) || (!isReadyForDoctor && !isInProgress && !canStartFromPaid));
            const canEditResidentFicha = isResident && appt.consultationType === 'Nueva' && !['in_progress', 'completed', 'cancelled', 'no_show'].includes(appt.status);
            const residentStatusLabel = isResident && appt.consultationType === 'Nueva' && appt.status === 'resident_intake';

            return (
              <tr key={appt.id} className={`${isInProgress ? 'bg-amber-50/40' : 'hover:bg-slate-50/50 transition-colors'}`}>
                <td className="p-4 text-sm font-bold text-slate-500 font-mono">
                  <div>{timeString}</div>
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-1">
                    {isToday ? 'Hoy' : dateLabel}
                  </div>
                </td>
                <td className="p-4 text-sm">
                  <div className="font-bold text-slate-800">{appt.patientName}</div>
                </td>
                <td className="p-4 text-sm text-slate-600 truncate max-w-[150px]">{appt.reason}</td>
                <td className="p-4 text-sm font-medium text-brand-700">Dr. {appt.doctorName}</td>
                <td className="p-4">
                  {appt.status === 'scheduled' && <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold border border-slate-200">Agendada</span>}
                  {appt.status === 'confirmed_phone' && <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">Confirmada</span>}
                  {appt.status === 'paid_checked_in' && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200 flex w-fit items-center gap-1"><CheckCircle className="w-3 h-3"/> En Sala</span>}
                  {appt.status === 'resident_intake' && (
                    <span className="px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-bold border border-sky-200 flex w-fit items-center gap-1">
                      <CheckCircle className="w-3 h-3"/>{residentStatusLabel ? 'Ficha clínica completa' : 'Listo para consulta'}
                    </span>
                  )}
                  {appt.status === 'in_progress' && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200 animate-pulse">En Consulta</span>}
                  {appt.status === 'completed' && <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-bold">Finalizada</span>}
                  {appt.status === 'no_show' && <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold border border-red-200">No se presentó</span>}
                  {appt.isIGSS && (
                    <div className="mt-2">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-fuchsia-100 text-fuchsia-700 rounded-full text-xs font-extrabold border border-fuchsia-300 uppercase tracking-[0.12em] shadow-sm">
                        IGSS
                      </span>
                    </div>
                  )}
                  {(isReceptionist || isAdmin) && appt.consultationType === 'Reconsulta' && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-medium">
                        Paso por enfermería:
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleNurseFlow(appt)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                          appt.goToNurse === false
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {appt.goToNurse === false ? 'Directo a doctor' : 'Con enfermería'}
                      </button>
                    </div>
                  )}
                </td>
                <td className="p-4 text-right">
                  {(isReceptionist || isAdmin) && (
                    <button
                      onClick={() => onOpenDetails(appt)}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-md flex items-center gap-2 ml-auto"
                    >
                      <FileText className="w-3 h-3" /> Ver Detalle / Boleta
                    </button>
                  )}

                  {isNurse && appt.status === 'paid_checked_in' && (
                    <button
                      onClick={() => onOpenNurseIntake(appt)}
                      className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shadow-md flex items-center gap-2 ml-auto"
                    >
                      <FileText className="w-3 h-3" /> Evaluación Enfermería
                    </button>
                  )}

                  {isNurse && appt.status === 'completed' && (
                    <button
                      onClick={() => onViewSummary(appt)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition shadow-md flex items-center gap-2 ml-auto"
                    >
                      <List className="w-3 h-3" /> Ver Resumen
                    </button>
                  )}

                  {canEditResidentFicha && (
                    <button
                      onClick={() => onOpenResidentClinical(appt)}
                      className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition shadow-md flex items-center gap-2 ml-auto"
                    >
                      <FileText className="w-3 h-3" />
                      {appt.residentClinicalCompleted ? 'Editar ficha clínica' : 'Llenar ficha clínica'}
                    </button>
                  )}

                  {showDoctorButton && (
                    <button
                      onClick={() => onStartConsultation(appt)}
                      disabled={isLocked || isSaving}
                      className={`
                        px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-2 ml-auto
                        ${isLocked
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          : 'bg-brand-600 text-white hover:bg-brand-700 shadow-brand-500/20 shadow-md'
                        }
                      `}
                    >
                      {isLocked ? <Lock className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                      {isInProgress ? 'Continuar' : 'Atender'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {appointments.length === 0 && (
            <tr>
              <td colSpan={6} className="p-12 text-center text-slate-400 italic font-medium">
                {isResident ? 'No hay citas asignadas por ahora' :
                  isNurse ? 'No hay consultas activas o finalizadas por revisar' :
                  'No hay citas para mostrar'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {showPagination && pagination && (
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-600">
          <button
            type="button"
            onClick={pagination.onPrev}
            disabled={pagination.currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            Anterior
          </button>
          <span>
            Página {pagination.currentPage}{pagination.totalPages ? ` de ${pagination.totalPages}` : ''}
          </span>
          <button
            type="button"
            onClick={pagination.onNext}
            disabled={pagination.totalPages ? pagination.currentPage === pagination.totalPages : !pagination.hasNext}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
};
