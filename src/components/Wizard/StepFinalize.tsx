
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { CheckCircle, Key, UserPlus, AlertCircle, FileText, Save, Loader2, FileKey, XCircle, Trash2, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { getSpecialties } from '../../services/inventoryService.ts';
import { Specialty, SpecialtyReferral, UserProfile } from '../../../types.ts';
import { motion, AnimatePresence } from 'framer-motion';
// @ts-ignore
import forge from 'node-forge';

interface StepFinalizeProps {
    onFinish: () => void;
    isSaving: boolean;
    currentUser: UserProfile; 
}

export const StepFinalize: React.FC<StepFinalizeProps> = ({ onFinish, isSaving, currentUser }) => {
    const { register, watch, setValue } = useFormContext();
    
    // WATCH ALL FIELDS
    const diagnosis = watch('diagnosis');
    const prescription = watch('prescription');
    const prescriptionNotes = watch('prescriptionNotes');
    const referralGroups = watch('referralGroups');
    const otherExams = watch('otherExams');
    const referralNote = watch('referralNote');
    const nursingNotes = watch('followUpText');
    const currentSignature = watch('signature');
    const specialtyReferrals: SpecialtyReferral[] = watch('specialtyReferrals') || [];
    const isReadyToFinish = watch('isReadyToFinish');
    
    const [specialties, setSpecialties] = useState<Specialty[]>([]);
    const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');
    const [confirmedKeys, setConfirmedKeys] = useState<Set<string>>(new Set());

    // STATE PARA FIRMA P12
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [certPassword, setCertPassword] = useState('');
    const [showCertPassword, setShowCertPassword] = useState(false); // NEW: Toggle visibility
    const [isSigning, setIsSigning] = useState(false);

    const hasStoredCert = !!currentUser.digitalCertData;

    useEffect(() => {
        getSpecialties().then(setSpecialties);
    }, []);

    useEffect(() => {
        const missing = [];
        if (!diagnosis?.trim()) missing.push('diagnosis');
        const hasPrescriptionContent = (prescription && prescription.length > 0) || (prescriptionNotes && prescriptionNotes.trim().length > 0);
        if (!hasPrescriptionContent) missing.push('prescription');
        const hasLabs = (referralGroups?.length > 0) || (otherExams?.trim()) || (referralNote?.trim());
        if (!hasLabs) missing.push('exams');
        if (!specialtyReferrals?.length) missing.push('referrals');
        if (!nursingNotes?.trim()) missing.push('nursing');
        if (!currentSignature) missing.push('signature');

        const allConfirmed = missing.every(key => confirmedKeys.has(key));
        setValue('isReadyToFinish', allConfirmed);

        const omissionsMap: {[key:string]: boolean} = {};
        missing.forEach(key => { if (confirmedKeys.has(key)) omissionsMap[key] = true; });
        setValue('omittedFields', omissionsMap);
    }, [diagnosis, prescription, prescriptionNotes, referralGroups, otherExams, referralNote, nursingNotes, currentSignature, specialtyReferrals, confirmedKeys, setValue]);

    const handleConfirmToggle = (key: string) => {
        setConfirmedKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const getMissingItems = () => {
        const items = [];
        if (!diagnosis?.trim()) items.push({ key: 'diagnosis', label: 'Sin Diagnóstico Médico' });
        const hasPrescriptionContent = (prescription && prescription.length > 0) || (prescriptionNotes && prescriptionNotes.trim().length > 0);
        if (!hasPrescriptionContent) items.push({ key: 'prescription', label: 'Sin Receta / Tratamiento' });
        const hasLabs = (referralGroups?.length > 0) || (otherExams?.trim()) || (referralNote?.trim());
        if (!hasLabs) items.push({ key: 'exams', label: 'Sin Solicitud de Laboratorios' });
        if (!specialtyReferrals?.length) items.push({ key: 'referrals', label: 'Sin Referencia a Especialistas' });
        if (!nursingNotes?.trim()) items.push({ key: 'nursing', label: 'Sin Anotaciones para Enfermería' });
        if (!currentSignature) items.push({ key: 'signature', label: hasStoredCert ? 'Falta Firmar Digitalmente' : 'Firma Manual Requerida' });
        return items;
    };

    const missingItems = getMissingItems();

    // 1. Iniciar proceso de firma
    const handleSignClick = () => {
        if (!hasStoredCert) {
            // Firma Manual
            if (currentSignature?.type === 'manual') {
                setValue('signature', null);
            } else {
                setValue('signature', { type: 'manual' });
                toast.info("Se dejará espacio para firma manual.");
            }
        } else {
            // Firma Digital -> Pedir Password
            if (currentSignature?.type === 'digital_p12') {
                setValue('signature', null); // Unsign
            } else {
                setCertPassword('');
                setShowCertPassword(false);
                setShowPasswordModal(true);
            }
        }
    };

    // 2. Verificar password y firmar
    const verifyAndSign = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSigning(true);
        try {
            // Descargar el P12 desde URL
            const response = await fetch(currentUser.digitalCertData!.fileUrl);
            const arrayBuffer = await response.arrayBuffer();
            const binaryString = new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '');
            
            // Decodificar con Forge
            const p12Asn1 = forge.asn1.fromDer(binaryString);
            // Intentar abrir con password ingresado (esto lanza error si falla)
            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, certPassword);
            
            // Si pasamos aquí, el password es correcto.
            setValue('signature', { 
                type: 'digital_p12',
                signerName: currentUser.digitalCertData!.issuedTo,
                signatureDate: Date.now(),
                certificateSerial: currentUser.digitalCertData!.serialNumber
            });
            
            toast.success("Documento Firmado Digitalmente Correctamente.");
            setShowPasswordModal(false);

        } catch (error) {
            console.error(error);
            toast.error("Contraseña incorrecta. No se pudo acceder a la firma.");
        } finally {
            setIsSigning(false);
        }
    };

    const updateReferralNote = (id: string, note: string) => {
        const updated = specialtyReferrals.map(ref => {
            if (ref.id === id) return { ...ref, note };
            return ref;
        });
        setValue('specialtyReferrals', updated);
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold"><UserPlus className="w-5 h-5 text-brand-600" /><h4>Referencia a Especialistas</h4></div>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <select className="flex-1 rounded-lg border-slate-300 p-2.5 text-sm bg-slate-50 focus:ring-2 focus:ring-brand-500 outline-none text-slate-700" value={selectedSpecialty} onChange={(e) => setSelectedSpecialty(e.target.value)}>
                        <option value="">-- Seleccionar Especialidad --</option>
                        {specialties.filter(s => !specialtyReferrals.some(r => r.specialty === s.name)).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                    <button type="button" onClick={() => { if(selectedSpecialty) { setValue('specialtyReferrals', [...specialtyReferrals, {id: `ref-${Date.now()}`, specialty: selectedSpecialty, note: ''}]); setSelectedSpecialty(''); } }} className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 w-full sm:w-auto">Agregar</button>
                </div>
                <div className="space-y-3">
                    {specialtyReferrals.map(r => (
                        <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-slate-800 text-sm">{r.specialty}</span>
                                <button type="button" onClick={() => setValue('specialtyReferrals', specialtyReferrals.filter(ref => ref.id !== r.id))} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                            </div>
                            <textarea 
                                placeholder={`Motivo de la referencia o nota para ${r.specialty}...`}
                                className="w-full text-sm bg-yellow-50/50 border border-yellow-200 rounded-lg p-2 focus:ring-2 focus:ring-yellow-400 focus:border-transparent placeholder:text-slate-400 text-slate-700 resize-none"
                                rows={2}
                                value={r.note || ''}
                                onChange={(e) => updateReferralNote(r.id, e.target.value)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold"><FileText className="w-5 h-5 text-brand-600" /><h4>Anotaciones para Enfermería</h4></div>
                <textarea 
                    {...register('followUpText')} 
                    rows={3} 
                    placeholder="Instrucciones post-consulta..." 
                    className="w-full text-sm bg-yellow-50/50 border border-yellow-200 rounded-lg p-3 focus:ring-2 focus:ring-yellow-400 focus:border-transparent placeholder:text-slate-400 text-slate-700 resize-none" 
                />
            </div>

            {/* SECCIÓN DE FIRMA */}
            <div className={`p-6 border-2 border-dashed rounded-xl text-center transition-colors ${currentSignature ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                {hasStoredCert ? (
                    <>
                        {currentSignature ? (
                            <div className="flex flex-col items-center">
                                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full mb-2">
                                    <FileKey className="w-8 h-8"/>
                                </div>
                                <p className="text-sm font-bold text-emerald-700">Firmado Digitalmente</p>
                                <p className="text-xs text-emerald-600 mb-4">{currentUser.digitalCertData?.issuedTo}</p>
                                <button type="button" onClick={handleSignClick} className="px-6 py-2 rounded-lg font-bold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 text-sm shadow-sm w-full md:w-auto">
                                    Deshacer Firma
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center mb-4">
                                    <FileKey className="w-8 h-8"/>
                                </div>
                                <h4 className="text-lg font-bold text-slate-800 mb-1">Firma Digital Disponible</h4>
                                <p className="text-xs text-slate-500 mb-4">Certificado detectado. Se requiere contraseña.</p>
                                <button type="button" onClick={handleSignClick} className="px-6 py-2 rounded-lg font-bold bg-brand-600 text-white hover:bg-brand-700 shadow-lg text-sm w-full md:w-auto">
                                    Firmar con Certificado
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="flex flex-col items-center">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${currentSignature ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-600'}`}>
                            {currentSignature ? <CheckCircle className="w-8 h-8"/> : <XCircle className="w-8 h-8"/>}
                        </div>
                        {currentSignature ? (
                            <>
                                <p className="text-xs font-bold text-slate-600 mb-4">Se dejará el espacio en blanco.</p>
                                <button type="button" onClick={handleSignClick} className="text-xs text-red-500 underline">Cancelar</button>
                            </>
                        ) : (
                            <>
                                <h4 className="text-lg font-bold text-slate-800 mb-1">Sin Certificado Digital</h4>
                                <p className="text-xs text-amber-600 font-medium mb-4 max-w-xs">Debe configurar su firma .p12 en Ajustes. Por ahora deberá firmar a mano.</p>
                                <button type="button" onClick={handleSignClick} className="px-6 py-2 rounded-lg font-bold bg-slate-800 text-white hover:bg-slate-900 shadow-lg text-sm w-full md:w-auto">
                                    Confirmar Firma Manual
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* MODAL PASSWORD P12 */}
            <AnimatePresence>
                {showPasswordModal && (
                    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{scale:0.9, opacity:0}} animate={{scale:1, opacity:1}} exit={{scale:0.9, opacity:0}} className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
                            <div className="text-center mb-6">
                                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Lock className="w-6 h-6 text-slate-600"/>
                                </div>
                                <h3 className="font-bold text-lg text-slate-800">Autenticar Firma</h3>
                                <p className="text-xs text-slate-500 mt-1">Ingrese la contraseña de su archivo .p12 para firmar este documento.</p>
                            </div>
                            <form onSubmit={verifyAndSign} className="space-y-4">
                                <div className="relative">
                                    <input 
                                        autoFocus
                                        type={showCertPassword ? "text" : "password"} 
                                        className="w-full p-4 pr-12 bg-white border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-brand-500 text-center font-bold tracking-widest text-slate-900 shadow-inner"
                                        placeholder="Contraseña"
                                        value={certPassword}
                                        onChange={e => setCertPassword(e.target.value)}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => setShowCertPassword(!showCertPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-600 transition-colors"
                                        tabIndex={-1}
                                    >
                                        {showCertPassword ? <EyeOff className="w-5 h-5"/> : <Eye className="w-5 h-5"/>}
                                    </button>
                                </div>
                                
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={() => setShowPasswordModal(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
                                    <button type="submit" disabled={!certPassword || isSigning} className="flex-1 py-3 text-sm font-bold bg-brand-600 text-white hover:bg-brand-700 rounded-xl flex justify-center items-center gap-2">
                                        {isSigning ? <Loader2 className="animate-spin w-4 h-4"/> : "Firmar"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {missingItems.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-6">
                    <div className="flex items-center gap-2 text-orange-800 mb-4 font-bold"><AlertCircle className="w-6 h-6" /><h4>Confirmaciones Requeridas</h4></div>
                    <div className="space-y-2">
                        {missingItems.map(item => (
                            <div key={item.key} onClick={() => handleConfirmToggle(item.key)} className={`p-3 rounded-lg border cursor-pointer flex items-center gap-3 transition ${confirmedKeys.has(item.key) ? 'bg-orange-100 border-orange-300' : 'bg-white border-orange-200'}`}>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${confirmedKeys.has(item.key) ? 'bg-orange-600 border-orange-600' : 'border-orange-300'}`}>{confirmedKeys.has(item.key) && <CheckCircle className="w-3.5 h-3.5 text-white" />}</div>
                                <span className="text-sm font-medium leading-tight">Confirmo: {item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="pt-8 border-t flex flex-col items-center">
                <button 
                    type="button" 
                    onClick={onFinish}
                    disabled={!isReadyToFinish || isSaving}
                    className="w-full max-w-md py-4 bg-slate-900 text-white rounded-2xl font-bold text-xl shadow-2xl hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex justify-center items-center gap-3 transition-all transform active:scale-95"
                >
                    {isSaving ? <Loader2 className="animate-spin w-6 h-6"/> : <Save className="w-6 h-6"/>}
                    Finalizar Consulta
                </button>
                {!isReadyToFinish && <p className="mt-3 text-orange-600 font-bold text-xs animate-pulse">Confirmar omisiones para finalizar.</p>}
            </div>
        </motion.div>
    );
};
