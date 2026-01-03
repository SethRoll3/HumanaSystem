
import * as React from 'react';
import { useState } from 'react';
import { UserPlus, X, Save, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { createPatient } from '../../services/patientService.ts';
import { logAuditAction } from '../../services/auditService.ts';
import { Patient, UserProfile } from '../../../types.ts';
import { COUNTRIES, GT_DEPARTMENTS, GT_ZONES, MUNICIPALITIES_WITH_ZONES } from '../../data/geography.ts';

interface QuickPatientModalProps {
    onClose: () => void;
    currentUser: UserProfile;
}

export const QuickPatientModal: React.FC<QuickPatientModalProps> = ({ onClose, currentUser }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [isNoResNew, setIsNoResNew] = useState(false);
    
    // Estado inicial limpio
    const [form, setForm] = useState<any>({ 
        fullName: '', 
        billingCode: '', 
        phone: '', 
        email: '', 
        occupation: '', 
        age: '', 
        gender: 'M', 
        previousTreatment: 'No ha estado en tratamiento', 
        consultationType: 'Nueva',
        responsibleName: '',
        responsiblePhone: '',
        responsibleEmail: '', 
        // Address structure
        address: {
            country: 'Guatemala',
            department: '',
            municipality: '',
            zone: ''
        }
    });

    const updateAddress = (field: string, value: string) => {
        setForm((prev: any) => {
            const newAddress = { ...prev.address, [field]: value };
            
            // Cascada de limpieza
            if (field === 'country' && value !== 'Guatemala') {
                newAddress.department = '';
                newAddress.municipality = '';
                newAddress.zone = '';
            }
            if (field === 'department') {
                newAddress.municipality = '';
                newAddress.zone = '';
            }
            if (field === 'municipality') {
                 newAddress.zone = ''; // Reset zone when municipality changes
            }
            return { ...prev, address: newAddress };
        });
    };

    const hasZones = (muni: string) => MUNICIPALITIES_WITH_ZONES.includes(muni);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); 
        setIsSaving(true);
        try {
            const payload = { ...(form as object) } as Patient;
            
            // Lógica de "Paciente ve por su salud"
            if (isNoResNew) { 
                payload.responsibleName = 'No hay'; 
                payload.responsiblePhone = 'No hay';
                payload.responsibleEmail = 'No hay';
                if (!payload.phone) payload.phone = 'No registrado';
            }

            // Asegurar ID
            if (!payload.id) payload.id = payload.billingCode;

            await createPatient(payload);
            
            await logAuditAction(currentUser.email, "CREACION_PACIENTE_RAPIDO", `Paciente creado: ${payload.fullName} [DPI/Código: ${payload.billingCode}]`);

            toast.success("Paciente Registrado Exitosamente");
            onClose(); 
        } catch (e) { 
            console.error(e);
            toast.error("Error al registrar paciente. Verifique el código/DPI."); 
        } finally { 
            setIsSaving(false); 
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden"
            >
                {/* Header */}
                <div className="p-6 md:p-8 border-b bg-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-800 text-xl md:text-2xl flex items-center gap-4">
                        <div className="p-3 bg-brand-600 text-white rounded-2xl shadow-lg">
                            <UserPlus className="w-5 h-5 md:w-6 md:h-6"/>
                        </div> 
                        Registro Rápido
                    </h3>
                    <button type="button" onClick={onClose} className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-all">
                        <X className="w-6 h-6 md:w-7 md:h-7"/>
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
                        
                        {/* SECCIÓN DATOS PERSONALES */}
                        <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">Datos Personales</div>

                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre del Paciente</label>
                            <input 
                                required 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500 transition-all text-slate-900 text-base md:text-lg" 
                                value={form.fullName} 
                                onChange={e => setForm({...form, fullName: e.target.value})} 
                                placeholder="Ej: Juan Pérez"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">DPI / Código Facturación</label>
                            <input 
                                required 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.billingCode} 
                                onChange={e => setForm({...form, billingCode: e.target.value, id: e.target.value})} 
                                placeholder="0000000000000"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ocupación</label>
                            <input 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.occupation} 
                                onChange={e => setForm({...form, occupation: e.target.value})} 
                                placeholder="Ej: Estudiante, Agricultor..."
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Edad</label>
                            <input 
                                required 
                                type="number" 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.age} 
                                onChange={e => setForm({...form, age: e.target.value})} 
                                placeholder="0"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Género</label>
                            <select 
                                required 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.gender} 
                                onChange={e => setForm({...form, gender: e.target.value})}
                            >
                                <option value="M">Masculino</option>
                                <option value="F">Femenino</option>
                            </select>
                        </div>
                        
                        {/* SECCIÓN CONTACTO DIRECTO */}
                        <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Contacto Directo</div>
                        
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono (Paciente)</label>
                            <input 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.phone} 
                                onChange={e => setForm({...form, phone: e.target.value})} 
                                placeholder="1234 5678"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Email (Paciente)</label>
                            <input 
                                type="email"
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.email} 
                                onChange={e => setForm({...form, email: e.target.value})} 
                                placeholder="ejemplo@correo.com"
                            />
                        </div>

                        {/* SECCIÓN DIRECCIÓN (NUEVO) */}
                        <div className="md:col-span-2 text-sm font-bold text-brand-600 uppercase tracking-widest border-b border-brand-100 pb-2 mb-2 mt-4">Dirección Domiciliar</div>

                        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">País</label>
                                <select 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm"
                                    value={form.address.country}
                                    onChange={(e) => updateAddress('country', e.target.value)}
                                >
                                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            {form.address.country === 'Guatemala' && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Departamento</label>
                                    <select 
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm"
                                        value={form.address.department}
                                        onChange={(e) => updateAddress('department', e.target.value)}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {Object.keys(GT_DEPARTMENTS).sort().map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>
                            )}

                            {form.address.department && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Municipio</label>
                                    <select 
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm"
                                        value={form.address.municipality}
                                        onChange={(e) => updateAddress('municipality', e.target.value)}
                                    >
                                        <option value="">-- Seleccionar --</option>
                                        {GT_DEPARTMENTS[form.address.department].sort().map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            )}

                            {form.address.department === 'Guatemala' && hasZones(form.address.municipality) && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Zona (Área Urbana)</label>
                                    <select 
                                        className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm"
                                        value={form.address.zone}
                                        onChange={(e) => updateAddress('zone', e.target.value)}
                                    >
                                        <option value="">-- Seleccionar Zona --</option>
                                        {GT_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* SECCIÓN CLÍNICA */}
                        <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Datos Clínicos</div>

                        <div>
                            <label className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-2 block">Tipo de Consulta</label>
                            <select 
                                required 
                                className="w-full p-4 bg-white border border-brand-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 font-medium text-slate-900 text-base md:text-sm" 
                                value={form.consultationType} 
                                onChange={e => setForm({...form, consultationType: e.target.value as 'Nueva' | 'Reconsulta'})}
                            >
                                <option value="Nueva">Nueva</option>
                                <option value="Reconsulta">Reconsulta</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Médico Tratante Anterior</label>
                            <select 
                                required 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.previousTreatment} 
                                onChange={e => setForm({...form, previousTreatment: e.target.value})}
                            >
                                <option value="No ha estado en tratamiento">No ha estado en tratamiento</option>
                                <option value="IGSS">IGSS</option>
                                <option value="Medico Privado">Médico Privado</option>
                                <option value="Hospital Nacional">Hospital Nacional</option>
                            </select>
                        </div>

                        {/* SECCIÓN RESPONSABLE */}
                        <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Datos del Responsable</div>

                        <div className="md:col-span-2 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 mt-2">
                            <input 
                                type="checkbox" 
                                id="noR" 
                                className="w-5 h-5 text-brand-600 rounded focus:ring-brand-500 border-gray-300"
                                checked={isNoResNew} 
                                onChange={e => setIsNoResNew(e.target.checked)} 
                            />
                            <label htmlFor="noR" className="text-xs font-bold text-slate-500 uppercase cursor-pointer select-none">
                                EL PACIENTE VE POR SU PROPIA SALUD (Omitir Responsable)
                            </label>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre Responsable</label>
                            <input 
                                required={!isNoResNew} 
                                disabled={isNoResNew} 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100 disabled:text-slate-400 outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={isNoResNew ? 'No hay' : form.responsibleName} 
                                onChange={e => setForm({...form, responsibleName: e.target.value})} 
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono Responsable</label>
                            <input 
                                required={!isNoResNew} 
                                disabled={isNoResNew} 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100 disabled:text-slate-400 outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={isNoResNew ? 'No hay' : form.responsiblePhone} 
                                onChange={e => setForm({...form, responsiblePhone: e.target.value})} 
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Email Responsable</label>
                            <input 
                                disabled={isNoResNew} 
                                type="email"
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100 disabled:text-slate-400 outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={isNoResNew ? 'No hay' : form.responsibleEmail} 
                                onChange={e => setForm({...form, responsibleEmail: e.target.value})} 
                                placeholder="ejemplo@correo.com"
                            />
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="p-6 md:p-8 bg-slate-50 border-t flex gap-4 shrink-0 rounded-b-[2rem]">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-200 rounded-2xl transition-all text-sm md:text-base"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={isSaving} 
                            className="flex-1 py-4 bg-brand-600 text-white font-bold rounded-2xl hover:bg-brand-700 shadow-xl flex justify-center items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
                        >
                            {isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5"/>} 
                            Confirmar
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};
