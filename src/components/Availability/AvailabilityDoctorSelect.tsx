import React from 'react';
import { Search, User } from 'lucide-react';
import { UserProfile } from '../../types';
import { normalizeText } from './availabilityUtils';

interface AvailabilityDoctorSelectProps {
  doctors: UserProfile[];
  selectedDoctorId: string;
  onSelectDoctor: (id: string) => void;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
}

export const AvailabilityDoctorSelect: React.FC<AvailabilityDoctorSelectProps> = ({
  doctors,
  selectedDoctorId,
  onSelectDoctor,
  searchTerm,
  onSearchTermChange
}) => {
  const normalized = normalizeText(searchTerm);
  const filteredDoctors = normalized
    ? doctors.filter(d => normalizeText(d.name).includes(normalized))
    : doctors;

  return (
    <div className="w-full md:w-80">
      <div className="relative mb-2">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="Buscar doctor..."
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 focus:ring-2 focus:ring-brand-400 outline-none"
        />
      </div>
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        <div className="max-h-48 overflow-y-auto custom-scrollbar">
          {filteredDoctors.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">Sin resultados</div>
          )}
          {filteredDoctors.map(doc => (
            <button
              key={doc.uid}
              type="button"
              onClick={() => onSelectDoctor(doc.uid)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs border-b last:border-b-0 border-slate-100 ${
                selectedDoctorId === doc.uid
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'bg-white hover:bg-slate-50 text-slate-600'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span className="truncate">{doc.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
