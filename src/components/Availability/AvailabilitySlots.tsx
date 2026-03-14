import React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale/es';

interface AvailabilitySlotsProps {
  date: Date;
  slots: string[];
  scheduleLabel: string;
  isUnavailable: boolean;
}

export const AvailabilitySlots: React.FC<AvailabilitySlotsProps> = ({
  date,
  slots,
  scheduleLabel,
  isUnavailable
}) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Horarios disponibles
          </p>
          <p className="text-sm font-semibold text-slate-800 capitalize">
            {format(date, "EEEE d 'de' MMMM", { locale: es })}
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-500">
          {scheduleLabel}
        </div>
      </div>
      {isUnavailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 font-semibold">
          Día no disponible
        </div>
      )}
      {!isUnavailable && slots.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 font-semibold">
          No hay horarios disponibles
        </div>
      )}
      {!isUnavailable && slots.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {slots.map(slot => (
            <div
              key={slot}
              className="px-3 py-2 rounded-full bg-blue-50 text-blue-700 text-xs font-bold text-center"
            >
              {slot}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
