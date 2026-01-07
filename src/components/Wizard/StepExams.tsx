
import * as React from 'react';
import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Share2, FileText, CheckSquare, Square, Stethoscope, X, FlaskConical, StickyNote, Trash2, ArrowDownCircle, Microscope, Clock, PenTool, Search } from 'lucide-react';
import { getPathologies, getLaboratories } from '../../services/inventoryService.ts';
import { Pathology, ReferralGroup, LaboratoryItem, Patient } from '../../../types.ts';
import { motion, AnimatePresence } from 'framer-motion';

interface StepExamsProps {
    userSpecialty?: string;
    patient?: Patient | null;
}

const OPTIONAL_EXAMS_TYPES = ['EG', 'SuperEG', 'Resonancia', 'Laboratorios', 'Otros'];
const EG_DURATIONS = ['1/2 hora', '1 hora', '3 horas', '5 horas', '8 horas'];

// Helper para normalizar texto (quitar tildes y minúsculas)
const normalizeText = (text: string) => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export const StepExams: React.FC<StepExamsProps> = ({ userSpecialty, patient }) => {
  const { register, watch, setValue, getValues } = useFormContext();
  
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [selectedPathology, setSelectedPathology] = useState<Pathology | null>(null);
  const [loadingPaths, setLoadingPaths] = useState(false);

  // REAL DATA FROM DB
  const [availableLabs, setAvailableLabs] = useState<LaboratoryItem[]>([]);
  const [loadingLabs, setLoadingLabs] = useState(false);

  // State for Optional Exams Categories
  const [selectedOptionals, setSelectedOptionals] = useState<{ type: string; duration?: string }[]>([]);
  
  // State for "Otros" text area
  const [otherExamsText, setOtherExamsText] = useState('');

  // State for "Laboratorios" specific selection
  const [selectedSpecificLabs, setSelectedSpecificLabs] = useState<Set<string>>(new Set());
  const [labSearchTerm, setLabSearchTerm] = useState('');

  // Watchers
  const referralGroups: ReferralGroup[] = watch('referralGroups') || [];
  
  // Load Pathologies & Labs
  useEffect(() => {
    const load = async () => {
        setLoadingPaths(true);
        const [paths, labs] = await Promise.all([
            getPathologies(),
            getLaboratories()
        ]);
        setPathologies(paths);
        setAvailableLabs(labs);
        setLoadingPaths(false);
    };
    load();
  }, []);

  // RESTORE STATE FROM FORM DATA ON MOUNT
  useEffect(() => {
      const savedOtherExams = getValues('otherExams'); // "EG, Laboratorios, Otros"
      const savedCustomText = getValues('customOtherExams'); 
      const currentExams = getValues('exams') || [];

      // Restore Categories
      if (savedOtherExams && selectedOptionals.length === 0) {
          const items = savedOtherExams.split(', ');
          const restored: { type: string; duration?: string }[] = [];
          
          items.forEach((item: string) => {
              if (item.includes('(') && item.includes(')')) {
                   const match = item.match(/(.*?) \((.*?)\)/);
                   if (match) restored.push({ type: match[1], duration: match[2] });
                   else restored.push({ type: item });
              } else {
                   if (OPTIONAL_EXAMS_TYPES.includes(item)) restored.push({ type: item });
              }
          });
          if (restored.length > 0) setSelectedOptionals(restored);
      }

      // Restore "Otros" text
      if (savedCustomText) setOtherExamsText(savedCustomText);

      // Restore Specific Labs
      const restoredLabs = new Set<string>();
      if (currentExams.length > 0) {
          currentExams.forEach((exam: string) => {
              // We restore it if it's in our loaded list from DB OR known list
              restoredLabs.add(exam);
          });
          if (restoredLabs.size > 0) setSelectedSpecificLabs(restoredLabs);
      }

  }, []); 

  // SYNC FORM STATE (The Master Effect)
  useEffect(() => {
      const optionalExamsList = new Set<string>();
      
      // 1. Add "Laboratorios" specific content
      if (selectedOptionals.find(o => o.type === 'Laboratorios')) {
          selectedSpecificLabs.forEach(lab => optionalExamsList.add(lab));
      }

      // 2. Add "Otros" text content
      if (selectedOptionals.find(o => o.type === 'Otros') && otherExamsText.trim()) {
          const manualExams = otherExamsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
          manualExams.forEach(me => optionalExamsList.add(me));
      }

      // 3. Add Categories (EG, Resonancia, etc) if they are standalone
      selectedOptionals.forEach(opt => {
          if (opt.type !== 'Otros' && opt.type !== 'Laboratorios') {
             if (opt.type === 'EG' || opt.type === 'SuperEG') {
                 optionalExamsList.add(`${opt.type} (${opt.duration || '1 hora'})`);
             } else {
                 optionalExamsList.add(opt.type); // e.g. "Resonancia"
             }
          }
      });

      // 4. Formatted string for UI chips/summary
      const formattedOptionals = selectedOptionals.map(opt => {
          if (opt.type === 'EG' || opt.type === 'SuperEG') {
              return `${opt.type} (${opt.duration || 'Sin duración'})`;
          }
          return opt.type;
      });

      // UPDATE FORM
      setValue('exams', Array.from(optionalExamsList)); // Now cleaner
      setValue('otherExams', formattedOptionals.join(', '));
      setValue('customOtherExams', otherExamsText);

  }, [referralGroups, selectedOptionals, otherExamsText, selectedSpecificLabs, setValue]);

  // --- PATHOLOGY & GROUPS LOGIC ---
  useEffect(() => {
      if (selectedPathology) {
          const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
          const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
          const existingGroupIndex = currentGroups.findIndex(g => g.id === groupId);

          if (existingGroupIndex === -1) {
              // Si es reconsulta, NO seleccionamos exámenes automáticamente
              const isReconsulta = patient?.consultationType === 'Reconsulta' || (patient?.consultationType as string) === 'Reeconsulta';

              const newGroup: ReferralGroup = {
                  id: groupId,
                  pathology: selectedPathology.name,
                  exams: isReconsulta ? [] : [...selectedPathology.exams], 
                  note: ''
              };
              currentGroups.push(newGroup);
              setValue('referralGroups', currentGroups);
          }
      }
   }, [selectedPathology, getValues, setValue, patient]);

  const handlePathologyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const patName = e.target.value;
      const pat = pathologies.find(p => p.name === patName);
      setSelectedPathology(pat || null);
  };

  const toggleExamInGroup = (examName: string) => {
      if (!selectedPathology) return;
      const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
      const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
      let groupIndex = currentGroups.findIndex(g => g.id === groupId);
      
      if (groupIndex === -1) {
           const newGroup: ReferralGroup = { id: groupId, pathology: selectedPathology.name, exams: [examName], note: '' };
          currentGroups.push(newGroup);
      } else {
          const group = currentGroups[groupIndex];
          if (group.exams.includes(examName)) {
              group.exams = group.exams.filter(e => e !== examName);
              if (group.exams.length === 0 && !group.note) currentGroups.splice(groupIndex, 1);
          } else {
              group.exams.push(examName);
          }
      }
      setValue('referralGroups', currentGroups);
  };

  const updateGroupNote = (groupId: string, note: string) => {
      const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
      const group = currentGroups.find(g => g.id === groupId);
      if (group) { group.note = note; setValue('referralGroups', currentGroups); }
  };

  const removeGroup = (groupId: string) => {
      const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
      setValue('referralGroups', currentGroups.filter(g => g.id !== groupId));
  };

  const removeExamFromGroup = (groupId: string, examName: string) => {
      const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
      const group = currentGroups.find(g => g.id === groupId);
      if (group) {
          group.exams = group.exams.filter(e => e !== examName);
           if (group.exams.length === 0 && !group.note) {
               setValue('referralGroups', currentGroups.filter(g => g.id !== groupId));
               return;
          }
          setValue('referralGroups', currentGroups);
      }
  };

  const isExamCheckedInGroup = (examName: string) => {
      if (!selectedPathology) return false;
      const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
      const group = referralGroups.find(g => g.id === groupId);
      return group ? group.exams.includes(examName) : false;
  };

  // --- OPTIONAL CATEGORIES LOGIC ---
  const toggleOptionalCategory = (type: string) => {
      const exists = selectedOptionals.find(o => o.type === type);
      if (exists) {
          setSelectedOptionals(prev => prev.filter(o => o.type !== type));
          if (type === 'Otros') setOtherExamsText('');
          if (type === 'Laboratorios') {
              setLabSearchTerm(''); // Clear search
          }
      } else {
          const defaultDuration = (type === 'EG' || type === 'SuperEG') ? '1 hora' : undefined;
          setSelectedOptionals(prev => [...prev, { type, duration: defaultDuration }]);
      }
  };

  const updateOptionalDuration = (type: string, duration: string) => {
      setSelectedOptionals(prev => prev.map(o => o.type === type ? { ...o, duration } : o));
  };

  const isCategoryChecked = (type: string) => !!selectedOptionals.find(o => o.type === type);
  const getOptionalDuration = (type: string) => selectedOptionals.find(o => o.type === type)?.duration || '';

  // --- SPECIFIC LABS LOGIC ---
  const toggleSpecificLab = (labName: string) => {
      setSelectedSpecificLabs(prev => {
          const next = new Set(prev);
          if (next.has(labName)) next.delete(labName);
          else next.add(labName);
          return next;
      });
  };

  const filteredLabs = availableLabs.filter(lab => normalizeText(lab.name).includes(normalizeText(labSearchTerm)));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-10">
       <div className="flex items-center justify-between border-b pb-4 mb-6">
        <div>
            <h3 className="text-xl font-semibold text-slate-800">Referencia y Laboratorios</h3>
            <span className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded ml-2">Opcional</span>
        </div>
        <span className="text-sm font-medium text-brand-600 bg-brand-50 px-3 py-1 rounded-full">Paso 2 de 4</span>
       </div>

       {/* 1. SELECCIÓN DE PATOLOGÍA */}
       <div className="bg-brand-50/50 p-6 rounded-xl border border-brand-100">
           <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                <div className="flex items-center gap-2 text-brand-800 font-bold">
                    <Microscope className="w-5 h-5" />
                    <h4>1. Seleccionar Patología</h4>
                </div>
                {userSpecialty && (
                    <div className="text-xs text-brand-700 flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-brand-200 shadow-sm">
                        <Stethoscope className="w-3 h-3" />
                        <span className="hidden sm:inline">Tu Especialidad:</span> <strong>{userSpecialty}</strong>
                    </div>
                )}
           </div>
           
           <div>
               <label className="block text-sm font-semibold text-slate-700 mb-2">Patología / Cuadro Clínico</label>
               {loadingPaths ? <p className="text-xs text-slate-400">Cargando patologías...</p> : (
                   <select 
                       value={selectedPathology?.name || ''}
                       onChange={handlePathologyChange}
                       className="w-full rounded-lg border-slate-300 p-2.5 bg-white text-slate-800 focus:ring-brand-500 focus:border-brand-500 shadow-sm"
                   >
                       <option value="">-- Seleccionar Patología --</option>
                       {pathologies.map(p => (
                           <option key={p.name} value={p.name}>{p.name}</option>
                       ))}
                   </select>
               )}
               <p className="text-xs text-slate-400 mt-2">Al seleccionar una patología, los exámenes obligatorios se marcarán automáticamente.</p>
           </div>
       </div>

       {/* 2. EXÁMENES SUGERIDOS (GRID) */}
       {selectedPathology && (
         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
             <div className="flex justify-between items-end mb-3">
                <label className="block text-sm font-bold text-slate-700">
                    2. Exámenes Obligatorios: <span className="text-brand-600">{selectedPathology.name}</span>
                </label>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                 {selectedPathology.exams.map(exam => {
                     const isChecked = isExamCheckedInGroup(exam);
                     return (
                         <motion.div 
                            key={exam} 
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleExamInGroup(exam)}
                            className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-all select-none ${isChecked ? 'bg-brand-600 border-brand-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                         >
                             {isChecked ? <CheckSquare className="w-5 h-5 text-white"/> : <Square className="w-5 h-5 text-slate-300"/>}
                             <span className="text-sm font-medium">{exam}</span>
                         </motion.div>
                     );
                 })}
             </div>
         </motion.div>
       )}

       {/* 3. GRUPOS SELECCIONADOS (DETALLADO) */}
       {referralGroups.length > 0 && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t-2 border-slate-100 pt-6">
                <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-brand-600" />
                    3. Resumen de Solicitudes (Por Patología)
                </h4>
                
                <div className="space-y-4">
                    <AnimatePresence>
                    {referralGroups.map((group) => (
                        <motion.div 
                            key={group.id} 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                        >
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                                <div>
                                    <span className="font-bold text-slate-700">{group.pathology}</span>
                                </div>
                                <button type="button" onClick={() => removeGroup(group.id)} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50" title="Eliminar todo el grupo">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-4">
                                {group.exams.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 mb-4">
                                        {group.exams.map(exam => (
                                            <span key={exam} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-brand-100 text-brand-800 border border-brand-200">
                                                {exam}
                                                <button type="button" onClick={() => removeExamFromGroup(group.id, exam)} className="hover:bg-brand-200 rounded-full p-0.5">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400 italic mb-4">Sin exámenes seleccionados.</p>
                                )}
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                                        <StickyNote className="w-3 h-3"/> Nota para {group.pathology} (Opcional)
                                    </label>
                                    <textarea 
                                        rows={2}
                                        value={group.note || ''}
                                        onChange={(e) => updateGroupNote(group.id, e.target.value)}
                                        placeholder={`Especifique detalles clínicos sobre ${group.pathology}...`}
                                        className="w-full text-sm bg-yellow-50/50 border border-yellow-200 rounded-lg p-2 focus:ring-2 focus:ring-yellow-400 focus:border-transparent placeholder:text-slate-400 text-slate-700"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                    </AnimatePresence>
                </div>
           </motion.div>
       )}

       {/* 4. EXÁMENES OPCIONALES & LABORATORIOS & NOTA GENERAL */}
       <div className="grid grid-cols-1 gap-6 pt-6 border-t border-slate-100">
            {/* PANEL DE OPCIONALES */}
            <div>
               <label className="block text-sm font-bold text-slate-700 mb-3">Exámenes Opcionales / Laboratorios Individuales</label>
               <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                   {OPTIONAL_EXAMS_TYPES.map(type => {
                       const isChecked = isCategoryChecked(type);
                       const showHours = isChecked && (type === 'EG' || type === 'SuperEG');
                       const showLabsPanel = isChecked && type === 'Laboratorios';
                       const showOthersInput = isChecked && type === 'Otros';

                       return (
                           <motion.div key={type} className={`p-2 rounded-lg border transition-all ${isChecked ? 'bg-brand-50 border-brand-200' : 'border-transparent hover:bg-slate-50'}`}>
                               <div className="flex items-center justify-between">
                                   <div 
                                      onClick={() => toggleOptionalCategory(type)} 
                                      className="flex items-center gap-3 cursor-pointer select-none flex-1"
                                   >
                                        {isChecked ? <CheckSquare className="w-5 h-5 text-brand-600"/> : <Square className="w-5 h-5 text-slate-300"/>}
                                        <span className={`text-sm ${isChecked ? 'font-bold text-brand-800' : 'font-medium text-slate-600'}`}>{type}</span>
                                   </div>
                               </div>

                               {/* DROPDOWN DE HORAS */}
                               {showHours && (
                                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 ml-8 flex items-center gap-2">
                                       <Clock className="w-4 h-4 text-brand-400" />
                                       <select 
                                          value={getOptionalDuration(type)}
                                          onChange={(e) => updateOptionalDuration(type, e.target.value)}
                                          className="text-xs p-1.5 rounded border border-brand-300 bg-white text-brand-700 focus:ring-1 focus:ring-brand-500 outline-none"
                                       >
                                           {EG_DURATIONS.map(d => (
                                               <option key={d} value={d}>{d}</option>
                                           ))}
                                       </select>
                                   </motion.div>
                               )}

                               {/* PANEL DE LABORATORIOS (REAL DATA FROM DB) */}
                               {showLabsPanel && (
                                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 ml-2 mr-2">
                                       <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-inner">
                                           {/* Search Bar */}
                                           <div className="relative mb-3">
                                               <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                                               <input 
                                                  type="text"
                                                  placeholder="Buscar laboratorio por nombre..." 
                                                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-200 bg-white text-slate-900 placeholder-slate-400"
                                                  value={labSearchTerm}
                                                  onChange={(e) => setLabSearchTerm(e.target.value)}
                                               />
                                           </div>
                                           
                                           {/* Scrollable Grid List */}
                                           <div className="max-h-60 overflow-y-auto custom-scrollbar border-t border-slate-100 pt-2">
                                               {availableLabs.length === 0 ? (
                                                   <div className="text-center py-4 text-xs text-slate-400 italic">Cargando catálogo...</div>
                                               ) : (
                                                   <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                       {filteredLabs.map(lab => {
                                                           const isLabChecked = selectedSpecificLabs.has(lab.name);
                                                           return (
                                                               <div 
                                                                  key={lab.id} 
                                                                  onClick={() => toggleSpecificLab(lab.name)}
                                                                  className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors text-xs ${isLabChecked ? 'bg-brand-100 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-600'}`}
                                                               >
                                                                   <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isLabChecked ? 'border-brand-500 bg-brand-500' : 'border-slate-300 bg-white'}`}>
                                                                       {isLabChecked && <CheckSquare className="w-3 h-3 text-white" />}
                                                                   </div>
                                                                   <div>
                                                                       <span className="leading-tight block">{lab.name}</span>
                                                                       {lab.code && <span className="text-[9px] text-slate-400 font-mono block">{lab.code}</span>}
                                                                   </div>
                                                               </div>
                                                           );
                                                       })}
                                                       {filteredLabs.length === 0 && (
                                                           <div className="col-span-full text-center py-4 text-xs text-slate-400 italic">No se encontraron resultados. Pruebe en "Otros".</div>
                                                       )}
                                                   </div>
                                               )}
                                           </div>
                                           <div className="mt-2 text-[10px] text-slate-400 text-right">
                                               {selectedSpecificLabs.size} seleccionados
                                           </div>
                                       </div>
                                   </motion.div>
                               )}

                               {/* INPUT PARA OTROS */}
                               {showOthersInput && (
                                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 ml-2">
                                       <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><PenTool className="w-3 h-3"/> Especifique exámenes (separar por comas)</label>
                                       <textarea
                                            rows={3}
                                            value={otherExamsText}
                                            onChange={(e) => setOtherExamsText(e.target.value)}
                                            placeholder="Ej: Perfil Hepático, Tiempos de Coagulación..."
                                            className="w-full text-sm p-3 rounded-lg border border-brand-300 focus:ring-2 focus:ring-brand-500 outline-none bg-white text-slate-800 shadow-inner"
                                       />
                                   </motion.div>
                               )}
                           </motion.div>
                       );
                   })}
               </div>
            </div>

            {/* GENERAL NOTE */}
            <div>
                 <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                   <FileText className="w-4 h-4 text-brand-600" /> Nota de Referencia General
                 </label>
                 <textarea 
                    rows={4}
                    {...register('referralNote')} 
                    placeholder="Observaciones generales para cualquier laboratorio..."
                    className="w-full rounded-lg border shadow-sm focus:ring-2 p-3 bg-white text-slate-900 border-slate-300 focus:border-brand-500 focus:ring-brand-200 resize-none"
                 />
            </div>
       </div>
    </motion.div>
  );
};
