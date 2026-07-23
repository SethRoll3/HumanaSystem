
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useFormContext, useFieldArray } from 'react-hook-form';
import { Search, Plus, Trash2, Pill, ExternalLink, StickyNote, Filter, FileText, AlertTriangle, Microscope, Sparkles, Eye, Lock } from 'lucide-react';
import { getAllMedicines, saveExternalMedicine, getPathologies } from '../../services/inventoryService.ts';
import { parsePrescriptionWithAI, analyzeExternalMedicine, analyzeFollowUpIntent } from '../../services/geminiService.ts';
import { normalizeText } from '../../services/pharmacySalesService.ts';
import { suggestPathology } from '../../services/pathologySuggestion.ts';
import { Medicine, UserProfile, Pathology } from '../../../types.ts';
import { logAuditAction } from '../../services/auditService.ts';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface StepPrescriptionProps {
    currentUser: UserProfile;
}

const COMMON_MOLECULES = ['Paracetamol', 'Ibuprofeno', 'Acetaminofen', 'Aspirina', 'Diclofenaco', 'Omeprazol'];

type SearchMode = 'all' | 'molecule';

type MatchType = 'molecule' | 'name' | 'brand';

/** Determines which field the search term matched in. */
export function getMatchType(med: Medicine, term: string): MatchType | null {
    if (!term.trim()) return null;
    const lower = normalizeText(term);
    if (med.activeIngredient && normalizeText(med.activeIngredient).includes(lower)) return 'molecule';
    if (normalizeText(med.name).includes(lower)) return 'name';
    if (med.brandName && normalizeText(med.brandName).includes(lower)) return 'brand';
    return null;
}

/** Renders text with the matching substring wrapped in <mark> for highlight. */
export function highlightMatch(text: string, term: string): React.ReactNode {
    if (!term.trim() || !text) return text;
    const lower = normalizeText(term);
    const lowerText = normalizeText(text);
    const idx = lowerText.indexOf(lower);
    if (idx === -1) return text;

    // Find the matched position in the original text by walking through both
    // texts in lockstep. For each char in lowerText, find the corresponding
    // position in text (skipping whitespace, expanding accents back).
    let origIdx = 0;
    let normIdx = 0;
    while (normIdx < idx && origIdx < text.length) {
        const ch = text[origIdx];
        if (/\s/.test(ch)) {
            origIdx++;
            continue;
        }
        const normalized = normalizeText(ch);
        if (normalized.length > 0) {
            normIdx++;
        }
        origIdx++;
    }
    // origIdx is now at the position of the char that contributed to lowerText[idx].
    // But due to the off-by-one, it's actually one past. We need to back up.
    const matchedStart = Math.max(0, origIdx - 1);

    const before = text.substring(0, matchedStart);
    const matched = text.substring(matchedStart, matchedStart + term.length);
    const after = text.substring(matchedStart + term.length);
    return (
        <>
            {before}
            <mark className="bg-yellow-200 text-slate-900 px-0.5 rounded font-bold">{matched}</mark>
            {after}
        </>
    );
}

export const StepPrescription: React.FC<StepPrescriptionProps> = ({ currentUser }) => {
    const { register, control, setValue, watch, setFocus, formState: { errors } } = useFormContext();
    const { fields, prepend, remove } = useFieldArray({
        control,
        name: "prescription"
    });

    const [searchTerm, setSearchTerm] = useState('');
    const [allMedicines, setAllMedicines] = useState<Medicine[]>([]);
    const [searchResults, setSearchResults] = useState<Medicine[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [filterSource, setFilterSource] = useState<'all' | 'external' | 'inventory'>('all');
    const [searchMode, setSearchMode] = useState<SearchMode>('all');
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const dropdownPanelRef = useRef<HTMLUListElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [followUpTouched, setFollowUpTouched] = useState(false);
    const [pathologies, setPathologies] = useState<Pathology[]>([]);
    const [suggestedPathology, setSuggestedPathology] = useState<Pathology | null>(null);
    const followUpRequestText = watch('followUpRequestText');
    const followUpEstimatedDate = watch('followUpEstimatedDate');
    const followUpDays = watch('followUpDays');
    const diagnosis = watch('diagnosis');
    const noPrescriptionReasonText = watch('noPrescriptionReasonText');

    // Load all medicines and pathologies on mount
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const res = await getAllMedicines();
            setAllMedicines(res);
            setSearchResults(res);
            setLoading(false);
            try {
                const paths = await getPathologies();
                setPathologies(paths);
            } catch (e) {
                console.error('Error loading pathologies:', e);
            }
        };
        load();
    }, []);

    // Debounce pathology suggestion when diagnosis changes
    useEffect(() => {
        if (!diagnosis || !diagnosis.trim() || pathologies.length === 0) {
            setSuggestedPathology(null);
            setValue('autoSuggestedPathology', null, { shouldDirty: false });
            return;
        }
        const handle = setTimeout(async () => {
            const suggested = await suggestPathology(diagnosis, pathologies);
            setSuggestedPathology(suggested);
            setValue('autoSuggestedPathology', suggested?.name ?? null, { shouldDirty: false });
        }, 800);
        return () => clearTimeout(handle);
    }, [diagnosis, pathologies]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const container = containerRef.current;
            const dropdown = dropdownPanelRef.current;
            if (e.target instanceof Node && container && container.contains(e.target)) return;
            if (e.target instanceof Node && dropdown && dropdown.contains(e.target)) return;
            if (e.target instanceof Node) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);
    // Local filtering logic
    const performLocalSearch = (term: string, source: 'all' | 'external' | 'inventory', mode: SearchMode = searchMode) => {
        let filtered = allMedicines;

        // 1. Filter by Source
        if (source === 'external') {
            filtered = filtered.filter(m => m.isExternal);
        } else if (source === 'inventory') {
            filtered = filtered.filter(m => !m.isExternal);
        }

        // 2. Filter by Term (accent + case insensitive)
        if (term.trim()) {
            const lower = normalizeText(term);
            if (mode === 'molecule') {
                // Only search in activeIngredient
                filtered = filtered.filter(m => m.activeIngredient && normalizeText(m.activeIngredient).includes(lower));
            } else {
                // Search in name, brandName, AND molecule
                filtered = filtered.filter(m =>
                    normalizeText(m.name).includes(lower) ||
                    (m.brandName && normalizeText(m.brandName).includes(lower)) ||
                    (m.activeIngredient && normalizeText(m.activeIngredient).includes(lower))
                );
            }
        }

        setSearchResults(filtered);
        setShowDropdown(true);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearchTerm(val);
        performLocalSearch(val, filterSource, searchMode);
    };

    const handleSourceChange = (source: 'all' | 'external' | 'inventory') => {
        setFilterSource(source);
        performLocalSearch(searchTerm, source, searchMode);
    };

    const handleSearchModeChange = (mode: SearchMode) => {
        setSearchMode(mode);
        performLocalSearch(searchTerm, filterSource, mode);
    };

    const handleQuickPickMolecule = (mol: string) => {
        setSearchTerm(mol);
        setSearchMode('molecule');
        performLocalSearch(mol, filterSource, 'molecule');
    };

    const handleFocus = () => {
        performLocalSearch(searchTerm, filterSource, searchMode);
        const input = searchInputRef.current;
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setTimeout(() => {
                updateDropdownPosition();
            }, 220);
        }
    };

    const updateDropdownPosition = () => {
        const input = searchInputRef.current;
        if (!input) return;
        const rect = input.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 14;
        const isMobile = viewportWidth < 768;
        const sideGap = 12;

        // El máximo ancho que puede tener sin tocar el input:
        const availableSpaceLeft = rect.left - margin - sideGap;

        const width = isMobile
            ? Math.max(300, viewportWidth - margin * 2)
            : Math.max(250, Math.min(350, availableSpaceLeft));

        const desiredLeft = isMobile ? margin : rect.left - width - sideGap;
        const maxLeft = Math.max(margin, viewportWidth - width - margin);
        const left = Math.max(margin, Math.min(desiredLeft, maxLeft));
        const desiredTop = isMobile ? rect.bottom + 8 : rect.top;
        const maxHeightByViewport = Math.max(260, Math.min(560, Math.floor(viewportHeight * 0.62)));
        const panelHeight = Math.max(260, maxHeightByViewport);
        const maxTop = Math.max(margin, viewportHeight - panelHeight - margin);
        const top = Math.max(margin, Math.min(desiredTop, maxTop));
        setDropdownStyle({
            top,
            left,
            width,
            height: panelHeight,
            maxHeight: panelHeight
        });
    };

    useEffect(() => {
        if (!showDropdown) return;
        updateDropdownPosition();
        const onReposition = () => updateDropdownPosition();
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        return () => {
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [showDropdown, searchTerm, filterSource]);

    const addMedicine = (med: Medicine) => {
        prepend({
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
        if (!searchTerm) return;
        const medName = searchTerm;

        // CHECK: Does it exist in the current search results (exact match, case + accent insensitive)?
        const normalizedSearch = normalizeText(medName);
        const existingInSearch = searchResults.find(r => normalizeText(r.name) === normalizedSearch);

        if (existingInSearch) {
            // If found, treat as selecting existing (no new AI call, no new DB entry)
            addMedicine(existingInSearch);
            return;
        }

        setSearchTerm('');
        setShowDropdown(false);

        prepend({
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

            // Refresh list to include new external med
            const updatedMeds = await getAllMedicines();
            setAllMedicines(updatedMeds);

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
            if (result) {
                setValue(`prescription.${index}.quantity`, result.quantity);
                setValue(`prescription.${index}.duration_days`, result.duration);
            }
        } catch (e) {
            // Fallback handled in service
        }
    };

    const handleFollowUpBlur = async (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            setValue('followUpRequired', false);
            setValue('followUpDays', undefined);
            setValue('followUpEstimatedDate', undefined);
            return;
        }
        try {
            const analysis = await analyzeFollowUpIntent(trimmed);
            if (analysis.hasFollowUp && analysis.days && analysis.days > 0) {
                const baseDate = new Date();
                const estimatedDate = new Date(baseDate.getTime() + analysis.days * 24 * 60 * 60 * 1000);
                setValue('followUpRequired', true);
                setValue('followUpDays', analysis.days);
                setValue('followUpEstimatedDate', estimatedDate.getTime());
            } else {
                setValue('followUpRequired', false);
                setValue('followUpDays', undefined);
                setValue('followUpEstimatedDate', undefined);
            }
        } catch (e) {
            setValue('followUpRequired', false);
            setValue('followUpDays', undefined);
            setValue('followUpEstimatedDate', undefined);
        }
    };

    const goToField = (field: 'diagnosis' | 'followUpRequestText' | 'noPrescriptionReasonText') => {
        const elementId = field === 'diagnosis' ? 'diagnosis-input' : field === 'followUpRequestText' ? 'follow-up-request-input' : 'no-prescription-reason-input';
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (field === 'followUpRequestText') {
            setFollowUpTouched(true);
        }
        setTimeout(() => setFocus(field), 120);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="space-y-8 pb-10">

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-slate-600 text-xs font-bold uppercase tracking-wider">
                    <Eye className="w-4 h-4" /> Código de colores:
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
                        <Eye className="w-3 h-3" /> Amarillo
                    </span>
                    <span className="text-xs text-slate-600">Visible para el paciente (receta, PDF)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        <Lock className="w-3 h-3" /> Azul
                    </span>
                    <span className="text-xs text-slate-600">Interno (no se muestra al paciente)</span>
                </div>
            </div>

            {/* 0. DIAGNÓSTICO MÉDICO - MANDATORY */}
            <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <div className="bg-slate-900 text-white p-1.5 rounded-lg">
                        <FileText className="w-4 h-4" />
                    </div>
                    <span className="bg-white text-slate-800 px-2 py-0.5 rounded-lg border border-slate-200">1. Diagnóstico Médico</span>
                </h4>

                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block">
                        Resumen de diagnóstico (Obligatorio)
                    </label>
                    <textarea
                        id="diagnosis-input"
                        rows={3}
                        {...register('diagnosis', { required: true })}
                        placeholder="Escriba el diagnóstico principal de la consulta..."
                        className={`w-full text-sm bg-white border rounded-xl p-4 focus:ring-2 focus:border-transparent placeholder:text-slate-400 text-slate-900 shadow-sm resize-none ${errors.diagnosis ? 'border-red-300 focus:ring-red-200' : 'border-slate-300 focus:ring-emerald-500'}`}
                    />
                    {errors.diagnosis && (
                        <p className="text-[10px] text-red-500 mt-1 font-bold">Este campo es obligatorio para finalizar la consulta.</p>
                    )}
                    {diagnosis && diagnosis.trim() && (
                        <div className="mt-2 flex items-center gap-2">
                            {suggestedPathology ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                                    <Sparkles className="w-3 h-3" />
                                    Patología detectada: <strong>{suggestedPathology.name}</strong>
                                    <span className="text-emerald-600 font-normal">(se auto-seleccionará en el siguiente paso)</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-[11px] font-medium">
                                    <Microscope className="w-3 h-3" />
                                    Sin patología detectada — selecciona manualmente si aplica
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-6 bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5">
                <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <div className="bg-emerald-600 text-white p-1.5 rounded-lg ring-2 ring-emerald-300 ring-offset-2 ring-offset-emerald-50 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]">
                        <Pill className="w-4 h-4" />
                    </div>
                    <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-lg border border-emerald-200">2. Receta de Medicamentos</span>
                </h4>

                <div className="relative z-20 space-y-3" ref={containerRef}>
                    {/* FILTROS DE ORIGEN */}
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                        <button
                            type="button"
                            onClick={() => handleSourceChange('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterSource === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Todos
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSourceChange('inventory')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterSource === 'inventory' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Pill className="w-3 h-3" /> Farmacia
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSourceChange('external')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${filterSource === 'external' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <ExternalLink className="w-3 h-3" /> Externos
                        </button>
                    </div>

                    {/* MODO DE BÚSQUEDA: TODO vs SOLO MOLÉCULA */}
                    <div className="flex items-center gap-2 p-1 bg-violet-50 rounded-xl w-fit border border-violet-100">
                        <button
                            type="button"
                            onClick={() => handleSearchModeChange('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${searchMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Buscar por nombre, marca O molécula"
                        >
                            🔍 Todo
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSearchModeChange('molecule')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${searchMode === 'molecule' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            title="Buscar SOLO por principio activo (molécula)"
                        >
                            🧪 Solo molécula
                        </button>
                    </div>

                    {/* QUICK-PICK: MOLÉCULAS COMUNES */}
                    <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest self-center mr-1">Rápido:</span>
                        {COMMON_MOLECULES.map(mol => (
                            <button
                                key={mol}
                                type="button"
                                onClick={() => handleQuickPickMolecule(mol)}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 hover:bg-violet-100 text-slate-600 hover:text-violet-700 font-semibold border border-transparent hover:border-violet-200 transition-colors"
                                title={`Buscar productos con ${mol}`}
                            >
                                {mol}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={handleSearchChange}
                                onFocus={handleFocus}
                                disabled={loading}
                                placeholder={loading ? "Cargando catálogo..." : (searchMode === 'molecule' ? "Buscar SOLO por principio activo..." : "Buscar por nombre, marca o principio activo...")}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm bg-white text-slate-900 text-sm md:text-base disabled:bg-slate-50 disabled:text-slate-400"
                                autoComplete="off"
                            />
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
                <AnimatePresence>
                    {showDropdown && (
                        <motion.ul
                            ref={dropdownPanelRef}
                            style={dropdownStyle}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="fixed bg-white border border-slate-200 rounded-xl shadow-2xl overflow-y-auto z-[120] [scrollbar-width:auto] [scrollbar-color:#94a3b8_#e2e8f0] [&::-webkit-scrollbar]:w-4 [&::-webkit-scrollbar-track]:bg-slate-200 [&::-webkit-scrollbar-thumb]:bg-slate-500 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-200"
                        >
                            {searchResults.length > 0 ? searchResults.map(med => {
                                const matchType = getMatchType(med, searchTerm);
                                return (
                                    <li
                                        key={med.id}
                                        onMouseDown={(e) => { e.preventDefault(); addMedicine(med); }}
                                        className="p-3 hover:bg-emerald-50 cursor-pointer border-b border-slate-50 flex justify-between group items-center"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <span className="font-bold text-slate-800 flex items-center gap-2 group-hover:text-emerald-700 text-sm flex-wrap">
                                                <span>{highlightMatch(med.name, searchTerm)}</span>
                                                {matchType === 'molecule' && (
                                                    <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full border border-violet-200 font-semibold flex items-center gap-1" title="Coincidencia por molécula">
                                                        🧪 Molécula
                                                    </span>
                                                )}
                                                {matchType === 'name' && (
                                                    <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold flex items-center gap-1" title="Coincidencia por nombre">
                                                        💊 Nombre
                                                    </span>
                                                )}
                                                {matchType === 'brand' && (
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-semibold flex items-center gap-1" title="Coincidencia por marca">
                                                        🏷️ Marca
                                                    </span>
                                                )}
                                                {med.isExternal && (
                                                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 font-semibold flex items-center gap-1">
                                                        <ExternalLink className="w-3 h-3" /> Externo
                                                    </span>
                                                )}
                                            </span>
                                            <span className="text-xs text-slate-500 block">
                                                {med.presentation}
                                                {med.brandName && (
                                                    <> • Marca: <span className={matchType === 'brand' ? 'bg-blue-50 font-semibold' : ''}>{highlightMatch(med.brandName, searchTerm)}</span></>
                                                )}
                                                {med.activeIngredient && (
                                                    <> • Principio activo: <span className={matchType === 'molecule' ? 'bg-violet-50 font-semibold text-violet-700' : ''}>{highlightMatch(med.activeIngredient, searchTerm)}</span></>
                                                )}
                                            </span>
                                        </div>
                                        <div className="text-right shrink-0 ml-2">
                                            {(!med.isExternal && med.stock !== undefined) && (
                                                <span className={`text-xs font-bold px-2 py-1 rounded ${med.stock > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    Stock: {med.stock}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                );
                            }) : (
                                <li className="p-4 text-center text-slate-400 italic text-sm">
                                    {searchMode === 'molecule'
                                        ? 'No se encontraron medicamentos con esa molécula. Intenta con otro nombre de molécula o cambia a modo "Todo".'
                                        : 'No se encontraron medicamentos con ese criterio.'}
                                </li>
                            )}
                        </motion.ul>
                    )}
                </AnimatePresence>

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
                                            {isExternal && <ExternalLink className="w-4 h-4 text-amber-500 shrink-0" />}
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
                        <div className="p-6 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50/30 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-blue-800 font-bold">
                                    <AlertTriangle className="w-5 h-5" />
                                    Sin medicamentos recetados
                                </div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase tracking-wider">
                                    <Lock className="w-3 h-3" /> Interno
                                </span>
                            </div>
                            <p className="text-sm text-slate-600">
                                Como no se han agregado medicamentos a la receta, es obligatorio indicar el motivo.
                            </p>
                            <textarea
                                id="no-prescription-reason-input"
                                {...register('noPrescriptionReasonText')}
                                rows={2}
                                placeholder="Ej: Se remite a especialista, alta médica, el paciente ya cuenta con medicación..."
                                className="w-full text-sm bg-blue-50/50 border border-blue-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder:text-blue-300 text-blue-900 shadow-sm resize-none"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t pt-6">
                <h4 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <div className="bg-yellow-500 text-white p-1.5 rounded-lg">
                        <StickyNote className="w-4 h-4" />
                    </div>
                    2. Observaciones y Recomendaciones
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200 uppercase tracking-wider ml-auto">
                        <Eye className="w-3 h-3" /> Visible para el paciente
                    </span>
                </h4>

                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block flex items-center gap-2">
                        <StickyNote className="w-3 h-3 text-yellow-600" /> Nota para el Paciente / Cuidados Generales (Opcional)
                    </label>
                    <textarea
                        rows={4}
                        {...register('prescriptionNotes')}
                        placeholder="Especifique reposo, dieta, cuidados de heridas, uso de compresas, signos de alarma..."
                        className="w-full text-sm bg-yellow-50/50 border border-yellow-200 rounded-xl p-4 focus:ring-2 focus:ring-yellow-400 focus:border-transparent placeholder:text-slate-400 text-yellow-900 shadow-sm resize-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-2 ml-1">Estas observaciones aparecerán impresas en la receta médica (color amarillo = visible para el paciente).</p>
                </div>

                <div className="mt-5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block flex items-center gap-2">
                        <StickyNote className="w-3 h-3 text-yellow-600" /> Reconsulta / Próxima cita
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200 uppercase tracking-wider">
                            <Eye className="w-2.5 h-2.5" /> Visible para el paciente
                        </span>
                    </label>
                    <input
                        id="follow-up-request-input"
                        type="text"
                        {...register('followUpRequestText', { required: true })}
                        placeholder='Ej: Reconsulta en 2 semanas, en 6 meses, verlo en 10 días...'
                        className={`w-full text-sm bg-yellow-50/50 border rounded-xl p-3 focus:ring-2 focus:border-transparent placeholder:text-slate-400 text-yellow-900 shadow-sm ${followUpTouched && !followUpRequestText?.trim()
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-yellow-200 focus:ring-yellow-200'
                            }`}
                        onBlur={(e) => {
                            setFollowUpTouched(true);
                            handleFollowUpBlur(e.target.value);
                        }}
                    />
                    {followUpTouched && !followUpRequestText?.trim() && (
                        <p className="text-[10px] text-red-500 mt-1 font-bold">La reconsulta / próxima cita es obligatoria.</p>
                    )}
                    {followUpEstimatedDate && (
                        <p className="text-[10px] text-slate-400 mt-2 ml-1">
                            Fecha estimada: {new Date(followUpEstimatedDate).toLocaleDateString('es-GT')} {followUpDays ? `(aprox. ${followUpDays} días)` : ''}
                        </p>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
