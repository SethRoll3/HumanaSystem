import React from 'react';
import { addMonths, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toDateKey } from './availabilityUtils';

interface AvailabilityCalendarProps {
  monthDate: Date;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  availabilityByDate: Record<string, boolean>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  monthDate,
  selectedDate,
  onSelectDate,
  availabilityByDate,
  onPrevMonth,
  onNextMonth
}) => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrevMonth}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-bold text-slate-800 capitalize">
          {format(monthDate, 'MMMM yyyy', { locale: es })}
        </div>
        <button
          type="button"
          onClick={onNextMonth}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
        {weekDays.map(day => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map(day => {
          const key = toDateKey(day);
          const hasAvailability = availabilityByDate[key];
          const isSelected = isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, monthDate);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelectDate(day)}
              className={`h-9 rounded-lg text-xs font-semibold border transition-colors ${
                isSelected
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              } ${!isCurrentMonth ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-center gap-1">
                <span>{day.getDate()}</span>
                {hasAvailability && <span className="text-emerald-500">•</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
