import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {  Loader2, CheckCircle, Zap, Plus, AlertTriangle, 
     Lock, Calendar as CalendarIcon, List, LayoutGrid, 
     FileText, Clock, Book, ChevronDown,
     X, Video, Users
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, doc, Timestamp, updateDoc, query, where, getDocs } from 'firebase/firestore';
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
import { Cuaderno } from '../components/Patients/Cuaderno';
import { CreateAppointmentModal } from '../components/Appointments/CreateAppointmentModal';
import { AppointmentDetailsModal } from '../components/Appointments/AppointmentDetailsModal';
import { ResidentIntakeModal } from '../components/Appointments/ResidentIntakeModal';
import { AppointmentCalendar } from './AppointmentCalendar'; 
import { DoctorDayScheduleDropdown } from '../components/Appointments/DoctorDayScheduleDropdown';

import { DoctorScheduleAdmin } from '../components/Admin/DoctorScheduleManager';
import {  getPatientByDPI, patientService } from '../services/patientService';
import { appointmentService } from '../services/appointmentService'; 
import {userService } from '../services/userService';
import {  notifyConsultationFinished, notifyReceptionFollowUp } from '../services/notificationService';
import { generatePrescriptionPDF, generateExamsPDF, generateNursingPDF, generateFullFichaPDF } from '../services/pdfService';
import { specialtyFormsService } from '../services/specialtyFormsService';
import { doctorScheduleService } from '../services/doctorScheduleService';

const calculateAppointmentDurationSeconds = (appt: Appointment): number => {
  const start = appt.date instanceof Date ? appt.date : new Date(appt.date as any);
  const end = appt.endDate instanceof Date ? appt.endDate : new Date(appt.endDate as any);
  const diff = end.getTime() - start.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.round(diff / 1000);
};

const formatDurationLabel = (minutes: number): string => {
  if (minutes <= 0) return 'sin duración definida';
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hora' : `${hours} horas`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    const hourPart = hours === 1 ? '1 hora' : `${hours} horas`;
    return `${hourPart} ${mins} minutos`;
  }
  return `${minutes} minutos`;
};

const formatCountdown = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    hours: pad(h),
    minutes: pad(m),
    seconds: pad(s),
  };
};

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
  importantNotices: string;
  specialtyFormId?: string;
  specialtyFormName?: string;
  specialtyData?: Record<string, any>;
}

export const DoctorStation: React.FC<DoctorStationProps> = ({ user, onLogout }) => {
  const isAdmin = user.role === 'admin';
  const isDoctor = user.role === 'doctor';
  const isNurse = user.role === 'nurse';
  const isReceptionist = user.role === 'receptionist';
  const isResident = user.role === 'resident';
  
  // Roles de permisos
  const canConsult = isDoctor || isAdmin;
  const canCreate = !isDoctor; // Solo no-doctores pueden crear citas

  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'admin' | 'history_detail' | 'settings' | 'my_schedule'>('dashboard');
  const [allowDoctorSelfManage, setAllowDoctorSelfManage] = useState(false);
  
  // ESTADO PARA ALTERNAR VISTA AGENDA (Lista vs Calendario)
  const [agendaViewMode, setAgendaViewMode] = useState<'list' | 'calendar'>('list');

  // ESTADO PRINCIPAL DE WIZARD
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [currentConsultationId, setCurrentConsultationId] = useState<string | null>(null);
  const [currentAppointmentId, setCurrentAppointmentId] = useState<string | null>(null);
  const [step, setStep] = useState(0); 
  const [isCuadernoExpanded, setIsCuadernoExpanded] = useState(true);
 
  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Estados para Detalle de Historial
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryConsultation, setSelectedHistoryConsultation] = useState<Consultation | null>(null);
  const [historyPatient, setHistoryPatient] = useState<Patient | null>(null);
  const [receptionistName, setReceptionistName] = useState<string>('Desconocido');

  // Estados para modales de citas
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showAppointmentDetailsModal, setShowAppointmentDetailsModal] = useState(false);
  const [showResidentIntakeModal, setShowResidentIntakeModal] = useState(false);

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
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [preSelectedPatientId, setPreSelectedPatientId] = useState<string | null>(null); // Para seleccionar al nuevo paciente
  const [currentConsultationType, setCurrentConsultationType] = useState<'Nueva' | 'Reconsulta' | undefined>(undefined);
  const [currentModality, setCurrentModality] = useState<'Virtual' | 'Presencial' | undefined>(undefined);

  const topRef = useRef<HTMLDivElement>(null);
  const consultationTimerRef = useRef<number | null>(null);

  const [consultationDurationSeconds, setConsultationDurationSeconds] = useState<number | null>(null);
  const [consultationRemainingSeconds, setConsultationRemainingSeconds] = useState<number | null>(null);
  const [isConsultationDurationExceeded, setIsConsultationDurationExceeded] = useState(false);
  const [consultationDurationLabel, setConsultationDurationLabel] = useState<string | null>(null);

  const [importantNoticesList, setImportantNoticesList] = useState<Consultation[]>([]);
  const [loadingImportantNotices, setLoadingImportantNotices] = useState(false);
  const [selectedImportantNotice, setSelectedImportantNotice] = useState<Consultation | null>(null);
  const [hasUnseenImportantNotices, setHasUnseenImportantNotices] = useState(false);

  // --- LÓGICA DE PACIENTE FORÁNEO ---
  const isForeignPatient = (p: Patient | null) => {
      if (!p || !p.address) return false;
      return p.address.country !== 'Guatemala' || p.address.department !== 'Guatemala';
  };

  const methods = useForm<WizardFormValues>({
    defaultValues: { diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '', importantNotices: '' }
  });

  const formValues = methods.watch();

  useEffect(() => {
    const loadAllUsers = async () => {
        try {
            const users = await userService.getAllUsers();
            setAllUsers(users);
        } catch (error) {
            console.error("Error loading users", error);
        }
    };

    const loadSettings = async () => {
        try {
            const s = await doctorScheduleService.getGlobalSettings();
            setAllowDoctorSelfManage(s.allowDoctorSelfManage);
        } catch (e) {
            console.error('Error loading doctor schedule settings', e);
        }
    };

    loadAllUsers();
    loadSettings();
  }, []);

  useEffect(() => {
    return () => {
      if (consultationTimerRef.current !== null) {
        window.clearInterval(consultationTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    if (!currentPatient) {
      if (consultationTimerRef.current !== null) {
        window.clearInterval(consultationTimerRef.current);
      }
      consultationTimerRef.current = null;
      setConsultationDurationSeconds(null);
      setConsultationRemainingSeconds(null);
      setIsConsultationDurationExceeded(false);
      setConsultationDurationLabel(null);
      setImportantNoticesList([]);
      setHasUnseenImportantNotices(false);
      setSelectedImportantNotice(null);
      setIsCuadernoExpanded(true);
    }
  }, [currentPatient]);

  const refreshImportantNoticesState = (items: Consultation[]) => {
    const hasUnseen = items.some(item => {
      const text = item.importantNotices;
      if (!text || !text.trim()) return false;
      const seenBy = (item as any).importantNoticesSeenBy as string[] | undefined;
      return !(seenBy || []).includes(user.uid);
    });
    setHasUnseenImportantNotices(hasUnseen);
  };

  const loadImportantNotices = async (patientId: string) => {
    setLoadingImportantNotices(true);
    try {
      const notices = await patientService.getImportantNotices(patientId);
      setImportantNoticesList(notices);
      refreshImportantNoticesState(notices);
    } catch (error) {
      console.error("Error loading important notices", error);
    } finally {
      setLoadingImportantNotices(false);
    }
  };

  // CARGAR CITAS DEL DÍA
  const loadAppointments = async () => {
    try {
        // Solo filtrar por doctorId si es doctor. 
        // Admin, Recepción, Residente y Enfermera ven todo.
        const filterId = isDoctor ? user.uid : undefined;
        
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
    if (appt.status !== 'resident_intake' && appt.status !== 'in_progress') {
        toast.error("El paciente debe pasar primero por evaluación de enfermería.");
        return;
    }

    try {
        setCurrentAppointmentId(appt.id ?? null);
        setCurrentConsultationType(appt.consultationType || 'Nueva');
        setCurrentModality(appt.modality || 'Presencial');
        const durationSeconds = calculateAppointmentDurationSeconds(appt);
        if (durationSeconds > 0) {
            const minutes = Math.round(durationSeconds / 60);
            const label = formatDurationLabel(minutes);

            if (consultationTimerRef.current !== null) {
                window.clearInterval(consultationTimerRef.current);
            }

            setConsultationDurationSeconds(durationSeconds);
            setConsultationRemainingSeconds(durationSeconds);
            setIsConsultationDurationExceeded(false);
            setConsultationDurationLabel(label);

            const intervalId = window.setInterval(() => {
                setConsultationRemainingSeconds(prev => {
                    if (prev === null) return prev;
                    if (prev <= 1) {
                        window.clearInterval(intervalId);
                        setIsConsultationDurationExceeded(true);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            consultationTimerRef.current = intervalId;
        } else {
            setConsultationDurationSeconds(null);
            setConsultationRemainingSeconds(null);
            setIsConsultationDurationExceeded(false);
            setConsultationDurationLabel(null);
        }

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
        loadImportantNotices(patient.id);
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
        setIsCuadernoExpanded(true);

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
          doctorSpecialty: user.specialty,
          consultationType: appt.consultationType || 'Nueva',
          modality: appt.modality || 'Presencial',
          date: Date.now(), 
          appointmentId: appt.id,
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
      } catch (error: any) {
          console.error("Error al agendar cita:", error);
          const message = typeof error?.message === 'string' && error.message.trim()
              ? error.message
              : "Ocurrió un error al agendar la cita.";
          toast.error(message);
      }
  };

  const getEmptyForm = () => ({ diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', prescriptionNotes: '', importantNotices: '' });

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

  const handlePrintDoc = async (type: 'prescription' | 'labs' | 'report' | 'full_ficha') => {
      if (!selectedHistoryConsultation || !historyPatient) return;
      try {
          const action: 'download' | 'print' = (isDoctor && !isNurse && !isAdmin) ? 'download' : 'print';

          // LOGIC FIX: Always use the Consultation's Doctor profile for PDF generation (signature/header),
          // regardless of who is printing (Nurse/Admin/Doctor).
          let doctorProfileForPdf = user;
          
          if (selectedHistoryConsultation.doctorId && selectedHistoryConsultation.doctorId !== user.uid) {
              const foundDoctor = allUsers.find(u => u.uid === selectedHistoryConsultation.doctorId);
              if (foundDoctor) {
                  doctorProfileForPdf = foundDoctor;
              } else {
                  // Fallback if doctor profile not found in cache: create a temporary profile with stored names
                  doctorProfileForPdf = {
                      ...user, // Base on current user for structure
                      uid: selectedHistoryConsultation.doctorId,
                      name: selectedHistoryConsultation.doctorName || "Doctor",
                      specialty: (selectedHistoryConsultation as any).doctorSpecialty || "Medicina General",
                      role: 'doctor'
                  };
              }
          }

          if (type === 'prescription') {
              await generatePrescriptionPDF(selectedHistoryConsultation, historyPatient, doctorProfileForPdf, action);
          } else if (type === 'labs') {
              await generateExamsPDF(selectedHistoryConsultation, historyPatient, doctorProfileForPdf, action);
          } else if (type === 'report') {
              await generateNursingPDF(selectedHistoryConsultation, historyPatient, doctorProfileForPdf, action);
          } else {
              await generateFullFichaPDF(selectedHistoryConsultation, historyPatient, doctorProfileForPdf, action);
          }

          if (!isDoctor && (isNurse || isAdmin)) {
              const printedKey =
                type === 'prescription'
                  ? 'prescription'
                  : type === 'labs'
                  ? 'labs'
                  : type === 'report'
                  ? 'report'
                  : 'fullFicha';
              const updatedPrintedDocs = { ...(selectedHistoryConsultation.printedDocs || {}), [printedKey]: true };

              if (selectedHistoryConsultation.id) {
                  const consRef = doc(db, 'consultations', selectedHistoryConsultation.id);
                  await updateDoc(consRef, { printedDocs: updatedPrintedDocs });
              }

              setSelectedHistoryConsultation(prev => prev ? ({ ...prev, printedDocs: updatedPrintedDocs }) : prev);
          }

          const label =
            type === 'report'
              ? 'reporte de enfermería'
              : type === 'labs'
              ? 'labs'
              : type === 'full_ficha'
              ? 'ficha completa'
              : 'receta';
          toast.success(`${action === 'print' ? 'Imprimiendo' : 'Descargando'} ${label}...`);
      } catch (e) { 
          console.error("Error al generar documento", e);
          toast.error("Error al generar documento"); 
      }
  };

  const hasAllRequiredDocsPrinted = (consultation: Consultation | null) => {
      if (!consultation || !consultation.printedDocs) return false;
      const { prescription, labs, report, fullFicha } = consultation.printedDocs;
      const basePrinted = !!prescription && !!labs && !!report;
      const hasFichaFlag = Object.prototype.hasOwnProperty.call(consultation.printedDocs, 'fullFicha');
      const fichaPrintedOrNotRequired = hasFichaFlag ? !!fullFicha : true;
      return basePrinted && fichaPrintedOrNotRequired;
  };

  const attemptFinalizeDelivery = () => {
      if (hasAllRequiredDocsPrinted(selectedHistoryConsultation)) {
          finalizeDeliveryProcess();
      } else {
          setShowDeliveryOverrideModal(true); 
      }
  };

  const finalizeDeliveryProcess = async (reason?: string) => {
      if (!selectedHistoryConsultation) return;
      setIsSaving(true);
      try {
          const consRef = doc(db, 'consultations', selectedHistoryConsultation.id!);
          const updateData: any = {
              status: 'delivered',
              deliveredAt: Date.now(),
              deliveredBy: user.name,
          };
          if (reason && reason.trim()) {
              updateData.nonPrintReason = reason.trim();
          }
          await updateDoc(consRef, updateData);

          toast.success("Entregado correctamente");
          setShowDeliveryOverrideModal(false);
          setActiveView('history');
      } catch (e) { toast.error("Error al finalizar"); } finally { setIsSaving(false); }
  };

  const filteredAppointments = todaysAppointments.filter(appt => {
    if (isDoctor) return appt.status === 'resident_intake' || appt.status === 'in_progress' || appt.status === 'paid_checked_in';
    if (isResident) return appt.status === 'paid_checked_in';
    if (isNurse) return appt.status === 'paid_checked_in' || appt.status === 'in_progress' || appt.status === 'completed';
    if (isReceptionist || isAdmin) return true;
    return false;
  });

  const handleToggleNurseFlow = async (appt: Appointment) => {
    if (!appt.id) return;
    if (appt.consultationType !== 'Reconsulta') return;
    if (appt.status !== 'scheduled' && appt.status !== 'confirmed_phone') {
      toast.error("Solo se puede cambiar antes del pago.");
      return;
    }

    const current = appt.goToNurse !== false;
    const nextValue = !current;

    try {
      await appointmentService.updateAppointment(appt.id, { goToNurse: nextValue });
      setTodaysAppointments(prev =>
        prev.map(a => a.id === appt.id ? { ...a, goToNurse: nextValue } : a)
      );
      if (nextValue) {
        toast.success("El paciente pasará por enfermería.");
      } else {
        toast.success("El paciente pasará directo con el doctor.");
      }
    } catch (error) {
      toast.error("No se pudo actualizar la ruta de enfermería.");
    }
  };

  const handleOpenResidentIntake = async (appt: Appointment) => {
    try {
        const patient = await getPatientByDPI(appt.patientId);
        if (!patient) {
            toast.error("No se encontró el paciente");
            return;
        }
        setCurrentPatient(patient);
        setSelectedAppointment(appt);
        setShowResidentIntakeModal(true);
    } catch (error) {
        toast.error("Error al cargar datos del paciente");
    }
  };

  const hasConsultationTimer = consultationDurationSeconds !== null && consultationRemainingSeconds !== null;
  const countdown = hasConsultationTimer ? formatCountdown(consultationRemainingSeconds!) : null;

  return (
    <MainLayout 
        user={user} 
        onLogout={onLogout} 
        activeView={activeView === 'history_detail' ? 'history' : activeView} 
        onViewChange={setActiveView} 
        allowDoctorSelfManage={allowDoctorSelfManage}
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
           ) : activeView === 'my_schedule' && isDoctor && allowDoctorSelfManage ? (
               <DoctorScheduleAdmin currentUser={user} fixedDoctorId={user.uid} />
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
                   onUpdate={(updated) => setSelectedHistoryConsultation(updated)}
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
                                <div className="flex items-center gap-2">
                                    <h2 className="text-2xl font-bold text-slate-900">{currentPatient.fullName}</h2>
                                    {currentModality === 'Virtual' ? (
                                        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full flex items-center gap-1 border border-purple-200">
                                            <Video className="w-3 h-3" /> Virtual
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full flex items-center gap-1 border border-blue-200">
                                            <Users className="w-3 h-3" /> Presencial
                                        </span>
                                    )}
                                </div>
                                <p className="text-slate-500 font-mono text-sm">{currentPatient.billingCode}</p>
                            </div>
                        </div>

                       {hasConsultationTimer && consultationDurationLabel && (
                            <div className="mt-5">
                                {isConsultationDurationExceeded ? (
                                    <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-sm">
                                            <AlertTriangle className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-red-500">
                                                Tiempo estimado concluido
                                            </p>
                                            <p className="text-sm text-red-700 font-medium">
                                                La duración estimada de {consultationDurationLabel} para esta consulta ya se ha cumplido.
                                            </p>
                                        </div>
                                    </div>
                                ) : countdown && (
                                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 px-4 py-3 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/30">
                                                <Clock className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-emerald-700">
                                                    Contador de consulta
                                                </p>
                                                <p className="text-sm text-slate-600">
                                                    Duración estimada:{' '}
                                                    <span className="font-semibold text-slate-900">
                                                        {consultationDurationLabel}
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                        <div className="font-mono text-2xl lg:text-3xl font-bold text-emerald-700 tabular-nums">
                                            {countdown.hours}:{countdown.minutes}:{countdown.seconds}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                   </motion.div>

                   {importantNoticesList.length > 0 && (
                       <motion.div
                         initial={{ opacity: 0, y: 10 }}
                         animate={{ opacity: 1, y: 0 }}
                         className="bg-white rounded-3xl border border-red-200 shadow-sm p-4 mb-6"
                       >
                         <div className="flex items-center justify-between mb-3">
                           <div className="flex items-center gap-2">
                             <AlertTriangle className="w-4 h-4 text-red-500" />
                             <h3 className="text-sm font-bold text-red-700 uppercase tracking-wide">
                               Avisos importantes de consultas anteriores
                             </h3>
                           </div>
                           {hasUnseenImportantNotices && (
                             <span className="text-[11px] font-bold text-red-600">
                               Debe revisar todos los avisos antes de finalizar.
                             </span>
                           )}
                         </div>

                         <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                           {importantNoticesList.map(item => {
                             const seenBy = (item as any).importantNoticesSeenBy as string[] | undefined;
                             const isSeen = (seenBy || []).includes(user.uid);
                             const dateLabel = new Date(item.date).toLocaleString('es-GT', {
                               dateStyle: 'short',
                               timeStyle: 'short',
                               timeZone: 'America/Guatemala'
                             });
                             return (
                               <div
                                 key={item.id}
                                 className="flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50/40 px-3 py-2"
                               >
                                 <div className="flex items-center gap-3">
                                   <span
                                     className={`w-2 h-2 rounded-full ${
                                       isSeen ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
                                     }`}
                                   />
                                   <div className="text-xs">
                                     <p className="font-semibold text-red-800">
                                       Aviso de consulta {dateLabel}
                                     </p>
                                     <p className="text-red-700/80">
                                       por {item.doctorName || 'Médico desconocido'}
                                     </p>
                                   </div>
                                 </div>
                                 <button
                                   type="button"
                                   onClick={async () => {
                                     setSelectedImportantNotice(item);
                                     const currentSeen = (item as any).importantNoticesSeenBy as string[] | undefined;
                                     if (!(currentSeen || []).includes(user.uid) && item.id) {
                                       try {
                                         const consRef = doc(db, 'consultations', item.id);
                                         const updatedSeen = [ ...(currentSeen || []), user.uid];
                                         await updateDoc(consRef, { importantNoticesSeenBy: updatedSeen });
                                         const updatedList = importantNoticesList.map(c =>
                                           c.id === item.id ? { ...c, importantNoticesSeenBy: updatedSeen } : c
                                         );
                                         setImportantNoticesList(updatedList);
                                         refreshImportantNoticesState(updatedList);
                                       } catch (error) {
                                         console.error('Error al marcar aviso como visto', error);
                                         toast.error('No se pudo marcar el aviso como visto');
                                       }
                                     }
                                   }}
                                   className="px-3 py-1 rounded-full text-[11px] font-bold border border-red-300 text-red-700 bg-white hover:bg-red-50 transition"
                                 >
                                   Ver aviso
                                 </button>
                               </div>
                             );
                           })}
                         </div>
                       </motion.div>
                   )}

                   {/* SECCIÓN CUADERNO - DESPLEGABLE */}
                   <motion.div
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     transition={{ delay: 0.2 }}
                     className="mb-6"
                   >
                     <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                       <button
                         type="button"
                         onClick={() => setIsCuadernoExpanded(v => !v)}
                         className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
                       >
                         <div className="flex items-center gap-2">
                           <div className="p-2 bg-brand-100 text-brand-600 rounded-lg">
                             <Book className="w-5 h-5" />
                           </div>
                           <span className="text-sm font-bold text-slate-800">
                             Cuaderno del Paciente
                           </span>
                         </div>
                         <motion.div
                           animate={{ rotate: isCuadernoExpanded ? 180 : 0 }}
                           transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                           className="text-slate-400"
                         >
                           <ChevronDown className="w-4 h-4" />
                         </motion.div>
                       </button>

                       <AnimatePresence initial={false}>
                         {isCuadernoExpanded && (
                           <motion.div
                             key="cuaderno-content"
                             initial={{ height: 0, opacity: 0 }}
                             animate={{ height: 'auto', opacity: 1 }}
                             exit={{ height: 0, opacity: 0 }}
                             transition={{ duration: 0.25 }}
                             className="overflow-hidden"
                           >
                             <div className="px-4 pb-4 pt-2">
                               <Cuaderno patient={currentPatient} currentUser={user} showHeader={false} />
                             </div>
                           </motion.div>
                         )}
                       </AnimatePresence>
                     </div>
                   </motion.div>

                   <FormProvider {...methods}>
                       <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white rounded-3xl shadow-xl border border-slate-200 p-4 lg:p-8">
                           {step === 1 && <StepDiagnosis patient={currentPatient} currentUser={user} appointmentType={currentConsultationType} />}
                          {step === 2 && <StepPrescription currentUser={user} />}
                          {step === 3 && <StepExams userSpecialty={user.specialty} patient={currentPatient} appointmentType={currentConsultationType} />}
                          {step === 4 && <StepFinalize 
                               currentUser={user}
                                hasUnseenImportantNotices={hasUnseenImportantNotices}
                                onFinish={methods.handleSubmit(async (d) => {
                                setIsSaving(true);
                                try {
                                    const consultationRef = doc(db, 'consultations', currentConsultationId!);

                                    const raw = d as any;
                                    const specialtyFormId = raw.specialtyFormId as string | undefined;
                                    const rawSpecialtyData = (raw.specialtyData || {}) as Record<string, any>;

                                    let filteredSpecialtyData: Record<string, any> = rawSpecialtyData;
                                    let specialtyFormName: string | undefined = raw.specialtyFormName;

                                    if (specialtyFormId) {
                                        try {
                                            const forms = await specialtyFormsService.getAll();
                                            const activeForm = forms.find(f => f.id === specialtyFormId);
                                            if (activeForm) {
                                                const allowedIds = activeForm.sections.flatMap(section =>
                                                    section.fields.map(field => field.id)
                                                );
                                                const next: Record<string, any> = {};
                                                for (const id of allowedIds) {
                                                    const value = rawSpecialtyData[id];
                                                    next[id] = value ?? null;
                                                }
                                                filteredSpecialtyData = next;
                                                specialtyFormName = activeForm.name;
                                            }
                                        } catch (err) {
                                            console.error("Error cargando fichas para filtrar specialtyData", err);
                                        }
                                    }

                                    const { specialtyData, ...rest } = raw;

                                    const finishedData: any = { 
                                        status: 'finished' as const, 
                                        ...rest,
                                        specialtyFormId: specialtyFormId || null,
                                        specialtyFormName: specialtyFormName || null,
                                        specialtyData: filteredSpecialtyData || {},
                                        printedDocs: { prescription: false, labs: false, report: false } 
                                    };

                                    // Sanitizar undefined a null para evitar errores de Firestore
                                    Object.keys(finishedData).forEach(key => {
                                        if (finishedData[key] === undefined) {
                                            finishedData[key] = null;
                                        }
                                    });

                                    await updateDoc(consultationRef, finishedData);

                                    if (currentAppointmentId) {
                                        try {
                                            await appointmentService.completeAppointment(currentAppointmentId);
                                            setTodaysAppointments(prev => prev.map(a => a.id === currentAppointmentId ? { ...a, status: 'completed' } : a));
                                        } catch (err) {
                                            console.error("Error al marcar cita como completada", err);
                                        }
                                    }

                                    // Si la consulta era NUEVA, actualizamos al paciente a RECONSULTA
                                    if (currentPatient && (currentPatient.consultationType === 'Nueva' || (currentPatient.consultationType as string) === 'Primera Consulta')) {
                                        try {
                                            const patientRef = doc(db, 'patients', currentPatient.id!);
                                            await updateDoc(patientRef, { consultationType: 'Reconsulta' });
                                        } catch (err) {
                                            console.error("Error al actualizar tipo de consulta del paciente", err);
                                        }
                                    }

                                    // NOTIFICAR A PERSONAL (Admin, Enfermería, Recepción)
                                    const notificationPayload = { 
                                        ...finishedData, 
                                        patientName: currentPatient.fullName,
                                        id: currentConsultationId 
                                    } as Consultation;
                                    await notifyConsultationFinished(notificationPayload, user.name);

                                    try {
                                        const textSources: string[] = [];
                                        if (finishedData.diagnosis) textSources.push(finishedData.diagnosis);
                                        if (finishedData.followUpText) textSources.push(finishedData.followUpText);
                                        if (finishedData.prescriptionNotes) textSources.push(finishedData.prescriptionNotes);
                                        const combinedText = textSources.join('\n\n');

                                        if (combinedText.trim().length > 0) {
                                            const { analyzeFollowUpIntent } = await import('../services/geminiService.ts');
                                            const analysis = await analyzeFollowUpIntent(combinedText);
                                            if (analysis.hasFollowUp && analysis.days && analysis.days > 0) {
                                                const baseDate = new Date(finishedData.date || Date.now());
                                                const followUpDate = new Date(baseDate.getTime() + analysis.days * 24 * 60 * 60 * 1000);
                                                await notifyReceptionFollowUp(
                                                    { ...notificationPayload, followUpRequired: true } as Consultation,
                                                    user.name,
                                                    analysis.days,
                                                    followUpDate
                                                );
                                            }
                                        }
                                    } catch (aiError) {
                                        console.error("Follow-up analysis error", aiError);
                                    }
                                    
                                    setLastFinishedConsultation({ ...finishedData, patientName: currentPatient.fullName } as Consultation);
                                    setCurrentPatient(null);
                                    setCurrentConsultationType(undefined);
                                    setCurrentModality(undefined);
                                    setCurrentAppointmentId(null);
                                    setStep(0);
                                    methods.reset();
                                    setShowSuccessModal(true);
                                    
                                    loadAppointments();

                                } catch (e) { 
                                    console.error("Error CRÍTICO al guardar consulta:", e);
                                    // Intenta mostrar detalles del error si es posible
                                    if (e && typeof e === 'object' && 'code' in e) {
                                        // Error de Firebase a veces tiene code
                                        toast.error(`Error de base de datos: ${(e as any).code}`);
                                    } else if (e instanceof Error) {
                                        toast.error(`Error: ${e.message}`);
                                    } else {
                                        toast.error("Error al guardar (revise consola).");
                                    }
                                } finally { setIsSaving(false); }
                           })} isSaving={isSaving} />}
                           
                           <div className="mt-8 flex justify-between gap-4">
                               <button onClick={() => {
                                   if (step === 1) {
                                       setCurrentPatient(null);
                                       setCurrentConsultationType(undefined);
                                       setCurrentModality(undefined);
                                   } else {
                                       setStep(s => s - 1);
                                   }
                               }} className="px-6 py-2 border rounded-xl font-bold hover:bg-slate-50 transition">Atrás</button>
                               {step < 4 && (
                                 <button
                                   onClick={() => {
                                     setStep(s => s + 1);
                                     setIsCuadernoExpanded(false);
                                   }}
                                   className="px-8 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg transition-colors"
                                 >
                                   Siguiente
                                 </button>
                               )}
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
                           
                           <div className="flex items-center gap-3">
                             {!isDoctor && (
                               <DoctorDayScheduleDropdown />
                             )}
                             {canCreate && (
                               <button 
                                    onClick={() => setShowCreateAppointmentModal(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-lg w-full md:w-auto justify-center"
                               >
                                    <Plus className="w-4 h-4" /> Nueva Cita
                               </button>
                             )}
                           </div>
                       </div>

                       {/* CONTENIDO DE VISTAS */}
                       <div className="flex-1 overflow-hidden">
                           {agendaViewMode === 'list' ? (
                               /* VISTA DE LISTA (TABLA CLÁSICA) */
                               <div className="overflow-x-auto h-full">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-slate-200 text-[10px] text-slate-600 uppercase font-bold tracking-widest border-b border-slate-300">
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
                                            {filteredAppointments.map(appt => {
                                                const isReadyForDoctor = appt.status === 'resident_intake';
                                                const isInProgress = appt.status === 'in_progress';
                                                const isLocked = isDoctor && (!isReadyForDoctor && !isInProgress);
                                                
                                                const timeString = appt.date instanceof Date 
                                                    ? appt.date.toLocaleTimeString('es-GT', {hour:'2-digit', minute:'2-digit', timeZone: 'America/Guatemala'})
                                                    : 'Hora inválida';

                                                return (
                                                    <tr key={appt.id} className={`${isInProgress ? 'bg-amber-50/40' : 'hover:bg-slate-50/50 transition-colors'}`}>
                                                        <td className="p-4 text-sm font-bold text-slate-500 font-mono">
                                                            {timeString}
                                                        </td>
                                                       <td className="p-4 text-sm">
                                                           <div className="font-bold text-slate-800">{appt.patientName}</div>
                                                       </td>
                                                       <td className="p-4 text-sm text-slate-600 truncate max-w-[150px]">{appt.reason}</td>
                                                       <td className="p-4 text-sm font-medium text-brand-700">Dr. {appt.doctorName}</td>
                                                        <td className="p-4">
                                                            {appt.status === 'scheduled' && <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold border border-slate-200">Agendada</span>}
                                                            {appt.status === 'confirmed_phone' && <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold border border-yellow-200">Confirmada</span>}
                                                            {appt.status === 'paid_checked_in' && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold border border-green-200 flex w-fit items-center gap-1"><CheckCircle className="w-3 h-3"/> En Sala</span>}
                                                            {appt.status === 'resident_intake' && <span className="px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-bold border border-sky-200 flex w-fit items-center gap-1"><CheckCircle className="w-3 h-3"/> Listo para consulta</span>}
                                                            {appt.status === 'in_progress' && <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold border border-blue-200 animate-pulse">En Consulta</span>}
                                                            {appt.status === 'completed' && <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-bold">Finalizada</span>}
                                                            {appt.status === 'no_show' && <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-bold border border-red-200">No se presentó</span>}
                                                            {(isReceptionist || isAdmin) && appt.consultationType === 'Reconsulta' && (
                                                                <div className="mt-2 flex items-center gap-2">
                                                                    <span className="text-[10px] text-slate-500 font-medium">
                                                                        Paso por enfermería:
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleNurseFlow(appt)}
                                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                                                                            appt.goToNurse === false
                                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                        }`}
                                                                    >
                                                                        {appt.goToNurse === false ? 'Directo a doctor' : 'Con enfermería'}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            {/* BOTÓN PARA RECEPCIONISTA / ADMIN */}
                                                            {(isReceptionist || isAdmin) && (
                                                                <button 
                                                                    onClick={() => {
                                                                        setSelectedAppointment(appt);
                                                                        setShowAppointmentDetailsModal(true);
                                                                    }}
                                                                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-md flex items-center gap-2 ml-auto"
                                                                >
                                                                    <Plus className="w-3 h-3" /> Ver Detalle / Boleta
                                                                </button>
                                                            )}

                                                            {/* BOTÓN PARA ENFERMERÍA (ANTES RESIDENTE) */}
                                                            {isNurse && appt.status === 'paid_checked_in' && (
                                                                <button 
                                                                    onClick={() => handleOpenResidentIntake(appt)}
                                                                    className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition shadow-md flex items-center gap-2 ml-auto"
                                                                >
                                                                    <FileText className="w-3 h-3" /> Evaluación Enfermería
                                                                </button>
                                                            )}

                                                            {/* BOTÓN PARA ENFERMERA - VER RESUMEN */}
                                                             {isNurse && appt.status === 'completed' && (
                                                                 <button 
                                                                     onClick={async () => {
                                                                         // Buscar la consulta asociada para ver el detalle
                                                                         const startOfDay = new Date();
                                                                         startOfDay.setHours(0, 0, 0, 0);
                                                                         
                                                                         const q = query(
                                                                             collection(db, 'consultations'), 
                                                                             where('patientId', '==', appt.patientId),
                                                                             where('status', 'in', ['finished', 'delivered']),
                                                                             where('date', '>=', startOfDay.getTime())
                                                                         );
                                                                         const snap = await getDocs(q);
                                                                         if (!snap.empty) {
                                                                             const doc = snap.docs[0];
                                                                             goToDetail({ id: doc.id, ...doc.data() } as Consultation);
                                                                         } else {
                                                                             toast.error("No se encontró el detalle de la consulta de hoy");
                                                                         }
                                                                     }}
                                                                     className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition shadow-md flex items-center gap-2 ml-auto"
                                                                 >
                                                                     <List className="w-3 h-3" /> Ver Resumen
                                                                 </button>
                                                             )}

                                                            {/* BOTÓN PARA DOCTOR */}
                                                            {isDoctor && (appt.status === 'resident_intake' || appt.status === 'in_progress') &&  (
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
                                            {filteredAppointments.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="p-12 text-center text-slate-400 italic font-medium">
                                                        {isResident ? "No hay pacientes pendientes de evaluación" : 
                                                         isNurse ? "No hay consultas activas o finalizadas por revisar" :
                                                         "No hay citas programadas para hoy"}
                                                    </td>
                                                </tr>
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
        
        {/* Modales de Éxito y Entrega */}
        <AnimatePresence>
            {showSuccessModal && lastFinishedConsultation && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
                         <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                             <CheckCircle className="w-10 h-10" />
                         </div>
                         <h3 className="text-xl font-bold mb-2">Consulta Finalizada</h3>
                         <p className="text-slate-500 mb-6">El expediente se ha guardado correctamente.</p>
                         <div className="flex flex-col gap-3">
                             <button 
                                onClick={() => lastFinishedConsultation && goToDetail(lastFinishedConsultation)} 
                                className="w-full py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 transition flex items-center justify-center gap-2"
                             >
                                <FileText className="w-5 h-5" />
                                Ver Detalles / Imprimir
                             </button>
                             <button 
                                onClick={() => { setShowSuccessModal(false); setLastFinishedConsultation(null); }} 
                                className="w-full py-3 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition"
                             >
                                Volver a Agenda
                             </button>
                         </div>
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

         {/* Modal de Aviso Importante */}
         <AnimatePresence>
             {selectedImportantNotice && (
                 <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[280] flex items-center justify-center p-4">
                     <motion.div
                         initial={{ scale: 0.9, opacity: 0, y: 10 }}
                         animate={{ scale: 1, opacity: 1, y: 0 }}
                         exit={{ scale: 0.9, opacity: 0, y: 10 }}
                         className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 md:p-8 relative"
                     >
                         <button
                             type="button"
                             onClick={() => setSelectedImportantNotice(null)}
                             className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                         >
                             <X className="w-5 h-5" />
                         </button>

                         <div className="flex items-center gap-3 mb-4">
                             <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                                 <AlertTriangle className="w-5 h-5" />
                             </div>
                             <div>
                                 <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">
                                     Aviso importante
                                 </p>
                                 <h3 className="text-lg font-bold text-slate-900">
                                     Consulta anterior
                                 </h3>
                             </div>
                         </div>

                         <div className="mb-4 text-xs text-slate-500 space-y-1">
                             <p>
                                 Fecha:{' '}
                                 <span className="font-semibold text-slate-800">
                                     {new Date(selectedImportantNotice.date).toLocaleString('es-GT', {
                                         dateStyle: 'full',
                                         timeStyle: 'short',
                                         timeZone: 'America/Guatemala'
                                     })}
                                 </span>
                             </p>
                             <p>
                                 Médico:{' '}
                                 <span className="font-semibold text-slate-800">
                                     {selectedImportantNotice.doctorName || 'Médico desconocido'}
                                 </span>
                             </p>
                         </div>

                         <div className="mt-4 border border-red-100 rounded-2xl bg-red-50/40 p-4 max-h-60 overflow-y-auto">
                             <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">
                                 Detalle del aviso
                             </p>
                             <p className="text-sm text-red-900 whitespace-pre-line">
                                 {selectedImportantNotice.importantNotices}
                             </p>
                         </div>

                         <div className="mt-6 flex justify-end">
                             <button
                                 type="button"
                                 onClick={() => setSelectedImportantNotice(null)}
                                 className="px-5 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition-colors"
                             >
                                 Cerrar
                             </button>
                         </div>
                     </motion.div>
                 </div>
             )}
         </AnimatePresence>

        <AppointmentDetailsModal 
            isOpen={showAppointmentDetailsModal}
            onClose={() => {
                setShowAppointmentDetailsModal(false);
                setSelectedAppointment(null);
            }}
            appointment={selectedAppointment}
            userRole={user.role}
            users={allUsers}
            onConfirmPhone={async (id, method) => {
                await appointmentService.confirmByPhone(id, user.uid, method);
                toast.success("Cita confirmada");
                loadAppointments();
                setShowAppointmentDetailsModal(false);
            }}
            onRegisterPayment={async (id, receipt, amount) => {
                await appointmentService.registerPayment(id, user.uid, receipt, amount);
                toast.success("Pago registrado");
                loadAppointments();
                setShowAppointmentDetailsModal(false);
            }}
           onCancel={async (id, reason) => {
                if (reason === 'no_show_internal') {
                    await appointmentService.markNoShow(id);
                    toast.success("Marcada como no se presentó");
                } else {
                    await appointmentService.cancelAppointment(id, reason);
                    toast.success("Cita cancelada");
                }
                loadAppointments();
                setShowAppointmentDetailsModal(false);
            }}
            onUpdateAppointment={async (id, updates) => {
                try {
                    await appointmentService.updateAppointment(id, updates, {
                        editorId: user.uid,
                        editorName: user.name,
                    });
                    toast.success("Cita actualizada");
                    loadAppointments();
                    setShowAppointmentDetailsModal(false);
                } catch (error) {
                    console.error("Error al actualizar cita", error);
                    toast.error("No se pudieron guardar los cambios de la cita. Verifique permisos.");
                }
            }}
         />

         {showResidentIntakeModal && currentPatient && (
            <ResidentIntakeModal 
                isOpen={showResidentIntakeModal}
                onClose={() => {
                    setShowResidentIntakeModal(false);
                    setSelectedAppointment(null);
                    setCurrentPatient(null);
                }}
                patient={currentPatient}
                appointmentId={selectedAppointment?.id}
                currentUser={user}
                onSaveComplete={() => {
                    toast.success("Evaluación de la enfermera guardada");
                    loadAppointments();
                }}
            />
         )}
    </MainLayout>
  );
};
