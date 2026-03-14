
import * as React from 'react';
import { useState, useEffect } from 'react';
import { Book, FileText, Eye, Clock, HeartPulse, Pill, FlaskConical, X } from 'lucide-react';
import { Consultation, Patient, UserProfile } from '../../types';
import { patientService } from '../../services/patientService';
import { motion, AnimatePresence } from 'framer-motion';
import { SpecialtyFormDefinition } from '../Wizard/SpecialtyForms/types';
import { specialtyFormsService } from '../../services/specialtyFormsService';
import { translateSpecialtyLabel } from '../../utils/specialtyTranslation';

interface CuadernoProps {
    patient: Patient;
    currentUser: UserProfile;
    showHeader?: boolean;
}

export const Cuaderno: React.FC<CuadernoProps> = ({ patient, currentUser, showHeader = true }) => {
    const [history, setHistory] = useState<Consultation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedFicha, setSelectedFicha] = useState<Consultation | null>(null);
    const [specialtyForms, setSpecialtyForms] = useState<SpecialtyFormDefinition[]>([]);

    useEffect(() => {
        const loadData = async () => {
            if (!patient?.id) return;
            setLoading(true);
            try {
                const consultations = await patientService.getHistory(patient.id);
                setHistory(consultations);
            } catch (error) {
                console.error("Error loading data for cuaderno", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [patient.id]);

    useEffect(() => {
        let isMounted = true;
        const loadForms = async () => {
            try {
                const forms = await specialtyFormsService.getAll();
                if (isMounted) {
                    setSpecialtyForms(forms);
                }
            } catch (error) {
                console.error("Error loading specialty forms for cuaderno", error);
            }
        };
        loadForms();
        return () => {
            isMounted = false;
        };
    }, []);

    if (loading) return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 mb-6">
            <div className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                <div className="h-4 w-32 bg-slate-100 rounded" />
            </div>
            <div className="mt-6 h-32 bg-slate-50 rounded-2xl animate-pulse" />
        </div>
    );

    if (history.length === 0) return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 mb-6 text-center">
            <div className="flex flex-col items-center gap-3 text-slate-400">
                <Book className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium italic">No se encontraron fichas previas para este paciente en el cuaderno.</p>
            </div>
        </div>
    );

    const orderedHistory = [...history].sort((a, b) => a.date - b.date);
    const firstFicha = orderedHistory[0];
    const otherFichas = orderedHistory.slice(1);

    const formatDateTimeGT = (ts: number) => {
        if (!ts) return 'N/A';
        return new Date(ts).toLocaleString('es-GT', { 
            timeZone: 'America/Guatemala',
            dateStyle: 'medium', 
            timeStyle: 'short' 
        });
    };

    const resolveFieldLabel = (formId: string | undefined, fieldKey: string) => {
        return translateSpecialtyLabel(fieldKey, specialtyForms, formId).toUpperCase();
    };

    const renderSpecialtyData = (ficha: Consultation, isModal = false) => {
        const specialtyData = (ficha as any).specialtyData as Record<string, any> | undefined;
        if (!specialtyData) return null;

        const formId = (ficha as any).specialtyFormId as string | undefined;

        const activeForm = formId
            ? specialtyForms.find(f => f.id === formId)
            : undefined;

        const allowedIds = activeForm
            ? new Set(
                  activeForm.sections.flatMap(section =>
                      section.fields.map(field => field.id)
                  )
              )
            : undefined;

        const entries = Object.entries(specialtyData).filter(([key]) =>
            allowedIds ? allowedIds.has(key) : true
        );

        if (entries.length === 0) return null;

        return (
            <div className={`grid grid-cols-1 ${isModal ? 'sm:grid-cols-1 md:grid-cols-2' : 'sm:grid-cols-2'} gap-x-6 gap-y-4`}>
                {entries.map(([key, value]) => {
                    const label = resolveFieldLabel(formId, key);
                    const displayValue =
                        value === undefined || value === null || value === ''
                            ? 'Sin dato'
                            : String(value);

                    return (
                        <div key={key} className="border-b border-slate-50 pb-2">
                            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                                {label}
                            </h5>
                            <p className="text-xs text-slate-700 font-medium">
                                {displayValue}
                            </p>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 lg:p-8 mb-6">
            {showHeader && (
                <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-brand-100 text-brand-600 rounded-lg">
                        <Book className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 tracking-tight">Cuaderno del Paciente</h3>
                </div>
            )}

            {/* PRIMERA FICHA - MOSTRADA SIEMPRE */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                        <span className="text-white text-[10px] font-bold uppercase tracking-[0.2em]">Ficha Original / Registro Inicial</span>
                    </div>
                    <span className="text-slate-400 text-xs font-mono">{formatDateTimeGT(firstFicha.date)}</span>
                </div>
                
                <div className="p-6 space-y-6">
                    <div className="flex flex-wrap gap-6 items-start justify-between border-b border-slate-50 pb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100">
                                <FileText className="w-6 h-6 text-slate-400" />
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Médico que aperturó</h4>
                                <p className="text-sm font-bold text-slate-800">Dr. {firstFicha.doctorName}</p>
                                <p className="text-[10px] text-brand-600 font-bold uppercase tracking-tight">{firstFicha.doctorSpecialty}</p>
                            </div>
                        </div>
                        <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Motivo Inicial</h4>
                            <p className="text-xs font-bold text-slate-700">{firstFicha.consultationType || 'N/A'}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-4 bg-brand-500 rounded-full" />
                            <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-widest">Información Clínica de la Ficha</h4>
                        </div>
                        <div className="p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">
                            {renderSpecialtyData(firstFicha) || (
                                <p className="text-xs text-slate-500 italic">No hay datos específicos de especialidad en esta ficha.</p>
                            )}
                        </div>
                    </div>

                    {(firstFicha.diagnosis || (firstFicha.prescription && firstFicha.prescription.length > 0)) && (
                        <div className="pt-4 border-t border-slate-50">
                            <details className="group">
                                <summary className="flex items-center justify-between cursor-pointer list-none">
                                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-brand-600 transition-colors uppercase tracking-widest flex items-center gap-2">
                                        <Clock className="w-3 h-3" /> Ver Diagnóstico y Plan Inicial
                                    </span>
                                    <div className="text-slate-300 group-open:rotate-180 transition-transform">
                                        <Eye className="w-4 h-4" />
                                    </div>
                                </summary>
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {firstFicha.diagnosis && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-100">
                                            <h5 className="text-[9px] font-bold text-slate-400 uppercase mb-2">Diagnóstico</h5>
                                            <p className="text-xs text-slate-600 whitespace-pre-wrap">{firstFicha.diagnosis}</p>
                                        </div>
                                    )}
                                    {firstFicha.prescription && firstFicha.prescription.length > 0 && (
                                        <div className="bg-white p-4 rounded-xl border border-slate-100">
                                            <h5 className="text-[9px] font-bold text-slate-400 uppercase mb-2">Plan / Receta</h5>
                                            <div className="space-y-1.5">
                                                {firstFicha.prescription.map((p, i) => (
                                                    <div key={i} className="text-[11px] text-slate-600 flex items-center gap-2">
                                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                                        <span className="font-medium">{p.name}</span>
                                                        <span className="text-slate-400">({p.quantity})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </details>
                        </div>
                    )}
                </div>
            </div>

            {/* LISTADO DE OTRAS FICHAS */}
            {otherFichas.length > 0 && (
                <div className="mt-10 space-y-4">
                    <div className="flex items-center gap-3 ml-2">
                        <div className="h-[1px] flex-1 bg-slate-100" />
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">Historial de Evolución</h4>
                        <div className="h-[1px] flex-1 bg-slate-100" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {otherFichas.map((ficha, idx) => (
                            <motion.div 
                                key={ficha.id || idx} 
                                whileHover={{ y: -2 }}
                                className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-brand-300 hover:shadow-md transition-all group cursor-pointer"
                                onClick={() => setSelectedFicha(ficha)}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors shadow-inner border border-transparent group-hover:border-brand-100">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">{formatDateTimeGT(ficha.date)}</p>
                                        <p className="text-[9px] text-slate-500 font-medium uppercase tracking-wide truncate max-w-[120px]">Dr. {ficha.doctorName}</p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-300 group-hover:text-brand-600 group-hover:bg-brand-100 rounded-lg transition-all">
                                    <Eye className="w-4 h-4" />
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL DE DETALLE DE FICHA */}
            <AnimatePresence>
                {selectedFicha && (
                    <FichaDetailModal 
                        ficha={selectedFicha} 
                        patient={patient}
                        onClose={() => setSelectedFicha(null)} 
                        renderSpecialtyData={renderSpecialtyData}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

interface FichaDetailModalProps {
    ficha: Consultation;
    patient: Patient;
    onClose: () => void;
    renderSpecialtyData: (ficha: Consultation, isModal?: boolean) => React.ReactNode;
}

const FichaDetailModal: React.FC<FichaDetailModalProps> = ({ ficha, patient, onClose, renderSpecialtyData }) => {
    const specialtyFormName = (ficha as any).specialtyFormName as string | undefined;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 40 }}
                className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-white/20"
            >
                <div className="p-8 bg-slate-900 text-white flex justify-between items-start shrink-0">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-brand-500 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-500/20">
                                <FileText className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-2xl font-bold tracking-tight">Detalle de la Ficha</h3>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400 text-xs font-mono ml-1">
                            <Clock className="w-3 h-3" />
                            {new Date(ficha.date).toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'long', timeStyle: 'short' })}
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-2xl transition-colors text-white/50 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto space-y-8 bg-white">
                    {/* INFO MÉDICA */}
                    <div className="grid grid-cols-2 gap-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] block">Médico Tratante</label>
                            <p className="text-base font-bold text-slate-800">Dr. {ficha.doctorName}</p>
                            <p className="text-xs text-brand-600 font-bold uppercase tracking-wide">{ficha.doctorSpecialty}</p>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] block">Tipo de Registro</label>
                            <span className="inline-block px-3 py-1 bg-white text-brand-700 rounded-lg text-xs font-bold border border-brand-100 shadow-sm">
                                {ficha.consultationType || 'Consulta General'}
                            </span>
                        </div>
                    </div>

                    {/* DATOS DE LA FICHA (SPECIALTY DATA) */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2 ml-2">
                            <FlaskConical className="w-4 h-4 text-brand-600" /> Información Clínica Especializada
                        </h4>
                        {specialtyFormName && (
                            <p className="text-[11px] font-semibold text-brand-600 ml-2">
                                {specialtyFormName}
                            </p>
                        )}
                        <div className="p-8 bg-white border-2 border-slate-50 rounded-[2rem] shadow-sm">
                            {renderSpecialtyData(ficha, true) || (
                                <p className="text-sm text-slate-400 italic text-center py-4">No se encontraron datos de especialidad en esta ficha.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
                    >
                        Cerrar Detalle
                    </button>
                </div>
            </motion.div>
        </div>
    );
};
