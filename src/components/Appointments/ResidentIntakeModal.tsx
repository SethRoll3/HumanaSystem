import React, { useState } from 'react';
import { X, History, Paperclip, Image, FileText, ExternalLink, UploadCloud, Loader2, Scale, Activity, Wind, HeartPulse, Droplets, Thermometer, User } from 'lucide-react';
import { Patient, UserProfile } from '../../types';
import { db, storage } from '../../firebase/config.ts';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { appointmentService } from '../../services/appointmentService';

interface ResidentIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  appointmentId?: string;
  currentUser: UserProfile;
  onSaveComplete?: () => Promise<void> | void;
}

export const ResidentIntakeModal: React.FC<ResidentIntakeModalProps> = ({
  isOpen,
  onClose,
  patient,
  appointmentId,
  currentUser,
  onSaveComplete
}) => {
  const [observations, setObservations] = useState('');
  const [weight, setWeight] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [oxygenSaturation, setOxygenSaturation] = useState('');
  const [temperature, setTemperature] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  if (!isOpen) return null;

  const parseVitals = (vitalsLine: string) => {
    const result: Record<string, string> = {};
    if (!vitalsLine) return result;
    const parts = vitalsLine.split(/[|,]/).map(p => p.trim()).filter(Boolean);
    parts.forEach(part => {
      const match = part.match(/^(Peso|P\/A|FR|FC|SAT|Temp)[:\s]+(.+)/i);
      if (match) {
        result[match[1].toLowerCase().replace('/', '_')] = match[2].trim();
      }
    });
    return result;
  };

  const vitalsConfig = [
    { key: 'peso', label: 'Peso', icon: Scale, color: 'text-amber-600', bg: 'bg-amber-50' },
    { key: 'p_a', label: 'P/A', icon: Activity, color: 'text-rose-600', bg: 'bg-rose-50' },
    { key: 'fr', label: 'FR', icon: Wind, color: 'text-sky-600', bg: 'bg-sky-50' },
    { key: 'fc', label: 'FC', icon: HeartPulse, color: 'text-red-600', bg: 'bg-red-50' },
    { key: 'sat', label: 'SAT', icon: Droplets, color: 'text-blue-600', bg: 'bg-blue-50' },
    { key: 'temp', label: 'Temp', icon: Thermometer, color: 'text-orange-600', bg: 'bg-orange-50' },
  ];

  const parsedEntries = (() => {
    const text = (patient.medical_history || '').trim();
    if (!text) return [];
    return text.split(/\n{2,}/).map((block, idx) => {
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      const headerLine = lines.find(l => l.startsWith('[Enfermería:')) || '';
      const vitalsLine = lines.find(l => /Peso:|P\/A:|FR:|FC:|SAT:|Temp:/i.test(l)) || '';
      const obsLine = lines.find(l => l.toLowerCase().startsWith('observaciones:')) || '';
      const otherLines = lines.filter(l => l !== headerLine && l !== vitalsLine && l !== obsLine);
      const parsedVitals = parseVitals(vitalsLine);
      let nurseName = '', nurseDate = '';
      if (headerLine) {
        const m = headerLine.match(/\[Enfermería:\s*(.+?)\s*-\s*(.+?)\]/);
        if (m) { nurseName = m[1].trim(); nurseDate = m[2].trim(); }
      }
      return { id: `${idx}-${lines.length}`, headerLine, vitalsLine, obsLine, otherLines, parsedVitals, nurseName, nurseDate, raw: block.trim() };
    });
  })();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleSave = async () => {
    if (!patient.id) return;
    const hasVitals = [
      weight,
      bloodPressure,
      respiratoryRate,
      heartRate,
      oxygenSaturation,
      temperature
    ].some(value => value.trim());

    if (!observations.trim() && selectedFiles.length === 0 && !hasVitals) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const patientRef = doc(db, 'patients', patient.id);
      const updates: any = {};

      const vitalsParts = [];
      if (weight.trim()) vitalsParts.push(`Peso: ${weight.trim()}`);
      if (bloodPressure.trim()) vitalsParts.push(`P/A: ${bloodPressure.trim()}`);
      if (respiratoryRate.trim()) vitalsParts.push(`FR: ${respiratoryRate.trim()}`);
      if (heartRate.trim()) vitalsParts.push(`FC: ${heartRate.trim()}`);
      if (oxygenSaturation.trim()) vitalsParts.push(`SAT: ${oxygenSaturation.trim()}`);
      if (temperature.trim()) vitalsParts.push(`Temp: ${temperature.trim()}`);

      if (observations.trim() || vitalsParts.length > 0) {
        const prefix = patient.medical_history ? patient.medical_history + '\n\n' : '';
        const header = `[Enfermería: ${currentUser.name} - ${new Date().toLocaleString('es-GT')}]`;
        const vitalsLine = vitalsParts.length > 0 ? `\n${vitalsParts.join(' | ')}` : '';
        const obsLine = observations.trim() ? `\nObservaciones: ${observations.trim()}` : '';
        updates.medical_history = `${prefix}${header}${vitalsLine}${obsLine}`;
      }

      if (selectedFiles.length > 0) {
        setUploading(true);
        for (const file of selectedFiles) {
          const storageRef = ref(storage, `patients/${patient.id}/files/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          await updateDoc(patientRef, {
            historyFiles: arrayUnion({
              name: file.name,
              url,
              type: file.type || 'application/octet-stream',
              uploadedAt: Date.now(),
              uploadedBy: currentUser.name || 'Enfermería'
            })
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(patientRef, updates);
      }

      // Actualizar estado de la cita a resident_intake
      if (appointmentId) {
        await appointmentService.completeResidentIntake(appointmentId);
      }

      if (onSaveComplete) {
        await onSaveComplete();
      }

      setObservations('');
      setWeight('');
      setBloodPressure('');
      setRespiratoryRate('');
      setHeartRate('');
      setOxygenSaturation('');
      setTemperature('');
      setSelectedFiles([]);
      onClose();
    } catch (e) {
      console.error('Error saving resident intake', e);
    } finally {
      setIsSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-brand-900 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <History className="w-6 h-6 text-brand-200" />
          Historial Clínico (Enfermería)
        </h2>
        <p className="text-base text-brand-100 mt-1">
          Paciente: {patient.fullName} ({patient.billingCode})
        </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/60">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Antecedentes Registrados</h3>
              {parsedEntries.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed min-h-[120px]">
                  No hay antecedentes registrados.
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {parsedEntries.map(entry => (
                    <div key={entry.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                      {entry.headerLine && (
                        <div className="bg-brand-900 px-3 py-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3 text-brand-200" />
                            <span className="text-[11px] font-bold text-white">{entry.nurseName || 'Enfermería'}</span>
                          </div>
                          <span className="text-[9px] text-brand-200 font-medium">{entry.nurseDate}</span>
                        </div>
                      )}
                      <div className="p-3 space-y-2">
                        {Object.keys(entry.parsedVitals).length > 0 && (
                          <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
                            {vitalsConfig.map(vc => {
                              const val = entry.parsedVitals[vc.key];
                              if (!val) return null;
                              const Icon = vc.icon;
                              return (
                                <div key={vc.key} className={`${vc.bg} rounded-lg p-1.5 flex flex-col items-center gap-0.5 border border-slate-100`}>
                                  <Icon className={`w-3 h-3 ${vc.color}`} />
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">{vc.label}</span>
                                  <span className="text-[11px] font-bold text-slate-800">{val}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {entry.obsLine && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">
                            <p className="text-[9px] font-bold text-amber-700 uppercase mb-0.5">Observaciones</p>
                            <p className="text-[11px] text-amber-900">{entry.obsLine.replace(/^observaciones:\s*/i, '')}</p>
                          </div>
                        )}
                        {entry.otherLines.length > 0 && (
                          <p className="text-[11px] text-slate-600">{entry.otherLines.join(' · ')}</p>
                        )}
                        {!entry.headerLine && !entry.vitalsLine && !entry.obsLine && entry.otherLines.length === 0 && entry.raw && (
                          <p className="text-[11px] text-slate-600">{entry.raw}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Paperclip className="w-4 h-4" /> Archivos Adjuntos Existentes
              </h3>
              {patient.historyFiles && patient.historyFiles.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {patient.historyFiles.map((file, idx) => (
                    <a
                      key={idx}
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group border rounded-xl p-3 flex flex-col items-center justify-center bg-white transition hover:shadow-md cursor-pointer relative ${
                        /ficha|presoft|presoftware|historia/i.test((file.name || ''))
                        ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 shadow-md'
                        : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-9 h-9 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition">
                        {file.type.includes('image') ? <Image className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      </div>
                      <p className="text-[11px] font-bold text-slate-700 text-center line-clamp-2 w-full break-words">
                        {file.name}
                      </p>
                      <span className="text-[9px] text-slate-400 mt-1">
                        {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : ''}
                      </span>
                      <ExternalLink className="absolute top-2 right-2 w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center text-slate-400 bg-slate-50/60">
                  <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-2">
                    <FileText className="w-5 h-5 text-slate-300" />
                  </div>
                  <p className="text-xs font-medium">No hay archivos adjuntos</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Observaciones y signos vitales</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Scale className="w-4 h-4 text-amber-600" />
                <input
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  placeholder="Peso (ej. 110 lb)"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Activity className="w-4 h-4 text-amber-600" />
                <input
                  value={bloodPressure}
                  onChange={(e) => setBloodPressure(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  placeholder="P/A (ej. 120/60)"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Wind className="w-4 h-4 text-amber-600" />
                <input
                  value={respiratoryRate}
                  onChange={(e) => setRespiratoryRate(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  placeholder="FR (ej. 18)"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <HeartPulse className="w-4 h-4 text-amber-600" />
                <input
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  placeholder="FC (ej. 72)"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Droplets className="w-4 h-4 text-amber-600" />
                <input
                  value={oxygenSaturation}
                  onChange={(e) => setOxygenSaturation(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  placeholder="SAT (ej. 98)"
                />
              </div>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <Thermometer className="w-4 h-4 text-amber-600" />
                <input
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  placeholder="Temp (ej. 36.5)"
                />
              </div>
            </div>
            <textarea
              rows={6}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 block p-3 placeholder-slate-400 shadow-sm transition-all resize-none"
              placeholder="Observaciones de enfermería..."
            />

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                <UploadCloud className="w-4 h-4" />
                Agregar nuevos archivos (imágenes, PDFs, videos)
              </label>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,image/*,video/*"
                onChange={handleFileChange}
                className="block w-full text-xs text-slate-500
                           file:mr-3 file:py-2 file:px-4
                           file:rounded-full file:border-0
                           file:text-xs file:font-semibold
                           file:bg-amber-50 file:text-amber-700
                           hover:file:bg-amber-100"
              />
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedFiles.map((f, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200"
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between items-center">
          <p className="text-[11px] text-slate-500">
            Enfermería solo agrega observaciones y signos vitales de esta visita.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || uploading}
              className="px-6 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-lg shadow-amber-500/30 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(isSaving || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
