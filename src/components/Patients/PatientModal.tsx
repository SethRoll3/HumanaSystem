import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Save, Loader2, UploadCloud, Camera, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Patient, PatientFile, UserProfile } from '../../types';
import { COUNTRIES, GT_DEPARTMENTS, GT_ZONES, MUNICIPALITIES_WITH_ZONES } from '../../data/geography.ts';
import { db, storage } from '../../firebase/config';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { logAuditAction } from '../../services/auditService';
import { checkPatientDuplicates, createPatient } from '../../services/patientService';

interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: Patient | null;
  currentUser: UserProfile;
  appointmentId?: string;
  onSaved?: (updated: Patient) => void;
}

const DEFAULT_PATIENT: Partial<Patient> = {
  careCenter: 'Humana',
  previousTreatment: 'No ha estado en tratamiento',
  address: { country: 'Guatemala' }
};

// --- HELPER FUNCTIONS ---

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

// --- SUB-COMPONENTS ---

interface PersonalDataProps {
  fullName?: string;
  dpi?: string;
  billingCode?: string;
  occupation?: string;
  phone?: string;
  email?: string;
  age?: number;
  birthDate?: string;
  gender?: Patient['gender'];
  onChange: (field: keyof Patient, value: any) => void;
  onMultiChange: (updates: Partial<Patient>) => void;
}

const PersonalDataSection = React.memo(({ 
  fullName, dpi, billingCode, occupation, phone, email, age, birthDate, gender, onChange, onMultiChange 
}: PersonalDataProps) => {
  return (
    <>
      <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">Datos Personales</div>
      <div className="md:col-span-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre del Paciente <span className="text-red-500">*</span></label>
        <input required className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-lg font-bold" value={fullName || ''} onChange={e => onChange('fullName', e.target.value)} placeholder="Nombre Completo" />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">DPI</label>
        <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold" value={dpi || ''} onChange={e => onChange('dpi', e.target.value)} placeholder="Opcional" />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Código Facturación</label>
        <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold" value={billingCode || ''} onChange={e => onChange('billingCode', e.target.value)} placeholder="Opcional" />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ocupación</label>
        <input className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={occupation || ''} onChange={e => onChange('occupation', e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono del Paciente <span className="text-red-500">*</span></label>
        <input required className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={phone || ''} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ''); onChange('phone', numeric); }} placeholder="Ej: 55555555" />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Email del Paciente</label>
        <input type="email" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={email || ''} onChange={e => onChange('email', e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Edad</label>
        <input type="number" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={age ?? ''} onChange={e => { 
          const numeric = e.target.value.replace(/[^0-9]/g, ''); 
          const bDate = numeric ? calculateBirthDateFromAge(numeric) : ''; 
          const ageValue = numeric ? parseInt(numeric, 10) : undefined; 
          onMultiChange({ age: ageValue, birthDate: bDate }); 
        }} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Fecha Nacimiento</label>
        <input type="date" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={birthDate || ''} onChange={e => { 
          const bDate = e.target.value; 
          const ageVal = calculateAgeFromBirthDate(bDate); 
          onMultiChange({ birthDate: bDate, age: ageVal }); 
        }} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Género</label>
        <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={gender || 'M'} onChange={e => onChange('gender', e.target.value)}>
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
        </select>
      </div>
    </>
  );
});

interface AddressProps {
  address?: Patient['address'];
  onAddressChange: (key: string, value: string) => void;
}

const AddressSection = React.memo(({ address, onAddressChange }: AddressProps) => {
  return (
    <>
      <div className="md:col-span-2 text-sm font-bold text-brand-600 uppercase tracking-widest border-b border-brand-100 pb-2 mb-2 mt-4">Dirección Domiciliar</div>
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">País</label>
          <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={address?.country} onChange={e => onAddressChange('country', e.target.value)}>
            {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {address?.country === 'Guatemala' && (
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Departamento</label>
            <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={address?.department} onChange={e => onAddressChange('department', e.target.value)}>
              <option value="">-- Seleccionar --</option>
              {Object.keys(GT_DEPARTMENTS).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        {address?.department && (
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Municipio</label>
            <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={address?.municipality} onChange={e => onAddressChange('municipality', e.target.value)}>
              <option value="">-- Seleccionar --</option>
              {GT_DEPARTMENTS[address.department].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        {address?.department === 'Guatemala' && hasZones(address?.municipality) && (
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Zona</label>
            <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={address?.zone} onChange={e => onAddressChange('zone', e.target.value)}>
              <option value="">-- Zona --</option>
              {GT_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        )}
      </div>
    </>
  );
});

interface ClinicalDataProps {
  careCenter?: string;
  previousTreatment?: string;
  previousTreatmentDetail?: string;
  referralChannel?: string;
  onChange: (field: keyof Patient, value: any) => void;
  onMultiChange: (updates: Partial<Patient>) => void;
}

const ClinicalDataSection = React.memo(({ 
  careCenter, previousTreatment, previousTreatmentDetail, referralChannel, onChange, onMultiChange 
}: ClinicalDataProps) => {
  return (
    <>
      <div className="md:col-span-2 text-sm font-bold text-brand-600 uppercase tracking-widest border-b border-brand-100 pb-2 mb-2 mt-4">Datos Clínicos</div>
      <div>
        <label className="text-[10px] font-bold text-brand-600 uppercase tracking-widest mb-2 block">Procedencia</label>
        <select className="w-full p-4 bg-white border border-brand-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={careCenter || 'Humana'} onChange={e => onChange('careCenter', e.target.value)}>
          <option value="Humana">Humana</option>
          <option value="Hospital">Hospital</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Médico Tratante Anterior</label>
        <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={previousTreatment || 'No ha estado en tratamiento'} 
          onChange={e => { 
            const val = e.target.value; 
            onMultiChange({ 
              previousTreatment: val as any, 
              previousTreatmentDetail: val === 'IGSS' ? previousTreatmentDetail : '' 
            }); 
          }}>
          <option value="No ha estado en tratamiento">No ha estado en tratamiento</option>
          <option value="IGSS">IGSS</option>
          <option value="Medico Privado">Médico Privado</option>
          <option value="Hospital Nacional">Hospital Nacional</option>
        </select>
      </div>
      {previousTreatment === 'IGSS' && (
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Detalle IGSS</label>
          <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={previousTreatmentDetail || ''} onChange={e => onChange('previousTreatmentDetail', e.target.value)}>
            <option value="">-- Seleccionar --</option>
            <option value="IGSS consulta privada">IGSS consulta privada</option>
            <option value="IGSS examenes de diagnostico">IGSS exámenes de diagnóstico</option>
            <option value="Servicio Contratado">Servicio Contratado</option>
          </select>
        </div>
      )}
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Canal de referencia (¿De dónde nos conoció?)</label>
        <select className="w-full p-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-brand-500 text-slate-900" value={referralChannel || ''} onChange={e => onChange('referralChannel', e.target.value)}>
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
    </>
  );
});

interface ResponsibleDataProps {
  isNoResponsible: boolean;
  responsibleName?: string;
  responsiblePhone?: string;
  responsibleEmail?: string;
  onToggleNoResponsible: (checked: boolean) => void;
  onChange: (field: keyof Patient, value: any) => void;
}

const ResponsibleDataSection = React.memo(({ 
  isNoResponsible, responsibleName, responsiblePhone, responsibleEmail, onToggleNoResponsible, onChange 
}: ResponsibleDataProps) => {
  return (
    <>
      <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Datos del Responsable</div>
      <div className="md:col-span-2 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
        <input type="checkbox" className="w-5 h-5" checked={isNoResponsible} onChange={e => onToggleNoResponsible(e.target.checked)} />
        <label className="text-xs font-bold text-slate-500 uppercase">EL PACIENTE VE POR SU PROPIA SALUD</label>
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre Responsable</label>
        <input disabled={isNoResponsible} className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100" value={isNoResponsible ? 'No hay' : responsibleName || ''} onChange={e => onChange('responsibleName', e.target.value)} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono Responsable</label>
        <input disabled={isNoResponsible} className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100" value={isNoResponsible ? 'No hay' : responsiblePhone || ''} onChange={e => { const numeric = e.target.value.replace(/[^0-9]/g, ''); onChange('responsiblePhone', numeric); }} />
      </div>
      <div>
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Email Responsable</label>
        <input type="email" disabled={isNoResponsible} className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100" value={isNoResponsible ? 'No hay' : responsibleEmail || ''} onChange={e => onChange('responsibleEmail', e.target.value)} />
      </div>
    </>
  );
});

interface FilesSectionProps {
  medical_history?: string;
  onMedicalHistoryChange: (val: string) => void;
  patientFiles: File[];
  onFilesChange: (files: File[]) => void;
  existingFiles: PatientFile[];
  onRemoveExistingFile: (index: number) => void;
  onRemoveNewFile: (index: number) => void;
}

const FilesSection = React.memo(({ 
  medical_history, onMedicalHistoryChange, patientFiles, onFilesChange, existingFiles, onRemoveExistingFile, onRemoveNewFile 
}: FilesSectionProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Historial Clínico y Archivos</div>
      <div className="md:col-span-2">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Antecedentes Médicos</label>
        <textarea className="w-full p-4 bg-white border rounded-2xl" rows={4} value={medical_history || ''} onChange={e => onMedicalHistoryChange(e.target.value)} />
      </div>

      <div className="md:col-span-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Archivos Adjuntos (Historial previo)</label>
          <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:bg-slate-50 transition cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <UploadCloud className="w-8 h-8 mb-2 text-brand-400"/>
            <span className="text-xs font-bold">Click para subir archivos</span>
            <input 
              type="file" 
              multiple 
              ref={fileInputRef} 
              className="hidden" 
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) {
                  onFilesChange([...patientFiles, ...files]);
                }
              }}
            />
          </div>
          {patientFiles.length > 0 && (
            <div className="mt-4 p-4 bg-brand-50 rounded-xl">
              <p className="text-xs font-bold text-brand-700 mb-2">{patientFiles.length} archivos seleccionados para subir:</p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {patientFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] text-brand-600">
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveNewFile(i)}
                      className="p-1 text-slate-400 hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {existingFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-slate-500 uppercase">Archivos existentes:</p>
              {existingFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand-600 hover:underline truncate flex-1">
                    {file.name}
                  </a>
                  <button 
                    type="button"
                    onClick={() => onRemoveExistingFile(idx)}
                    className="p-1 text-slate-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
      </div>
    </>
  );
});

// --- MAIN COMPONENT ---

export const PatientModal: React.FC<PatientModalProps> = ({
  isOpen,
  onClose,
  patient,
  currentUser,
  appointmentId,
  onSaved
}) => {
  const [formValues, setFormValues] = useState<Partial<Patient>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isNoResponsible, setIsNoResponsible] = useState(false);
  const [patientFiles, setPatientFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<PatientFile[]>([]);
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

  const isEditing = !!patient;

  useEffect(() => {
    if (isOpen) {
      if (patient) {
        setFormValues(patient);
        const isNoResp = patient.responsibleName === 'No hay';
        setIsNoResponsible(isNoResp);
        setExistingFiles(patient.historyFiles || []);
        setExistingPhotoUrl(patient.photoUrl || '');
      } else {
        setFormValues({ ...DEFAULT_PATIENT });
        setIsNoResponsible(false);
        setExistingFiles([]);
        setExistingPhotoUrl('');
      }
      setPatientFiles([]);
      setCapturedPhoto(null);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl('');
      setPhotoRemoved(false);
      setIsCameraOpen(false);
      setPhotoMimeType('image/jpeg');
    }
  }, [patient, isOpen]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

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
  }, [isCameraOpen, stopCamera]);

  useEffect(() => {
    return () => {
      stopCamera();
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl, stopCamera]);

  // Stable handlers for child components
  const handleChange = useCallback((field: keyof Patient, value: any) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleMultiChange = useCallback((updates: Partial<Patient>) => {
    setFormValues(prev => ({ ...prev, ...updates }));
  }, []);

  const handleAddressChange = useCallback((key: string, value: string) => {
    setFormValues(prev => ({
      ...prev,
      address: {
        ...(prev.address || { country: 'Guatemala' }),
        [key]: value
      }
    }));
  }, []);

  const handleMedicalHistoryChange = useCallback((val: string) => {
    setFormValues(prev => ({ ...prev, medical_history: val }));
  }, []);

  const handleRemoveExistingFile = useCallback((index: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleCapturePhoto = useCallback(() => {
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
  }, [photoPreviewUrl]);

  const handleUploadPhoto = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [photoPreviewUrl]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const finalPayload: any = { ...formValues };
      
      // Validaciones básicas
      if (!finalPayload.fullName?.trim()) throw new Error("El nombre es obligatorio");
      if (!finalPayload.phone?.trim()) throw new Error("El teléfono es obligatorio");

      if (isNoResponsible) {
        finalPayload.responsibleName = 'No hay';
        finalPayload.responsiblePhone = 'No hay';
        finalPayload.responsibleEmail = 'No hay';
      }

      // Validar duplicados
      const duplicateCheck = await checkPatientDuplicates({
        fullName: finalPayload.fullName,
        billingCode: finalPayload.billingCode,
        dpi: finalPayload.dpi,
        excludeId: patient?.id
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

      if (photoRemoved && !capturedPhoto) {
        finalPayload.photoUrl = null;
      }

      if (capturedPhoto && isEditing && patient?.id) {
        const patientIdForPhoto = patient.id;
        const photoRef = ref(storage, `patients/${patientIdForPhoto}/photo_${Date.now()}.jpg`);
        await uploadBytes(photoRef, capturedPhoto, { contentType: photoMimeType || 'image/jpeg' });
        const photoUrl = await getDownloadURL(photoRef);
        finalPayload.photoUrl = photoUrl;
      }

      if (!capturedPhoto && existingPhotoUrl) {
        finalPayload.photoUrl = existingPhotoUrl;
      }

      // Subir archivos nuevos
      const uploadedFiles: PatientFile[] = [...existingFiles];
      if (patientFiles.length > 0) {
        const patientIdForStorage = patient?.id || finalPayload.billingCode || finalPayload.dpi || `pending_${Date.now()}`;
        
        for (const file of patientFiles) {
          const relativeName = (file as any).webkitRelativePath || file.name;
          const storageRef = ref(storage, `patients/${patientIdForStorage}/files/${Date.now()}_${relativeName}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          uploadedFiles.push({ name: relativeName, url, type: file.type, uploadedAt: Date.now() });
        }
      }
      finalPayload.historyFiles = uploadedFiles;

      let savedPatient: Patient;

      if (isEditing && patient?.id) {
        // EDICIÓN
        await updateDoc(doc(db, 'patients', patient.id), {
          ...finalPayload,
          updatedAt: serverTimestamp()
        });
        
        savedPatient = { ...patient, ...finalPayload, updatedAt: Date.now() } as Patient;

        const userEmail = currentUser.email || 'system@humana.com';
        const detail = `Paciente ${patient.fullName} (${patient.id}) editado desde cita ${appointmentId || 'Lista'}`;
        await logAuditAction(userEmail, 'EDITAR_PACIENTE', detail);
        toast.success('Paciente actualizado');

      } else {
        // CREACIÓN
        if (!finalPayload.billingCode) delete finalPayload.billingCode;
        if (!finalPayload.dpi) delete finalPayload.dpi;
        
        const newId = await createPatient(finalPayload);
        if (capturedPhoto) {
          const photoRef = ref(storage, `patients/${newId}/photo_${Date.now()}.jpg`);
          await uploadBytes(photoRef, capturedPhoto, { contentType: photoMimeType || 'image/jpeg' });
          const photoUrl = await getDownloadURL(photoRef);
          await updateDoc(doc(db, 'patients', newId), { photoUrl });
          finalPayload.photoUrl = photoUrl;
        }
        savedPatient = { ...finalPayload, id: newId, createdAt: Date.now() } as Patient;
        
        const userEmail = currentUser.email || 'system@humana.com';
        await logAuditAction(userEmail, 'CREAR_PACIENTE', `Paciente ${savedPatient.fullName} creado.`);
        toast.success('Paciente creado exitosamente');
      }

      onSaved?.(savedPatient);
      onClose();
    } catch (error: any) {
      console.error('Error guardando paciente', error);
      toast.error(error.message || 'Error al guardar paciente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[220] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="p-6 md:p-8 border-b bg-white flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 text-xl md:text-2xl">
            {isEditing ? 'Editar Paciente' : 'Nuevo Paciente'}
          </h3>
          <button type="button" onClick={onClose} className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-all">
            <X className="w-6 h-6 md:w-7 md:h-7" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
            
            <PersonalDataSection 
              fullName={formValues.fullName}
              dpi={formValues.dpi}
              billingCode={formValues.billingCode}
              occupation={formValues.occupation}
              phone={formValues.phone}
              email={formValues.email}
              age={formValues.age}
              birthDate={formValues.birthDate}
              gender={formValues.gender}
              onChange={handleChange}
              onMultiChange={handleMultiChange}
            />

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

            <AddressSection 
              address={formValues.address}
              onAddressChange={handleAddressChange}
            />

            <ClinicalDataSection 
              careCenter={formValues.careCenter}
              previousTreatment={formValues.previousTreatment}
              previousTreatmentDetail={formValues.previousTreatmentDetail}
              referralChannel={formValues.referralChannel}
              onChange={handleChange}
              onMultiChange={handleMultiChange}
            />

            <ResponsibleDataSection 
              isNoResponsible={isNoResponsible}
              responsibleName={formValues.responsibleName}
              responsiblePhone={formValues.responsiblePhone}
              responsibleEmail={formValues.responsibleEmail}
              onToggleNoResponsible={setIsNoResponsible}
              onChange={handleChange}
            />

            <FilesSection 
              medical_history={formValues.medical_history}
              onMedicalHistoryChange={handleMedicalHistoryChange}
              patientFiles={patientFiles}
              onFilesChange={setPatientFiles}
              existingFiles={existingFiles}
              onRemoveExistingFile={handleRemoveExistingFile}
              onRemoveNewFile={(index) => setPatientFiles(prev => prev.filter((_, i) => i !== index))}
            />

          </div>

          <div className="p-6 md:p-8 border-t bg-slate-50 flex justify-end gap-4 shrink-0">
            <button type="button" onClick={onClose} className="px-6 py-4 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={isSaving}
              className="px-8 py-4 bg-brand-600 text-white text-sm font-bold rounded-xl hover:bg-brand-700 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {isEditing ? 'Guardar Cambios' : 'Crear Paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
