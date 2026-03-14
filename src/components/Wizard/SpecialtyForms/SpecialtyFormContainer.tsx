import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { SpecialtyFormRenderer } from './SpecialtyFormRenderer';
import { FileSpreadsheet, ArrowRightLeft } from 'lucide-react';
import { SpecialtyFormDefinition } from './types';
import { useFormContext } from 'react-hook-form';
import { specialtyFormsService } from '../../../services/specialtyFormsService';

interface SpecialtyFormContainerProps {
    doctorSpecialties?: string[];
    forcedFormId?: string;
    disableSwitch?: boolean;
    forceSelectToken?: number;
    onFormChange?: (formId: string) => void;
}

export const SpecialtyFormContainer: React.FC<SpecialtyFormContainerProps> = ({
    doctorSpecialties,
    forcedFormId,
    disableSwitch,
    forceSelectToken,
    onFormChange
}) => {
    const [forms, setForms] = useState<SpecialtyFormDefinition[]>([]);
    const [selectedFormId, setSelectedFormId] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const { setValue, getValues, register, unregister } = useFormContext();
    const lastFormIdRef = useRef<string | null>(null);
    const lastForceTokenRef = useRef<number | undefined>(undefined);

    // Registrar el campo explícitamente para asegurar que RHF lo rastree
    useEffect(() => {
        register('specialtyFormId');
        register('specialtyFormName');
    }, [register]);

    useEffect(() => {
        let isMounted = true;
        const loadForms = async () => {
            try {
                const loaded = await specialtyFormsService.getAll();
                if (!isMounted) return;
                setForms(loaded);

                // Prioridad 1: Si ya hay un ID seleccionado en el formulario (caso de edición o navegación entre pasos)
                const currentFormId = getValues('specialtyFormId');
                
                if (currentFormId && loaded.some(f => f.id === currentFormId)) {
                    setSelectedFormId(currentFormId);
                } else {
                    // Prioridad 2: Autoselección por especialidad del doctor
                    const normalizedSpecialties = (doctorSpecialties || []).map(s => s.toLowerCase()).filter(Boolean);
                    let defaultId = loaded[0]?.id || '';
                    
                    if (normalizedSpecialties.length > 0 && loaded.length > 0) {
                        const match = loaded.find(f =>
                            f.specialties.some(s =>
                                normalizedSpecialties.some(spec =>
                                    spec.includes(s.toLowerCase()) || s.toLowerCase().includes(spec)
                                )
                            )
                        );
                        if (match) defaultId = match.id;
                    }
                    
                    // Solo establecemos el default si NO hay nada seleccionado previamente
                    if (defaultId) {
                        setSelectedFormId(defaultId);
                        // Importante: Actualizar el form inmediatamente para que quede registrado el default
                        setValue('specialtyFormId', defaultId);
                    }
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        loadForms();
        return () => {
            isMounted = false;
        };
    }, [doctorSpecialties, getValues, setValue]);

    useEffect(() => {
        if (!selectedFormId) return;

        const previousFormId = lastFormIdRef.current;
        if (previousFormId && previousFormId !== selectedFormId) {
            const previousForm = forms.find(f => f.id === previousFormId);
            if (previousForm) {
                const buildOptionKey = (option: string, index: number) => {
                    const normalized = encodeURIComponent(option.trim());
                    return normalized || `op_${index + 1}`;
                };

                const fieldNames = previousForm.sections.flatMap(section =>
                    section.fields.flatMap(field => {
                        if (field.type === 'multiText') {
                            const options = field.options && field.options.length > 0 ? field.options : ['Detalle'];
                            return options.map((opt, idx) => `specialtyData.${field.id}.${buildOptionKey(opt, idx)}`);
                        }
                        return [`specialtyData.${field.id}`];
                    })
                );
                if (fieldNames.length > 0) {
                    unregister(fieldNames);
                }
            }
        }

        lastFormIdRef.current = selectedFormId;

        setValue('specialtyFormId', selectedFormId);
        const activeForm = forms.find(f => f.id === selectedFormId);
        if (activeForm) {
            setValue('specialtyFormName', activeForm.name);
        }
    }, [selectedFormId, forms, setValue, unregister]);

    useEffect(() => {
        if (!forcedFormId) return;
        if (forceSelectToken === undefined) return;
        if (lastForceTokenRef.current === forceSelectToken) return;
        lastForceTokenRef.current = forceSelectToken;
        if (forcedFormId !== selectedFormId) {
            setSelectedFormId(forcedFormId);
        }
    }, [forcedFormId, selectedFormId, forceSelectToken]);

    const activeForm = forms.find(f => f.id === selectedFormId) || forms[0];

    if (loading && !activeForm) {
        return (
            <div className="mt-8 mb-8">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
                    <p className="text-xs text-slate-400">Cargando ficha de especialidad...</p>
                </div>
            </div>
        );
    }

    if (!activeForm) return null;

    return (
        <div className="mt-8 mb-8">
             <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                <div className="flex items-center gap-2">
                    <div className="bg-brand-100 p-2 rounded-lg">
                         <FileSpreadsheet className="w-5 h-5 text-brand-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">Ficha de Especialidad</h3>
                        <p className="text-xs text-slate-500">
                            Ficha autoseleccionada: <span className="font-medium text-brand-600">{activeForm.name}</span>
                        </p>
                    </div>
                </div>

                {!disableSwitch ? (
                    <div className="flex items-center gap-2">
                         <span className="text-xs text-slate-500 hidden sm:inline">¿Cambiar ficha?</span>
                         <div className="relative">
                            <select 
                                value={selectedFormId}
                            onChange={(e) => {
                                const nextId = e.target.value;
                                setSelectedFormId(nextId);
                                onFormChange?.(nextId);
                            }}
                                className="pl-9 pr-8 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white shadow-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 appearance-none cursor-pointer hover:bg-slate-50 transition-colors"
                            >
                                {forms.map(form => (
                                    <option key={form.id} value={form.id}>
                                        {form.name}
                                    </option>
                                ))}
                            </select>
                            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2 pointer-events-none" />
                         </div>
                    </div>
                ) : (
                    <div className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
                        Ficha existente detectada
                    </div>
                )}
            </div>

            <SpecialtyFormRenderer formDefinition={activeForm} />
        </div>
    );
};
