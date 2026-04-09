import * as React from 'react';
import { useFormContext } from 'react-hook-form';
import { SpecialtyFormDefinition, FormField } from './types';
import { ChevronDown, AlertCircle } from 'lucide-react';

interface SpecialtyFormRendererProps {
    formDefinition: SpecialtyFormDefinition;
}

export const SpecialtyFormRenderer: React.FC<SpecialtyFormRendererProps> = ({ formDefinition }) => {
    const { register, watch, formState: { errors } } = useFormContext();
    const values = watch();

    const normalizeValue = (value: string) => {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    };

    const matchesConditional = (dependentValue: any, expectedValue: string) => {
        if (dependentValue === undefined || dependentValue === null) return false;
        const expected = normalizeValue(String(expectedValue));
        if (Array.isArray(dependentValue)) {
            return dependentValue.some(item => normalizeValue(String(item)) === expected);
        }
        return normalizeValue(String(dependentValue)) === expected;
    };

    const buildOptionKey = (option: string, index: number) => {
        const normalized = encodeURIComponent(option.trim());
        return normalized || `op_${index + 1}`;
    };

    const renderField = (field: FormField) => {
        // Lógica condicional
        if (field.conditional) {
            const dependentValue = values?.specialtyData?.[field.conditional.fieldId];
            if (!matchesConditional(dependentValue, field.conditional.value)) return null;
        }

        const fieldName = `specialtyData.${field.id}`;
        // Acceso seguro a errores anidados
        const specialtyErrors = errors.specialtyData as Record<string, any> | undefined;
        const error = specialtyErrors?.[field.id];

        const baseInputClasses = "w-full rounded-lg border border-slate-300 bg-white shadow-sm focus:border-brand-500 focus:ring-brand-500 text-sm py-2 px-3 text-slate-700 placeholder-slate-400 transition-colors";
        
        // Clases de ancho basadas en el tipo de campo
        let widthClass = "col-span-12";
        if (field.width === 'third') widthClass = "col-span-12 md:col-span-4";
        else if (field.width === 'half') widthClass = "col-span-12 md:col-span-6";

        if (field.type === 'header') {
            return (
                <div key={field.id} className="col-span-12">
                    <div className="text-sm font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 pb-2">
                        {field.label}
                    </div>
                </div>
            );
        }

        if (field.type === 'subHeader') {
            return (
                <div key={field.id} className="col-span-12">
                    <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                        {field.label}
                    </div>
                </div>
            );
        }

        const radioOptions = field.type === 'radio'
            ? (field.options && field.options.length > 0 ? field.options : ['Si', 'No'])
            : [];

        const checkboxOptions = field.type === 'checkbox'
            ? (field.options && field.options.length > 0 ? field.options : ['Si', 'No'])
            : [];

        const multiTextOptions = field.type === 'multiText'
            ? (field.options && field.options.length > 0 ? field.options : ['Detalle'])
            : [];

        return (
            <div key={field.id} className={`${widthClass} space-y-1`}>
                <label htmlFor={fieldName} className="block text-xs font-semibold text-slate-700">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                
                {field.type === 'textarea' ? (
                    <textarea
                        id={fieldName}
                        {...register(fieldName, { required: field.required ? "Este campo es requerido" : false })}
                        rows={3}
                        placeholder={field.placeholder}
                        className={`${baseInputClasses} ${error ? 'border-red-500' : ''}`}
                    />
                ) : field.type === 'select' ? (
                    <div className="relative">
                        <select
                            id={fieldName}
                            {...register(fieldName, { required: field.required ? "Seleccione una opción" : false })}
                            className={`${baseInputClasses} appearance-none bg-white ${error ? 'border-red-500' : ''}`}
                        >
                            <option value="">Seleccione...</option>
                            {field.options?.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                ) : field.type === 'radio' ? (
                    <div className="flex flex-wrap gap-2 mt-1">
                        {radioOptions.map((opt: string) => (
                            <label key={opt} className="cursor-pointer">
                                <input
                                    type="radio"
                                    value={opt}
                                    {...register(fieldName, { required: field.required ? "Seleccione una opción" : false })}
                                    className="sr-only peer"
                                />
                                <span className="inline-flex items-center px-3 py-1.5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 bg-white peer-checked:bg-brand-600 peer-checked:text-white peer-checked:border-brand-600 hover:border-brand-400 transition-colors">
                                    {opt}
                                </span>
                            </label>
                        ))}
                    </div>
                ) : field.type === 'checkbox' ? (
                    <div className="flex flex-wrap gap-2 mt-1">
                        {checkboxOptions.map((opt: string) => (
                            <label key={opt} className="cursor-pointer">
                                <input
                                    type="checkbox"
                                    value={opt}
                                    {...register(fieldName)}
                                    className="sr-only peer"
                                />
                                <span className="inline-flex items-center px-3 py-1.5 rounded-full border border-slate-300 text-xs font-semibold text-slate-600 bg-white peer-checked:bg-brand-600 peer-checked:text-white peer-checked:border-brand-600 hover:border-brand-400 transition-colors">
                                    {opt}
                                </span>
                            </label>
                        ))}
                    </div>
                ) : field.type === 'multiText' ? (
                    <div className="space-y-2 mt-1">
                        {multiTextOptions.map((opt: string, idx: number) => {
                            const optionKey = buildOptionKey(opt, idx);
                            const optionFieldName = `${fieldName}.${optionKey}`;
                            return (
                                <div key={optionKey} className="flex flex-col gap-1">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                        {opt}
                                    </span>
                                    <input
                                        id={optionFieldName}
                                        type="text"
                                        {...register(optionFieldName)}
                                        placeholder={field.placeholder}
                                        className={`${baseInputClasses} ${error ? 'border-red-500' : ''}`}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ) : field.type === 'date' ? (
                     <input
                        id={fieldName}
                        type="date"
                        {...register(fieldName, { required: field.required ? "Fecha requerida" : false })}
                        className={`${baseInputClasses} ${error ? 'border-red-500' : ''}`}
                    />
                ) : (
                    <input
                        id={fieldName}
                        type={field.type === 'number' ? 'number' : 'text'}
                        {...register(fieldName, { required: field.required ? "Este campo es requerido" : false })}
                        placeholder={field.placeholder}
                        className={`${baseInputClasses} ${error ? 'border-red-500' : ''}`}
                    />
                )}
                
                {error && (
                    <p className="text-[10px] text-red-500 flex items-center gap-1 mt-1 font-medium">
                        <AlertCircle className="w-3 h-3" /> {error.message}
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">
                        {formDefinition.name}
                    </h3>
                    <p className="text-xs text-slate-500">
                        Complete la información específica para esta ficha clínica.
                    </p>
                </div>
            </div>

            {formDefinition.sections.map(section => (
                <div key={section.id} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider border-b pb-2 mb-4 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                        {section.title}
                    </h4>
                    <div className="grid grid-cols-12 gap-x-6 gap-y-4">
                        {section.fields.map(renderField)}
                    </div>
                </div>
            ))}
        </div>
    );
};
