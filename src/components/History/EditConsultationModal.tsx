
import * as React from 'react';
import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { X, Save, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Consultation, Patient, UserProfile } from '../../../types';
import { StepDiagnosis } from '../Wizard/StepDiagnosis';
import { StepExams } from '../Wizard/StepExams';
import { StepPrescription } from '../Wizard/StepPrescription';
import { updateConsultation } from '../../services/patientService';

interface EditConsultationModalProps {
    consultation: Consultation;
    patient: Patient;
    currentUser: UserProfile;
    onClose: () => void;
    onSuccess: (updatedConsultation: Consultation) => void;
}

export const EditConsultationModal: React.FC<EditConsultationModalProps> = ({
    consultation,
    patient,
    currentUser,
    onClose,
    onSuccess
}) => {
    const [activeTab, setActiveTab] = useState<'diagnosis' | 'exams' | 'prescription'>('diagnosis');
    const [isSaving, setIsSaving] = useState(false);

    const methods = useForm({
        defaultValues: {
            diagnosis: '',
            referralGroups: [],
            exams: [],
            prescription: [],
            prescriptionNotes: '',
            omittedFields: {},
            specialtyReferrals: [],
            referralNote: '',
            followUpText: '',
            // Initialize with consultation data
            ...consultation
        }
    });

    const { handleSubmit, reset, formState: { isDirty } } = methods;

    // Load initial data
    useEffect(() => {
        if (consultation) {
            // Ensure deep copy and correct types
            reset({
                ...consultation,
                referralGroups: consultation.referralGroups || [],
                exams: consultation.exams || [],
                prescription: consultation.prescription || [],
                specialtyReferrals: consultation.specialtyReferrals || [],
                omittedFields: consultation.omittedFields || {}
            });
        }
    }, [consultation, reset]);

    const onSubmit = async (data: any) => {
        setIsSaving(true);
        try {
            // Prepare data for update
            // We need to flatten exams from groups if logic requires it, 
            // but StepExams logic usually handles syncing 'exams' field via useEffect.
            // Let's trust the form state which should be up to date.

            // Sanitize undefineds
            const cleanData = JSON.parse(JSON.stringify(data));

            // Actualizar status de omitidos si se agregaron datos (cambiar true -> 'edited')
            const newOmittedFields = { ...(cleanData.omittedFields || {}) };
            
            const isOmitted = (val: any) => val === true || val === 'true';

            // Diagnóstico
            if (isOmitted(newOmittedFields.diagnosis) && cleanData.diagnosis) {
                newOmittedFields.diagnosis = 'edited';
            }
            
            // Receta
            if (isOmitted(newOmittedFields.prescription) && cleanData.prescription?.length > 0) {
                newOmittedFields.prescription = 'edited';
            }
            
            // Laboratorios
            const hasExams = (cleanData.exams?.length > 0) || (cleanData.referralGroups?.length > 0);
            if (isOmitted(newOmittedFields.exams) && hasExams) {
                newOmittedFields.exams = 'edited';
            }
            
            // Referencias
            if (isOmitted(newOmittedFields.referrals) && cleanData.specialtyReferrals?.length > 0) {
                newOmittedFields.referrals = 'edited';
            }
            
            // Enfermería
            if (isOmitted(newOmittedFields.nursing) && cleanData.followUpText) {
                newOmittedFields.nursing = 'edited';
            }
            
            cleanData.omittedFields = newOmittedFields;
            
            // Call service
            if (!consultation.id || !patient.id) throw new Error("ID de consulta o paciente faltante");

            await updateConsultation(patient.id, consultation.id, cleanData, currentUser.email);

            toast.success("Consulta actualizada correctamente");
            onSuccess(cleanData as Consultation);
            onClose();

        } catch (error) {
            console.error("Error updating consultation:", error);
            toast.error("Error al guardar cambios");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            Editar Consulta
                            <span className="text-xs font-normal text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                                {new Date(consultation.date).toLocaleDateString()}
                            </span>
                        </h2>
                        <p className="text-xs text-slate-500">Editando expediente de {patient.fullName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition text-slate-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 px-6 bg-white sticky top-0 z-10">
                    <button
                        onClick={() => setActiveTab('diagnosis')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'diagnosis' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Diagnóstico
                    </button>
                    <button
                        onClick={() => setActiveTab('exams')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'exams' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Laboratorios y Exámenes
                    </button>
                    <button
                        onClick={() => setActiveTab('prescription')}
                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'prescription' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Receta Médica
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50">
                    <FormProvider {...methods}>
                        <form id="edit-consultation-form" onSubmit={handleSubmit(onSubmit)}>
                            <div className={activeTab === 'diagnosis' ? 'block' : 'hidden'}>
                                <StepDiagnosis patient={patient} currentUser={currentUser} />
                            </div>
                            <div className={activeTab === 'exams' ? 'block' : 'hidden'}>
                                <StepExams userSpecialty={currentUser.specialty} />
                            </div>
                            <div className={activeTab === 'prescription' ? 'block' : 'hidden'}>
                                <StepPrescription currentUser={currentUser} />
                            </div>
                        </form>
                    </FormProvider>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center">
                    <div className="text-xs text-slate-500">
                        {isDirty ? (
                            <span className="text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Hay cambios sin guardar
                            </span>
                        ) : (
                            <span className="text-emerald-600 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Sin cambios pendientes
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            form="edit-consultation-form"
                            disabled={isSaving}
                            className="px-6 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-lg hover:shadow-brand-500/30 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" /> Guardar Cambios
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
