import * as React from 'react';
import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Calendar, RefreshCw, Download, UploadCloud, BarChart3, Users, Pill, Stethoscope, FileSpreadsheet, ClipboardList, ShieldCheck, Activity, Clock, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, CheckCircle2, Filter, Link2, Unlink, Wand2, Trash2, Check, X, Building2, Loader2, FlaskConical } from 'lucide-react';
import { reportsService, MedicineCatalogItem } from '../../services/reportsService';
import { pharmacySalesService, PharmacySalesReportMeta, PharmacySaleRow } from '../../services/pharmacySalesService';
import { getAllMedicines, getPathologies, findMoleculeOverlapsFromPrescriptions, MoleculeOverlapReport } from '../../services/inventoryService';
import { performPharmacyMatch, PharmacyMatchResult } from '../../services/pharmacyMatchService';
import { medicineNormalizationService, MedNormalizationRule, DuplicateCluster, detectDuplicateClusters, buildNormalizationMap, normalizeWithMap, buildActiveIngredientMap } from '../../services/medicineNormalizationService';
import { Appointment, Consultation, Patient, PrescriptionItem, UserProfile, DoctorDaySchedule, Medicine, Pathology } from '../../types';
import { gtDateToMs, msToGtDateStr } from '../../utils/gtTimezone';
import { calculatePharmacyFillRate } from '../../utils/pharmacyFillRate';
import { categorizeDiagnosis, loadAllCache, getRecentSubtypes, CategorizationResult } from '../../utils/diagnosisCategorization';
import { CleanExternalMedicines } from './CleanExternalMedicines';
// @ts-ignore
import ExcelJS from 'exceljs';

type ReportTab = 'overview' | 'quality' | 'clinics' | 'secretary' | 'medicines' | 'doctors' | 'pharmacy';

const getGuatemalaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

const getDateRange = (startStr: string, endStr: string) => {
  const start = new Date(gtDateToMs(startStr));
  const end = new Date(gtDateToMs(endStr, true));
  return { start, end };
};

const formatDate = (date: number | Date | undefined) => {
  if (!date) return '—';
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleDateString('es-GT', { timeZone: 'America/Guatemala', year: 'numeric', month: 'short', day: 'numeric' });
};

const formatNumber = (value: number) => value.toLocaleString('es-GT');

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getMissingFields = (patient: Patient) => {
  const missing: string[] = [];
  if (!patient.dpi) missing.push('DPI');
  if (!patient.billingCode) missing.push('Código Facturación');
  if (!patient.phone) missing.push('Teléfono');
  if (!patient.gender) missing.push('Género');
  if (!patient.referralChannel) missing.push('Canal Referencia');
  if (!patient.age && !patient.birthDate) missing.push('Edad/Fecha Nac.');
  if (!patient.address?.department) missing.push('Dirección');
  return missing;
};

const getAgeFromBirthDate = (birthDate?: string) => {
  if (!birthDate) return undefined;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return undefined;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < date.getDate())) {
    age--;
  }
  return age;
};

const getIsoWeekKey = (date: Date) => {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${temp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
};

const getIsoWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 1 - day);
  d.setHours(0, 0, 0, 0);
  return d;
};

const appointmentToDate = (value: any) => {
  if (!value) return undefined;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  return new Date(value);
};

const getAppointmentDurationMinutes = (appt: Appointment) => {
  if (appt.duration && Number.isFinite(appt.duration)) return Number(appt.duration);
  const start = appointmentToDate(appt.date);
  const end = appointmentToDate(appt.endDate);
  if (start && end) {
    const diff = (end.getTime() - start.getTime()) / 60000;
    return diff > 0 ? diff : 0;
  }
  return appt.consultationType === 'Nueva' ? 60 : 30;
};

const downloadWorkbook = async (workbook: any, fileName: string) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
};

const addWorkbookTitle = (sheet: any, title: string, subtitle: string) => {
  sheet.mergeCells('B2:F2');
  const titleCell = sheet.getCell('B2');
  titleCell.value = title;
  titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  sheet.mergeCells('B3:F3');
  const subtitleCell = sheet.getCell('B3');
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF64748B' } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left' };
};

const applyHeaderStyle = (row: any, color: string) => {
  row.height = 28;
  row.eachCell((cell: any) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
  });
};

// =====================================================================
// PHARMACY FILL RATE — la lógica vive en src/utils/pharmacyFillRate.ts
// para que sea testeable de forma aislada.
// =====================================================================


export const ReportsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [startDate, setStartDate] = useState(getGuatemalaToday());
  const [endDate, setEndDate] = useState(getGuatemalaToday());
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [extraPatients, setExtraPatients] = useState<Patient[]>([]);
  const [inventoryMeds, setInventoryMeds] = useState<MedicineCatalogItem[]>([]);
  const [externalMeds, setExternalMeds] = useState<MedicineCatalogItem[]>([]);
  const [inventoryWithStock, setInventoryWithStock] = useState<Medicine[]>([]);
  const [allCatalogMeds, setAllCatalogMeds] = useState<Medicine[]>([]);
  const [moleculeOverlap, setMoleculeOverlap] = useState<MoleculeOverlapReport>({ overlaps: [], totalExternalMedsWithInternalMolecule: 0, uniqueMoleculesCount: 0, totalInternalMeds: 0, totalExternalMeds: 0 });
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [doctorDiagnosisCategories, setDoctorDiagnosisCategories] = useState<Map<string, CategorizationResult>>(new Map());
  const [diagnosisDetailModal, setDiagnosisDetailModal] = useState<{
    open: boolean;
    doctorName: string;
    category: CategorizationResult | null;
  }>({ open: false, doctorName: '', category: null });
  const [doctors, setDoctors] = useState<UserProfile[]>([]);
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorDaySchedule[]>([]);

  const [pharmacyReports, setPharmacyReports] = useState<PharmacySalesReportMeta[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [pharmacyAllRows, setPharmacyAllRows] = useState<PharmacySaleRow[]>([]);
  const [pharmacyDateStart, setPharmacyDateStart] = useState(getGuatemalaToday());
  const [pharmacyDateEnd, setPharmacyDateEnd] = useState(getGuatemalaToday());
  const [pharmacyConsultations, setPharmacyConsultations] = useState<Consultation[]>([]);
  const [uploadingPharmacy, setUploadingPharmacy] = useState(false);
  const [showPharmacyUploadModal, setShowPharmacyUploadModal] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const [uploadDateStart, setUploadDateStart] = useState(getGuatemalaToday());
  const [uploadDateEnd, setUploadDateEnd] = useState(getGuatemalaToday());
  const [selectedMedicationForModal, setSelectedMedicationForModal] = useState<{name: string, isExternal: boolean} | null>(null);
  const [selectedMoleculeForModal, setSelectedMoleculeForModal] = useState<string | null>(null);
  const [moleculeModalTab, setMoleculeModalTab] = useState<'internal' | 'external'>('internal');

  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedMedicineName, setSelectedMedicineName] = useState('');
  const [selectedMatrixWeek, setSelectedMatrixWeek] = useState<string | null>(null);
  const [selectedDoctorWeek, setSelectedDoctorWeek] = useState<string | null>(null);

  // Quality filters
  const [qualitySeverityFilter, setQualitySeverityFilter] = useState<'all' | 'critical' | 'alert' | 'ok'>('all');
  const [qualityOperatorFilter, setQualityOperatorFilter] = useState('');

  // Medicine filters
  const [medFilterDoctor, setMedFilterDoctor] = useState('');
  const [medFilterSpecialty, setMedFilterSpecialty] = useState('');
  const [medFilterMolecule, setMedFilterMolecule] = useState('');

  // Capacity expansion
  const [expandedCapacityCategory, setExpandedCapacityCategory] = useState<string | null>(null);

  // Diagnosis grouping filter
  const [diagnosisGroupBy, setDiagnosisGroupBy] = useState<'specialty' | 'doctor'>('specialty');

  // Normalization
  const [normRules, setNormRules] = useState<MedNormalizationRule[]>([]);
  const [normSubView, setNormSubView] = useState<'detect' | 'rules'>('detect');
  const [normManualDirty, setNormManualDirty] = useState('');
  const [normManualCanonicalText, setNormManualCanonicalText] = useState('');
  const [normSaving, setNormSaving] = useState(false);
  const [normManualCanonicalMap, setNormManualCanonicalMap] = useState<Record<string, string>>({});
  const [normIgnoredClusters, setNormIgnoredClusters] = useState<string[]>([]);

  const [showMissingModal, setShowMissingModal] = useState(false);
  const [showSpecialtyModal, setShowSpecialtyModal] = useState<'total' | 'new' | 're' | null>(null);
  const [showUnfinishedConsultationsModal, setShowUnfinishedConsultationsModal] = useState(false);
  const [showDoctorsNotPrescribingModal, setShowDoctorsNotPrescribingModal] = useState(false);

  useEffect(() => {
    if (!selectedMoleculeForModal && !selectedMedicationForModal) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedMoleculeForModal(null);
        setSelectedMedicationForModal(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [selectedMoleculeForModal, selectedMedicationForModal]);

  // Load inventory with stock for pharmacy fill rate calculations
  useEffect(() => {
    const loadInventory = async () => {
        try {
          const meds = await getAllMedicines();
          setAllCatalogMeds(meds);
          setInventoryWithStock(meds.filter(m => !m.isExternal));
        } catch (e) {
          console.error('Error loading inventory for pharmacy fill rate:', e);
        }
      };
      loadInventory();
    }, []);

    // Load pathologies catalog and hydrate diagnosis category cache on mount
    useEffect(() => {
      const loadPathologiesAndCache = async () => {
        try {
          const [paths] = await Promise.all([getPathologies(), loadAllCache()]);
          setPathologies(paths);
        } catch (e) {
          console.error('Error loading pathologies or diagnosis cache:', e);
        }
      };
      loadPathologiesAndCache();
    }, []);

  const range = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  const periodLabel = useMemo(() => {
    const fmt = (d: string) => {
      const date = new Date(d + 'T12:00:00');
      return date.toLocaleDateString('es-GT', { day: 'numeric', month: 'short', year: 'numeric' });
    };
    if (startDate === endDate) return fmt(startDate);
    return `${fmt(startDate)} — ${fmt(endDate)}`;
  }, [startDate, endDate]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [patientsRange, consultationsRange, appointmentsRange, doctorList, inventoryList, externalList, scheduleList] = await Promise.all([
        reportsService.getPatientsByRange(range.start, range.end),
        reportsService.getConsultationsByRange(range.start, range.end),
        reportsService.getAppointmentsByRange(range.start, range.end),
        reportsService.getDoctors(),
        reportsService.getInventoryMedicines(),
        reportsService.getExternalMedicines(),
        reportsService.getDoctorSchedulesByRange(startDate, endDate).catch(() => [] as DoctorDaySchedule[])
      ]);

      const appointmentPatientIds = Array.from(new Set(appointmentsRange.map(a => a.patientId).filter(Boolean)));
      const knownIds = new Set(patientsRange.map(p => p.id));
      const missingIds = appointmentPatientIds.filter(id => !knownIds.has(id));
      const extra = await reportsService.getPatientsByIds(missingIds);

      setPatients(patientsRange);
      setConsultations(consultationsRange);
      setAppointments(appointmentsRange);
      setExtraPatients(extra);
      setDoctors(doctorList);
      setInventoryMeds(inventoryList);
      setDoctorSchedules(scheduleList);
      setExternalMeds(externalList);

      if (!selectedDoctorId && doctorList.length > 0) {
        setSelectedDoctorId(doctorList[0].uid);
      }

      const topMeds = Array.from(new Set(consultationsRange.flatMap(c => (c.prescription || []).map(p => p.name)))).filter(Boolean);
      if (!selectedMedicineName && topMeds.length > 0) {
        setSelectedMedicineName(topMeds[0]);
      }
    } catch (error) {
      console.error('Error loading reports data', error);
      toast.error('No se pudo cargar la data de reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [startDate, endDate]);

  // Load normalization rules
  const refreshNormRules = async () => {
    try {
      const rules = await medicineNormalizationService.getRules();
      setNormRules(rules);
    } catch (e) {
      console.warn('Could not load normalization rules', e);
    }
  };
  useEffect(() => { refreshNormRules(); }, []);

  useEffect(() => {
    pharmacySalesService.listReports()
      .then(setPharmacyReports)
      .catch(() => setPharmacyReports([]));
  }, []);

  useEffect(() => {
    if (!selectedReportId) {
      setPharmacyAllRows([]);
      return;
    }
    pharmacySalesService.getReportRowsByRange(selectedReportId)
      .then(setPharmacyAllRows)
      .catch(() => setPharmacyAllRows([]));
  }, [selectedReportId]);

  const parseDateFromFileName = (fileName: string): { start: string; end: string } | null => {
    const lower = fileName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const months: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
    };
    // Pattern: "13 abril 2025" or "13 de abril 2025"
    const longMatch = lower.match(/(\d{1,2})\s*(?:de\s+)?(\w+)\s*(?:de\s+)?(\d{4})/);
    if (longMatch) {
      const day = parseInt(longMatch[1]);
      const month = months[longMatch[2]];
      const year = parseInt(longMatch[3]);
      if (month !== undefined && !isNaN(day) && !isNaN(year)) {
        const d = new Date(year, month, day);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return { start: `${y}-${m}-${dd}`, end: `${y}-${m}-${dd}` };
      }
    }
    // Pattern: "2025-04-13" or "13-04-2025" or "13/04/2025"
    const isoMatch = lower.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1]);
      const m = parseInt(isoMatch[2]);
      const d = parseInt(isoMatch[3]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { start: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, end: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
      }
    }
    const dmyMatch = lower.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1]);
      const m = parseInt(dmyMatch[2]);
      const y = parseInt(dmyMatch[3]);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        return { start: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, end: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
      }
    }
    return null;
  };

  useEffect(() => {
    const report = pharmacyReports.find(r => r.id === selectedReportId);
    if (!report) return;

    // 1. Try stored metadata dates
    const toMs = (v: any): number => {
      if (typeof v === 'number') return v;
      if (v?.toDate) return v.toDate().getTime();
      if (v?.seconds) return v.seconds * 1000;
      const parsed = new Date(v).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };
    const ds = toMs(report.dateStart);
    const de = toMs(report.dateEnd);
    if (ds > 0 && de > 0) {
      setPharmacyDateStart(msToGtDateStr(ds));
      setPharmacyDateEnd(msToGtDateStr(de));
      return;
    }

    // 2. Fallback: parse from filename
    if (report.fileName) {
      const parsed = parseDateFromFileName(report.fileName);
      if (parsed) {
        setPharmacyDateStart(parsed.start);
        setPharmacyDateEnd(parsed.end);
      }
    }
  }, [selectedReportId, pharmacyReports]);

  useEffect(() => {
    if (!pharmacyDateStart || !pharmacyDateEnd) return;
    const pStart = new Date(gtDateToMs(pharmacyDateStart));
    const pEnd = new Date(gtDateToMs(pharmacyDateEnd, true));
    reportsService.getConsultationsByRange(pStart, pEnd)
      .then(setPharmacyConsultations)
      .catch(() => setPharmacyConsultations([]));
  }, [pharmacyDateStart, pharmacyDateEnd]);

  const pharmacyRows = useMemo(() => {
    if (!pharmacyAllRows.length) return [];
    const startMs = gtDateToMs(pharmacyDateStart);
    const endMs = gtDateToMs(pharmacyDateEnd, true);
    return pharmacyAllRows.filter(row => {
      if (!row.dateMs) return true;
      return row.dateMs >= startMs && row.dateMs <= endMs;
    });
  }, [pharmacyAllRows, pharmacyDateStart, pharmacyDateEnd]);

  const handleUploadPharmacyReport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setPendingUploadFile(file);
    const today = getGuatemalaToday();
    setUploadDateStart(today);
    setUploadDateEnd(today);
    setShowPharmacyUploadModal(true);
  };

  const confirmPharmacyUpload = async () => {
    if (!pendingUploadFile) return;
    setUploadingPharmacy(true);
    setShowPharmacyUploadModal(false);
    try {
      const pStartMs = gtDateToMs(uploadDateStart);
      const pEndMs = gtDateToMs(uploadDateEnd, true);
      const result = await pharmacySalesService.uploadReport(pendingUploadFile, 'admin', pStartMs, pEndMs);
      toast.success(`Reporte cargado (${result.rowCount} filas)`);
      const reports = await pharmacySalesService.listReports();
      setPharmacyReports(reports);
      if (reports.length > 0) setSelectedReportId(reports[0].id);
    } catch (error) {
      console.error('Error uploading pharmacy report', error);
      toast.error('No se pudo cargar el reporte de farmacia');
    } finally {
      setUploadingPharmacy(false);
      setPendingUploadFile(null);
    }
  };

  const patientDirectory = useMemo(() => {
    const map = new Map<string, Patient>();
    [...patients, ...extraPatients].forEach(p => map.set(p.id, p));
    return map;
  }, [patients, extraPatients]);

  const arrivedAppointments = useMemo(() => {
    const arrivedStatuses = new Set(['paid_checked_in', 'resident_intake', 'in_progress', 'completed']);
    return appointments.filter(a => arrivedStatuses.has(a.status));
  }, [appointments]);

  const arrivedPatients = useMemo(() => {
    return arrivedAppointments.map(appt => {
      const patient = patientDirectory.get(appt.patientId);
      return {
        appointment: appt,
        patient
      };
    });
  }, [arrivedAppointments, patientDirectory]);

  const medicineIndex = useMemo(() => {
    const map = new Map<string, MedicineCatalogItem>();
    [...inventoryMeds, ...externalMeds].forEach(med => {
      const key = normalizeText(med.name);
      if (key) map.set(key, med);
    });
    return map;
  }, [inventoryMeds, externalMeds]);

  const prescriptionItems = useMemo(() => {
    const items: Array<PrescriptionItem & { doctorId?: string; doctorName?: string; activeIngredient?: string; provider?: string; consultationDate?: number }> = [];
    consultations.forEach(c => {
      (c.prescription || []).forEach(item => {
        const key = normalizeText(item.name || '');
        const medInfo = medicineIndex.get(key);
        items.push({
          ...item,
          doctorId: c.doctorId,
          doctorName: c.doctorName,
          activeIngredient: medInfo?.activeIngredient,
          provider: medInfo?.provider,
          consultationDate: c.date
        });
      });
    });
    return items;
  }, [consultations, medicineIndex]);

  const missingAppointments = useMemo(() => {
    return arrivedAppointments.filter(appt => {
      const apptDate = appointmentToDate(appt.date);
      if (!apptDate) return false;
      const apptDateStr = apptDate.toDateString();
      const hasConsultation = consultations.some(c =>
        c.patientId === appt.patientId &&
        new Date(c.date).toDateString() === apptDateStr
      );
      return !hasConsultation;
    });
  }, [arrivedAppointments, consultations]);

  const pharmacyFillRate = useMemo(() => {
    return calculatePharmacyFillRate(consultations, inventoryWithStock);
  }, [consultations, inventoryWithStock]);

  const kpis = useMemo(() => {
    const totalConsultations = consultations.length;
    const totalAppointments = appointments.length;
    const totalArrived = arrivedAppointments.length;
    const noShows = appointments.filter(a => a.status === 'no_show').length;
    const totalPrescriptionItems = prescriptionItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const newConsultations = consultations.filter(c => c.consultationType === 'Nueva' && (c.status === 'finished' || c.status === 'delivered')).length;
    const reConsultations = consultations.filter(c => c.consultationType === 'Reconsulta' && (c.status === 'finished' || c.status === 'delivered')).length;
    return {
      totalConsultations,
      totalAppointments,
      totalArrived,
      noShows,
      totalPrescriptionItems,
      newConsultations,
      reConsultations,
      missingAppointments
    };
  }, [consultations, appointments, arrivedAppointments, prescriptionItems, missingAppointments]);

  const unfinishedConsultationsList = useMemo(() => {
    return consultations.filter(c => c.status !== 'finished' && c.status !== 'delivered');
  }, [consultations]);

  const doctorsNotPrescribingList = useMemo(() => {
    return consultations.filter(c => 
      (c.status === 'finished' || c.status === 'delivered') && 
      (!c.prescription || c.prescription.length === 0)
    );
  }, [consultations]);

  const noPrescriptionReasonsSummary = useMemo(() => {
    const map = new Map<string, number>();
    doctorsNotPrescribingList.forEach(c => {
      const reason = c.noPrescriptionReasonCategory || 'Sin clasificar';
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }, [doctorsNotPrescribingList]);

  const matrixByWeek = useMemo(() => {
    const map = new Map<string, {
      week: string;
      total: number;
      critical: number;
      alert: number;
      patients: Patient[];
      consultations: Consultation[];
      appointments: Appointment[];
    }>();

    // Group Patients
    patients.forEach(p => {
      const createdAt = p.createdAt?.toDate ? p.createdAt.toDate() : p.createdAt ? new Date(p.createdAt) : null;
      if (!createdAt) return;
      const key = getIsoWeekKey(createdAt);
      const missing = getMissingFields(p);
      const critical = missing.length >= 5;
      const alert = missing.length >= 3 && missing.length < 5;

      const current = map.get(key) || {
        week: key, total: 0, critical: 0, alert: 0,
        patients: [], consultations: [], appointments: []
      };
      current.total += 1;
      if (critical) current.critical += 1;
      if (alert) current.alert += 1;
      current.patients.push(p);
      map.set(key, current);
    });

    // Group Consultations
    consultations.forEach(c => {
      const date = new Date(c.date);
      const key = getIsoWeekKey(date);
      const current = map.get(key) || {
        week: key, total: 0, critical: 0, alert: 0,
        patients: [], consultations: [], appointments: []
      };
      current.consultations.push(c);
      map.set(key, current);
    });

    // Group Appointments
    appointments.forEach(a => {
      const date = appointmentToDate(a.date);
      if (!date) return;
      const key = getIsoWeekKey(date);
      const current = map.get(key) || {
        week: key, total: 0, critical: 0, alert: 0,
        patients: [], consultations: [], appointments: []
      };
      current.appointments.push(a);
      map.set(key, current);
    });

    return Array.from(map.values()).sort((a, b) => b.week.localeCompare(a.week));
  }, [patients, consultations, appointments]);

  const selectedMatrixWeekData = useMemo(() => {
    if (!selectedMatrixWeek) return null;
    return matrixByWeek.find(w => w.week === selectedMatrixWeek);
  }, [matrixByWeek, selectedMatrixWeek]);

  const secretaryByPathology = useMemo(() => {
    const map = new Map<string, { count: number; newPatients: number; reconsultations: number }>();
    consultations.forEach(c => {
      const key = (c.diagnosis || c.reasonForConsultation || 'Sin diagnóstico').trim() || 'Sin diagnóstico';
      const current = map.get(key) || { count: 0, newPatients: 0, reconsultations: 0 };
      current.count += 1;
      if (c.consultationType === 'Nueva') current.newPatients += 1;
      else current.reconsultations += 1;
      map.set(key, current);
    });
    return Array.from(map.entries()).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.count - a.count);
  }, [consultations]);

  const consultationBySpecialty = useMemo(() => {
    const map = new Map<string, { specialty: string; newCount: number; reCount: number }>();
    consultations.forEach(c => {
      const specialty = (c.doctorSpecialty || c.reasonForConsultation || 'Sin especialidad').trim() || 'Sin especialidad';
      const current = map.get(specialty) || { specialty, newCount: 0, reCount: 0 };
      if (c.consultationType === 'Nueva') current.newCount += 1;
      else current.reCount += 1;
      map.set(specialty, current);
    });
    return Array.from(map.values()).sort((a, b) => (b.newCount + b.reCount) - (a.newCount + a.reCount));
  }, [consultations]);

  const medicineStats = useMemo(() => {
    const totalItems = prescriptionItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const externalItems = prescriptionItems.filter(i => i.isExternal).reduce((acc, item) => acc + (item.quantity || 1), 0);
    const internalItems = totalItems - externalItems;

    const moleculeMap = new Map<string, number>();
    const medMap = new Map<string, number>();
    const internalMedMap = new Map<string, number>();
    const externalMedMap = new Map<string, number>();
    const providerMap = new Map<string, number>();
    const doctorMap = new Map<string, number>();

    prescriptionItems.forEach(item => {
      const qty = item.quantity || 1;
      const nameKey = item.name || 'Sin nombre';
      medMap.set(nameKey, (medMap.get(nameKey) || 0) + qty);

      if (item.isExternal) {
        externalMedMap.set(nameKey, (externalMedMap.get(nameKey) || 0) + qty);
      } else {
        internalMedMap.set(nameKey, (internalMedMap.get(nameKey) || 0) + qty);
      }

      const moleculeKey = item.activeIngredient || 'No identificado';
      moleculeMap.set(moleculeKey, (moleculeMap.get(moleculeKey) || 0) + qty);

      const providerKey = item.provider || (item.isExternal ? 'Proveedor externo' : 'Inventario Humana');
      providerMap.set(providerKey, (providerMap.get(providerKey) || 0) + qty);

      const doctorKey = item.doctorName || 'Sin médico';
      doctorMap.set(doctorKey, (doctorMap.get(doctorKey) || 0) + qty);
    });

    const toSorted = (map: Map<string, number>) =>
      Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return {
      totalItems,
      externalItems,
      internalItems,
      molecules: toSorted(moleculeMap),
      medicines: toSorted(medMap),
      internalMedicines: toSorted(internalMedMap),
      externalMedicines: toSorted(externalMedMap),
      providers: toSorted(providerMap),
      doctors: toSorted(doctorMap)
    };
  }, [prescriptionItems]);

  // --- CALCULATION FOR SELECTED MEDICATION MODAL ---
  const selectedMedicationModalData = useMemo(() => {
    if (!selectedMedicationForModal) return [];
    
    const matched = prescriptionItems.filter(p => 
      p.name === selectedMedicationForModal.name && 
      p.isExternal === selectedMedicationForModal.isExternal
    );
    
    const docMap = new Map<string, number>();
    matched.forEach(item => {
      const docName = item.doctorName || 'Desconocido';
      docMap.set(docName, (docMap.get(docName) || 0) + 1); // Count incidences, not pill quantity
    });
    
    return Array.from(docMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selectedMedicationForModal, prescriptionItems]);

  // --- DIAGNOSIS GROUPING FOR OVERVIEW TABLE ---
  // (Old keyword-based categorizeDiagnosis removed — replaced by the new helper
  // from utils/diagnosisCategorization.ts which is imported above. Keeping the
  // diagnosisTable logic but computing categories with the new system.)

  const diagnosisTable = useMemo(() => {
    let CATEGORIES: string[] = [];
    
    if (diagnosisGroupBy === 'specialty') {
      const specSet = new Set<string>();
      consultations.forEach(c => {
        if (c.doctorSpecialty) specSet.add(c.doctorSpecialty);
      });
      CATEGORIES = Array.from(specSet).sort();
      if (CATEGORIES.length === 0) CATEGORIES = ['Sin especialidad'];
    } else if (diagnosisGroupBy === 'doctor') {
      const docSet = new Set<string>();
      consultations.forEach(c => {
        if (c.doctorName) docSet.add(c.doctorName);
      });
      CATEGORIES = Array.from(docSet).sort();
      if (CATEGORIES.length === 0) CATEGORIES = ['Sin doctor asignado'];
    }

    const TYPES: Array<'Nueva' | 'Reconsulta'> = ['Nueva', 'Reconsulta'];
    const isDoctorMode = diagnosisGroupBy === 'doctor';

    type RowData = {
      label: string;
      category: string;
      consultationType: string;
      count: number;
      pctPharmacy: number;
      pctExams: number;
      pctReferral: number;
      totalMeds: number;
      internalMeds: number;
      pctInternal: number;
    };

    const rows: RowData[] = [];

    for (const cat of CATEGORIES) {
      for (const tipo of TYPES) {
        const matching = consultations.filter(c => {
          if (c.consultationType !== tipo) return false;
          
          if (diagnosisGroupBy === 'specialty') {
            return (c.doctorSpecialty || 'Sin especialidad') === cat;
          } else {
            return (c.doctorName || 'Sin doctor asignado') === cat;
          }
        });
        
        const count = matching.length;
        if (count === 0) {
          rows.push({
            label: `${tipo === 'Nueva' ? 'Primera consulta' : 'Reconsulta'} ${cat}`,
            category: cat,
            consultationType: tipo,
            count: 0,
            pctPharmacy: 0,
            pctExams: 0,
            pctReferral: 0,
            totalMeds: 0,
            internalMeds: 0,
            pctInternal: 0
          });
          continue;
        }

        // % Farmacia = has at least 1 non-external prescription item
        const withPharmacy = matching.filter(c =>
          (c.prescription || []).some(p => !p.isExternal)
        ).length;

        // % Exámenes = has referralGroups with content
        const withExams = matching.filter(c =>
          (c.referralGroups || []).length > 0
        ).length;

        // % Referencia interna = has specialtyReferrals with content
        const withReferral = matching.filter(c =>
          (c.specialtyReferrals || []).length > 0
        ).length;

        // Medication counts (only meaningful in doctor mode)
        let totalMeds = 0;
        let internalMeds = 0;
        if (isDoctorMode) {
          matching.forEach(c => {
            (c.prescription || []).forEach(p => {
              totalMeds += 1;
              if (!p.isExternal) internalMeds += 1;
            });
          });
        }
        const pctInternal = totalMeds > 0 ? Math.round((internalMeds / totalMeds) * 100) : 0;

        rows.push({
          label: `${tipo === 'Nueva' ? 'Primera consulta' : 'Reconsulta'} ${cat}`,
          category: cat,
          consultationType: tipo,
          count,
          pctPharmacy: Math.round((withPharmacy / count) * 100),
          pctExams: Math.round((withExams / count) * 100),
          pctReferral: Math.round((withReferral / count) * 100),
          totalMeds,
          internalMeds,
          pctInternal
        });
      }
    }

    // Totals
    const totalCount = rows.reduce((acc, r) => acc + r.count, 0);
    const totalWithPharmacy = consultations.filter(c =>
      (c.prescription || []).some(p => !p.isExternal)
    ).length;
    const totalWithExams = consultations.filter(c =>
      (c.referralGroups || []).length > 0
    ).length;
    const totalWithReferral = consultations.filter(c =>
      (c.specialtyReferrals || []).length > 0
    ).length;

    const totalMedsAll = rows.reduce((acc, r) => acc + r.totalMeds, 0);
    const internalMedsAll = rows.reduce((acc, r) => acc + r.internalMeds, 0);
    const pctInternalAll = totalMedsAll > 0 ? Math.round((internalMedsAll / totalMedsAll) * 100) : 0;

    return {
      rows,
      totals: {
        count: totalCount,
        pctPharmacy: totalCount > 0 ? Math.round((totalWithPharmacy / totalCount) * 100) : 0,
        pctExams: totalCount > 0 ? Math.round((totalWithExams / totalCount) * 100) : 0,
        pctReferral: totalCount > 0 ? Math.round((totalWithReferral / totalCount) * 100) : 0,
        totalMeds: totalMedsAll,
        internalMeds: internalMedsAll,
        pctInternal: pctInternalAll
      }
    };
  }, [consultations, diagnosisGroupBy]);

  // --- CLINIC CAPACITY USAGE ---
  // Helper to get array of dates between start and end
  const getDatesInRange = (start: Date, end: Date) => {
    const dates: Date[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    while (cursor <= endDay) {
      dates.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const toDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const clinicCapacity = useMemo(() => {
    const dates = getDatesInRange(range.start, range.end);
    let contractedMinutes = 0;

    // Create a fast lookup map for explicit schedules: schedulesMap[doctorId][dateKey]
    const schedulesMap: Record<string, Record<string, DoctorDaySchedule>> = {};
    doctorSchedules.forEach(ds => {
      if (!schedulesMap[ds.doctorId]) schedulesMap[ds.doctorId] = {};
      schedulesMap[ds.doctorId][ds.date] = ds;
    });

    doctors.forEach(doc => {
      dates.forEach(d => {
        const dateKey = toDateKey(d);
        const override = schedulesMap[doc.uid]?.[dateKey];

        if (override) {
          if (override.mode === 'available' && override.startTime && override.endTime) {
            const [sh, sm] = override.startTime.split(':').map(Number);
            const [eh, em] = override.endTime.split(':').map(Number);
            const minutes = (eh * 60 + em) - (sh * 60 + sm);
            if (minutes > 0) contractedMinutes += minutes;
          }
        } else if (doc.weeklySchedule) {
          const jsDay = d.getDay(); // 0 = Sunday, 6 = Saturday
          const wsRule = doc.weeklySchedule[jsDay];
          if (wsRule && wsRule.mode === 'available' && wsRule.startTime && wsRule.endTime) {
            const [sh, sm] = wsRule.startTime.split(':').map(Number);
            const [eh, em] = wsRule.endTime.split(':').map(Number);
            const minutes = (eh * 60 + em) - (sh * 60 + sm);
            if (minutes > 0) contractedMinutes += minutes;
          }
        }
      });
    });

    // Attended minutes: fixed standard per consultation
    const attendedMinutes = consultations.reduce((acc, c) => {
      return acc + (c.consultationType === 'Nueva' ? 60 : 30);
    }, 0);

    const percentage = contractedMinutes > 0 ? (attendedMinutes / contractedMinutes) * 100 : 0;

    return {
      contractedHours: (contractedMinutes / 60),
      attendedHours: (attendedMinutes / 60),
      percentage: Math.min(percentage, 100)
    };
  }, [doctors, doctorSchedules, consultations, range]);

  // --- CAPACITY BY DOCTOR ---
  const capacityByDoctor = useMemo(() => {
    const dates = getDatesInRange(range.start, range.end);
    type DoctorCapacity = { name: string; uid: string; specialty: string; contractedMin: number; attendedMin: number; newCount: number; reCount: number };
    
    const docStats = new Map<string, DoctorCapacity>();

    const schedulesMap: Record<string, Record<string, DoctorDaySchedule>> = {};
    doctorSchedules.forEach(ds => {
      if (!schedulesMap[ds.doctorId]) schedulesMap[ds.doctorId] = {};
      schedulesMap[ds.doctorId][ds.date] = ds;
    });

    doctors.forEach(doc => {
      let docContractedMin = 0;
      
      dates.forEach(d => {
        const dateKey = toDateKey(d);
        const override = schedulesMap[doc.uid]?.[dateKey];

        if (override) {
          if (override.mode === 'available' && override.startTime && override.endTime) {
            const [sh, sm] = override.startTime.split(':').map(Number);
            const [eh, em] = override.endTime.split(':').map(Number);
            const minutes = (eh * 60 + em) - (sh * 60 + sm);
            if (minutes > 0) docContractedMin += minutes;
          }
        } else if (doc.weeklySchedule) {
          const jsDay = d.getDay();
          const wsRule = doc.weeklySchedule[jsDay];
          if (wsRule && wsRule.mode === 'available' && wsRule.startTime && wsRule.endTime) {
            const [sh, sm] = wsRule.startTime.split(':').map(Number);
            const [eh, em] = wsRule.endTime.split(':').map(Number);
            const minutes = (eh * 60 + em) - (sh * 60 + sm);
            if (minutes > 0) docContractedMin += minutes;
          }
        }
      });

      docStats.set(doc.uid, {
        name: doc.name || doc.uid,
        uid: doc.uid,
        specialty: doc.specialty || doc.specialties?.[0] || 'Sin especialidad',
        contractedMin: docContractedMin,
        attendedMin: 0,
        newCount: 0,
        reCount: 0
      });
    });

    consultations.forEach(c => {
      if (!c.doctorId) return;
      let stats = docStats.get(c.doctorId);
      if (!stats) {
        stats = {
          name: c.doctorName || c.doctorId,
          uid: c.doctorId,
          specialty: c.doctorSpecialty || 'Sin especialidad',
          contractedMin: 0,
          attendedMin: 0,
          newCount: 0,
          reCount: 0
        };
        docStats.set(c.doctorId, stats);
      }
      const min = c.consultationType === 'Nueva' ? 60 : 30;
      stats.attendedMin += min;
      if (c.consultationType === 'Nueva') stats.newCount++;
      else stats.reCount++;
    });

    return Array.from(docStats.values())
      .filter(d => d.contractedMin > 0 || d.attendedMin > 0)
      .sort((a, b) => b.attendedMin - a.attendedMin);
  }, [doctors, doctorSchedules, consultations, range]);

  // --- PHARMACY UTILIZATION BY DOCTOR ---
  const pharmacyUtilizationByDoctor = useMemo(() => {
    type PharmacyStats = { name: string; uid: string; newCount: number; newWithPharmacy: number; reCount: number; reWithPharmacy: number };
    const docStats = new Map<string, PharmacyStats>();

    doctors.forEach(doc => {
      docStats.set(doc.uid, {
        name: doc.name || doc.uid,
        uid: doc.uid,
        newCount: 0,
        newWithPharmacy: 0,
        reCount: 0,
        reWithPharmacy: 0
      });
    });

    consultations.forEach(c => {
      if (!c.doctorId || (c.status !== 'finished' && c.status !== 'delivered')) return;
      let stats = docStats.get(c.doctorId);
      if (!stats) {
        stats = {
          name: c.doctorName || c.doctorId,
          uid: c.doctorId,
          newCount: 0,
          newWithPharmacy: 0,
          reCount: 0,
          reWithPharmacy: 0
        };
        docStats.set(c.doctorId, stats);
      }

      const hasPharmacy = (c.prescription || []).some(p => !p.isExternal);
      
      if (c.consultationType === 'Nueva') {
        stats.newCount++;
        if (hasPharmacy) stats.newWithPharmacy++;
      } else if (c.consultationType === 'Reconsulta') {
        stats.reCount++;
        if (hasPharmacy) stats.reWithPharmacy++;
      }
    });

    return Array.from(docStats.values())
      .filter(d => capacityByDoctor.some(c => c.uid === d.uid))
      .sort((a, b) => {
        const ca = capacityByDoctor.find(c => c.uid === a.uid);
        const cb = capacityByDoctor.find(c => c.uid === b.uid);
        return (cb?.attendedMin || 0) - (ca?.attendedMin || 0);
      });
  }, [doctors, consultations, capacityByDoctor]);

  // Compute diagnosis category for each doctor based on their first non-empty diagnosis
  useEffect(() => {
    const computeDoctorCategories = async () => {
      const map = new Map<string, CategorizationResult>();
      for (const doc of capacityByDoctor) {
        const docCons = consultations.filter(c => c.doctorName === doc.name);
        for (const c of docCons) {
          if (c.diagnosis && c.diagnosis.trim()) {
            const cat = await categorizeDiagnosis(c.diagnosis, pathologies);
            map.set(doc.name, cat);
            break;
          }
        }
      }
      setDoctorDiagnosisCategories(map);
    };
    if (capacityByDoctor.length > 0 && pathologies.length > 0) {
      computeDoctorCategories();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacityByDoctor, pathologies, consultations.length]);

  // --- QUALITY DATA WITH SEVERITY ---
  const qualityData = useMemo(() => {
    const items = arrivedPatients.map(({ appointment, patient }) => {
      const missing = patient ? getMissingFields(patient) : ['Sin datos de paciente'];
      const severity: 'critical' | 'alert' | 'ok' = missing.length >= 3 ? 'critical' : missing.length >= 1 ? 'alert' : 'ok';
      const age = patient?.age ?? getAgeFromBirthDate(patient?.birthDate);
      const dpi = age !== undefined && age < 18 ? '000' : (patient?.dpi || '—');
      const registeredBy = patient?.creatorName || patient?.createdByEmail || '—';
      return { appointment, patient, missing, severity, age, dpi, registeredBy };
    });

    const critical = items.filter(i => i.severity === 'critical').length;
    const alert = items.filter(i => i.severity === 'alert').length;
    const ok = items.filter(i => i.severity === 'ok').length;

    // Unique operators list
    const operators = Array.from(new Set(items.map(i => i.registeredBy).filter(r => r !== '—'))).sort();

    // Apply both filters
    let filtered = qualitySeverityFilter === 'all' ? items : items.filter(i => i.severity === qualitySeverityFilter);
    if (qualityOperatorFilter) {
      filtered = filtered.filter(i => i.registeredBy === qualityOperatorFilter);
    }

    return { items: filtered, allItems: items, critical, alert, ok, total: items.length, operators };
  }, [arrivedPatients, qualitySeverityFilter, qualityOperatorFilter]);

  // --- FILTERED MEDICINE STATS BY DOCTOR/SPECIALTY/MOLECULE ---
  const filteredPrescriptionItems = useMemo(() => {
    let items = prescriptionItems;
    if (medFilterDoctor) {
      items = items.filter(p => p.doctorId === medFilterDoctor);
    }
    if (medFilterSpecialty) {
      const doctorIdsInSpecialty = doctors
        .filter(d => (d.specialty === medFilterSpecialty) || (d.specialties || []).includes(medFilterSpecialty))
        .map(d => d.uid);
      items = items.filter(p => p.doctorId && doctorIdsInSpecialty.includes(p.doctorId));
    }
    if (medFilterMolecule) {
      items = items.filter(p => p.activeIngredient === medFilterMolecule);
    }
    return items;
  }, [prescriptionItems, medFilterDoctor, medFilterSpecialty, medFilterMolecule, doctors]);

  // --- MOLECULE OVERLAP REACTIVO A FILTROS ---
  useEffect(() => {
    if (allCatalogMeds.length === 0) return;
    setMoleculeOverlap(findMoleculeOverlapsFromPrescriptions(filteredPrescriptionItems, allCatalogMeds));
  }, [filteredPrescriptionItems, allCatalogMeds]);

  // --- NORMALIZATION MAP ---
  const normMap = useMemo(() => buildNormalizationMap(normRules), [normRules]);
  const activeIngredientMap = useMemo(() => buildActiveIngredientMap(normRules), [normRules]);

  // --- CALCULATION FOR MOLECULE BRANDS MODAL ---
  const selectedMoleculeBrands = useMemo(() => {
    if (!selectedMoleculeForModal) return { internal: [] as Array<{name: string; count: number; providers: string[]}>, external: [] as Array<{name: string; count: number; providers: string[]}>, total: 0 };

    const matched = filteredPrescriptionItems.filter(item => {
      const key = normalizeText(item.name || '');
      const ai = activeIngredientMap.get(key) || item.activeIngredient;
      return ai === selectedMoleculeForModal;
    });

    const internalMap = new Map<string, { name: string; count: number; providers: Set<string> }>();
    const externalMap = new Map<string, { name: string; count: number; providers: Set<string> }>();

    matched.forEach(item => {
      const name = item.name || 'Sin marca';
      const target = item.isExternal ? externalMap : internalMap;
      const current = target.get(name) || { name, count: 0, providers: new Set<string>() };
      current.count += 1;
      if (item.provider) current.providers.add(item.provider);
      target.set(name, current);
    });

    const sortBrands = (map: Map<string, { name: string; count: number; providers: Set<string> }>) =>
      Array.from(map.values())
        .map(b => ({ name: b.name, count: b.count, providers: Array.from(b.providers) }))
        .sort((a, b) => b.count - a.count);

    return {
      internal: sortBrands(internalMap),
      external: sortBrands(externalMap),
      total: matched.length
    };
  }, [selectedMoleculeForModal, filteredPrescriptionItems, activeIngredientMap]);

  const filteredMedicineStats = useMemo(() => {
    const medMap = new Map<string, number>();
    const internalMedMap = new Map<string, number>();
    const externalMedMap = new Map<string, number>();
    const moleculeMap = new Map<string, number>();
    const providerMap = new Map<string, number>();
    const doctorMap = new Map<string, number>();
    let externalItems = 0;
    let internalItems = 0;

    filteredPrescriptionItems.forEach(item => {
      // Apply normalization to the medicine name
      const rawName = item.name || 'Sin nombre';
      const name = normalizeWithMap(rawName, normMap);
      medMap.set(name, (medMap.get(name) || 0) + 1);

      if (item.isExternal) {
        externalItems++;
        externalMedMap.set(name, (externalMedMap.get(name) || 0) + 1);
      } else {
        internalItems++;
        internalMedMap.set(name, (internalMedMap.get(name) || 0) + 1);
      }

      const aiMolecule = activeIngredientMap.get(name) || item.activeIngredient;
      if (aiMolecule) {
        moleculeMap.set(aiMolecule, (moleculeMap.get(aiMolecule) || 0) + 1);
      }
      if (item.provider) {
        providerMap.set(item.provider, (providerMap.get(item.provider) || 0) + 1);
      }
      if (item.doctorName) {
        doctorMap.set(item.doctorName, (doctorMap.get(item.doctorName) || 0) + 1);
      }
    });

    const toSorted = (map: Map<string, number>) =>
      Array.from(map.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    return {
      totalItems: filteredPrescriptionItems.length,
      externalItems,
      internalItems,
      molecules: toSorted(moleculeMap),
      medicines: toSorted(medMap),
      internalMedicines: toSorted(internalMedMap),
      externalMedicines: toSorted(externalMedMap),
      providers: toSorted(providerMap),
      doctors: toSorted(doctorMap)
    };
  }, [filteredPrescriptionItems, normMap]);

  // --- DUPLICATE DETECTION ---
  const duplicateClusters = useMemo(() => {
    // Use raw (un-normalized) medicine stats for detection
    const rawMedMap = new Map<string, number>();
    filteredPrescriptionItems.forEach(item => {
      const name = item.name || 'Sin nombre';
      rawMedMap.set(name, (rawMedMap.get(name) || 0) + 1);
    });
    const medNames = Array.from(rawMedMap.entries()).map(([name, count]) => ({ name, count }));
    return detectDuplicateClusters(medNames, normRules);
  }, [filteredPrescriptionItems, normRules]);

  // Specialties list for filter dropdown
  const specialtiesList = useMemo(() => {
    const set = new Set<string>();
    doctors.forEach(d => {
      if (d.specialty) set.add(d.specialty);
      (d.specialties || []).forEach(s => set.add(s));
    });
    return Array.from(set).sort();
  }, [doctors]);

  const moleculesList = useMemo(() => {
    const set = new Set<string>();
    prescriptionItems.forEach(item => {
      const key = normalizeText(item.name || '');
      const ai = activeIngredientMap.get(key) || item.activeIngredient;
      if (ai) set.add(ai);
    });
    return Array.from(set).sort();
  }, [prescriptionItems, activeIngredientMap]);

  const selectedDoctor = useMemo(() => doctors.find(d => d.uid === selectedDoctorId), [doctors, selectedDoctorId]);

  const doctorStats = useMemo(() => {
    const doctorConsultations = consultations.filter(c => c.doctorId === selectedDoctorId);
    const doctorAppointments = appointments.filter(a => a.doctorId === selectedDoctorId);
    const totalConsultations = doctorConsultations.length;
    const newConsultations = doctorConsultations.filter(c => c.consultationType === 'Nueva').length;
    const reConsultations = doctorConsultations.filter(c => c.consultationType === 'Reconsulta').length;

    const weeklyMinutes = new Map<string, { minutes: number; appointments: Appointment[] }>();
    doctorAppointments.forEach(appt => {
      const start = appointmentToDate(appt.date);
      if (!start) return;
      const weekKey = getIsoWeekKey(start);
      const minutes = getAppointmentDurationMinutes(appt);
      const current = weeklyMinutes.get(weekKey) || { minutes: 0, appointments: [] };
      current.minutes += minutes;
      current.appointments.push(appt);
      weeklyMinutes.set(weekKey, current);
    });
    const totalWeeks = weeklyMinutes.size || 1;
    const avgWeeklyMinutes = Array.from(weeklyMinutes.values()).reduce((acc, val) => acc + val.minutes, 0) / totalWeeks;
    const avgWeeklyHours = avgWeeklyMinutes / 60;

    // --- Contracted hours (from schedule for this doctor) ---
    const selectedDoc = doctors.find(d => d.uid === selectedDoctorId);
    const dates = getDatesInRange(range.start, range.end);
    const docSchedulesMap: Record<string, DoctorDaySchedule> = {};
    doctorSchedules.forEach(ds => {
      if (ds.doctorId === selectedDoctorId) docSchedulesMap[ds.date] = ds;
    });
    let contractedMinutes = 0;
    dates.forEach(d => {
      const dateKey = toDateKey(d);
      const override = docSchedulesMap[dateKey];
      if (override) {
        if (override.mode === 'available' && override.startTime && override.endTime) {
          const [sh, sm] = override.startTime.split(':').map(Number);
          const [eh, em] = override.endTime.split(':').map(Number);
          const min = (eh * 60 + em) - (sh * 60 + sm);
          if (min > 0) contractedMinutes += min;
        }
      } else if (selectedDoc?.weeklySchedule) {
        const jsDay = d.getDay();
        const wsRule = selectedDoc.weeklySchedule[jsDay];
        if (wsRule && wsRule.mode === 'available' && wsRule.startTime && wsRule.endTime) {
          const [sh, sm] = wsRule.startTime.split(':').map(Number);
          const [eh, em] = wsRule.endTime.split(':').map(Number);
          const min = (eh * 60 + em) - (sh * 60 + sm);
          if (min > 0) contractedMinutes += min;
        }
      }
    });
    const attendedHours = Array.from(weeklyMinutes.values()).reduce((acc, val) => acc + val.minutes, 0) / 60;
    const contractedHours = contractedMinutes / 60;
    const utilizationPct = contractedHours > 0 ? Math.min((attendedHours / contractedHours) * 100, 100) : 0;

    const doctorPrescriptionItems = prescriptionItems.filter(i => i.doctorId === selectedDoctorId);
    const medMap = new Map<string, number>();
    doctorPrescriptionItems.forEach(item => {
      const qty = item.quantity || 1;
      medMap.set(item.name, (medMap.get(item.name) || 0) + qty);
    });
    const sortedMeds = Array.from(medMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    const externalCount = doctorPrescriptionItems.filter(i => i.isExternal).length;
    const internalCount = doctorPrescriptionItems.filter(i => !i.isExternal).length;
    const totalPrescriptionCount = externalCount + internalCount;
    const inventoryPct = totalPrescriptionCount > 0 ? (internalCount / totalPrescriptionCount) * 100 : 0;
    const externalPct = totalPrescriptionCount > 0 ? (externalCount / totalPrescriptionCount) * 100 : 0;

    return {
      totalConsultations,
      newConsultations,
      reConsultations,
      avgWeeklyMinutes,
      avgWeeklyHours,
      attendedHours,
      contractedHours,
      utilizationPct,
      weeklyStats: Array.from(weeklyMinutes.entries()).map(([week, data]) => ({ week, ...data })).sort((a, b) => b.week.localeCompare(a.week)),
      topMeds: sortedMeds.slice(0, 5),
      leastMeds: sortedMeds.slice(-5).reverse(),
      externalCount,
      internalCount,
      totalPrescriptionCount,
      inventoryPct,
      externalPct
    };
  }, [appointments, consultations, prescriptionItems, selectedDoctorId, doctors, doctorSchedules, range]);

  const selectedDoctorWeekData = useMemo(() => {
    if (!selectedDoctorWeek) return null;
    return doctorStats.weeklyStats.find(w => w.week === selectedDoctorWeek);
  }, [doctorStats.weeklyStats, selectedDoctorWeek]);

  const selectedMedicineStats = useMemo(() => {
    if (!selectedMedicineName) return null;
    const items = prescriptionItems.filter(i => {
      const rawName = i.name || 'Sin nombre';
      const normalized = normalizeWithMap(rawName, normMap);
      return normalized === selectedMedicineName;
    });
    const doctorMap = new Map<string, number>();
    const patientMap = new Map<string, number>();

    items.forEach(item => {
      const qty = item.quantity || 1;
      doctorMap.set(item.doctorName || 'Sin médico', (doctorMap.get(item.doctorName || 'Sin médico') || 0) + qty);
      // Note: We don't have patient name directly in prescriptionItems but we can get it from consultation if needed
      // but for now let's just use count of prescriptions
    });

    return {
      totalQty: items.reduce((acc, i) => acc + (i.quantity || 1), 0),
      prescriptionsCount: items.length,
      topDoctors: Array.from(doctorMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5)
    };
  }, [prescriptionItems, selectedMedicineName, normMap]);

  const pharmacyPrescriptionItems = useMemo(() => {
    const items: Array<PrescriptionItem & { doctorId?: string; doctorName?: string; activeIngredient?: string; provider?: string }> = [];
    pharmacyConsultations.forEach(c => {
      (c.prescription || []).forEach(item => {
        const key = normalizeText(item.name || '');
        const medInfo = medicineIndex.get(key);
        items.push({
          ...item,
          doctorId: c.doctorId,
          doctorName: c.doctorName,
          activeIngredient: medInfo?.activeIngredient,
          provider: medInfo?.provider
        });
      });
    });
    return items;
  }, [pharmacyConsultations, medicineIndex]);

  const pharmacyMatch: PharmacyMatchResult = useMemo(() => {
    if (!pharmacyRows.length) {
      return {
        totalSalesItems: 0,
        totalPrescriptionItems: 0,
        internalPrescriptionItems: 0,
        matchRate: 0,
        matched: [],
        soldOnly: [],
        prescribedOnly: [],
        totalDiscounts: 0,
        discountAmount: 0,
        patientBreakdown: [],
        completePrescriptionsCount: 0,
        completePrescriptionsRate: 0,
        prescriptionsWithInternalMeds: 0,
        totalConsultationsWithPrescription: 0,
        externalSalesDetected: [],
      };
    }
    return performPharmacyMatch(pharmacyRows, pharmacyConsultations, medicineIndex);
  }, [pharmacyRows, pharmacyConsultations, medicineIndex]);

  const handleExportQuality = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Calidad Citas', { views: [{ showGridLines: false }] });
    sheet.columns = [{ width: 4 }, { width: 24 }, { width: 22 }, { width: 20 }, { width: 22 }, { width: 18 }];

    addWorkbookTitle(sheet, 'REPORTE DE CALIDAD: PACIENTES LLEGADOS A CITA', `Rango: ${startDate} a ${endDate}`);
    sheet.getRow(5).values = ['PACIENTE', 'DPI', 'EDAD', 'MÉDICO', 'ESTADO CITA'];
    applyHeaderStyle(sheet.getRow(5), 'FF0EA5E9');

    let rowIndex = 6;
    arrivedPatients.forEach(({ appointment, patient }) => {
      const age = patient?.age ?? getAgeFromBirthDate(patient?.birthDate);
      const maskedDpi = age !== undefined && age < 18 ? '000' : (patient?.dpi || '—');
      sheet.getRow(rowIndex).values = [
        appointment.patientName || patient?.fullName || 'Sin nombre',
        maskedDpi,
        age ?? '—',
        appointment.doctorName || '—',
        appointment.status
      ];
      rowIndex++;
    });

    await downloadWorkbook(workbook, `Reporte_Calidad_${startDate}_${endDate}.xlsx`);
  };

  const handleExportMatrix = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resumen Semanal', { views: [{ showGridLines: false }] });
    sheet.columns = [
      { width: 15 }, // Semana
      { width: 18 }, // Casos Ingresados
      { width: 15 }, // Críticos
      { width: 15 }, // Alertas
      { width: 22 }, // Consultas Atendidas
      { width: 22 }  // Citas Agendadas
    ];

    addWorkbookTitle(sheet, 'MATRIZ DE CASOS POR SEMANA ISO', `Rango: ${startDate} a ${endDate}`);

    // KPIs en la parte superior
    sheet.getRow(4).values = ['RESUMEN DEL PERIODO'];
    sheet.getRow(4).font = { bold: true, size: 12 };
    sheet.getRow(5).values = ['Total Casos', 'Total Críticos', 'Total Alertas', 'Total Consultas'];
    sheet.getRow(6).values = [
      matrixByWeek.reduce((acc, w) => acc + w.total, 0),
      matrixByWeek.reduce((acc, w) => acc + w.critical, 0),
      matrixByWeek.reduce((acc, w) => acc + w.alert, 0),
      matrixByWeek.reduce((acc, w) => acc + w.consultations.length, 0)
    ];
    applyHeaderStyle(sheet.getRow(5), 'FF1D4ED8');

    // Tabla principal
    const headerRow = 8;
    sheet.getRow(headerRow).values = ['Semana ISO', 'Pacientes Reg.', 'Críticos', 'Alertas', 'Consultas Atend.', 'Citas Agendadas'];
    applyHeaderStyle(sheet.getRow(headerRow), 'FF1D4ED8');

    let rowIndex = headerRow + 1;
    matrixByWeek.forEach(week => {
      sheet.getRow(rowIndex).values = [
        week.week,
        week.total,
        week.critical,
        week.alert,
        week.consultations.length,
        week.appointments.length
      ];
      // Estilo condicional para críticos
      if (week.critical > 0) {
        sheet.getCell(`C${rowIndex}`).font = { color: { argb: 'FFFF0000' }, bold: true };
      }
      rowIndex++;
    });

    // Pestaña de DETALLE DE PACIENTES
    const detailSheet = workbook.addWorksheet('Detalle de Pacientes');
    detailSheet.columns = [
      { width: 15 }, // Semana
      { width: 35 }, // Paciente
      { width: 15 }, // DPI
      { width: 20 }, // Estado Calidad
      { width: 30 }  // Campos Faltantes
    ];
    detailSheet.getRow(1).values = ['DETALLE DE PACIENTES POR SEMANA'];
    detailSheet.getRow(1).font = { bold: true, size: 14 };
    detailSheet.getRow(3).values = ['Semana', 'Paciente', 'DPI', 'Estado', 'Campos Faltantes'];
    applyHeaderStyle(detailSheet.getRow(3), 'FF1D4ED8');

    let detailIdx = 4;
    matrixByWeek.forEach(week => {
      week.patients.forEach(p => {
        const missing = getMissingFields(p);
        const isMinor = p.birthDate ? (new Date().getFullYear() - new Date(p.birthDate).getFullYear() < 18) : false;
        detailSheet.getRow(detailIdx).values = [
          week.week,
          p.fullName,
          isMinor ? '000' : (p.dpi || '—'),
          missing.length >= 5 ? 'CRÍTICO' : missing.length >= 3 ? 'ALERTA' : 'OK',
          missing.join(', ')
        ];
        if (missing.length >= 5) detailSheet.getCell(`D${detailIdx}`).font = { color: { argb: 'FFFF0000' }, bold: true };
        detailIdx++;
      });
    });

    await downloadWorkbook(workbook, `Matriz_ISO_Detallada_${startDate}_${endDate}.xlsx`);
  };

  const handleExportSecretary = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resumen Secretaría', { views: [{ showGridLines: false }] });
    sheet.columns = [
      { width: 35 }, // Especialidad / Patología
      { width: 18 }, // Nuevos
      { width: 18 }, // Reconsultas
      { width: 15 }  // Total
    ];

    addWorkbookTitle(sheet, 'REPORTE DE SECRETARÍA Y PATOLOGÍAS', `Rango: ${startDate} a ${endDate}`);

    // KPIs Superiores
    sheet.getRow(4).values = ['RESUMEN DE CONSULTAS'];
    sheet.getRow(4).font = { bold: true, size: 12 };
    sheet.getRow(5).values = ['Categoría', 'Cantidad', 'Porcentaje'];
    const totalConsults = kpis.totalConsultations || 1;
    sheet.getRow(6).values = ['Consultas Nuevas', kpis.newConsultations, `${((kpis.newConsultations / totalConsults) * 100).toFixed(1)}%`];
    sheet.getRow(7).values = ['Reconsultas', kpis.reConsultations, `${((kpis.reConsultations / totalConsults) * 100).toFixed(1)}%`];
    applyHeaderStyle(sheet.getRow(5), 'FF0F766E');

    // Tabla de Especialidades
    let rowIndex = 9;
    sheet.getRow(rowIndex).values = ['Especialidad Médica', 'Nuevas', 'Reconsultas', 'Total'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF0F766E');
    rowIndex++;

    consultationBySpecialty.forEach(item => {
      sheet.getRow(rowIndex).values = [item.specialty, item.newCount, item.reCount, item.newCount + item.reCount];
      rowIndex++;
    });

    // Tabla de Patologías con desglose
    rowIndex += 2;
    sheet.getRow(rowIndex).values = ['Patología / Diagnóstico Detallado', 'Pacientes Nuevos', 'Reconsultas', 'Total Casos'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF7C3AED');
    rowIndex++;

    secretaryByPathology.slice(0, 50).forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.newPatients, item.reconsultations, item.count];
      rowIndex++;
    });

    // Pestaña de DETALLE DE CONSULTAS
    const consultSheet = workbook.addWorksheet('Detalle de Consultas');
    consultSheet.columns = [
      { width: 15 }, { width: 30 }, { width: 15 }, { width: 25 }, { width: 40 }
    ];
    consultSheet.getRow(1).values = ['LISTADO COMPLETO DE CONSULTAS'];
    consultSheet.getRow(3).values = ['Fecha', 'Paciente', 'Tipo', 'Especialidad', 'Diagnóstico'];
    applyHeaderStyle(consultSheet.getRow(3), 'FF0F766E');

    let cIdx = 4;
    consultations.forEach(c => {
      consultSheet.getRow(cIdx).values = [
        new Date(c.date).toLocaleDateString(),
        c.patientName,
        c.consultationType,
        c.doctorSpecialty || '—',
        c.diagnosis || c.reasonForConsultation || '—'
      ];
      cIdx++;
    });

    await downloadWorkbook(workbook, `Reporte_Secretaria_Completo_${startDate}_${endDate}.xlsx`);
  };

  const handleExportMedicines = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resumen Medicamentos', { views: [{ showGridLines: false }] });
    sheet.columns = [{ width: 35 }, { width: 18 }];

    addWorkbookTitle(sheet, 'INCIDENCIA DE MEDICAMENTOS', `Rango: ${startDate} a ${endDate}`);

    // Si hay un medicamento seleccionado, añadir detalle al inicio
    if (selectedMedicineName && selectedMedicineStats) {
      sheet.getRow(4).values = [`DETALLE ESPECÍFICO: ${selectedMedicineName}`];
      sheet.getRow(4).font = { bold: true, size: 12 };
      sheet.getRow(5).values = ['Indicador', 'Valor'];
      applyHeaderStyle(sheet.getRow(5), 'FF9333EA');
      sheet.getRow(6).values = ['Cantidad Total Unidades', selectedMedicineStats.totalQty];
      sheet.getRow(7).values = ['Número de Recetas', selectedMedicineStats.prescriptionsCount];

      let drIdx = 9;
      sheet.getRow(drIdx).values = ['Top Médicos que lo recetan', 'Cantidad'];
      applyHeaderStyle(sheet.getRow(drIdx), 'FF9333EA');
      drIdx++;
      selectedMedicineStats.topDoctors.forEach(d => {
        sheet.getRow(drIdx).values = [d.name, d.count];
        drIdx++;
      });
      sheet.getRow(drIdx + 1).values = ['—'.repeat(20)];
    }

    // Listas Globales
    const startRow = selectedMedicineName ? sheet.lastRow!.number + 3 : 5;
    let rowIndex = startRow;

    sheet.getRow(rowIndex).values = ['TOP PRODUCTOS INTERNOS (INVENTARIO)', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF9333EA');
    rowIndex++;
    medicineStats.internalMedicines.slice(0, 50).forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.count];
      rowIndex++;
    });

    rowIndex += 2;
    sheet.getRow(rowIndex).values = ['TOP PRODUCTOS EXTERNOS', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FFEF4444');
    rowIndex++;
    medicineStats.externalMedicines.slice(0, 50).forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.count];
      rowIndex++;
    });

    rowIndex += 2;
    sheet.getRow(rowIndex).values = ['DISTRIBUCIÓN POR MOLÉCULA', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF2563EB');
    rowIndex++;
    medicineStats.molecules.slice(0, 30).forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.count];
      rowIndex++;
    });

    rowIndex += 2;
    sheet.getRow(rowIndex).values = ['RANKING DE MÉDICOS (PRESCRIPCIÓN)', 'Items Recetados'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FFD97706');
    rowIndex++;
    medicineStats.doctors.slice(0, 30).forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.count];
      rowIndex++;
    });

    await downloadWorkbook(workbook, `Reporte_Medicamentos_${startDate}_${endDate}.xlsx`);
  };

  const handleExportDoctor = async () => {
    if (!selectedDoctor) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Resumen Médico', { views: [{ showGridLines: false }] });
    sheet.columns = [
      { width: 30 }, // Indicador / Semana
      { width: 18 }, // Valor / Citas
      { width: 18 }  // Horas
    ];

    addWorkbookTitle(sheet, `REPORTE MÉDICO: ${selectedDoctor.name}`, `Rango: ${startDate} a ${endDate}`);

    sheet.getRow(4).values = ['RESUMEN GENERAL'];
    sheet.getRow(4).font = { bold: true, size: 12 };
    sheet.getRow(5).values = ['Indicador', 'Valor', ''];
    applyHeaderStyle(sheet.getRow(5), 'FF0F172A');

    sheet.getRow(6).values = ['Consultas totales', doctorStats.totalConsultations, ''];
    sheet.getRow(7).values = ['Consultas nuevas', doctorStats.newConsultations, ''];
    sheet.getRow(8).values = ['Reconsultas', doctorStats.reConsultations, ''];
    sheet.getRow(9).values = ['Promedio semanal (horas)', doctorStats.avgWeeklyHours.toFixed(1), ''];
    sheet.getRow(10).values = ['Total horas estimadas', (doctorStats.weeklyStats.reduce((acc, s) => acc + s.minutes, 0) / 60).toFixed(1), 'h'];

    // Pestaña de DETALLE DE CITAS DIARIAS
    const apptSheet = workbook.addWorksheet('Detalle de Citas');
    apptSheet.columns = [
      { width: 15 }, { width: 15 }, { width: 35 }, { width: 15 }, { width: 15 }
    ];
    apptSheet.getRow(1).values = [`CITAS ATENDIDAS POR ${selectedDoctor.name}`];
    apptSheet.getRow(3).values = ['Semana', 'Fecha/Día', 'Paciente', 'Tipo', 'Duración'];
    applyHeaderStyle(apptSheet.getRow(3), 'FF2563EB');

    let aIdx = 4;
    doctorStats.weeklyStats.forEach(week => {
      week.appointments.forEach(appt => {
        const date = appointmentToDate(appt.date);
        apptSheet.getRow(aIdx).values = [
          week.week,
          date ? date.toLocaleDateString('es-GT', { weekday: 'short', day: '2-digit', month: 'short' }) : '—',
          appt.patientName,
          appt.consultationType,
          `${getAppointmentDurationMinutes(appt)} min`
        ];
        aIdx++;
      });
    });

    // Pestaña de MEDICAMENTOS DEL DOCTOR
    const medSheet = workbook.addWorksheet('Medicamentos del Doctor');
    medSheet.columns = [{ width: 35 }, { width: 18 }];
    medSheet.getRow(1).values = [`MEDICAMENTOS RECETADOS POR ${selectedDoctor.name}`];

    medSheet.getRow(3).values = ['Medicamentos más recetados', 'Cantidad'];
    applyHeaderStyle(medSheet.getRow(3), 'FF22C55E');
    let mIdx = 4;
    doctorStats.topMeds.forEach(item => {
      medSheet.getRow(mIdx).values = [item.name, item.count];
      mIdx++;
    });

    mIdx += 2;
    medSheet.getRow(mIdx).values = ['Medicamentos menos recetados', 'Cantidad'];
    applyHeaderStyle(medSheet.getRow(mIdx), 'FFEF4444');
    mIdx++;
    doctorStats.leastMeds.forEach(item => {
      medSheet.getRow(mIdx).values = [item.name, item.count];
      mIdx++;
    });

    await downloadWorkbook(workbook, `Reporte_Medico_Detallado_${selectedDoctor.name}.xlsx`);
  };

  const handleExportPharmacy = async () => {
    const selected = pharmacyReports.find(r => r.id === selectedReportId);
    if (!selected) return;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Match Farmacia', { views: [{ showGridLines: false }] });
    sheet.columns = [{ width: 32 }, { width: 32 }, { width: 18 }, { width: 18 }, { width: 18 }];

    addWorkbookTitle(sheet, 'MATCH FARMACIA VS RECETAS', `Rango: ${pharmacyDateStart} a ${pharmacyDateEnd}`);
    sheet.getRow(5).values = ['Indicador', 'Valor'];
    applyHeaderStyle(sheet.getRow(5), 'FF0F766E');
    sheet.getRow(6).values = ['Ventas FAR (items vendidos)', pharmacyMatch.totalSalesItems];
    sheet.getRow(7).values = ['Recetas FAR (items internos recetados)', pharmacyMatch.internalPrescriptionItems];
    sheet.getRow(8).values = ['% Items Vendidos (vendidos/recetados)', `${(pharmacyMatch.matchRate * 100).toFixed(1)}%`];
    sheet.getRow(9).values = ['Consultas c/ Receta FAR', pharmacyMatch.totalConsultationsWithPrescription];
    sheet.getRow(10).values = ['Consultas Completas (100% surtidas)', `${pharmacyMatch.completePrescriptionsCount} de ${pharmacyMatch.totalConsultationsWithPrescription} (${(pharmacyMatch.completePrescriptionsRate * 100).toFixed(1)}%)`];
    sheet.getRow(11).values = ['Recetas c/ Meds Internos (consultas)', pharmacyMatch.prescriptionsWithInternalMeds];

    // Detail table: prescriptions by patient with completeness status (only internal items)
    let rowIndex = 13;
    sheet.getRow(rowIndex).values = ['PACIENTE', 'MEDICAMENTO', 'Vendidos', 'Recetados', 'Estado'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF2563EB');
    rowIndex++;

    // Group matched items by patient+doctor+date to determine completeness (only internal)
    const consultationsByPatientDate = new Map<string, { items: typeof pharmacyMatch.matched; complete: boolean }>();
    pharmacyMatch.matched.forEach(m => {
      const dateKey = m.dateMs || 0;
      const cKey = `${normalizeText(m.patientName)}|${normalizeText(m.doctorName || '')}|${dateKey}`;
      if (!consultationsByPatientDate.has(cKey)) {
        consultationsByPatientDate.set(cKey, { items: [], complete: false });
      }
      consultationsByPatientDate.get(cKey)!.items.push(m);
    });
    consultationsByPatientDate.forEach(entry => {
      const allFullySold = entry.items.every(m => m.soldQuantity >= m.prescribedQuantity);
      entry.complete = allFullySold;
    });

    pharmacyMatch.matched.forEach(m => {
      const dateKey = m.dateMs || 0;
      const cKey = `${normalizeText(m.patientName)}|${normalizeText(m.doctorName || '')}|${dateKey}`;
      const c = consultationsByPatientDate.get(cKey);
      const status = c?.complete ? 'COMPLETA' : 'INCOMPLETA';
      sheet.getRow(rowIndex).values = [m.patientName, m.productName, m.soldQuantity, m.prescribedQuantity, status];
      const row = sheet.getRow(rowIndex);
      row.getCell(5).font = { bold: true, color: { argb: c?.complete ? 'FF059669' : 'FFDC2626' } };
      rowIndex++;
    });

    // Revisar — external sales detected
    if (pharmacyMatch.externalSalesDetected.length > 0) {
      rowIndex += 2;
      sheet.getRow(rowIndex).values = ['FECHA', 'PACIENTE', 'PRODUCTO', 'CÓDIGO', 'CANT.', 'MOTIVO'];
      applyHeaderStyle(sheet.getRow(rowIndex), 'FFD97706');
      rowIndex++;
      pharmacyMatch.externalSalesDetected.forEach(flag => {
        sheet.getRow(rowIndex).values = [
          flag.dateMs ? formatDate(flag.dateMs) : '—',
          flag.patientName,
          flag.productName,
          flag.productCode,
          flag.soldQuantity,
          flag.reason === 'not-in-catalog' ? 'NO EN CATÁLOGO' : 'MARCADO EXTERNO',
        ];
        rowIndex++;
      });
    }

    // Unsold items (fuga)
    if (pharmacyMatch.prescribedOnly.length > 0) {
      rowIndex += 2;
      sheet.getRow(rowIndex).values = ['PACIENTE', 'MEDICAMENTO', 'Recetados', 'Doctor', 'Estado'];
      applyHeaderStyle(sheet.getRow(rowIndex), 'FFDC2626');
      rowIndex++;
      pharmacyMatch.prescribedOnly.forEach(item => {
        sheet.getRow(rowIndex).values = [item.patientName, item.productName, item.prescribedQuantity, item.doctorName || '', 'SIN VENTA'];
        sheet.getRow(rowIndex).getCell(5).font = { bold: true, color: { argb: 'FFDC2626' } };
        rowIndex++;
      });
    }

    // Sold without prescription
    if (pharmacyMatch.soldOnly.length > 0) {
      rowIndex += 2;
      sheet.getRow(rowIndex).values = ['PACIENTE', 'MEDICAMENTO', 'Vendidos', 'Vendedor', 'Estado'];
      applyHeaderStyle(sheet.getRow(rowIndex), 'FF059669');
      rowIndex++;
      pharmacyMatch.soldOnly.forEach(item => {
        sheet.getRow(rowIndex).values = [item.patientName, item.productName, item.soldQuantity, item.sellerName || '', 'SIN RECETA'];
        sheet.getRow(rowIndex).getCell(5).font = { bold: true, color: { argb: 'FF059669' } };
        rowIndex++;
      });
    }

    await downloadWorkbook(workbook, `Match_Farmacia_Completo_${selected.fileName}.xlsx`);
  };

  const setPreset = (preset: 'week' | 'month' | 'year' | 'iso') => {
    const today = new Date();
    if (preset === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      setStartDate(start.toLocaleDateString('en-CA'));
      setEndDate(today.toLocaleDateString('en-CA'));
      return;
    }
    if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(start.toLocaleDateString('en-CA'));
      setEndDate(end.toLocaleDateString('en-CA'));
      return;
    }
    if (preset === 'year') {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      setStartDate(start.toLocaleDateString('en-CA'));
      setEndDate(end.toLocaleDateString('en-CA'));
      return;
    }
    const isoStart = getIsoWeekStart(today);
    const isoEnd = new Date(isoStart);
    isoEnd.setDate(isoStart.getDate() + 6);
    setStartDate(isoStart.toLocaleDateString('en-CA'));
    setEndDate(isoEnd.toLocaleDateString('en-CA'));
  };

  const tabList = [
    { id: 'overview', label: 'Resumen', icon: BarChart3 },
    { id: 'clinics', label: 'Clínicas', icon: Building2 },
    { id: 'quality', label: 'Calidad', icon: ShieldCheck },
    { id: 'medicines', label: 'Medicamentos', icon: Pill },
    { id: 'doctors', label: 'Médicos', icon: Stethoscope },
    { id: 'pharmacy', label: 'Farmacia', icon: FileSpreadsheet }
  ] as const;

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-brand-600" /> Dashboard de Reportes
          </h2>
          <p className="text-base text-slate-500 mt-1">Analítica integral y exportación de reportes en Excel</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setPreset('iso')} className="px-3 py-2 text-base font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Semana ISO</button>
          <button onClick={() => setPreset('week')} className="px-3 py-2 text-base font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Últimos 7 días</button>
          <button onClick={() => setPreset('month')} className="px-3 py-2 text-base font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Mes</button>
          <button onClick={() => setPreset('year')} className="px-3 py-2 text-base font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Año</button>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-base font-bold text-slate-600 bg-transparent outline-none" />
            <span className="text-slate-400 text-base">a</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-base font-bold text-slate-600 bg-transparent outline-none" />
          </div>
          <button onClick={refreshData} className="p-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 shadow">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide snap-x">
        <div className="flex gap-2 min-w-max">
          {tabList.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-base font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* NOTA EXPLICATIVA PARA ADMINISTRADORES */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3 items-start">
            <div className="w-5 h-5 mt-0.5 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">i</div>
            <div className="text-base text-blue-800 leading-relaxed">
              <p className="font-bold mb-1">¿Cómo leer estos números?</p>
              <p>
                <span className="font-semibold">Total Consultas</span> = suma de pacientes <span className="font-semibold">Nuevos + Reconsultas</span> con expediente cerrado.<br />
                <span className="font-semibold">Citas Llegadas</span> = número físico de pacientes que pasaron a clínica (check-in / pagado).
              </p>
            </div>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Total Consultas — CARD PRINCIPAL */}
            <motion.div 
              className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden hover:shadow-2xl transition-all"
            >
              <div 
                className="cursor-pointer group flex justify-between items-start"
                onClick={() => setShowSpecialtyModal('total')}
              >
                <div>
                  <p className="text-base uppercase tracking-widest text-brand-100 font-bold">Total Consultas</p>
                  <h3 className="text-4xl font-bold mt-2 group-hover:scale-105 transition-transform origin-left">{formatNumber(kpis.totalConsultations)}</h3>
                </div>
                <div className="bg-white/10 p-2 rounded-xl group-hover:bg-white/20 transition-colors">
                  <Activity className="w-5 h-5 text-white" />
                </div>
              </div>
              
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/20 pt-4">
                <div 
                  className="cursor-pointer group/new bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors"
                  onClick={() => setShowSpecialtyModal('new')}
                >
                  <p className="text-sm text-brand-200 uppercase tracking-wider font-bold">Nuevas</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xl font-bold text-white">{formatNumber(kpis.newConsultations)}</p>
                    <ChevronRight className="w-4 h-4 text-brand-300 group-hover/new:text-white group-hover/new:translate-x-1 transition-all" />
                  </div>
                </div>
                
                <div 
                  className="cursor-pointer group/re bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors"
                  onClick={() => setShowSpecialtyModal('re')}
                >
                  <p className="text-sm text-brand-200 uppercase tracking-wider font-bold">Reconsultas</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xl font-bold text-white">{formatNumber(kpis.reConsultations)}</p>
                    <ChevronRight className="w-4 h-4 text-brand-300 group-hover/re:text-white group-hover/re:translate-x-1 transition-all" />
                  </div>
                </div>

                <div 
                  className="cursor-pointer group/unf bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-colors"
                  onClick={() => setShowUnfinishedConsultationsModal(true)}
                >
                  <p className="text-sm text-brand-200 uppercase tracking-wider font-bold">No final.</p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xl font-bold text-white">{formatNumber(unfinishedConsultationsList.length)}</p>
                    <ChevronRight className="w-4 h-4 text-brand-300 group-hover/unf:text-white group-hover/unf:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center text-sm text-brand-100 font-bold gap-1">
                <span className="text-white opacity-80">Haz clic en cualquier número para ver desglose por especialidad</span>
              </div>
            </motion.div>

            {/* 2. Unfinished Consultations */}
            <motion.div 
              className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden hover:shadow-2xl transition-all"
            >
              <div 
                className="cursor-pointer group flex justify-between items-start"
                onClick={() => setShowUnfinishedConsultationsModal(true)}
              >
                <div>
                  <p className="text-base tracking-widest text-amber-100 font-bold">Consultas no Finalizadas</p>
                  <h3 className="text-4xl font-bold mt-2 group-hover:scale-105 transition-transform origin-left">{formatNumber(unfinishedConsultationsList.length)}</h3>
                </div>
                <div className="bg-white/10 p-2 rounded-xl group-hover:bg-white/20 transition-colors">
                  <AlertCircle className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-amber-100 font-bold gap-1 pt-4 border-t border-white/20">
                <span className="text-white opacity-80">Haz clic para ver el detalle de pacientes y estatus</span>
              </div>
            </motion.div>

            {/* 3. Doctors Not Prescribing */}
            <motion.div 
              className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden hover:shadow-2xl transition-all"
            >
              <div 
                className="cursor-pointer group flex justify-between items-start"
                onClick={() => setShowDoctorsNotPrescribingModal(true)}
              >
                <div>
                  <p className="text-base uppercase tracking-widest text-indigo-100 font-bold">Sin Receta</p>
                  <h3 className="text-4xl font-bold mt-2 group-hover:scale-105 transition-transform origin-left">{formatNumber(doctorsNotPrescribingList.length)}</h3>
                </div>
                <div className="bg-white/10 p-2 rounded-xl group-hover:bg-white/20 transition-colors">
                  <Stethoscope className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="mt-4 flex items-center text-sm text-indigo-100 font-bold gap-1 pt-4 border-t border-white/20">
                <span className="text-white opacity-80">Haz clic para ver los motivos de no prescripción</span>
              </div>
            </motion.div>
          </div>

          {/* TABLA DE DIAGNÓSTICOS AGRUPADOS */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b flex flex-col md:flex-row md:items-center justify-between bg-slate-50/60 gap-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Resumen General por Tipo de Consulta</h3>
                <p className="text-sm text-slate-400 mt-0.5">Distribución de prescripciones y exámenes según el factor de agrupación</p>
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-slate-500 font-medium">Agrupar por:</span>
                <select
                  value={diagnosisGroupBy}
                  onChange={(e) => setDiagnosisGroupBy(e.target.value as any)}
                  className="bg-white border border-slate-200 text-base rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium text-slate-700 shadow-sm transition-all"
                >
                  <option value="specialty">Especialidad</option>
                  <option value="doctor">Profesional (Doctor)</option>
                </select>
                <span className="text-base font-bold text-brand-600 border-l border-slate-200 pl-3">{diagnosisTable.totals.count} consultas</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest" rowSpan={2}>Tipo de Consulta</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-center" rowSpan={2}>Nº Pacientes</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-center border-l border-slate-200" colSpan={3}>% de Receta</th>
                    {diagnosisGroupBy === 'doctor' && (
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-center border-l border-slate-200" colSpan={2}>Medicamentos</th>
                    )}
                  </tr>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <th className="p-3 text-sm text-slate-500 uppercase font-bold tracking-widest text-center border-l border-slate-200">Con Receta Farma.</th>
                    <th className="p-3 text-sm text-slate-500 uppercase font-bold tracking-widest text-center">Exámenes Dx</th>
                    <th className="p-3 text-sm text-slate-500 uppercase font-bold tracking-widest text-center">Ref. Interna</th>
                    {diagnosisGroupBy === 'doctor' && (
                      <>
                        <th className="p-3 text-sm text-slate-500 uppercase font-bold tracking-widest text-center border-l border-slate-200">Total Medicamentos Recetados</th>
                        <th className="p-3 text-sm text-slate-500 uppercase font-bold tracking-widest text-center">% Meds Internos</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {diagnosisTable.rows.map(row => (
                    <tr key={row.label} className={`hover:bg-slate-50 transition-colors ${row.count === 0 ? 'opacity-40' : ''}`}>
                      <td className="p-4 font-semibold text-slate-700">{row.label}</td>
                      <td className="p-4 text-center font-bold text-slate-800">{row.count}</td>
                      <td className="p-4 text-center border-l border-slate-100">
                        {row.count > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${row.pctPharmacy > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
                            {row.pctPharmacy}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-4 text-center">
                        {row.count > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${row.pctExams > 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
                            {row.pctExams}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-4 text-center">
                        {row.count > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${row.pctReferral > 0 ? 'bg-violet-50 text-violet-700' : 'text-slate-400'}`}>
                            {row.pctReferral}%
                          </span>
                        ) : '—'}
                      </td>
                      {diagnosisGroupBy === 'doctor' && (
                        <>
                          <td className="p-4 text-center border-l border-slate-100 font-bold text-slate-800">
                            {row.totalMeds > 0 ? row.totalMeds : '—'}
                          </td>
                          <td className="p-4 text-center">
                            {row.totalMeds > 0 ? (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${row.pctInternal > 0 ? 'bg-amber-50 text-amber-700' : 'text-slate-400'}`}>
                                {row.pctInternal}%
                              </span>
                            ) : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                  <tr className="font-bold">
                    <td className="p-4 text-slate-800">Total</td>
                    <td className="p-4 text-center text-slate-800">{diagnosisTable.totals.count}</td>
                    <td className="p-4 text-center border-l border-slate-200 text-emerald-700">{diagnosisTable.totals.pctPharmacy}%</td>
                    <td className="p-4 text-center text-blue-700">{diagnosisTable.totals.pctExams}%</td>
                    <td className="p-4 text-center text-violet-700">{diagnosisTable.totals.pctReferral}%</td>
                    {diagnosisGroupBy === 'doctor' && (
                      <>
                        <td className="p-4 text-center border-l border-slate-200 text-slate-800">{diagnosisTable.totals.totalMeds}</td>
                        <td className="p-4 text-center text-amber-700">{diagnosisTable.totals.pctInternal}%</td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'clinics' && (
        <div className="space-y-6">
          {/* HEADER */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-500" /> Capacidad Clínica por Especialidad
              </h3>
              <p className="text-base text-slate-500">Horas trabajadas vs horas contratadas en el periodo seleccionado</p>
            </div>
          </div>

          {/* NOTA EXPLICATIVA */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3 items-start">
            <div className="w-5 h-5 mt-0.5 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">i</div>
            <div className="text-base text-blue-800 leading-relaxed">
              <p className="font-bold mb-1">¿Cómo se calculan las horas?</p>
              <p>
                <span className="font-semibold">Horas Contratadas</span> = horas programadas de cada profesional según su horario semanal configurado, multiplicadas por los días del periodo seleccionado.<br />
                <span className="font-semibold">Horas Trabajadas</span> = tiempo estimado de atención en consulta para todas las citas registradas en el periodo.<br />
                <span className="font-semibold">% Utilización</span> = Horas Trabajadas ÷ Horas Contratadas × 100.
              </p>
            </div>
          </div>

          {/* KPI RESUMEN GLOBAL */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Contratadas</p>
              <h4 className="text-4xl font-bold text-slate-800 mt-2">{clinicCapacity.contractedHours.toFixed(1)}h</h4>
              <p className="text-sm text-slate-400 mt-1">Horas programadas en el periodo</p>
            </motion.div>
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <p className="text-sm font-bold text-blue-400 uppercase tracking-widest">Total Trabajadas</p>
              <h4 className="text-4xl font-bold text-blue-600 mt-2">{clinicCapacity.attendedHours.toFixed(1)}h</h4>
              <p className="text-sm text-slate-400 mt-1">Horas de consulta estimadas</p>
            </motion.div>
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Utilización Global</p>
              <h4 className={`text-4xl font-bold mt-2 ${clinicCapacity.percentage >= 80 ? 'text-emerald-600' : clinicCapacity.percentage >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                {clinicCapacity.percentage.toFixed(1)}%
              </h4>
              <div className="mt-3 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(clinicCapacity.percentage, 100)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full ${clinicCapacity.percentage >= 80 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : clinicCapacity.percentage >= 50 ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-red-500 to-red-400'}`}
                />
              </div>
            </motion.div>
          </div>

          {clinicCapacity.contractedHours === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-sm text-amber-800 font-semibold">No se encontraron horarios semanales configurados para los profesionales. Suba el Excel de horarios en la sección de Administración para calcular las horas contratadas.</p>
            </div>
          )}

          {/* TABLA DESGLOSE POR PROFESIONAL */}
            {capacityByDoctor.length > 0 && (
              <>
              {(() => {
                const subtypes = getRecentSubtypes();
                if (subtypes.length === 0) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                    <p className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                      <Wand2 className="w-4 h-4" /> Subtipos descubiertos por Gemini
                    </p>
                    <p className="text-xs text-amber-700 mb-2">
                      Cuando Gemini clasifica un diagnóstico como "Otro", sugiere un subtipo. Estos se acumulan aquí para que la lista de "Otro" se haga más específica con el tiempo.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {subtypes.slice(0, 15).map(s => (
                        <span key={s.subtype} className="text-xs px-2.5 py-1 rounded-full bg-white border border-amber-200 text-amber-800 font-semibold">
                          {s.subtype} <span className="text-amber-500 font-normal">({s.occurrences})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b bg-slate-50/60">
                <h3 className="font-bold text-slate-800 text-base">Desglose por Profesional</h3>
                <p className="text-sm text-slate-400 mt-0.5">Métricas de horas trabajadas vs contratadas por médico</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-slate-100 text-sm text-slate-500 uppercase font-bold tracking-widest">
                    <tr>
                      <th className="p-3 pl-5">Profesional</th>
                      <th className="p-3">Categoría</th>
                      <th className="p-3 text-right">Consultas Nuevas</th>
                      <th className="p-3 text-right">Reconsultas</th>
                      <th className="p-3 text-right">Horas Contratadas</th>
                      <th className="p-3 text-right">Horas Trabajadas</th>
                      <th className="p-3 text-right pr-5">% Utilización</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {capacityByDoctor.map(doc => {
                      const docPct = doc.contractedMin > 0 ? Math.min((doc.attendedMin / doc.contractedMin) * 100, 100) : 0;
                      return (
                        <tr key={doc.uid} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 pl-5 font-bold text-slate-800">{doc.name}</td>
                           <td className="p-3 text-slate-500">
                             {(() => {
                               const cat = doctorDiagnosisCategories.get(doc.name);
                               if (!cat) return <span className="italic text-slate-300">Calculando...</span>;
                               return (
                                 <button
                                   type="button"
                                   onClick={() => setDiagnosisDetailModal({ open: true, doctorName: doc.name, category: cat })}
                                   className="inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors group"
                                 >
                                   {cat.kind === 'predefined' ? (
                                     <span className="text-sm font-bold text-blue-700 group-hover:text-blue-800">{cat.category}</span>
                                   ) : (
                                     <>
                                       <span className="text-xs font-bold text-slate-500 group-hover:text-amber-700">Otro</span>
                                       <span className="text-xs italic text-slate-400 group-hover:text-amber-600">({cat.subtype})</span>
                                     </>
                                   )}
                                 </button>
                               );
                             })()}
                           </td>
                          <td className="p-3 text-right text-emerald-600 font-semibold">{doc.newCount}</td>
                          <td className="p-3 text-right text-blue-600 font-semibold">{doc.reCount}</td>
                          <td className="p-3 text-right text-slate-600">{(doc.contractedMin / 60).toFixed(1)}h</td>
                          <td className="p-3 text-right font-bold text-blue-600">{(doc.attendedMin / 60).toFixed(1)}h</td>
                          <td className="p-3 text-right pr-5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${docPct >= 80 ? 'bg-emerald-50 text-emerald-700' : docPct >= 50 ? 'bg-amber-50 text-amber-700' : doc.contractedMin > 0 ? 'bg-red-50 text-red-700' : 'text-slate-400'}`}>
                              {doc.contractedMin > 0 ? `${docPct.toFixed(1)}%` : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                    <tr className="font-bold">
                      <td className="p-3 pl-5 text-slate-800" colSpan={2}>Total General</td>
                      <td className="p-3 text-right text-emerald-700">{capacityByDoctor.reduce((acc, d) => acc + d.newCount, 0)}</td>
                      <td className="p-3 text-right text-blue-700">{capacityByDoctor.reduce((acc, d) => acc + d.reCount, 0)}</td>
                      <td className="p-3 text-right text-slate-700">{clinicCapacity.contractedHours.toFixed(1)}h</td>
                      <td className="p-3 text-right text-blue-700">{clinicCapacity.attendedHours.toFixed(1)}h</td>
                      <td className="p-3 text-right pr-5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${clinicCapacity.percentage >= 80 ? 'bg-emerald-50 text-emerald-700' : clinicCapacity.percentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                          {clinicCapacity.percentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            </>
          )}

          {/* TABLA: DESEMPEÑO DE FARMACIA POR PROFESIONAL */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden mt-6">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-brand-50/30">
              <div>
                <h3 className="text-base font-bold text-slate-800">Desempeño de Farmacia por Profesional</h3>
                <p className="text-sm text-slate-500 mt-1">Porcentaje de recetas emitidas utilizando medicamentos del inventario interno</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-sm text-slate-500 font-bold uppercase tracking-widest border-r border-slate-200">Profesional</th>
                    <th className="p-4 text-sm text-slate-500 font-bold uppercase tracking-widest text-center" colSpan={2}>Nuevas Consultas</th>
                    <th className="p-4 text-sm text-slate-500 font-bold uppercase tracking-widest text-center border-l border-slate-200" colSpan={2}>Reconsultas</th>
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 border-r border-slate-200"></th>
                    <th className="p-3 text-sm text-slate-500 font-bold uppercase tracking-widest text-center">Cantidad</th>
                    <th className="p-3 text-sm text-slate-500 font-bold uppercase tracking-widest text-center">Farmacia Interna</th>
                    <th className="p-3 text-sm text-slate-500 font-bold uppercase tracking-widest text-center border-l border-slate-200">Cantidad</th>
                    <th className="p-3 text-sm text-slate-500 font-bold uppercase tracking-widest text-center">Farmacia Interna</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pharmacyUtilizationByDoctor.map((d, idx) => {
                    const newPct = d.newCount > 0 ? Math.round((d.newWithPharmacy / d.newCount) * 100) : 0;
                    const rePct = d.reCount > 0 ? Math.round((d.reWithPharmacy / d.reCount) * 100) : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 text-sm font-bold text-slate-800 border-r border-slate-100">{d.name}</td>
                        
                        <td className="p-4 text-center font-medium text-slate-600">{d.newCount}</td>
                        <td className="p-4 text-center">
                          {d.newCount > 0 ? (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold ${newPct >= 50 ? 'bg-emerald-50 text-emerald-700' : newPct > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                              {newPct}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="p-4 text-center font-medium text-slate-600 border-l border-slate-100">{d.reCount}</td>
                        <td className="p-4 text-center">
                          {d.reCount > 0 ? (
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-bold ${rePct >= 50 ? 'bg-emerald-50 text-emerald-700' : rePct > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                              {rePct}%
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {pharmacyUtilizationByDoctor.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">No hay datos de farmacia para los profesionales en este periodo</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-500" /> Control de Calidad de Datos</h3>
              <p className="text-base text-slate-500">Pacientes llegados • DPI enmascarado en menores de 18</p>
            </div>
            <div className="flex items-center gap-3">
              {qualityData.operators.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={qualityOperatorFilter}
                    onChange={e => setQualityOperatorFilter(e.target.value)}
                    className="text-sm font-bold text-slate-600 bg-transparent outline-none cursor-pointer"
                  >
                    <option value="">Todos los operadores</option>
                    {qualityData.operators.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              )}
              <button onClick={handleExportQuality} className="px-4 py-2 text-base font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          {/* KPI Severity Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button onClick={() => setQualitySeverityFilter('all')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white border-slate-200 hover:border-slate-400'}`}>
              <p className={`text-sm uppercase tracking-widest font-bold ${qualitySeverityFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>Total Perfiles Creados</p>
              <h4 className={`text-3xl font-bold mt-1 ${qualitySeverityFilter === 'all' ? 'text-white' : 'text-slate-800'}`}>{qualityData.total}</h4>
            </button>
            <button onClick={() => setQualitySeverityFilter('critical')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'critical' ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-red-50 border-red-100 hover:border-red-300'}`}>
              <p className={`text-sm uppercase tracking-widest font-bold flex items-center gap-1 ${qualitySeverityFilter === 'critical' ? 'text-red-200' : 'text-red-400'}`}><AlertTriangle className="w-3 h-3" /> Críticos</p>
              <h4 className={`text-3xl font-bold mt-1 ${qualitySeverityFilter === 'critical' ? 'text-white' : 'text-red-700'}`}>{qualityData.critical}</h4>
              <p className={`text-sm mt-1 ${qualitySeverityFilter === 'critical' ? 'text-red-200' : 'text-red-400'}`}>3+ campos faltantes</p>
            </button>
            <button onClick={() => setQualitySeverityFilter('alert')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'alert' ? 'bg-amber-500 text-white border-amber-500 shadow-lg' : 'bg-amber-50 border-amber-100 hover:border-amber-300'}`}>
              <p className={`text-sm uppercase tracking-widest font-bold ${qualitySeverityFilter === 'alert' ? 'text-amber-100' : 'text-amber-400'}`}>Alertas</p>
              <h4 className={`text-3xl font-bold mt-1 ${qualitySeverityFilter === 'alert' ? 'text-white' : 'text-amber-700'}`}>{qualityData.alert}</h4>
              <p className={`text-sm mt-1 ${qualitySeverityFilter === 'alert' ? 'text-amber-100' : 'text-amber-400'}`}>1-2 campos faltantes</p>
            </button>
            <button onClick={() => setQualitySeverityFilter('ok')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'ok' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-emerald-50 border-emerald-100 hover:border-emerald-300'}`}>
              <p className={`text-sm uppercase tracking-widest font-bold flex items-center gap-1 ${qualitySeverityFilter === 'ok' ? 'text-emerald-200' : 'text-emerald-400'}`}><CheckCircle2 className="w-3 h-3" /> Completos</p>
              <h4 className={`text-3xl font-bold mt-1 ${qualitySeverityFilter === 'ok' ? 'text-white' : 'text-emerald-700'}`}>{qualityData.ok}</h4>
              <p className={`text-sm mt-1 ${qualitySeverityFilter === 'ok' ? 'text-emerald-200' : 'text-emerald-400'}`}>0 campos faltantes</p>
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-base">
                <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest">
                  <tr>
                    <th className="p-4 w-8">Sev.</th>
                    <th className="p-4">Paciente</th>
                    <th className="p-4">DPI</th>
                    <th className="p-4">Edad</th>
                    <th className="p-4">Médico</th>
                    <th className="p-4">Registrado por</th>
                    <th className="p-4">Campos Faltantes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qualityData.items.length === 0 ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-400">No hay datos para este filtro</td></tr>
                  ) : qualityData.items.map(({ appointment, patient, missing, severity, age, dpi, registeredBy }) => (
                    <tr key={appointment.id} className={`transition-colors ${severity === 'critical' ? 'bg-red-50/50' : severity === 'alert' ? 'bg-amber-50/30' : ''}`}>
                      <td className="p-4">
                        {severity === 'critical' && <span className="w-3 h-3 rounded-full bg-red-500 block" title="Crítico" />}
                        {severity === 'alert' && <span className="w-3 h-3 rounded-full bg-amber-400 block" title="Alerta" />}
                        {severity === 'ok' && <span className="w-3 h-3 rounded-full bg-emerald-400 block" title="Completo" />}
                      </td>
                      <td className="p-4 text-base font-semibold text-slate-800">{appointment.patientName || patient?.fullName || '—'}</td>
                      <td className="p-4 font-mono text-slate-600">{dpi}</td>
                      <td className="p-4 text-slate-600">{age ?? '—'}</td>
                      <td className="p-4 text-slate-600">{appointment.doctorName || '—'}</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-sm font-semibold">
                          {registeredBy}
                        </span>
                      </td>
                      <td className="p-4">
                        {missing.length === 0 ? (
                          <span className="text-emerald-600 text-sm font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completo</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {missing.map(f => (
                              <span key={f} className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{f}</span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MATRIZ ISO — Integrada al Control de Calidad */}
          <div className="border-t-2 border-slate-200 pt-6 mt-2">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-500" /> Matriz ISO Semanal</h3>
                <p className="text-base text-slate-500">Casos ingresados vs críticos por semana ISO</p>
              </div>
              <button onClick={handleExportMatrix} className="px-4 py-2 text-base font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-fit">
                <div className="p-4 border-b bg-slate-50 text-sm font-bold uppercase tracking-widest text-slate-500">Resumen por Semanas</div>
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                      <tr>
                        <th className="p-4">Semana</th>
                        <th className="p-4">Total</th>
                        <th className="p-4">Críticos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matrixByWeek.length === 0 ? (
                        <tr><td colSpan={3} className="p-8 text-center text-slate-400">No hay datos</td></tr>
                      ) : matrixByWeek.map(item => (
                        <tr
                          key={item.week}
                          onClick={() => setSelectedMatrixWeek(item.week)}
                          className={`text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors ${selectedMatrixWeek === item.week ? 'bg-brand-50' : ''}`}
                        >
                          <td className="p-4 text-base font-semibold text-slate-800">{item.week}</td>
                          <td className="p-4">{item.total}</td>
                          <td className="p-4 text-red-500 font-semibold">{item.critical}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-6">
                {selectedMatrixWeekData ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
                        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Pacientes</p>
                        <h4 className="text-3xl font-bold text-slate-800 mt-1">{selectedMatrixWeekData.total}</h4>
                      </div>
                      <div className="bg-red-50 p-5 rounded-3xl border border-red-100 shadow-sm">
                        <p className="text-sm font-bold text-red-400 uppercase tracking-widest">Críticos</p>
                        <h4 className="text-3xl font-bold text-red-800 mt-1">{selectedMatrixWeekData.critical}</h4>
                      </div>
                      <div className="bg-amber-50 p-5 rounded-3xl border border-amber-100 shadow-sm">
                        <p className="text-sm font-bold text-amber-400 uppercase tracking-widest">Alertas</p>
                        <h4 className="text-3xl font-bold text-amber-800 mt-1">{selectedMatrixWeekData.alert}</h4>
                      </div>
                    </div>
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b bg-slate-50 text-sm font-bold uppercase tracking-widest text-slate-500">Detalle de la Semana {selectedMatrixWeek}</div>
                      <div className="p-6 space-y-6">
                        <div>
                          <h5 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-brand-500" /> Pacientes Registrados</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedMatrixWeekData.patients.slice(0, 10).map(p => (
                              <div key={p.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                                <span className="text-base font-semibold text-slate-700 truncate mr-2">{p.fullName}</span>
                                <span className={`text-sm px-2 py-0.5 rounded-full ${getMissingFields(p).length >= 5 ? 'bg-red-100 text-red-600' : getMissingFields(p).length >= 3 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                  {getMissingFields(p).length} campos faltantes
                                </span>
                              </div>
                            ))}
                            {selectedMatrixWeekData.patients.length > 10 && (
                              <p className="text-sm text-slate-400 text-center col-span-2">Y {selectedMatrixWeekData.patients.length - 10} pacientes más...</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                          <div>
                            <h5 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /> Consultas</h5>
                            <p className="text-3xl font-bold text-slate-800">{selectedMatrixWeekData.consultations.length}</p>
                            <p className="text-sm text-slate-400 uppercase font-bold tracking-widest">Atendidas en la semana</p>
                          </div>
                          <div>
                            <h5 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-emerald-500" /> Citas Agendadas</h5>
                            <p className="text-3xl font-bold text-slate-800">{selectedMatrixWeekData.appointments.length}</p>
                            <p className="text-sm text-slate-400 uppercase font-bold tracking-widest">Total citas en agenda</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-20 text-center">
                    <Activity className="w-12 h-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 font-bold">Selecciona una semana de la lista para ver el desglose detallado</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <CleanExternalMedicines />
        </div>
      )}


      {activeTab === 'medicines' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Pill className="w-5 h-5 text-violet-500" /> Incidencia de Medicamentos</h3>
              <p className="text-base text-slate-500">Frecuencia de prescripción por molécula, proveedor y médico</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleExportMedicines} className="px-4 py-2 text-base font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          {/* ===== NORMALIZATION SECTION (FIRST) ===== */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-slate-50/60 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-violet-500" /> Normalización de Medicamentos
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">Detecta nombres duplicados y unifica conteos automáticamente</p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                <button onClick={() => setNormSubView('detect')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${normSubView === 'detect' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Unlink className="w-3 h-3 inline mr-1" /> Duplicados ({duplicateClusters.filter(c => !c.hasRule && !normIgnoredClusters.includes(c.variants.map(v => v.name).sort().join('|'))).length})
                </button>
                <button onClick={() => setNormSubView('rules')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${normSubView === 'rules' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Link2 className="w-3 h-3 inline mr-1" /> Reglas ({normRules.filter(r => r.status === 'approved').length})
                </button>
              </div>
            </div>

            {normSubView === 'detect' && (
              <div className="p-5 space-y-4">
                {duplicateClusters.filter(c => !c.hasRule && !normIgnoredClusters.includes(c.variants.map(v => v.name).sort().join('|'))).length === 0 ? (
                  <div className="text-center py-10">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-base font-bold text-slate-700">No se detectaron duplicados</p>
                    <p className="text-base text-slate-400 mt-1">Todos los nombres de medicamentos parecen ser únicos</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {duplicateClusters
                      .filter(c => !c.hasRule && !normIgnoredClusters.includes(c.variants.map(v => v.name).sort().join('|')))
                      .map((cluster, idx) => {
                        const clusterId = cluster.variants.map(v => v.name).sort().join('|');
                        const activeCanonical = normManualCanonicalMap[clusterId] || cluster.canonicalCandidate;
                        return (
                          <div key={clusterId} className="border border-amber-200 bg-amber-50/30 rounded-2xl p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  Posible duplicado ({cluster.variants.length} variantes, {cluster.totalCount} recetas)
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {cluster.variants.map(v => (
                                    <button
                                      key={v.name}
                                      onClick={() => setNormManualCanonicalMap(prev => ({ ...prev, [clusterId]: v.name }))}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold border cursor-pointer hover:shadow-sm transition ${v.name === activeCanonical ? 'bg-violet-100 text-violet-800 border-violet-300' : 'bg-white text-slate-600 border-slate-200'}`}
                                    >
                                      {v.name === activeCanonical && <Check className="w-3 h-3" />}
                                      {v.name} <span className="text-slate-400">×{v.count}</span>
                                    </button>
                                  ))}
                                </div>
                                <p className="text-sm text-slate-500 mt-2">
                                  Canónico: <strong className="text-violet-700">{activeCanonical}</strong>
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 shrink-0">
                                <button
                                  disabled={normSaving}
                                  onClick={async () => {
                                    setNormSaving(true);
                                    try {
                                      await medicineNormalizationService.approveCluster(
                                        activeCanonical,
                                        cluster.variants.map(v => v.name),
                                        'admin'
                                      );
                                      toast.success(`Normalizado: ${cluster.variants.length} variantes → "${activeCanonical}"`);
                                      await refreshNormRules();
                                    } catch (e) {
                                      console.error(e);
                                      toast.error('Error al guardar la regla');
                                    }
                                    setNormSaving(false);
                                  }}
                                  className="px-3 py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" /> Aprobar
                                </button>
                                <button
                                  disabled={normSaving}
                                  onClick={async () => {
                                    setNormSaving(true);
                                    try {
                                      await medicineNormalizationService.rejectCluster(
                                        cluster.variants.map(v => v.name),
                                        'admin'
                                      );
                                      toast.success('Duplicado descartado permanentemente');
                                      setNormIgnoredClusters(prev => [...prev, clusterId]);
                                      await refreshNormRules();
                                    } catch (e) {
                                      console.error(e);
                                      toast.error('Error al descartar');
                                    }
                                    setNormSaving(false);
                                  }}
                                  className="px-3 py-2 text-sm font-bold rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                                >
                                  <X className="w-3 h-3" /> Descartar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                    })}
                  </div>
                )}

                {/* Manual Rule */}
                <div className="border-t border-slate-200 pt-4 mt-4">
                  <p className="text-sm font-bold text-slate-600 mb-3">Agregar regla manual</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-sm text-slate-400 font-bold uppercase tracking-widest block mb-1">Nombre incorrecto</label>
                      <input value={normManualDirty} onChange={e => setNormManualDirty(e.target.value)} placeholder="ej: propanolol 40mg" className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white" />
                    </div>
                    <div className="text-slate-400 text-xl font-bold pb-1">→</div>
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-sm text-slate-400 font-bold uppercase tracking-widest block mb-1">Nombre correcto</label>
                      <input value={normManualCanonicalText} onChange={e => setNormManualCanonicalText(e.target.value)} placeholder="ej: Propranolol 40mg" className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white" />
                    </div>
                    <button
                      disabled={!normManualDirty.trim() || !normManualCanonicalText.trim() || normSaving}
                      onClick={async () => {
                        setNormSaving(true);
                        try {
                          await medicineNormalizationService.approveCluster(normManualCanonicalText.trim(), [normManualDirty.trim()], 'admin');
                          toast.success('Regla manual agregada');
                          setNormManualDirty('');
                          setNormManualCanonicalText('');
                          await refreshNormRules();
                        } catch (e) {
                          toast.error('Error al guardar');
                        }
                        setNormSaving(false);
                      }}
                      className="px-4 py-2 text-sm font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {normSubView === 'rules' && (
              <div className="p-5">
                {normRules.filter(r => r.status === 'approved').length === 0 ? (
                  <div className="text-center py-10">
                    <Link2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-base font-bold text-slate-700">No hay reglas aprobadas</p>
                    <p className="text-sm text-slate-400 mt-1">Detecta duplicados y apruébalos para crear reglas</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-base">
                      <thead className="bg-slate-100 text-sm text-slate-500 uppercase font-bold tracking-widest">
                        <tr>
                          <th className="p-3">Nombre Original</th>
                          <th className="p-3">→ Nombre Normalizado</th>
                          <th className="p-3 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {normRules.filter(r => r.status === 'approved').map(rule => (
                          <tr key={rule.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3">
                              <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-700 rounded text-sm font-bold border border-red-200 line-through">{rule.dirtyName}</span>
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-sm font-bold border border-emerald-200">{rule.canonicalName}</span>
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={async () => {
                                  try {
                                    await medicineNormalizationService.deleteRule(rule.id);
                                    toast.success('Regla eliminada');
                                    await refreshNormRules();
                                  } catch (e) {
                                    toast.error('Error al eliminar');
                                  }
                                }}
                                className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition"
                                title="Eliminar regla"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* FILTER BAR */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-base text-slate-500 font-bold">
              <Filter className="w-4 h-4" /> Filtros:
            </div>
            <select value={medFilterDoctor} onChange={e => setMedFilterDoctor(e.target.value)} className="text-sm font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">Todos los médicos</option>
              {doctors.map(d => (
                <option key={d.uid} value={d.uid}>{d.name}</option>
              ))}
            </select>
            <select value={medFilterSpecialty} onChange={e => setMedFilterSpecialty(e.target.value)} className="text-sm font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">Todas las especialidades</option>
              {specialtiesList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={medFilterMolecule} onChange={e => setMedFilterMolecule(e.target.value)} className="text-sm font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">Todas las moléculas</option>
              {moleculesList.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            {(medFilterDoctor || medFilterSpecialty || medFilterMolecule) && (
              <button onClick={() => { setMedFilterDoctor(''); setMedFilterSpecialty(''); setMedFilterMolecule(''); }} className="text-sm text-red-500 font-bold underline">Limpiar filtros</button>
            )}
            <span className="ml-auto text-sm text-slate-400 font-bold">{formatNumber(filteredMedicineStats.totalItems)} items</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">{periodLabel}</p>
              <p className="text-base font-bold text-slate-400 uppercase tracking-widest mt-1">Externos</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(filteredMedicineStats.externalItems)}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">{periodLabel}</p>
              <p className="text-base font-bold text-slate-400 uppercase tracking-widest mt-1">Inventario</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(filteredMedicineStats.internalItems)}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">{periodLabel}</p>
              <p className="text-base font-bold text-slate-400 uppercase tracking-widest mt-1">Total Items</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(filteredMedicineStats.totalItems)}</h3>
            </div>
          </div>

          {/* Incidence Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-2 border-violet-100">
                <div className="p-4 border-b bg-violet-50">
                  <p className="text-sm font-bold text-violet-900 uppercase tracking-widest">{periodLabel}</p>
                  <p className="text-base font-bold uppercase tracking-widest text-violet-700 mt-1">Top Productos Internos Más Recetados</p>
                  <p className="text-sm text-violet-500 font-normal mt-1">Productos de inventario propio con mayor número de prescripciones en el periodo.</p>
                </div>
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-right">Incidencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMedicineStats.internalMedicines.slice(0, 50).map((item, idx) => (
                        <tr key={item.name} className="hover:bg-violet-100 transition-colors cursor-pointer" onClick={() => setSelectedMedicationForModal({name: item.name, isExternal: false})}>
                          <td className="p-3 text-sm text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 text-base font-semibold text-slate-700">{item.name}</td>
                          <td className="p-3 text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 font-bold text-sm">{item.count} veces</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <summary className="p-3 cursor-pointer bg-slate-50 text-base font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-between outline-none">
                  <div>
                    <span className="block text-base">Productos Internos Menos Recetados</span>
                    <span className="block text-sm text-slate-400 font-normal mt-0.5">Productos con la menor cantidad de prescripciones.</span>
                  </div>
                  <span className="text-sm font-normal text-slate-400 group-open:hidden whitespace-nowrap ml-2">(Click para desplegar)</span>
                </summary>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar border-t border-slate-100">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-50 text-slate-400 uppercase font-bold tracking-widest sticky top-0">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-right">Incidencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...filteredMedicineStats.internalMedicines].reverse().slice(0, 50).map((item, idx) => (
                        <tr key={item.name} className="hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => setSelectedMedicationForModal({name: item.name, isExternal: false})}>
                          <td className="p-3 text-sm text-slate-400 font-mono">{filteredMedicineStats.internalMedicines.length - idx}</td>
                          <td className="p-3 text-base font-semibold text-slate-700">{item.name}</td>
                          <td className="p-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-sm">{item.count} veces</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>

            <div className="flex flex-col gap-4">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-2 border-rose-100">
                <div className="p-4 border-b bg-rose-50">
                  <p className="text-sm font-bold text-rose-900 uppercase tracking-widest">{periodLabel}</p>
                  <p className="text-base font-bold uppercase tracking-widest text-rose-700 mt-1">Top Productos Externos Más Recetados</p>
                  <p className="text-sm text-rose-500 font-normal mt-1">Productos externos sugeridos con mayor número de prescripciones en el periodo.</p>
                </div>
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-right">Incidencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMedicineStats.externalMedicines.slice(0, 50).map((item, idx) => (
                        <tr key={item.name} className="hover:bg-rose-100 transition-colors cursor-pointer" onClick={() => setSelectedMedicationForModal({name: item.name, isExternal: true})}>
                          <td className="p-3 text-sm text-slate-400 font-mono">{idx + 1}</td>
                          <td className="p-3 text-base font-semibold text-slate-700">{item.name}</td>
                          <td className="p-3 text-right">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-sm">{item.count} veces</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <details className="group bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <summary className="p-3 cursor-pointer bg-slate-50 text-base font-bold text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-between outline-none">
                  <div>
                    <span className="block text-base">Productos Externos Menos Recetados</span>
                    <span className="block text-sm text-slate-400 font-normal mt-0.5">Productos externos con la menor cantidad de prescripciones.</span>
                  </div>
                  <span className="text-sm font-normal text-slate-400 group-open:hidden whitespace-nowrap ml-2">(Click para desplegar)</span>
                </summary>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar border-t border-slate-100">
                  <table className="w-full text-left text-base">
                    <thead className="bg-slate-50 text-slate-400 uppercase font-bold tracking-widest sticky top-0">
                      <tr>
                        <th className="p-3">#</th>
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-right">Incidencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...filteredMedicineStats.externalMedicines].reverse().slice(0, 50).map((item, idx) => (
                        <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 text-sm text-slate-400 font-mono">{filteredMedicineStats.externalMedicines.length - idx}</td>
                          <td className="p-3 text-base font-semibold text-slate-700">{item.name}</td>
                          <td className="p-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-sm">{item.count} veces</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </div>


          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-slate-50/60 flex flex-col justify-center min-h-[70px]">
                <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">{periodLabel}</p>
                <p className="text-base font-bold uppercase tracking-widest text-slate-500 mt-1">Top Moléculas</p>
                <p className="text-sm text-slate-400 font-normal mt-1 leading-tight">Principios activos o componentes principales más frecuentes en las recetas.</p>
              </div>
              <div className="p-5 space-y-1 flex-1 overflow-y-auto">
                {filteredMedicineStats.molecules.slice(0, 8).map(item => (
                  <div 
                    key={item.name} 
                    onClick={() => setSelectedMoleculeForModal(item.name)}
                    className="flex items-center justify-between text-base cursor-pointer hover:bg-indigo-50/60 rounded-lg px-2 py-1.5 -mx-2 transition-all group"
                  >
                    <span className="text-slate-700 font-medium group-hover:text-indigo-700 transition-colors">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{item.count}</span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-slate-50/60 flex flex-col justify-center min-h-[70px]">
                <p className="text-sm font-bold text-slate-900 uppercase tracking-widest">{periodLabel}</p>
                <p className="text-base font-bold uppercase tracking-widest text-slate-500 mt-1">Top Médicos</p>
                <p className="text-sm text-slate-400 font-normal mt-1 leading-tight">Médicos que han prescrito la mayor cantidad total de medicamentos (internos y externos) en el periodo.</p>
              </div>
              <div className="p-5 space-y-3 flex-1 overflow-y-auto">
                {filteredMedicineStats.doctors.slice(0, 8).map(item => (
                  <div key={item.name} className="flex items-center justify-between text-base">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== MOLECULE OVERLAP REPORT: EXTERNOS CUYA MOLÉCULA TENEMOS INTERNAMENTE ===== */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-gradient-to-r from-indigo-50/80 to-violet-50/60 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-indigo-500" /> Cobertura de Moléculas: Externos vs Internos
                </h3>
                <p className="text-sm text-slate-400 mt-0.5">Medicamentos externos cuya molécula (ingrediente activo) ya tenemos en inventario</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-indigo-700 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" />
                  {moleculeOverlap.uniqueMoleculesCount} moléculas
                </span>
                <span className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-bold text-rose-700 flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5" />
                  {moleculeOverlap.totalExternalMedsWithInternalMolecule} externos
                </span>
              </div>
            </div>
            <div className="p-5">
              {moleculeOverlap.overlaps.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-base font-bold text-slate-700">No hay coincidencias</p>
                  <p className="text-sm text-slate-400 mt-1">
                    No se encontraron medicamentos externos cuya molécula esté en inventario
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold tracking-widest border-b border-slate-200">
                      <tr>
                        <th className="p-3">Molécula (Interna)</th>
                        <th className="p-3">Medicamento Externo</th>
                        <th className="p-3">Coincidencia Interna</th>
                        <th className="p-3 text-right">Stock</th>
                        <th className="p-3 text-right">Precio</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {moleculeOverlap.overlaps.map((overlap, idx) => (
                        <tr key={`${overlap.molecule}-${overlap.externalMedicine.id}-${idx}`} className="hover:bg-indigo-50/40 transition-colors">
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <FlaskConical className="w-3 h-3" /> {overlap.molecule}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-slate-800">{overlap.externalMedicine.name}</span>
                            {overlap.externalMedicine.brandName && overlap.externalMedicine.brandName !== overlap.externalMedicine.name && (
                              <span className="block text-xs text-slate-400 mt-0.5">{overlap.externalMedicine.brandName}</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {overlap.internalMatches.map(internal => (
                                <span
                                  key={internal.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                >
                                  <Check className="w-3 h-3" /> {internal.name}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <span className={`font-bold ${overlap.internalMatches.reduce((s, m) => s + (m.stock || 0), 0) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {overlap.internalMatches.reduce((s, m) => s + (m.stock || 0), 0)}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <span className="text-slate-700 font-medium">
                              Q{overlap.internalMatches[0]?.price?.toFixed(2) || '0.00'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Stethoscope className="w-5 h-5 text-blue-500" /> Analítica por Médico</h3>
              <p className="text-base text-slate-500">Consultas, tiempo promedio y medicamentos</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)} className="text-sm font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
                {doctors.map(d => (
                  <option key={d.uid} value={d.uid}>{d.name}</option>
                ))}
              </select>
              <button onClick={handleExportDoctor} className="px-4 py-2 text-base font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Consultas</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(doctorStats.totalConsultations)}</h3>
              <p className="text-sm text-slate-400 mt-2">Nuevas: {doctorStats.newConsultations} | Re: {doctorStats.reConsultations}</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Promedio Semanal</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{doctorStats.avgWeeklyHours.toFixed(1)}h</h3>
              <p className="text-sm text-slate-400 mt-2">Tiempo promedio por semana</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Horas Trabajadas / Contratadas</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{doctorStats.attendedHours.toFixed(1)}h <span className="text-xl text-slate-400">/ {doctorStats.contractedHours.toFixed(1)}h</span></h3>
              <div className="mt-2">
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${doctorStats.utilizationPct >= 80 ? 'bg-emerald-500' : doctorStats.utilizationPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${doctorStats.utilizationPct}%` }}
                  />
                </div>
                <p className={`text-sm mt-1 font-bold ${doctorStats.utilizationPct >= 80 ? 'text-emerald-600' : doctorStats.utilizationPct >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                  {doctorStats.utilizationPct.toFixed(0)}% de capacidad utilizada
                </p>
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Semanas Activas</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{doctorStats.weeklyStats.length}</h3>
              <p className="text-sm text-slate-400 mt-2">En el periodo seleccionado</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Desglose de Recetas</p>
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-slate-700">{formatNumber(doctorStats.totalPrescriptionCount)} recetas totales</span>
                  <div className="flex items-center gap-3 text-sm font-bold">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500" /> Inventario</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-400" /> Externos</span>
                  </div>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                  {doctorStats.totalPrescriptionCount > 0 ? (
                    <>
                      <div className="h-full bg-violet-500 transition-all" style={{ width: `${doctorStats.inventoryPct}%` }} />
                      <div className="h-full bg-rose-400 transition-all" style={{ width: `${doctorStats.externalPct}%` }} />
                    </>
                  ) : (
                    <div className="h-full bg-slate-200 w-full" />
                  )}
                </div>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-violet-700 font-bold">Inventario: {doctorStats.internalCount} ({doctorStats.inventoryPct.toFixed(0)}%)</span>
                  <span className="text-rose-600 font-bold">Externos: {doctorStats.externalCount} ({doctorStats.externalPct.toFixed(0)}%)</span>
                </div>
              </div>
              {doctorStats.internalCount > 0 && doctorStats.externalCount > 0 && (
                <span className="px-3 py-1.5 bg-amber-50 text-amber-700 text-sm font-bold rounded-full border border-amber-200 whitespace-nowrap">Recetas mixtas</span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-emerald-50 text-sm font-bold uppercase tracking-widest text-emerald-700">Top Medicamentos</div>
              <div className="p-5 space-y-3">
                {doctorStats.topMeds.length === 0 ? (
                  <p className="text-base text-slate-400">Sin recetas en el periodo</p>
                ) : doctorStats.topMeds.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate mr-2">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-rose-50 text-sm font-bold uppercase tracking-widest text-rose-700">Menos Recetados</div>
              <div className="p-5 space-y-3">
                {doctorStats.leastMeds.length === 0 ? (
                  <p className="text-base text-slate-400">Sin recetas en el periodo</p>
                ) : doctorStats.leastMeds.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate mr-2">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-fit">
              <div className="p-4 border-b bg-slate-50 text-sm font-bold uppercase tracking-widest text-slate-500">Desglose por Semana</div>
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-base">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                    <tr>
                      <th className="p-4">Semana</th>
                      <th className="p-4">Citas</th>
                      <th className="p-4">Horas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doctorStats.weeklyStats.length === 0 ? (
                      <tr><td colSpan={3} className="p-8 text-center text-slate-400">Sin actividad</td></tr>
                    ) : doctorStats.weeklyStats.map(item => (
                      <tr
                        key={item.week}
                        onClick={() => setSelectedDoctorWeek(item.week)}
                        className={`text-slate-600 cursor-pointer hover:bg-slate-50 transition-colors ${selectedDoctorWeek === item.week ? 'bg-brand-50' : ''}`}
                      >
                        <td className="p-4 text-base font-semibold text-slate-800">{item.week}</td>
                        <td className="p-4">{item.appointments.length}</td>
                        <td className="p-4 font-mono">{(item.minutes / 60).toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {selectedDoctorWeekData ? (
                <>
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b bg-slate-50 flex items-center justify-between">
                      <span className="text-sm font-bold uppercase tracking-widest text-slate-500">Detalle de Semana {selectedDoctorWeek}</span>
                      <span className="text-base font-bold text-brand-600">Total: {(selectedDoctorWeekData.minutes / 60).toFixed(1)} horas</span>
                    </div>
                    <div className="p-6">
                      <div className="space-y-3">
                        {selectedDoctorWeekData.appointments.map((appt, idx) => {
                          const date = appointmentToDate(appt.date);
                          return (
                            <div key={appt.id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-400">
                                  {date ? date.toLocaleDateString('es-GT', { weekday: 'short' }) : '—'}
                                </div>
                                <div>
                                  <p className="text-base font-bold text-slate-800">{appt.patientName}</p>
                                  <p className="text-sm text-slate-400">{date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} • {appt.consultationType}</p>
                                </div>
                              </div>
                              <span className="text-sm font-bold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                {getAppointmentDurationMinutes(appt)} min
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-20 text-center">
                  <Clock className="w-12 h-12 text-slate-300 mb-4" />
                  <p className="text-slate-500 font-bold">Selecciona una semana para ver el detalle de horas y citas por día</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pharmacy' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Reporte Farmacia</h3>
              <p className="text-base text-slate-500">¿Cuántas recetas se pueden surtir al 100% con el inventario actual?</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Excel de ventas deshabilitado temporalmente — descomentar cuando se requiera */}
              {/* <label className="px-4 py-2 text-base font-bold rounded-xl bg-emerald-600 text-white flex items-center gap-2 cursor-pointer">
                <UploadCloud className="w-4 h-4" /> {uploadingPharmacy ? 'Subiendo...' : 'Subir Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadPharmacyReport} disabled={uploadingPharmacy} />
              </label> */}
            </div>
          </div>

          {/* KPIs principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-base font-bold text-slate-400 uppercase tracking-widest">Medicamentos Únicos</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(pharmacyFillRate.uniqueMedicinesPrescribed)}</h3>
              <p className="text-sm text-slate-400 mt-1">Distintos recetados en el período (incluso si salen 30 veces)</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-base font-bold text-slate-400 uppercase tracking-widest">Recetas Totales</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(pharmacyFillRate.totalRecipes)}</h3>
              <p className="text-sm text-slate-400 mt-1">Consultas con prescripción</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-base font-bold text-slate-400 uppercase tracking-widest">Items Recetados</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2">{formatNumber(pharmacyFillRate.totalItemsPrescribed)}</h3>
              <p className="text-sm text-slate-400 mt-1">Suma total de unidades recetadas</p>
            </div>
            <div className="bg-white rounded-3xl border-2 border-emerald-200 shadow-sm p-5 bg-gradient-to-br from-emerald-50 to-white">
              <p className="text-base font-bold text-emerald-700 uppercase tracking-widest">% Recetas 100% Surtibles</p>
              <h3 className="text-3xl font-bold text-emerald-700 mt-2">
                {pharmacyFillRate.totalRecipes > 0
                  ? ((pharmacyFillRate.buckets['100%'] / pharmacyFillRate.totalRecipes) * 100).toFixed(1)
                  : '0.0'}%
              </h3>
              <p className="text-sm text-slate-700 mt-1 font-bold">
                {pharmacyFillRate.buckets['100%']} de {pharmacyFillRate.totalRecipes} recetas
              </p>
            </div>
          </div>

          {/* Distribución de fill rate (5 buckets) */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-brand-600" />
                Distribución de recetas por capacidad de surtido
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                De cada 100 recetas, cuántas se pueden surtir al X% desde el inventario actual.
                {pharmacyFillRate.totalRecipes > 0 && (
                  <span className="ml-1 text-slate-700 font-bold">
                    Fill rate promedio: {(pharmacyFillRate.averageRate * 100).toFixed(1)}%
                  </span>
                )}
              </p>
            </div>
            <div className="p-5 space-y-3">
              {([
                { bucket: '100%' as const, label: 'Surtibles al 100%', color: 'bg-emerald-500', textColor: 'text-emerald-700' },
                { bucket: '75-99%' as const, label: 'Surtibles al 75-99%', color: 'bg-lime-500', textColor: 'text-lime-700' },
                { bucket: '50-74%' as const, label: 'Surtibles al 50-74%', color: 'bg-amber-500', textColor: 'text-amber-700' },
                { bucket: '25-49%' as const, label: 'Surtibles al 25-49%', color: 'bg-orange-500', textColor: 'text-orange-700' },
                { bucket: '0-24%' as const, label: 'Surtibles al 0-24%', color: 'bg-rose-500', textColor: 'text-rose-700' },
              ]).map(({ bucket, label, color, textColor }) => {
                const count = pharmacyFillRate.buckets[bucket];
                const pct = pharmacyFillRate.totalRecipes > 0 ? (count / pharmacyFillRate.totalRecipes) * 100 : 0;
                return (
                  <div key={bucket} className="flex items-center gap-3">
                    <div className={`${color} w-2 h-12 rounded-full shrink-0`}></div>
                    <div className="w-32 shrink-0">
                      <p className={`text-sm font-bold ${textColor}`}>{label}</p>
                    </div>
                    <div className="flex-1 bg-slate-100 rounded-full h-6 relative overflow-hidden">
                      <div
                        className={`${color} h-full rounded-full transition-all`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                    <div className="w-32 text-right shrink-0">
                      <p className="text-base font-bold text-slate-800">{count} recetas</p>
                      <p className="text-xs text-slate-400">{pct.toFixed(1)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top medicamentos prescritos */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Pill className="w-5 h-5 text-brand-600" />
                Top 10 medicamentos más recetados
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Únicos en el período: <strong className="text-slate-800">{pharmacyFillRate.uniqueMedicinesPrescribed}</strong> · Internos: <strong className="text-emerald-700">{pharmacyFillRate.uniqueMedicinesInternal}</strong> · Externos: <strong className="text-amber-700">{pharmacyFillRate.uniqueMedicinesExternal}</strong>
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-base">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-500 text-xs uppercase tracking-widest">
                    <th className="p-3 font-bold">Medicamento</th>
                    <th className="p-3 font-bold text-center"># Recetas</th>
                    <th className="p-3 font-bold text-center">Origen</th>
                    <th className="p-3 font-bold text-center">Stock Actual</th>
                    <th className="p-3 font-bold text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pharmacyFillRate.topPrescribed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400 italic">
                        No hay recetas en el período
                      </td>
                    </tr>
                  ) : (
                    pharmacyFillRate.topPrescribed.map((med, idx) => (
                      <tr key={`${med.name}-${idx}`} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-medium text-slate-800">
                          <span className="text-slate-400 text-xs mr-2">#{idx + 1}</span>
                          {med.name}
                        </td>
                        <td className="p-3 text-center text-slate-800 font-bold">{med.count}</td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${med.isExternal ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {med.isExternal ? 'EXTERNO' : 'INTERNO'}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-800 font-mono font-bold">
                          {med.currentStock}
                        </td>
                        <td className="p-3 text-center">
                          {med.isExternal ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-bold">N/A</span>
                          ) : med.currentStock === 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold">AGOTADO</span>
                          ) : med.currentStock < 20 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">BAJO</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">OK</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sección original del Excel — deshabilitada temporalmente */}
          {false && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-amber-300 bg-amber-100 text-base font-bold uppercase tracking-widest text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> Revisar — Ventas de medicamentos externos o no catalogados
            </div>
            <div className="p-5">
              {pharmacyMatch.externalSalesDetected.length === 0 ? (
                <p className="text-base text-amber-800">Todas las ventas FAR corresponden a productos internos. No hay nada que revisar.</p>
              ) : (
                <>
                  <p className="text-sm text-amber-800 mb-3">
                    Se detectaron <strong>{pharmacyMatch.externalSalesDetected.length}</strong> ventas de productos que están marcados como externos o que no están en el catálogo.
                    Los directivos deben revisar si alguno debería reclasificarse como interno.
                  </p>
                  <div className="max-h-96 overflow-y-auto bg-white rounded-2xl border border-amber-200">
                    <table className="w-full text-base">
                      <thead className="bg-amber-50 sticky top-0">
                        <tr className="text-left text-amber-800">
                          <th className="p-3 font-bold">Fecha</th>
                          <th className="p-3 font-bold">Producto</th>
                          <th className="p-3 font-bold">Código</th>
                          <th className="p-3 font-bold">Paciente</th>
                          <th className="p-3 font-bold">Cant.</th>
                          <th className="p-3 font-bold">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pharmacyMatch.externalSalesDetected.map((flag, i) => (
                          <tr key={`${flag.patientName}-${flag.productName}-${flag.dateMs}-${i}`} className="border-t border-amber-100">
                            <td className="p-3 text-slate-600 whitespace-nowrap">{flag.dateMs ? formatDate(flag.dateMs) : '—'}</td>
                            <td className="p-3 text-slate-800 font-bold">{flag.productName}</td>
                            <td className="p-3 text-slate-500 font-mono text-sm">{flag.productCode}</td>
                            <td className="p-3 text-slate-600">{flag.patientName}</td>
                            <td className="p-3 text-slate-800 font-bold">{flag.soldQuantity}</td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded-lg text-xs font-bold ${flag.reason === 'not-in-catalog' ? 'bg-rose-100 text-rose-700' : 'bg-amber-200 text-amber-800'}`}>
                                {flag.reason === 'not-in-catalog' ? 'NO EN CATÁLOGO' : 'MARCADO EXTERNO'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
          )}
        </div>
      )}

      {/* Modal: Diagnósticos detallados por doctor (clic en categoría) */}
      {diagnosisDetailModal.open && diagnosisDetailModal.category && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-amber-50 to-white">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Diagnósticos de {diagnosisDetailModal.doctorName}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Categoría asignada: <strong className="text-amber-700">
                    {diagnosisDetailModal.category.kind === 'predefined'
                      ? diagnosisDetailModal.category.category
                      : `Otro: ${diagnosisDetailModal.category.subtype}`}
                  </strong>
                </p>
              </div>
              <button
                onClick={() => setDiagnosisDetailModal({ open: false, doctorName: '', category: null })}
                className="px-3 py-1.5 text-sm font-bold rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {(() => {
                const targetCat = diagnosisDetailModal.category!;
                const docCons = consultations.filter(c => {
                  if (c.doctorName !== diagnosisDetailModal.doctorName) return false;
                  if (!c.diagnosis || !c.diagnosis.trim()) return false;
                  return true;
                });
                return docCons
                  .sort((a, b) => b.date - a.date)
                  .map(c => (
                    <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-slate-800">{c.patientName}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(c.date).toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' })}
                            {' • '}
                            {c.consultationType === 'Nueva' ? 'Primera consulta' : 'Reconsulta'}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 italic border-l-2 border-amber-300 pl-3 py-1 bg-amber-50/30 rounded-r">
                        "{c.diagnosis}"
                      </p>
                      {targetCat.kind === 'otro' && (
                        <p className="text-xs text-slate-400 mt-2">
                          Clasificado como <em>Otro: {targetCat.subtype}</em> por Gemini
                        </p>
                      )}
                    </div>
                  ));
              })()}
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <button
                onClick={() => setDiagnosisDetailModal({ open: false, doctorName: '', category: null })}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-slate-900 text-white hover:bg-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rango de Fechas para Upload de Farmacia */}
      {showPharmacyUploadModal && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-500" />
                Rango de Fechas del Excel
              </h3>
              <p className="text-base text-slate-500 mt-1">Indica qué fechas abarca el archivo <strong>{pendingUploadFile?.name}</strong></p>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 block">Desde</label>
                  <input
                    type="date"
                    value={uploadDateStart}
                    onChange={e => setUploadDateStart(e.target.value)}
                    className="w-full text-sm font-bold px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                  />
                </div>
                <span className="text-slate-400 mt-5 font-bold">hasta</span>
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1 block">Hasta</label>
                  <input
                    type="date"
                    value={uploadDateEnd}
                    onChange={e => setUploadDateEnd(e.target.value)}
                    className="w-full text-sm font-bold px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>
              <p className="text-sm text-slate-400">Si es un solo día, selecciona la misma fecha en ambos campos.</p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                onClick={() => { setShowPharmacyUploadModal(false); setPendingUploadFile(null); }}
                className="px-4 py-2.5 text-sm font-bold rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPharmacyUpload}
                disabled={uploadingPharmacy}
                className="px-6 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {uploadingPharmacy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                Subir Reporte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Citas sin Expediente */}
      {showMissingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Citas sin Expediente Médico ({kpis.missingAppointments.length})
                </h3>
                <p className="text-base text-slate-500 mt-1">Citas marcadas como llegadas en agenda, pero sin registro de consulta.</p>
              </div>
              <button onClick={() => setShowMissingModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto bg-slate-50">
              <table className="w-full text-left text-base">
                <thead className="bg-white sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Fecha y Hora</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Paciente</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Médico</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Motivo</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Estado Agenda</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {kpis.missingAppointments.map((appt) => {
                    const date = appointmentToDate(appt.date);
                    return (
                      <tr key={appt.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-slate-600 font-medium">
                          {date ? date.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                        </td>
                        <td className="p-4 text-slate-800 font-bold">{appt.patientName || 'Paciente sin nombre'}</td>
                        <td className="p-4 text-slate-600">{appt.doctorName || 'Sin médico asignado'}</td>
                        <td className="p-4 text-slate-600">{appt.reasonForConsultation || appt.reason || 'Sin especificar'}</td>
                        <td className="p-4">
                          <span className="inline-flex px-2 py-0.5 rounded-md text-sm font-bold bg-slate-100 text-slate-600">
                            {(() => {
                              const statusMap: Record<string, string> = {
                                scheduled: 'Agendada',
                                confirmed: 'Confirmada',
                                cancelled: 'Cancelada',
                                no_show: 'No asistió',
                                arrived: 'Llegó',
                                paid_checked_in: 'Pagado / En sala',
                                resident_intake: 'Con Residente',
                                in_progress: 'En consulta',
                                completed: 'Completada'
                              };
                              return statusMap[appt.status] || appt.status;
                            })()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button onClick={() => setShowMissingModal(false)} className="px-5 py-2.5 rounded-xl text-base font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Especialidades */}
      {showSpecialtyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowSpecialtyModal(null)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  {showSpecialtyModal === 'total' ? 'Total Consultas' : showSpecialtyModal === 'new' ? 'Consultas Nuevas' : 'Reconsultas'} por Especialidad
                </h3>
              </div>
              <button onClick={() => setShowSpecialtyModal(null)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto bg-slate-50">
              <table className="w-full text-left text-base">
                <thead className="bg-white sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Especialidad</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-center">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {consultationBySpecialty.map((item) => {
                    const count = showSpecialtyModal === 'total' ? item.newCount + item.reCount : showSpecialtyModal === 'new' ? item.newCount : item.reCount;
                    if (count === 0) return null;
                    return (
                      <tr key={item.specialty} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-slate-800 font-bold">{item.specialty}</td>
                        <td className="p-4 text-center font-bold text-slate-600">{count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button onClick={() => setShowSpecialtyModal(null)} className="px-5 py-2.5 rounded-xl text-base font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Consultas no Finalizadas */}
      {showUnfinishedConsultationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowUnfinishedConsultationsModal(false)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Consultas no Finalizadas ({unfinishedConsultationsList.length})
                </h3>
                <p className="text-base text-slate-500 mt-1">Consultas que no se han cerrado correctamente.</p>
              </div>
              <button onClick={() => setShowUnfinishedConsultationsModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto bg-slate-50">
              <table className="w-full text-left text-base">
                <thead className="bg-white sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Fecha</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Paciente</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Médico</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Especialidad</th>
                    <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Estatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {unfinishedConsultationsList.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 text-slate-600 font-medium">{new Date(c.date).toLocaleDateString('es-GT', { dateStyle: 'medium' })}</td>
                      <td className="p-4 text-slate-800 font-bold">{c.patientName}</td>
                      <td className="p-4 text-slate-600">{c.doctorName || '—'}</td>
                      <td className="p-4 text-slate-600">{c.doctorSpecialty || '—'}</td>
                      <td className="p-4">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-sm font-bold bg-amber-100 text-amber-700">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {unfinishedConsultationsList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">No hay consultas sin finalizar.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button onClick={() => setShowUnfinishedConsultationsModal(false)} className="px-5 py-2.5 rounded-xl text-base font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Doctores sin Recetar */}
      {showDoctorsNotPrescribingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShowDoctorsNotPrescribingModal(false)}>
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-indigo-500" />
                  Consultas sin Receta ({doctorsNotPrescribingList.length})
                </h3>
                <p className="text-base text-slate-500 mt-1">Resumen de motivos por los cuales no se emitieron recetas médicas.</p>
              </div>
              <button onClick={() => setShowDoctorsNotPrescribingModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto bg-slate-50 grid grid-cols-1 lg:grid-cols-3">
              <div className="lg:col-span-1 border-r border-slate-200 bg-white">
                <h4 className="p-4 font-bold text-slate-800 border-b border-slate-100">Resumen de Motivos</h4>
                <ul className="divide-y divide-slate-100">
                  {noPrescriptionReasonsSummary.map(item => (
                    <li key={item.reason} className="p-4 flex items-center justify-between hover:bg-slate-50">
                      <span className="text-base font-medium text-slate-700">{item.reason}</span>
                      <span className="text-base font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{item.count}</span>
                    </li>
                  ))}
                  {noPrescriptionReasonsSummary.length === 0 && (
                    <li className="p-4 text-base text-slate-500 text-center">Sin datos.</li>
                  )}
                </ul>
              </div>
              
              <div className="lg:col-span-2 overflow-x-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-white sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Tipo</th>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Paciente</th>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Médico</th>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Categoría IA</th>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Razón Textual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {doctorsNotPrescribingList.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-sm font-bold ${c.consultationType === 'Nueva' ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                            {c.consultationType || '—'}
                          </span>
                        </td>
                        <td className="p-4 text-slate-800 font-bold">{c.patientName}</td>
                        <td className="p-4 text-slate-600">{c.doctorName || '—'}</td>
                        <td className="p-4 font-bold text-indigo-700">{c.noPrescriptionReasonCategory || 'Sin clasificar'}</td>
                        <td className="p-4 text-slate-500 italic max-w-xs truncate" title={c.noPrescriptionReasonText || ''}>
                          "{c.noPrescriptionReasonText || 'No se proporcionó motivo'}"
                        </td>
                      </tr>
                    ))}
                    {doctorsNotPrescribingList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">Todas las consultas tienen recetas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button onClick={() => setShowDoctorsNotPrescribingModal(false)} className="px-5 py-2.5 rounded-xl text-base font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Quien recetó medicamento */}
      <AnimatePresence>
        {selectedMedicationForModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSelectedMedicationForModal(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Pill className="w-5 h-5 text-indigo-500" />
                    Prescriptores de {selectedMedicationForModal.name}
                  </h3>
                  <p className="text-base text-slate-500 mt-1">
                    Producto {selectedMedicationForModal.isExternal ? 'Externo' : 'Interno'}
                  </p>
                </div>
                <button onClick={() => setSelectedMedicationForModal(null)} className="p-2 bg-slate-200 text-slate-500 rounded-full hover:bg-slate-300 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-0 overflow-y-auto">
                <table className="w-full text-left text-base">
                  <thead className="bg-white sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Médico</th>
                      <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-right">Veces Recetada (Incidencia)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedMedicationModalData.map((d) => (
                      <tr key={d.name} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 text-slate-800 font-bold">{d.name}</td>
                        <td className="p-4 text-slate-600 font-bold text-right text-indigo-600 bg-indigo-50/50">{d.count}</td>
                      </tr>
                    ))}
                    {selectedMedicationModalData.length === 0 && (
                      <tr>
                        <td colSpan={2} className="p-8 text-center text-slate-500">No hay datos de prescriptores.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button onClick={() => setSelectedMedicationForModal(null)} className="px-5 py-2.5 rounded-xl text-base font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Marcas por Molécula */}
      <AnimatePresence>
        {selectedMoleculeForModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSelectedMoleculeForModal(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-indigo-500" />
                    Marcas de {selectedMoleculeForModal}
                  </h3>
                  <p className="text-base text-slate-500 mt-1">
                    {selectedMoleculeBrands.total} recetas en total
                  </p>
                </div>
                <button onClick={() => setSelectedMoleculeForModal(null)} className="p-2 bg-slate-200 text-slate-500 rounded-full hover:bg-slate-300 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-50/50">
                <button
                  onClick={() => setMoleculeModalTab('internal')}
                  className={`flex-1 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${
                    moleculeModalTab === 'internal'
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Internos ({selectedMoleculeBrands.internal.length})
                </button>
                <button
                  onClick={() => setMoleculeModalTab('external')}
                  className={`flex-1 px-4 py-3 text-sm font-bold uppercase tracking-widest transition-all border-b-2 ${
                    moleculeModalTab === 'external'
                      ? 'border-amber-500 text-amber-700 bg-amber-50/50'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  Externos ({selectedMoleculeBrands.external.length})
                </button>
              </div>

              <div className="p-0 overflow-y-auto flex-1">
                <AnimatePresence mode="wait">
                  {moleculeModalTab === 'internal' ? (
                    <motion.div
                      key="internal"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {selectedMoleculeBrands.internal.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <p className="text-base">Esta molécula no se vende en inventario interno.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-base">
                          <thead className="bg-white sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Marca Comercial</th>
                              <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Proveedor</th>
                              <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-right">Recetas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {selectedMoleculeBrands.internal.map(brand => (
                              <tr key={brand.name} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-800 font-bold">{brand.name}</td>
                                <td className="p-4">
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                    Inventario
                                  </span>
                                  {brand.providers.map(p => (
                                    <span key={p} className="ml-1 inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                      {p}
                                    </span>
                                  ))}
                                </td>
                                <td className="p-4 text-slate-600 font-bold text-right text-emerald-600 bg-emerald-50/50">{brand.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="external"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                    >
                      {selectedMoleculeBrands.external.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <p className="text-base">Esta molécula no se receta de forma externa.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left text-base">
                          <thead className="bg-white sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Marca Comercial</th>
                              <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest">Proveedor</th>
                              <th className="p-4 text-sm text-slate-500 uppercase font-bold tracking-widest text-right">Recetas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {selectedMoleculeBrands.external.map(brand => (
                              <tr key={brand.name} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-800 font-bold">{brand.name}</td>
                                <td className="p-4">
                                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                                    Externo
                                  </span>
                                  {brand.providers.map(p => (
                                    <span key={p} className="ml-1 inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                                      {p}
                                    </span>
                                  ))}
                                </td>
                                <td className="p-4 text-slate-600 font-bold text-right text-amber-600 bg-amber-50/50">{brand.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button onClick={() => setSelectedMoleculeForModal(null)} className="px-5 py-2.5 rounded-xl text-base font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

