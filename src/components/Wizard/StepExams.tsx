
import * as React from 'react';
import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Share2, FileText, CheckSquare, Square, Stethoscope, X, FlaskConical, StickyNote, Trash2, ArrowDownCircle, Microscope, PenTool, BadgeCheck } from 'lucide-react';
import { getPathologies } from '../../services/inventoryService.ts';
import { Pathology, ReferralGroup, Patient } from '../../types.ts';
import { motion, AnimatePresence } from 'framer-motion';

interface StepExamsProps {
    userSpecialties?: string[];
    patient?: Patient | null;
    appointmentType?: 'Nueva' | 'Reconsulta';
}

const OPTIONAL_EXAMS_TYPES = [
  // 'EEG',
  // 'SuperEEG',
  // 'Resonancia',
  'Otros'
];
const EG_DURATIONS = ['1/2 hora', '1 hora', '3 horas', '5 horas', '8 horas'];

const LAB_PROTOCOLS: Record<string, { title: string; items: string[] }[]> = {
  epilepsia: [
    { title: 'Prueba', items: ['Hematología Completa + VS'] },
    { title: 'Pruebas de Función Hepática', items: ['TGO/ASAT', 'TGP/ALAT', 'GGT', 'Amonio', 'Fosfatasa alcalina', 'Albumina', 'Bilirrubina directa', 'Bilirrubina indirecta', 'Bilirrubina total', 'Coagulación (TP, TTP, INR)'] },
    { title: 'Química Sanguínea', items: ['Glucosa pre', 'Creatinina', 'BUN', 'Na+/K+ CL (Sodio, Potasio, Cloruro)', 'Ácido úrico'] },
    { title: 'Niveles séricos de medicamentos', items: ['Ácido valproico', 'Fenitoína', 'Carbamazepina', 'Carbonato de litio'] },
    { title: 'Perfil Lipídico', items: ['Triglicéridos', 'Colesterol', 'HDL', 'VLDL'] },
    { title: 'Otros exámenes', items: ['Grupo Sanguíneo', 'Orina completa', 'Heces simples', 'Hemoglobina glicosilada', 'Electrocardiograma', 'T3', 'T4', 'TSH', 'Otros'] }
  ],
  parkinson: [
    { title: 'Glucosa y Metabolismo', items: ['Glucosa pre', 'Glucosa post', 'Hemoglobina glicosilada'] },
    { title: 'Función Hepática', items: ['TGO/ASAT', 'TGP/ALAT', 'GGT'] },
    { title: 'Tiroides', items: ['TSH', 'T4 libre'] },
    { title: 'Vitaminas', items: ['Vitamina D', 'Vitamina B12'] },
    { title: 'Orina', items: ['Orina completa'] }
  ]
};

// Helper para normalizar texto (quitar tildes y minúsculas)
const normalizeText = (text: string) => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

export const StepExams: React.FC<StepExamsProps> = ({ userSpecialties, patient, appointmentType }) => {
  const { register, watch, setValue, getValues } = useFormContext();
  
  const [pathologies, setPathologies] = useState<Pathology[]>([]);
  const [selectedPathology, setSelectedPathology] = useState<Pathology | null>(null);
  const [loadingPaths, setLoadingPaths] = useState(false);

  // State for Optional Exams Categories
  const [selectedOptionals, setSelectedOptionals] = useState<{
      type: string 
}[]>([]);
  
  // State for "Otros" text area
  const [otherExamsText, setOtherExamsText] = useState('');

  // Watchers
  const referralGroups: ReferralGroup[] = watch('referralGroups') || [];
  const resonanceOrders = watch('resonanceOrders') || [];
  const eegOrders = watch('eegOrders') || [];
  const emotionalEvaluationSelections = watch('emotionalEvaluationSelections') || [];
  
  // Load Pathologies & Labs
  useEffect(() => {
    const load = async () => {
        setLoadingPaths(true);
        const paths = await getPathologies();
        setPathologies(paths);
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
          const restored: { type: string }[] = [];
          
          items.forEach((item: string) => {
              if (item.includes('(') && item.includes(')')) {
                   const match = item.match(/(.*?) \((.*?)\)/);
                   if (match) restored.push({ type: match[1] });
                   else restored.push({ type: item });
              } else {
                   if (OPTIONAL_EXAMS_TYPES.includes(item)) restored.push({ type: item });
              }
          });
          if (restored.length > 0) setSelectedOptionals(restored);
      }

      // Restore "Otros" text
      if (savedCustomText) setOtherExamsText(savedCustomText);

  }, []); 

  // SYNC FORM STATE (The Master Effect)
  useEffect(() => {
      const optionalExamsList = new Set<string>();
      
      // 2. Add "Otros" text content
      if (selectedOptionals.find(o => o.type === 'Otros') && otherExamsText.trim()) {
          const manualExams = otherExamsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
          manualExams.forEach(me => optionalExamsList.add(me));
      }

      // 3. Add Categories (EG, Resonancia, etc) if they are standalone
      selectedOptionals.forEach(opt => {
          if (opt.type !== 'Otros' && opt.type !== 'Laboratorios') {
             optionalExamsList.add(opt.type);
          }
      });

      // 4. Formatted string for UI chips/summary
      const formattedOptionals = selectedOptionals.map(opt => opt.type);

      // UPDATE FORM
      setValue('exams', Array.from(optionalExamsList)); // Now cleaner
      setValue('otherExams', formattedOptionals.join(', '));
      setValue('customOtherExams', otherExamsText);

  }, [referralGroups, selectedOptionals, otherExamsText, setValue]);

  useEffect(() => {
      const allExams: string[] = [];
      referralGroups.forEach(group => group.exams.forEach(exam => allExams.push(exam)));
      const optionalExams = getValues('exams') || [];
      optionalExams.forEach((exam: string) => allExams.push(exam));
      const unique = Array.from(new Set(allExams));
      const resonanceExams = unique.filter(exam => normalizeText(exam).includes('resonancia'));

      if (resonanceExams.length === 0) {
          if (resonanceOrders.length > 0) setValue('resonanceOrders', undefined);
          return;
      }

      const currentOrders = (getValues('resonanceOrders') || []) as any[];
      const validOrders = currentOrders.filter(order => order.examName && resonanceExams.includes(order.examName));
      const missingOrders = resonanceExams.filter(exam => !validOrders.some(order => order.examName === exam));
      const nextOrders = [
          ...validOrders,
          ...missingOrders.map(exam => ({
              examName: exam,
              probableDiagnosis: '',
              attentionNotes: '',
              sendResultsTo: 'Oficinas Zona 10'
          }))
      ];

      setValue('resonanceOrders', nextOrders, { shouldDirty: false });
  }, [referralGroups, selectedOptionals, otherExamsText]);

  useEffect(() => {
      const allExams: string[] = [];
      referralGroups.forEach(group => group.exams.forEach(exam => allExams.push(exam)));
      const optionalExams = getValues('exams') || [];
      optionalExams.forEach((exam: string) => allExams.push(exam));
      const unique = Array.from(new Set(allExams));
      const eegExams = unique.filter(exam => {
          const normalized = normalizeText(exam).replace(/[^a-z0-9]/g, '');
          return normalized.includes('eeg')
            || normalized.includes('electroencefalograma')
            || normalized.includes('videoelectroencefalograma')
            || normalized.includes('videoencefalograma')
            || normalized.includes('videoeeg');
      });

      if (eegExams.length === 0) {
          if (eegOrders.length > 0) setValue('eegOrders', undefined);
          return;
      }

      const currentOrders = (getValues('eegOrders') || []) as any[];
      const validOrders = currentOrders.filter(order => order.examName && eegExams.includes(order.examName));
      const missingOrders = eegExams.filter(exam => !validOrders.some(order => order.examName === exam));
      const nextOrders = [
          ...validOrders,
          ...missingOrders.map(exam => ({
              examName: exam,
              probableDiagnosis: '',
              duration: EG_DURATIONS[1],
              cctcg: false,
              cpc: false,
              cpcSecGeneralizadas: false,
              ausencias: false,
              crisisMioclonicas: false,
              crisisEstaticas: false,
              specialIndications: '',
              medicatedWith: '',
              videoMonitoringHours: '',
              videoMonitoringSleepDeprivation: 'No',
              ictalVideoHours: '',
              ictalSleepDeprivation: 'No',
              spikeDetection64: false,
              spikeDetection128: false,
              spikeDetectionHours: '',
              p300: false
          }))
      ];

      setValue('eegOrders', nextOrders, { shouldDirty: false });
  }, [referralGroups, selectedOptionals, otherExamsText]);

  // --- PATHOLOGY & GROUPS LOGIC ---
  useEffect(() => {
      if (selectedPathology) {
          const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
          const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
          const existingGroupIndex = currentGroups.findIndex(g => g.id === groupId);

          if (existingGroupIndex === -1) {
              // Si es reconsulta, NO seleccionamos exámenes automáticamente
              const isReconsulta = appointmentType === 'Reconsulta';

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
   }, [selectedPathology, getValues, setValue, patient, appointmentType]);

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

  const labProtocolExam = selectedPathology?.exams.find(exam => normalizeText(exam).includes('laboratorios'));
  const isLabProtocolActive = labProtocolExam ? isExamCheckedInGroup(labProtocolExam) : false;
  const emotionalEvaluationExam = selectedPathology?.exams.find(exam => normalizeText(exam).includes('evaluacion emocional'));
  const isEmotionalEvaluationActive = emotionalEvaluationExam ? isExamCheckedInGroup(emotionalEvaluationExam) : false;

  const labProtocolKey = selectedPathology?.name ? normalizeText(selectedPathology.name) : '';
  const labProtocolGroups =
    labProtocolKey.includes('parkinson') ? LAB_PROTOCOLS.parkinson : LAB_PROTOCOLS.epilepsia;

  const toggleProtocolLab = (labName: string) => {
      if (!selectedPathology) return;
      const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
      const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
      const group = currentGroups.find(g => g.id === groupId);
      if (!group) {
          currentGroups.push({ id: groupId, pathology: selectedPathology.name, exams: [`Laboratorios: ${labName}`], note: '' });
          setValue('referralGroups', currentGroups);
          return;
      }
      const tag = `Laboratorios: ${labName}`;
      if (group.exams.includes(tag)) {
          group.exams = group.exams.filter(e => e !== tag);
      } else {
          group.exams.push(tag);
      }
      setValue('referralGroups', currentGroups);
  };

  const isProtocolLabSelected = (labName: string) => {
      if (!selectedPathology) return false;
      const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
      const group = referralGroups.find(g => g.id === groupId);
      return group ? group.exams.includes(`Laboratorios: ${labName}`) : false;
  };

  const toggleEmotionalSelection = (value: string) => {
      const current = new Set<string>(emotionalEvaluationSelections);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      setValue('emotionalEvaluationSelections', Array.from(current));
  };

  useEffect(() => {
      if (!isEmotionalEvaluationActive && emotionalEvaluationSelections.length > 0) {
          setValue('emotionalEvaluationSelections', []);
      }
  }, [isEmotionalEvaluationActive, emotionalEvaluationSelections, setValue]);

  useEffect(() => {
      if (isLabProtocolActive) return;
      if (!selectedPathology) return;
      const groupId = `pat-${selectedPathology.id || selectedPathology.name}`;
      const currentGroups = [...(getValues('referralGroups') || [])] as ReferralGroup[];
      const group = currentGroups.find(g => g.id === groupId);
      if (!group) return;
      const before = group.exams.length;
      group.exams = group.exams.filter(exam => !exam.startsWith('Laboratorios:'));
      if (group.exams.length === 0 && !group.note) {
          setValue('referralGroups', currentGroups.filter(g => g.id !== groupId));
          return;
      }
      if (group.exams.length !== before) setValue('referralGroups', currentGroups);
  }, [isLabProtocolActive, selectedPathology, getValues, setValue]);

  // --- OPTIONAL CATEGORIES LOGIC ---
  const toggleOptionalCategory = (type: string) => {
      const exists = selectedOptionals.find(o => o.type === type);
      if (exists) {
          setSelectedOptionals(prev => prev.filter(o => o.type !== type));
          if (type === 'Otros') setOtherExamsText('');
      } else {
          setSelectedOptionals(prev => [...prev, { type }]);
      }
  };

  const isCategoryChecked = (type: string) => !!selectedOptionals.find(o => o.type === type);

  const allExams = (() => {
      const list: string[] = [];
      referralGroups.forEach(group => group.exams.forEach(exam => list.push(exam)));
      const optionalExams = getValues('exams') || [];
      optionalExams.forEach((exam: string) => list.push(exam));
      return Array.from(new Set(list));
  })();
  const resonanceExams = allExams.filter(exam => normalizeText(exam).includes('resonancia'));
      const eegExams = allExams.filter(exam => {
      const normalized = normalizeText(exam).replace(/[^a-z0-9]/g, '');
      return normalized.includes('eeg')
        || normalized.includes('electroencefalograma')
        || normalized.includes('videoelectroencefalograma')
        || normalized.includes('videoencefalograma')
        || normalized.includes('videoeeg');
  });

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
                    <h4>1. Clasificación según patología de paciente</h4>
                </div>
                {userSpecialties && userSpecialties.length > 0 && (
                    <div className="text-xs text-brand-700 flex items-center gap-1 bg-white px-3 py-1.5 rounded-full border border-brand-200 shadow-sm">
                        <Stethoscope className="w-3 h-3" />
                        <span className="hidden sm:inline">Tus Especialidades:</span> <strong>{userSpecialties.join(', ')}</strong>
                    </div>
                )}
           </div>
           
           <div>
               <label className="block text-sm font-semibold text-slate-700 mb-2">Clasificación según patología de paciente</label>
               {loadingPaths ? <p className="text-xs text-slate-400">Cargando diagnósticos...</p> : (
                   <select 
                       value={selectedPathology?.name || ''}
                       onChange={handlePathologyChange}
                       className="w-full rounded-lg border-slate-300 p-2.5 bg-white text-slate-800 focus:ring-brand-500 focus:border-brand-500 shadow-sm"
                   >
                       <option value="">-- Seleccionar Clasificación --</option>
                       {pathologies.map(p => (
                           <option key={p.name} value={p.name}>{p.name}</option>
                       ))}
                   </select>
               )}
               <p className="text-xs text-slate-400 mt-2">Al seleccionar una clasificación, los exámenes del protocolo se marcarán automáticamente.</p>
           </div>
       </div>

       {/* 2. EXÁMENES SUGERIDOS (GRID) */}
       {selectedPathology && (
         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
             <div className="flex justify-between items-end mb-3">
                <label className="block text-sm font-bold text-slate-700">
                   2. Clasificación: <span className="text-brand-600">{selectedPathology.name}</span>
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

            {isEmotionalEvaluationActive && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                        Evaluación emocional (seleccione especialidades)
                    </label>
                    <div className="flex flex-wrap gap-3">
                        {['Psiquiatría', 'Psicología', 'Neuropsicología'].map(option => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => toggleEmotionalSelection(option)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                                    emotionalEvaluationSelections.includes(option)
                                        ? 'bg-brand-600 text-white border-brand-600'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-brand-200'
                                }`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {isLabProtocolActive && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                        Laboratorios del protocolo
                    </label>
                    <div className="space-y-4">
                        {labProtocolGroups.map(group => (
                            <div key={group.title} className="border border-slate-100 rounded-xl p-3">
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">{group.title}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {group.items.map(item => {
                                        const active = isProtocolLabSelected(item);
                                        return (
                                            <button
                                                key={item}
                                                type="button"
                                                onClick={() => toggleProtocolLab(item)}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition ${
                                                    active
                                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                                        : 'bg-white text-slate-600 border-slate-200 hover:border-emerald-200'
                                                }`}
                                            >
                                                {active ? <CheckSquare className="w-4 h-4 text-white" /> : <Square className="w-4 h-4 text-slate-300" />}
                                                {item}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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
                                {(() => {
                                    const visibleExams = group.exams.filter(exam => {
                                        const normalized = normalizeText(exam);
                                        const isLabToggle = normalized.includes('laboratorios') && !exam.startsWith('Laboratorios:');
                                        return !isLabToggle;
                                    });
                                    return visibleExams.length > 0 ? (
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {visibleExams.map(exam => (
                                                <span key={exam} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-brand-100 text-brand-800 border border-brand-200">
                                                    {exam}
                                                    <button type="button" onClick={() => removeExamFromGroup(group.id, exam)} className="hover:bg-brand-200 rounded-full p-0.5">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                            {emotionalEvaluationExam && group.exams.includes(emotionalEvaluationExam) && emotionalEvaluationSelections.length > 0 && (
                                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-600 border border-slate-200">
                                                    Evaluación emocional: {emotionalEvaluationSelections.join(', ')}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-400 italic mb-4">Sin exámenes seleccionados.</p>
                                    );
                                })()}
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
            {(resonanceExams.length > 0 || eegExams.length > 0) && (
                <div className="grid grid-cols-1 gap-6">
                    {resonanceExams.length > 0 && (
                        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-slate-50 to-white p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-indigo-700 font-bold">
                                    <BadgeCheck className="w-5 h-5" />
                                    <h4>Órdenes de Resonancia Magnética</h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (resonanceExams.length === 0) return;
                                        setValue('resonanceOrders', [
                                            ...(resonanceOrders || []),
                                            { examName: resonanceExams[0], probableDiagnosis: '', attentionNotes: '', sendResultsTo: 'Oficinas Zona 10' }
                                        ]);
                                    }}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                                >
                                    Agregar orden
                                </button>
                            </div>

                            <div className="space-y-4">
                                {resonanceOrders.map((order: any, index: number) => (
                                    <div key={`res-${index}`} className="bg-white border border-indigo-100 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-bold text-indigo-500 uppercase">Orden #{index + 1}</p>
                                            <button
                                                type="button"
                                                onClick={() => setValue('resonanceOrders', resonanceOrders.filter((_: any, i: number) => i !== index))}
                                                className="text-[11px] font-bold text-red-500 hover:text-red-600"
                                            >
                                                Eliminar
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tipo de Resonancia</label>
                                                <input
                                                    list={`resonance-options-${index}`}
                                                    {...register(`resonanceOrders.${index}.examName`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 bg-white ${
                                                        !order.examName?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-indigo-200 focus:ring-indigo-200 focus:border-indigo-500'
                                                    }`}
                                                    placeholder="Seleccione o escriba"
                                                />
                                                <datalist id={`resonance-options-${index}`}>
                                                    {resonanceExams.map(exam => (
                                                        <option key={exam} value={exam} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Diagnóstico probable</label>
                                                <input
                                                    {...register(`resonanceOrders.${index}.probableDiagnosis`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.probableDiagnosis?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-indigo-200 focus:ring-indigo-200 focus:border-indigo-500'
                                                    }`}
                                                    placeholder="Diagnóstico probable"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Poner especial atención en</label>
                                            <textarea
                                                rows={2}
                                                {...register(`resonanceOrders.${index}.attentionNotes`)}
                                                className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                    !order.attentionNotes?.trim()
                                                        ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                        : 'border-indigo-200 focus:ring-indigo-200 focus:border-indigo-500'
                                                }`}
                                                placeholder="Ej: lesiones temporales, foco epileptogénico..."
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Enviar resultados a</label>
                                            <div className="px-3 py-2 rounded-lg border border-indigo-200 text-sm text-slate-600 bg-indigo-50">
                                                Oficinas Zona 10
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {eegExams.length > 0 && (
                        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-slate-50 to-white p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                                    <BadgeCheck className="w-5 h-5" />
                                    <h4>Órdenes EEG / Video EEG</h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (eegExams.length === 0) return;
                                        setValue('eegOrders', [
                                            ...(eegOrders || []),
                                            {
                                                examName: eegExams[0],
                                                probableDiagnosis: '',
                                                duration: EG_DURATIONS[1],
                                                cctcg: false,
                                                cpc: false,
                                                cpcSecGeneralizadas: false,
                                                ausencias: false,
                                                crisisMioclonicas: false,
                                                crisisEstaticas: false,
                                                specialIndications: '',
                                                medicatedWith: '',
                                                videoMonitoringHours: '',
                                                videoMonitoringSleepDeprivation: 'No',
                                                ictalVideoHours: '',
                                                ictalSleepDeprivation: 'No',
                                                spikeDetection64: false,
                                                spikeDetection128: false,
                                                spikeDetectionHours: '',
                                                p300: false
                                            }
                                        ]);
                                    }}
                                    className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                >
                                    Agregar orden
                                </button>
                            </div>

                            <div className="space-y-4">
                                {eegOrders.map((order: any, index: number) => (
                                    <div key={`eeg-${index}`} className="bg-white border border-emerald-100 rounded-xl p-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs font-bold text-emerald-500 uppercase">Orden #{index + 1}</p>
                                            <button
                                                type="button"
                                                onClick={() => setValue('eegOrders', eegOrders.filter((_: any, i: number) => i !== index))}
                                                className="text-[11px] font-bold text-red-500 hover:text-red-600"
                                            >
                                                Eliminar
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Tipo de estudio</label>
                                                <input
                                                    list={`eeg-options-${index}`}
                                                    {...register(`eegOrders.${index}.examName`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 bg-white ${
                                                        !order.examName?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                    placeholder="Seleccione o escriba"
                                                />
                                                <datalist id={`eeg-options-${index}`}>
                                                    {eegExams.map(exam => (
                                                        <option key={exam} value={exam} />
                                                    ))}
                                                </datalist>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Horas del estudio</label>
                                                <select
                                                    {...register(`eegOrders.${index}.duration`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 bg-white ${
                                                        !order.duration?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                >
                                                    {EG_DURATIONS.map(duration => (
                                                        <option key={duration} value={duration}>
                                                            {duration}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Diagnóstico probable</label>
                                                <input
                                                    {...register(`eegOrders.${index}.probableDiagnosis`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.probableDiagnosis?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                    placeholder="Diagnóstico probable"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <input type="checkbox" {...register(`eegOrders.${index}.cctcg`)} className="w-4 h-4" />
                                                CCTCG
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <input type="checkbox" {...register(`eegOrders.${index}.cpc`)} className="w-4 h-4" />
                                                CPC
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <input type="checkbox" {...register(`eegOrders.${index}.cpcSecGeneralizadas`)} className="w-4 h-4" />
                                                CPC Sec. Generalizadas
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <input type="checkbox" {...register(`eegOrders.${index}.ausencias`)} className="w-4 h-4" />
                                                Ausencias
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <input type="checkbox" {...register(`eegOrders.${index}.crisisMioclonicas`)} className="w-4 h-4" />
                                                Crisis Mioclónicas
                                            </label>
                                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                                                <input type="checkbox" {...register(`eegOrders.${index}.crisisEstaticas`)} className="w-4 h-4" />
                                                Crisis Estáticas
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Indicaciones especiales</label>
                                                <textarea
                                                    rows={2}
                                                    {...register(`eegOrders.${index}.specialIndications`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.specialIndications?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Medicado(a) con</label>
                                                <input
                                                    {...register(`eegOrders.${index}.medicatedWith`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.medicatedWith?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Video Monitoreo (horas)</label>
                                                <input
                                                    {...register(`eegOrders.${index}.videoMonitoringHours`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.videoMonitoringHours?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                    placeholder="Horas"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Supresión de Sueño</label>
                                                <select
                                                    {...register(`eegOrders.${index}.videoMonitoringSleepDeprivation`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.videoMonitoringSleepDeprivation?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                >
                                                    <option value="Si">Si</option>
                                                    <option value="No">No</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Video Monitoreo Ictal (horas)</label>
                                                <input
                                                    {...register(`eegOrders.${index}.ictalVideoHours`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.ictalVideoHours?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                    placeholder="Horas"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Supresión de Sueño Ictal</label>
                                                <select
                                                    {...register(`eegOrders.${index}.ictalSleepDeprivation`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.ictalSleepDeprivation?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                >
                                                    <option value="Si">Si</option>
                                                    <option value="No">No</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Detección de Fuentes (Curry)</label>
                                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                                    <input type="checkbox" {...register(`eegOrders.${index}.spikeDetection64`)} className="w-4 h-4" />
                                                    64 Canales
                                                </label>
                                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                                    <input type="checkbox" {...register(`eegOrders.${index}.spikeDetection128`)} className="w-4 h-4" />
                                                    128 Canales
                                                </label>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Horas</label>
                                                <input
                                                    {...register(`eegOrders.${index}.spikeDetectionHours`)}
                                                    className={`w-full px-3 py-2 rounded-lg border text-sm text-slate-700 focus:outline-none focus:ring-2 ${
                                                        !order.spikeDetectionHours?.trim()
                                                            ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
                                                            : 'border-emerald-200 focus:ring-emerald-200 focus:border-emerald-500'
                                                    }`}
                                                    placeholder="Horas"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">P300</label>
                                                <label className="flex items-center gap-2 text-xs text-slate-600 mt-2">
                                                    <input type="checkbox" {...register(`eegOrders.${index}.p300`)} className="w-4 h-4" />
                                                    Requerido
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* PANEL DE OPCIONALES */}
            <div>
               <label className="block text-sm font-bold text-slate-700 mb-3">Exámenes Opcionales</label>
               <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                   {OPTIONAL_EXAMS_TYPES.map(type => {
                       const isChecked = isCategoryChecked(type);
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
