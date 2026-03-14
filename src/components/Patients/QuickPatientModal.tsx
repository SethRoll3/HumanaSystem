
import * as React from 'react';
import { useRef, useState } from 'react';
import { UserPlus, X, Save, Loader2, UploadCloud, Camera, RefreshCw, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { checkPatientDuplicates, createPatient } from '../../services/patientService.ts';
import { logAuditAction } from '../../services/auditService.ts';
import { Patient, PatientFile, UserProfile } from '../../../types.ts';
import { COUNTRIES, GT_DEPARTMENTS, GT_ZONES, MUNICIPALITIES_WITH_ZONES } from '../../data/geography.ts';
import { db, storage } from '../../firebase/config.ts';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

interface QuickPatientModalProps {
    onClose: () => void;
    currentUser: UserProfile;
    onSuccess?: (newPatientId: string) => Promise<void>;
}

export const QuickPatientModal: React.FC<QuickPatientModalProps> = ({ onClose, currentUser, onSuccess }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [isNoResNew, setIsNoResNew] = useState(false);
    const [patientFiles, setPatientFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
    const [, setPhotoRemoved] = useState(false);
    const [photoMimeType, setPhotoMimeType] = useState('image/jpeg');
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const calculateAgeFromBirthDate = (dateStr: string) => {
        if (!dateStr) return '';
        const today = new Date();
        const dob = new Date(dateStr);
        if (Number.isNaN(dob.getTime())) return '';
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age >= 0 ? String(age) : '';
    };

    const calculateBirthDateFromAge = (ageStr: string) => {
        const age = parseInt(ageStr, 10);
        if (!age || Number.isNaN(age)) return '';
        const today = new Date();
        const year = today.getFullYear() - age;
        const month = today.getMonth();
        const day = today.getDate();
        const date = new Date(year, month, day);
        return date.toISOString().slice(0, 10);
    };
    
    // Estado inicial limpio
    const [form, setForm] = useState<any>({ 
        fullName: '', 
        dpi: '',
        billingCode: '', 
        phone: '', 
        email: '', 
        occupation: '', 
        age: '', 
        birthDate: '', 
        gender: 'M', 
        previousTreatment: 'No ha estado en tratamiento', 
        previousTreatmentDetail: '',
        careCenter: 'Humana',
        referralChannel: '',
        responsibleName: '',
        responsiblePhone: '',
        responsibleEmail: '', 
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

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    };

    React.useEffect(() => {
        if (!isCameraOpen) {
            stopCamera();
            return;
        }
        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
            } catch (error) {
                setIsCameraOpen(false);
                toast.error('No se pudo acceder a la cámara');
            }
        };
        startCamera();
        return () => stopCamera();
    }, [isCameraOpen]);

    React.useEffect(() => {
        return () => {
            stopCamera();
            if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
        };
    }, [photoPreviewUrl]);

    const handleCapturePhoto = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(blob => {
            if (!blob) return;
            if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
            const url = URL.createObjectURL(blob);
            setCapturedPhoto(blob);
            setPhotoPreviewUrl(url);
            setPhotoRemoved(false);
            setIsCameraOpen(false);
            setPhotoMimeType('image/jpeg');
        }, 'image/jpeg', 0.9);
    };

    const handleUploadPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
        const url = URL.createObjectURL(file);
        setCapturedPhoto(file);
        setPhotoPreviewUrl(url);
        setPhotoRemoved(false);
        setIsCameraOpen(false);
        setPhotoMimeType(file.type || 'image/jpeg');
        event.target.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); 
        setIsSaving(true);
        try {
            if (!form.fullName.trim()) {
                throw new Error('El nombre del paciente es obligatorio.');
            }
            if (!form.phone.trim()) {
                throw new Error('El teléfono del paciente es obligatorio.');
            }
            const payload = { ...(form as object) } as Patient;
            
            // Lógica de "Paciente ve por su salud"
            if (isNoResNew) { 
                payload.responsibleName = 'No hay'; 
                payload.responsiblePhone = 'No hay';
                payload.responsibleEmail = 'No hay';
            }

            const duplicateCheck = await checkPatientDuplicates({
                fullName: payload.fullName,
                billingCode: payload.billingCode,
                dpi: payload.dpi
            });
            if (duplicateCheck.billingCodeMatch) {
                throw new Error(`El código de facturación ya está registrado para ${duplicateCheck.billingCodeMatch.fullName}.`);
            }
            if (duplicateCheck.dpiMatch) {
                throw new Error(`El DPI ya está registrado para ${duplicateCheck.dpiMatch.fullName}.`);
            }
            if (duplicateCheck.nameMatch) {
                throw new Error(`Ya existe un paciente con nombre igual o muy similar: ${duplicateCheck.nameMatch.fullName}.`);
            }

            const newId = await createPatient(payload);
            if (capturedPhoto) {
                const photoRef = ref(storage, `patients/${newId}/photo_${Date.now()}.jpg`);
                await uploadBytes(photoRef, capturedPhoto, { contentType: photoMimeType || 'image/jpeg' });
                const photoUrl = await getDownloadURL(photoRef);
                await updateDoc(doc(db, 'patients', newId), { photoUrl });
                payload.photoUrl = photoUrl;
            }

            if (patientFiles.length > 0) {
                const uploadedFiles: PatientFile[] = [];
                for (const file of patientFiles) {
                    const relativeName = (file as any).webkitRelativePath || file.name;
                    const storageRef = ref(storage, `patients/${newId}/files/${Date.now()}_${relativeName}`);
                    await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(storageRef);
                    uploadedFiles.push({ name: relativeName, url, type: file.type, uploadedAt: Date.now() });
                }
                await updateDoc(doc(db, 'patients', newId), { historyFiles: uploadedFiles });
            }
            
            await logAuditAction(currentUser.email, "CREACION_PACIENTE_RAPIDO", `Paciente creado: ${payload.fullName} [DPI: ${payload.dpi || '—'} | Código: ${payload.billingCode || '—'}]`);

            toast.success("Paciente Registrado Exitosamente");
            
            if (onSuccess) {
                await onSuccess(newId);
            }
            
            onClose(); 
        } catch (e: any) { 
            console.error(e);
            toast.error(e?.message || "Error al registrar paciente. Verifique el código/DPI."); 
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
                        <div className="md:col-span-2 text-base font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">Datos Personales</div>

                        <div className="md:col-span-2">
                            <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre del Paciente</label>
                            <input 
                                required 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-lg font-bold outline-none focus:ring-2 focus:ring-brand-500 transition-all text-slate-900 text-base md:text-lg" 
                                value={form.fullName} 
                                onChange={e => setForm({...form, fullName: e.target.value})} 
                                placeholder="Ej: Juan Pérez"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Foto del Paciente</div>
                            <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50">
                                <div className="flex flex-col md:flex-row gap-4 items-center">
                                    <div className="w-28 h-28 rounded-full overflow-hidden bg-white border border-slate-200 flex items-center justify-center">
                                        {photoPreviewUrl ? (
                                            <img src={photoPreviewUrl} alt="Foto del paciente" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <Camera className="w-8 h-8" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsCameraOpen(true)}
                                            className="px-4 py-2 text-xs font-bold text-brand-600 bg-white border border-brand-200 rounded-xl flex items-center gap-2"
                                        >
                                            <Camera className="w-4 h-4" />
                                            {photoPreviewUrl ? 'Tomar nueva' : 'Abrir cámara'}
                                        </button>
                                    <button
                                        type="button"
                                        onClick={() => photoInputRef.current?.click()}
                                        className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl flex items-center gap-2"
                                    >
                                        <UploadCloud className="w-4 h-4" />
                                        Subir foto
                                    </button>
                                        {photoPreviewUrl && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                                                    setCapturedPhoto(null);
                                                    setPhotoPreviewUrl('');
                                                    setPhotoRemoved(true);
                                                }}
                                                className="px-4 py-2 text-xs font-bold text-red-600 bg-white border border-red-200 rounded-xl flex items-center gap-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Quitar foto
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {isCameraOpen && (
                                    <div className="mt-4 space-y-3">
                                        <div className="w-full overflow-hidden rounded-2xl border border-slate-200">
                                            <video ref={videoRef} className="w-full h-auto" playsInline />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={handleCapturePhoto}
                                                className="px-4 py-2 text-xs font-bold text-white bg-brand-600 rounded-xl flex items-center gap-2"
                                            >
                                                <Camera className="w-4 h-4" />
                                                Tomar foto
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsCameraOpen(false)}
                                                className="px-4 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-xl flex items-center gap-2"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <canvas ref={canvasRef} className="hidden" />
                                <input
                                    ref={photoInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleUploadPhoto}
                                    className="hidden"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 block">DPI</label>
                            <input 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base" 
                                value={form.dpi}  
                                onChange={e => setForm({...form, dpi: e.target.value})} 
                                placeholder="0000000000000"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 block">Código Facturación</label>
                            <input 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base" 
                                value={form.billingCode}  
                                onChange={e => setForm({...form, billingCode: e.target.value})} 
                                placeholder="FAC-000123"
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

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 block">Edad</label>
                                <input 
                                    type="number" 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base" 
                                    value={form.age} 
                                    onChange={e => {
                                        const numeric = e.target.value.replace(/[^0-9]/g, '');
                                        const birthDate = numeric ? calculateBirthDateFromAge(numeric) : '';
                                        setForm({...form, age: numeric, birthDate});
                                    }} 
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Fecha Nacimiento</label>
                                <input 
                                    type="date" 
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                    value={form.birthDate} 
                                    onChange={e => {
                                        const birthDate = e.target.value;
                                        const age = calculateAgeFromBirthDate(birthDate);
                                        setForm({...form, birthDate, age});
                                    }} 
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Género</label>
                            <select 
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
                                required
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.phone} 
                                onChange={e => {
                                    const numeric = e.target.value.replace(/[^0-9]/g, '');
                                    setForm({...form, phone: numeric});
                                }} 
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
                            <label className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-2 block">Procedencia</label>
                            <select 
                                className="w-full p-4 bg-white border border-brand-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 font-medium text-slate-900 text-base md:text-sm" 
                                value={form.careCenter} 
                                onChange={e => setForm({...form, careCenter: e.target.value as 'Hospital' | 'Humana'})}
                            >
                                <option value="Humana">Humana</option>
                                <option value="Hospital">Hospital</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Médico Tratante Anterior</label>
                            <select 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={form.previousTreatment} 
                                onChange={e => {
                                    const value = e.target.value;
                                    setForm({
                                        ...form,
                                        previousTreatment: value,
                                        previousTreatmentDetail: value === 'IGSS' ? form.previousTreatmentDetail : ''
                                    });
                                }}
                            >
                                <option value="No ha estado en tratamiento">No ha estado en tratamiento</option>
                                <option value="IGSS">IGSS</option>
                                <option value="Medico Privado">Médico Privado</option>
                                <option value="Hospital Nacional">Hospital Nacional</option>
                            </select>
                        </div>

                        {form.previousTreatment === 'IGSS' && (
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Detalle IGSS</label>
                                <select
                                    className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm"
                                    value={form.previousTreatmentDetail}
                                    onChange={e => setForm({ ...form, previousTreatmentDetail: e.target.value })}
                                >
                                    <option value="">-- Seleccionar --</option>
                                    <option value="IGSS consulta privada">IGSS consulta privada</option>
                                    <option value="IGSS examenes de diagnostico">IGSS exámenes de diagnóstico</option>
                                    <option value="Servicio Contratado">Servicio Contratado</option>
                                </select>
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Canal de referencia (¿De dónde nos conoció?)</label>
                            <select
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm"
                                value={form.referralChannel}
                                onChange={e => setForm({ ...form, referralChannel: e.target.value })}
                            >
                                <option value="">-- Seleccionar --</option>
                                <option value="CONOCIDO">CONOCIDO</option>
                                <option value="EMAIL">EMAIL</option>
                                <option value="FACEBOOK">FACEBOOK</option>
                                <option value="FAMILIA">FAMILIA</option>
                                <option value="GOOGLE">GOOGLE</option>
                                <option value="IA">IA</option>
                                <option value="INSTAGRAM">INSTAGRAM</option>
                                <option value="LINKEDIN">LINKEDIN</option>
                                <option value="OTROS">OTROS</option>
                                <option value="PAGINA WEB">PAGINA WEB</option>
                                <option value="RADIO">RADIO</option>
                                <option value="TELEVISION">TELEVISION</option>
                                <option value="TIKTOK">TIKTOK</option>
                                <option value="WHATSAPP">WHATSAPP</option>
                                <option value="YOUTUBE">YOUTUBE</option>
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
                                disabled={isNoResNew} 
                                className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100 disabled:text-slate-400 outline-none focus:ring-2 focus:ring-brand-500 text-slate-900 text-base md:text-sm" 
                                value={isNoResNew ? 'No hay' : form.responsibleName} 
                                onChange={e => setForm({...form, responsibleName: e.target.value})} 
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono Responsable</label>
                            <input 
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

                        <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Historial Clínico y Archivos</div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Archivos Adjuntos</label>
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    {patientFiles.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-blue-50 border-blue-200 rounded-lg px-2 py-1 text-xs">
                                            {(f as any).webkitRelativePath || f.name}{f.type ? ` (${f.type})` : ''}
                                            <button type="button" onClick={() => setPatientFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                <input type="file" ref={fileInputRef} onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length > 0) setPatientFiles(prev => [...prev, ...files]); }} multiple className="hidden" />
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-brand-600 bg-white border border-brand-200 px-4 py-2 rounded-lg flex items-center gap-2">
                                    <UploadCloud className="w-4 h-4" />
                                    Seleccionar Archivos
                                </button>
                            </div>
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
