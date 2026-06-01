import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import {
  Loader2, CheckCircle, Plus, AlertTriangle,
  Calendar as CalendarIcon, List, LayoutGrid,
  FileText, Clock, Book, ChevronDown,
  X, Video, Users
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, doc, Timestamp, updateDoc, query, where, getDocs, DocumentSnapshot, runTransaction, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { motion, AnimatePresence } from 'framer-motion';

import { Patient, Consultation, UserProfile, PrescriptionItem, ReferralGroup, SpecialtyReferral, Appointment, ResonanceOrder, EegOrder } from '../types.ts';
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
import { PatientModal } from '../components/Patients/PatientModal';
import { Cuaderno } from '../components/Patients/Cuaderno';
import { PatientListView } from '../components/Patients/PatientListView';
import { PatientDetailView } from '../components/Patients/PatientDetailView';
import { CreateAppointmentModal } from '../components/Appointments/CreateAppointmentModal';
import { AppointmentDetailsModal } from '../components/Appointments/AppointmentDetailsModal';
import { ResidentIntakeModal } from '../components/Appointments/ResidentIntakeModal';
import { ResidentClinicalFormModal } from '../components/Appointments/ResidentClinicalFormModal';
import { AgendaListView } from '../components/Appointments/AgendaListView';
import { AvailabilityView } from '../components/Availability/AvailabilityView';
import { AppointmentCalendar } from './AppointmentCalendar';
import { DoctorDayScheduleDropdown } from '../components/Appointments/DoctorDayScheduleDropdown';

import { DoctorScheduleAdmin } from '../components/Admin/DoctorScheduleManager';
import { getPatientByDPI, patientService } from '../services/patientService';
import { appointmentService } from '../services/appointmentService';
import { userService } from '../services/userService';
import { notifyConsultationFinished, notifyReceptionFollowUp } from '../services/notificationService';
import { generatePrescriptionPDF, generateExamsPDF, generateNursingPDF, generateFullFichaPDF, generateResonanceOrdersPDF, generateEegOrdersPDF } from '../services/pdfService';
import { specialtyFormsService } from '../services/specialtyFormsService';
import { doctorScheduleService } from '../services/doctorScheduleService';
import { logAuditAction } from '../services/auditService.ts';

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

const generateUniquePrescriptionNumber = async (): Promise<string> => {
  const counterRef = doc(db, 'system_counters', 'prescription_number');
  const nextValue = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const currentValue = snap.exists() ? Number((snap.data() as any).current || 0) : 0;
    const safeCurrent = Number.isFinite(currentValue) && currentValue > 0 ? Math.floor(currentValue) : 0;
    const next = safeCurrent + 1;
    transaction.set(counterRef, { current: next, updatedAt: Date.now() }, { merge: true });
    return next;
  });
  return String(nextValue);
};

const AGENDA_PAGE_SIZE = 12;
// DESACTIVACION TEMPORAL solicitada por operacion:
// flujo de enfermeria/residente fuera de uso.
// Para reactivarlo en el futuro, cambiar a `true`.
const ENABLE_NURSE_RESIDENT_FLOW = false;

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
  followUpRequestText?: string;
  followUpDays?: number;
  followUpEstimatedDate?: number;
  followUpRequired?: boolean;
  omittedFields: { [key: string]: boolean };
  isReadyToFinish: boolean;
  prescriptionNotes: string;
  importantNotices: string;
  emotionalEvaluationSelections?: string[];
  specialtyFormId?: string;
  specialtyFormName?: string;
  specialtyData?: Record<string, any>;
  resonanceOrders?: ResonanceOrder[];
  eegOrders?: EegOrder[];
}

export const DoctorStation: React.FC<DoctorStationProps> = ({ user, onLogout }) => {
  const isAdmin = user.role === 'admin';
  const isDoctor = user.role === 'doctor' || user.role === 'licenciado';
  const isNurse = user.role === 'nurse';
  const isReceptionist = user.role === 'receptionist';
  const isResident = user.role === 'resident';

  // Roles de permisos
  const canConsult = isDoctor || isAdmin;
  const canCreate = isAdmin || isReceptionist;

  const [activeView, setActiveView] = useState<'dashboard' | 'history' | 'patients' | 'patient_detail' | 'admin' | 'history_detail' | 'settings' | 'my_schedule'>('dashboard');
  const [allowDoctorSelfManage, setAllowDoctorSelfManage] = useState(false);

  // ESTADO PARA ALTERNAR VISTA AGENDA (Lista vs Calendario)
  const [agendaViewMode, setAgendaViewMode] = useState<'list' | 'calendar' | 'availability'>('list');
  const [agendaSearchTerm, setAgendaSearchTerm] = useState('');

  // ESTADO PRINCIPAL DE WIZARD
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [currentConsultationId, setCurrentConsultationId] = useState<string | null>(null);
  const [currentAppointmentId, setCurrentAppointmentId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [isCuadernoExpanded, setIsCuadernoExpanded] = useState(true);

  const [todaysAppointments, setTodaysAppointments] = useState<Appointment[]>([]);
  const [residentAppointments, setResidentAppointments] = useState<Appointment[]>([]);
  const [agendaPage, setAgendaPage] = useState(1);
  const [agendaDateFilter, setAgendaDateFilter] = useState('');
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
  const [showResidentClinicalModal, setShowResidentClinicalModal] = useState(false);
  const [residentClinicalAppointment, setResidentClinicalAppointment] = useState<Appointment | null>(null);
  const [residentClinicalPatient, setResidentClinicalPatient] = useState<Patient | null>(null);

  // Estados para Entrega con Excepciones (Enfermería)
  const [showDeliveryOverrideModal, setShowDeliveryOverrideModal] = useState(false);
  const [deliveryOverrideReason, setDeliveryOverrideReason] = useState('');

  // ESTADO PARA MODAL DE ÉXITO (FINALIZAR)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [lastFinishedConsultation, setLastFinishedConsultation] = useState<Consultation | null>(null);
  const [lastFinishedPatient, setLastFinishedPatient] = useState<Patient | null>(null);

  // ESTADOS PARA CREAR CITA Y PACIENTE
  const [showCreateAppointmentModal, setShowCreateAppointmentModal] = useState(false);
  const [showQuickPatientModal, setShowQuickPatientModal] = useState(false); // Modal para crear paciente
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [allDoctors, setAllDoctors] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [preSelectedPatientId, setPreSelectedPatientId] = useState<string | null>(null); // Para seleccionar al nuevo paciente
  const [currentConsultationType, setCurrentConsultationType] = useState<'Nueva' | 'Reconsulta' | undefined>(undefined);
  const [currentModality, setCurrentModality] = useState<'Virtual' | 'Presencial' | undefined>(undefined);

  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [patientList, setPatientList] = useState<Patient[]>([]);
  const [patientListLoading, setPatientListLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // PAGINATION & PATIENT MODAL STATE
  const [patientPage, setPatientPage] = useState(1);
  const [patientLastDocs, setPatientLastDocs] = useState<Record<number, DocumentSnapshot | null>>({});
  const [hasMorePatients, setHasMorePatients] = useState(false);
  const [showPatientModal, setShowPatientModal] = useState(false);

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
    defaultValues: { diagnosis: '', prescription: [], exams: [], referralGroups: [], specialtyReferrals: [], isReadyToFinish: false, followUpText: '', followUpRequestText: '', followUpDays: undefined, followUpEstimatedDate: undefined, followUpRequired: false, prescriptionNotes: '', importantNotices: '', emotionalEvaluationSelections: [], specialtyFormId: undefined, specialtyFormName: undefined, specialtyData: {}, resonanceOrders: undefined, eegOrders: undefined }
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
    if (activeView === 'patients') {
      loadPatientsList();
    }
  }, [activeView]);

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

  const getAgendaDateRange = (dateStr: string) => {
    if (dateStr) {
      const start = new Date(dateStr);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateStr);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { start, end: undefined as Date | undefined };
  };

  const fetchAgendaPage = async (useResidentList: boolean) => {
    try {
      const filterId = isDoctor ? user.uid : undefined;
      const { start, end } = getAgendaDateRange(agendaDateFilter);

      let baseConstraints: any[] = [
        where('date', '>=', Timestamp.fromDate(start)),
        orderBy('date', 'asc')
      ];
      if (end) {
        baseConstraints.splice(1, 0, where('date', '<=', Timestamp.fromDate(end)));
      }
      if (filterId) {
        baseConstraints.unshift(where('doctorId', '==', filterId));
      }

      const q = query(collection(db, 'appointments'), ...baseConstraints);
      const snapshot = await getDocs(q);

      const processedApps = await Promise.all(snapshot.docs.map(async docSnap => {
        const app = { id: docSnap.id, ...docSnap.data() } as Appointment;
        let pName = app.patientName;

        // Si el nombre es desconocido, intentar resolverlo
        if ((!pName || pName === 'Desconocido') && app.patientId) {
          try {
            // Primero ver si lo tenemos en la lista cargada (si existe)
            const inList = allPatients.find(p => p.id === app.patientId);
            if (inList) {
              pName = inList.fullName;
              // Arreglar en BD
              appointmentService.resolveAndFixPatientName(app.id!, app.patientId);
            } else {
              // Si no, buscarlo directamente (getPatientByDPI maneja varios fallbacks)
              const p = await getPatientByDPI(app.patientId);
              if (p) {
                pName = p.fullName;
                // Arreglar en BD
                appointmentService.resolveAndFixPatientName(app.id!, app.patientId);
              }
            }
          } catch (e) {
            console.error("Error resolving patient name in agenda:", e);
          }
        }

        return {
          ...app,
          patientName: pName || 'Desconocido',
          date: app.date instanceof Timestamp ? app.date.toDate() : new Date(app.date),
          endDate: app.endDate instanceof Timestamp ? app.endDate.toDate() : new Date(app.endDate),
          createdAt: app.createdAt instanceof Timestamp ? app.createdAt.toDate() : app.createdAt
        };
      }));

      if (useResidentList) {
        setResidentAppointments(processedApps);
      } else {
        setTodaysAppointments(processedApps);
      }
      // Reset page when fetching new data
      setAgendaPage(1);
    } catch (error: any) {
      console.error("Error loading appointments:", error);
    }
  };

  useEffect(() => {
    if (agendaViewMode === 'list') {
      const useResidentList = isResident;
      fetchAgendaPage(useResidentList);
      const interval = setInterval(() => fetchAgendaPage(useResidentList), 60000);
      return () => clearInterval(interval);
    }
  }, [user.uid, isDoctor, isAdmin, isResident, agendaViewMode, agendaDateFilter]);

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

  useEffect(() => {
    if (agendaViewMode === 'availability' && allDoctors.length === 0) {
      userService.getDoctors().then(setAllDoctors);
    }
  }, [agendaViewMode, allDoctors.length]);


  // --- INICIAR CONSULTA (MÁQUINA DE ESTADOS) ---
  const handleStartConsultation = async (appt: Appointment) => {
    const isNewConsultation = appt.consultationType === 'Nueva';
    // Flujo original: toda "Nueva" requiere ficha de residente.
    // Temporalmente se desactiva con ENABLE_NURSE_RESIDENT_FLOW = false.
    const requiresResidentFicha = ENABLE_NURSE_RESIDENT_FLOW && isNewConsultation;
    const residentFichaCompleted = appt.residentClinicalCompleted === true;
    const canSkipNurse = !ENABLE_NURSE_RESIDENT_FLOW || (appt.consultationType === 'Reconsulta' && appt.goToNurse === false);
    const statusAllowsStart = appt.status === 'resident_intake' || appt.status === 'in_progress' || (canSkipNurse && appt.status === 'paid_checked_in');

    if (requiresResidentFicha && !residentFichaCompleted) {
      toast.error("Debe completarse la ficha clínica del residente antes de iniciar.");
      return;
    }

    if (!statusAllowsStart) {
      toast.error("El paciente debe pasar primero por enfermería.");
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

      const residentDefaults = residentFichaCompleted ? {
        specialtyFormId: appt.residentSpecialtyFormId || undefined,
        specialtyFormName: appt.residentSpecialtyFormName || undefined,
        specialtyData: appt.residentSpecialtyData || {}
      } : {};

      const baseForm = getEmptyForm(residentDefaults);
      const savedDraft = localStorage.getItem(`draft_${activeConsId}`);
      if (savedDraft) {
        try {
          methods.reset({ ...baseForm, ...JSON.parse(savedDraft) });
          toast.info("Sesión restaurada");
        } catch (e) { methods.reset(baseForm); }
      } else {
        methods.reset(baseForm);
      }

      // setStep(1); // COMENTADO: Anteriormente iniciaba en Diagnóstico
      setStep(2); // NUEVO: Inicia directamente en Receta (que ahora incluye diagnóstico)
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
    const primarySpecialty = Array.isArray(user.specialties) && user.specialties.length > 0
      ? user.specialties[0]
      : (user.specialty || '');
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
      doctorSpecialty: primarySpecialty,
      consultationType: appt.consultationType || 'Nueva',
      modality: appt.modality || 'Presencial',
      date: Date.now(),
      appointmentId: appt.id,
      specialtyFormId: appt.residentSpecialtyFormId || null,
      specialtyFormName: appt.residentSpecialtyFormName || null,
      specialtyData: appt.residentSpecialtyData || {},
      reason: appt.reason || '',
      reasonForConsultation: appt.reasonForConsultation || '',
      createdAt: Timestamp.now()
    };
    const ref = await addDoc(collection(db, 'consultations'), newCons);
    return ref.id;
  };

  const handleCreateAppointment = async (data: any) => {
    try {
      await appointmentService.createAppointment({
        ...data,
        // Temporal: toda cita pasa directo al doctor luego de pago.
        // No eliminamos el campo para facilitar reactivacion futura.
        goToNurse: ENABLE_NURSE_RESIDENT_FLOW ? data.goToNurse : false,
        createdBy: user.uid
      });
      toast.success("Cita agendada correctamente");
      fetchAgendaPage(isResident);
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

  const getEmptyForm = (overrides?: Partial<WizardFormValues>) => ({
    diagnosis: '',
    prescription: [],
    exams: [],
    referralGroups: [],
    specialtyReferrals: [],
    isReadyToFinish: false,
    followUpText: '',
    followUpRequestText: '',
    followUpDays: undefined,
    followUpEstimatedDate: undefined,
    followUpRequired: false,
    prescriptionNotes: '',
    importantNotices: '',
    emotionalEvaluationSelections: [],
    specialtyFormId: undefined,
    specialtyFormName: undefined,
    specialtyData: {},
    resonanceOrders: undefined,
    eegOrders: undefined,
    ...overrides
  });

  const followUpRequestText = methods.watch('followUpRequestText');
  const resonanceOrders = methods.watch('resonanceOrders') || [];
  const eegOrders = methods.watch('eegOrders') || [];

  const isFilled = (value?: string) => typeof value === 'string' && value.trim().length > 0;

  const areResonanceOrdersComplete = resonanceOrders.length === 0 || resonanceOrders.every((order: ResonanceOrder) => true);
  const areEegOrdersComplete = eegOrders.length === 0 || eegOrders.every((order: EegOrder) => true);
  const hasIncompleteOrders = (resonanceOrders.length > 0 && !areResonanceOrdersComplete) || (eegOrders.length > 0 && !areEegOrdersComplete);
  const isFollowUpMissing = !isFilled(followUpRequestText);
  const nextDisabled = (step === 2 && isFollowUpMissing) || (step === 3 && hasIncompleteOrders);

  // --- NAVEGACIÓN Y HISTORIAL ---

  const goToDetail = async (c: Consultation) => {
    setLoadingHistory(true);
    try {
      const patientId = c.patientId ? String(c.patientId) : '';
      let p = null;
      if (patientId) {
        p = await getPatientByDPI(patientId);
        if (!p) {
          toast.error("Paciente no encontrado. Se mostrará el detalle básico.");
        }
      } else {
        toast.error("Consulta sin paciente asociado. Se mostrará el detalle básico.");
      }
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

  const handlePrintDoc = async (type: 'prescription' | 'labs' | 'report' | 'full_ficha' | 'resonance_orders' | 'eeg_orders') => {
    if (!selectedHistoryConsultation || !historyPatient) return;
    try {
      const action: 'download' | 'print' = (isDoctor && !isNurse && !isAdmin) ? 'download' : 'print';
      let consultationToPrint = selectedHistoryConsultation;

      let doctorProfileForPdf = user;

      if (selectedHistoryConsultation.doctorId && selectedHistoryConsultation.doctorId !== user.uid) {
        const foundDoctor = allUsers.find(u => u.uid === selectedHistoryConsultation.doctorId);
        if (foundDoctor) {
          doctorProfileForPdf = foundDoctor;
        } else {
          // Fallback if doctor profile not found in cache: create a temporary profile with stored names
          const fallbackSpecialty = (selectedHistoryConsultation as any).doctorSpecialty || "Medicina General";
          doctorProfileForPdf = {
            ...user, // Base on current user for structure
            uid: selectedHistoryConsultation.doctorId,
            name: selectedHistoryConsultation.doctorName || "Doctor",
            specialty: fallbackSpecialty,
            specialties: [fallbackSpecialty],
            role: 'doctor'
          };
        }
      }

      if (type === 'prescription') {
        if (!consultationToPrint.prescriptionNumber) {
          const prescriptionNumber = await generateUniquePrescriptionNumber();
          if (consultationToPrint.id) {
            const consRef = doc(db, 'consultations', consultationToPrint.id);
            await updateDoc(consRef, { prescriptionNumber });
          }
          consultationToPrint = { ...consultationToPrint, prescriptionNumber };
          setSelectedHistoryConsultation(prev => prev ? ({ ...prev, prescriptionNumber }) : prev);
        }
        await generatePrescriptionPDF(consultationToPrint, historyPatient, doctorProfileForPdf, action);
      } else if (type === 'labs') {
        await generateExamsPDF(consultationToPrint, historyPatient, doctorProfileForPdf, action);
      } else if (type === 'report') {
        await generateNursingPDF(consultationToPrint, historyPatient, doctorProfileForPdf, action);
      } else if (type === 'resonance_orders') {
        await generateResonanceOrdersPDF(consultationToPrint, historyPatient, doctorProfileForPdf, action);
      } else if (type === 'eeg_orders') {
        await generateEegOrdersPDF(consultationToPrint, historyPatient, doctorProfileForPdf, action);
      } else {
        await generateFullFichaPDF(consultationToPrint, historyPatient, doctorProfileForPdf, action);
      }

      if (!isDoctor && (isNurse || isAdmin || isReceptionist) && selectedHistoryConsultation.status !== 'delivered') {
        const printedKey =
          type === 'prescription'
            ? 'prescription'
            : type === 'labs'
              ? 'labs'
              : type === 'report'
                ? 'report'
                : type === 'resonance_orders'
                  ? 'resonanceOrders'
                  : type === 'eeg_orders'
                    ? 'eegOrders'
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
            : type === 'resonance_orders'
              ? 'órdenes de resonancia'
              : type === 'eeg_orders'
                ? 'órdenes de EEG'
                : type === 'full_ficha'
                  ? 'ficha completa'
                  : 'receta';
      toast.success(`${action === 'print' ? 'Imprimiendo' : 'Descargando'} ${label}...`);
    } catch (e) {
      console.error("Error al generar documento", e);
      toast.error("Error al generar documento");
    }
  };

  const handlePreviewLastPrescription = async () => {
    if (!lastFinishedConsultation || !lastFinishedPatient) {
      toast.error("No hay datos suficientes para visualizar la receta.");
      return;
    }
    try {
      let consultationToPreview = lastFinishedConsultation;
      if (!consultationToPreview.prescriptionNumber) {
        const prescriptionNumber = await generateUniquePrescriptionNumber();
        if (consultationToPreview.id) {
          const consRef = doc(db, 'consultations', consultationToPreview.id);
          await updateDoc(consRef, { prescriptionNumber });
        }
        consultationToPreview = { ...consultationToPreview, prescriptionNumber };
        setLastFinishedConsultation(consultationToPreview);
      }
      await generatePrescriptionPDF(consultationToPreview, lastFinishedPatient, user, 'preview');
    } catch (e) {
      console.error("Error al previsualizar receta", e);
      toast.error("No se pudo abrir la receta en vista previa.");
    }
  };

  const hasAllRequiredDocsPrinted = (consultation: Consultation | null) => {
    if (!consultation || !consultation.printedDocs) return false;
    const { prescription, labs, resonanceOrders, eegOrders } = consultation.printedDocs;
    const basePrinted = !!prescription && !!labs;
    const hasResonanceOrders = (consultation.resonanceOrders?.length || 0) > 0;
    const hasEegOrders = (consultation.eegOrders?.length || 0) > 0;
    const ordersPrinted = (!hasResonanceOrders || !!resonanceOrders) && (!hasEegOrders || !!eegOrders);
    return basePrinted && ordersPrinted;
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
      if (reason && reason.trim()) {
        await logAuditAction(user.name, "Expediente Entregado", `El usuario ${user.name} ha entregado sus archivos correctamente al paciente ${historyPatient.fullName}, con archivos no impresos por la razón: ${reason.trim()}`);
      } else {
        await logAuditAction(user.name, "Expediente Entregado", `El usuario ${user.name} ha entregado sus archivos correctamente al paciente ${historyPatient.fullName}`);
      }

      toast.success("Entregado correctamente");
      setShowDeliveryOverrideModal(false);
      setActiveView('history');
    } catch (e) { toast.error("Error al finalizar"); } finally { setIsSaving(false); }
  };

  const filteredAppointments = todaysAppointments.filter(appt => {
    // Doctor: mostrar TODAS las citas excepto canceladas y no_show.
    // Antes solo mostraba 'resident_intake', 'in_progress', 'paid_checked_in',
    // lo cual ocultaba citas con status 'scheduled' y 'confirmed_phone'.
    if (isDoctor) return appt.status !== 'cancelled' && appt.status !== 'no_show';
    // Temporal: deshabilitamos bandeja operativa de enfermeria.
    if (isNurse) return ENABLE_NURSE_RESIDENT_FLOW && (appt.status === 'paid_checked_in' || appt.status === 'in_progress' || appt.status === 'completed');
    if (isReceptionist || isAdmin) return true;
    return false;
  });

  const normalizeSearch = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  const baseAppointments = (ENABLE_NURSE_RESIDENT_FLOW && isResident) ? residentAppointments : filteredAppointments;
  const normalizedAgendaSearch = normalizeSearch(agendaSearchTerm);
  const searchedAppointments = baseAppointments.filter(appt => {
    if (!normalizedAgendaSearch) return true;
    const haystack = normalizeSearch(`${appt.patientName || ''} ${appt.doctorName || ''}`);
    return haystack.includes(normalizedAgendaSearch);
  });

  const totalPages = Math.ceil(searchedAppointments.length / AGENDA_PAGE_SIZE) || 1;
  const listAppointments = searchedAppointments.slice((agendaPage - 1) * AGENDA_PAGE_SIZE, agendaPage * AGENDA_PAGE_SIZE);

  const handleToggleNurseFlow = async (appt: Appointment) => {
    if (!ENABLE_NURSE_RESIDENT_FLOW) {
      toast.info("Flujo de enfermería deshabilitado temporalmente.");
      return;
    }
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

  const handleOpenResidentClinical = async (appt: Appointment) => {
    if (appt.consultationType !== 'Nueva') {
      toast.error("La ficha clínica del residente solo aplica a consultas nuevas.");
      return;
    }
    try {
      const patient = await getPatientByDPI(appt.patientId);
      if (!patient) {
        toast.error("No se encontró el paciente");
        return;
      }
      setResidentClinicalAppointment(appt);
      setResidentClinicalPatient(patient);
      setShowResidentClinicalModal(true);
    } catch (error) {
      toast.error("Error al cargar datos del paciente");
    }
  };

  const handleResidentClinicalSaved = (updates: Partial<Appointment>) => {
    if (!residentClinicalAppointment?.id) return;
    const updateList = (list: Appointment[]) =>
      list.map(a => a.id === residentClinicalAppointment.id ? { ...a, ...updates } : a);
    setResidentAppointments(prev => updateList(prev));
    setTodaysAppointments(prev => updateList(prev));
  };

  const hasConsultationTimer = consultationDurationSeconds !== null && consultationRemainingSeconds !== null;
  const countdown = hasConsultationTimer ? formatCountdown(consultationRemainingSeconds!) : null;

  const agendaPagination = {
    currentPage: agendaPage,
    totalPages,
    hasNext: agendaPage < totalPages,
    onPrev: () => setAgendaPage(p => Math.max(1, p - 1)),
    onNext: () => setAgendaPage(p => (p < totalPages ? p + 1 : p))
  };

  const loadPatientsList = async (term?: string, targetPage: number = 1) => {
    const search = (term ?? patientSearchTerm).trim();
    setPatientListLoading(true);
    try {
      if (search) {
        const results = await patientService.search(search);
        setPatientList(results);
        setHasMorePatients(false);
        setPatientPage(1);
      } else {
        // Pagination logic
        let startDoc = null;
        if (targetPage > 1) {
          startDoc = patientLastDocs[targetPage - 1];
          if (!startDoc) {
            targetPage = 1;
          }
        }

        const { patients, lastDoc: newLastDoc, hasMore } = await patientService.getPaginated(20, startDoc);
        setPatientList(patients);
        setHasMorePatients(hasMore);
        setPatientPage(targetPage);

        if (newLastDoc) {
          setPatientLastDocs(prev => ({ ...prev, [targetPage]: newLastDoc }));
        }
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al cargar pacientes");
    } finally {
      setPatientListLoading(false);
    }
  };

  const handlePatientSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadPatientsList(undefined, 1);
  };

  const handleClearPatientSearch = async () => {
    setPatientSearchTerm('');
    await loadPatientsList('', 1);
  };

  const handleNextPage = () => {
    if (hasMorePatients && !patientListLoading) {
      loadPatientsList(undefined, patientPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (patientPage > 1 && !patientListLoading) {
      loadPatientsList(undefined, patientPage - 1);
    }
  };

  const handleCreatePatientClick = () => {
    setSelectedPatient(null);
    setShowPatientModal(true);
  };

  const handlePatientSavedFromModal = (newPatient: Patient) => {
    // Mostrar directamente al paciente nuevo en la lista para confirmación visual inmediata
    setPatientSearchTerm(newPatient.fullName);
    setPatientList([newPatient]);
    setHasMorePatients(false);
    setPatientPage(1);
    toast.success("Paciente creado exitosamente");
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setActiveView('patient_detail');
  };

  const handlePatientSaved = (updated: Patient) => {
    setSelectedPatient(updated);
    setPatientList(prev => prev.map(p => (p.id === updated.id ? updated : p)));
  };

  return (
    <MainLayout
      user={user}
      onLogout={onLogout}
      activeView={activeView === 'history_detail' ? 'history' : activeView === 'patient_detail' ? 'patients' : activeView}
      onViewChange={setActiveView}
      allowDoctorSelfManage={allowDoctorSelfManage}
      currentTitle={
        (currentPatient && activeView === 'dashboard') ? currentPatient.fullName :
          activeView === 'history_detail' ? `Expediente: ${selectedHistoryConsultation?.patientName}` :
            activeView === 'patient_detail' ? `Paciente: ${selectedPatient?.fullName}` :
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
        ) : activeView === 'patients' ? (
          <>
            <PatientListView
              searchTerm={patientSearchTerm}
              onSearchTermChange={setPatientSearchTerm}
              onSearchSubmit={handlePatientSearchSubmit}
              onClearSearch={handleClearPatientSearch}
              patients={patientList}
              loading={patientListLoading}
              onSelectPatient={handleSelectPatient}
              onCreatePatient={handleCreatePatientClick}
              onNextPage={handleNextPage}
              onPrevPage={handlePrevPage}
              hasMore={hasMorePatients}
              page={patientPage}
              isFirstPage={patientPage === 1}
            />
            <PatientModal
              isOpen={showPatientModal}
              onClose={() => setShowPatientModal(false)}
              currentUser={user}
              onSaved={handlePatientSavedFromModal}
            />
          </>
        ) : activeView === 'patient_detail' && selectedPatient ? (
          <PatientDetailView
            patient={selectedPatient}
            currentUser={user}
            onBack={() => setActiveView('patients')}
            onPatientUpdated={handlePatientSaved}
          />
        ) : currentPatient ? (
          /* --- WIZARD DE CONSULTA ACTIVA --- */
          <div className="max-w-5xl mx-auto">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 mb-6 relative overflow-hidden">
              {isForeignPatient(currentPatient) && (
                <div className="absolute top-0 left-0 w-full bg-amber-400 text-amber-900 px-4 py-1 text-center text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                  <AlertTriangle className="w-3 h-3" /> Atención: Paciente Foráneo
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
                            className={`w-2 h-2 rounded-full ${isSeen ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
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
                                const updatedSeen = [...(currentSeen || []), user.uid];
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
                {/* {step === 1 && <StepDiagnosis patient={currentPatient} currentUser={user} />} */}
                {step === 2 && (
                  <StepPrescription
                    currentUser={user}
                    isSaving={isSaving}
                    onFinish={methods.handleSubmit(async (d) => {
                      // EL SIGUIENTE CÓDIGO ES EL MISMO QUE ESTABA EN STEPFINALIZE
                      if (hasIncompleteOrders) {
                        toast.error('Complete todos los campos de las órdenes antes de finalizar.');
                        return;
                      }
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
                          // MARCAMOS ESTOS CAMPOS COMO DESACTIVADOS
                          exams: [],
                          referralGroups: [],
                          specialtyReferrals: [],
                          followUpText: 'Sección desactivada temporalmente',
                          printedDocs: { prescription: false, labs: false, report: false, resonanceOrders: false, eegOrders: false }
                        };

                        if (Array.isArray(finishedData.prescription) && finishedData.prescription.length > 0) {
                          finishedData.prescriptionNumber = await generateUniquePrescriptionNumber();
                        } else {
                          finishedData.prescriptionNumber = null;
                        }

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

                        // NOTIFICAR A PERSONAL (Admin, Enfermería, Recepción)
                        const notificationPayload = {
                          ...finishedData,
                          patientName: currentPatient!.fullName,
                          id: currentConsultationId
                        } as Consultation;
                        await notifyConsultationFinished(notificationPayload, user.name);

                        try {
                          if (finishedData.followUpRequired && finishedData.followUpDays && finishedData.followUpEstimatedDate) {
                            await notifyReceptionFollowUp(
                              { ...notificationPayload, followUpRequired: true } as Consultation,
                              user.name,
                              finishedData.followUpDays,
                              new Date(finishedData.followUpEstimatedDate)
                            );
                          } else {
                            const textSources: string[] = [];
                            if (finishedData.diagnosis) textSources.push(finishedData.diagnosis);
                            if (finishedData.followUpText) textSources.push(finishedData.followUpText);
                            if (finishedData.prescriptionNotes) textSources.push(finishedData.prescriptionNotes);
                            if (finishedData.followUpRequestText) textSources.push(finishedData.followUpRequestText);
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
                          }
                        } catch (aiError) {
                          console.error("Follow-up analysis error", aiError);
                        }

                        setLastFinishedConsultation({ ...finishedData, patientName: currentPatient!.fullName } as Consultation);
                        setLastFinishedPatient(currentPatient);
                        setCurrentPatient(null);
                        setCurrentConsultationType(undefined);
                        setCurrentModality(undefined);
                        setCurrentAppointmentId(null);
                        setStep(0);
                        methods.reset();
                        setShowSuccessModal(true);

                        fetchAgendaPage(isResident);

                      } catch (e) {
                        console.error("Error CRÍTICO al guardar consulta:", e);
                        if (e && typeof e === 'object' && 'code' in e) {
                          toast.error(`Error de base de datos: ${(e as any).code}`);
                        } else if (e instanceof Error) {
                          toast.error(`Error: ${e.message}`);
                        } else {
                          toast.error("Error al guardar (revise consola).");
                        }
                      } finally { setIsSaving(false); }
                    })}
                  />
                )}
                {/* {step === 3 && (
                  <StepExams
                    userSpecialties={user.specialties || (user.specialty ? [user.specialty] : [])}
                    patient={currentPatient}
                    appointmentType={currentConsultationType}
                  />
                )}
                {step === 4 && <StepFinalize
                  currentUser={user}
                  hasUnseenImportantNotices={hasUnseenImportantNotices}
                  onFinish={methods.handleSubmit(async (d) => {
                    // Logic already moved up
                  })} isSaving={isSaving} />} */}

                {/* COMENTADO: Navegación de múltiples pasos desactivada temporalmente */}
                {/* {nextDisabled && (
                  <p className="mb-3 text-xs font-bold text-red-600">
                    {step === 2 && isFollowUpMissing && 'Debe completar la reconsulta para continuar.'}
                    {step === 3 && hasIncompleteOrders && 'Complete todos los campos de las órdenes para continuar.'}
                  </p>
                )}
                <div className="mt-4 flex justify-between gap-4">
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
                      disabled={nextDisabled}
                      className="px-8 py-2 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente
                    </button>
                  )}
                </div> */}

                {/* BOTÓN ATRÁS SIMPLIFICADO PARA SALIR DE LA CONSULTA */}
                <div className="mt-4 flex justify-start">
                  <button onClick={() => {
                    setCurrentPatient(null);
                    setCurrentConsultationType(undefined);
                    setCurrentModality(undefined);
                    setStep(0);
                  }} className="px-6 py-2 border rounded-xl font-bold hover:bg-slate-50 transition text-slate-500">
                    Cancelar / Salir
                  </button>
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
                    <button
                      onClick={() => setAgendaViewMode('availability')}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${agendaViewMode === 'availability' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Clock className="w-4 h-4" /> Disponibilidad
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
                  <AgendaListView
                    appointments={listAppointments}
                    isDoctor={isDoctor}
                    isResident={isResident}
                    isNurse={isNurse}
                    isReceptionist={isReceptionist}
                    isAdmin={isAdmin}
                    isSaving={isSaving}
                    onOpenDetails={(appt) => {
                      setSelectedAppointment(appt);
                      setShowAppointmentDetailsModal(true);
                    }}
                    onOpenNurseIntake={handleOpenResidentIntake}
                    onOpenResidentClinical={handleOpenResidentClinical}
                    onStartConsultation={handleStartConsultation}
                    onToggleNurseFlow={handleToggleNurseFlow}
                    onViewSummary={async (appt) => {
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
                    pagination={agendaPagination}
                    searchTerm={agendaSearchTerm}
                    onSearchTermChange={setAgendaSearchTerm}
                    dateFilter={agendaDateFilter}
                    onDateFilterChange={setAgendaDateFilter}
                    onClearDateFilter={() => setAgendaDateFilter('')}
                    enableNurseResidentFlow={ENABLE_NURSE_RESIDENT_FLOW}
                  />
                ) : agendaViewMode === 'calendar' ? (
                  <div className="h-full p-4">
                    <AppointmentCalendar user={user} />
                  </div>
                ) : (
                  <AvailabilityView currentUser={user} doctors={allDoctors} />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* MODALES */}
      <CreateAppointmentModal
        isOpen={showCreateAppointmentModal}
        onClose={() => { setShowCreateAppointmentModal(false); setPreSelectedPatientId(null); }}
        onSubmit={handleCreateAppointment}
        patients={allPatients}
        doctors={allDoctors}
        initialDate={new Date()}
        onCreatePatientClick={() => {
          setShowCreateAppointmentModal(false);
          setShowQuickPatientModal(true);
        }}
        preSelectedPatientId={preSelectedPatientId}
        existingAppointments={todaysAppointments}
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
                  onClick={handlePreviewLastPrescription}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                >
                  <FileText className="w-5 h-5" />
                  Ver Receta
                </button>
                <button
                  onClick={() => { setShowSuccessModal(false); setLastFinishedConsultation(null); setLastFinishedPatient(null); }}
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
                <AlertTriangle className="w-10 h-10" />
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
                  {isSaving ? <Loader2 className="animate-spin w-5 h-5" /> : <CheckCircle className="w-5 h-5" />} <span>Confirmar Entrega</span>
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
        currentUser={user}
        users={allUsers}
        onConfirmPhone={async (id, method) => {
          const loadingToast = toast.loading("Confirmando...");
          try {
            await Promise.race([
              appointmentService.confirmByPhone(id, user.uid, method),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout-Firebase')), 5000))
            ]);
            toast.success("Cita confirmada", { id: loadingToast });
            fetchAgendaPage(isResident);
            setShowAppointmentDetailsModal(false);
          } catch (e: any) {
            console.error(e);
            const errMsg = e?.message || '';
            toast.error(errMsg.includes('Quota') || errMsg.includes('Timeout') ? "Error: Cuota excedida o red lenta." : "Error al confirmar cita", { id: loadingToast });
          }
        }}
        onRegisterPayment={async (id, receipt, amount) => {
          const loadingToast = toast.loading("Registrando pago...");
          try {
            await Promise.race([
              appointmentService.registerPayment(id, user.uid, receipt, amount),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout-Firebase')), 5000))
            ]);
            toast.success("Pago registrado", { id: loadingToast });
            fetchAgendaPage(isResident);
            setShowAppointmentDetailsModal(false);
          } catch (e: any) {
            console.error(e);
            const errMsg = e?.message || '';
            toast.error(errMsg.includes('Quota') || errMsg.includes('Timeout') ? "Error: Cuota excedida o red lenta." : "Error al registrar pago", { id: loadingToast });
          }
        }}
        onCancel={async (id, reason) => {
          const loadingToast = toast.loading("Cancelando...");
          try {
            await Promise.race([
              (async () => {
                if (reason === 'no_show_internal') {
                  await appointmentService.markNoShow(id);
                } else {
                  await appointmentService.cancelAppointment(id, reason);
                }
              })(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout-Firebase')), 5000))
            ]);
            toast.success(reason === 'no_show_internal' ? "Marcada como no se presentó" : "Cita cancelada", { id: loadingToast });
            fetchAgendaPage(isResident);
            setShowAppointmentDetailsModal(false);
          } catch (e: any) {
            console.error(e);
            const errMsg = e?.message || '';
            toast.error(errMsg.includes('Quota') || errMsg.includes('Timeout') ? "Error: Cuota excedida o red lenta." : "Error al cancelar cita", { id: loadingToast });
          }
        }}
        onUpdateAppointment={async (id, updates) => {
          try {
            await appointmentService.updateAppointment(id, updates, {
              editorId: user.uid,
              editorName: user.name,
            });
            toast.success("Cita actualizada");
            fetchAgendaPage(isResident);
            setShowAppointmentDetailsModal(false);
          } catch (error) {
            console.error("Error al actualizar cita", error);
            toast.error("No se pudieron guardar los cambios de la cita. Verifique permisos.");
          }
        }}
        // Temporal: no abrir modal de enfermeria desde detalle mientras el flujo este desactivado.
        onOpenResidentIntake={ENABLE_NURSE_RESIDENT_FLOW && user.role === 'nurse' && selectedAppointment
          ? () => handleOpenResidentIntake(selectedAppointment)
          : undefined}
      />

      {ENABLE_NURSE_RESIDENT_FLOW && showResidentIntakeModal && currentPatient && (
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
            fetchAgendaPage(isResident);
          }}
        />
      )}

      {ENABLE_NURSE_RESIDENT_FLOW && showResidentClinicalModal && residentClinicalAppointment && residentClinicalPatient && (
        <ResidentClinicalFormModal
          isOpen={showResidentClinicalModal}
          onClose={() => {
            setShowResidentClinicalModal(false);
            setResidentClinicalAppointment(null);
            setResidentClinicalPatient(null);
          }}
          appointment={residentClinicalAppointment}
          patient={residentClinicalPatient}
          currentUser={user}
          onSaveComplete={handleResidentClinicalSaved}
        />
      )}
    </MainLayout>
  );
};
