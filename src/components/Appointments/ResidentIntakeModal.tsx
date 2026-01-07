import React, { useState } from 'react';
import { X, History, Paperclip, Image, FileText, ExternalLink, UploadCloud, Loader2 } from 'lucide-react';
import { Patient, UserProfile } from '../../types';
import { db, storage } from '../../firebase/config.ts';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ResidentIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  currentUser: UserProfile;
  onSaveComplete?: () => Promise<void> | void;
}

export const ResidentIntakeModal: React.FC<ResidentIntakeModalProps> = ({
  isOpen,
  onClose,
  patient,
  currentUser,
  onSaveComplete
}) => {
  const [newHistory, setNewHistory] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setSelectedFiles(Array.from(e.target.files));
  };

  const handleSave = async () => {
    if (!patient.id) return;
    if (!newHistory.trim() && selectedFiles.length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const patientRef = doc(db, 'patients', patient.id);
      const updates: any = {};

      if (newHistory.trim()) {
        const prefix = patient.medical_history ? patient.medical_history + '\n\n' : '';
        const header = `[Residente: ${currentUser.name} - ${new Date().toLocaleString('es-GT')}]`;
        updates.medical_history = `${prefix}${header}\n${newHistory.trim()}`;
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
              uploadedBy: currentUser.name || 'Residente'
            })
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(patientRef, updates);
      }

      if (onSaveComplete) {
        await onSaveComplete();
      }

      setNewHistory('');
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
        <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              Historial Clínico (Residente)
            </h2>
            <p className="text-xs text-slate-400">
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
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Antecedentes Registrados</h3>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm leading-relaxed whitespace-pre-wrap min-h-[120px]">
                {patient.medical_history || 'No hay antecedentes registrados.'}
              </div>
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
                      className="group border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition hover:shadow-md cursor-pointer relative"
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
            <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Nuevos antecedentes (Residente)</h3>
            <textarea
              rows={6}
              value={newHistory}
              onChange={(e) => setNewHistory(e.target.value)}
              className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 block p-3 placeholder-slate-400 shadow-sm transition-all resize-none"
              placeholder="Escriba aquí los antecedentes que el residente documenta en esta visita..."
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
            El residente solo puede agregar información nueva. Los antecedentes previos permanecen sin cambios.
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
              Guardar Aportes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
