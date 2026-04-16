import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, Calendar as CalendarIcon, Clock, User, Stethoscope, AlertCircle, Plus } from 'lucide-react';
import { UserProfile, Patient, Appointment, Specialty } from '../../types';
import { toast } from 'sonner';
import { doctorScheduleService } from '../../services/doctorScheduleService';
import { getSpecialties } from '../../services/inventoryService';
import { patientService } from '../../services/patientService';

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const igssTypeOptions = ['Consulta normal', 'Evaluación básica', 'Evaluación avanzada', 'Evaluación prequirúrgica'] as const;

const appointmentFormSchema = z.object({
  patientId: z.string().min(1, "Seleccione un paciente"),
  doctorId: z.string().min(1, "Seleccione un médico"),
  date: z.string().min(1, "Fecha requerida"),
  time: z.string().min(1, "Hora requerida"),
  reason: z.string().optional(),
  reasonForConsultation: z.string().min(1, "Seleccione una razón de consulta"),
  consultationType: z.enum(['Nueva', 'Reconsulta']),
  modality: z.enum(['Virtual', 'Presencial']),
  isIGSS: z.boolean().default(false),
  igssType: z.preprocess(
    (val) => (val === '' ? undefined : val),
    z.enum(igssTypeOptions).optional()
  ),
  duration: z.string().optional(),
}).refine(
  (data) => {
    if (data.consultationType !== 'Reconsulta') return true;
    if (!data.duration || data.duration.trim() === "") return true;
    const value = Number(data.duration);
    return !Number.isNaN(value) && value >= 10 && value <= 240;
  },
  {
    path: ['duration'],
    message: "Duración debe estar entre 10 y 240 minutos",
  }
).superRefine((data, ctx) => {
  if (data.isIGSS && !data.igssType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['igssType'],
      message: 'Seleccione el tipo de IGSS',
    });
  }
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
  // DESACTIVACION TEMPORAL: enfermeria/residente fuera de flujo.
  // Cambiar a `true` cuando se quiera reactivar.
  const ENABLE_NURSE_RESIDENT_FLOW = false;
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      consultationType: 'Nueva',
      modality: 'Presencial',
      isIGSS: false,
      date: initialDate ? formatDateInput(initialDate) : '',
    }
  });

  const [goToNurse, setGoToNurse] = useState(false);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [isPatientDropdownOpen, setIsPatientDropdownOpen] = useState(false);
  const [patientSearchResults, setPatientSearchResults] = useState<Patient[] | null>(null);
  const consultationType = watch('consultationType');
  const isIGSS = watch('isIGSS');
  const selectedPatientId = watch('patientId');
  const formatDoctorSpecialties = (doctor: UserProfile) => {
    const list = Array.isArray(doctor.specialties) && doctor.specialties.length > 0
      ? doctor.specialties
      : (doctor.specialty ? [doctor.specialty] : []);
    return list.join(', ');
  };
  const formatPatientLabel = (patient: Patient) => {
    const parts = [];
    if (patient.dpi) parts.push(`DPI ${patient.dpi}`);
    if (patient.billingCode) parts.push(`FAC ${patient.billingCode}`);
    const suffix = parts.length > 0 ? ` (${parts.join(' • ')})` : '';
    return `${patient.fullName}${suffix}`;
  };

  // Load Specialties
  useEffect(() => {
    const loadSpecialties = async () => {
      try {
        const data = await getSpecialties();
        setSpecialties(data);
      } catch (e) {
        console.error("Failed to load specialties", e);
      }
    };
    if (isOpen) {
      loadSpecialties();
    }
  }, [isOpen]);

  // Efecto para actualizar la fecha si cambia desde fuera
  useEffect(() => {
    if (initialDate) {
      setValue('date', formatDateInput(initialDate));
      const hours = String(initialDate.getHours()).padStart(2, '0');
      const minutes = String(initialDate.getMinutes()).padStart(2, '0');
      setValue('time', `${hours}:${minutes}`);
    }
  }, [initialDate, setValue]);

  useEffect(() => {
      if (preSelectedPatientId) {
          setValue('patientId', preSelectedPatientId);
          const selected = patients.find(p => p.id === preSelectedPatientId);
          if (selected) {
            setPatientSearchTerm(formatPatientLabel(selected));
          }
      }
  }, [preSelectedPatientId, setValue, patients]);

  useEffect(() => {
    const term = patientSearchTerm.trim();
    if (!term) {
      setPatientSearchResults(null);
      return;
    }
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const results = await patientService.search(term);
        if (active) {
          setPatientSearchResults(results);
        }
      } catch {
        if (active) {
          setPatientSearchResults([]);
        }
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [patientSearchTerm]);

  if (!isOpen) return null;

  const handleClose = () => {
    reset();
    setPatientSearchTerm('');
    setIsPatientDropdownOpen(false);
    onClose();
  };

  const handleFormSubmit = async (data: FormData) => {
    const startDateTime = new Date(`${data.date}T${data.time}`);
    startDateTime.setSeconds(0, 0);
    const baseDurationMinutes = data.consultationType === 'Nueva' ? 60 : 30;
    let durationMinutes = baseDurationMinutes;

    if (data.consultationType === 'Reconsulta' && data.duration && data.duration.trim() !== "") {
      const parsed = Number(data.duration);
      if (!Number.isNaN(parsed) && parsed >= 10 && parsed <= 240) {
        durationMinutes = parsed;
      }
    }
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);
    endDateTime.setSeconds(0, 0);
    const now = new Date();
    const ensureDate = (value: any) => {
      if (!value) return new Date();
      if (value instanceof Date) return value;
      if (value?.toDate) return value.toDate();
      if (typeof value === 'number') return new Date(value);
      if (value?.seconds) return new Date(value.seconds * 1000);
      return new Date(value);
    };

    if (startDateTime < now) {
        toast.error("No se pueden crear citas en el pasado.");
        return;
    }

    const exactDoctorSameTime = existingAppointments.find(appt => {
        if (appt.doctorId !== data.doctorId || appt.status === 'cancelled') return false;
        const apptStart = ensureDate(appt.date);
        return apptStart.getTime() === startDateTime.getTime();
    });

    if (exactDoctorSameTime) {
        if (exactDoctorSameTime.patientId === data.patientId) {
            toast.error("El paciente ya tiene una cita con este médico en esa hora.");
            return;
        }
        toast.error("El médico ya tiene una cita asignada en esa hora.");
        return;
    }

    const overlappingAppointments = existingAppointments.filter(appt => {
        if (appt.doctorId !== data.doctorId || appt.status === 'cancelled') return false;
        const apptStart = ensureDate(appt.date);
        const apptEnd = ensureDate(appt.endDate);
        return startDateTime < apptEnd && endDateTime > apptStart;
    });

    const patientConflict = overlappingAppointments.find(appt => appt.patientId === data.patientId);
    if (patientConflict) {
        toast.error("El paciente ya tiene una cita con este médico en ese horario.");
        return;
    }

    if (overlappingAppointments.length > 0) {
        toast.error("El médico ya tiene una cita asignada en ese horario.");
        return;
    }

    try {
      const validation = await doctorScheduleService.validateAppointmentForDoctor(data.doctorId, startDateTime);
      if (!validation.ok) {
        toast.error(validation.message || "El horario del médico no permite esta cita.");
        return;
      }
    } catch (e) {
      console.error("Error validando horario del médico:", e);
      toast.error("No se pudo validar el horario del médico. Intente nuevamente.");
      return;
    }

    const patient = patients.find(p => p.id === data.patientId);
    const doctor = doctors.find(d => d.uid === data.doctorId);

    const payload: any = {
      patientId: data.patientId,
      patientName: patient?.fullName || 'Desconocido',
      doctorId: data.doctorId,
      doctorName: doctor?.name || 'Desconocido',
      date: startDateTime,
      endDate: endDateTime,
      reason: data.reason,
      reasonForConsultation: data.reasonForConsultation,
      duration: durationMinutes,
      consultationType: data.consultationType,
      modality: data.modality,
      // Temporalmente toda cita va directo con doctor tras pago.
      // Se conserva el campo para reactivar luego.
      goToNurse: ENABLE_NURSE_RESIDENT_FLOW ? (data.consultationType === 'Reconsulta' ? goToNurse : true) : false,
      isIGSS: data.isIGSS
    };
    if (data.isIGSS && data.igssType) {
      payload.igssType = data.igssType;
    }

    onSubmit(payload);
    reset();
  };
  const filteredPatients = patientSearchTerm.trim()
    ? patients.filter(p => {
        const term = patientSearchTerm.trim().toLowerCase();
        const label = formatPatientLabel(p).toLowerCase();
        return label.includes(term)
          || (p.dpi ? String(p.dpi).toLowerCase().includes(term) : false)
          || (p.billingCode ? String(p.billingCode).toLowerCase().includes(term) : false)
          || (p.id ? String(p.id).toLowerCase().includes(term) : false);
      })
    : patients;
  const displayPatients = patientSearchTerm.trim()
    ? (patientSearchResults ?? filteredPatients)
    : patients;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-brand-900 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-brand-200" />
            Nueva Cita
          </h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="p-6 space-y-5 flex-1 overflow-y-auto">
          
          {/* Paciente y Doctor */}
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Paciente</label>
              <div className="flex gap-2">
                  <div className="relative flex-1">
                    <User className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={patientSearchTerm}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPatientSearchTerm(value);
                        const selected = patients.find(p => p.id === selectedPatientId);
                        if (!value.trim() || (selected && formatPatientLabel(selected).toLowerCase() !== value.trim().toLowerCase())) {
                          setValue('patientId', '');
                        }
                      }}
                      onFocus={() => setIsPatientDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsPatientDropdownOpen(false), 120)}
                      placeholder="Buscar paciente..."
                      className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                    />
                    <input type="hidden" {...register('patientId')} />
                    {isPatientDropdownOpen && (
                      <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl max-h-72 overflow-y-auto custom-scrollbar">
                        {displayPatients.length > 0 ? (
                          displayPatients.map(p => (
                            <div
                              key={p.id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setValue('patientId', p.id, { shouldValidate: true });
                                setPatientSearchTerm(formatPatientLabel(p));
                                setPatientSearchResults(null);
                                setIsPatientDropdownOpen(false);
                              }}
                              className="px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0"
                            >
                              {formatPatientLabel(p)}
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-slate-500">Sin coincidencias</div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* BOTÓN NUEVO PACIENTE */}
                  <button 
                      type="button"
                      onClick={onCreatePatientClick}
                      className="bg-brand-700 text-white p-2 rounded-lg hover:bg-brand-800 transition shadow-sm"
                      title="Crear Nuevo Paciente"
                  >
                      <Plus className="w-5 h-5" />
                  </button>
              </div>
              {errors.patientId && <p className="text-sm text-red-500">{errors.patientId.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-base font-medium text-slate-700">Médico</label>
              <div className="relative">
                <Stethoscope className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <select 
                  {...register('doctorId')}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                >
                  <option value="">Seleccione...</option>
                  {doctors.map(d => {
                    const label = formatDoctorSpecialties(d);
                    return (
                      <option key={d.uid} value={d.uid}>
                        Dr. {d.name}{label ? ` - ${label}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              {errors.doctorId && <p className="text-sm text-red-500">{errors.doctorId.message}</p>}
            </div>
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="block text-base font-medium text-slate-700">Fecha</label>
              <input 
                type="date" 
                min={formatDateInput(new Date())}
                {...register('date')}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
            </div>
            
            <div className="space-y-1">
              <label className="block text-base font-medium text-slate-700">Hora</label>
              <input 
                type="time" 
                {...register('time')}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {errors.time && <p className="text-sm text-red-500">{errors.time.message}</p>}
            </div>
          </div>

          {/* Tipo de consulta y Modalidad */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Tipo de consulta */}
            <div className="space-y-1">
              <label className="block text-base font-medium text-slate-700">Tipo de consulta</label>
              <div className="flex gap-4">
                {(['Nueva','Reconsulta'] as const).map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={type}
                      {...register('consultationType')}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-base text-slate-600">{type}</span>
                  </label>
                ))}
              </div>
              {errors.consultationType && <p className="text-sm text-red-500">{errors.consultationType.message}</p>}
              <p className="text-sm text-slate-500 mt-1">
                Nueva: 60 min. Reconsulta: 30 min.
              </p>
            </div>

            {/* Modalidad */}
            <div className="space-y-1">
              <label className="block text-base font-medium text-slate-700">Modalidad</label>
              <div className="flex gap-4">
                {(['Presencial','Virtual'] as const).map(mod => (
                  <label key={mod} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value={mod}
                      {...register('modality')}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-base text-slate-600">{mod}</span>
                  </label>
                ))}
              </div>
              {errors.modality && <p className="text-sm text-red-500">{errors.modality.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-base font-medium text-slate-700">IGSS</label>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
              <input
                type="checkbox"
                {...register('isIGSS')}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              Cita IGSS
            </label>
            {isIGSS && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">Tipo de IGSS</label>
                <select
                  {...register('igssType')}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
                >
                  <option value="">Seleccione...</option>
                  {igssTypeOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                {errors.igssType && <p className="text-xs text-red-500">{errors.igssType.message}</p>}
              </div>
            )}
          </div>

          {consultationType === 'Reconsulta' && (
            <div className="space-y-1">
              <label className="block text-base font-medium text-slate-700">Duración de la cita (minutos)</label>
              <input
                type="number"
                min={10}
                max={240}
                placeholder="30"
                {...register('duration')}
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <p className="text-[11px] text-slate-500">
                Si lo dejas vacío se usará la duración predeterminada de 30 minutos.
              </p>
              {errors.duration && <p className="text-xs text-red-500">{errors.duration.message}</p>}
            </div>
          )}

          {consultationType === 'Reconsulta' && ENABLE_NURSE_RESIDENT_FLOW && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Paso por enfermería</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={goToNurse}
                    onChange={() => setGoToNurse(true)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600">Con enfermería</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={!goToNurse}
                    onChange={() => setGoToNurse(false)}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-600">Directo con doctor</span>
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                Solo aplica para reconsultas y define si se pasa por enfermería.
              </p>
            </div>
          )}
          {consultationType === 'Reconsulta' && !ENABLE_NURSE_RESIDENT_FLOW && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Ruta de atención</label>
              <p className="text-sm text-emerald-700 font-semibold">Directo con doctor (temporal)</p>
            </div>
          )}

          {/* Razón de Consulta (Especialidad) */}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">Razón de Consulta</label>
            <select 
              {...register('reasonForConsultation')}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all bg-slate-50"
            >
              <option value="">Seleccione especialidad...</option>
              {specialties.map(s => (
                <option key={s.id || s.name} value={s.name}>{s.name}</option>
              ))}
            </select>
            {errors.reasonForConsultation && <p className="text-xs text-red-500">{errors.reasonForConsultation.message}</p>}
          </div>

          {/* Observaciones */}
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">Observaciones</label>
              <textarea 
                {...register('reason')}
                rows={2}
                placeholder="Ej. observaciones relevantes para esta cita..."
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
              onClick={handleClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-6 py-2 bg-brand-700 text-white hover:bg-brand-800 rounded-lg transition-colors font-medium shadow-lg shadow-brand-700/25"
            >
              Agendar Cita
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
