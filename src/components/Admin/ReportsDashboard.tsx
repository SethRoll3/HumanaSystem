import * as React from 'react';
import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Calendar, RefreshCw, Download, UploadCloud, BarChart3, Users, Pill, Stethoscope, FileSpreadsheet, ClipboardList, ShieldCheck, Activity, Clock, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Filter, Link2, Unlink, Wand2, Trash2, Check, X, Building2 } from 'lucide-react';
import { reportsService, MedicineCatalogItem } from '../../services/reportsService';
import { pharmacySalesService, PharmacySalesReportMeta, PharmacySaleRow } from '../../services/pharmacySalesService';
import { medicineNormalizationService, MedNormalizationRule, DuplicateCluster, detectDuplicateClusters, buildNormalizationMap, normalizeWithMap, buildActiveIngredientMap } from '../../services/medicineNormalizationService';
import { Appointment, Consultation, Patient, PrescriptionItem, UserProfile, DoctorDaySchedule } from '../../types';
// @ts-ignore
import ExcelJS from 'exceljs';

type ReportTab = 'overview' | 'quality' | 'clinics' | 'secretary' | 'medicines' | 'doctors' | 'pharmacy';

const getGuatemalaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

const getDateRange = (startStr: string, endStr: string) => {
  const start = new Date(`${startStr}T00:00:00-06:00`);
  const end = new Date(`${endStr}T23:59:59.999-06:00`);
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
  const [doctors, setDoctors] = useState<UserProfile[]>([]);
  const [doctorSchedules, setDoctorSchedules] = useState<DoctorDaySchedule[]>([]);

  const [pharmacyReports, setPharmacyReports] = useState<PharmacySalesReportMeta[]>([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [pharmacyRows, setPharmacyRows] = useState<PharmacySaleRow[]>([]);
  const [uploadingPharmacy, setUploadingPharmacy] = useState(false);

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

  // Capacity expansion
  const [expandedCapacityCategory, setExpandedCapacityCategory] = useState<string | null>(null);

  // Normalization
  const [normRules, setNormRules] = useState<MedNormalizationRule[]>([]);
  const [normSubView, setNormSubView] = useState<'detect' | 'rules'>('detect');
  const [normManualDirty, setNormManualDirty] = useState('');
  const [normManualCanonicalText, setNormManualCanonicalText] = useState('');
  const [normSaving, setNormSaving] = useState(false);
  const [normManualCanonicalMap, setNormManualCanonicalMap] = useState<Record<string, string>>({});
  const [normIgnoredClusters, setNormIgnoredClusters] = useState<string[]>([]);

  const [showMissingModal, setShowMissingModal] = useState(false);

  const range = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

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
      setPharmacyRows([]);
      return;
    }
    pharmacySalesService.getReportRowsByRange(selectedReportId, range.start, range.end)
      .then(setPharmacyRows)
      .catch(() => setPharmacyRows([]));
  }, [selectedReportId, range.start, range.end]);

  const handleUploadPharmacyReport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPharmacy(true);
    try {
      const result = await pharmacySalesService.uploadReport(file, 'admin');
      toast.success(`Reporte cargado (${result.rowCount} filas)`);
      const reports = await pharmacySalesService.listReports();
      setPharmacyReports(reports);
      if (reports.length > 0) setSelectedReportId(reports[0].id);
    } catch (error) {
      console.error('Error uploading pharmacy report', error);
      toast.error('No se pudo cargar el reporte de farmacia');
    } finally {
      setUploadingPharmacy(false);
      event.target.value = '';
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
    const items: Array<PrescriptionItem & { doctorId?: string; doctorName?: string; activeIngredient?: string; provider?: string }> = [];
    consultations.forEach(c => {
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

  const kpis = useMemo(() => {
    const totalConsultations = consultations.length;
    const totalAppointments = appointments.length;
    const totalArrived = arrivedAppointments.length;
    const noShows = appointments.filter(a => a.status === 'no_show').length;
    const newPatients = patients.length;
    const totalPrescriptionItems = prescriptionItems.reduce((acc, item) => acc + (item.quantity || 1), 0);
    const newConsultations = consultations.filter(c => c.consultationType === 'Nueva').length;
    const reConsultations = consultations.filter(c => c.consultationType === 'Reconsulta').length;
    return {
      totalConsultations,
      totalAppointments,
      totalArrived,
      noShows,
      newPatients,
      totalPrescriptionItems,
      newConsultations,
      reConsultations,
      missingAppointments
    };
  }, [consultations, appointments, arrivedAppointments, patients, prescriptionItems, missingAppointments]);

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
    const providerMap = new Map<string, number>();
    const doctorMap = new Map<string, number>();

    prescriptionItems.forEach(item => {
      const qty = item.quantity || 1;
      const nameKey = item.name || 'Sin nombre';
      medMap.set(nameKey, (medMap.get(nameKey) || 0) + qty);

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
      providers: toSorted(providerMap),
      doctors: toSorted(doctorMap)
    };
  }, [prescriptionItems]);

  // --- DIAGNOSIS GROUPING FOR OVERVIEW TABLE ---
  const categorizeDiagnosis = (diagnosis: string | undefined): string => {
    if (!diagnosis) return 'Neurología general';
    const d = normalizeText(diagnosis);
    if (d.includes('epilepsia') || d.includes('epilepsy') || d.includes('epilep')) return 'Epilepsia';
    if (d.includes('parkinson')) return 'Parkinson';
    if (d.includes('tumor') || d.includes('tumores') || d.includes('neoplasia')) return 'Tumores cerebrales';
    if (d.includes('dolor') || d.includes('cefalea') || d.includes('migrana') || d.includes('migraña')) return 'Dolor';
    return 'Neurología general';
  };

  const diagnosisTable = useMemo(() => {
    const CATEGORIES = ['Epilepsia', 'Parkinson', 'Tumores cerebrales', 'Dolor', 'Neurología general'];
    const TYPES: Array<'Nueva' | 'Reconsulta'> = ['Nueva', 'Reconsulta'];

    type RowData = {
      label: string;
      category: string;
      consultationType: string;
      count: number;
      pctPharmacy: number;
      pctExams: number;
      pctReferral: number;
    };

    const rows: RowData[] = [];

    for (const cat of CATEGORIES) {
      for (const tipo of TYPES) {
        const matching = consultations.filter(c => {
          const group = categorizeDiagnosis(c.diagnosis || c.reasonForConsultation);
          return group === cat && c.consultationType === tipo;
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
            pctReferral: 0
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

        rows.push({
          label: `${tipo === 'Nueva' ? 'Primera consulta' : 'Reconsulta'} ${cat}`,
          category: cat,
          consultationType: tipo,
          count,
          pctPharmacy: Math.round((withPharmacy / count) * 100),
          pctExams: Math.round((withExams / count) * 100),
          pctReferral: Math.round((withReferral / count) * 100)
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

    return {
      rows,
      totals: {
        count: totalCount,
        pctPharmacy: totalCount > 0 ? Math.round((totalWithPharmacy / totalCount) * 100) : 0,
        pctExams: totalCount > 0 ? Math.round((totalWithExams / totalCount) * 100) : 0,
        pctReferral: totalCount > 0 ? Math.round((totalWithReferral / totalCount) * 100) : 0
      }
    };
  }, [consultations]);

  // --- CLINIC CAPACITY USAGE ---
  // Helper: count weekdays (0=Sun..6=Sat) in a date range
  const getWeekdayCounts = (start: Date, end: Date) => {
    const counts = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    while (cursor <= endDay) {
      counts[cursor.getDay()]++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return counts;
  };

  // Map JS day (0=Sun) to weeklySchedule key (0=Mon..5=Sat)
  const jsDayToScheduleKey = (jsDay: number): number | null => {
    // weeklySchedule uses: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat
    if (jsDay === 0) return null; // Sunday — no schedule
    return jsDay - 1; // Mon(1)->0, Tue(2)->1, ... Sat(6)->5
  };

  const clinicCapacity = useMemo(() => {
    const weekdayCounts = getWeekdayCounts(range.start, range.end);

    // Contracted hours: from weeklySchedule on doctor profiles
    let contractedMinutes = 0;
    doctors.forEach(doc => {
      const ws = doc.weeklySchedule;
      if (!ws) return;
      for (let jsDay = 1; jsDay <= 6; jsDay++) { // Mon..Sat
        const schedKey = jsDayToScheduleKey(jsDay);
        if (schedKey === null) continue;
        const dayEntry = ws[schedKey];
        if (!dayEntry || dayEntry.mode !== 'available' || !dayEntry.startTime || !dayEntry.endTime) continue;
        const [sh, sm] = dayEntry.startTime.split(':').map(Number);
        const [eh, em] = dayEntry.endTime.split(':').map(Number);
        const minutes = (eh * 60 + em) - (sh * 60 + sm);
        if (minutes > 0) {
          contractedMinutes += minutes * weekdayCounts[jsDay];
        }
      }
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
  }, [doctors, consultations, range]);

  // --- CAPACITY BY SPECIALTY ---
  const capacityBySpecialty = useMemo(() => {
    const weekdayCounts = getWeekdayCounts(range.start, range.end);

    type DoctorCapacity = { name: string; uid: string; contractedMin: number; attendedMin: number; newCount: number; reCount: number };
    type CategoryCapacity = { category: string; doctors: DoctorCapacity[]; contractedMin: number; attendedMin: number };

    // Contracted minutes per doctor from weeklySchedule
    const doctorContracted = new Map<string, number>();
    doctors.forEach(doc => {
      const ws = doc.weeklySchedule;
      if (!ws) return;
      let totalMin = 0;
      for (let jsDay = 1; jsDay <= 6; jsDay++) {
        const schedKey = jsDayToScheduleKey(jsDay);
        if (schedKey === null) continue;
        const dayEntry = ws[schedKey];
        if (!dayEntry || dayEntry.mode !== 'available' || !dayEntry.startTime || !dayEntry.endTime) continue;
        const [sh, sm] = dayEntry.startTime.split(':').map(Number);
        const [eh, em] = dayEntry.endTime.split(':').map(Number);
        const minutes = (eh * 60 + em) - (sh * 60 + sm);
        if (minutes > 0) totalMin += minutes * weekdayCounts[jsDay];
      }
      if (totalMin > 0) doctorContracted.set(doc.uid, totalMin);
    });

    // Attended minutes per doctor: fixed standard
    const doctorAttended = new Map<string, { min: number; newCount: number; reCount: number }>();
    consultations.forEach(c => {
      const doctorId = c.doctorId;
      if (!doctorId) return;
      const min = c.consultationType === 'Nueva' ? 60 : 30;
      const current = doctorAttended.get(doctorId) || { min: 0, newCount: 0, reCount: 0 };
      current.min += min;
      if (c.consultationType === 'Nueva') current.newCount++;
      else current.reCount++;
      doctorAttended.set(doctorId, current);
    });

    // Group by specialty
    const categoryMap = new Map<string, DoctorCapacity[]>();
    const allDoctorIds = new Set([...doctorContracted.keys(), ...doctorAttended.keys()]);
    allDoctorIds.forEach(uid => {
      const doc = doctors.find(d => d.uid === uid);
      const category = doc?.specialty || doc?.specialties?.[0] || 'Sin especialidad';
      const attended = doctorAttended.get(uid) || { min: 0, newCount: 0, reCount: 0 };
      const entry: DoctorCapacity = {
        name: doc?.name || uid,
        uid,
        contractedMin: doctorContracted.get(uid) || 0,
        attendedMin: attended.min,
        newCount: attended.newCount,
        reCount: attended.reCount
      };
      const arr = categoryMap.get(category) || [];
      arr.push(entry);
      categoryMap.set(category, arr);
    });

    const result: CategoryCapacity[] = Array.from(categoryMap.entries())
      .map(([category, drs]) => ({
        category,
        doctors: drs.sort((a, b) => b.attendedMin - a.attendedMin),
        contractedMin: drs.reduce((acc, d) => acc + d.contractedMin, 0),
        attendedMin: drs.reduce((acc, d) => acc + d.attendedMin, 0)
      }))
      .sort((a, b) => b.attendedMin - a.attendedMin);

    return result;
  }, [doctors, consultations, range]);

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

  // --- FILTERED MEDICINE STATS BY DOCTOR/SPECIALTY ---
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
    return items;
  }, [prescriptionItems, medFilterDoctor, medFilterSpecialty, doctors]);

  // --- NORMALIZATION MAP ---
  const normMap = useMemo(() => buildNormalizationMap(normRules), [normRules]);
  const activeIngredientMap = useMemo(() => buildActiveIngredientMap(normRules), [normRules]);

  const filteredMedicineStats = useMemo(() => {
    const medMap = new Map<string, number>();
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

      if (item.isExternal) externalItems++;
      else internalItems++;

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

    const doctorPrescriptionItems = prescriptionItems.filter(i => i.doctorId === selectedDoctorId);
    const medMap = new Map<string, number>();
    doctorPrescriptionItems.forEach(item => {
      const qty = item.quantity || 1;
      medMap.set(item.name, (medMap.get(item.name) || 0) + qty);
    });
    const sortedMeds = Array.from(medMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

    return {
      totalConsultations,
      newConsultations,
      reConsultations,
      avgWeeklyMinutes,
      weeklyStats: Array.from(weeklyMinutes.entries()).map(([week, data]) => ({ week, ...data })).sort((a, b) => b.week.localeCompare(a.week)),
      topMeds: sortedMeds.slice(0, 5),
      leastMeds: sortedMeds.slice(-5).reverse(),
      externalCount: doctorPrescriptionItems.filter(i => i.isExternal).length,
      internalCount: doctorPrescriptionItems.filter(i => !i.isExternal).length
    };
  }, [appointments, consultations, prescriptionItems, selectedDoctorId]);

  const selectedDoctorWeekData = useMemo(() => {
    if (!selectedDoctorWeek) return null;
    return doctorStats.weeklyStats.find(w => w.week === selectedDoctorWeek);
  }, [doctorStats.weeklyStats, selectedDoctorWeek]);

  const selectedMedicineStats = useMemo(() => {
    if (!selectedMedicineName) return null;
    const items = prescriptionItems.filter(i => i.name === selectedMedicineName);
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
  }, [prescriptionItems, selectedMedicineName]);

  const pharmacyMatch = useMemo(() => {
    if (!pharmacyRows.length) {
      return {
        totalSalesItems: 0,
        totalPrescriptionItems: 0,
        matchRate: 0,
        soldOnly: [],
        prescribedOnly: [],
        matched: []
      };
    }

    const salesMap = new Map<string, number>();
    pharmacyRows.forEach(row => {
      const key = row.normalizedProduct || normalizeText(row.product || '');
      if (!key) return;
      const qty = row.quantity || 1;
      salesMap.set(key, (salesMap.get(key) || 0) + qty);
    });

    const prescriptionsMap = new Map<string, number>();
    prescriptionItems.forEach(item => {
      const key = normalizeText(item.name || '');
      if (!key) return;
      const qty = item.quantity || 1;
      prescriptionsMap.set(key, (prescriptionsMap.get(key) || 0) + qty);
    });

    let matchedQty = 0;
    const matched: Array<{ name: string; sold: number; prescribed: number }> = [];
    const soldOnly: Array<{ name: string; sold: number }> = [];
    const prescribedOnly: Array<{ name: string; prescribed: number }> = [];

    salesMap.forEach((sold, key) => {
      if (prescriptionsMap.has(key)) {
        const prescribed = prescriptionsMap.get(key) || 0;
        matchedQty += Math.min(sold, prescribed);
        matched.push({ name: key, sold, prescribed });
      } else {
        soldOnly.push({ name: key, sold });
      }
    });

    prescriptionsMap.forEach((prescribed, key) => {
      if (!salesMap.has(key)) {
        prescribedOnly.push({ name: key, prescribed });
      }
    });

    const topSold: Array<{ name: string; sold: number }> = [];
    salesMap.forEach((sold, key) => {
      topSold.push({ name: key, sold });
    });

    const totalSalesItems = Array.from(salesMap.values()).reduce((acc, val) => acc + val, 0);
    const totalPrescriptionItems = Array.from(prescriptionsMap.values()).reduce((acc, val) => acc + val, 0);
    const matchRate = totalPrescriptionItems === 0 ? 0 : matchedQty / totalPrescriptionItems;

    return {
      totalSalesItems,
      totalPrescriptionItems,
      matchRate,
      topSold: topSold.sort((a, b) => b.sold - a.sold).slice(0, 10),
      soldOnly: soldOnly.sort((a, b) => b.sold - a.sold).slice(0, 10),
      prescribedOnly: prescribedOnly.sort((a, b) => b.prescribed - a.prescribed).slice(0, 10),
      matched: matched.sort((a, b) => b.sold - a.sold).slice(0, 10)
    };
  }, [pharmacyRows, prescriptionItems]);

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

    sheet.getRow(rowIndex).values = ['TOP MEDICAMENTOS RECETADOS', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF9333EA');
    rowIndex++;
    medicineStats.medicines.slice(0, 50).forEach(item => {
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
    sheet.getRow(rowIndex).values = ['DISTRIBUCIÓN POR PROVEEDOR', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF059669');
    rowIndex++;
    medicineStats.providers.forEach(item => {
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
    sheet.getRow(9).values = ['Promedio semanal (min)', Math.round(doctorStats.avgWeeklyMinutes), ''];
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
    sheet.columns = [{ width: 35 }, { width: 18 }, { width: 18 }];

    addWorkbookTitle(sheet, 'MATCH FARMACIA VS RECETAS', `Rango: ${startDate} a ${endDate}`);
    sheet.getRow(5).values = ['Indicador', 'Valor'];
    applyHeaderStyle(sheet.getRow(5), 'FF0F766E');
    sheet.getRow(6).values = ['Total ventas (items)', pharmacyMatch.totalSalesItems];
    sheet.getRow(7).values = ['Total recetas (items)', pharmacyMatch.totalPrescriptionItems];
    sheet.getRow(8).values = ['Match %', `${(pharmacyMatch.matchRate * 100).toFixed(1)}%`];

    let rowIndex = 10;
    sheet.getRow(rowIndex).values = ['COINCIDENCIAS (Venta == Receta)', 'Vendidos', 'Recetados'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF2563EB');
    rowIndex++;
    pharmacyMatch.matched.forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.sold, item.prescribed];
      rowIndex++;
    });

    rowIndex += 2;
    sheet.getRow(rowIndex).values = ['VENDIDOS SIN RECETA (Solo en Farmacia)', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FF059669');
    rowIndex++;
    pharmacyMatch.soldOnly.forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.sold];
      rowIndex++;
    });

    rowIndex += 2;
    sheet.getRow(rowIndex).values = ['RECETADOS SIN VENTA (Fuga de Venta)', 'Cantidad'];
    applyHeaderStyle(sheet.getRow(rowIndex), 'FFDC2626');
    rowIndex++;
    pharmacyMatch.prescribedOnly.forEach(item => {
      sheet.getRow(rowIndex).values = [item.name, item.prescribed];
      rowIndex++;
    });

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
    { id: 'secretary', label: 'Secretaría', icon: ClipboardList },
    { id: 'medicines', label: 'Medicamentos', icon: Pill },
    { id: 'doctors', label: 'Médicos', icon: Stethoscope },
    { id: 'pharmacy', label: 'Farmacia', icon: FileSpreadsheet }
  ] as const;

  return (
    <div className="space-y-6 pb-12">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-brand-600" /> Dashboard de Reportes
          </h2>
          <p className="text-xs text-slate-500 mt-1">Analítica integral y exportación de reportes en Excel</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setPreset('iso')} className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Semana ISO</button>
          <button onClick={() => setPreset('week')} className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Últimos 7 días</button>
          <button onClick={() => setPreset('month')} className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Mes</button>
          <button onClick={() => setPreset('year')} className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200">Año</button>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-xs font-bold text-slate-600 bg-transparent outline-none" />
            <span className="text-slate-400 text-xs">a</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-xs font-bold text-slate-600 bg-transparent outline-none" />
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
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
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
            <div className="w-5 h-5 mt-0.5 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">i</div>
            <div className="text-xs text-blue-800 leading-relaxed">
              <p className="font-bold mb-1">¿Cómo leer estos números?</p>
              <p>
                <span className="font-semibold">Total Consultas</span> = suma de pacientes <span className="font-semibold">Nuevos + Reconsultas + Expedientes sin cerrar</span>.<br />
                <span className="font-semibold">Sin cerrar (pendientes)</span> = citas de pacientes que hicieron check-in pero el médico no cerró la consulta en el sistema.<br />
                <span className="font-semibold">Citas Llegadas</span> = número físico de pacientes que pasaron a clínica (check-in / pagado).<br />
                <span className="text-blue-600/80 italic mt-1 block">* Nota: El % de expedientes sin cerrar se calcula sobre el total de citas llegadas al periodo.</span>
              </p>
            </div>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Total Consultas — CARD PRINCIPAL */}
            <motion.div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
              <p className="text-xs uppercase tracking-widest text-brand-100 font-bold">Total Consultas</p>
              <h3 className="text-3xl font-bold mt-2">{formatNumber(kpis.newConsultations + kpis.reConsultations + kpis.missingAppointments.length)}</h3>
              <p className="text-[10px] text-brand-200 mt-1">Nuevas + Reconsultas + Sin expediente</p>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-brand-200">Citas con expediente registrado:</span>
                  <span className="font-bold text-emerald-300">{formatNumber(kpis.totalArrived - kpis.missingAppointments.length)}</span>
                </div>
                {kpis.missingAppointments.length > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-amber-300">Citas sin expediente (pendientes):</span>
                    <span className="font-bold text-amber-300">
                      {formatNumber(kpis.missingAppointments.length)}
                      <span className="ml-1 opacity-80">({((kpis.missingAppointments.length / kpis.totalArrived) * 100).toFixed(1)}%)</span>
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[10px] border-t border-brand-500/30 pt-1 mt-1">
                  <span className="text-brand-200 font-bold">Total Citas Llegadas al periodo:</span>
                  <span className="font-bold text-white">{formatNumber(kpis.totalArrived)}</span>
                </div>
              </div>
              {kpis.missingAppointments.length > 0 && (
                <div className="absolute bottom-0 left-0 w-full bg-amber-500/30 p-2 flex items-center justify-between border-t border-amber-400/30">
                  <span className="text-[10px] font-semibold text-amber-200">⚠ {kpis.missingAppointments.length} cita(s) sin expediente</span>
                  <button onClick={() => setShowMissingModal(true)} className="text-[10px] font-bold bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-lg transition-colors text-white">
                    Ver lista
                  </button>
                </div>
              )}
            </motion.div>
            {/* 2. Consultas Nuevas */}
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 text-slate-600 text-xs font-bold uppercase">
                  <Users className="w-5 h-5 text-emerald-500" />
                  Consultas Nuevas
                </div>
                <h3 className="text-3xl font-bold text-slate-800 mt-3">{formatNumber(kpis.newConsultations)}</h3>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                <p className="text-[10px] text-slate-500 font-semibold">¿Qué es esto?</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">Pacientes que vinieron <span className="font-semibold text-slate-600">por primera vez</span> y tienen consulta registrada con diagnóstico en el sistema.</p>
              </div>
            </motion.div>
            {/* 3. Reconsultas */}
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 text-slate-600 text-xs font-bold uppercase">
                  <Activity className="w-5 h-5 text-blue-500" />
                  Reconsultas
                </div>
                <h3 className="text-3xl font-bold text-slate-800 mt-3">{formatNumber(kpis.reConsultations)}</h3>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                <p className="text-[10px] text-slate-500 font-semibold">¿Qué es esto?</p>
                <p className="text-[10px] text-slate-400 leading-relaxed">Pacientes que ya habían venido antes y regresan para <span className="font-semibold text-slate-600">seguimiento</span>. Tienen expediente médico registrado.</p>
              </div>
            </motion.div>
          </div>

          {/* FÓRMULA DE VERIFICACIÓN */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 text-sm">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest shrink-0">Verificación:</span>
            
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold">{kpis.newConsultations} nuevas</span>
              <span className="text-slate-400 font-bold">+</span>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">{kpis.reConsultations} reconsultas</span>
              <span className="text-slate-400 font-bold">+</span>
              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold">{kpis.missingAppointments.length} sin cerrar</span>
              <span className="text-slate-400 font-bold">=</span>
              <span className="px-3 py-1 bg-brand-100 text-brand-800 rounded-lg text-xs font-bold">{kpis.newConsultations + kpis.reConsultations + kpis.missingAppointments.length} consultas en total</span>
            </div>
          </div>

          {/* TABLA DE DIAGNÓSTICOS AGRUPADOS */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between bg-slate-50/60">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Resumen por Diagnóstico y Tipo de Consulta</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Agrupación: Epilepsia, Parkinson, Tumores cerebrales, Dolor, Neurología general</p>
              </div>
              <span className="text-xs font-bold text-brand-600">{diagnosisTable.totals.count} consultas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest" rowSpan={2}>Tipo de Consulta</th>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center" rowSpan={2}>Nº Pacientes</th>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center border-l border-slate-200" colSpan={3}>% de Receta</th>
                  </tr>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <th className="p-3 text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center border-l border-slate-200">Farmacia</th>
                    <th className="p-3 text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center">Exámenes Dx</th>
                    <th className="p-3 text-[10px] text-slate-500 uppercase font-bold tracking-widest text-center">Ref. Interna</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {diagnosisTable.rows.map(row => (
                    <tr key={row.label} className={`hover:bg-slate-50 transition-colors ${row.count === 0 ? 'opacity-40' : ''}`}>
                      <td className="p-4 font-semibold text-slate-700">{row.label}</td>
                      <td className="p-4 text-center font-bold text-slate-800">{row.count}</td>
                      <td className="p-4 text-center border-l border-slate-100">
                        {row.count > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${row.pctPharmacy > 0 ? 'bg-emerald-50 text-emerald-700' : 'text-slate-400'}`}>
                            {row.pctPharmacy}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-4 text-center">
                        {row.count > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${row.pctExams > 0 ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
                            {row.pctExams}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="p-4 text-center">
                        {row.count > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${row.pctReferral > 0 ? 'bg-violet-50 text-violet-700' : 'text-slate-400'}`}>
                            {row.pctReferral}%
                          </span>
                        ) : '—'}
                      </td>
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
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-500" /> Capacidad Clínica por Especialidad
              </h3>
              <p className="text-xs text-slate-500">Horas trabajadas vs horas contratadas en el periodo seleccionado</p>
            </div>
          </div>

          {/* NOTA EXPLICATIVA */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex gap-3 items-start">
            <div className="w-5 h-5 mt-0.5 shrink-0 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">i</div>
            <div className="text-xs text-blue-800 leading-relaxed">
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
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Contratadas</p>
              <h4 className="text-3xl font-bold text-slate-800 mt-2">{clinicCapacity.contractedHours.toFixed(1)}h</h4>
              <p className="text-[10px] text-slate-400 mt-1">Horas programadas en el periodo</p>
            </motion.div>
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Total Trabajadas</p>
              <h4 className="text-3xl font-bold text-blue-600 mt-2">{clinicCapacity.attendedHours.toFixed(1)}h</h4>
              <p className="text-[10px] text-slate-400 mt-1">Horas de consulta estimadas</p>
            </motion.div>
            <motion.div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Utilización Global</p>
              <h4 className={`text-3xl font-bold mt-2 ${clinicCapacity.percentage >= 80 ? 'text-emerald-600' : clinicCapacity.percentage >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
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
              <p className="text-xs text-amber-800 font-semibold">No se encontraron horarios semanales configurados para los profesionales. Suba el Excel de horarios en la sección de Administración para calcular las horas contratadas.</p>
            </div>
          )}

          {/* TABLA DESGLOSE POR CATEGORÍA + PROFESIONAL */}
          {capacityBySpecialty.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b bg-slate-50/60">
                <h3 className="font-bold text-slate-800 text-sm">Desglose por Categoría y Profesional</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Clic en la categoría para ver el detalle por profesional</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                    <tr>
                      <th className="p-3 w-8"></th>
                      <th className="p-3">Categoría / Profesional</th>
                      <th className="p-3 text-right">Consultas Nuevas</th>
                      <th className="p-3 text-right">Reconsultas</th>
                      <th className="p-3 text-right">Horas Contratadas</th>
                      <th className="p-3 text-right">Horas Trabajadas</th>
                      <th className="p-3 text-right">% Utilización</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {capacityBySpecialty.map(cat => {
                      const catPct = cat.contractedMin > 0 ? Math.min((cat.attendedMin / cat.contractedMin) * 100, 100) : 0;
                      const isExpanded = expandedCapacityCategory === cat.category;
                      const catNewCount = cat.doctors.reduce((acc, d) => acc + (d as any).newCount, 0);
                      const catReCount = cat.doctors.reduce((acc, d) => acc + (d as any).reCount, 0);
                      return (
                        <React.Fragment key={cat.category}>
                          <tr
                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                            onClick={() => setExpandedCapacityCategory(isExpanded ? null : cat.category)}
                          >
                            <td className="p-3 w-8">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </td>
                            <td className="p-3 font-bold text-slate-800">{cat.category} <span className="text-slate-400 font-normal">({cat.doctors.length})</span></td>
                            <td className="p-3 text-right text-emerald-600 font-semibold">{catNewCount}</td>
                            <td className="p-3 text-right text-blue-600 font-semibold">{catReCount}</td>
                            <td className="p-3 text-right text-slate-600">{(cat.contractedMin / 60).toFixed(1)}h</td>
                            <td className="p-3 text-right font-bold text-blue-600">{(cat.attendedMin / 60).toFixed(1)}h</td>
                            <td className="p-3 text-right">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${catPct >= 80 ? 'bg-emerald-50 text-emerald-700' : catPct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                                {catPct.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                          {isExpanded && cat.doctors.map(doc => {
                            const docPct = doc.contractedMin > 0 ? Math.min((doc.attendedMin / doc.contractedMin) * 100, 100) : 0;
                            return (
                              <tr key={doc.uid} className="bg-slate-50/50">
                                <td className="p-3"></td>
                                <td className="p-3 pl-8 text-slate-600">{doc.name}</td>
                                <td className="p-3 text-right text-emerald-500">{(doc as any).newCount}</td>
                                <td className="p-3 text-right text-blue-500">{(doc as any).reCount}</td>
                                <td className="p-3 text-right text-slate-500">{(doc.contractedMin / 60).toFixed(1)}h</td>
                                <td className="p-3 text-right text-blue-500">{(doc.attendedMin / 60).toFixed(1)}h</td>
                                <td className="p-3 text-right">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${docPct >= 80 ? 'bg-emerald-50 text-emerald-700' : docPct >= 50 ? 'bg-amber-50 text-amber-700' : doc.contractedMin > 0 ? 'bg-red-50 text-red-700' : 'text-slate-400'}`}>
                                    {doc.contractedMin > 0 ? `${docPct.toFixed(1)}%` : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                    <tr className="font-bold">
                      <td className="p-3"></td>
                      <td className="p-3 text-slate-800">Total General</td>
                      <td className="p-3 text-right text-emerald-700">{capacityBySpecialty.reduce((acc, c) => acc + c.doctors.reduce((a, d) => a + (d as any).newCount, 0), 0)}</td>
                      <td className="p-3 text-right text-blue-700">{capacityBySpecialty.reduce((acc, c) => acc + c.doctors.reduce((a, d) => a + (d as any).reCount, 0), 0)}</td>
                      <td className="p-3 text-right text-slate-700">{clinicCapacity.contractedHours.toFixed(1)}h</td>
                      <td className="p-3 text-right text-blue-700">{clinicCapacity.attendedHours.toFixed(1)}h</td>
                      <td className="p-3 text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${clinicCapacity.percentage >= 80 ? 'bg-emerald-50 text-emerald-700' : clinicCapacity.percentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
                          {clinicCapacity.percentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-500" /> Control de Calidad de Datos</h3>
              <p className="text-xs text-slate-500">Pacientes llegados • DPI enmascarado en menores de 18</p>
            </div>
            <div className="flex items-center gap-3">
              {qualityData.operators.length > 0 && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={qualityOperatorFilter}
                    onChange={e => setQualityOperatorFilter(e.target.value)}
                    className="text-xs font-bold text-slate-600 bg-transparent outline-none cursor-pointer"
                  >
                    <option value="">Todos los operadores</option>
                    {qualityData.operators.map(op => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              )}
              <button onClick={handleExportQuality} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          {/* KPI Severity Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button onClick={() => setQualitySeverityFilter('all')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'all' ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white border-slate-200 hover:border-slate-400'}`}>
              <p className={`text-[10px] uppercase tracking-widest font-bold ${qualitySeverityFilter === 'all' ? 'text-slate-300' : 'text-slate-400'}`}>Total Llegados</p>
              <h4 className={`text-2xl font-bold mt-1 ${qualitySeverityFilter === 'all' ? 'text-white' : 'text-slate-800'}`}>{qualityData.total}</h4>
            </button>
            <button onClick={() => setQualitySeverityFilter('critical')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'critical' ? 'bg-red-600 text-white border-red-600 shadow-lg' : 'bg-red-50 border-red-100 hover:border-red-300'}`}>
              <p className={`text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 ${qualitySeverityFilter === 'critical' ? 'text-red-200' : 'text-red-400'}`}><AlertTriangle className="w-3 h-3" /> Críticos</p>
              <h4 className={`text-2xl font-bold mt-1 ${qualitySeverityFilter === 'critical' ? 'text-white' : 'text-red-700'}`}>{qualityData.critical}</h4>
              <p className={`text-[10px] mt-1 ${qualitySeverityFilter === 'critical' ? 'text-red-200' : 'text-red-400'}`}>3+ campos faltantes</p>
            </button>
            <button onClick={() => setQualitySeverityFilter('alert')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'alert' ? 'bg-amber-500 text-white border-amber-500 shadow-lg' : 'bg-amber-50 border-amber-100 hover:border-amber-300'}`}>
              <p className={`text-[10px] uppercase tracking-widest font-bold ${qualitySeverityFilter === 'alert' ? 'text-amber-100' : 'text-amber-400'}`}>Alertas</p>
              <h4 className={`text-2xl font-bold mt-1 ${qualitySeverityFilter === 'alert' ? 'text-white' : 'text-amber-700'}`}>{qualityData.alert}</h4>
              <p className={`text-[10px] mt-1 ${qualitySeverityFilter === 'alert' ? 'text-amber-100' : 'text-amber-400'}`}>1-2 campos faltantes</p>
            </button>
            <button onClick={() => setQualitySeverityFilter('ok')} className={`rounded-2xl p-5 border transition-all text-left ${qualitySeverityFilter === 'ok' ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-emerald-50 border-emerald-100 hover:border-emerald-300'}`}>
              <p className={`text-[10px] uppercase tracking-widest font-bold flex items-center gap-1 ${qualitySeverityFilter === 'ok' ? 'text-emerald-200' : 'text-emerald-400'}`}><CheckCircle2 className="w-3 h-3" /> Completos</p>
              <h4 className={`text-2xl font-bold mt-1 ${qualitySeverityFilter === 'ok' ? 'text-white' : 'text-emerald-700'}`}>{qualityData.ok}</h4>
              <p className={`text-[10px] mt-1 ${qualitySeverityFilter === 'ok' ? 'text-emerald-200' : 'text-emerald-400'}`}>0 campos faltantes</p>
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
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
                      <td className="p-4 font-semibold text-slate-800">{appointment.patientName || patient?.fullName || '—'}</td>
                      <td className="p-4 font-mono text-slate-600">{dpi}</td>
                      <td className="p-4 text-slate-600">{age ?? '—'}</td>
                      <td className="p-4 text-slate-600">{appointment.doctorName || '—'}</td>
                      <td className="p-4">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-semibold">
                          {registeredBy}
                        </span>
                      </td>
                      <td className="p-4">
                        {missing.length === 0 ? (
                          <span className="text-emerald-600 text-[10px] font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completo</span>
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
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-500" /> Matriz ISO Semanal</h3>
                <p className="text-xs text-slate-500">Casos ingresados vs críticos por semana ISO</p>
              </div>
              <button onClick={handleExportMatrix} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-fit">
                <div className="p-4 border-b bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">Resumen por Semanas</div>
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs">
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
                          <td className="p-4 font-semibold text-slate-800">{item.week}</td>
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Pacientes</p>
                        <h4 className="text-2xl font-bold text-slate-800 mt-1">{selectedMatrixWeekData.total}</h4>
                      </div>
                      <div className="bg-red-50 p-5 rounded-3xl border border-red-100 shadow-sm">
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Críticos</p>
                        <h4 className="text-2xl font-bold text-red-800 mt-1">{selectedMatrixWeekData.critical}</h4>
                      </div>
                      <div className="bg-amber-50 p-5 rounded-3xl border border-amber-100 shadow-sm">
                        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Alertas</p>
                        <h4 className="text-2xl font-bold text-amber-800 mt-1">{selectedMatrixWeekData.alert}</h4>
                      </div>
                    </div>
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">Detalle de la Semana {selectedMatrixWeek}</div>
                      <div className="p-6 space-y-6">
                        <div>
                          <h5 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-brand-500" /> Pacientes Registrados</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedMatrixWeekData.patients.slice(0, 10).map(p => (
                              <div key={p.id} className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-700 truncate mr-2">{p.fullName}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${getMissingFields(p).length >= 5 ? 'bg-red-100 text-red-600' : getMissingFields(p).length >= 3 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                  {getMissingFields(p).length} campos faltantes
                                </span>
                              </div>
                            ))}
                            {selectedMatrixWeekData.patients.length > 10 && (
                              <p className="text-[10px] text-slate-400 text-center col-span-2">Y {selectedMatrixWeekData.patients.length - 10} pacientes más...</p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                          <div>
                            <h5 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-500" /> Consultas</h5>
                            <p className="text-2xl font-bold text-slate-800">{selectedMatrixWeekData.consultations.length}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Atendidas en la semana</p>
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-800 mb-3 flex items-center gap-2"><Calendar className="w-4 h-4 text-emerald-500" /> Citas Agendadas</h5>
                            <p className="text-2xl font-bold text-slate-800">{selectedMatrixWeekData.appointments.length}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Total citas en agenda</p>
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
        </div>
      )}

      {activeTab === 'secretary' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-teal-500" /> Reporte Secretaría</h3>
              <p className="text-xs text-slate-500">Nuevos pacientes, patología, consultas nuevas vs reconsultas</p>
            </div>
            <button onClick={handleExportSecretary} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
              <Download className="w-4 h-4" /> Exportar Excel
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-slate-50/60 text-xs font-bold uppercase tracking-widest text-slate-500">Consultas por Especialidad</div>
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest">
                  <tr>
                    <th className="p-3">Especialidad</th>
                    <th className="p-3">Nuevas</th>
                    <th className="p-3">Reconsultas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {consultationBySpecialty.map(item => (
                    <tr key={item.specialty}>
                      <td className="p-3 font-semibold text-slate-700">{item.specialty}</td>
                      <td className="p-3">{item.newCount}</td>
                      <td className="p-3">{item.reCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-slate-50/60 text-xs font-bold uppercase tracking-widest text-slate-500">Patologías / Diagnóstico</div>
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                    <tr>
                      <th className="p-3">Patología</th>
                      <th className="p-3">Nuevos</th>
                      <th className="p-3">Recons.</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {secretaryByPathology.slice(0, 30).map(item => (
                      <tr key={item.name}>
                        <td className="p-3 font-semibold text-slate-700 truncate max-w-[150px]" title={item.name}>{item.name}</td>
                        <td className="p-3 text-emerald-600 font-bold">{item.newPatients}</td>
                        <td className="p-3 text-blue-600 font-bold">{item.reconsultations}</td>
                        <td className="p-3 text-right font-bold text-slate-900">{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'medicines' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Pill className="w-5 h-5 text-violet-500" /> Incidencia de Medicamentos</h3>
              <p className="text-xs text-slate-500">Frecuencia de prescripción por molécula, proveedor y médico</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={selectedMedicineName} onChange={e => setSelectedMedicineName(e.target.value)} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white max-w-[200px]">
                {filteredMedicineStats.medicines.slice(0, 50).map(m => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
              <button onClick={handleExportMedicines} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          {/* FILTER BAR */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-bold">
              <Filter className="w-4 h-4" /> Filtros:
            </div>
            <select value={medFilterDoctor} onChange={e => setMedFilterDoctor(e.target.value)} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">Todos los médicos</option>
              {doctors.map(d => (
                <option key={d.uid} value={d.uid}>{d.name}</option>
              ))}
            </select>
            <select value={medFilterSpecialty} onChange={e => setMedFilterSpecialty(e.target.value)} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
              <option value="">Todas las especialidades</option>
              {specialtiesList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {(medFilterDoctor || medFilterSpecialty) && (
              <button onClick={() => { setMedFilterDoctor(''); setMedFilterSpecialty(''); }} className="text-[10px] text-red-500 font-bold underline">Limpiar filtros</button>
            )}
            <span className="ml-auto text-[10px] text-slate-400 font-bold">{formatNumber(filteredMedicineStats.totalItems)} items</span>
          </div>

          {selectedMedicineStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cantidad Total</p>
                <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(selectedMedicineStats.totalQty)}</h3>
                <p className="text-xs text-slate-400 mt-2">Unidades recetadas</p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recetas</p>
                <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(selectedMedicineStats.prescriptionsCount)}</h3>
                <p className="text-xs text-slate-400 mt-2">Prescripciones individuales</p>
              </div>
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b bg-slate-50/60 text-[10px] font-bold uppercase tracking-widest text-slate-500">Top Doctores que lo recetan</div>
                <div className="p-4 space-y-2">
                  {selectedMedicineStats.topDoctors.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 truncate mr-2">{d.name}</span>
                      <span className="font-bold text-slate-800">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Externos</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(filteredMedicineStats.externalItems)}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Inventario</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(filteredMedicineStats.internalItems)}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Items</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(filteredMedicineStats.totalItems)}</h3>
            </div>
          </div>

          {/* Incidence Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-2 border-violet-100">
              <div className="p-4 border-b bg-violet-50 text-xs font-bold uppercase tracking-widest text-violet-700">Top Medicamentos Más Recetados (Incidencia)</div>
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Medicamento</th>
                      <th className="p-3 text-right">Incidencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMedicineStats.medicines.slice(0, 50).map((item, idx) => (
                      <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-3 font-semibold text-slate-700">{item.name}</td>
                        <td className="p-3 text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 font-bold text-[10px]">{item.count} veces</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-2 border-rose-100">
              <div className="p-4 border-b bg-rose-50 text-xs font-bold uppercase tracking-widest text-rose-700">Medicamentos Menos Recetados</div>
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-500 uppercase font-bold tracking-widest sticky top-0">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">Medicamento</th>
                      <th className="p-3 text-right">Incidencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...filteredMedicineStats.medicines].reverse().slice(0, 50).map((item, idx) => (
                      <tr key={item.name} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-slate-400 font-mono">{filteredMedicineStats.medicines.length - idx}</td>
                        <td className="p-3 font-semibold text-slate-700">{item.name}</td>
                        <td className="p-3 text-right">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px]">{item.count} veces</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-slate-50/60 text-xs font-bold uppercase tracking-widest text-slate-500">Top Moléculas</div>
              <div className="p-5 space-y-3">
                {filteredMedicineStats.molecules.slice(0, 8).map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-slate-50/60 text-xs font-bold uppercase tracking-widest text-slate-500">Top Proveedores</div>
              <div className="p-5 space-y-3">
                {filteredMedicineStats.providers.slice(0, 8).map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-slate-50/60 text-xs font-bold uppercase tracking-widest text-slate-500">Top Médicos</div>
              <div className="p-5 space-y-3">
                {filteredMedicineStats.doctors.slice(0, 8).map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ===== NORMALIZATION SECTION ===== */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-slate-50/60 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Wand2 className="w-4 h-4 text-violet-500" /> Normalización de Medicamentos
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Detecta nombres duplicados y unifica conteos automáticamente</p>
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                <button onClick={() => setNormSubView('detect')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${normSubView === 'detect' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Unlink className="w-3 h-3 inline mr-1" /> Duplicados ({duplicateClusters.filter(c => !c.hasRule && !normIgnoredClusters.includes(c.variants.map(v => v.name).sort().join('|'))).length})
                </button>
                <button onClick={() => setNormSubView('rules')} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition ${normSubView === 'rules' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <Link2 className="w-3 h-3 inline mr-1" /> Reglas ({normRules.filter(r => r.status === 'approved').length})
                </button>
              </div>
            </div>

            {normSubView === 'detect' && (
              <div className="p-5 space-y-4">
                {duplicateClusters.filter(c => !c.hasRule && !normIgnoredClusters.includes(c.variants.map(v => v.name).sort().join('|'))).length === 0 ? (
                  <div className="text-center py-10">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-700">No se detectaron duplicados</p>
                    <p className="text-xs text-slate-400 mt-1">Todos los nombres de medicamentos parecen ser únicos</p>
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
                                <p className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                                  Posible duplicado ({cluster.variants.length} variantes, {cluster.totalCount} recetas)
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {cluster.variants.map(v => (
                                    <button
                                      key={v.name}
                                      onClick={() => setNormManualCanonicalMap(prev => ({ ...prev, [clusterId]: v.name }))}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer hover:shadow-sm transition ${v.name === activeCanonical ? 'bg-violet-100 text-violet-800 border-violet-300' : 'bg-white text-slate-600 border-slate-200'}`}
                                    >
                                      {v.name === activeCanonical && <Check className="w-3 h-3" />}
                                      {v.name} <span className="text-slate-400">×{v.count}</span>
                                    </button>
                                  ))}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-2">
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
                                  className="px-3 py-2 text-[10px] font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                                  className="px-3 py-2 text-[10px] font-bold rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                  <p className="text-xs font-bold text-slate-600 mb-3">Agregar regla manual</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Nombre incorrecto</label>
                      <input value={normManualDirty} onChange={e => setNormManualDirty(e.target.value)} placeholder="ej: propanolol 40mg" className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white" />
                    </div>
                    <div className="text-slate-400 text-lg font-bold pb-1">→</div>
                    <div className="flex-1 min-w-[150px]">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Nombre correcto</label>
                      <input value={normManualCanonicalText} onChange={e => setNormManualCanonicalText(e.target.value)} placeholder="ej: Propranolol 40mg" className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white" />
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
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
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
                    <p className="text-sm font-bold text-slate-700">No hay reglas aprobadas</p>
                    <p className="text-xs text-slate-400 mt-1">Detecta duplicados y apruébalos para crear reglas</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
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
                              <span className="inline-flex items-center px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-bold border border-red-200 line-through">{rule.dirtyName}</span>
                            </td>
                            <td className="p-3">
                              <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold border border-emerald-200">{rule.canonicalName}</span>
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
        </div>
      )}

      {activeTab === 'doctors' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Stethoscope className="w-5 h-5 text-blue-500" /> Analítica por Médico</h3>
              <p className="text-xs text-slate-500">Consultas, tiempo promedio y medicamentos</p>
            </div>
            <div className="flex items-center gap-3">
              <select value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)} className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white">
                {doctors.map(d => (
                  <option key={d.uid} value={d.uid}>{d.name}</option>
                ))}
              </select>
              <button onClick={handleExportDoctor} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Consultas</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(doctorStats.totalConsultations)}</h3>
              <p className="text-[10px] text-slate-400 mt-2">Nuevas: {doctorStats.newConsultations} | Re: {doctorStats.reConsultations}</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Promedio Semanal</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{Math.round(doctorStats.avgWeeklyMinutes)} min</h3>
              <p className="text-[10px] text-slate-400 mt-2">Tiempo de trabajo estimado</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recetas</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(doctorStats.externalCount + doctorStats.internalCount)}</h3>
              <p className="text-[10px] text-slate-400 mt-2">Ext: {doctorStats.externalCount} | Inv: {doctorStats.internalCount}</p>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Semanas Activas</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{doctorStats.weeklyStats.length}</h3>
              <p className="text-[10px] text-slate-400 mt-2">En el periodo seleccionado</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-fit">
              <div className="p-4 border-b bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">Desglose por Semana</div>
              <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left text-xs">
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
                        <td className="p-4 font-semibold text-slate-800">{item.week}</td>
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
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Detalle de Semana {selectedDoctorWeek}</span>
                      <span className="text-xs font-bold text-brand-600">Total: {(selectedDoctorWeekData.minutes / 60).toFixed(1)} horas</span>
                    </div>
                    <div className="p-6">
                      <div className="space-y-3">
                        {selectedDoctorWeekData.appointments.map((appt, idx) => {
                          const date = appointmentToDate(appt.date);
                          return (
                            <div key={appt.id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">
                                  {date ? date.toLocaleDateString('es-GT', { weekday: 'short' }) : '—'}
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-800">{appt.patientName}</p>
                                  <p className="text-[10px] text-slate-400">{date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} • {appt.consultationType}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                {getAppointmentDurationMinutes(appt)} min
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b bg-emerald-50 text-[10px] font-bold uppercase tracking-widest text-emerald-700">Top Medicamentos</div>
                      <div className="p-5 space-y-3">
                        {doctorStats.topMeds.map(item => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 truncate mr-2">{item.name}</span>
                            <span className="font-bold text-slate-800">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b bg-rose-50 text-[10px] font-bold uppercase tracking-widest text-rose-700">Menos Recetados</div>
                      <div className="p-5 space-y-3">
                        {doctorStats.leastMeds.map(item => (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 truncate mr-2">{item.name}</span>
                            <span className="font-bold text-slate-800">{item.count}</span>
                          </div>
                        ))}
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
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-500" /> Reporte Farmacia</h3>
              <p className="text-xs text-slate-500">Sube el Excel externo y compara ventas vs recetas</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white flex items-center gap-2 cursor-pointer">
                <UploadCloud className="w-4 h-4" /> {uploadingPharmacy ? 'Subiendo...' : 'Subir Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUploadPharmacyReport} disabled={uploadingPharmacy} />
              </label>
              <button onClick={handleExportPharmacy} className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 text-white flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Reporte seleccionado</p>
                <select value={selectedReportId} onChange={e => setSelectedReportId(e.target.value)} className="mt-2 text-sm font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white min-w-[260px]">
                  <option value="">Seleccionar reporte</option>
                  {pharmacyReports.map(r => (
                    <option key={r.id} value={r.id}>{r.fileName}</option>
                  ))}
                </select>
              </div>
              {selectedReportId && (
                <div className="text-xs text-slate-500">
                  Filas en rango: <span className="font-bold text-slate-800">{pharmacyRows.length}</span>
                  {pharmacyRows.length === 0 && (
                    <span className="ml-2 text-red-500 font-bold">(No hay datos en las fechas seleccionadas o el formato del Excel no es compatible)</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ventas (items)</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(pharmacyMatch.totalSalesItems)}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Recetas (items)</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{formatNumber(pharmacyMatch.totalPrescriptionItems)}</h3>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Match</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-2">{(pharmacyMatch.matchRate * 100).toFixed(1)}%</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-2 border-blue-100">
              <div className="p-4 border-b bg-blue-50 text-xs font-bold uppercase tracking-widest text-blue-700">Top Medicamentos Más Vendidos</div>
              <div className="p-5 space-y-3">
                {pharmacyMatch.topSold.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin datos</p>
                ) : pharmacyMatch.topSold.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.sold}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden border-2 border-emerald-100">
              <div className="p-4 border-b bg-emerald-50 text-xs font-bold uppercase tracking-widest text-emerald-700">Matches (Vendidos vs Recetados)</div>
              <div className="p-5 space-y-3">
                {pharmacyMatch.matched.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin datos</p>
                ) : pharmacyMatch.matched.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-emerald-600">{item.sold}/{item.prescribed}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-amber-50 text-xs font-bold uppercase tracking-widest text-amber-700">Vendidos sin receta</div>
              <div className="p-5 space-y-3">
                {pharmacyMatch.soldOnly.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin datos</p>
                ) : pharmacyMatch.soldOnly.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.sold}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b bg-rose-50 text-xs font-bold uppercase tracking-widest text-rose-700">Fuga (Recetados sin venta)</div>
              <div className="p-5 space-y-3">
                {pharmacyMatch.prescribedOnly.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin datos</p>
                ) : pharmacyMatch.prescribedOnly.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.name}</span>
                    <span className="font-bold text-slate-800">{item.prescribed}</span>
                  </div>
                ))}
              </div>
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
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Citas sin Expediente Médico ({kpis.missingAppointments.length})
                </h3>
                <p className="text-xs text-slate-500 mt-1">Citas marcadas como llegadas en agenda, pero sin registro de consulta.</p>
              </div>
              <button onClick={() => setShowMissingModal(false)} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-0 overflow-y-auto bg-slate-50">
              <table className="w-full text-left text-xs">
                <thead className="bg-white sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest">Fecha y Hora</th>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest">Paciente</th>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest">Médico</th>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest">Motivo</th>
                    <th className="p-4 text-[10px] text-slate-500 uppercase font-bold tracking-widest">Estado Agenda</th>
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
                          <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
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
              <button onClick={() => setShowMissingModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

