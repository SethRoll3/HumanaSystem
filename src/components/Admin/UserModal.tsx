
import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile, Specialty } from '../../types';
import { X, Save, Loader2, Edit2, Plus, Lock, Mail, User, Stethoscope, Shield, Search } from 'lucide-react';
import { toast } from 'sonner';
import { createSystemUser, updateSystemUser } from '../../services/userService';

interface UserModalProps {
    isOpen: boolean;
    onClose: () => void;
    userToEdit: UserProfile | null;
    currentUser: UserProfile;
    specialtiesList: Specialty[];
}

export const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, userToEdit, currentUser, specialtiesList }) => {
    const [formValues, setFormValues] = useState<any>({});
    const [isSaving, setIsSaving] = useState(false);
    const [specialtyQuery, setSpecialtyQuery] = useState('');
    const normalizeSpecialties = (value: any) => {
        const raw = Array.isArray(value?.specialties)
            ? value.specialties
            : (value?.specialty ? [value.specialty] : []);
        return raw.map((s: any) => String(s)).filter((s: string) => s.trim() !== '');
    };

    useEffect(() => {
        if (isOpen) {
            if (userToEdit) {
                const specialties = normalizeSpecialties(userToEdit);
                setFormValues({ ...userToEdit, specialties, specialty: specialties[0] || userToEdit.specialty || '', newPassword: '', confirmPassword: '' });
            } else {
                setFormValues({ role: 'doctor', gender: 'M', isActive: true, specialty: '', specialties: [] });
            }
            setSpecialtyQuery('');
        }
    }, [isOpen, userToEdit]);

    const toggleSpecialty = (name: string) => {
        setFormValues((prev: any) => {
            const current = Array.isArray(prev.specialties) ? prev.specialties : [];
            const next = current.includes(name)
                ? current.filter((item: string) => item !== name)
                : [...current, name];
            return { ...prev, specialties: next, specialty: next[0] || '' };
        });
    };

    const filteredSpecialties = specialtiesList.filter(spec =>
        spec.name.toLowerCase().includes(specialtyQuery.trim().toLowerCase())
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (userToEdit) {
                const nextPassword = String(formValues.newPassword || '').trim();
                const nextConfirm = String(formValues.confirmPassword || '').trim();
                if (nextPassword && nextPassword.length < 6) {
                    throw new Error("La contraseña debe tener al menos 6 caracteres.");
                }
                if (nextPassword && nextPassword !== nextConfirm) {
                    throw new Error("Las contraseñas no coinciden.");
                }
                const authUpdates = {
                    email: formValues.email !== userToEdit.email ? formValues.email : undefined,
                    password: nextPassword || undefined
                };
                const { password, confirmPassword, newPassword, ...payload } = formValues;
                await updateSystemUser(userToEdit.uid, payload, currentUser.email, authUpdates);
                toast.success("Usuario actualizado correctamente.");
            } else {
                if (!formValues.password || formValues.password.length < 6) {
                    throw new Error("La contraseña es obligatoria y debe tener al menos 6 caracteres.");
                }
                await createSystemUser(formValues, formValues.password);
                toast.success("Usuario creado exitosamente.");
            }
            onClose();
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || "Error al guardar el usuario.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden"
                >
                    <div className="p-6 md:p-8 border-b bg-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-slate-800 text-xl md:text-2xl flex items-center gap-4">
                            <div className="p-3 bg-brand-600 text-white rounded-2xl shadow-lg">
                                {userToEdit ? <Edit2 className="w-5 h-5 md:w-6 md:h-6"/> : <Plus className="w-5 h-5 md:w-6 md:h-6"/>}
                            </div>
                            {userToEdit ? `Editar Usuario` : `Nuevo Usuario`}
                        </h3>
                        <button type="button" onClick={onClose} className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-all">
                            <X className="w-6 h-6 md:w-7 md:h-7"/>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
                        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
                            
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <User className="w-3 h-3" /> Nombre Completo
                                </label>
                                <input 
                                    required 
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-brand-500 transition-all" 
                                    value={formValues.name || ''} 
                                    onChange={e => setFormValues({...formValues, name: e.target.value})} 
                                    placeholder="Ej. Dr. Juan Pérez"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <Mail className="w-3 h-3" /> Correo Electrónico
                                </label>
                                <input 
                                    required 
                                    type="email" 
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 transition-all" 
                                    value={formValues.email || ''} 
                                    onChange={e => setFormValues({...formValues, email: e.target.value})} 
                                    placeholder="correo@ejemplo.com"
                                />
                            </div>
                            
                            {!userToEdit && (
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Lock className="w-3 h-3" /> Contraseña
                                    </label>
                                    <input 
                                        required 
                                        type="password" 
                                        minLength={6} 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 transition-all" 
                                        value={formValues.password || ''} 
                                        onChange={e => setFormValues({...formValues, password: e.target.value})} 
                                        placeholder="Mínimo 6 caracteres"
                                    />
                                </div>
                            )}
                            {userToEdit && (
                                <>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Lock className="w-3 h-3" /> Nueva Contraseña
                                        </label>
                                        <input 
                                            type="password" 
                                            minLength={6} 
                                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 transition-all" 
                                            value={formValues.newPassword || ''} 
                                            onChange={e => setFormValues({...formValues, newPassword: e.target.value})} 
                                            placeholder="Mínimo 6 caracteres"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Lock className="w-3 h-3" /> Confirmar Contraseña
                                        </label>
                                        <input 
                                            type="password" 
                                            minLength={6} 
                                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 transition-all" 
                                            value={formValues.confirmPassword || ''} 
                                            onChange={e => setFormValues({...formValues, confirmPassword: e.target.value})} 
                                            placeholder="Repita la contraseña"
                                        />
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <Shield className="w-3 h-3" /> Rol en el Sistema
                                </label>
                                <div className="relative">
                                    <select 
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none" 
                                        value={formValues.role || 'doctor'} 
                                        onChange={e => setFormValues({...formValues, role: e.target.value})}
                                    >
                                        <option value="doctor">Doctor</option>
                                        <option value="licenciado">Licenciado</option>
                                        <option value="nurse">Enfermería</option>
                                        <option value="receptionist">Recepción</option>
                                        <option value="admin">Administrador</option>
                                        <option value="resident">Médico Residente</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>

                            {(formValues.role === 'doctor' || formValues.role === 'licenciado') && (
                                <>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <Stethoscope className="w-3 h-3" /> Especialidades
                                        </label>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] text-slate-400 font-semibold">{(formValues.specialties || []).length} seleccionadas</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(formValues.specialties || []).length === 0 && (
                                                    <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                                                        Ninguna especialidad seleccionada
                                                    </span>
                                                )}
                                                {(formValues.specialties || []).map((spec: string) => (
                                                    <button
                                                        key={spec}
                                                        type="button"
                                                        onClick={() => toggleSpecialty(spec)}
                                                        className="inline-flex items-center gap-2 rounded-full bg-brand-50 text-brand-700 border border-brand-200 px-3 py-1 text-xs font-semibold hover:bg-brand-100"
                                                    >
                                                        <span>{spec}</span>
                                                        <span className="text-brand-400">×</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    value={specialtyQuery}
                                                    onChange={(e) => setSpecialtyQuery(e.target.value)}
                                                    placeholder="Buscar especialidad..."
                                                    className="w-full p-3 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium outline-none focus:ring-2 focus:ring-brand-500 transition-all text-sm"
                                                />
                                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                                            </div>
                                            <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200 bg-white">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
                                                    {filteredSpecialties.map(spec => {
                                                        const isSelected = (formValues.specialties || []).includes(spec.name);
                                                        return (
                                                            <button
                                                                key={spec.id || spec.name}
                                                                type="button"
                                                                onClick={() => toggleSpecialty(spec.name)}
                                                                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                                                    isSelected
                                                                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                                                                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                                                }`}
                                                            >
                                                                <span>{spec.name}</span>
                                                                <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                                                                    {isSelected ? 'Seleccionada' : 'Seleccionar'}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                        
                        <div className="p-6 md:p-8 bg-slate-50 border-t flex gap-4 shrink-0 rounded-b-[2rem]">
                            <button type="button" onClick={onClose} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-200 rounded-2xl transition-all">
                                Cancelar
                            </button>
                            <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-brand-600 text-white font-bold rounded-2xl hover:bg-brand-700 shadow-xl flex justify-center items-center gap-3">
                                {isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5"/>} 
                                {userToEdit ? 'Guardar Cambios' : 'Crear Usuario'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
