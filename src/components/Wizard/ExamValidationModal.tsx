import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFormContext } from 'react-hook-form';
import {
    CheckCircle2, XCircle, ChevronRight, ChevronLeft, X, AlertTriangle,
    FlaskConical, Brain, Heart, ClipboardCheck, Lock, Stethoscope, Microscope,
    Plus, Trash2
} from 'lucide-react';
import { ReferralGroup, ResonanceOrder, EegOrder } from '../../types';

interface ExamValidationModalProps {
    open: boolean;
    onClose: () => void;
    referralGroups: ReferralGroup[];
    resonanceOrders: ResonanceOrder[];
    eegOrders: EegOrder[];
    emotionalEvaluationSelections: string[];
    pathologyNames: { name: string; normalizedKey: string }[];
}

const LAB_PROTOCOLS: Record<string, { title: string; items: string[] }[]> = {
    epilepsia: [
        { title: 'Prueba', items: ['Hematología Completa + VS'] },
        { title: 'Pruebas de Función Hepática', items: ['TGO/ASAT', 'TGP/ALAT', 'GGT', 'Amonio', 'Fosfatasa alcalina', 'Albumina', 'Bilirrubina directa', 'Bilirrubina indirecta', 'Bilirrubina total', 'Coagulación (TP, TTP, INR)'] },
        { title: 'Química Sanguínea', items: ['Glucosa pre', 'Creatinina', 'BUN', 'Na+/K+ CL (Sodio, Potasio, Cloruro)', 'Ácido úrico'] },
        { title: 'Niveles séricos de medicamentos', items: ['Ácido valproico', 'Fenitoína', 'Carbamazepina', 'Carbonato de litio'] },
        { title: 'Perfil Lipídico', items: ['Triglicéridos', 'Colesterol', 'HDL', 'VLDL'] },
        { title: 'Otros exámenes', items: ['Grupo Sanguíneo', 'Orina completa', 'Heces simples', 'Hemoglobina glicosilada', 'Electrocardiograma', 'T3', 'T4', 'TSH', 'Otros'] }
    ],
    parkinson: [
        { title: 'Glucosa y Metabolismo', items: ['Glucosa pre', 'Glucosa post', 'Hemoglobina glicosilada'] },
        { title: 'Función Hepática', items: ['TGO/ASAT', 'TGP/ALAT', 'GGT'] },
        { title: 'Tiroides', items: ['TSH', 'T4 libre'] },
        { title: 'Vitaminas', items: ['Vitamina D', 'Vitamina B12'] },
        { title: 'Orina', items: ['Orina completa'] }
    ]
};

const EG_DURATIONS = ['1/2 hora', '1 hora', '3 horas', '5 horas', '8 horas'];
const EMOTIONAL_SPECIALTIES = ['Psiquiatría', 'Psicología', 'Neuropsicología'];

const normalizeText = (text: string) =>
    text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const isFilled = (v: any) => typeof v === 'string' && v.trim().length > 0;

type Step = 'overview' | 'labs' | 'resonance' | 'eeg' | 'emotional' | 'review';

interface StepDescriptor {
    id: Step;
    label: string;
    icon: React.ReactNode;
    available: boolean;
}

export const ExamValidationModal: React.FC<ExamValidationModalProps> = ({
    open,
    onClose,
    referralGroups,
    resonanceOrders,
    eegOrders,
    emotionalEvaluationSelections,
    pathologyNames
}) => {
    const { setValue, watch } = useFormContext();
    const [activeStep, setActiveStep] = useState<Step>('overview');

    // Compute which steps are available
    const labGroups = useMemo(() => {
        return referralGroups.filter(g =>
            g.exams.some(e => normalizeText(e).includes('laboratorio'))
        );
    }, [referralGroups]);

    const hasLabs = labGroups.length > 0;
    const hasResonance = resonanceOrders.length > 0;
    const hasEeg = eegOrders.length > 0;
    const emotionalExam = referralGroups.flatMap(g => g.exams).find(e => normalizeText(e).includes('evaluacion emocional'));
    const hasEmotional = !!emotionalExam;

    const allSteps: StepDescriptor[] = [
        { id: 'overview', label: 'Resumen', icon: <ClipboardCheck className="w-4 h-4" />, available: true },
        { id: 'labs', label: 'Laboratorios', icon: <FlaskConical className="w-4 h-4" />, available: hasLabs },
        { id: 'resonance', label: 'Resonancia', icon: <Brain className="w-4 h-4" />, available: hasResonance },
        { id: 'eeg', label: 'EEG', icon: <Microscope className="w-4 h-4" />, available: hasEeg },
        { id: 'emotional', label: 'Eval. Emocional', icon: <Heart className="w-4 h-4" />, available: hasEmotional },
        { id: 'review', label: 'Confirmar', icon: <CheckCircle2 className="w-4 h-4" />, available: true }
    ];
    const steps = allSteps.filter(s => s.available);

    const availableSteps = steps.map(s => s.id);
    const currentStepIndex = availableSteps.indexOf(activeStep);

    // Compute completion status
    const labCompletion = useMemo(() => {
        if (!hasLabs) return { complete: true, total: 0, done: 0 };
        let totalItems = 0;
        let doneItems = 0;
        labGroups.forEach(group => {
            const protocolKey = normalizeText(group.pathology).includes('parkinson') ? 'parkinson' : 'epilepsia';
            const groups = LAB_PROTOCOLS[protocolKey];
            const selected = new Set(
                group.exams.filter(e => e.startsWith('Laboratorios:')).map(e => e.replace('Laboratorios: ', ''))
            );
            groups.forEach(g => g.items.forEach(item => {
                totalItems++;
                if (selected.has(item)) doneItems++;
            }));
        });
        return { complete: doneItems === totalItems, total: totalItems, done: doneItems };
    }, [hasLabs, labGroups]);

    const resonanceCompletion = useMemo(() => {
        if (!hasResonance) return { complete: true, total: 0, done: 0 };
        const total = resonanceOrders.length;
        const done = resonanceOrders.filter(o => isFilled(o.probableDiagnosis)).length;
        return { complete: done === total, total, done };
    }, [hasResonance, resonanceOrders]);

    const eegCompletion = useMemo(() => {
        if (!hasEeg) return { complete: true, total: 0, done: 0 };
        const total = eegOrders.length;
        const done = eegOrders.filter(o => isFilled(o.probableDiagnosis) && isFilled(o.duration)).length;
        return { complete: done === total, total, done };
    }, [hasEeg, eegOrders]);

    const emotionalCompletion = useMemo(() => {
        if (!hasEmotional) return { complete: true };
        return { complete: emotionalEvaluationSelections.length > 0 };
    }, [hasEmotional, emotionalEvaluationSelections]);

    const allComplete =
        labCompletion.complete &&
        resonanceCompletion.complete &&
        eegCompletion.complete &&
        emotionalCompletion.complete;

    // Reset to first step when modal opens
    useEffect(() => {
        if (open) setActiveStep('overview');
    }, [open]);

    if (!open) return null;

    const goToStep = (step: Step) => {
        if (availableSteps.includes(step)) setActiveStep(step);
    };

    const goNext = () => {
        const nextIdx = currentStepIndex + 1;
        if (nextIdx < availableSteps.length) {
            setActiveStep(availableSteps[nextIdx]);
        }
    };

    const goPrev = () => {
        const prevIdx = currentStepIndex - 1;
        if (prevIdx >= 0) {
            setActiveStep(availableSteps[prevIdx]);
        }
    };

    const handleClose = () => {
        if (!allComplete) return;
        onClose();
    };

    // ----- LAB HANDLERS -----
    const toggleProtocolLab = (groupId: string, labName: string) => {
        const groups = [...referralGroups];
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        const tag = `Laboratorios: ${labName}`;
        if (group.exams.includes(tag)) {
            group.exams = group.exams.filter(e => e !== tag);
        } else {
            group.exams = [...group.exams, tag];
        }
        setValue('referralGroups', groups, { shouldDirty: true });
    };

    const isProtocolLabSelected = (groupId: string, labName: string) => {
        const group = referralGroups.find(g => g.id === groupId);
        return group ? group.exams.includes(`Laboratorios: ${labName}`) : false;
    };

    const selectAllLabsInProtocol = (groupId: string) => {
        const groups = [...referralGroups];
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        const protocolKey = normalizeText(group.pathology).includes('parkinson') ? 'parkinson' : 'epilepsia';
        const groups_protocol = LAB_PROTOCOLS[protocolKey];
        const allTags: string[] = [];
        groups_protocol.forEach(g => g.items.forEach(item => allTags.push(`Laboratorios: ${item}`)));
        const filtered = group.exams.filter(e => !e.startsWith('Laboratorios:'));
        group.exams = [...filtered, ...allTags];
        setValue('referralGroups', groups, { shouldDirty: true });
    };

    const deselectAllLabsInProtocol = (groupId: string) => {
        const groups = [...referralGroups];
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        group.exams = group.exams.filter(e => !e.startsWith('Laboratorios:'));
        setValue('referralGroups', groups, { shouldDirty: true });
    };

    const isAllLabsSelected = (groupId: string): boolean => {
        const group = referralGroups.find(g => g.id === groupId);
        if (!group) return false;
        const protocolKey = normalizeText(group.pathology).includes('parkinson') ? 'parkinson' : 'epilepsia';
        const groups_protocol = LAB_PROTOCOLS[protocolKey];
        const totalItems = groups_protocol.reduce((sum, g) => sum + g.items.length, 0);
        const selectedCount = group.exams.filter(e => e.startsWith('Laboratorios:')).length;
        return totalItems > 0 && selectedCount === totalItems;
    };

    // ----- RESONANCIA HANDLERS -----
    const updateResonanceOrder = (idx: number, field: keyof ResonanceOrder, value: string) => {
        const next = [...resonanceOrders];
        next[idx] = { ...next[idx], [field]: value };
        setValue('resonanceOrders', next, { shouldDirty: true });
    };

    const addResonanceOrder = () => {
        const defaultExam = resonanceOrders[0]?.examName || 'Resonancia Magnética';
        const next: ResonanceOrder[] = [
            ...resonanceOrders,
            {
                examName: defaultExam,
                probableDiagnosis: '',
                attentionNotes: '',
                sendResultsTo: 'Oficinas Zona 10'
            }
        ];
        setValue('resonanceOrders', next, { shouldDirty: true });
    };

    const removeResonanceOrder = (idx: number) => {
        const next = resonanceOrders.filter((_, i) => i !== idx);
        setValue('resonanceOrders', next, { shouldDirty: true });
    };

    // ----- EEG HANDLERS -----
    const updateEegOrder = (idx: number, field: keyof EegOrder, value: any) => {
        const next = [...eegOrders];
        next[idx] = { ...next[idx], [field]: value };
        setValue('eegOrders', next, { shouldDirty: true });
    };

    const addEegOrder = () => {
        const defaultExam = eegOrders[0]?.examName || 'EEG';
        const next: EegOrder[] = [
            ...eegOrders,
            {
                examName: defaultExam,
                probableDiagnosis: '',
                duration: EG_DURATIONS[1],
                cctcg: false,
                cpc: false,
                cpcSecGeneralizadas: false,
                ausencias: false,
                crisisMioclonicas: false,
                crisisEstaticas: false,
                specialIndications: '',
                medicatedWith: '',
                videoMonitoringHours: '',
                videoMonitoringSleepDeprivation: 'No',
                ictalVideoHours: '',
                ictalSleepDeprivation: 'No',
                spikeDetection64: false,
                spikeDetection128: false,
                spikeDetectionHours: '',
                p300: false
            }
        ];
        setValue('eegOrders', next, { shouldDirty: true });
    };

    const removeEegOrder = (idx: number) => {
        const next = eegOrders.filter((_, i) => i !== idx);
        setValue('eegOrders', next, { shouldDirty: true });
    };

    // ----- EMOTIONAL HANDLERS -----
    const toggleEmotional = (specialty: string) => {
        const current = new Set(emotionalEvaluationSelections);
        if (current.has(specialty)) current.delete(specialty);
        else current.add(specialty);
        setValue('emotionalEvaluationSelections', Array.from(current), { shouldDirty: true });
    };

    // ----- RENDER -----
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97, y: 4 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
                    className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
                >
                    {/* HEADER */}
                    <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-white flex items-center justify-between shrink-0">
                        <div>
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                                Validación de Exámenes
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Complete todos los datos para continuar
                            </p>
                        </div>
                        {allComplete ? (
                            <button
                                onClick={handleClose}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                                title="Cerrar"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        ) : (
                            <div className="p-1.5 rounded-lg text-slate-300 cursor-not-allowed" title="Complete todos los pasos para cerrar">
                                <Lock className="w-5 h-5" />
                            </div>
                        )}
                    </div>

                    {/* STEP INDICATOR */}
                    <div className="px-6 py-3 border-b border-slate-100 bg-slate-50/40 shrink-0">
                        <div className="flex items-center gap-1 overflow-x-auto">
                            {steps.map((step, idx) => {
                                const isActive = step.id === activeStep;
                                const isComplete = (() => {
                                    if (step.id === 'labs') return labCompletion.complete;
                                    if (step.id === 'resonance') return resonanceCompletion.complete;
                                    if (step.id === 'eeg') return eegCompletion.complete;
                                    if (step.id === 'emotional') return emotionalCompletion.complete;
                                    if (step.id === 'review') return allComplete;
                                    return true;
                                })();
                                return (
                                    <button
                                        key={step.id}
                                        onClick={() => goToStep(step.id)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition shrink-0 ${
                                            isActive
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : isComplete
                                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {isComplete && !isActive ? <CheckCircle2 className="w-3.5 h-3.5" /> : step.icon}
                                        <span className="hidden sm:inline">{idx + 1}. {step.label}</span>
                                        <span className="sm:hidden">{idx + 1}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* BODY */}
                    <div className="flex-1 overflow-y-auto px-6 py-5">
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={activeStep}
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -12 }}
                                transition={{ duration: 0.15, ease: 'easeOut' }}
                            >
                        {activeStep === 'overview' && (
                            <div className="space-y-3">
                                <p className="text-sm text-slate-600">
                                    Ha seleccionado los siguientes exámenes. Complete los datos requeridos en cada paso.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                    {hasLabs && (
                                        <button onClick={() => goToStep('labs')} className="p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/30 text-left hover:border-emerald-400 hover:shadow-sm transition">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <FlaskConical className="w-5 h-5 text-emerald-600" />
                                                    <span className="font-bold text-slate-800">Laboratorios</span>
                                                </div>
                                                {labCompletion.complete ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                                            </div>
                                            <p className="text-xs text-slate-500">{labCompletion.done}/{labCompletion.total} exámenes seleccionados</p>
                                        </button>
                                    )}
                                    {hasResonance && (
                                        <button onClick={() => goToStep('resonance')} className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/30 text-left hover:border-indigo-400 hover:shadow-sm transition">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Brain className="w-5 h-5 text-indigo-600" />
                                                    <span className="font-bold text-slate-800">Resonancia</span>
                                                </div>
                                                {resonanceCompletion.complete ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                                            </div>
                                            <p className="text-xs text-slate-500">{resonanceCompletion.done}/{resonanceCompletion.total} órdenes completas</p>
                                        </button>
                                    )}
                                    {hasEeg && (
                                        <button onClick={() => goToStep('eeg')} className="p-4 rounded-2xl border-2 border-violet-200 bg-violet-50/30 text-left hover:border-violet-400 hover:shadow-sm transition">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Microscope className="w-5 h-5 text-violet-600" />
                                                    <span className="font-bold text-slate-800">EEG</span>
                                                </div>
                                                {eegCompletion.complete ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                                            </div>
                                            <p className="text-xs text-slate-500">{eegCompletion.done}/{eegCompletion.total} órdenes completas</p>
                                        </button>
                                    )}
                                    {hasEmotional && (
                                        <button onClick={() => goToStep('emotional')} className="p-4 rounded-2xl border-2 border-pink-200 bg-pink-50/30 text-left hover:border-pink-400 hover:shadow-sm transition">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Heart className="w-5 h-5 text-pink-600" />
                                                    <span className="font-bold text-slate-800">Eval. Emocional</span>
                                                </div>
                                                {emotionalCompletion.complete ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                                            </div>
                                            <p className="text-xs text-slate-500">{emotionalEvaluationSelections.length} especialidades seleccionadas</p>
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeStep === 'labs' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                        <FlaskConical className="w-4 h-4 text-emerald-600" />
                                        Laboratorios del Protocolo
                                    </h3>
                                    <span className="text-xs font-bold text-slate-500">
                                        {labCompletion.done}/{labCompletion.total} seleccionados
                                    </span>
                                </div>
                                {labGroups.map(group => {
                                    const protocolKey = normalizeText(group.pathology).includes('parkinson') ? 'parkinson' : 'epilepsia';
                                    const groups_protocol = LAB_PROTOCOLS[protocolKey];
                                    const allSelected = isAllLabsSelected(group.id);
                                    return (
                                        <div key={group.id} className="border border-slate-200 rounded-xl p-4 bg-white">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-bold text-slate-700">{group.pathology}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => allSelected ? deselectAllLabsInProtocol(group.id) : selectAllLabsInProtocol(group.id)}
                                                    className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-colors duration-150 ${
                                                        allSelected
                                                            ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                    }`}
                                                >
                                                    {allSelected ? 'Deseleccionar todo' : 'Seleccionar todos'}
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {groups_protocol.map(protocolGroup => (
                                                    <div key={protocolGroup.title}>
                                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">{protocolGroup.title}</p>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                            {protocolGroup.items.map(item => {
                                                                const active = isProtocolLabSelected(group.id, item);
                                                                return (
                                                                    <button
                                                                        key={item}
                                                                        type="button"
                                                                        onClick={() => toggleProtocolLab(group.id, item)}
                                                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors duration-150 text-left ${
                                                                            active
                                                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                                                : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200'
                                                                        }`}
                                                                    >
                                                                        {active ? <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" /> : <div className="w-3.5 h-3.5 rounded border-2 border-slate-300 shrink-0" />}
                                                                        {item}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeStep === 'resonance' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                        <Brain className="w-4 h-4 text-indigo-600" />
                                        Órdenes de Resonancia
                                        <span className="text-xs font-bold text-slate-500 ml-1">({resonanceOrders.length})</span>
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={addResonanceOrder}
                                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors duration-150"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Agregar orden
                                    </button>
                                </div>
                                {resonanceOrders.map((order, idx) => (
                                    <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                                        <div className="flex items-center justify-between -mt-1">
                                            <p className="text-[11px] font-bold text-indigo-500 uppercase tracking-widest">Orden #{idx + 1}</p>
                                            {resonanceOrders.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeResonanceOrder(idx)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 transition-colors duration-150"
                                                >
                                                    <Trash2 className="w-3 h-3" /> Eliminar
                                                </button>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Estudio</label>
                                            <input
                                                value={order.examName || ''}
                                                onChange={e => updateResonanceOrder(idx, 'examName', e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
                                                placeholder="Ej: Resonancia Magnética de Cerebro"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                                Diagnóstico probable <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                value={order.probableDiagnosis || ''}
                                                onChange={e => updateResonanceOrder(idx, 'probableDiagnosis', e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                placeholder="Ej: Epilepsia del lóbulo temporal"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Notas de atención</label>
                                            <textarea
                                                rows={2}
                                                value={order.attentionNotes || ''}
                                                onChange={e => updateResonanceOrder(idx, 'attentionNotes', e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                                placeholder="Ej: lesiones temporales, foco epileptogénico..."
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Enviar resultados a</label>
                                            <div className="text-sm text-slate-600 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">Oficinas Zona 10</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeStep === 'eeg' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                        <Microscope className="w-4 h-4 text-violet-600" />
                                        Órdenes de EEG
                                        <span className="text-xs font-bold text-slate-500 ml-1">({eegOrders.length})</span>
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={addEegOrder}
                                        className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors duration-150"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Agregar orden
                                    </button>
                                </div>
                                {eegOrders.map((order, idx) => (
                                    <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
                                        <div className="flex items-center justify-between -mt-1">
                                            <p className="text-[11px] font-bold text-violet-500 uppercase tracking-widest">Orden #{idx + 1}</p>
                                            {eegOrders.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeEegOrder(idx)}
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 hover:text-red-600 transition-colors duration-150"
                                                >
                                                    <Trash2 className="w-3 h-3" /> Eliminar
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Tipo de estudio</label>
                                                <input
                                                    value={order.examName || ''}
                                                    onChange={e => updateEegOrder(idx, 'examName', e.target.value)}
                                                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-slate-50"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                                    Duración <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    value={order.duration || EG_DURATIONS[1]}
                                                    onChange={e => updateEegOrder(idx, 'duration', e.target.value)}
                                                    className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                                                >
                                                    {EG_DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">
                                                Diagnóstico probable <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                value={order.probableDiagnosis || ''}
                                                onChange={e => updateEegOrder(idx, 'probableDiagnosis', e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                                                placeholder="Diagnóstico clínico"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Patrones</label>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {[
                                                    { key: 'cctcg', label: 'CCTCG' },
                                                    { key: 'cpc', label: 'CPC' },
                                                    { key: 'cpcSecGeneralizadas', label: 'CPC Sec. Gen.' },
                                                    { key: 'ausencias', label: 'Ausencias' },
                                                    { key: 'crisisMioclonicas', label: 'Crisis Mioclónicas' },
                                                    { key: 'crisisEstaticas', label: 'Crisis Estáticas' }
                                                ].map(item => (
                                                    <label key={item.key} className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={!!(order as any)[item.key]}
                                                            onChange={e => updateEegOrder(idx, item.key as keyof EegOrder, e.target.checked)}
                                                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                        />
                                                        {item.label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Indicaciones especiales</label>
                                            <textarea
                                                rows={2}
                                                value={order.specialIndications || ''}
                                                onChange={e => updateEegOrder(idx, 'specialIndications', e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200 focus:border-violet-500"
                                                placeholder="Cualquier indicación adicional"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Medicación actual</label>
                                            <input
                                                value={order.medicatedWith || ''}
                                                onChange={e => updateEegOrder(idx, 'medicatedWith', e.target.value)}
                                                className="w-full text-sm px-3 py-2 rounded-lg border border-slate-200"
                                                placeholder="Medicamentos actuales"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeStep === 'emotional' && (
                            <div className="space-y-4">
                                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <Heart className="w-4 h-4 text-pink-600" />
                                    Evaluación Emocional
                                </h3>
                                <p className="text-sm text-slate-600">Seleccione al menos una especialidad</p>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    {EMOTIONAL_SPECIALTIES.map(specialty => {
                                        const active = emotionalEvaluationSelections.includes(specialty);
                                        return (
                                            <button
                                                key={specialty}
                                                type="button"
                                                onClick={() => toggleEmotional(specialty)}
                                                className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${
                                                    active
                                                        ? 'border-pink-500 bg-pink-50 text-pink-800 shadow-sm'
                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-pink-200'
                                                }`}
                                            >
                                                {active ? <CheckCircle2 className="w-6 h-6 text-pink-600" /> : <Stethoscope className="w-6 h-6 text-slate-400" />}
                                                <span className="text-sm font-bold">{specialty}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {activeStep === 'review' && (
                            <div className="space-y-4">
                                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                    Confirmación Final
                                </h3>
                                {allComplete ? (
                                    <div className="p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-200">
                                        <div className="flex items-center gap-3">
                                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                                            <div>
                                                <p className="font-bold text-emerald-800">Todos los exámenes están completos</p>
                                                <p className="text-xs text-emerald-700 mt-0.5">Puede cerrar este modal y continuar con la consulta</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-5 rounded-2xl bg-amber-50 border-2 border-amber-200">
                                        <div className="flex items-center gap-3">
                                            <AlertTriangle className="w-8 h-8 text-amber-600" />
                                            <div>
                                                <p className="font-bold text-amber-800">Faltan datos por completar</p>
                                                <p className="text-xs text-amber-700 mt-0.5">Revise los pasos pendientes antes de cerrar</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    {hasLabs && (
                                        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                                            <div className="flex items-center gap-2">
                                                <FlaskConical className="w-4 h-4 text-emerald-600" />
                                                <span className="text-sm font-bold text-slate-700">Laboratorios</span>
                                            </div>
                                            {labCompletion.complete ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                        </div>
                                    )}
                                    {hasResonance && (
                                        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                                            <div className="flex items-center gap-2">
                                                <Brain className="w-4 h-4 text-indigo-600" />
                                                <span className="text-sm font-bold text-slate-700">Resonancia</span>
                                            </div>
                                            {resonanceCompletion.complete ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                        </div>
                                    )}
                                    {hasEeg && (
                                        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                                            <div className="flex items-center gap-2">
                                                <Microscope className="w-4 h-4 text-violet-600" />
                                                <span className="text-sm font-bold text-slate-700">EEG</span>
                                            </div>
                                            {eegCompletion.complete ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                        </div>
                                    )}
                                    {hasEmotional && (
                                        <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200">
                                            <div className="flex items-center gap-2">
                                                <Heart className="w-4 h-4 text-pink-600" />
                                                <span className="text-sm font-bold text-slate-700">Evaluación Emocional</span>
                                            </div>
                                            {emotionalCompletion.complete ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* FOOTER */}
                    <div className="px-6 py-3 border-t border-slate-200 bg-slate-50/40 flex items-center justify-between shrink-0">
                        <button
                            type="button"
                            onClick={goPrev}
                            disabled={currentStepIndex === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" /> Anterior
                        </button>
                        {activeStep !== 'review' ? (
                            <button
                                type="button"
                                onClick={goNext}
                                disabled={currentStepIndex >= availableSteps.length - 1}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Siguiente <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={!allComplete}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle2 className="w-4 h-4" /> Confirmar y cerrar
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
