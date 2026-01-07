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
  FileText
} from 'lucide-react';
import { Appointment, AppointmentStatus } from '../../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AppointmentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: Appointment | null;
  onConfirmPhone: (id: string, method: string) => void;
  onRegisterPayment: (id: string, receiptNumber: string, amount: number) => void;
  onCancel: (id: string, reason: string) => void;
  userRole: string; 
  onOpenResidentIntake?: () => void;
}

const paymentSchema = z.object({
  receiptNumber: z.string().min(1, "El número de boleta es requerido"),
  amount: z.string().min(1, "El monto es requerido").transform((val) => Number(val))
});

export const AppointmentDetailsModal: React.FC<AppointmentDetailsModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onConfirmPhone,
  onRegisterPayment,
  onCancel,
  userRole,
  onOpenResidentIntake
}) => {
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  
  // NUEVO: Estado para el formulario de confirmación
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [confirmationMethod, setConfirmationMethod] = useState<'En Persona' | 'Por Teléfono' | 'Por WhatsApp' | ''>('');

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(paymentSchema)
  });

  const isDoctor = userRole === 'doctor';
  const isResident = userRole === 'resident';
  // Solo admins y recepcionistas pueden gestionar (confirmar, pagar, cancelar)
  const canManage = userRole === 'admin' || userRole === 'receptionist';

  // Resetear estados internos cuando cambia la cita o se cierra
  React.useEffect(() => {
    setShowPaymentForm(false);
    setShowCancelForm(false);
    setShowConfirmForm(false);
    setCancelReason('');
    setConfirmationMethod('');
    reset();
  }, [appointment, isOpen, reset]);

  if (!isOpen || !appointment) return null;

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
        return <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium border border-green-200">Pagada / En Sala (Residente)</span>;
      case 'resident_intake':
        return <span className="bg-sky-100 text-sky-700 px-3 py-1 rounded-full text-sm font-medium border border-sky-200">Evaluación Residente Completa</span>;
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
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">Detalles de la Cita</h2>
            <p className="text-slate-400 text-sm">ID: {appointment.id}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto">
          
          {/* Status Bar */}
          <div className="flex items-center justify-between mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
               {getStatusBadge(appointment.status)}
            </div>
            <div className="text-sm text-slate-500">
              Creada el {appointment.createdAt ? format(appointment.createdAt.toDate(), 'dd/MM/yyyy HH:mm') : '-'}
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
              </div>
            </div>

            {/* Doctor & Time */}
            <div className="space-y-4">
               <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Datos de la Cita
              </h3>
              <div className="space-y-2">
                <p className="font-medium text-slate-700">Dr. {appointment.doctorName}</p>
                <div className="flex items-center gap-2 text-slate-600">
                  <Calendar className="w-4 h-4" />
                  {format(appointment.date, "EEEE d 'de' MMMM", { locale: es })}
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <Clock className="w-4 h-4" />
                  {format(appointment.date, "HH:mm")} - {format(appointment.endDate, "HH:mm")}
                </div>
              </div>
            </div>
          </div>

          {/* Reason */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" /> Motivo
            </h3>
            <p className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-slate-700">
              {appointment.reason || "Sin especificar"}
            </p>
          </div>

          {/* Info de Confirmación si existe */}
          {appointment.confirmedBy && (
             <div className="mb-8 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
               <h3 className="text-sm font-bold text-yellow-800 mb-2 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4" /> Confirmación
               </h3>
               <div className="text-sm text-yellow-900">
                 <span className="font-medium">Método: </span> {appointment.confirmationMethod || 'No especificado'} <br/>
                 <span className="font-medium">Por: </span> {appointment.confirmedBy || 'Desconocido'}
               </div>
             </div>
          )}

          {/* Payment Info if exists */}
          {appointment.status === 'paid_checked_in' && (
             <div className="mb-8 bg-green-50 p-4 rounded-lg border border-green-100">
               <h3 className="text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                 <CheckCircle2 className="w-4 h-4" /> Pago Registrado
               </h3>
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
                   <p className="text-green-900 truncate">{appointment.paidBy || 'Desconocido'}</p>
                 </div>
               </div>
             </div>
          )}

          {isResident && appointment.status === 'paid_checked_in' && (
            <div className="mb-8 bg-sky-50 p-4 rounded-lg border border-sky-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-sky-800">Evaluación por Residente</h3>
                <p className="text-xs text-sky-700">Complete antecedentes y adjunte archivos antes de la consulta.</p>
              </div>
              <button
                type="button"
                onClick={onOpenResidentIntake}
                disabled={!onOpenResidentIntake}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium shadow-sm disabled:opacity-50"
              >
                Llenar datos de residente
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

          </div>
        </div>
      </div>
    </div>
  );
};
