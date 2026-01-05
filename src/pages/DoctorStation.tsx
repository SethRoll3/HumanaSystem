import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { 
    Search, Loader2, UserPlus, Save, CheckCircle, Trash2, 
    Clock, Zap, UserSearch, ChevronRight, Plus, AlertTriangle, 
    X, User, Briefcase, Phone, CreditCard, Users, RefreshCcw, 
    MapPin, FileText, Home, ArrowRight, DollarSign, Lock, 
    Calendar as CalendarIcon, List, LayoutGrid 
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, doc, Timestamp, updateDoc, query, where, onSnapshot, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { motion, AnimatePresence } from 'framer-motion';

import { Patient, Consultation, UserProfile, PrescriptionItem, ReferralGroup, SpecialtyReferral, Appointment } from '../../types';
import { MainLayout } from '../components/Layout/MainLayout';
import { AdminPanel } from './AdminPanel';
import { UserProfileSettings } from './UserProfileSettings'; 
import { StepDiagnosis } from '../components/Wizard/StepDiagnosis';
import { StepExams } from '../components/Wizard/StepExams';
import { StepFinalize } from '../components/Wizard/StepFinalize';
import { StepPrescription } from '../components/Wizard/StepPrescription'; 
import { ConsultationDetail } from '../components/History/ConsultationDetail'; 
import { HistoryList } from '../components/History/HistoryList'; 
import { QuickPatientModal } from '../components/Patients/QuickPatientModal'; 
import { CreateAppointmentModal } from '../components/Appointments/CreateAppointmentModal';
import { AppointmentCalendar } from './AppointmentCalendar'; 

import { searchPatients, getPatientByDPI, checkAndSwitchToReconsultation, deleteWaitingConsultation, patientService } from '../services/patientService';
import { appointmentService } from '../services/appointmentService'; 
import { getActiveDoctors, userService } from '../services/userService';
import { notifyCancellationToAdmins } from '../services/emailService'; 
import { notifyConsultationCreated, notifyConsultationCancelled, notifyConsultationFinished, notifyConsultationDelivered } from '../services/notificationService';
import { logAuditAction } from '../services/auditService';
import { generatePrescriptionPDF, generateExamsPDF, generateNursingPDF } from '../services/pdfService';

interface DoctorStationProps {
  user: UserProfile;
  onLogout: () => void;
}

interface WizardFormValues {
  diagnosis: string;
  referralNote: string;
  exams: string[];
  referralGroups: ReferralGroup[];
  specialtyReferrals: SpecialtyReferral[];
  prescription: PrescriptionItem[];
  signature: any;
  followUpText: string;
  omittedFields: { [key: string]: boolean };
  isReadyToFinish: boolean;
  prescriptionNotes: string;
}

export const DoctorStation: React.FC<DoctorStationProps> = ({ user, onLogout }) => {
  const isAdmin = user.role === 'admin';
  const isDoctor = user.role === 'doctor';
  const isNurse = user.role === 'nurse';
  
  // Roles de permisos
  const canConsult = isDoctor || isAdmin;
  const canCreate = !isDoctor; // Solo no-doctores pueden crear citas

  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'admin' | 'history_detail' | 'settings'>('dashboard');
  
  // ESTADO PARA ALTERNAR VISTA AGENDA (Lista vs Calendario)
  const [agendaViewMode, setAgendaViewMode] = useState<'list' | 'calendar'>('list');

  // ESTADO PRINCIPAL DE WIZARD
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [currentConsultationId, setCurrentConsultationId] = useState<string | null>(null);
  const [step, setStep] = useState(0); 

  // NUEVO: LISTA DE CITAS DEL DÍA
  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para Detalle de Historial
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryConsultation, setSelectedHistoryConsultation] = useState<Consultation | null>(null);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [receptionistName, setReceptionistName] = useState<string>('Desconocido');

  // Estados para Entrega con Excepciones (Enfermería)
  const [showDeliveryOverrideModal, setShowDeliveryOverrideModal] = useState(false);
  const [deliveryOverrideReason, setDeliveryOverrideReason] = useState('');

  // ESTADO PARA MODAL DE ÉXITO (FINALIZAR)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastFinishedConsultation, setLastFinishedConsultation] = useState<Consultation | null>(null);

  // ESTADOS PARA CREAR CITA Y PACIENTE
  const [showCreateAppointmentModal, setShowCreateAppointmentModal] = useState(false);
  const [showQuickPatientModal, setShowQuickPatientModal] = useState(false); // Modal para crear paciente
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [allDoctors, setAllDoctors] = useState<UserProfile[]>([]);
  const [preSelectedPatientId, setPreSelectedPatientId] = useState<string | null>(null); // Para seleccionar al nuevo paciente

  const topRef = useRef<HTMLDivElement>(null);

  // --- LÓGICA DE PACIENTE FORÁNEO ---
  const isForeignPatient = (p: Patient | null) => {
      if (!p || !p.address) return false;
      return p.address.country !== 'Guatemala' || p.address.department !== 'Guatemala';
  };

  const methods = useForm<WizardFormValues>({
    defaultValues: { diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '' }
  });

  const formValues = methods.watch();

  // Scroll to top when step changes
  useEffect(() => {
    if (topRef.current) {
        const scrollParent = topRef.current.closest('.overflow-y-auto');
        if (scrollParent) {
            scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
             topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
  }, [step]);

  // Autosave Draft
  useEffect(() => {
      if (currentConsultationId && step > 0 && formValues) {
          const draftKey = `draft_${currentConsultationId}`;
          localStorage.setItem(draftKey, JSON.stringify(formValues));
      }
  }, [formValues, currentConsultationId, step]);

  // CARGAR CITAS DEL DÍA
  const loadAppointments = async () => {
    if (!isDoctor && !isAdmin) return;
    try {
        const filterId = isAdmin ? undefined : user.uid;
        
        // Obtener citas crudas del servicio
        const apps = await appointmentService.getAppointmentsForToday(filterId);
        
        // CORRECCIÓN: Convertir Timestamp a Date
        const processedApps = apps.map(app => ({
            ...app,
            date: app.date instanceof Timestamp ? app.date.toDate() : new Date(app.date),
            endDate: app.endDate instanceof Timestamp ? app.endDate.toDate() : new Date(app.endDate),
            // Aseguramos que otros campos timestamp opcionales también se conviertan si existen
            createdAt: app.createdAt instanceof Timestamp ? app.createdAt.toDate() : app.createdAt
        }));

        setTodaysAppointments(processedApps);
    } catch (error) {
        console.error("Error loading appointments", error);
    }
  };

  useEffect(() => {
    // Solo cargamos la lista si estamos en modo lista para no hacer doble fetch
    if (agendaViewMode === 'list') {
        loadAppointments();
        const interval = setInterval(loadAppointments, 60000);
        return () => clearInterval(interval);
    }
  }, [user.uid, isDoctor, isAdmin, agendaViewMode]);

  // CARGAR DATOS PARA MODAL DE CITA
  const loadModalData = async () => {
        const [pats, docs] = await Promise.all([
            patientService.getAll(),
            userService.getDoctors()
        ]);
        setAllPatients(pats);
        setAllDoctors(docs);
  };

  useEffect(() => {
    if (showCreateAppointmentModal) {
        loadModalData();
    }
  }, [showCreateAppointmentModal]);


  // --- INICIAR CONSULTA (MÁQUINA DE ESTADOS) ---
  const handleStartConsultation = async (appt: Appointment) => {
    if (appt.status !== 'paid_checked_in' && appt.status !== 'in_progress') {
        toast.error("El paciente debe completar el pago en caja antes de ser atendido.");
        return;
    }

    try {
        setIsSaving(true);
        const patient = await getPatientByDPI(appt.patientId);
        if (!patient) { toast.error("Error: Datos del paciente no encontrados"); return; }

        let activeConsId = '';

        if (appt.status === 'in_progress') {
            const q = query(
                collection(db, 'consultations'), 
                where('patientId', '==', patient.id),
                where('status', '==', 'in_progress'),
                where('doctorId', '==', user.uid)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                activeConsId = snap.docs[0].id;
            } else {
                activeConsId = await createNewConsultationDoc(appt, patient);
            }
        } else {
            await appointmentService.startConsultation(appt.id!); 
            activeConsId = await createNewConsultationDoc(appt, patient);
            setTodaysAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: 'in_progress' } : a));
        }

        setCurrentPatient(patient);
        setCurrentConsultationId(activeConsId);
        
        const savedDraft = localStorage.getItem(`draft_${activeConsId}`);
        if (savedDraft) {
            try {
                methods.reset(JSON.parse(savedDraft));
                toast.info("Sesión restaurada");
            } catch (e) { methods.reset(getEmptyForm()); }
        } else {
            methods.reset(getEmptyForm());
        }

        setStep(1); 

    } catch (e) { 
        console.error(e);
        toast.error("Error al iniciar consulta"); 
    } finally {
        setIsSaving(false);
    }
  };

  const createNewConsultationDoc = async (appt: Appointment, patient: Patient) => {
      const isForeign = isForeignPatient(patient);
      const newCons = { 
          status: 'in_progress' as const, 
          paymentReceipt: appt.paymentReceipt || 'N/A', 
          paymentAmount: appt.paymentAmount || 0,
          receptionistId: appt.confirmedBy || 'system', 
          patientId: patient.id, 
          patientName: patient.fullName, 
          patientIsForeign: isForeign, 
          doctorId: user.uid, 
          doctorName: user.name, 
          date: Date.now(), 
          createdAt: Timestamp.now() 
      };
      const ref = await addDoc(collection(db, 'consultations'), newCons);
      return ref.id;
  };

  const handleCreateAppointment = async (data: any) => {
      try {
          await appointmentService.createAppointment({
              ...data,
              createdBy: user.uid
          });
          toast.success("Cita agendada correctamente");
          loadAppointments(); 
          setShowCreateAppointmentModal(false);
          setPreSelectedPatientId(null);
      } catch (error) {
          toast.error("Error al agendar cita");
      }
  };

  const getEmptyForm = () => ({ diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '' });

  // --- NAVEGACIÓN Y HISTORIAL ---

  const goToDetail = async (c: Consultation) => {
    setLoadingHistory(true);
    try {
        const p = await getPatientByDPI(c.patientId);
        setHistoryPatient(p);
        setSelectedHistoryConsultation(c);
        setShowSuccessModal(false);
        setLastFinishedConsultation(null);
        setActiveView('history_detail');
    } catch (e) {
        toast.error("Error al cargar detalle");
    } finally {
        setLoadingHistory(false);
    }
  };

  const handlePrintDoc = async (type: 'prescription' | 'labs' | 'report') => {
      if (!selectedHistoryConsultation || !historyPatient) return;
      try {
          // Lógica de impresión existente
          // ... 
          toast.success(`Imprimiendo ${type}...`);
      } catch (e) { toast.error("Error al generar documento"); }
  };

  const attemptFinalizeDelivery = () => {
     setShowDeliveryOverrideModal(true); 
  };

  const finalizeDeliveryProcess = async (reason?: string) => {
      if (!selectedHistoryConsultation) return;
      setIsSaving(true);
      try {
          const consRef = doc(db, 'consultations', selectedHistoryConsultation.id!);
          await updateDoc(consRef, { 
              status: 'delivered', 
              deliveredAt: Date.now(), 
              deliveredBy: user.name,
              nonPrintReason: reason 
          });
          toast.success("Entregado correctamente");
          setShowDeliveryOverrideModal(false);
          setActiveView('history');
      } catch (e) { toast.error("Error al finalizar"); } finally { setIsSaving(false); }
  };

  return (
    <MainLayout 
        user={user} 
        onLogout={onLogout} 
        activeView={activeView === 'history_detail' ? 'history' : activeView} 
        onViewChange={setActiveView} 
        currentTitle={
            (currentPatient && activeView === 'dashboard') ? currentPatient.fullName : 
            activeView === 'history_detail' ? `Expediente: ${selectedHistoryConsultation?.patientName}` : 
            undefined
        }
    >
        <div className="p-4 lg:p-8" ref={topRef}>
           {activeView === 'settings' ? (
               <UserProfileSettings user={user} />
           ) : activeView === 'admin' && isAdmin ? (
               <AdminPanel user={user} />
           ) : activeView === 'history' ? (
               <HistoryList user={user} onSelectConsultation={goToDetail} />
           ) : activeView === 'history_detail' && selectedHistoryConsultation ? (
               <ConsultationDetail 
                   consultation={selectedHistoryConsultation}
                   patient={historyPatient}
                   receptionistName={receptionistName}
                   user={user}
                   onBack={() => setActiveView('history')}
                   onPrint={handlePrintDoc}
                   onDeliver={attemptFinalizeDelivery}
                   isSaving={isSaving}
               />
           ) : currentPatient ? (
               /* --- WIZARD DE CONSULTA ACTIVA --- */
               <div className="max-w-5xl mx-auto">
                   <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-6 relative overflow-hidden">
                        {isForeignPatient(currentPatient) && (
                            <div className="absolute top-0 left-0 w-full bg-amber-400 text-amber-900 px-4 py-1 text-center text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                                <AlertTriangle className="w-3 h-3"/> Atención: Paciente Foráneo
                            </div>
                        )}
                        <div className="flex items-center gap-6 pt-4">
                            <div className="w-16 h-16 bg-slate-900 text-white rounded-full flex items-center justify-center text-2xl font-bold">
                                {currentPatient.fullName.charAt(0)}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900">{currentPatient.fullName}</h2>
                                <p className="text-slate-500 font-mono text-sm">{currentPatient.billingCode}</p>
                            </div>
                        </div>
                   </motion.div>

                   <FormProvider {...methods}>
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl shadow-xl border border-slate-200 p-4 lg:p-8">
                           {step === 1 && <StepDiagnosis patient={currentPatient} currentUser={user} />}
                           {step === 2 && <StepPrescription currentUser={user} />}
                           {step === 3 && <StepExams userSpecialty={user.specialty} />}
                           {step === 4 && <StepFinalize 
                                currentUser={user} 
                                onFinish={methods.handleSubmit(async (d) => {
                                setIsSaving(true);
                                try {
                                    const consultationRef = doc(db, 'consultations', currentConsultationId!);
                                    const finishedData: any = { 
                                        status: 'finished' as const, 
                                        ...(d as object),
                                        printedDocs: { prescription: false, labs: false, report: false } 
                                    };
                                    await updateDoc(consultationRef, finishedData);
                                    
                                    setLastFinishedConsultation({ ...finishedData, patientName: currentPatient.fullName } as Consultation);
                                    setCurrentPatient(null);
                                    setStep(0);
                                    methods.reset();
                                    setShowSuccessModal(true);
                                    
                                    loadAppointments();

                                } catch (e) { toast.error("Error al guardar."); } finally { setIsSaving(false); }
                           })} isSaving={isSaving} />}
                           
                           <div className="mt-8 flex justify-between gap-4">
                               <button onClick={() => step === 1 ? setCurrentPatient(null) : setStep(s => s - 1)} className="px-6 py-2 border rounded-xl font-bold hover:bg-slate-50 transition">Atrás</button>
                               {step < 4 && <button onClick={() => setStep(s => s + 1)} className="px-8 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg transition-colors">Siguiente</button>}
                           </div>
                       </motion.div>
                   </FormProvider>
               </div>
           ) : (
               /* --- AGENDA DEL DÍA (VISTA UNIFICADA) --- */
               <div className="max-w-[1600px] mx-auto space-y-8">
                   <motion.div 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[600px] flex flex-col"
                   >
                       {/* HEADER COMÚN */}
                       <div className="p-6 border-b flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/30">
                           <div className="flex items-center gap-4">
                               <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                   <CalendarIcon className="w-5 h-5 text-brand-600" />
                                   Agenda
                               </h3>
                               
                               {/* SWITCHER DE VISTAS */}
                               <div className="flex bg-slate-100 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setAgendaViewMode('list')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${agendaViewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <List className="w-4 h-4" /> Lista
                                    </button>
                                    <button 
                                        onClick={() => setAgendaViewMode('calendar')}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${agendaViewMode === 'calendar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <LayoutGrid className="w-4 h-4" /> Calendario
                                    </button>
                               </div>
                           </div>
                           
                           {/* BOTÓN NUEVA CITA - SOLO SI NO ES DOCTOR */}
                           {canCreate && (
                               <button 
                                    onClick={() => setShowCreateAppointmentModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-lg w-full md:w-auto justify-center"
                               >
                                    <Plus className="w-4 h-4" /> Nueva Cita
                               </button>
                           )}
                       </div>

                       {/* CONTENIDO DE VISTAS */}
                       <div className="flex-1 overflow-hidden">
                           {agendaViewMode === 'list' ? (
                               /* VISTA DE LISTA (TABLA CLÁSICA) */
                               <div className="overflow-x-auto h-full">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b">
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
                                            {todaysAppointments.map(appt => {
                                                const isPaid = appt.status === 'paid_checked_in';
                                                const isInProgress = appt.status === 'in_progress';
                                                const isLocked = !isPaid && !isInProgress;
                                                
                                                const timeString = appt.date instanceof Date 
                                                    ? appt.date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
                                                    : 'Hora inválida';

                                                return (
                                                    <tr key={appt.id} className={`${isInProgress ? 'bg-amber-50/40' : 'hover:bg-slate-50/50 transition-colors'}`}>
                                                        <td className="p-4 text-sm font-bold text-slate-500 font-mono">
                                                            {timeString}
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-slate-800">{appt.patientName}</div>
                                                        </td>
                                                        <td className="p-4 text-sm text-slate-600 truncate max-w-[150px]">{appt.reason}</td>
                                                        <td className="p-4 text-sm font-medium text-brand-700">Dr. {appt.doctorName}</td>
                                                        <td className="p-4">
                                                            {/* BADGES */}
                                                            {appt.status === 'scheduled' && <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold border border-slate-200">Agendada</span>}
                                                            {appt.status === 'confirmed_phone' && <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">Confirmada</span>}
                                                            {appt.status === 'paid_checked_in' && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200 flex w-fit items-center gap-1"><CheckCircle className="w-3 h-3"/> En Sala</span>}
                                                            {appt.status === 'in_progress' && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200 animate-pulse">En Consulta</span>}
                                                            {appt.status === 'completed' && <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-bold">Finalizada</span>}
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            {(appt.status !== 'completed' && appt.status !== 'cancelled') && (
                                                                <button 
                                                                    onClick={() => handleStartConsultation(appt)}
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
                                            {todaysAppointments.length === 0 && (
                                                <tr><td colSpan={6} className="p-12 text-center text-slate-400 italic font-medium">No hay citas programadas para hoy</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                               </div>
                           ) : (
                               /* VISTA DE CALENDARIO (React Big Calendar) */
                               <div className="h-full p-4">
                                   <AppointmentCalendar user={user} />
                               </div>
                           )}
                       </div>
                   </motion.div>
               </div>
           )}
        </div>
        
        {/* MODALES */}
        <CreateAppointmentModal 
            isOpen={showCreateAppointmentModal}
            onClose={() => {setShowCreateAppointmentModal(false); setPreSelectedPatientId(null);}}
            onSubmit={handleCreateAppointment}
            patients={allPatients}
            doctors={allDoctors}
            initialDate={new Date()}
            onCreatePatientClick={() => {
                setShowCreateAppointmentModal(false); 
                setShowQuickPatientModal(true); 
            }}
            preSelectedPatientId={preSelectedPatientId}
        />

        <AnimatePresence>
            {showQuickPatientModal && (
                <QuickPatientModal 
                    onClose={() => {
                        setShowQuickPatientModal(false);
                        setShowCreateAppointmentModal(true); 
                    }} 
                    currentUser={user}
                    onSuccess={async (newPatientId: React.SetStateAction<string>) => {
                        await loadModalData();
                        setPreSelectedPatientId(newPatientId);
                        setShowQuickPatientModal(false);
                        setShowCreateAppointmentModal(true);
                        toast.success("Paciente creado y seleccionado");
                    }}
                />
            )}
        </AnimatePresence>
        
        {/* Modales de Éxito y Entrega (iguales a antes) */}
        <AnimatePresence>
            {showSuccessModal && lastFinishedConsultation && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
                         <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                             <CheckCircle className="w-10 h-10" />
                         </div>
                         <h3 className="text-xl font-bold mb-2">Consulta Finalizada</h3>
                         <p className="text-slate-500 mb-6">El expediente se ha guardado correctamente.</p>
                         <button onClick={() => { setShowSuccessModal(false); setLastFinishedConsultation(null); }} className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold">Volver a Agenda</button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        
        <AnimatePresence>
             {showDeliveryOverrideModal && (
                 <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                     <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md text-center">
                         <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-lg shadow-amber-50">
                             <AlertTriangle className="w-10 h-10"/>
                         </div>
                         <h3 className="text-xl font-bold text-slate-800 leading-tight">Documentos Faltantes</h3>
                         <p className="text-slate-500 mt-2 mb-6 font-medium text-sm">Hay documentos pendientes de impresión. Si continúa, debe justificar por qué no se imprimieron.</p>
                         <div className="text-left mb-6">
                             <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Razón de No Impresión (Obligatorio)</label>
                             <textarea required autoFocus className="w-full p-4 bg-slate-50 border rounded-2xl outline-none resize-none font-medium focus:ring-4 focus:ring-amber-100 border-slate-200 text-sm" rows={3} value={deliveryOverrideReason} onChange={e => setDeliveryOverrideReason(e.target.value)} placeholder="Ej: El paciente solicitó solo digital..." />
                         </div>
                         <div className="flex gap-4">
                             <button type="button" onClick={() => { setShowDeliveryOverrideModal(false); setDeliveryOverrideReason(''); }} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-2xl transition-all border border-slate-200">Cancelar</button>
                             <button type="button" onClick={() => { if (!deliveryOverrideReason.trim()) { toast.error("Debe ingresar una razón."); return; } finalizeDeliveryProcess(deliveryOverrideReason); }} disabled={isSaving} className="flex-[1.5] py-4 bg-amber-500 text-white font-bold rounded-2xl shadow-xl hover:bg-amber-600 transition-all flex justify-center items-center gap-2 active:scale-95">
                                 {isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : <CheckCircle className="w-5 h-5"/>} <span>Confirmar Entrega</span>
                             </button>
                         </div>
                     </motion.div>
                 </div>
             )}
         </AnimatePresence>
    </MainLayout>
  );
};
