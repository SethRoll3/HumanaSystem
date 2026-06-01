import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { X, Save, Loader2, UploadCloud, Camera, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Patient, PatientFile, UserProfile } from '../../types';
import { COUNTRIES, GT_DEPARTMENTS, GT_ZONES, MUNICIPALITIES_WITH_ZONES } from '../../data/geography.ts';
import { db, storage } from '../../firebase/config';
import { doc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { logAuditAction } from '../../services/auditService';
import { checkPatientDuplicates } from '../../services/patientService';

interface PatientEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  currentUser: UserProfile;
  appointmentId?: string;
  onSaved?: (updated: Patient) => void;
}

export const PatientEditModal: React.FC<PatientEditModalProps> = ({
  isOpen,
  onClose,
  patient,
  currentUser,
  appointmentId,
  onSaved
}) => {
  const [formValues, setFormValues] = useState<Patient>(patient);
  const [isSaving, setIsSaving] = useState(false);
  const [isNoResponsible, setIsNoResponsible] = useState(false);
  const [patientFiles, setPatientFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<PatientFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [existingPhotoUrl, setExistingPhotoUrl] = useState('');
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoMimeType, setPhotoMimeType] = useState('image/jpeg');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setFormValues(patient);
    const isNoResp = patient.responsibleName === 'No hay';
    setIsNoResponsible(isNoResp);
    setExistingFiles(patient.historyFiles || []);
    setPatientFiles([]);
    setExistingPhotoUrl(patient.photoUrl || '');
    setCapturedPhoto(null);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl('');
    setPhotoRemoved(false);
    setIsCameraOpen(false);
    setPhotoMimeType('image/jpeg');
  }, [patient, isOpen]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
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

  useEffect(() => {
    return () => {
      stopCamera();
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  if (!isOpen) return null;

  const hasZones = (muni: string | undefined) => (muni ? MUNICIPALITIES_WITH_ZONES.includes(muni) : false);

  const calculateAgeFromBirthDate = (dateStr: string) => {
    if (!dateStr) return undefined;
    const today = new Date();
    const dob = new Date(dateStr);
    if (Number.isNaN(dob.getTime())) return undefined;
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age >= 0 ? age : undefined;
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

  const handleUpdateAddress = (key: string, value: string) => {
    setFormValues(prev => ({
      ...prev,
      address: {
        ...(prev.address || { country: 'Guatemala' }),
        [key]: value
      }
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const finalPayload: any = { ...formValues };
      delete finalPayload.consultationType;
      delete finalPayload.modality;
      if (photoRemoved && !capturedPhoto) {
        finalPayload.photoUrl = null;
      }
      if (capturedPhoto && patient.id) {
        const photoRef = ref(storage, `patients/${patient.id}/photo_${Date.now()}.jpg`);
        await uploadBytes(photoRef, capturedPhoto, { contentType: photoMimeType || 'image/jpeg' });
        const photoUrl = await getDownloadURL(photoRef);
        finalPayload.photoUrl = photoUrl;
      }
      if (!capturedPhoto && existingPhotoUrl) {
        finalPayload.photoUrl = existingPhotoUrl;
      }
      if (isNoResponsible) {
        finalPayload.responsibleName = 'No hay';
        finalPayload.responsiblePhone = 'No hay';
        finalPayload.responsibleEmail = 'No hay';
      }

      const duplicateCheck = await checkPatientDuplicates({
        fullName: finalPayload.fullName !== patient.fullName ? finalPayload.fullName : undefined,
        billingCode: finalPayload.billingCode !== patient.billingCode ? finalPayload.billingCode : undefined,
        dpi: finalPayload.dpi !== patient.dpi ? finalPayload.dpi : undefined,
        excludeId: patient.id
      });
      if (duplicateCheck.billingCodeMatch) {
        throw new Error(`El código de facturación ya está registrado para ${duplicateCheck.billingCodeMatch.fullName}.`);
      }
      if (duplicateCheck.dpiMatch) {
        throw new Error(`El DPI ya está registrado para ${duplicateCheck.dpiMatch.fullName}.`);
      }
      if (duplicateCheck.nameMatch) {
        throw new Error(`Ya existe un paciente con nombre igual: ${duplicateCheck.nameMatch.fullName}.`);
      }

      const uploadedFiles: PatientFile[] = [...existingFiles];
      if (patientFiles.length > 0) {
        const patientIdForStorage = patient.id || finalPayload.billingCode || finalPayload.dpi || 'patient';
        for (const file of patientFiles) {
          const relativeName = (file as any).webkitRelativePath || file.name;
          const storageRef = ref(storage, `patients/${patientIdForStorage}/files/${Date.now()}_${relativeName}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          uploadedFiles.push({ name: relativeName, url, type: file.type, uploadedAt: Date.now() });
        }
      }
      finalPayload.historyFiles = uploadedFiles;
      if (!finalPayload.billingCode) delete finalPayload.billingCode;
      if (!finalPayload.dpi) delete finalPayload.dpi;

      if (!patient.id) {
        toast.error('Paciente no válido');
        setIsSaving(false);
        return;
      }

      await updateDoc(doc(db, 'patients', patient.id), {
        ...finalPayload,
        updatedAt: Date.now()
      });

      const userEmail = currentUser.email || 'system@humana.com';
      const detail = `Paciente ${patient.fullName} (${patient.id}) editado desde cita ${appointmentId || 'N/A'}`;
      await logAuditAction(userEmail, 'EDITAR_PACIENTE_CITA', detail);

      onSaved?.(finalPayload as Patient);
      toast.success('Paciente actualizado');
      onClose();
    } catch (error) {
      console.error('Error actualizando paciente', error);
      toast.error('No se pudieron guardar los cambios del paciente.');
    } finally {
      setIsSaving(false);
    }
  };

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
      setExistingPhotoUrl('');
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
    setExistingPhotoUrl('');
    setPhotoRemoved(false);
    setIsCameraOpen(false);
    setPhotoMimeType(file.type || 'image/jpeg');
    event.target.value = '';
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[220] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="p-6 md:p-8 border-b bg-white flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 text-xl md:text-2xl">Editar Paciente</h3>
          <button type="button" onClick={onClose} className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-all">
            <X className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
            <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">Datos Personales</div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre del Paciente</label>
              <input required className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-lg font-bold" value={formValues.fullName || ''} onChange={e => setFormValues({ ...formValues, fullName: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Foto del Paciente</div>
              <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="w-28 h-28 rounded-full overflow-hidden bg-white border border-slate-200 flex items-center justify-center">
                    {(photoPreviewUrl || existingPhotoUrl) ? (
                      <img src={photoPreviewUrl || existingPhotoUrl} alt="Foto del paciente" className="w-full h-full object-cover" />
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
                      {photoPreviewUrl || existingPhotoUrl ? 'Tomar nueva' : 'Abrir cámara'}
                    </button>
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-xl flex items-center gap-2"
                    >
                      <UploadCloud className="w-4 h-4" />
                      Subir foto
                    </button>
                    {(photoPreviewUrl || existingPhotoUrl) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
                          setCapturedPhoto(null);
                          setPhotoPreviewUrl('');
                          setExistingPhotoUrl('');
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">DPI</label>
              <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold" value={formValues.dpi || ''} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ''); setFormValues({ ...formValues, dpi: numeric }); }} inputMode="numeric" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Código Facturación</label>
              <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold" value={formValues.billingCode || ''} onChange={e => setFormValues({ ...formValues, billingCode: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ocupación</label>
              <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.occupation || ''} onChange={e => setFormValues({ ...formValues, occupation: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono del Paciente</label>
              <input required className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.phone || ''} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ''); setFormValues({ ...formValues, phone: numeric }); }} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Email del Paciente</label>
              <input type="email" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.email || ''} onChange={e => setFormValues({ ...formValues, email: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Edad</label>
              <input type="number" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.age ?? ''} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ''); const birthDate = numeric ? calculateBirthDateFromAge(numeric) : ''; const ageValue = numeric ? parseInt(numeric, 10) : undefined; const dpi = ageValue !== undefined && ageValue < 18 ? '000' : formValues.dpi; setFormValues({ ...formValues, age: ageValue, birthDate, dpi }); }} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Fecha Nacimiento</label>
              <input type="date" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.birthDate || ''} onChange={e => { const birthDate = e.target.value; const age = calculateAgeFromBirthDate(birthDate); const dpi = age !== undefined && age < 18 ? '000' : formValues.dpi; setFormValues({ ...formValues, birthDate, age, dpi }); }} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Género</label>
              <select required className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.gender || ''} onChange={e => setFormValues({ ...formValues, gender: e.target.value as Patient['gender'] })}>
                <option value="" disabled>-- Seleccionar Género --</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>

            <div className="md:col-span-2 text-sm font-bold text-brand-600 uppercase tracking-widest border-b border-brand-100 pb-2 mb-2 mt-4">Dirección Domiciliar</div>
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">País</label>
                <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.country} onChange={e => handleUpdateAddress('country', e.target.value)}>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {formValues.address?.country === 'Guatemala' && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Departamento</label>
                  <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.department} onChange={e => handleUpdateAddress('department', e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {Object.keys(GT_DEPARTMENTS).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              {formValues.address?.department && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Municipio</label>
                  <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.municipality} onChange={e => handleUpdateAddress('municipality', e.target.value)}>
                    <option value="">-- Seleccionar --</option>
                    {GT_DEPARTMENTS[formValues.address.department].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              {formValues.address?.department === 'Guatemala' && hasZones(formValues.address?.municipality) && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Zona</label>
                  <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.zone} onChange={e => handleUpdateAddress('zone', e.target.value)}>
                    <option value="">-- Zona --</option>
                    {GT_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="md:col-span-2 text-sm font-bold text-brand-600 uppercase tracking-widest border-b border-brand-100 pb-2 mb-2 mt-4">Datos Clínicos</div>
            <div>
              <label className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-2 block">Procedencia</label>
              <select className="w-full p-4 bg-white border border-brand-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={formValues.careCenter || 'Humana'} onChange={e => setFormValues({ ...formValues, careCenter: e.target.value as any })}>
                <option value="Humana">Humana</option>
                <option value="Hospital">Hospital</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Médico Tratante Anterior</label>
              <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={formValues.previousTreatment || 'No ha estado en tratamiento'} onChange={e => { const value = e.target.value; setFormValues({ ...formValues, previousTreatment: value as any, previousTreatmentDetail: value === 'IGSS' ? formValues.previousTreatmentDetail : '' }); }}>
                <option value="No ha estado en tratamiento">No ha estado en tratamiento</option>
                <option value="IGSS">IGSS</option>
                <option value="Medico Privado">Médico Privado</option>
                <option value="Hospital Nacional">Hospital Nacional</option>
              </select>
            </div>
            {formValues.previousTreatment === 'IGSS' && (
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Detalle IGSS</label>
                <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={formValues.previousTreatmentDetail || ''} onChange={e => setFormValues({ ...formValues, previousTreatmentDetail: e.target.value })}>
                  <option value="">-- Seleccionar --</option>
                  <option value="IGSS consulta privada">IGSS consulta privada</option>
                  <option value="IGSS examenes de diagnostico">IGSS exámenes de diagnóstico</option>
                  <option value="Servicio Contratado">Servicio Contratado</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Canal de referencia (¿De dónde nos conoció?)</label>
              <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={formValues.referralChannel || ''} onChange={e => setFormValues({ ...formValues, referralChannel: e.target.value })}>
                <option value="">-- Seleccionar --</option>
                <option value="REFERENCIA DE FAMILIARES O AMIGOS">REFERENCIA DE FAMILIARES O AMIGOS</option>
                <option value="FACEBOOK">FACEBOOK</option>
                <option value="INSTAGRAM">INSTAGRAM</option>
                <option value="GOOGLE">GOOGLE</option>
                <option value="PAGINA WEB">PAGINA WEB</option>
                <option value="RADIO">RADIO</option>
                <option value="TELEVISIÓN">TELEVISIÓN</option>
                <option value="MEDIOS IMPRESOS">MEDIOS IMPRESOS</option>
                <option value="REFERENCIA DE HOSPITAL NACIONAL">REFERENCIA DE HOSPITAL NACIONAL</option>
              </select>
            </div>

            <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Datos del Responsable</div>
            <div className="md:col-span-2 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <input type="checkbox" className="w-5 h-5" checked={isNoResponsible} onChange={e => setIsNoResponsible(e.target.checked)} />
              <label className="text-xs font-bold text-slate-500 uppercase">EL PACIENTE VE POR SU PROPIA SALUD</label>
            </div>
            {!isNoResponsible && (
              <>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre Responsable</label>
                  <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.responsibleName || ""} onChange={e => setFormValues({ ...formValues, responsibleName: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono Responsable</label>
                  <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.responsiblePhone || ""} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ""); setFormValues({ ...formValues, responsiblePhone: numeric }); }} />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Email Responsable</label>
                  <input type="email" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.responsibleEmail || ""} onChange={e => setFormValues({ ...formValues, responsibleEmail: e.target.value })} />
                </div>
              </>
            )}

            {isNoResponsible && (
              <>
                <div className="md:col-span-2 p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-700 font-semibold">
                  ⚠️ El paciente es autónomo. Complete el contacto de emergencia.
                </div>
                <div>
                  <label className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 block">Nombre Contacto de Emergencia</label>
                  <input className="w-full p-4 bg-white border border-amber-300 rounded-2xl outline-none focus:ring-2 focus:ring-amber-400" value={formValues.emergencyContactName || ""} onChange={e => setFormValues({ ...formValues, emergencyContactName: e.target.value })} placeholder="Ej: María García" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2 block">Teléfono Contacto de Emergencia</label>
                  <input className="w-full p-4 bg-white border border-amber-300 rounded-2xl outline-none focus:ring-2 focus:ring-amber-400" value={formValues.emergencyContactPhone || ""} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ""); setFormValues({ ...formValues, emergencyContactPhone: numeric }); }} placeholder="1234 5678" inputMode="numeric" />
                </div>
              </>
            )}

            <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Historial Clínico y Archivos</div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Signos Vitales</label>
              <textarea className="w-full p-4 bg-white border rounded-2xl" rows={4} value={formValues.medical_history || ''} onChange={e => setFormValues({ ...formValues, medical_history: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Archivos Adjuntos</label>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex flex-wrap gap-2">
                {existingFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1 text-xs">
                    {f.name}{f.type ? ` (${f.type})` : ''}
                    <button type="button" onClick={() => setExistingFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
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

          <div className="p-6 md:p-8 border-t bg-white flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-lg transition flex items-center gap-2 disabled:opacity-50">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar Cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
