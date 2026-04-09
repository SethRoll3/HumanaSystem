
import * as React from 'react';
import { useEffect, useState, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { History, Activity, Calendar, FileText, Stethoscope, Lock, User, Eye, X, Pill, Thermometer, EyeOff, Paperclip, Image, File, FlaskConical, Download, ExternalLink, Share2, ShieldCheck, StickyNote, AlertTriangle, Scale, Wind, HeartPulse, Droplets } from 'lucide-react';
import { db } from '../../firebase/config.ts';
import { Patient, UserProfile, Consultation } from '../../types.ts';
import { motion } from 'framer-motion';
import { ReferralNotesAlert } from './ReferralNotesAlert';

interface StepDiagnosisProps {
  patient: Patient;
  currentUser: UserProfile;
}

export const StepDiagnosis: React.FC<StepDiagnosisProps> = ({ patient, currentUser }) => {
  const { register, formState: { errors } } = useFormContext();
  const [history, setHistory] = useState<Consultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedMedicalRecords, setExpandedMedicalRecords] = useState<Record<string, boolean>>({});
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const formatFileDate = (value: any) => {
    if (!value) return 'Sin fecha';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-GT');
  };
  const OMISSION_LABELS: Record<string, string> = {
    diagnosis: 'Diagnóstico médico',
    prescription: 'Receta / tratamiento',
    exams: 'Laboratorios',
    referrals: 'Referencias a especialistas',
    nursing: 'Notas de enfermería',
    signature: 'Firma del médico',
  };

  useEffect(() => {
    const fetchHistory = async () => {
      if (!patient?.id) return;
      setLoadingHistory(true);
      try {
        const q = query(
          collection(db, 'consultations'),
          where('patientId', '==', patient.id)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs
            .map(doc => ({ id: doc.id, ...(doc.data() as any) } as Consultation))
            // FIX: Include both FINISHED and DELIVERED status
            .filter(c => c.status === 'finished' || c.status === 'delivered')
            .sort((a, b) => b.date - a.date);
            
        setHistory(data);

      } catch (error) {
        console.error("Error fetching patient history", error);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [patient]);

  const parseVitals = (vitalsLine: string) => {
    const result: Record<string, string> = {};
    if (!vitalsLine) return result;
    const parts = vitalsLine.split(/[|,]/).map(p => p.trim()).filter(Boolean);
    parts.forEach(part => {
      const match = part.match(/^(Peso|P\/A|FR|FC|SAT|Temp)[:\s]+(.+)/i);
      if (match) {
        result[match[1].toLowerCase().replace('/', '_')] = match[2].trim();
      }
    });
    return result;
  };

  const vitalsConfig = [
    { key: 'peso', label: 'Peso', icon: Scale, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'p_a', label: 'P/A', icon: Activity, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'fr', label: 'FR', icon: Wind, color: 'text-sky-600', bg: 'bg-sky-50' },
    { key: 'fc', label: 'FC', icon: HeartPulse, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'sat', label: 'SAT', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'temp', label: 'Temp', icon: Thermometer, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const medicalHistoryEntries = useMemo(() => {
    const text = (patient?.medical_history || '').trim();
    if (!text) return [];
    return text.split(/\n{2,}/).map((block, idx) => {
      const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
      const headerLine = lines.find(line => line.startsWith('[Enfermería:')) || '';
      const vitalsLine = lines.find(line =>
        /Peso:|P\/A:|FR:|FC:|SAT:|Temp:/i.test(line)
      ) || '';
      const obsLine = lines.find(line => line.toLowerCase().startsWith('observaciones:')) || '';
      const otherLines = lines.filter(line => line !== headerLine && line !== vitalsLine && line !== obsLine);
      const parsedVitals = parseVitals(vitalsLine);
      // Parse header for nurse name and date
      let nurseName = '';
      let nurseDate = '';
      if (headerLine) {
        const hMatch = headerLine.match(/\[Enfermería:\s*(.+?)\s*-\s*(.+?)\]/);
        if (hMatch) {
          nurseName = hMatch[1].trim();
          nurseDate = hMatch[2].trim();
        }
      }
      return {
        id: `${idx}-${lines.length}`,
        headerLine,
        vitalsLine,
        obsLine,
        otherLines,
        parsedVitals,
        nurseName,
        nurseDate,
        raw: block.trim()
      };
    });
  }, [patient?.medical_history]);

  const filteredHistory = history;

  const getOptionalExams = (c: Consultation) => {
      const allExams = c.exams || [];
      const groupedExams = new Set<string>();
      c.referralGroups?.forEach(g => g.exams.forEach(e => groupedExams.add(e)));
      return allExams.filter(e => !groupedExams.has(e));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between border-b pb-4 mb-6">
        <h3 className="text-xl font-bold text-slate-800">Evaluación Clínica</h3>
        <span className="text-sm font-medium text-brand-600 bg-brand-50 px-3 py-1 rounded-full">Paso 1 de 4</span>
      </div>

      <ReferralNotesAlert
        patientId={patient.id}
        doctorSpecialties={currentUser.specialties || (currentUser.specialty ? [currentUser.specialty] : [])}
      />
      
      {/* --- SECCIÓN A: HISTORIAL (TOP) --- */}
      <div className="space-y-6">
          {/* A1. Consultas Previas con filtros (ocupa todo el ancho) */}
          <motion.div 
             initial={{ y: -10, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             transition={{ delay: 0.1 }}
             className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4"
          >
             <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                 <h4 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                    <Activity className="w-5 h-5 text-brand-600"/> Consultas Previas ({filteredHistory.length})
                 </h4>
             </div>
             
             {loadingHistory ? (
                <div className="flex items-center justify-center py-6">
                    <p className="text-sm text-slate-400 animate-pulse">Cargando...</p>
                </div>
             ) : history.length === 0 ? (
                <div className="text-center py-6">
                     <p className="text-sm text-slate-500 italic">No hay consultas finalizadas previas.</p>
                </div>
             ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                   {filteredHistory.map((cons) => {
                     const consDate = new Date(cons.date);
                     const consKey = (cons.id as string) || String(cons.date);
                     const hasPrescription = (cons.prescription && cons.prescription.length > 0) || !!cons.prescriptionNotes;
                     const hasLabsSection =
                       (cons.referralGroups && cons.referralGroups.length > 0) ||
                       (cons.exams && cons.exams.length > 0) ||
                       !!cons.referralNote;
                     const hasSpecialtyRefs = !!(cons.specialtyReferrals && cons.specialtyReferrals.length > 0);
                     const hasNurseNotes = !!cons.followUpText;
                     const hasVitals = !!cons.vitals;
                     const hasMentalObservation = !!cons.mentalHealthObservation;
                     const omissionEntries = Object.entries(cons.omittedFields || {}).filter(
                       ([, value]) => !!value
                     );
                     const hasOmissions = omissionEntries.length > 0;

                     return (
                      <div
                        key={consKey}
                        className="bg-slate-100 border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-white text-brand-600 p-2 rounded-xl border border-slate-200">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">
                                {consDate.toLocaleDateString()}
                                <span className="ml-2 text-[11px] text-slate-500">
                                  {consDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </p>
                              <p className="text-xs text-slate-500">
                                Dr. {cons.doctorName?.replace('Dr. ', '') || 'Sin nombre'}
                                {(cons as any).doctorSpecialty && (
                                  <span className="ml-1 text-[10px] text-slate-400">
                                    · {(cons as any).doctorSpecialty}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px]">
                            <span className="px-2 py-1 rounded-full bg-slate-800 text-white uppercase tracking-wide">
                              {cons.status === 'finished'
                                ? 'Finalizada'
                                : cons.status === 'delivered'
                                ? 'Entregada'
                                : cons.status}
                            </span>
                            {cons.followUpRequired && (
                              <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Seguimiento
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="bg-slate-800 text-white p-1.5 rounded-lg">
                                <Stethoscope className="w-3 h-3" />
                              </div>
                              <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Diagnóstico</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-slate-200 text-slate-700 text-xs md:text-sm leading-relaxed">
                              {cons.diagnosis || 'Sin diagnóstico registrado.'}
                            </div>
                          </div>

                          <div className="bg-emerald-50 border-2 border-emerald-300 ring-2 ring-emerald-200 rounded-2xl p-4 shadow-md">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="bg-emerald-600 text-white p-1.5 rounded-lg shadow-sm">
                                <Pill className="w-3 h-3" />
                              </div>
                              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Receta médica</p>
                            </div>
                            {hasPrescription ? (
                              <div className="space-y-2">
                                {cons.prescription && cons.prescription.length > 0 && (
                                  <div className="border border-emerald-200 rounded-xl overflow-hidden overflow-x-auto bg-white">
                                    <table className="w-full text-xs md:text-sm text-left min-w-[380px]">
                                      <thead className="bg-emerald-100 text-emerald-700 font-semibold border-b border-emerald-200">
                                        <tr>
                                          <th className="px-3 py-2 md:px-4">Medicamento</th>
                                          <th className="px-3 py-2 md:px-4">Cant</th>
                                          <th className="px-3 py-2 md:px-4">Ind</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-emerald-50">
                                        {cons.prescription.map((item, idx) => (
                                          <tr key={idx} className="bg-white">
                                            <td className="px-3 py-2 md:px-4 font-medium text-slate-800">{item.name}</td>
                                            <td className="px-3 py-2 md:px-4 text-slate-600">{item.quantity}</td>
                                            <td className="px-3 py-2 md:px-4 text-slate-500 italic">{item.dosage}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {cons.prescriptionNotes && (
                                  <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-xl">
                                    <p className="text-[10px] font-bold text-yellow-700 uppercase mb-1 flex items-center gap-1">
                                      <StickyNote className="w-3 h-3" /> Notas / Cuidados
                                    </p>
                                    <p className="text-xs text-yellow-900">{cons.prescriptionNotes}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-[11px] text-emerald-600 italic">Sin receta registrada.</p>
                            )}
                          </div>

                          {hasLabsSection && (
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="bg-sky-50 text-sky-700 p-1.5 rounded-lg border border-sky-100">
                                  <FlaskConical className="w-3 h-3" />
                                </div>
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  Laboratorios y Diagnósticos Genéricos
                                </p>
                              </div>
                              <div className="space-y-3">
                                {cons.referralNote && (
                                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800">
                                    <span className="font-semibold">Nota general: </span>
                                    {cons.referralNote}
                                  </div>
                                )}
                                {cons.referralGroups?.map((group, idx) => (
                                  <div
                                    key={group.id || idx}
                                    className="p-3 rounded-lg border bg-brand-50/20 border-brand-100"
                                  >
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-sm font-bold text-brand-800">{group.pathology}</span>
                                    </div>
                                    {group.note && (
                                      <p className="text-xs text-slate-500 italic mb-2 bg-white p-2 rounded border border-slate-100">
                                        {group.note}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1">
                                      {group.exams.map((e) => (
                                        <span
                                          key={e}
                                          className="px-2 py-0.5 bg-white text-slate-600 rounded text-[10px] border shadow-sm"
                                        >
                                          {e}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                {(() => {
                                  const optionals = getOptionalExams(cons);
                                  if (optionals.length > 0) {
                                    return (
                                      <div className="p-3 rounded-lg border bg-slate-50 border-slate-200">
                                        <span className="text-xs font-bold text-slate-500 block mb-2 uppercase">
                                          Otros exámenes / Laboratorios
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                          {optionals.map((e) => (
                                            <span
                                              key={e}
                                              className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] border border-slate-200 font-medium"
                                            >
                                              {e}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          )}

                          {hasSpecialtyRefs && (
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="bg-pink-50 text-pink-700 p-1.5 rounded-lg border border-pink-100">
                                  <Share2 className="w-3 h-3" />
                                </div>
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  Referencia a especialistas
                                </p>
                              </div>
                              <div className="space-y-2">
                                {cons.specialtyReferrals?.map((ref) => (
                                  <div
                                    key={ref.id}
                                    className="p-3 bg-pink-50 border border-pink-100 rounded-xl text-xs text-pink-900"
                                  >
                                    <span className="text-[11px] font-bold uppercase block">{ref.specialty}</span>
                                    {ref.note && <p className="mt-1 italic">{ref.note}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {hasNurseNotes && (
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="bg-slate-800 text-white p-1.5 rounded-lg">
                                  <ShieldCheck className="w-3 h-3" />
                                </div>
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  Notas de enfermería
                                </p>
                              </div>
                              <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs md:text-sm text-slate-600 italic leading-relaxed">
                                {cons.followUpText}
                              </div>
                            </div>
                          )}

                          {(hasVitals || hasMentalObservation) && (
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="bg-slate-100 text-slate-700 p-1.5 rounded-lg border border-slate-200">
                                  <Thermometer className="w-3 h-3" />
                                </div>
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  Resumen clínico
                                </p>
                              </div>
                              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 text-xs md:text-sm text-slate-700">
                                {hasVitals && cons.vitals && (
                                  <div>
                                    <p className="font-semibold mb-1">Signos vitales</p>
                                    <p>Temperatura: {cons.vitals.temp} °C</p>
                                    <p>Peso: {cons.vitals.weight} kg</p>
                                    <p>Presión arterial: {cons.vitals.pressure}</p>
                                  </div>
                                )}
                                {hasMentalObservation && cons.mentalHealthObservation && (
                                  <div>
                                    <p className="font-semibold mb-1">Observación de salud mental</p>
                                    <p className="italic">{cons.mentalHealthObservation}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {cons.importantNotices && (
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="bg-red-50 text-red-600 p-1.5 rounded-lg border border-red-100">
                                  <AlertTriangle className="w-3 h-3" />
                                </div>
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  Avisos importantes
                                </p>
                              </div>
                              <div className="p-3 bg-red-50/60 border border-red-100 rounded-xl text-xs md:text-sm text-red-900 leading-relaxed">
                                {cons.importantNotices}
                              </div>
                            </div>
                          )}

                          {hasOmissions && (
                            <div className="md:col-span-2">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="bg-slate-900 text-white p-1.5 rounded-lg">
                                  <FileText className="w-3 h-3" />
                                </div>
                                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                  Omisiones en esta consulta
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {omissionEntries.map(([key, value]) => {
                                  const v = value as boolean | string;
                                  const label = OMISSION_LABELS[key] || key;
                                  const isEdited = v === 'edited';
                                  return (
                                    <span
                                      key={key}
                                      className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${
                                        isEdited
                                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                                          : 'bg-red-50 border-red-200 text-red-700'
                                      }`}
                                    >
                                      {label}
                                      {isEdited ? ' (editado)' : ' omitido'}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                     );
                   })}
                </div>
             )}
          </motion.div>

          {/* A2. Antecedentes (queda debajo y ocupa ancho completo) */}
          <motion.div 
             initial={{ y: 10, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             transition={{ delay: 0.15 }}
             className="bg-amber-50/60 border border-amber-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between"
          >
             <div>
                <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2 text-base">
                    <History className="w-5 h-5"/> Signos Vitales
                </h4>
                {medicalHistoryEntries.length === 0 ? (
                    <p className="text-sm text-slate-600 mb-4">
                        Sin registro detallado.
                    </p>
                ) : (
                    <div className="space-y-4 mb-4">
                        {medicalHistoryEntries.map((entry, entryIdx) => (
                            <div
                                key={entry.id}
                                className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden"
                            >
                                {/* Header: Enfermera y fecha */}
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
                                    {/* Vitals grid con íconos */}
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
                                                        <span className="text-xs font-bold text-slate-800">{val}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* Observaciones */}
                                    {entry.obsLine && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                            <p className="text-[10px] font-bold text-amber-700 uppercase mb-0.5">Observaciones</p>
                                            <p className="text-xs text-amber-900 leading-relaxed">{entry.obsLine.replace(/^observaciones:\s*/i, '')}</p>
                                        </div>
                                    )}
                                    {/* Otras líneas */}
                                    {entry.otherLines.length > 0 && (
                                        <p className="text-xs text-slate-600 leading-relaxed">{entry.otherLines.join(' · ')}</p>
                                    )}
                                    {/* Fallback si no hay nada estructurado */}
                                    {!entry.headerLine && !entry.vitalsLine && !entry.obsLine && entry.otherLines.length === 0 && entry.raw && (
                                        <p className="text-xs text-slate-600">{entry.raw}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {patient.historyFiles && patient.historyFiles.length > 0 && (
                    <div className="mb-4">
                        <div className="flex flex-wrap gap-2 mb-2">
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full flex items-center gap-1">
                                <Paperclip className="w-3 h-3"/> {patient.historyFiles.length} Archivos Adjuntos
                            </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                                  className={`group border rounded-xl p-3 flex items-center gap-2 bg-white hover:shadow transition ${
                                    /ficha|presoft|presoftware|historia/i.test((file.name || ''))
                                    ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 shadow-md'
                                    : 'border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="w-8 h-8 bg-brand-50 text-brand-600 rounded-lg flex items-center justify-center">
                                    {file.type.includes('image') ? <Image className="w-4 h-4"/> : <FileText className="w-4 h-4"/>}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-slate-700 truncate">{file.name}</p>
                                    <span className="text-[9px] text-slate-400">{formatFileDate(file.uploadedAt)}</span>
                                  </div>
                                  <ExternalLink className="w-3 h-3 text-slate-300" />
                                </a>
                              ))}
                        </div>
                    </div>
                )}
             </div>
             <button 
                type="button" 
                onClick={() => setShowHistoryModal(true)}
                className="self-start text-xs font-bold bg-white text-amber-700 px-4 py-2 rounded-lg border border-amber-200 hover:bg-amber-100 transition shadow-sm flex items-center gap-2 mt-4"
             >
                <FileText className="w-4 h-4" /> Ver Expediente Completo
             </button>
          </motion.div>
      </div>

      <hr className="border-slate-200" />

      {/* --- SECCIÓN B: RESUMEN DE CONSULTA --- */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="bg-slate-800 text-white p-1.5 rounded-lg">
                <Stethoscope className="w-4 h-4"/>
            </div>
            Resumen de consulta
          </h4>
          
          <textarea 
            rows={8}
            {...register('diagnosis', { required: "El diagnóstico es obligatorio" })}
            className={`w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 block p-4 placeholder-slate-400 shadow-sm transition-all resize-none ${errors.diagnosis ? 'border-red-500' : ''}`}
            placeholder="Escriba aquí el cuadro clínico detallado, síntomas observados y conclusiones médicas..."
          />
          {errors.diagnosis && <span className="text-red-500 text-xs font-semibold mt-2 ml-1 block">{errors.diagnosis.message as string}</span>}
      </motion.div>

      {/* --- MODAL 1: ANTECEDENTES Y ARCHIVOS --- */}
      {showHistoryModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                  <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex justify-between items-center rounded-t-2xl">
                      <h3 className="font-bold text-amber-900 text-lg flex items-center gap-2"><History className="w-5 h-5"/> Expediente Clínico</h3>
                      <button onClick={() => setShowHistoryModal(false)} className="p-2 bg-white rounded-full text-amber-800/60 hover:text-red-500 hover:bg-red-50 transition border border-amber-100"><X className="w-5 h-5" /></button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 block">Antecedentes Registrados</label>
                          {medicalHistoryEntries.length === 0 ? (
                              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed">
                                  No hay antecedentes registrados.
                              </div>
                          ) : (
                              <div className="space-y-4">
                                  {medicalHistoryEntries.map(entry => (
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
                                                                  <span className="text-xs font-bold text-slate-800">{val}</span>
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
                          )}
                      </div>

                      <div>
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                              <Paperclip className="w-4 h-4"/> Archivos Adjuntos (Laboratorios, Rayos X)
                          </label>
                          
                          {patient.historyFiles && patient.historyFiles.length > 0 ? (
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                  {patient.historyFiles.map((file, idx) => (
                                      <a 
                                        key={idx} 
                                        href={file.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="group border border-slate-200 rounded-xl p-4 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition hover:shadow-md cursor-pointer relative"
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
                                      <File className="w-6 h-6 text-slate-300"/>
                                  </div>
                                  <p className="text-sm font-medium">No hay archivos adjuntos</p>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- MODAL 2: DETALLE CONSULTA PASADA (FULL) --- */}
    </motion.div>
  );
};
