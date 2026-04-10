
import * as React from 'react';
import { useState, useEffect } from 'react';
import { User, Phone, History, HeartPulse, Pill, FlaskConical, Share2, ShieldCheck, CheckCircle, CircleSlash, FileCheck, Clock, ArrowLeft, Printer, Loader2, AlertTriangle, FileText, Download, X, Paperclip, Image, ExternalLink, PenTool, Scale, Wind, Droplets, Activity, Thermometer } from 'lucide-react';
import { Consultation, Patient, UserProfile } from '../../types.ts';
import { motion, AnimatePresence } from 'framer-motion';
import { EditConsultationModal } from './EditConsultationModal';
import { SpecialtyFormDefinition } from '../Wizard/SpecialtyForms/types';
import { specialtyFormsService } from '../../services/specialtyFormsService';
import { translateSpecialtyLabel } from '../../utils/specialtyTranslation';

interface ConsultationDetailProps {
    consultation: Consultation;
    patient: Patient | null;
    receptionistName: string;
  user: UserProfile;
  onBack: () => void;
  onPrint: (type: 'prescription' | 'labs' | 'report' | 'full_ficha' | 'resonance_orders' | 'eeg_orders') => void;
    onDeliver: () => void;
    isSaving: boolean;
    onUpdate?: (updated: Consultation) => void;
}

const OMISSION_TRANSLATIONS: Record<string, string> = {
    signature: 'FIRMA DIGITAL',
    nursing: 'NOTAS DE ENFERMERÍA',
    diagnosis: 'DIAGNÓSTICO MÉDICO',
    prescription: 'RECETA DE MEDICAMENTOS',
    exams: 'ORDEN DE LABORATORIOS',
    referrals: 'REFERENCIA A ESPECIALISTA',
    vitals: 'SIGNOS VITALES'
};

export const ConsultationDetail: React.FC<ConsultationDetailProps> = ({
    consultation,
    patient,
    receptionistName,
    user,
    onBack,
    onPrint,
    onDeliver,
    isSaving,
    onUpdate
}) => {
    const isNurseOrAdmin = user.role === 'nurse' || user.role === 'admin';
    const isReceptionist = user.role === 'receptionist';
  const isDoctor = user.role === 'doctor' || user.role === 'licenciado';
  const canEdit = user.role === 'admin' || ((user.role === 'doctor' || user.role === 'licenciado') && consultation.doctorId === user.uid);
  const canDeliver = isNurseOrAdmin || isReceptionist;
    
  const showDocsPanel = isNurseOrAdmin || isReceptionist || isDoctor;

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [specialtyForms, setSpecialtyForms] = useState<SpecialtyFormDefinition[]>([]);

  const formatFileDate = (value: any) => {
    if (!value) return 'Sin fecha';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-GT');
  };

  const parseVitals = (vitalsLine: string) => {
    const result: Record<string, string> = {};
    if (!vitalsLine) return result;
    const parts = vitalsLine.split(/[|,]/).map(p => p.trim()).filter(Boolean);
    parts.forEach(part => {
      const match = part.match(/^(Peso|P\/A|FR|FC|SAT|SpO2|Temp|TEMP°C)[:\s]+(.+)/i);
      if (match) {
        let key = match[1].toLowerCase().replace('/', '_');
        if (key === 'spo2') key = 'sat';
        if (key === 'temp°c') key = 'temp';
        result[key] = match[2].trim().replace(/(Lbs\.|Lbs|mmHg|xm|%|°C)/gi, '').trim();
      }
    });
    return result;
  };

  const vitalsConfig = [
    { key: 'peso', label: 'Peso', unit: 'Lbs.', icon: Scale, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'p_a', label: 'P/A', unit: 'mmHg', icon: Activity, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'fr', label: 'FR', unit: 'xm', icon: Wind, color: 'text-sky-600', bg: 'bg-sky-50' },
    { key: 'fc', label: 'FC', unit: 'xm', icon: HeartPulse, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'sat', label: 'SpO2', unit: '%', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'temp', label: 'Temp', unit: '°C', icon: Thermometer, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const parseMedicalHistory = (text: string | undefined) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];
    return trimmed.split(/\n{2,}/).map((block, idx) => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const headerLine = lines.find(l => l.startsWith('[Enfermería:')) || '';
      const vitalsLine = lines.find(l => /Peso:|P\/A:|FR:|FC:|SAT:|SpO2:|Temp:|TEMP°C:/i.test(l)) || '';
      const obsLine = lines.find(l => l.toLowerCase().startsWith('observaciones:')) || '';
      const otherLines = lines.filter(l => l !== headerLine && l !== vitalsLine && l !== obsLine);
      const parsedVitals = parseVitals(vitalsLine);
      let nurseName = '', nurseDate = '';
      if (headerLine) {
        const m = headerLine.match(/\[Enfermería:\s*(.+?)\s*-\s*(.+?)\]/);
        if (m) { nurseName = m[1].trim(); nurseDate = m[2].trim(); }
      }
      return { id: `${idx}-${lines.length}`, headerLine, vitalsLine, obsLine, otherLines, parsedVitals, nurseName, nurseDate, raw: block.trim() };
    });
  };

  const specialtyData = (consultation as any).specialtyData as Record<string, any> | undefined;
  const rawSpecialtyEntries = specialtyData ? Object.entries(specialtyData) : [];

  const specialtyFormId = (consultation as any).specialtyFormId as string | undefined;
  const activeSpecialtyForm = specialtyFormId
    ? specialtyForms.find(f => f.id === specialtyFormId)
    : undefined;

  const specialtyFormNameFromConsultation = (consultation as any).specialtyFormName as string | undefined;

  const resolvedSpecialtyFormName =
    specialtyFormNameFromConsultation ||
    activeSpecialtyForm?.name ||
    undefined;

  const allowedSpecialtyFieldIds = activeSpecialtyForm
    ? new Set(
        activeSpecialtyForm.sections.flatMap(section =>
          section.fields.map(field => field.id)
        )
      )
    : undefined;

  const specialtyEntries = allowedSpecialtyFieldIds
    ? rawSpecialtyEntries.filter(([key]) => allowedSpecialtyFieldIds.has(key))
    : rawSpecialtyEntries;

  useEffect(() => {
    let isMounted = true;
    const loadForms = async () => {
      try {
        const forms = await specialtyFormsService.getAll();
        if (isMounted) {
          setSpecialtyForms(forms);
        }
      } catch (e) {
        console.error('Error cargando definiciones de fichas', e);
      }
    };
    loadForms();
    return () => {
      isMounted = false;
    };
  }, []);

  const [legacyReason, setLegacyReason] = useState<string | null>(null);

  useEffect(() => {
    // Para consultas antiguas que no traían el reasonForConsultation explícito
    if (!consultation.reasonForConsultation && consultation.appointmentId) {
      const fetchOldReason = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const { db } = await import('../../firebase/config');
          const snap = await getDoc(doc(db, 'appointments', consultation.appointmentId!));
          if (snap.exists()) {
            const data = snap.data();
            if (data.reasonForConsultation) {
              setLegacyReason(data.reasonForConsultation);
            }
          }
        } catch (e) {
          console.error("Error fetching legacy reason", e);
        }
      };
      fetchOldReason();
    }
  }, [consultation.reasonForConsultation, consultation.appointmentId]);

    // Helper para formatear fecha con Zona Horaria de Guatemala (Forzada)
    const formatDateTimeGT = (ts: number) => {
        if (!ts) return 'N/A';
        return new Date(ts).toLocaleString('es-GT', { 
            timeZone: 'America/Guatemala',
            dateStyle: 'medium', 
            timeStyle: 'short' 
        });
    };

    // Helper para badge de omisión/edición
    const renderOmissionBadge = (fieldKey: string) => {
        const status = consultation.omittedFields?.[fieldKey] as boolean | string | undefined;
        if (!status) return null;

        if (status === 'edited') {
            return (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase border border-amber-200 shadow-sm ml-2">
                    Omitido (Editado)
                </span>
            );
        }

        return (
            <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-bold uppercase border border-red-200 ml-2">
                Omitido
            </span>
        );
    };

    const resolveSpecialtyLabel = (fieldKey: string) => {
        const formId = (consultation as any).specialtyFormId as string | undefined;
        return translateSpecialtyLabel(fieldKey, specialtyForms, formId).toUpperCase();
    };

  const encodeOptionKey = (value: string) => encodeURIComponent(value.trim());

  const decodeOptionKey = (value: string) => {
      try {
          return decodeURIComponent(value);
      } catch {
          return value;
      }
  };

  const getFieldDefinition = (fieldId: string) => {
      if (!activeSpecialtyForm) return undefined;
      return activeSpecialtyForm.sections.flatMap(section => section.fields).find(field => field.id === fieldId);
  };

  const formatSpecialtyValue = (fieldId: string, value: any) => {
      if (value === undefined || value === null || value === '') return 'Sin dato';
      if (Array.isArray(value)) return value.join(', ');

      const fieldDef = getFieldDefinition(fieldId);
      if (fieldDef?.type === 'multiText' && value && typeof value === 'object') {
          const opts = fieldDef.options && fieldDef.options.length > 0
              ? fieldDef.options
              : Object.keys(value).map(decodeOptionKey);
          const lines = opts.map(opt => {
              const key = encodeOptionKey(opt);
              const rawVal = value[key] ?? value[opt];
              const displayVal = rawVal === undefined || rawVal === null || rawVal === '' ? 'Sin dato' : String(rawVal);
              return `${opt}: ${displayVal}`;
          });
          return lines.join('\n');
      }

      if (value && typeof value === 'object') {
          const lines = Object.entries(value).map(([k, v]) => {
              const label = decodeOptionKey(k);
              const displayVal = v === undefined || v === null || v === '' ? 'Sin dato' : String(v);
              return `${label}: ${displayVal}`;
          });
          return lines.join('\n');
      }

      return String(value);
  };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-7xl mx-auto space-y-6 pb-12">
            
            {/* HEADER DE NAVEGACIÓN */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800">Detalle Completo del Expediente</h2>
                </div>
                
                {canEdit && (
                    <button 
                        onClick={() => setShowEditModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition border border-indigo-200"
                    >
                        <PenTool className="w-4 h-4" />
                        Editar Consulta
                    </button>
                )}
            </div>

            {/* EDIT MODAL */}
            {showEditModal && patient && (
                <EditConsultationModal 
                    consultation={consultation}
                    patient={patient}
                    currentUser={user}
                    onClose={() => setShowEditModal(false)}
                    onSuccess={(updated) => {
                        if (onUpdate) onUpdate(updated);
                        setShowEditModal(false);
                    }}
                />
            )}

            {/* --- SECCIÓN 1: RESUMEN DE PERSONAL Y TIEMPOS --- */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 text-sm">
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paciente</span>
                    <span className="font-bold text-slate-800 text-lg">{consultation.patientName}</span>
                    <span className="text-xs text-slate-500 font-mono">{patient?.billingCode}</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recepción (Creador)</span>
                    <span className="font-bold text-slate-700">{receptionistName}</span>
                    <span className="text-xs text-slate-400">Boleta: {consultation.paymentReceipt}</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Médico Tratante</span>
                    <span className="font-bold text-brand-600">Dr. {consultation.doctorName}</span>
                    <span className="text-xs text-slate-400">{formatDateTimeGT(consultation.date)}</span>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado Entrega</span>
                    {consultation.status === 'delivered' ? (
                        <>
                            <span className="font-bold text-emerald-600 flex items-center gap-1"><FileCheck className="w-4 h-4" /> Entregado</span>
                            <span className="text-xs text-slate-400">Por {consultation.deliveredBy}</span>
                            <span className="text-[10px] text-slate-300">{formatDateTimeGT(consultation.deliveredAt || 0)}</span>
                        </>
                    ) : (
                        <span className="font-bold text-amber-500 flex items-center gap-1"><Clock className="w-4 h-4" /> Pendiente</span>
                    )}
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Motivo Consulta</span>
                    <span className="font-bold text-slate-700 capitalize line-clamp-2" title={consultation.reasonForConsultation || legacyReason || consultation.reason || 'No especificado'}>{consultation.reasonForConsultation || legacyReason || consultation.reason || 'No especificado'}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* --- SECCIÓN 2: DATOS DEMOGRÁFICOS --- */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-full">
                        <div className="p-6 bg-slate-900 text-white">
                            <h3 className="text-base font-bold flex items-center gap-2"><User className="w-5 h-5" /> Datos Demográficos</h3>
                        </div>
                        <div className="p-6 space-y-4 text-sm">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Edad</label><p className="font-medium text-slate-700">{patient?.age} años</p></div>
                                <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Género</label><p className="font-medium text-slate-700">{patient?.gender === 'M' ? 'Masculino' : 'Femenino'}</p></div>
                            </div>
                            <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Teléfono</label><p className="font-medium text-slate-700">{patient?.phone || 'No registrado'}</p></div>
                            <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Ocupación</label><p className="font-medium text-slate-700">{patient?.occupation || 'No indicada'}</p></div>
                            
                            <hr className="border-slate-100 my-2" />

                            <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Responsable</label><p className="font-medium text-slate-700">{patient?.responsibleName} {patient?.responsiblePhone && `(${patient.responsiblePhone})`}</p></div>

                            <hr className="border-slate-100 my-2" />

                            <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Tratamiento Previo</label><p className="font-medium text-slate-700">{patient?.previousTreatment || 'Ninguno'}</p></div>

                            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 mt-2">
                                <label className="block text-[10px] text-amber-700 uppercase font-bold mb-2 flex items-center gap-1"><History className="w-3 h-3" /> Antecedentes y Archivos</label>
                                <button 
                                    onClick={() => setShowHistoryModal(true)} 
                                    className="w-full py-2 bg-white text-amber-700 border border-amber-200 rounded-lg text-xs font-bold hover:bg-amber-100 transition shadow-sm flex items-center justify-center gap-2"
                                >
                                    <FileText className="w-3 h-3"/> Ver Expediente Completo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- SECCIÓN 3: DATOS CLÍNICOS Y ORDENES --- */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Resumen de consulta */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <HeartPulse className="w-5 h-5 text-brand-600" /> Resumen de consulta 
                            {renderOmissionBadge('diagnosis')}
                        </h3>
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                            {consultation.diagnosis || 'No se registró diagnóstico.'}
                        </div>
                    </div>

                    {/* Receta */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <Pill className="w-5 h-5 text-emerald-600" /> Tratamiento Farmacológico 
                            {renderOmissionBadge('prescription')}
                        </h3>
                        {consultation.prescription && consultation.prescription.length > 0 ? (
                            <div className="border rounded-2xl overflow-hidden overflow-x-auto">
                                <table className="w-full text-sm min-w-[500px]">
                                    <thead className="bg-slate-200 text-slate-600 font-bold border-b border-slate-300"><tr><th className="p-3 text-left">Medicamento</th><th className="p-3 text-center">Cant</th><th className="p-3 text-left">Indicaciones</th></tr></thead>
                                    <tbody className="divide-y">
                                        {consultation.prescription.map((p, idx) => (
                                            <tr key={idx}><td className="p-3 font-medium text-slate-800">{p.name}</td><td className="p-3 text-center">{p.quantity}</td><td className="p-3 text-slate-600 italic">{p.dosage}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <p className="text-sm text-slate-400 italic">Sin medicamentos recetados.</p>}
                        
                        {consultation.prescriptionNotes && (
                            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded-2xl">
                                <p className="text-xs font-bold text-yellow-700 uppercase mb-1">Observaciones Generales de Receta:</p>
                                <p className="text-sm text-yellow-900">{consultation.prescriptionNotes}</p>
                            </div>
                        )}
                    </div>

                    {/* Labs y Referencias */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <FlaskConical className="w-5 h-5 text-blue-600" /> Laboratorios 
                                {renderOmissionBadge('exams')}
                            </h3>
                            {(consultation.referralGroups?.length || 0) > 0 || (consultation.exams && consultation.exams.length > 0) ? (
                                <div className="space-y-3">
                                    {consultation.referralGroups?.map((g, idx) => {
                                        const filteredExams = g.exams.filter(exam => {
                                            const normalized = exam.toLowerCase();
                                            const isLabToggle = normalized.includes('laboratorios') && !exam.startsWith('Laboratorios:');
                                            return !isLabToggle;
                                        });
                                        return (
                                        <div key={idx} className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                            <p className="text-xs font-bold text-blue-800">{g.pathology}</p>
                                            <p className="text-xs text-blue-600 mt-1">{filteredExams.join(', ')}</p>
                                        </div>
                                    )})}
                                    {consultation.exams?.filter(e => !consultation.referralGroups?.some(g => g.exams.includes(e))).map(e => (
                                        <div key={e} className="text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block mr-2 mb-2">{e}</div>
                                    ))}
                                    {consultation.emotionalEvaluationSelections && consultation.emotionalEvaluationSelections.length > 0 && (
                                        <div className="text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block mr-2 mb-2">
                                            Evaluación emocional: {consultation.emotionalEvaluationSelections.join(', ')}
                                        </div>
                                    )}
                                    {consultation.referralNote && <p className="text-xs text-slate-500 italic mt-2 bg-slate-50 p-2 rounded">Nota: {consultation.referralNote}</p>}
                                </div>
                            ) : <p className="text-sm text-slate-400 italic">Sin laboratorios.</p>}
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Share2 className="w-5 h-5 text-pink-600" /> Referencias 
                                {renderOmissionBadge('referrals')}
                            </h3>
                            {consultation.specialtyReferrals && consultation.specialtyReferrals.length > 0 ? (
                                <div className="space-y-2">
                                    {consultation.specialtyReferrals.map((r, idx) => (
                                        <div key={idx} className="p-3 bg-pink-50 border border-pink-100 rounded-xl">
                                            <div className="text-xs font-bold text-pink-700 uppercase tracking-wide">{r.specialty}</div>
                                            {r.note && <div className="text-xs text-pink-900 mt-1 italic leading-relaxed">{r.note}</div>}
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="text-sm text-slate-400 italic">Sin referencias externas.</p>}
                        </div>
                    </div>

                    {consultation.importantNotices && consultation.importantNotices.trim().length > 0 && (
                        <div className="bg-white rounded-3xl border border-red-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <AlertTriangle className="w-5 h-5 text-red-500" /> Avisos Importantes
                            </h3>
                            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-sm text-red-900 leading-relaxed whitespace-pre-wrap">
                                {consultation.importantNotices}
                            </div>
                        </div>
                    )}

                    {specialtyEntries.length > 0 && (
                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <FileText className="w-5 h-5 text-brand-600" /> Ficha Clínica Registrada
                                {resolvedSpecialtyFormName && (
                                    <span className="text-xs font-semibold text-brand-600 ml-2">
                                        {resolvedSpecialtyFormName}
                                    </span>
                                )}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                {specialtyEntries.map(([key, value]) => {
                                    const label = resolveSpecialtyLabel(key);
                                    const displayValue = formatSpecialtyValue(key, value);
                                    return (
                                        <div
                                            key={key}
                                            className="flex flex-col bg-slate-50 border border-slate-100 rounded-xl px-3 py-2"
                                        >
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                {label}
                                            </span>
                                            <span className="text-sm text-slate-800 whitespace-pre-wrap">{displayValue}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Notas de Enfermería */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <ShieldCheck className="w-5 h-5 text-amber-600" /> Anotaciones para Enfermería 
                            {renderOmissionBadge('nursing')}
                        </h3>
                        <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-2xl text-slate-700 text-sm leading-relaxed italic">
                            {consultation.followUpText || 'Sin instrucciones adicionales registradas.'}
                        </div>
                    </div>

                    {(consultation.followUpRequestText || consultation.followUpEstimatedDate) && (
                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Clock className="w-5 h-5 text-brand-600" /> Reconsulta sugerida
                            </h3>
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 text-sm leading-relaxed">
                                {consultation.followUpRequestText && (
                                    <div className="mb-2">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Indicaciones del doctor</span>
                                        <p>{consultation.followUpRequestText}</p>
                                    </div>
                                )}
                                {consultation.followUpEstimatedDate && (
                                    <div>
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Fecha aproximada</span>
                                        <p>
                                            {new Date(consultation.followUpEstimatedDate).toLocaleDateString('es-GT')}
                                            {consultation.followUpDays ? ` (aprox. ${consultation.followUpDays} días)` : ''}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* AUDITORÍA DE ENTREGA Y PAPELES */}
                    <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-600 text-xs uppercase tracking-widest mb-4">Auditoría de Entrega y Documentación</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                <span className="block font-bold text-slate-500 mb-3">Documentos Impresos:</span>
                                <div className="flex gap-2 flex-wrap">
                                    {consultation.printedDocs?.prescription ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Receta</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Receta</span>}
                                    {consultation.printedDocs?.labs ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Labs</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Labs</span>}
                                    {consultation.printedDocs?.report ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Rep. Enfermería</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Rep. Enfermería</span>}
                                    {consultation.printedDocs?.fullFicha ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Ficha completa</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Ficha completa</span>}
                                    {(consultation.resonanceOrders?.length || 0) > 0 && (consultation.printedDocs?.resonanceOrders ? (
                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Órdenes RM</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Órdenes RM</span>
                                    ))}
                                    {(consultation.eegOrders?.length || 0) > 0 && (consultation.printedDocs?.eegOrders ? (
                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Órdenes EEG</span>
                                    ) : (
                                        <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Órdenes EEG</span>
                                    ))}
                                </div>
                            </div>
                            
                            {consultation.nonPrintReason && (
                                <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                                    <span className="block font-bold text-red-500 mb-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Razón de no impresión:</span>
                                    <p className="text-red-800 italic leading-snug">{consultation.nonPrintReason}</p>
                                </div>
                            )}

                            <div className="col-span-full p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                <span className="block font-bold text-slate-500 mb-3">Omisiones Confirmadas por Médico:</span>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(consultation.omittedFields || {}).filter(([_, v]) => v).map(([k, val]) => {
                                        const v = val as boolean | string;
                                        return (
                                        <span key={k} className={`px-3 py-1 border rounded-lg text-[10px] uppercase font-bold ${v === 'edited' ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                                            {OMISSION_TRANSLATIONS[k] || k}
                                            {v === 'edited' && ' (Editado)'}
                                        </span>
                                    )})}
                                    {Object.values(consultation.omittedFields || {}).every(v => !v) && <span className="text-slate-400 italic">Ninguna omisión registrada.</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* BARRA DE ACCIONES (INTEGRADA EN EL FLUJO, NO FLOTANTE) */}
            {showDocsPanel && (
                <div className="mt-8 pt-8 border-t border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Printer className="w-5 h-5 text-brand-600" /> Panel de Documentos y Entrega
                    </h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <button 
                            onClick={() => onPrint('prescription')} 
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.prescription ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                        >
                            <Pill className={`w-8 h-8 mb-3 ${consultation.printedDocs?.prescription ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                            <span className="font-bold text-sm">
                                {isDoctor && !isNurseOrAdmin ? 'Descargar Receta' : 'Imprimir Receta'}
                            </span>
                            {consultation.printedDocs?.prescription && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                        </button>

                        {/* LABS */}
                        <button 
                            onClick={() => onPrint('labs')} 
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.labs ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                        >
                            <FlaskConical className={`w-8 h-8 mb-3 ${consultation.printedDocs?.labs ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                            <span className="font-bold text-sm">
                                {isDoctor && !isNurseOrAdmin ? 'Descargar Labs' : 'Imprimir Labs'}
                            </span>
                            {consultation.printedDocs?.labs && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                        </button>

                        {(consultation.resonanceOrders?.length || 0) > 0 && (
                            <button 
                                onClick={() => onPrint('resonance_orders')} 
                                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.resonanceOrders ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                            >
                                <FileCheck className={`w-8 h-8 mb-3 ${consultation.printedDocs?.resonanceOrders ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                                <span className="font-bold text-sm">
                                    {isDoctor && !isNurseOrAdmin ? 'Descargar Órdenes RM' : 'Imprimir Órdenes RM'}
                                </span>
                                {consultation.printedDocs?.resonanceOrders && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                            </button>
                        )}

                        {(consultation.eegOrders?.length || 0) > 0 && (
                            <button 
                                onClick={() => onPrint('eeg_orders')} 
                                className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.eegOrders ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                            >
                                <FileCheck className={`w-8 h-8 mb-3 ${consultation.printedDocs?.eegOrders ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                                <span className="font-bold text-sm">
                                    {isDoctor && !isNurseOrAdmin ? 'Descargar Órdenes EEG' : 'Imprimir Órdenes EEG'}
                                </span>
                                {consultation.printedDocs?.eegOrders && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                            </button>
                        )}

                        <button 
                            onClick={() => onPrint('report')} 
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.report ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                        >
                            <FileText className={`w-8 h-8 mb-3 ${consultation.printedDocs?.report ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                            <span className="font-bold text-sm">
                                {isDoctor && !isNurseOrAdmin ? 'Descargar Reporte para Enfermería' : 'Imprimir Reporte para Enfermería'}
                            </span>
                            {consultation.printedDocs?.report && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                        </button>

                        <button 
                            onClick={() => onPrint('full_ficha')} 
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.fullFicha ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                        >
                            <FileText className={`w-8 h-8 mb-3 ${consultation.printedDocs?.fullFicha ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                            <span className="font-bold text-sm">
                                {isDoctor && !isNurseOrAdmin ? 'Descargar Ficha Completa' : 'Imprimir Ficha Completa'}
                            </span>
                            {consultation.printedDocs?.fullFicha && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                        </button>

                        {/* Botón de Entrega (SOLO ENFERMERÍA/ADMIN/RECEPCIÓN) */}
                        {canDeliver && consultation.status === 'finished' && (
                            <button 
                                onClick={onDeliver}
                                disabled={isSaving}
                                className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-900 text-white shadow-xl hover:bg-slate-800 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? <Loader2 className="animate-spin w-8 h-8 mb-3" /> : <CheckCircle className="w-8 h-8 mb-3 text-emerald-400" />}
                                <span className="font-bold text-sm">Confirmar Entrega</span>
                                <span className="text-[10px] mt-1 text-slate-400 font-medium">Finalizar Proceso</span>
                            </button>
                        )}
                        
                        {canDeliver && consultation.status === 'delivered' && (
                             <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-slate-100 border border-slate-200 text-slate-400 cursor-default">
                                <CheckCircle className="w-8 h-8 mb-3 text-slate-300" />
                                <span className="font-bold text-sm">Expediente Finalizado</span>
                             </div>
                        )}
                    </div>
                </div>
            )}

            {/* MODAL HISTORIAL COMPLETO */}
            <AnimatePresence>
            {showHistoryModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <motion.div initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.95}} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                        <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center rounded-t-2xl">
                            <h3 className="font-bold text-amber-900 text-lg flex items-center gap-2"><History className="w-5 h-5"/> Expediente Clínico</h3>
                            <button onClick={() => setShowHistoryModal(false)} className="p-2 bg-white rounded-full text-amber-800/60 hover:text-red-500 hover:bg-red-50 transition border border-amber-100"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 block">Antecedentes Registrados</label>
                                {(() => {
                                    const entries = parseMedicalHistory(patient?.medical_history);
                                    if (entries.length === 0) return (
                                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed">
                                            No hay antecedentes registrados.
                                        </div>
                                    );
                                    return (
                                        <div className="space-y-4">
                                            {entries.map(entry => (
                                                <div key={entry.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                                                    {entry.headerLine && (
                                                        <div className="bg-brand-900 px-4 py-2.5 flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <User className="w-3.5 h-3.5 text-brand-200" />
                                                                <span className="text-xs font-bold text-white">{entry.nurseName || 'Enfermería'}</span>
                                                            </div>
                                                            <span className="text-[10px] text-brand-200 font-medium">{entry.nurseDate}</span>
                                                        </div>
                                                    )}
                                                    <div className="p-4 space-y-3">
                                                        {Object.keys(entry.parsedVitals).length > 0 && (
                                                            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                                                {vitalsConfig.map(vc => {
                                                                    const val = entry.parsedVitals[vc.key];
                                                                    if (!val) return null;
                                                                    const Icon = vc.icon;
                                                                    return (
                                                                        <div key={vc.key} className={`${vc.bg} rounded-xl p-2 flex flex-col items-center gap-1 border border-slate-100`}>
                                                                            <Icon className={`w-3.5 h-3.5 ${vc.color}`} />
                                                                            <span className="text-[9px] font-bold text-slate-400 uppercase">{vc.label}</span>
                                                                            <span className="text-xs font-bold text-slate-800">{val} {vc.unit}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        {entry.obsLine && (
                                                            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                                                <p className="text-[10px] font-bold text-amber-700 uppercase mb-0.5">Observaciones</p>
                                                                <p className="text-xs text-amber-900 leading-relaxed">{entry.obsLine.replace(/^observaciones:\s*/i, '')}</p>
                                                            </div>
                                                        )}
                                                        {entry.otherLines.length > 0 && (
                                                            <p className="text-xs text-slate-600 leading-relaxed">{entry.otherLines.join(' · ')}</p>
                                                        )}
                                                        {!entry.headerLine && !entry.vitalsLine && !entry.obsLine && entry.otherLines.length === 0 && entry.raw && (
                                                            <p className="text-xs text-slate-600">{entry.raw}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Paperclip className="w-4 h-4"/> Archivos Adjuntos (Laboratorios, Rayos X)
                                </label>
                                
                                {patient?.historyFiles && patient.historyFiles.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                        {patient.historyFiles
                                          .slice()
                                          .sort((a, b) => {
                                              const ak = (a.name || '').toLowerCase();
                                              const bk = (b.name || '').toLowerCase();
                                              const aIsFicha = /ficha|presoft|presoftware|historia/i.test(ak);
                                              const bIsFicha = /ficha|presoft|presoftware|historia/i.test(bk);
                                              if (aIsFicha && !bIsFicha) return -1;
                                              if (!aIsFicha && bIsFicha) return 1;
                                              return (b.uploadedAt || 0) - (a.uploadedAt || 0);
                                          })
                                          .map((file, idx) => (
                                            <a 
                                            key={idx} 
                                            href={file.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={`group border rounded-xl p-4 flex flex-col items-center justify-center bg-white transition hover:shadow-md cursor-pointer relative ${
                                                /ficha|presoft|presoftware|historia/i.test((file.name || '')) 
                                                ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 shadow-md' 
                                                : 'border-slate-200 hover:bg-slate-50'
                                            }`}
                                            >
                                                <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition">
                                                    {file.type.includes('image') ? <Image className="w-5 h-5"/> : <FileText className="w-5 h-5"/>}
                                                </div>
                                                <p className="text-xs font-bold text-slate-700 text-center line-clamp-2 w-full break-words">{file.name}</p>
                                                <span className="text-[9px] text-slate-400 mt-1">{formatFileDate(file.uploadedAt)}</span>
                                                <ExternalLink className="absolute top-2 right-2 w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition"/>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                                        <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center mb-2">
                                            <FileText className="w-6 h-6 text-slate-300"/>
                                        </div>
                                        <p className="text-sm font-medium">No hay archivos adjuntos</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
            </AnimatePresence>
        </motion.div>
    );
};
