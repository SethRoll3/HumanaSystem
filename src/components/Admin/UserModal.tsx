
import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile, Specialty } from '../../../types';
import { X, Save, Loader2, Edit2, Plus, Lock, Mail, User, Stethoscope, Shield } from 'lucide-react';
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

    useEffect(() => {
        if (isOpen) {
            if (userToEdit) {
                setFormValues({ ...userToEdit });
            } else {
                setFormValues({ role: 'doctor', gender: 'M', isActive: true, specialty: '' });
            }
        }
    }, [isOpen, userToEdit]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (userToEdit) {
                await updateSystemUser(userToEdit.uid, formValues, currentUser.email);
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

                            {formValues.role === 'doctor' && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Stethoscope className="w-3 h-3" /> Especialidad
                                    </label>
                                    <div className="relative">
                                        <select 
                                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 transition-all appearance-none" 
                                            value={formValues.specialty || ''} 
                                            onChange={e => setFormValues({...formValues, specialty: e.target.value})}
                                        >
                                            <option value="">-- General --</option>
                                            {specialtiesList.map(spec => (
                                                <option key={spec.id} value={spec.name}>{spec.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-500">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>
                                </div>
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
