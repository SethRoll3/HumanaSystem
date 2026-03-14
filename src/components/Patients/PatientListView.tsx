import * as React from 'react';
import { Loader2, Search, Users, Phone, Mail, Hash, UserPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Patient } from '../../types.ts';

interface PatientListViewProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onSearchSubmit: (e: React.FormEvent) => void;
  onClearSearch: () => void;
  patients: Patient[];
  loading: boolean;
  onSelectPatient: (patient: Patient) => void;
  onCreatePatient?: () => void;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  hasMore?: boolean;
  page?: number;
  isFirstPage?: boolean;
}

export const PatientListView: React.FC<PatientListViewProps> = ({
  searchTerm,
  onSearchTermChange,
  onSearchSubmit,
  onClearSearch,
  patients,
  loading,
  onSelectPatient,
  onCreatePatient,
  onNextPage,
  onPrevPage,
  hasMore,
  page,
  isFirstPage
}) => {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-3xl p-5 md:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <form onSubmit={onSearchSubmit} className="flex flex-col md:flex-row md:items-center gap-3 flex-1">
          <div className="flex-1">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                className="w-full p-4 pl-11 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Buscar por nombre, DPI o código"
                value={searchTerm}
                onChange={e => onSearchTermChange(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="submit" className="px-5 py-3 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all">
              Buscar
            </button>
            {searchTerm && (
              <button type="button" onClick={onClearSearch} className="px-5 py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
                Limpiar
              </button>
            )}
          </div>
        </form>
        
        {onCreatePatient && (
          <button 
            onClick={onCreatePatient}
            className="px-6 py-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-2xl shadow-lg hover:shadow-emerald-500/20 transition-all flex items-center gap-2 shrink-0"
          >
            <UserPlus className="w-5 h-5" />
            Nuevo Paciente
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">Pacientes</p>
            <p className="text-xs text-slate-500">
              {patients.length} mostrados {page ? `- Página ${page}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {loading && (
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando
              </div>
            )}
            
            {(onPrevPage || onNextPage) && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={onPrevPage} 
                  disabled={isFirstPage || loading}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-slate-600 min-w-[3rem] text-center">
                  Pág {page || 1}
                </span>
                <button 
                  onClick={onNextPage} 
                  disabled={!hasMore || loading}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {patients.length === 0 && !loading && (
          <div className="px-6 py-10 text-center text-slate-500 text-sm">No hay pacientes para mostrar.</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 md:p-6 bg-slate-50/40">
          {patients.map((patient, index) => (
            <div
              key={patient.id}
              className={`p-5 flex flex-col gap-4 rounded-2xl border transition shadow-sm hover:shadow-md hover:border-brand-200 ${
                index % 2 === 0 ? 'bg-white border-slate-200' : 'bg-slate-50/70 border-slate-200/60'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center text-lg font-bold">
                  {patient.fullName?.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{patient.fullName}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <Hash className="w-3 h-3" />
                      DPI: {patient.dpi || '—'}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Hash className="w-3 h-3" />
                      Fact: {patient.billingCode || '—'}
                    </span>
                    
                  </div>
                </div>
                <div className="hidden md:flex items-center gap-2 text-slate-400">
                  <Users className="w-4 h-4" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                {patient.phone && (
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 font-semibold">
                    <Phone className="w-3 h-3" />
                    {patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 font-semibold">
                    <Mail className="w-3 h-3" />
                    {patient.email}
                  </span>
                )}
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={() => onSelectPatient(patient)} className="px-4 py-2 text-xs font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl">
                  Ver detalle
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
