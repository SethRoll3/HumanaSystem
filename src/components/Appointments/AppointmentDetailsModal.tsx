import 
  React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  X, 
  Phone, 
  CreditCard, 
  Trash2, 
  User, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Stethoscope,
  Video,
  Users
} from 'lucide-react';
import { Appointment, AppointmentStatus, Patient, UserProfile } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { getPatientByDPI, patientService } from '../../services/patientService';
import { PatientEditModal } from '../Patients/PatientEditModal';
import { toast } from 'sonner';

interface AppointmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onConfirmPhone: (id: string, method: string) => void;
  onRegisterPayment: (id: string, receiptNumber: string, amount: number) => void;
  onCancel: (id: string, reason: string) => void;
  onUpdateAppointment?: (id: string, updates: Partial<Appointment>) => Promise<void> | void;
  userRole: string; 
  onOpenResidentIntake?: () => void;
  users?: UserProfile[]; // Propiedad opcional para mapear nombres
  currentUser?: UserProfile;
}

const paymentSchema = z.object({
  receiptNumber: z.string().min(1, "El número de boleta es requerido"),
  amount: z.string().min(1, "El monto es requerido").transform((val) => Number(val))
});

const igssTypeOptions = ['Consulta normal', 'Evaluación básica', 'Evaluación avanzada', 'Evaluación prequirúrgica'] as const;

export const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onConfirmPhone,
  onRegisterPayment,
  onCancel,
  onUpdateAppointment,
  userRole,
  onOpenResidentIntake,
  users = [],
  currentUser
}) => {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  // NUEVO: Estado para el formulario de confirmación
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [confirmationMethod, setConfirmationMethod] = useState<'En Persona' | 'Por Teléfono' | 'Por WhatsApp' | ''>('');

  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editDoctorId, setEditDoctorId] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editConsultationType, setEditConsultationType] = useState<'Nueva' | 'Reconsulta' | ''>('');
  const [editDuration, setEditDuration] = useState('');
  const [editModality, setEditModality] = useState<'Virtual' | 'Presencial' | ''>('');
  const [editIsIGSS, setEditIsIGSS] = useState(false);
  const [editIGSSType, setEditIGSSType] = useState<'Consulta normal' | 'Evaluación básica' | 'Evaluación avanzada' | 'Evaluación prequirúrgica' | ''>('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editConfirmationMethod, setEditConfirmationMethod] = useState<'En Persona' | 'Por Teléfono' | 'Por WhatsApp' | ''>('');
  const [editConfirmedById, setEditConfirmedById] = useState('');
  const [editReceiptNumber, setEditReceiptNumber] = useState('');
  const [editPaymentAmount, setEditPaymentAmount] = useState('');
  const [editPaidById, setEditPaidById] = useState('');
  const [showPatientEditModal, setShowPatientEditModal] = useState(false);
  const [patientForEdit, setPatientForEdit] = useState<Patient | null>(null);
  const [isLoadingPatientEdit, setIsLoadingPatientEdit] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(paymentSchema)
  });

  const isDoctor = userRole === 'doctor' || userRole === 'licenciado';
  const isAdmin = userRole === 'admin';
  // Solo admins y recepcionistas pueden gestionar (confirmar, pagar, cancelar)
  const canManage = userRole === 'admin' || userRole === 'receptionist';
  const canEditConfirmationMethod = canManage;
  const canEditPaymentFields = canManage;
  const canEditConfirmedBy = isAdmin;
  const canEditPaidBy = isAdmin;

  const [patientBillingCode, setPatientBillingCode] = useState<string>('');
  const [newBillingCode, setNewBillingCode] = useState<string>('');
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  // Resetear estados internos cuando cambia la cita o se cierra
  React.useEffect(() => {
    setShowPaymentForm(false);
    setShowCancelForm(false);
    setShowConfirmForm(false);
    setCancelReason('');
    setConfirmationMethod('');
    setIsEditing(false);
    setEditConfirmationMethod('');
    setEditConfirmedById('');
    setEditReceiptNumber('');
    setEditPaymentAmount('');
    setEditPaidById('');
    if (appointment) {
      const rawDate: any = appointment.date;
      let baseDate: Date;
      if (!rawDate) {
        baseDate = new Date();
      } else if (rawDate instanceof Date) {
        baseDate = rawDate;
      } else if (rawDate instanceof Timestamp) {
        baseDate = rawDate.toDate();
      } else if (typeof rawDate === 'number') {
        baseDate = new Date(rawDate);
      } else if (rawDate?.seconds) {
        baseDate = new Timestamp(rawDate.seconds, rawDate.nanoseconds).toDate();
      } else {
        baseDate = new Date(rawDate);
      }

      setEditDate(format(baseDate, 'yyyy-MM-dd'));
      setEditTime(format(baseDate, 'HH:mm'));
      setEditDoctorId(appointment.doctorId || '');
      setEditReason(appointment.reason || '');
      setEditConsultationType((appointment.consultationType as any) || 'Nueva');
      setEditDuration(
        appointment.consultationType === 'Reconsulta' && typeof appointment.duration === 'number'
          ? String(appointment.duration)
          : ''
      );
      setEditModality((appointment.modality as any) || '');
      setEditIsIGSS(Boolean(appointment.isIGSS));
      setEditIGSSType((appointment.igssType as any) || '');
      setEditConfirmationMethod((appointment.confirmationMethod as any) || '');
      setEditConfirmedById(appointment.confirmedBy || '');
      setEditReceiptNumber(appointment.paymentReceipt || '');
      setEditPaymentAmount(
        typeof appointment.paymentAmount === 'number' ? String(appointment.paymentAmount) : ''
      );
      setEditPaidById(appointment.paidBy || '');
    } else {
      setEditDate('');
      setEditTime('');
      setEditDoctorId('');
      setEditReason('');
      setEditConsultationType('Nueva');
      setEditDuration('');
      setEditModality('');
      setEditIsIGSS(false);
      setEditIGSSType('');
      setEditConfirmationMethod('');
      setEditConfirmedById('');
      setEditReceiptNumber('');
      setEditPaymentAmount('');
      setEditPaidById('');
    }
    reset();
  }, [appointment, isOpen, reset]);

  React.useEffect(() => {
    if (!isOpen) {
      setShowPatientEditModal(false);
      setPatientForEdit(null);
      setIsLoadingPatientEdit(false);
    }
  }, [isOpen]);

  React.useEffect(() => {
    const loadPatientBilling = async () => {
      if (!appointment?.patientId) return;
      try {
        const p = await getPatientByDPI(appointment.patientId);
        const code = (p?.billingCode || '').trim();
        setPatientBillingCode(code);
        setNewBillingCode(code);
      } catch {
      }
    };
    if (showPaymentForm) {
      loadPatientBilling();
    } else {
      setPatientBillingCode('');
      setNewBillingCode('');
    }
  }, [showPaymentForm, appointment]);

  const handleSaveBillingCode = async () => {
    if (!appointment?.patientId) return;
    const code = (newBillingCode || '').trim();
    if (!code) {
      return;
    }
    setIsSavingBilling(true);
    try {
      await patientService.updateBillingCode(appointment.patientId, code);
      setPatientBillingCode(code);
    } finally {
      setIsSavingBilling(false);
    }
  };

  const getUserName = (uid: string | undefined) => {
    if (!uid) return 'Desconocido';
    const user = users.find(u => u.uid === uid);
    return user ? user.name : uid;
  };

  if (!isOpen || !appointment) return null;

  const canEditAppointment =
    (userRole === 'admin' || userRole === 'receptionist') &&
    !['cancelled', 'no_show', 'completed'].includes(appointment.status);
  const doctorOptions = users.filter(u => u.role === 'doctor' || u.role === 'licenciado');
  const formatDoctorSpecialties = (doctor: UserProfile) => {
    const list = Array.isArray(doctor.specialties) && doctor.specialties.length > 0
      ? doctor.specialties
      : (doctor.specialty ? [doctor.specialty] : []);
    return list.join(', ');
  };
  const isReceptionistUser = userRole === 'receptionist';
  const isAdminUser = userRole === 'admin';
  const canConfigureNurseFlow = (isReceptionistUser || isAdminUser) && appointment.consultationType === 'Reconsulta';
  const appointmentGoToNurse = appointment.goToNurse !== false;

  const handleOpenPatientEdit = async () => {
    if (!appointment.patientId) return;
    setIsLoadingPatientEdit(true);
    try {
      const patient = await getPatientByDPI(appointment.patientId);
      if (!patient) {
        toast.error('No se encontró el paciente');
        return;
      }
      setPatientForEdit(patient);
      setShowPatientEditModal(true);
    } catch (error) {
      toast.error('Error al cargar datos del paciente');
    } finally {
      setIsLoadingPatientEdit(false);
    }
  };

  const ensureDate = (date: any): Date => {
    if (!date) return new Date();
    if (date instanceof Date) return date;
    if (date instanceof Timestamp) return date.toDate();
    if (typeof date === 'number') return new Date(date);
    if (date?.seconds) return new Timestamp(date.seconds, date.nanoseconds).toDate();
    return new Date(date);
  };

  const canMarkNoShowBase =
    (userRole === 'admin' || userRole === 'receptionist') &&
    ['confirmed_phone', 'paid_checked_in', 'resident_intake'].includes(appointment.status);

  const appointmentDate = ensureDate(appointment.date);
  const nowLocal = new Date();
  const hasAppointmentTimePassed = appointmentDate.getTime() <= nowLocal.getTime();

  const canMarkNoShow = canMarkNoShowBase && hasAppointmentTimePassed;

  const handlePaymentSubmit = (data: any) => {
    onRegisterPayment(appointment.id!, data.receiptNumber, data.amount);
    setShowPaymentForm(false);
  };

  const getStatusBadge = (status: AppointmentStatus) => {
    switch(status) {
      case 'scheduled':
        return <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm font-medium border border-slate-200">Agendada</span>;
      case 'confirmed_phone':
        return <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium border border-yellow-200">Confirmada</span>;
      case 'paid_checked_in':
        return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium border border-green-200">Pagada / En Sala (Enfermería)</span>;
      case 'resident_intake':
        return <span className="bg-sky-100 text-sky-700 px-3 py-1 rounded-full text-sm font-medium border border-sky-200">Evaluación Enfermería Completa</span>;
      case 'in_progress':
        return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium border border-blue-200">En Consulta</span>;
      case 'completed':
        return <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-sm font-medium border border-gray-200">Finalizada</span>;
      case 'cancelled':
        return <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-medium border border-red-200">Cancelada</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-brand-900 px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-2xl font-bold text-white">Detalles de la Cita</h2>
            <p className="text-white text-base font-medium opacity-90 mt-1">ID: {appointment.id}</p>
          </div>
          <div className="flex items-center gap-3">
            {canEditAppointment && !isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-slate-50 border border-white/20 hover:bg-white/20 transition-colors"
              >
                Editar
              </button>
            )}
            {canEditAppointment && isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/10 text-slate-50 border border-white/20 hover:bg-white/20 transition-colors"
              >
                Cancelar edición
              </button>
            )}
            <button onClick={onClose} className="text-slate-200 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto">
          
          {/* Status Bar */}
          <div className="flex items-center justify-between mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
               {getStatusBadge(appointment.status)}
            </div>
            <div className="text-sm text-slate-500">
              Creada el {appointment.createdAt ? format(ensureDate(appointment.createdAt), 'dd/MM/yyyy HH:mm') : '-'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            {/* Patient Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <User className="w-4 h-4" /> Paciente
              </h3>
              <div>
                <p className="text-lg font-bold text-slate-800">{appointment.patientName}</p>
                {canManage && (
                  <button
                    type="button"
                    onClick={handleOpenPatientEdit}
                    disabled={isLoadingPatientEdit}
                    className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-brand-700 hover:text-brand-800"
                  >
                    {isLoadingPatientEdit ? 'Cargando...' : 'Editar datos del paciente'}
                  </button>
                )}
              </div>
            </div>

            {/* Doctor & Time */}
            <div className="space-y-4">
               <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Datos de la Cita
              </h3>
              {isEditing && canEditAppointment ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-500">Médico</label>
                    <select
                      value={editDoctorId}
                      onChange={(e) => setEditDoctorId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 bg-white"
                    >
                      <option value="">Seleccione...</option>
                      {doctorOptions.map(doc => {
                        const label = formatDoctorSpecialties(doc);
                        return (
                          <option key={doc.uid} value={doc.uid}>
                            Dr. {doc.name}{label ? ` - ${label}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-500">Fecha</label>
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-500">Hora</label>
                      <input
                        type="time"
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-500">Tipo de consulta</label>
                    <div className="flex gap-4">
                      {(['Nueva', 'Reconsulta'] as const).map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={editConsultationType === type}
                            onChange={() => setEditConsultationType(type)}
                            className="w-3 h-3 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-slate-700">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {editConsultationType === 'Reconsulta' && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-500">Duración (minutos)</label>
                      <input
                        type="number"
                        min={10}
                        max={240}
                        value={editDuration}
                        onChange={(e) => setEditDuration(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500"
                        placeholder="Ej. 30"
                      />
                    </div>
                  )}

                  {/* Edit Modality */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-500">Modalidad</label>
                    <div className="flex gap-4">
                      {(['Presencial', 'Virtual'] as const).map(mod => (
                        <label key={mod} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            checked={editModality === mod}
                            onChange={() => setEditModality(mod)}
                            className="w-3 h-3 text-brand-600 focus:ring-brand-500"
                          />
                          <span className="text-sm text-slate-700">{mod}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-500">IGSS</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={editIsIGSS}
                          onChange={() => setEditIsIGSS(true)}
                          className="w-3 h-3 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-slate-700">Sí</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={!editIsIGSS}
                          onChange={() => {
                            setEditIsIGSS(false);
                            setEditIGSSType('');
                          }}
                          className="w-3 h-3 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="text-sm text-slate-700">No</span>
                      </label>
                    </div>
                  </div>
                  {editIsIGSS && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-500">Tipo de IGSS</label>
                      <select
                        value={editIGSSType}
                        onChange={(e) => setEditIGSSType(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 bg-white"
                      >
                        <option value="">Seleccione...</option>
                        {igssTypeOptions.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-slate-700">Dr. {appointment.doctorName}</p>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Calendar className="w-4 h-4" />
                    {format(ensureDate(appointment.date), "EEEE d 'de' MMMM", { locale: es })}
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    <Clock className="w-4 h-4" />
                    {format(ensureDate(appointment.date), "HH:mm")} - {format(ensureDate(appointment.endDate), "HH:mm")}
                  </div>
                  <div className="flex items-center gap-2 text-slate-600">
                    {appointment.modality === 'Virtual' ? <Video className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                    {appointment.modality || 'Presencial'}
                  </div>
                  {appointment.isIGSS && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-[0.14em] border border-fuchsia-200 bg-fuchsia-100 text-fuchsia-700">
                        IGSS
                      </span>
                      <span className="text-sm text-slate-700">
                        {appointment.igssType || 'IGSS'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Razón de Consulta (Especialidad) */}
          {appointment.reasonForConsultation && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Stethoscope className="w-4 h-4" /> Razón de Consulta
              </h3>
              <p className="text-slate-800 font-medium text-lg border-l-4 border-brand-500 pl-3">
                {appointment.reasonForConsultation}
              </p>
            </div>
          )}

          {/* Observaciones */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Observaciones
            </h3>
            {isEditing && canEditAppointment ? (
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={3}
                className="w-full bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-100 focus:border-brand-500 resize-none"
                placeholder="Observaciones de la cita"
              />
            ) : (
              <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-700">
                {appointment.reason || "Sin especificar"}
              </p>
            )}
          </div>

          {canConfigureNurseFlow && (
            <div className="mb-8 bg-slate-50 p-4 rounded-lg border border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Paso por enfermería (solo reconsulta)
                </h3>
                <p className="text-[11px] text-slate-600">
                  {appointmentGoToNurse
                    ? 'Después de pagar, el paciente irá con enfermería antes del doctor.'
                    : 'Después de pagar, el paciente pasará directo con el doctor.'}
                </p>
              </div>
              {onUpdateAppointment && (appointment.status === 'scheduled' || appointment.status === 'confirmed_phone') && appointment.id && (
                <button
                  type="button"
                  onClick={async () => {
                    const nextValue = !appointmentGoToNurse;
                    await onUpdateAppointment(appointment.id!, { goToNurse: nextValue });
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    appointmentGoToNurse
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {appointmentGoToNurse ? 'Cambiar a directo a doctor' : 'Cambiar a con enfermería'}
                </button>
              )}
            </div>
          )}

          {/* Info de quién agendó la cita */}
          {appointment.createdBy && (
             <div className="mb-8 bg-slate-50 p-4 rounded-lg border border-slate-200">
               <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                 <Calendar className="w-4 h-4" /> Agendado por
               </h3>
               <div className="text-sm text-slate-800">
                 <span className="font-medium">{getUserName(appointment.createdBy)}</span>
                 {appointment.createdAt && (
                   <span className="text-slate-500 ml-2">
                     — {format(ensureDate(appointment.createdAt), "dd/MM/yyyy 'a las' HH:mm")}
                   </span>
                 )}
               </div>
             </div>
          )}

          {/* Info de Confirmación si existe */}
          {appointment.confirmedBy && (
             <div className="mb-8 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
               <h3 className="text-sm font-bold text-yellow-800 mb-2 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4" /> Confirmación
               </h3>
              {isEditing && canEditAppointment && canEditConfirmationMethod ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-yellow-900">
                   <div className="space-y-1">
                     <span className="font-medium block">Método:</span>
                     <select
                       value={editConfirmationMethod}
                       onChange={(e) => setEditConfirmationMethod(e.target.value as any)}
                       className="w-full px-3 py-2 rounded-lg border border-yellow-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:border-yellow-500"
                     >
                       <option value="">Seleccione...</option>
                       <option value="En Persona">En Persona</option>
                       <option value="Por Teléfono">Por Teléfono</option>
                       <option value="Por WhatsApp">Por WhatsApp</option>
                     </select>
                   </div>
                   <div className="space-y-1">
                     <span className="font-medium block">Por:</span>
                     {canEditConfirmedBy ? (
                       <select
                         value={editConfirmedById}
                         onChange={(e) => setEditConfirmedById(e.target.value)}
                         className="w-full px-3 py-2 rounded-lg border border-yellow-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-yellow-200 focus:border-yellow-500"
                       >
                         <option value="">Seleccione usuario...</option>
                         {users.map(u => (
                           <option key={u.uid} value={u.uid}>{u.name}</option>
                         ))}
                       </select>
                     ) : (
                       <p className="text-yellow-900">{getUserName(appointment.confirmedBy)}</p>
                     )}
                   </div>
                 </div>
               ) : (
                 <div className="text-sm text-yellow-900">
                   <span className="font-medium">Método: </span> {appointment.confirmationMethod || 'No especificado'} <br/>
                   <span className="font-medium">Por: </span> {getUserName(appointment.confirmedBy)}
                 </div>
               )}
             </div>
          )}

          {/* Payment Info if exists - MOSTRAR SIEMPRE QUE HAYA SIDO PAGADA */}
          {['paid_checked_in', 'resident_intake', 'in_progress', 'completed'].includes(appointment.status) && (
             <div className="mb-8 bg-green-50 p-4 rounded-lg border border-green-100">
               <h3 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4" /> Pago Registrado
               </h3>
              {isEditing && canEditAppointment && canEditPaymentFields ? (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                   <div className="space-y-1">
                     <span className="text-green-700 font-medium block">No. Boleta:</span>
                     <input
                       value={editReceiptNumber}
                       onChange={(e) => setEditReceiptNumber(e.target.value)}
                       className="w-full px-3 py-2 rounded-lg border border-green-200 text-sm text-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-500"
                       placeholder="No. boleta"
                     />
                   </div>
                   <div className="space-y-1">
                     <span className="text-green-700 font-medium block">Monto (Q):</span>
                     <input
                       type="number"
                       step="0.01"
                       value={editPaymentAmount}
                       onChange={(e) => setEditPaymentAmount(e.target.value)}
                       className="w-full px-3 py-2 rounded-lg border border-green-200 text-sm text-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-500"
                       placeholder="0.00"
                     />
                   </div>
                   <div className="space-y-1 md:col-span-1">
                     <span className="text-green-700 font-medium block">Cobrado por:</span>
                    {canEditPaidBy ? (
                      <select
                        value={editPaidById}
                        onChange={(e) => setEditPaidById(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-green-200 text-sm text-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-500"
                      >
                        <option value="">Seleccione usuario...</option>
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{u.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-green-900">{getUserName(appointment.paidBy)}</p>
                    )}
                   </div>
                 </div>
               ) : (
                 <div className="grid grid-cols-2 gap-4 text-sm">
                   <div>
                     <span className="text-green-700 font-medium">No. Boleta:</span>
                     <p className="text-green-900">{appointment.paymentReceipt}</p>
                   </div>
                   <div>
                     <span className="text-green-700 font-medium">Monto:</span>
                     <p className="text-green-900">Q{appointment.paymentAmount?.toFixed(2)}</p>
                   </div>
                   <div className="col-span-2">
                     <span className="text-green-700 font-medium">Cobrado por:</span>
                     <p className="text-green-900 truncate">{getUserName(appointment.paidBy)}</p>
                   </div>
                 </div>
               )}
             </div>
          )}

          {userRole === 'nurse' && appointment.status === 'paid_checked_in' && (
            <div className="mb-8 bg-sky-50 p-4 rounded-lg border border-sky-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-sky-800">Evaluación por Enfermería</h3>
                <p className="text-xs text-sky-700">Complete antecedentes y adjunte archivos antes de la consulta.</p>
              </div>
              <button
                type="button"
                onClick={onOpenResidentIntake}
                disabled={!onOpenResidentIntake}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
              >
                Llenar datos de enfermería
              </button>
            </div>
          )}

          {/* ACTIONS AREA (SOLO SI TIENE PERMISOS) */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            
            {/* 1. Confirmar (Solo no-doctores) */}
            {canManage && appointment.status === 'scheduled' && !showConfirmForm && (
              <div className="flex items-center justify-between bg-yellow-50 p-4 rounded-lg border border-yellow-100">
                <div>
                  <h4 className="font-bold text-yellow-800">Confirmación</h4>
                  <p className="text-xs text-yellow-700">¿El paciente confirmó su asistencia?</p>
                </div>
                <button 
                  onClick={() => setShowConfirmForm(true)}
                  className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" /> Confirmar
                </button>
              </div>
            )}

            {/* FORMULARIO CONFIRMACIÓN */}
            {showConfirmForm && (
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 animate-in slide-in-from-top-2">
                    <h4 className="font-bold text-yellow-800 mb-3">Método de Confirmación</h4>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                        {['En Persona', 'Por Teléfono', 'Por WhatsApp'].map((m) => (
                            <button
                                key={m}
                                onClick={() => setConfirmationMethod(m as any)}
                                className={`py-2 px-1 text-xs font-bold rounded-lg border transition-all ${
                                    confirmationMethod === m 
                                    ? 'bg-yellow-600 text-white border-yellow-700 shadow-sm' 
                                    : 'bg-white text-yellow-800 border-yellow-200 hover:bg-yellow-100'
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowConfirmForm(false)} className="px-3 py-1.5 text-yellow-700 text-sm font-bold hover:bg-yellow-100 rounded">Cancelar</button>
                        <button 
                            disabled={!confirmationMethod}
                            onClick={() => onConfirmPhone(appointment.id!, confirmationMethod)}
                            className="px-4 py-1.5 bg-yellow-600 text-white text-sm font-bold rounded shadow-sm hover:bg-yellow-700 disabled:opacity-50"
                        >
                            Guardar Confirmación
                        </button>
                    </div>
                </div>
            )}

            {/* 2. Register Payment (Solo no-doctores) */}
            {canManage && appointment.status === 'confirmed_phone' && !showPaymentForm && (
              <div className="flex items-center justify-between bg-blue-50 p-4 rounded-lg border border-blue-100">
                 <div>
                  <h4 className="font-bold text-blue-800">Pago en Caja</h4>
                  <p className="text-xs text-blue-700">Registrar boleta para habilitar consulta</p>
                </div>
                <button 
                  onClick={() => setShowPaymentForm(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                >
                  <CreditCard className="w-4 h-4" /> Registrar Pago
                </button>
              </div>
            )}

            {/* Payment Form Inline */}
            {showPaymentForm && (
              <form onSubmit={handleSubmit(handlePaymentSubmit)} className="bg-slate-50 p-4 rounded-lg border border-slate-200 animate-in slide-in-from-top-2">
                 <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                   <CreditCard className="w-5 h-5 text-blue-600" /> Datos del Pago
                 </h4>
                 <div className="mb-4">
                   <div className={`border rounded-lg p-3 ${patientBillingCode ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                     <p className={`text-sm mb-2 ${patientBillingCode ? 'text-blue-800' : 'text-amber-800'}`}>
                       {patientBillingCode
                         ? 'Código de facturación actual. Puedes editarlo si es necesario.'
                         : 'Este paciente no tiene código de facturación registrado. Ingrese el número para guardarlo.'}
                     </p>
                     <div className="flex items-center gap-2">
                       <input 
                         value={newBillingCode}
                         onChange={(e) => setNewBillingCode(e.target.value)}
                         className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 text-slate-900 bg-white ${patientBillingCode ? 'border-blue-200 focus:ring-blue-100 focus:border-blue-400' : 'border-amber-200 focus:ring-amber-200 focus:border-amber-400'}`}
                         placeholder="Ej. FAC-000123"
                       />
                       <button 
                         type="button"
                         onClick={handleSaveBillingCode}
                         disabled={isSavingBilling}
                         className={`px-3 py-2 text-white rounded-lg text-sm font-bold disabled:opacity-50 ${patientBillingCode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                       >
                         Guardar código
                       </button>
                     </div>
                   </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">No. Boleta</label>
                     <input 
                       {...register('receiptNumber')}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                       placeholder="Ej. 123456"
                     />
                     {errors.receiptNumber && <p className="text-xs text-red-500 mt-1">{(errors.receiptNumber as any).message}</p>}
                   </div>
                   <div>
                     <label className="block text-sm font-medium text-slate-700 mb-1">Monto (Q)</label>
                     <input 
                       type="number"
                       step="0.01"
                       {...register('amount')}
                       className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                       placeholder="0.00"
                     />
                     {errors.amount && <p className="text-xs text-red-500 mt-1">{(errors.amount as any).message}</p>}
                   </div>
                 </div>
                 <div className="flex justify-end gap-3">
                   <button 
                     type="button" 
                     onClick={() => setShowPaymentForm(false)}
                     className="px-3 py-1.5 text-slate-600 hover:text-slate-800 text-sm font-medium"
                   >
                     Cancelar
                   </button>
                   <button 
                     type="submit"
                     className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm shadow-sm"
                   >
                     Guardar y Check-in
                   </button>
                 </div>
              </form>
            )}

            {/* Cancel Actions: SOLO NO-DOCTORES */}
            {canManage && !['completed', 'cancelled', 'no_show', 'in_progress'].includes(appointment.status) && !showCancelForm && (
               <button 
                 onClick={() => setShowCancelForm(true)}
                 className="w-full py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
               >
                 <Trash2 className="w-4 h-4" /> Cancelar Cita
               </button>
            )}

            {canMarkNoShow && (
              <button
                type="button"
                onClick={() => onCancel(appointment.id!, 'no_show_internal')}
                className="w-full mt-2 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <AlertCircle className="w-4 h-4" /> Marcar como no se presentó
              </button>
            )}

            {showCancelForm && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-100 animate-in slide-in-from-top-2">
                <h4 className="font-bold text-red-800 mb-2 flex items-center gap-2">
                   <AlertCircle className="w-4 h-4" /> Confirmar Cancelación
                </h4>
                <textarea 
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Motivo de la cancelación..."
                  className="w-full p-2 border border-red-200 rounded-lg text-sm mb-3 focus:outline-none focus:border-red-400"
                  rows={2}
                />
                <div className="flex justify-end gap-3">
                   <button 
                     onClick={() => setShowCancelForm(false)}
                     className="px-3 py-1.5 text-red-700 hover:bg-red-100 rounded text-sm font-medium"
                   >
                     Atrás
                   </button>
                   <button 
                     onClick={() => onCancel(appointment.id!, cancelReason)}
                     disabled={!cancelReason.trim()}
                     className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     Confirmar Cancelar
                   </button>
                 </div>
              </div>
            )}

            {canEditAppointment && isEditing && (
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    !onUpdateAppointment ||
                    !editDate ||
                    !editTime ||
                    !editDoctorId ||
                    isSavingEdit
                  }
                  onClick={async () => {
                    if (!onUpdateAppointment || !appointment.id) return;
                    setIsSavingEdit(true);
                    try {
                      const startDateTime = new Date(`${editDate}T${editTime}`);
                      if (Number.isNaN(startDateTime.getTime())) {
                        setIsSavingEdit(false);
                        return;
                      }
                      const normalizedConsultationType =
                        editConsultationType || (appointment.consultationType as any) || 'Nueva';
                      let durationMinutes =
                        normalizedConsultationType === 'Nueva'
                          ? 60
                          : typeof appointment.duration === 'number' && appointment.duration > 0
                          ? appointment.duration
                          : 30;

                      if (normalizedConsultationType === 'Reconsulta') {
                        if (editDuration.trim() !== '') {
                          const parsedDuration = Number(editDuration);
                          if (Number.isNaN(parsedDuration) || parsedDuration < 10 || parsedDuration > 240) {
                            toast.error("Duración debe estar entre 10 y 240 minutos");
                            setIsSavingEdit(false);
                            return;
                          }
                          durationMinutes = parsedDuration;
                        }
                      }

                      const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);
                      const selectedDoctor = doctorOptions.find(d => d.uid === editDoctorId);
                      const parsedAmount = editPaymentAmount ? Number(editPaymentAmount) : undefined;

                      if (editIsIGSS && !editIGSSType) {
                        toast.error("Seleccione el tipo de IGSS");
                        setIsSavingEdit(false);
                        return;
                      }

                      const updates: Partial<Appointment> = {
                        doctorId: editDoctorId,
                        doctorName: selectedDoctor?.name || appointment.doctorName,
                        date: startDateTime,
                        endDate: endDateTime,
                        duration: durationMinutes,
                        reason: editReason.trim() || appointment.reason,
                        modality: editModality || appointment.modality || 'Presencial',
                        isIGSS: editIsIGSS,
                        consultationType: normalizedConsultationType,
                      };

                      if (editIsIGSS && editIGSSType) {
                        updates.igssType = editIGSSType;
                      }

                      if (canEditConfirmationMethod) {
                        updates.confirmationMethod = editConfirmationMethod || appointment.confirmationMethod;
                      }
                      if (canEditConfirmedBy) {
                        updates.confirmedBy = editConfirmedById || appointment.confirmedBy;
                      }
                      if (canEditPaidBy) {
                        updates.paidBy = editPaidById || appointment.paidBy;
                      }
                      if (canEditPaymentFields) {
                        updates.paymentReceipt = editReceiptNumber || appointment.paymentReceipt;
                        if (typeof parsedAmount === 'number' && !Number.isNaN(parsedAmount)) {
                          updates.paymentAmount = parsedAmount;
                        } else if (typeof appointment.paymentAmount === 'number') {
                          updates.paymentAmount = appointment.paymentAmount;
                        }
                      }

                      await onUpdateAppointment(appointment.id, updates);
                      setIsEditing(false);
                    } finally {
                      setIsSavingEdit(false);
                    }
                  }}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-lg text-sm font-semibold shadow-md shadow-brand-600/30 transition-colors disabled:cursor-not-allowed"
                >
                  Guardar cambios
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {showPatientEditModal && patientForEdit && currentUser && (
        <PatientEditModal
          isOpen={showPatientEditModal}
          onClose={() => setShowPatientEditModal(false)}
          patient={patientForEdit}
          currentUser={currentUser}
          appointmentId={appointment.id}
          onSaved={(updated) => setPatientForEdit(updated)}
        />
      )}
    </div>
  );
};
