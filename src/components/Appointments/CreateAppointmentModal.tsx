import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Calendar as CalendarIcon, Clock, User, Stethoscope, AlertCircle, Plus } from 'lucide-react';
import { UserProfile, Patient, Appointment } from '../../types';
import { toast } from 'sonner';

// Schema para validación rápida del formulario
const appointmentFormSchema = z.object({
  patientId: z.string().min(1, "Seleccione un paciente"),
  doctorId: z.string().min(1, "Seleccione un médico"),
  date: z.string().min(1, "Fecha requerida"),
  time: z.string().min(1, "Hora requerida"),
  reason: z.string().min(3, "Indique el motivo de la consulta"),
  duration: z.string(), // "15", "30", "60"
});

type FormData = z.infer<typeof appointmentFormSchema>;

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  doctors: UserProfile[];
  patients: Patient[];
  initialDate?: Date;
  onCreatePatientClick: () => void; 
  preSelectedPatientId?: string | null; 
  existingAppointments?: Appointment[]; // Nuevo prop para validar conflictos
}

export const CreateAppointmentModal: React.FC<CreateAppointmentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  doctors,
  patients,
  initialDate,
  onCreatePatientClick,
  preSelectedPatientId,
  existingAppointments = []
}) => {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      duration: "30",
      date: initialDate ? initialDate.toISOString().split('T')[0] : '',
    }
  });

  // Efecto para actualizar la fecha si cambia desde fuera
  useEffect(() => {
    if (initialDate) {
      setValue('date', initialDate.toISOString().split('T')[0]);
      const hours = String(initialDate.getHours()).padStart(2, '0');
      const minutes = String(initialDate.getMinutes()).padStart(2, '0');
      setValue('time', `${hours}:${minutes}`);
    }
  }, [initialDate, setValue]);

  useEffect(() => {
      if (preSelectedPatientId) {
          setValue('patientId', preSelectedPatientId);
      }
  }, [preSelectedPatientId, setValue]);

  if (!isOpen) return null;

  const handleFormSubmit = (data: FormData) => {
    // 1. Construir fechas
    const startDateTime = new Date(`${data.date}T${data.time}`);
    const endDateTime = new Date(startDateTime.getTime() + parseInt(data.duration) * 60000);
    const now = new Date();

    // 2. VALIDACIÓN: NO PASADO
    if (startDateTime < now) {
        toast.error("No se pueden crear citas en el pasado.");
        return;
    }

    // 3. VALIDACIÓN: NO CONFLICTOS (SOLAPAMIENTO)
    // Buscamos si hay alguna cita existente para ESTE doctor que se traslape
    const hasConflict = existingAppointments.some(appt => {
        // Solo importa si es el mismo doctor y la cita no está cancelada
        if (appt.doctorId !== data.doctorId || appt.status === 'cancelled') return false;

        const apptStart = appt.date instanceof Date ? appt.date : appt.date.toDate();
        const apptEnd = appt.endDate instanceof Date ? appt.endDate : appt.endDate.toDate();

        // Lógica de solapamiento de rangos:
        // (StartA < EndB) && (EndA > StartB)
        return startDateTime < apptEnd && endDateTime > apptStart;
    });

    if (hasConflict) {
        toast.error("El médico ya tiene una cita asignada en ese horario.");
        return;
    }

    // 4. Si todo OK, enviar
    const patient = patients.find(p => p.id === data.patientId);
    const doctor = doctors.find(d => d.uid === data.doctorId);

    const payload = {
      patientId: data.patientId,
      patientName: patient?.fullName || 'Desconocido',
      doctorId: data.doctorId,
      doctorName: doctor?.name || 'Desconocido',
      date: startDateTime,
      endDate: endDateTime,
      reason: data.reason,
      duration: parseInt(data.duration)
    };

    onSubmit(payload);
    reset();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            Nueva Cita
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-5">
          
          {/* Paciente y Doctor */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Paciente</label>
              <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                    <select 
                      {...register('patientId')}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                    >
                      <option value="">Seleccione...</option>
                      {patients.map(p => (
                        <option key={p.id} value={p.id}>{p.fullName} ({p.billingCode})</option>
                      ))}
                    </select>
                  </div>
                  {/* BOTÓN NUEVO PACIENTE */}
                  <button 
                      type="button"
                      onClick={onCreatePatientClick}
                      className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition shadow-sm"
                      title="Crear Nuevo Paciente"
                  >
                      <Plus className="w-5 h-5" />
                  </button>
              </div>
              {errors.patientId && <p className="text-xs text-red-500">{errors.patientId.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Médico</label>
              <div className="relative">
                <Stethoscope className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <select 
                  {...register('doctorId')}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                >
                  <option value="">Seleccione...</option>
                  {doctors.map(d => (
                    <option key={d.uid} value={d.uid}>Dr. {d.name} - {d.specialty}</option>
                  ))}
                </select>
              </div>
              {errors.doctorId && <p className="text-xs text-red-500">{errors.doctorId.message}</p>}
            </div>
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="block text-sm font-medium text-slate-700">Fecha</label>
              <input 
                type="date" 
                min={new Date().toISOString().split('T')[0]} // Minimo hoy en el input HTML
                {...register('date')}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {errors.date && <p className="text-xs text-red-500">{errors.date.message}</p>}
            </div>
            
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Hora</label>
              <input 
                type="time" 
                {...register('time')}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {errors.time && <p className="text-xs text-red-500">{errors.time.message}</p>}
            </div>
          </div>

          {/* Duración y Motivo */}
          <div className="space-y-4">
            <div className="space-y-1">
               <label className="block text-sm font-medium text-slate-700">Duración Estimada</label>
               <div className="flex gap-4">
                 {['15', '30', '60'].map((val) => (
                   <label key={val} className="flex items-center gap-2 cursor-pointer">
                     <input 
                       type="radio" 
                       value={val} 
                       {...register('duration')}
                       className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                     />
                     <span className="text-sm text-slate-600">{val} min</span>
                   </label>
                 ))}
               </div>
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Motivo de la Consulta</label>
              <textarea 
                {...register('reason')}
                rows={2}
                placeholder="Ej. Dolor de cabeza persistente, control mensual..."
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
              />
              {errors.reason && <p className="text-xs text-red-500">{errors.reason.message}</p>}
            </div>
          </div>
          
          {/* Info Note */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              La cita se creará en estado <strong>Pendiente</strong>. Recuerde que debe ser confirmada telefónicamente y pagada antes de pasar a consulta.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-6 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg transition-colors font-medium shadow-lg shadow-slate-900/20"
            >
              Agendar Cita
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
