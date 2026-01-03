
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { Search, Loader2, Ticket, UserPlus, Save, CheckCircle, Trash2, Clock, Zap, UserSearch, ChevronRight, Plus, AlertTriangle, X, User, Briefcase, Phone, CreditCard, Users, Calendar, RefreshCcw, MapPin, FileText, Home, ArrowRight, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, doc, Timestamp, updateDoc, query, where, onSnapshot, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { motion, AnimatePresence } from 'framer-motion';

import { Patient, Consultation, UserProfile, PrescriptionItem, ReferralGroup, SpecialtyReferral } from '../../types.ts';
import { MainLayout } from '../components/Layout/MainLayout.tsx';
import { AdminPanel } from './AdminPanel.tsx';
import { UserProfileSettings } from './UserProfileSettings.tsx'; 
import { StepDiagnosis } from '../components/Wizard/StepDiagnosis.tsx';
import { StepExams } from '../components/Wizard/StepExams.tsx';
import { StepFinalize } from '../components/Wizard/StepFinalize.tsx';
import { StepPrescription } from '../components/Wizard/StepPrescription.tsx'; 
import { ConsultationDetail } from '../components/History/ConsultationDetail.tsx'; 
import { HistoryList } from '../components/History/HistoryList.tsx'; 
import { QuickPatientModal } from '../components/Patients/QuickPatientModal.tsx'; 

import { searchPatients, getPatientByDPI, checkAndSwitchToReconsultation, deleteWaitingConsultation } from '../services/patientService.ts';
import { getActiveDoctors } from '../services/userService.ts';
import { notifyCancellationToAdmins } from '../services/emailService.ts'; 
import { notifyConsultationCreated, notifyConsultationCancelled, notifyConsultationFinished, notifyConsultationDelivered } from '../services/notificationService.ts';
import { logAuditAction } from '../services/auditService.ts';
import { generatePrescriptionPDF, generateExamsPDF, generateNursingPDF } from '../services/pdfService.ts';

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
  const isReceptionist = user.role === 'receptionist';
  const isDoctor = user.role === 'doctor';
  const isNurse = user.role === 'nurse';
  const canCheckIn = isReceptionist || isAdmin;
  const canConsult = isDoctor || isAdmin;
  const canDeliverDocs = isNurse || isAdmin;

  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'admin' | 'history_detail' | 'settings'>('dashboard');
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [patientToCheckIn, setPatientToCheckIn] = useState<Patient | null>(null);
  const [currentConsultationId, setCurrentConsultationId] = useState<string | null>(null);
  const [step, setStep] = useState(0); 

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [waitingPatients, setWaitingPatients] = useState<Consultation[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para Detalle de Historial
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryConsultation, setSelectedHistoryConsultation] = useState<Consultation | null>(null);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [receptionistName, setReceptionistName] = useState<string>('Desconocido');

  // Estados para Anulación
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [consultationToCancel, setConsultationToCancel] = useState<Consultation | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Estados para Entrega con Excepciones (Enfermería)
  const [showDeliveryOverrideModal, setShowDeliveryOverrideModal] = useState(false);
  const [deliveryOverrideReason, setDeliveryOverrideReason] = useState('');

  // ESTADO PARA MODAL DE ÉXITO (FINALIZAR)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastFinishedConsultation, setLastFinishedConsultation] = useState<Consultation | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  // QUICK PATIENT MODAL STATE
  const [showCreatePatientModal, setShowCreatePatientModal] = useState(false);

  // CHECK IN MODAL
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState('');
  const [paymentAmount, setPaymentAmount] = useState<string>(''); // NEW: Value for accounting
  
  const [availableDoctors, setAvailableDoctors] = useState<UserProfile[]>([]);
  const [selectedDoctorForCheckIn, setSelectedDoctorForCheckIn] = useState<UserProfile | null>(null);
  const [doctorSearchTerm, setDoctorSearchTerm] = useState('');
  const [showDoctorDropdown, setShowDoctorDropdown] = useState(false);

  // --- LÓGICA DE PACIENTE FORÁNEO ---
  const isForeignPatient = (p: Patient | null) => {
      if (!p || !p.address) return false;
      // Es foráneo si: País NO es Guatemala O Departamento NO es Guatemala
      return p.address.country !== 'Guatemala' || p.address.department !== 'Guatemala';
  };

  const methods = useForm<WizardFormValues>({
    defaultValues: { diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '' }
  });

  const formValues = methods.watch();

  // Scroll to top when step changes
  useEffect(() => {
    if (topRef.current) {
        // Intenta hacer scroll en el contenedor padre que tiene overflow-y-auto
        const scrollParent = topRef.current.closest('.overflow-y-auto');
        if (scrollParent) {
            scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
             // Fallback
             topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
  }, [step]);

  useEffect(() => {
      if (currentConsultationId && step > 0 && formValues) {
          const draftKey = `draft_${currentConsultationId}`;
          localStorage.setItem(draftKey, JSON.stringify(formValues));
      }
  }, [formValues, currentConsultationId, step]);

  const triggerSearch = async (term: string) => {
    const results = await searchPatients(term);
    setSearchResults(results);
    setShowSearchDropdown(true);
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 1) {
        triggerSearch(searchQuery);
      } else if (searchQuery.length === 0 && showSearchDropdown) {
        triggerSearch(''); 
      }
    }, 200);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const qWaiting = query(collection(db, 'consultations'), where('status', 'in', ['waiting', 'in_progress']));
    const unsubWaiting = onSnapshot(qWaiting, (snapshot: any) => {
        const docs = snapshot.docs.map((d: any) => ({ id: d.id, ...(d.data() as object) } as Consultation));
        let filtered = docs;
        if (isDoctor && !isAdmin) filtered = docs.filter((c: Consultation) => c.doctorId === user.uid);
        setWaitingPatients(filtered.sort((a: Consultation, b: Consultation) => a.date - b.date));
    });
    if (canCheckIn) getActiveDoctors().then(setAvailableDoctors);
    return () => unsubWaiting();
  }, [user.uid, user.role, canCheckIn, isDoctor, isAdmin]);

  const confirmCheckIn = async () => {
      if (!patientToCheckIn || !paymentReceipt.trim() || !selectedDoctorForCheckIn) { 
        toast.error("Complete el número de boleta y seleccione al médico tratante."); 
        return; 
      }
      
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount < 0) {
          toast.error("Ingrese un valor válido para la consulta.");
          return;
      }

      setIsSaving(true);
      try {
          await checkAndSwitchToReconsultation(patientToCheckIn.id);
          
          // DETECTAR SI ES FORÁNEO PARA LA CONSULTA
          const isForeign = isForeignPatient(patientToCheckIn);

          const newCons = { 
              status: 'waiting' as const, 
              paymentReceipt, 
              paymentAmount: amount, // Guardar el monto
              receptionistId: user.uid, 
              patientId: patientToCheckIn.id, 
              patientName: patientToCheckIn.fullName, 
              patientIsForeign: isForeign, // Guardamos flag
              doctorId: selectedDoctorForCheckIn.uid, 
              doctorName: selectedDoctorForCheckIn.name, 
              date: Date.now(), 
              createdAt: Timestamp.now() 
          };
          await addDoc(collection(db, 'consultations'), newCons);
          
          await notifyConsultationCreated(selectedDoctorForCheckIn, patientToCheckIn, user.name);

          await logAuditAction(user.email, "CREACION_CONSULTA", `Check-in realizado para: ${patientToCheckIn.fullName}. Boleta: ${paymentReceipt} (Q.${amount}). Asignado a: Dr. ${selectedDoctorForCheckIn.name}`);

          toast.success("Ingresado a Sala de Espera");
          setShowCheckInModal(false); 
          setPatientToCheckIn(null); 
          setSearchQuery('');
          setPaymentReceipt('');
          setPaymentAmount('');
      } catch (e) { toast.error("Error al ingresar."); } finally { setIsSaving(false); }
  };

  const handleStartConsultation = async (c: Consultation) => {
    try {
        const patient = await getPatientByDPI(c.patientId);
        if (!patient) { toast.error("Paciente no hallado"); return; }
        if (c.id) await updateDoc(doc(db, 'consultations', c.id), { status: 'in_progress' });
        
        setCurrentPatient(patient);
        setCurrentConsultationId(c.id || null);
        
        if (c.id) {
            const savedDraft = localStorage.getItem(`draft_${c.id}`);
            if (savedDraft) {
                try {
                    const parsedData = JSON.parse(savedDraft);
                    methods.reset(parsedData);
                    toast.info("Se ha restaurado su sesión anterior automáticamente", {
                        icon: <RefreshCcw className="w-4 h-4 animate-spin"/>,
                        duration: 5000
                    });
                } catch (e) {
                    console.error("Error parsing draft", e);
                    methods.reset({ diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '' });
                }
            } else {
                methods.reset({ diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '' });
            }
        }

        setStep(1); 
    } catch (e) { toast.error("Error al iniciar consulta"); }
  };

  const openCancellationModal = (consultation: Consultation) => {
      setConsultationToCancel(consultation);
      setCancelReason('');
      setShowCancelModal(true);
  };

  const handleConfirmCancellation = async () => {
      if (!consultationToCancel || !cancelReason.trim()) {
          toast.error("Debe ingresar la razón de la anulación.");
          return;
      }
      setIsSaving(true);
      try {
          try {
              const pSnap = await getDoc(doc(db, 'patients', consultationToCancel.patientId));

              if (pSnap.exists()) {
                  const patientData = { id: pSnap.id, ...(pSnap.data() as object) } as Patient;
                  await notifyCancellationToAdmins(patientData, user.name, cancelReason);
              }
          } catch (notifErr) {
              console.warn("No se pudo enviar email de anulación:", notifErr);
          }

          await notifyConsultationCancelled(consultationToCancel, user.name, cancelReason);

          await logAuditAction(user.email, 'ANULACION_CONSULTA', `Consulta de ${consultationToCancel.patientName} anulada por ${user.name}. Motivo: ${cancelReason}`);
          
          if (consultationToCancel.id) {
              await deleteWaitingConsultation(consultationToCancel.id);
              localStorage.removeItem(`draft_${consultationToCancel.id}`);
              toast.success("Consulta anulada exitosamente.");
          }

          setShowCancelModal(false);
          setConsultationToCancel(null);
          setCancelReason('');
      } catch (error) {
          console.error("Error en anulación:", error);
          toast.error("Error al anular la consulta.");
      } finally {
          setIsSaving(false);
      }
  };

  const goToDetail = async (c: Consultation) => {
    setLoadingHistory(true);
    try {
        const p = await getPatientByDPI(c.patientId);
        let recName = 'Desconocido';
        if (c.receptionistId) {
            try {
                const rDoc = await getDoc(doc(db, 'users', c.receptionistId));
                if (rDoc.exists()) {
                    const rd = rDoc.data() as any;
                    recName = rd.displayName || rd.name || 'Recepción';
                }
            } catch (e) { console.error("Err fetching receptionist", e); }
        }
        setReceptionistName(recName);
        setHistoryPatient(p);
        setSelectedHistoryConsultation(c);
        
        // Si venimos del modal de éxito, limpiamos primero el modal
        setShowSuccessModal(false);
        setLastFinishedConsultation(null);
        
        setActiveView('history_detail');
    } catch (e) {
        console.error("Error loading detail:", e);
        toast.error("Error al cargar detalle");
    } finally {
        setLoadingHistory(false);
    }
  };

  const handlePrintDoc = async (type: 'prescription' | 'labs' | 'report') => {
      if (!selectedHistoryConsultation || !historyPatient) return;
      
      let docProfile: UserProfile = { 
        name: selectedHistoryConsultation.doctorName!, 
        role: 'doctor', 
        email: '', 
        specialty: '', 
        uid: selectedHistoryConsultation.doctorId || '' 
      };
      
      if (user.uid === selectedHistoryConsultation.doctorId) {
          docProfile = { ...docProfile, ...user }; 
      }

      try {
          if (type === 'prescription') await generatePrescriptionPDF(selectedHistoryConsultation, historyPatient, docProfile as UserProfile, 'print');
          if (type === 'labs') await generateExamsPDF(selectedHistoryConsultation, historyPatient, docProfile as UserProfile, 'print');
          if (type === 'report') await generateNursingPDF(selectedHistoryConsultation, historyPatient, docProfile as UserProfile, 'print');

          await logAuditAction(user.email, "IMPRESION_DOCUMENTO", `Documento ${type.toUpperCase()} generado para: ${historyPatient.fullName}`);

          if (user.role === 'doctor') {
              return; 
          }

          const consRef = doc(db, 'consultations', selectedHistoryConsultation.id!);
          const updatedPrintedDocs = { ...(selectedHistoryConsultation.printedDocs || {}), [type]: true };
          await updateDoc(consRef, { printedDocs: updatedPrintedDocs });
          setSelectedHistoryConsultation(prev => prev ? { ...prev, printedDocs: updatedPrintedDocs } : null);
          toast.success("Impresión registrada");
      } catch (e) { toast.error("Error al generar documento"); }
  };

  const attemptFinalizeDelivery = () => {
      if (!selectedHistoryConsultation) return;
      const docs = selectedHistoryConsultation.printedDocs || {};
      const allPrinted = docs.prescription && docs.labs && docs.report;
      if (!allPrinted) { setDeliveryOverrideReason(''); setShowDeliveryOverrideModal(true); } else { finalizeDeliveryProcess(); }
  };

  const finalizeDeliveryProcess = async (reason?: string) => {
      if (!selectedHistoryConsultation) return;
      setIsSaving(true);
      try {
          const consRef = doc(db, 'consultations', selectedHistoryConsultation.id!);
          const updateData: any = { status: 'delivered', deliveredAt: Date.now(), deliveredBy: user.name };
          if (reason) updateData.nonPrintReason = reason;
          await updateDoc(consRef, updateData);
          
          await notifyConsultationDelivered(selectedHistoryConsultation, user.name);

          const docs = selectedHistoryConsultation.printedDocs || {};
          const missing = [];
          if (!docs.prescription) missing.push("Receta");
          if (!docs.labs) missing.push("Laboratorios");
          if (!docs.report) missing.push("Ficha");

          let logDetail = `Entrega finalizada para: ${selectedHistoryConsultation.patientName}.`;
          if (missing.length > 0) {
              logDetail += ` Documentos no impresos: [${missing.join(', ')}]. Razón justificada: ${reason || 'No especificada'}`;
          }
          await logAuditAction(user.email, "ENTREGA_FINALIZADA", logDetail);

          setSelectedHistoryConsultation(prev => prev ? { ...prev, ...updateData } : null);
          toast.success("Expediente Entregado y Finalizado");
          setShowDeliveryOverrideModal(false);
          setActiveView('history');
      } catch (e) { toast.error("Error al finalizar entrega"); } finally { setIsSaving(false); }
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
               <div className="max-w-5xl mx-auto">
                   
                   <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-6 relative overflow-hidden">
                        {/* ALERT DE PACIENTE FORÁNEO (BANNER) */}
                        {isForeignPatient(currentPatient) && (
                            <div className="absolute top-0 left-0 w-full bg-amber-400 text-amber-900 px-4 py-1 text-center text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                                <AlertTriangle className="w-3 h-3"/> Atención: Paciente Foráneo - Ofrecer Servicio Integral
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row gap-6 items-center md:items-start pt-4">
                            <div className="shrink-0 flex flex-col items-center">
                                <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-900 text-white rounded-full flex items-center justify-center text-xl md:text-2xl font-bold shadow-lg shadow-slate-900/20">
                                    {currentPatient.fullName.charAt(0)}
                                </div>
                                <span className="mt-2 text-[10px] font-bold bg-brand-100 text-brand-700 px-3 py-1 rounded-full uppercase tracking-wider">
                                    {currentPatient.consultationType || 'Consulta'}
                                </span>
                            </div>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-center md:text-left">
                                <div className="space-y-3">
                                    <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight">{currentPatient.fullName}</h2>
                                    <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600">
                                            <User className="w-3.5 h-3.5 text-slate-400"/>
                                            {currentPatient.age} años
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-600">
                                            <Users className="w-3.5 h-3.5 text-slate-400"/>
                                            {currentPatient.gender === 'M' ? 'Masculino' : 'Femenino'}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-2 text-sm border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 pl-0 md:pl-6">
                                    <div className="flex items-center gap-2 text-slate-600 justify-center md:justify-start">
                                        <Briefcase className="w-4 h-4 text-brand-500 shrink-0"/>
                                        <span className="font-medium truncate">{currentPatient.occupation || 'Sin ocupación'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600 justify-center md:justify-start">
                                        <Phone className="w-4 h-4 text-brand-500 shrink-0"/>
                                        <span className="font-medium">{currentPatient.phone || 'Sin teléfono'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-600 justify-center md:justify-start">
                                        <CreditCard className="w-4 h-4 text-brand-500 shrink-0"/>
                                        <span className="font-medium font-mono truncate">{currentPatient.billingCode}</span>
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 pl-0 md:pl-6">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsable</p>
                                    <p className="font-bold text-slate-800 text-base">{currentPatient.responsibleName || 'El paciente'}</p>
                                    {currentPatient.responsiblePhone && (
                                        <p className="text-slate-500 text-xs flex items-center gap-1 justify-center md:justify-start">
                                            <Phone className="w-3 h-3"/> {currentPatient.responsiblePhone}
                                        </p>
                                    )}
                                </div>
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
                                    
                                    const completeConsData = { ...waitingPatients.find(c => c.id === currentConsultationId), ...finishedData } as Consultation;
                                    await notifyConsultationFinished(completeConsData, user.name);

                                    await logAuditAction(user.email, "FINALIZACION_CONSULTA", `Consulta completada para: ${currentPatient.fullName}`);
                                    
                                    if(currentConsultationId) localStorage.removeItem(`draft_${currentConsultationId}`);

                                    // LÓGICA MODAL ÉXITO: Guardamos data temporalmente y limpiamos la vista
                                    setLastFinishedConsultation(completeConsData);
                                    setCurrentPatient(null);
                                    setStep(0);
                                    methods.reset();
                                    setShowSuccessModal(true);

                                } catch (e) { toast.error("Error al guardar."); } finally { setIsSaving(false); }
                           })} isSaving={isSaving} />}
                           <div className="mt-8 flex justify-between gap-4">
                               <button onClick={() => step === 1 ? setCurrentPatient(null) : setStep(s => s - 1)} className="px-6 py-2 border rounded-xl font-bold hover:bg-slate-50 transition text-sm md:text-base">Atrás</button>
                               {step < 4 && <button onClick={() => setStep(s => s + 1)} className="px-8 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg transition-colors text-sm md:text-base">Siguiente</button>}
                           </div>
                       </motion.div>
                   </FormProvider>
               </div>
           ) : (
               <div className="max-w-6xl mx-auto space-y-8">
                   {canCheckIn && (
                       <motion.div 
                         initial={{ opacity: 0, y: -20 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ duration: 0.5, ease: "easeOut" }}
                         className="bg-white p-6 lg:p-8 rounded-3xl border border-slate-200 shadow-sm relative z-40"
                       >
                           <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                               <div className="p-4 bg-brand-100 text-brand-600 rounded-2xl hidden md:block"><UserSearch className="w-8 h-8" /></div>
                               <div className="flex-1 w-full relative" ref={searchRef}>
                                   <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ingresar Paciente</label>
                                   <div className="relative">
                                       <Search className="absolute left-4 top-4 text-slate-400 w-5 h-5" />
                                       <input 
                                          type="text" 
                                          placeholder="Buscar por nombre o código..." 
                                          className="w-full pl-12 pr-4 py-4 rounded-2xl border bg-slate-50 focus:bg-white focus:ring-4 focus:ring-brand-50 outline-none transition-all text-lg font-bold text-slate-800 shadow-sm" 
                                          value={searchQuery} 
                                          onChange={(e) => setSearchQuery(e.target.value)} 
                                          onFocus={() => triggerSearch(searchQuery)} 
                                       />
                                       <AnimatePresence>
                                       {showSearchDropdown && searchResults.length > 0 && (
                                           <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-72 overflow-y-auto">
                                               {searchResults.map(p => (
                                                   <div key={p.id} onClick={() => {
                                                          const activeCons = waitingPatients.find(c => c.patientId === p.id);
                                                          if (activeCons) { toast.warning(`El paciente ya está en sala.`); setShowSearchDropdown(false); return; }
                                                          setPatientToCheckIn(p); setShowCheckInModal(true); setShowSearchDropdown(false);
                                                      }} className="p-4 hover:bg-brand-50 cursor-pointer border-b border-slate-50 flex justify-between items-center group transition-colors">
                                                       <div><p className="font-bold text-slate-800 group-hover:text-brand-700">{p.fullName}</p><p className="text-xs text-slate-500 font-mono font-bold">{p.billingCode}</p></div>
                                                       <div className="bg-brand-100 text-brand-600 p-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="w-4 h-4"/></div>
                                                   </div>
                                               ))}
                                           </motion.div>
                                       )}
                                       </AnimatePresence>
                                   </div>
                               </div>
                               <button onClick={() => setShowCreatePatientModal(true)} className="w-full lg:w-auto h-16 px-8 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition shadow-xl text-lg flex items-center justify-center gap-2"><Plus className="w-5 h-5"/> Nuevo Paciente</button>
                           </div>
                       </motion.div>
                   )}
                   <motion.div 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
                     className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]"
                   >
                       <div className="p-6 border-b flex justify-between items-center bg-slate-50/30">
                           <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">Sala de Espera <span className="text-[10px] bg-brand-600 text-white px-2 py-0.5 rounded-full">{waitingPatients.length}</span></h3>
                       </div>
                       <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[700px]">
                            <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b">
                                <tr><th className="p-4">Hora</th><th className="p-4">Paciente</th><th className="p-4">Asignado</th><th className="p-4">Boleta</th><th className="p-4">Estado</th><th className="p-4 text-right">Acción</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {waitingPatients.map(c => (
                                    <tr key={c.id} className={`${c.status === 'in_progress' ? 'bg-amber-50/30' : 'hover:bg-slate-50/50 transition-colors'}`}>
                                        <td className="p-4 text-sm font-bold text-slate-400">{new Date(c.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-slate-800 flex items-center gap-2">
                                                {c.patientName}
                                                {/* BADGE DE PACIENTE FORÁNEO EN TABLA */}
                                                {c.patientIsForeign && (
                                                    <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-sm" title="Paciente Foráneo">
                                                        <MapPin className="w-3 h-3"/> Foráneo
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-sm font-medium text-brand-600">Dr. {c.doctorName}</td>
                                        <td className="p-4 font-mono font-bold text-slate-600">{c.paymentReceipt}</td>
                                        <td className="p-4">{c.status === 'waiting' ? <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold uppercase"><Clock className="w-3 h-3"/> Espera</span> : <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase animate-pulse"><Zap className="w-3 h-3 fill-amber-700"/> Atendiendo</span>}</td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {canConsult && <button onClick={() => handleStartConsultation(c)} className={`px-4 md:px-6 py-2 rounded-xl text-xs font-bold shadow-lg transition-all ${c.status === 'in_progress' ? 'bg-amber-600 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>{c.status === 'in_progress' ? 'Continuar' : 'Atender'}</button>}
                                                {canCheckIn && c.status === 'waiting' && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => openCancellationModal(c)}
                                                        className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all shadow-sm border border-red-100"
                                                        title="Anular Consulta"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {waitingPatients.length === 0 && (
                                    <tr><td colSpan={6} className="p-20 text-center text-slate-400 italic font-medium uppercase tracking-widest text-[10px]">No hay pacientes esperando</td></tr>
                                )}
                            </tbody>
                        </table>
                       </div>
                   </motion.div>
               </div>
           )}
        </div>
        
        {/* MODAL DE ÉXITO (ANIMADO) */}
        <AnimatePresence>
            {showSuccessModal && lastFinishedConsultation && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }} 
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 w-full max-w-md text-center overflow-hidden relative"
                    >
                        {/* Confetti effect background subtle */}
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white to-emerald-50/50 z-0"></div>
                        
                        <div className="relative z-10 flex flex-col items-center">
                            {/* ANIMATED CHECKMARK */}
                            <motion.div 
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-100/50"
                            >
                                <svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <motion.path 
                                        d="M10 25L20 35L40 15" 
                                        stroke="#059669" 
                                        strokeWidth="5" 
                                        strokeLinecap="round" 
                                        strokeLinejoin="round"
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                    />
                                </svg>
                            </motion.div>

                            <motion.h3 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-2xl font-bold text-slate-800 mb-2"
                            >
                                Consulta Finalizada
                            </motion.h3>
                            
                            <motion.p 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="text-slate-500 text-sm mb-8"
                            >
                                Se ha registrado el expediente de <br/>
                                <span className="font-bold text-emerald-600">{lastFinishedConsultation.patientName}</span> correctamente.
                            </motion.p>

                            <div className="flex flex-col gap-3 w-full">
                                <motion.button 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.5 }}
                                    onClick={() => goToDetail(lastFinishedConsultation)} 
                                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 group"
                                >
                                    <FileText className="w-5 h-5"/> Ver Detalle / Imprimir
                                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1"/>
                                </motion.button>
                                
                                <motion.button 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.6 }}
                                    onClick={() => { setShowSuccessModal(false); setLastFinishedConsultation(null); }} 
                                    className="w-full py-4 bg-white text-slate-500 font-bold rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <Home className="w-5 h-5"/> Volver al Inicio
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

        <AnimatePresence>
            {showCreatePatientModal && <QuickPatientModal onClose={() => setShowCreatePatientModal(false)} currentUser={user} />}
        </AnimatePresence>
        <AnimatePresence>
        {showCheckInModal && patientToCheckIn && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] shadow-2xl p-6 md:p-10 w-full max-w-md">
                     <div className="text-center mb-8"><div className="w-20 h-20 bg-brand-100 text-brand-600 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-lg shadow-brand-50"><Ticket className="w-10 h-10"/></div><h3 className="text-2xl font-bold text-slate-800">Confirmar Ingreso</h3><p className="text-slate-500 font-medium mt-2">Paciente: <span className="text-brand-700 font-bold">{patientToCheckIn.fullName}</span></p></div>
                     
                     {/* ALERTA PACIENTE FORÁNEO EN MODAL */}
                     {isForeignPatient(patientToCheckIn) && (
                         <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl mb-6 text-center shadow-sm">
                             <div className="flex items-center justify-center gap-2 text-amber-700 font-bold text-sm mb-1 uppercase tracking-wide">
                                 <MapPin className="w-5 h-5" /> Paciente Foráneo
                             </div>
                             <p className="text-xs text-amber-800 leading-snug">
                                 Reside fuera de la capital. Se recomienda ofrecer atención y medicamentos en una sola visita.
                             </p>
                         </div>
                     )}

                     <div className="space-y-6">
                         <div className="flex gap-4">
                             <div className="flex-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Número de Boleta</label>
                                 <input autoFocus className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-bold text-slate-800 focus:ring-4 focus:ring-brand-100 outline-none transition-all shadow-inner" value={paymentReceipt} onChange={(e) => setPaymentReceipt(e.target.value)} placeholder="0000" />
                             </div>
                             <div className="flex-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Valor Consulta</label>
                                 <input type="number" step="0.01" className="w-full p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-lg font-bold text-emerald-800 focus:ring-4 focus:ring-emerald-100 outline-none transition-all shadow-inner" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="0.00" />
                             </div>
                         </div>
                         <div className="relative"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Médico Tratante</label><input className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-brand-100 font-medium shadow-inner" placeholder="Buscar médico..." value={doctorSearchTerm} onChange={(e) => {setDoctorSearchTerm(e.target.value); setShowDoctorDropdown(true);}} onFocus={() => setShowDoctorDropdown(true)} />
                            {showDoctorDropdown && (
                                <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 z-[300] max-h-48 overflow-y-auto">
                                    {availableDoctors.filter(d => d.name.toLowerCase().includes(doctorSearchTerm.toLowerCase())).map(d => (
                                        <div key={d.uid} onClick={() => { setSelectedDoctorForCheckIn(d); setDoctorSearchTerm(d.name); setShowDoctorDropdown(false); }} className="p-4 hover:bg-brand-50 cursor-pointer flex justify-between items-center border-b border-slate-50 last:border-0">
                                            <div><p className="font-bold text-slate-800">{d.name}</p><p className="text-[10px] font-bold text-brand-600 uppercase tracking-tighter">{d.specialty}</p></div>
                                            {selectedDoctorForCheckIn?.uid === d.uid && <CheckCircle className="w-5 h-5 text-brand-600"/>}
                                        </div>
                                    ))}
                                </div>
                            )}
                         </div>
                     </div>
                     <div className="mt-10 grid grid-cols-2 gap-4"><button onClick={() => { setShowCheckInModal(false); setPatientToCheckIn(null); }} className="py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-2xl transition-all">Cerrar</button><button onClick={confirmCheckIn} disabled={isSaving} className="py-4 bg-brand-600 text-white font-bold rounded-2xl shadow-xl hover:bg-brand-700 transition-all flex justify-center items-center gap-2">{isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5"/>} Confirmar</button></div>
                </motion.div>
            </div>
        )}
        </AnimatePresence>
        <AnimatePresence>{showDeliveryOverrideModal && (<div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"><motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] shadow-2xl p-10 w-full max-w-md text-center"><div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3 shadow-lg shadow-amber-50"><AlertTriangle className="w-10 h-10"/></div><h3 className="text-xl font-bold text-slate-800 leading-tight">Documentos Faltantes</h3><p className="text-slate-500 mt-2 mb-6 font-medium text-sm">Hay documentos pendientes de impresión. Si continúa, debe justificar por qué no se imprimieron.</p><div className="text-left bg-slate-50 p-4 rounded-xl mb-6"><span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">Estado Actual:</span><ul className="text-xs space-y-1"><li className={`flex items-center gap-2 ${selectedHistoryConsultation?.printedDocs?.prescription ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}`}>{selectedHistoryConsultation?.printedDocs?.prescription ? <CheckCircle className="w-3 h-3"/> : <X className="w-3 h-3"/>} Receta Médica</li><li className={`flex items-center gap-2 ${selectedHistoryConsultation?.printedDocs?.labs ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}`}>{selectedHistoryConsultation?.printedDocs?.labs ? <CheckCircle className="w-3 h-3"/> : <X className="w-3 h-3"/>} Laboratorios</li><li className={`flex items-center gap-2 ${selectedHistoryConsultation?.printedDocs?.report ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}`}>{selectedHistoryConsultation?.printedDocs?.report ? <CheckCircle className="w-3 h-3"/> : <X className="w-3 h-3"/>} Ficha Clínica</li></ul></div><div className="text-left mb-6"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Razón de No Impresión (Obligatorio)</label><textarea required autoFocus className="w-full p-4 bg-slate-50 border rounded-2xl outline-none resize-none font-medium focus:ring-4 focus:ring-amber-100 border-slate-200 text-sm" rows={3} value={deliveryOverrideReason} onChange={e => setDeliveryOverrideReason(e.target.value)} placeholder="Ej: El paciente solicitó solo digital..." /></div><div className="flex gap-4"><button type="button" onClick={() => { setShowDeliveryOverrideModal(false); setDeliveryOverrideReason(''); }} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-2xl transition-all border border-slate-200">Cancelar</button><button type="button" onClick={() => { if (!deliveryOverrideReason.trim()) { toast.error("Debe ingresar una razón."); return; } finalizeDeliveryProcess(deliveryOverrideReason); }} disabled={isSaving} className="flex-[1.5] py-4 bg-amber-500 text-white font-bold rounded-2xl shadow-xl hover:bg-amber-600 transition-all flex justify-center items-center gap-2 active:scale-95">{isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : <CheckCircle className="w-5 h-5"/>} <span>Confirmar Entrega</span></button></div></motion.div></div>)}</AnimatePresence>
    </MainLayout>
  );
};
