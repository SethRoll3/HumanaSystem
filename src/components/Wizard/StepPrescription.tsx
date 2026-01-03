
import * as React from 'react';
import { useState } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Search, Plus, Trash2, Pill, ExternalLink, StickyNote } from 'lucide-react';
import { searchMedicine, saveExternalMedicine } from '../../services/inventoryService.ts';
import { parsePrescriptionWithAI, analyzeExternalMedicine } from '../../services/geminiService.ts';
import { Medicine, UserProfile } from '../../../types.ts';
import { logAuditAction } from '../../services/auditService.ts';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface StepPrescriptionProps {
    currentUser: UserProfile;
}

export const StepPrescription: React.FC<StepPrescriptionProps> = ({ currentUser }) => {
  const { register, control, setValue, watch } = useFormContext();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "prescription"
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Medicine[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Search including external medicines
  const performSearch = async (term: string) => {
      const res = await searchMedicine(term);
      setSearchResults(res);
      setShowDropdown(true);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchTerm(val);
      performSearch(val);
  };

  const handleFocus = () => {
      performSearch(searchTerm);
  };

  const addMedicine = (med: Medicine) => {
    append({
      medId: med.id,
      name: med.name,
      quantity: 1, // Default safe value
      dosage: '',
      duration_days: '', // REMOVED DEFAULT "3 días". Let AI calculate or user type.
      isExternal: med.isExternal || false,
      units_per_box: med.units_per_box || 1,
      presentation: med.presentation
    });
    setSearchTerm('');
    setShowDropdown(false);
  };

  const addManualExternal = async () => {
      if(!searchTerm) return;
      const medName = searchTerm;
      
      // CHECK: Does it exist in the current search results (exact match, case insensitive)?
      const existingInSearch = searchResults.find(r => r.name.toLowerCase() === medName.toLowerCase());

      if (existingInSearch) {
          // If found, treat as selecting existing (no new AI call, no new DB entry)
          addMedicine(existingInSearch);
          return;
      }

      setSearchTerm('');
      setShowDropdown(false);

      append({
          medId: `ext-${Date.now()}`,
          name: medName,
          quantity: 1,
          dosage: '',
          duration_days: '', // REMOVED DEFAULT "3 días"
          isExternal: true,
          units_per_box: 1,
          presentation: 'Externo'
      });

      // Background AI analysis for DB (Silent) - Only for NEW externals
      try {
          const aiAnalysis = await analyzeExternalMedicine(medName);
          await saveExternalMedicine(medName, aiAnalysis);
          
          // --- AUDITORÍA AGREGADA ---
          await logAuditAction(currentUser.email, "REGISTRO_MEDICAMENTO_EXTERNO", `Nuevo medicamento registrado manualmente: ${medName}`);
      } catch (e) {
          console.error("Error saving external:", e);
      }
  };

  // Logic to fill hidden fields based on text
  const handleCalculateRow = async (index: number) => {
      const rowData = watch(`prescription.${index}`);
      if (!rowData.dosage) return;

      // Now we pass units_per_box to the AI service.
      const unitsPerBox = rowData.units_per_box || 0;

      try {
          const result = await parsePrescriptionWithAI(rowData.name, rowData.dosage, unitsPerBox);
          
          // Only update if AI returns valid numbers
          if(result) {
              setValue(`prescription.${index}.quantity`, result.quantity);
              setValue(`prescription.${index}.duration_days`, result.duration);
          }
      } catch (e) {
          // Fallback handled in service
      }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="space-y-8 pb-10">
      <div className="space-y-6">
          <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <div className="bg-emerald-600 text-white p-1.5 rounded-lg">
                    <Pill className="w-4 h-4"/>
                </div>
                1. Receta de Medicamentos
          </h4>

          <div className="relative z-20">
              <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={handleSearchChange}
                        onFocus={handleFocus}
                        placeholder="Buscar medicamento..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm bg-white text-slate-900 text-sm md:text-base"
                        autoComplete="off"
                    />
                    {showDropdown && searchResults.length > 0 && (
                        <motion.ul 
                          initial={{ opacity: 0, y: -10 }} 
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute w-full bg-white border border-slate-200 rounded-lg mt-1 shadow-xl max-h-60 overflow-y-auto z-50"
                        >
                        {searchResults.map(med => (
                            <li 
                            key={med.id} 
                            onMouseDown={(e) => { e.preventDefault(); addMedicine(med); }}
                            className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-slate-50 flex justify-between group items-center"
                            >
                                <div>
                                    <span className="font-bold text-slate-800 flex items-center gap-2 group-hover:text-emerald-700 text-sm">
                                        {med.name}
                                        {med.isExternal && (
                                            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-semibold flex items-center gap-1">
                                                <ExternalLink className="w-3 h-3" /> Externo
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-xs text-slate-400 block">{med.presentation}</span>
                                </div>
                                <div className="text-right">
                                    {(!med.isExternal && med.stock !== undefined) && (
                                        <span className={`text-xs font-bold px-2 py-1 rounded ${med.stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                            Stock: {med.stock}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                        </motion.ul>
                    )}
                </div>
                <button 
                    type="button"
                    onClick={addManualExternal}
                    className="bg-slate-900 text-white px-4 rounded-xl hover:bg-slate-800 transition shadow-lg shadow-slate-900/20 flex items-center gap-2"
                    title="Agregar manual como externo"
                >
                    <Plus className="w-5 h-5" />
                </button>
              </div>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
            {fields.map((field: any, index) => {
                const isExternal = watch(`prescription.${index}.isExternal`);
                
                return (
                  <motion.div 
                    key={field.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    className={`p-4 rounded-xl border shadow-sm flex flex-col md:flex-row gap-4 items-start md:items-center overflow-hidden ${isExternal ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-slate-200'}`}
                  >
                    {/* NAME SECTION */}
                    <div className="w-full md:w-1/3">
                        <div className="font-bold text-slate-800 flex items-center gap-2 text-base leading-tight">
                            {isExternal && <ExternalLink className="w-4 h-4 text-amber-500 shrink-0"/>}
                            {field.name}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{isExternal ? 'Medicamento Externo' : field.presentation}</p>
                    </div>
                    
                    {/* SINGLE INPUT: INDICACIONES (Old School Style) */}
                    <div className="flex-1 w-full flex items-center gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Indicaciones / Dosis / Duración</label>
                            <input
                                type="text"
                                {...register(`prescription.${index}.dosage`, { required: true })}
                                placeholder="Ej: 1 tableta cada 8 horas..."
                                className="w-full px-3 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none text-slate-900 bg-white"
                                onBlur={() => handleCalculateRow(index)} 
                                autoComplete="off"
                            />
                            
                            {/* HIDDEN INPUTS FOR DATA CONSISTENCY */}
                            <input type="hidden" {...register(`prescription.${index}.quantity`)} />
                            <input type="hidden" {...register(`prescription.${index}.duration_days`)} />
                        </div>
                        <motion.button 
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            type="button" 
                            onClick={() => remove(index)}
                            className="p-3 mt-4 md:mt-0 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition"
                            title="Eliminar"
                        >
                            <Trash2 className="w-5 h-5" />
                        </motion.button>
                    </div>
                  </motion.div>
                );
            })}
            </AnimatePresence>
            {fields.length === 0 && (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400 text-sm">
                 Busque un medicamento para agregarlo a la receta.
              </div>
            )}
          </div>
      </div>

      <div className="border-t pt-6">
          <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                <div className="bg-yellow-500 text-white p-1.5 rounded-lg">
                    <StickyNote className="w-4 h-4"/>
                </div>
                2. Observaciones y Recomendaciones
          </h4>
          
          <div>
             <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block flex items-center gap-2">
                 <StickyNote className="w-3 h-3 text-yellow-600"/> Nota para el Paciente / Cuidados Generales (Opcional)
             </label>
             <textarea 
                rows={4}
                {...register('prescriptionNotes')} 
                placeholder="Especifique reposo, dieta, cuidados de heridas, uso de compresas, signos de alarma..."
                className="w-full text-sm bg-yellow-50/50 border border-yellow-200 rounded-xl p-4 focus:ring-2 focus:ring-yellow-400 focus:border-transparent placeholder:text-slate-400 text-yellow-900 shadow-sm resize-none"
             />
             <p className="text-[10px] text-slate-400 mt-2 ml-1">Estas observaciones aparecerán impresas en la receta médica.</p>
          </div>
      </div>
    </motion.div>
  );
};
