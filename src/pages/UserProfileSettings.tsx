
import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { UserProfile, Specialty } from '../../types.ts';
import { motion } from 'framer-motion';
// Fixed import to include UploadCloud, Eye, EyeOff
import { User, Shield, Key, Mail, Save, Loader2, Lock, BadgeCheck, FileKey, Trash2, CheckCircle, UploadCloud, Eye, EyeOff } from 'lucide-react';
import { updateEmail, updatePassword, getAuth } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config.ts';
import { toast } from 'sonner';
import { getSpecialties } from '../services/inventoryService.ts';
import { logAuditAction } from '../services/auditService.ts';
// @ts-ignore
import forge from 'node-forge';

interface UserProfileSettingsProps {
    user: UserProfile;
}

export const UserProfileSettings: React.FC<UserProfileSettingsProps> = ({ user }) => {
    const auth = getAuth();
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);
    
    // Profile State
    const [name, setName] = useState(user.name);
    // Inicializamos con el valor del usuario para que aparezca seleccionado
    const [specialty, setSpecialty] = useState(user.specialty || '');
    const [availableSpecialties, setAvailableSpecialties] = useState<Specialty[]>([]);
    
    // Digital Cert State (Initialized from user prop)
    const [certData, setCertData] = useState(user.digitalCertData || null);
    const [isVerifyingCert, setIsVerifyingCert] = useState(false);
    const [p12Password, setP12Password] = useState('');
    const [showP12Password, setShowP12Password] = useState(false); 
    const [selectedP12File, setSelectedP12File] = useState<File | null>(null);

    // Security State
    const [email, setEmail] = useState(user.email);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- NUEVO: Sincronizar estado local de certData si el usuario (user prop) cambia ---
    useEffect(() => {
        setCertData(user.digitalCertData || null);
    }, [user.digitalCertData]);

    useEffect(() => {
        if (user.role === 'doctor') {
            getSpecialties().then((specs) => {
                const exists = specs.some(s => s.name === user.specialty);
                if (user.specialty && !exists) {
                    setAvailableSpecialties([...specs, { id: 'legacy-val', name: user.specialty }]);
                } else {
                    setAvailableSpecialties(specs);
                }
            });
        }
    }, [user.role, user.specialty]);

    // Efecto para asegurar que si la especialidad cambia en las props, se actualice el estado local
    useEffect(() => {
        if (user.specialty) {
            setSpecialty(user.specialty);
        }
    }, [user.specialty]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoadingProfile(true);
        try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                name: name,
                specialty: user.role === 'doctor' ? specialty : user.specialty,
            });
            
            await logAuditAction(user.email, "ACTUALIZACION_PERFIL", `Datos públicos actualizados. Nombre: ${name}, Especialidad: ${specialty}`);

            toast.success("Perfil público actualizado correctamente.");
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar perfil.");
        } finally {
            setIsLoadingProfile(false);
        }
    };

    // --- LOGICA DE PROCESAMIENTO P12 ---
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
            toast.error("Solo se permiten archivos .p12 o .pfx");
            return;
        }
        setSelectedP12File(file);
        setP12Password(''); 
    };

    const verifyAndUploadCert = async () => {
        if (!selectedP12File || !p12Password) {
            toast.error("Seleccione archivo y escriba la contraseña.");
            return;
        }

        setIsVerifyingCert(true);
        try {
            console.log("1. [P12] Iniciando lectura del archivo...");
            const arrayBuffer = await selectedP12File.arrayBuffer();
            
            console.log("2. [P12] Convirtiendo a buffer de Forge...");
            const p12Der = forge.util.createBuffer(arrayBuffer);
            const p12Asn1 = forge.asn1.fromDer(p12Der.getBytes());
            
            console.log("3. [P12] Intentando desencriptar con contraseña...");
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, p12Password);
            
            console.log("4. [P12] Extrayendo datos del certificado...");
            const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
            // @ts-ignore
            const certBag = bags[forge.pki.oids.certBag]?.[0];
            
            if (!certBag) {
                throw new Error("No se encontró certificado válido en el archivo.");
            }

            const cert = certBag.cert;
            const commonName = cert.subject.getField('CN')?.value || "Desconocido";
            const issuerName = cert.issuer.getField('CN')?.value || "Entidad Certificadora";
            const serialNumber = cert.serialNumber;
            const expiry = cert.validity.notAfter;

            console.log(`5. [P12] Verificación EXITOSA. Propietario: ${commonName}`);

            // 4. Si llegamos aquí, la contraseña es correcta. Subimos el archivo a Storage.
            console.log("6. [STORAGE] Iniciando subida a Firebase...");
            const storageRef = ref(storage, `certificates/${user.uid}/signature.p12`);
            
            await uploadBytes(storageRef, selectedP12File);
            console.log("7. [STORAGE] Subida completada. Obteniendo URL...");
            
            const downloadUrl = await getDownloadURL(storageRef);

            // 5. Guardamos Metadata en Firestore
            console.log("8. [DB] Guardando metadatos en Firestore...");
            const newCertData = {
                fileUrl: downloadUrl,
                issuedTo: commonName,
                issuedBy: issuerName,
                serialNumber: serialNumber,
                expiryDate: expiry.toString()
            };

            await updateDoc(doc(db, 'users', user.uid), { digitalCertData: newCertData });
            
            await logAuditAction(user.email, "CARGA_FIRMA_DIGITAL", `Certificado P12 subido. Emitido a: ${commonName}. Serial: ${serialNumber}`);

            // NOTA: setCertData se actualizará automáticamente gracias al useEffect que mira user.digitalCertData
            setSelectedP12File(null);
            setP12Password('');
            
            toast.success("Firma Digital verificada y guardada exitosamente.");

        } catch (error: any) {
            console.error("P12 Process Error:", error);
            
            // Manejo específico de errores
            if (error.message.includes("password") || error.message.includes("MAC")) {
                toast.error("Contraseña incorrecta. No se pudo desencriptar.");
            } else if (error.code === 'storage/unauthorized' || error.message.includes('CORS') || error.message.includes('network')) {
                toast.error("Error de Red/CORS al subir archivo. El certificado es válido pero el servidor rechazó la conexión.");
            } else {
                toast.error("Error: " + error.message);
            }
        } finally {
            setIsVerifyingCert(false);
        }
    };

    const handleDeleteCert = async () => {
        if(confirm("¿Está seguro? Deberá subir el archivo nuevamente para poder firmar.")) {
            try {
                await updateDoc(doc(db, 'users', user.uid), { digitalCertData: null });
                await logAuditAction(user.email, "ELIMINACION_FIRMA_DIGITAL", "Certificado P12 eliminado del perfil.");
                // NOTA: setCertData se actualizará automáticamente
                toast.success("Certificado eliminado del perfil.");
            } catch (e) {
                toast.error("Error al eliminar.");
            }
        }
    };

    const handleUpdateSecurity = async (e: React.FormEvent) => {
        e.preventDefault();
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        if (newPassword && newPassword !== confirmPassword) {
            toast.error("Las contraseñas no coinciden.");
            return;
        }

        setIsLoadingSecurity(true);
        let emailChanged = false;
        let passwordChanged = false;

        try {
            if (email !== user.email) {
                await updateEmail(currentUser, email);
                await updateDoc(doc(db, 'users', user.uid), { email: email });
                emailChanged = true;
            }
            if (newPassword) {
                await updatePassword(currentUser, newPassword);
                passwordChanged = true;
            }
            if (emailChanged || passwordChanged) {
                const changes = [];
                if(emailChanged) changes.push("Correo");
                if(passwordChanged) changes.push("Contraseña");
                await logAuditAction(user.email, "ACTUALIZACION_SEGURIDAD", `Credenciales actualizadas: [${changes.join(', ')}]`);

                toast.success("Credenciales actualizadas.");
                setNewPassword('');
                setConfirmPassword('');
            } else {
                toast.info("Sin cambios.");
            }
        } catch (error: any) {
            if (error.code === 'auth/requires-recent-login') {
                toast.error("Por seguridad, reinicie sesión para cambiar estos datos.");
            } else {
                toast.error(error.message);
            }
        } finally {
            setIsLoadingSecurity(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-brand-100 text-brand-700 rounded-2xl shadow-sm">
                    <User className="w-8 h-8" />
                </div>
                <div>
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800">Configuración de Usuario</h2>
                    <p className="text-slate-500 text-xs md:text-sm">Administre sus datos, firma electrónica (.p12) y acceso.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* --- CARD 1: PERFIL PÚBLICO & FIRMA --- */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-fit">
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><BadgeCheck className="w-5 h-5 text-brand-600"/> Perfil Profesional</h3>
                    </div>
                    <div className="p-6 md:p-8 space-y-6">
                        <form onSubmit={handleSaveProfile} className="space-y-6">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre Completo</label>
                                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 font-medium outline-none focus:ring-2 focus:ring-brand-500 transition-all text-sm md:text-base" />
                            </div>

                            {user.role === 'doctor' && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Especialidad Médica</label>
                                    <select 
                                        value={specialty} 
                                        onChange={(e) => setSpecialty(e.target.value)}
                                        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 font-medium outline-none focus:ring-2 focus:ring-brand-500 transition-all text-sm md:text-base"
                                    >
                                        <option value="">-- Seleccionar Especialidad --</option>
                                        {availableSpecialties.map(spec => (
                                            <option key={spec.id || spec.name} value={spec.name}>{spec.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            
                            <button type="submit" disabled={isLoadingProfile} className="w-full py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 flex justify-center items-center gap-2 disabled:opacity-70 text-sm md:text-base">
                                {isLoadingProfile ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4"/>} Guardar Datos
                            </button>
                        </form>

                        {/* --- SECCIÓN FIRMA DIGITAL .P12 --- */}
                        {user.role === 'doctor' && (
                            <div className="border-t border-slate-100 pt-6 mt-6">
                                <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <FileKey className="w-4 h-4 text-emerald-600"/> Firma Digital (.p12 / .pfx)
                                </h4>
                                
                                {certData ? (
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 relative">
                                        <div className="flex items-start gap-3">
                                            <div className="bg-white p-2 rounded-full shadow-sm"><CheckCircle className="w-6 h-6 text-emerald-500"/></div>
                                            <div>
                                                <p className="text-sm font-bold text-emerald-800">Certificado Activo</p>
                                                <p className="text-xs text-emerald-600 mt-1">Emitido a: <strong>{certData.issuedTo}</strong></p>
                                                <p className="text-[10px] text-emerald-500">Por: {certData.issuedBy}</p>
                                                <p className="text-[10px] text-emerald-500">Serial: {certData.serialNumber}</p>
                                            </div>
                                        </div>
                                        <button onClick={handleDeleteCert} className="absolute top-4 right-4 text-emerald-300 hover:text-red-500 transition"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                                            Suba su archivo <strong>.p12</strong> o <strong>.pfx</strong> (proporcionado por Cámara de Comercio, etc). 
                                            Se requerirá la contraseña <strong>cada vez que firme</strong> un documento.
                                        </p>
                                        
                                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".p12, .pfx" className="hidden" />
                                        
                                        {!selectedP12File ? (
                                            <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 font-bold text-xs hover:border-brand-400 hover:text-brand-500 transition flex items-center justify-center gap-2 bg-white">
                                                <UploadCloud className="w-4 h-4"/> Seleccionar Archivo
                                            </button>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white p-2 rounded border">
                                                    <FileKey className="w-4 h-4"/> {selectedP12File.name}
                                                </div>
                                                
                                                <div className="relative">
                                                    <input 
                                                        type={showP12Password ? "text" : "password"} 
                                                        placeholder="Contraseña del Certificado" 
                                                        value={p12Password}
                                                        onChange={(e) => setP12Password(e.target.value)}
                                                        className="w-full p-3 pr-10 text-sm border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 bg-white text-slate-900 shadow-sm"
                                                    />
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setShowP12Password(!showP12Password)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 transition-colors"
                                                    >
                                                        {showP12Password ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button onClick={verifyAndUploadCert} disabled={isVerifyingCert} className="flex-1 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 disabled:opacity-50">
                                                        {isVerifyingCert ? 'Verificando...' : 'Verificar y Guardar'}
                                                    </button>
                                                    <button onClick={() => { setSelectedP12File(null); setP12Password(''); }} className="px-3 py-2 border rounded-lg text-xs hover:bg-slate-100 bg-white">Cancelar</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* --- CARD 2: SEGURIDAD --- */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden h-fit">
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Key className="w-5 h-5 text-amber-500"/> Seguridad y Acceso</h3>
                    </div>
                    <form onSubmit={handleUpdateSecurity} className="p-6 md:p-8 space-y-6">
                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl mb-4">
                            <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                ⚠️ Nota: Cambiar credenciales requiere inicio de sesión reciente. Si falla, salga y vuelva a entrar.
                            </p>
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Correo Electrónico</label>
                            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-sm md:text-base" />
                        </div>

                        <hr className="border-slate-100" />

                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nueva Contraseña (Opcional)</label>
                            <input type="password" placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-sm md:text-base" />
                            <p className="text-[10px] text-slate-400 mt-2 ml-1">Dejar en blanco para mantener la actual.</p>
                        </div>

                        {newPassword && (
                             <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Confirmar Contraseña</label>
                                <input required type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-amber-500 text-sm md:text-base" />
                             </motion.div>
                        )}

                        <div className="pt-2">
                            <button type="submit" disabled={isLoadingSecurity} className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 shadow-lg flex justify-center items-center gap-2 disabled:opacity-70 text-sm md:text-base">
                                {isLoadingSecurity ? <Loader2 className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5"/>} Actualizar Credenciales
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </div>
    );
};
