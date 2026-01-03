
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { History, Activity, Calendar, FileText, Stethoscope, Lock, User, Eye, X, Pill, Thermometer, EyeOff, Paperclip, Image, File, FlaskConical, Download, ExternalLink, Share2, ShieldCheck, StickyNote } from 'lucide-react';
import { db } from '../../firebase/config.ts';
import { Patient, UserProfile, Consultation } from '../../../types.ts';
import { motion } from 'framer-motion';

interface StepDiagnosisProps {
  patient: Patient;
  currentUser: UserProfile;
}

export const StepDiagnosis: React.FC<StepDiagnosisProps> = ({ patient, currentUser }) => {
  const { register, formState: { errors } } = useFormContext();
  const [history, setHistory] = useState<Consultation[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Modals
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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

  // Helper to extract optional exams (those NOT in groups)
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
      
      {/* --- SECCIÓN A: HISTORIAL (TOP) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* A1. Antecedentes (Card Resumen) */}
          <motion.div 
             initial={{ x: -20, opacity: 0 }}
             animate={{ x: 0, opacity: 1 }}
             transition={{ delay: 0.1 }}
             className="bg-amber-50/60 border border-amber-200 rounded-2xl p-6 shadow-sm h-full flex flex-col justify-between"
          >
             <div>
                <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2 text-base">
                    <History className="w-5 h-5"/> Antecedentes Médicos
                </h4>
                <p className="text-sm text-slate-600 mb-4 line-clamp-3">
                    {patient.medical_history || "Sin registro detallado."}
                </p>
                {patient.historyFiles && patient.historyFiles.length > 0 && (
                    <div className="mb-4 flex flex-wrap gap-2">
                         <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full flex items-center gap-1">
                             <Paperclip className="w-3 h-3"/> {patient.historyFiles.length} Archivos Adjuntos
                         </span>
                    </div>
                )}
             </div>
             <button 
                type="button" 
                onClick={() => setShowHistoryModal(true)}
                className="self-start text-xs font-bold bg-white text-amber-700 px-4 py-2 rounded-lg border border-amber-200 hover:bg-amber-100 transition shadow-sm flex items-center gap-2"
             >
                <FileText className="w-4 h-4" /> Ver Expediente Completo
             </button>
          </motion.div>

          {/* A2. Consultas Previas (Lista Compacta) */}
          <motion.div 
             initial={{ x: 20, opacity: 0 }}
             animate={{ x: 0, opacity: 1 }}
             transition={{ delay: 0.2 }}
             className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm max-h-[300px] overflow-y-auto custom-scrollbar flex flex-col"
          >
             <div className="flex items-center justify-between mb-4 sticky top-0 bg-slate-50 pb-2 border-b border-slate-200 z-10">
                 <h4 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                    <Activity className="w-5 h-5 text-brand-600"/> Consultas Previas ({history.length})
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
                <div className="space-y-2">
                   {history.map((cons) => (
                      <div key={cons.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-all flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                             <div className="bg-brand-100 text-brand-600 p-2 rounded-lg">
                                 <Calendar className="w-3 h-3" />
                             </div>
                             <div>
                                 <p className="text-sm font-bold text-slate-800">{new Date(cons.date).toLocaleDateString()}</p>
                                 <p className="text-xs text-slate-500">Dr. {cons.doctorName?.replace('Dr. ', '')}</p>
                             </div>
                          </div>
                          <button 
                            type="button"
                            onClick={() => setSelectedConsultation(cons)}
                            className="text-xs font-medium bg-slate-100 text-slate-600 hover:text-brand-700 px-3 py-1.5 rounded-full border border-slate-200 transition-colors"
                          >
                             Ver
                          </button>
                      </div>
                   ))}
                </div>
             )}
          </motion.div>
      </div>

      <hr className="border-slate-200" />

      {/* --- SECCIÓN B: DIAGNÓSTICO --- */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <div className="bg-slate-800 text-white p-1.5 rounded-lg">
                <Stethoscope className="w-4 h-4"/>
            </div>
            Diagnóstico Médico
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
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 block">Antecedentes Registrados</label>
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                              {patient.medical_history || "No hay antecedentes registrados."}
                          </div>
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
                                          <span className="text-[9px] text-slate-400 mt-1">{new Date(file.uploadedAt).toLocaleDateString()}</span>
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
      {selectedConsultation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center rounded-t-2xl shrink-0">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">Consulta del {new Date(selectedConsultation.date).toLocaleDateString()}</h3>
                        <p className="text-xs text-slate-500">Dr. {selectedConsultation.doctorName}</p>
                    </div>
                    <button onClick={() => setSelectedConsultation(null)} className="p-2 bg-white rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition shadow-sm border border-slate-200"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* 1. Diagnostico */}
                    <div>
                        <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Stethoscope className="w-3 h-3"/> Diagnóstico</h5>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-slate-700 text-sm leading-relaxed">
                            {selectedConsultation.diagnosis || "Sin diagnóstico registrado."}
                        </div>
                    </div>

                    {/* 2. Receta */}
                    {(selectedConsultation.prescription && selectedConsultation.prescription.length > 0) || selectedConsultation.prescriptionNotes ? (
                        <div>
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Pill className="w-3 h-3" /> Receta Médica</h5>
                            
                            {selectedConsultation.prescription && selectedConsultation.prescription.length > 0 && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden mb-3 overflow-x-auto">
                                    <table className="w-full text-sm text-left min-w-[400px]">
                                        <thead className="bg-slate-100 text-slate-500 font-semibold border-b border-slate-200">
                                            <tr><th className="px-4 py-2">Medicamento</th><th className="px-4 py-2">Cant</th><th className="px-4 py-2">Ind</th></tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {selectedConsultation.prescription.map((item, idx) => (
                                                <tr key={idx} className="bg-white">
                                                    <td className="px-4 py-2 font-medium text-slate-800">{item.name}</td>
                                                    <td className="px-4 py-2 text-slate-600">{item.quantity}</td>
                                                    <td className="px-4 py-2 text-slate-500 italic">{item.dosage}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {selectedConsultation.prescriptionNotes && (
                                <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-xl">
                                    <p className="text-[10px] font-bold text-yellow-700 uppercase mb-1 flex items-center gap-1"><StickyNote className="w-3 h-3"/> Notas / Cuidados:</p>
                                    <p className="text-xs text-yellow-900">{selectedConsultation.prescriptionNotes}</p>
                                </div>
                            )}
                        </div>
                    ) : null}

                    {/* 3. Referencias y Patologías (LABS) */}
                    {(selectedConsultation.referralGroups?.length || 0) > 0 || (selectedConsultation.exams && selectedConsultation.exams.length > 0) || selectedConsultation.referralNote ? (
                         <div>
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><FlaskConical className="w-3 h-3" /> Laboratorios y Patologías</h5>
                            <div className="space-y-3">
                                {/* Nota General */}
                                {selectedConsultation.referralNote && <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg text-xs text-blue-800"><strong>Nota General:</strong> {selectedConsultation.referralNote}</div>}
                                
                                {/* Grupos de Patologías */}
                                {selectedConsultation.referralGroups?.map((group, idx) => (
                                    <div key={idx} className="p-3 rounded-lg border bg-brand-50/20 border-brand-100">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-sm font-bold text-brand-800">{group.pathology}</span>
                                        </div>
                                        {group.note && <p className="text-xs text-slate-500 italic mb-2 bg-white p-2 rounded border border-slate-100">{group.note}</p>}
                                        <div className="flex flex-wrap gap-1">
                                            {group.exams.map(e => <span key={e} className="px-2 py-0.5 bg-white text-slate-600 rounded text-[10px] border shadow-sm">{e}</span>)}
                                        </div>
                                    </div>
                                ))}

                                {/* Exámenes Opcionales (que no están en grupos) - Includes OTROS/Labs */}
                                {(() => {
                                    const optionals = getOptionalExams(selectedConsultation);
                                    if (optionals.length > 0) {
                                        return (
                                            <div className="p-3 rounded-lg border bg-slate-50 border-slate-200">
                                                <span className="text-xs font-bold text-slate-500 block mb-2 uppercase">Otros Exámenes / Laboratorios</span>
                                                <div className="flex flex-wrap gap-1">
                                                    {optionals.map(e => (
                                                        <span key={e} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] border border-slate-200 font-medium">
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
                    ) : null}

                    {/* 4. Referencias a Especialistas */}
                    {selectedConsultation.specialtyReferrals && selectedConsultation.specialtyReferrals.length > 0 && (
                        <div>
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><Share2 className="w-3 h-3" /> Referencia a Especialistas</h5>
                            <div className="space-y-2">
                                {selectedConsultation.specialtyReferrals.map((ref, idx) => (
                                    <div key={idx} className="p-3 bg-pink-50 border border-pink-100 rounded-xl">
                                        <span className="text-xs font-bold text-pink-700 uppercase block">{ref.specialty}</span>
                                        {ref.note && <p className="text-xs text-pink-900 mt-1 italic">{ref.note}</p>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 5. Notas de Enfermería */}
                    {selectedConsultation.followUpText && (
                        <div>
                            <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-2"><ShieldCheck className="w-3 h-3"/> Notas de Enfermería</h5>
                            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 italic leading-relaxed">
                                {selectedConsultation.followUpText}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </motion.div>
  );
};
