
import * as React from 'react';
import { useState } from 'react';
import { User, Phone, History, HeartPulse, Pill, FlaskConical, Share2, ShieldCheck, CheckCircle, CircleSlash, FileCheck, Clock, ArrowLeft, Printer, Loader2, AlertTriangle, FileText, Download, X, Paperclip, Image, ExternalLink } from 'lucide-react';
import { Consultation, Patient, UserProfile } from '../../../types.ts';
import { motion, AnimatePresence } from 'framer-motion';

interface ConsultationDetailProps {
    consultation: Consultation;
    patient: Patient | null;
    receptionistName: string;
    user: UserProfile;
    onBack: () => void;
    onPrint: (type: 'prescription' | 'labs' | 'report') => void;
    onDeliver: () => void;
    isSaving: boolean;
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
    isSaving
}) => {
    const isNurseOrAdmin = user.role === 'nurse' || user.role === 'admin';
    const isDoctor = user.role === 'doctor';
    
    // Si es nurse/admin o doctor, puede ver el panel de documentos
    const showDocsPanel = isNurseOrAdmin || isDoctor;

    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Helper para formatear fecha con Zona Horaria de Guatemala (Forzada)
    const formatDateTimeGT = (ts: number) => {
        if (!ts) return 'N/A';
        return new Date(ts).toLocaleString('es-GT', { 
            timeZone: 'America/Guatemala',
            dateStyle: 'medium', 
            timeStyle: 'short' 
        });
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-7xl mx-auto space-y-6 pb-12">
            
            {/* HEADER DE NAVEGACIÓN */}
            <div className="flex items-center gap-4 mb-2">
                <button onClick={onBack} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm">
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
                <h2 className="text-xl md:text-2xl font-bold text-slate-800">Detalle Completo del Expediente</h2>
            </div>

            {/* --- SECCIÓN 1: RESUMEN DE PERSONAL Y TIEMPOS --- */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
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

                            <div><label className="block text-[10px] text-slate-400 uppercase font-bold">Tipo Consulta</label><p className="font-medium text-brand-600">{patient?.consultationType || 'Nueva'}</p></div>
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
                    
                    {/* Diagnóstico */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <HeartPulse className="w-5 h-5 text-brand-600" /> Diagnóstico Médico 
                            {consultation.omittedFields?.diagnosis && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded font-bold uppercase">Omitido</span>}
                        </h3>
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                            {consultation.diagnosis || 'No se registró diagnóstico.'}
                        </div>
                    </div>

                    {/* Receta */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <Pill className="w-5 h-5 text-emerald-600" /> Tratamiento Farmacológico 
                            {consultation.omittedFields?.prescription && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded font-bold uppercase">Omitido</span>}
                        </h3>
                        {consultation.prescription && consultation.prescription.length > 0 ? (
                            <div className="border rounded-2xl overflow-hidden overflow-x-auto">
                                <table className="w-full text-sm min-w-[500px]">
                                    <thead className="bg-slate-50 text-slate-500 font-bold border-b"><tr><th className="p-3 text-left">Medicamento</th><th className="p-3 text-center">Cant</th><th className="p-3 text-left">Indicaciones</th></tr></thead>
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
                                {consultation.omittedFields?.exams && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded font-bold uppercase">Omitido</span>}
                            </h3>
                            {(consultation.referralGroups?.length || 0) > 0 || (consultation.exams && consultation.exams.length > 0) ? (
                                <div className="space-y-3">
                                    {consultation.referralGroups?.map((g, idx) => (
                                        <div key={idx} className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                            <p className="text-xs font-bold text-blue-800">{g.pathology}</p>
                                            <p className="text-xs text-blue-600 mt-1">{g.exams.join(', ')}</p>
                                        </div>
                                    ))}
                                    {consultation.exams?.filter(e => !consultation.referralGroups?.some(g => g.exams.includes(e))).map(e => (
                                        <div key={e} className="text-xs bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 inline-block mr-2 mb-2">{e}</div>
                                    ))}
                                    {consultation.referralNote && <p className="text-xs text-slate-500 italic mt-2 bg-slate-50 p-2 rounded">Nota: {consultation.referralNote}</p>}
                                </div>
                            ) : <p className="text-sm text-slate-400 italic">Sin laboratorios.</p>}
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                                <Share2 className="w-5 h-5 text-pink-600" /> Referencias 
                                {consultation.omittedFields?.referrals && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded font-bold uppercase">Omitido</span>}
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

                    {/* Notas de Enfermería */}
                    <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                            <ShieldCheck className="w-5 h-5 text-amber-600" /> Anotaciones para Enfermería 
                            {consultation.omittedFields?.nursing && <span className="text-[10px] bg-red-100 text-red-600 px-2 rounded font-bold uppercase">Omitido</span>}
                        </h3>
                        <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-2xl text-slate-700 text-sm leading-relaxed italic">
                            {consultation.followUpText || 'Sin instrucciones adicionales registradas.'}
                        </div>
                    </div>

                    {/* AUDITORÍA DE ENTREGA Y PAPELES */}
                    <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6">
                        <h3 className="font-bold text-slate-600 text-xs uppercase tracking-widest mb-4">Auditoría de Entrega y Documentación</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                            <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                                <span className="block font-bold text-slate-500 mb-3">Documentos Impresos:</span>
                                <div className="flex gap-2 flex-wrap">
                                    {consultation.printedDocs?.prescription ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Receta</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Receta</span>}
                                    {consultation.printedDocs?.labs ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Labs</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Labs</span>}
                                    {consultation.printedDocs?.report ? <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg font-bold flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Ficha</span> : <span className="px-2 py-1 bg-slate-100 text-slate-400 rounded-lg flex items-center gap-1"><CircleSlash className="w-3.5 h-3.5" /> Ficha</span>}
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
                                    {Object.entries(consultation.omittedFields || {}).filter(([_, v]) => v).map(([k, _]) => (
                                        <span key={k} className="px-3 py-1 bg-orange-50 border border-orange-100 text-orange-600 rounded-lg text-[10px] uppercase font-bold">
                                            {OMISSION_TRANSLATIONS[k] || k}
                                        </span>
                                    ))}
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
                        {/* Botones de Impresión/Descarga */}
                        
                        {/* RECETA */}
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

                        {/* FICHA */}
                        <button 
                            onClick={() => onPrint('report')} 
                            className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all group ${consultation.printedDocs?.report ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:shadow-lg'}`}
                        >
                            <FileText className={`w-8 h-8 mb-3 ${consultation.printedDocs?.report ? 'text-emerald-600' : 'text-slate-400 group-hover:text-brand-500'}`} />
                            <span className="font-bold text-sm">
                                {isDoctor && !isNurseOrAdmin ? 'Descargar Ficha' : 'Imprimir Ficha'}
                            </span>
                            {consultation.printedDocs?.report && <span className="text-[10px] mt-1 font-bold uppercase tracking-wider flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Impreso</span>}
                        </button>

                        {/* Botón de Entrega (SOLO ENFERMERÍA/ADMIN) */}
                        {isNurseOrAdmin && consultation.status === 'finished' && (
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
                        
                        {consultation.status === 'delivered' && (
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
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 block">Antecedentes Registrados</label>
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                    {patient?.medical_history || "No hay antecedentes registrados."}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Paperclip className="w-4 h-4"/> Archivos Adjuntos (Laboratorios, Rayos X)
                                </label>
                                
                                {patient?.historyFiles && patient.historyFiles.length > 0 ? (
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
