import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Loader2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getPlaceholderExternalMedicines,
  reanalyzeExternalMedicine,
  PlaceholderMedicine,
} from '../../services/inventoryService';
import { analyzeExternalMedicine } from '../../services/geminiService';

type ProcessState = 'idle' | 'analyzing' | 'updating' | 'done' | 'error';

interface MedicineProcess {
  med: PlaceholderMedicine;
  state: ProcessState;
  newData?: { activeIngredient: string; distributorGT: string; pharmacy: string; commercialName: string };
  errorMsg?: string;
}

const hasGeminiKey = (): boolean => {
  const env = (import.meta as any)?.env;
  return Boolean(env?.VITE_GEMINI_API_KEY || env?.VITE_API_KEY);
};

export const CleanExternalMedicines: React.FC = () => {
  const [meds, setMeds] = useState<PlaceholderMedicine[]>([]);
  const [processes, setProcesses] = useState<Map<string, MedicineProcess>>(new Map());
  const [loading, setLoading] = useState(true);
  const [globalRunning, setGlobalRunning] = useState(false);

  const loadPlaceholders = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPlaceholderExternalMedicines();
      setMeds(result);
    } catch (e) {
      console.error('Error loading placeholders:', e);
      toast.error('Error al cargar medicamentos externos con placeholders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlaceholders();
  }, [loadPlaceholders]);

  const analyzeOne = async (med: PlaceholderMedicine): Promise<MedicineProcess> => {
    try {
      if (!hasGeminiKey()) {
        return { med, state: 'error', errorMsg: 'VITE_GEMINI_API_KEY no configurada' };
      }
      const aiData = await analyzeExternalMedicine(med.name);
      const isStillPlaceholder =
        aiData.activeIngredient === 'No identificado' ||
        aiData.distributorGT === 'Desconocido' ||
        aiData.pharmacy === 'Farmacias Generales';
      if (isStillPlaceholder) {
        return { med, state: 'error', errorMsg: 'Gemini devolvió placeholders otra vez' };
      }
      return {
        med,
        state: 'updating',
        newData: {
          activeIngredient: aiData.activeIngredient || '',
          distributorGT: aiData.distributorGT || '',
          pharmacy: aiData.pharmacy || '',
          commercialName: aiData.commercialName || med.name,
        },
      };
    } catch (e: any) {
      return { med, state: 'error', errorMsg: e?.message || 'Error desconocido' };
    }
  };

  const processOne = async (med: PlaceholderMedicine) => {
    setProcesses(prev => new Map(prev).set(med.id, { med, state: 'analyzing' }));
    const analyzed = await analyzeOne(med);

    if (analyzed.state === 'error') {
      setProcesses(prev => new Map(prev).set(med.id, analyzed));
      return;
    }

    try {
      await reanalyzeExternalMedicine(med.id, analyzed.newData!);
      setProcesses(prev => new Map(prev).set(med.id, { ...analyzed, state: 'done' }));
    } catch (e: any) {
      setProcesses(prev =>
        new Map(prev).set(med.id, {
          ...analyzed,
          state: 'error',
          errorMsg: e?.message || 'Error al actualizar Firestore',
        })
      );
    }
  };

  const handleProcessOne = async (med: PlaceholderMedicine) => {
    await processOne(med);
    setMeds(prev => prev.filter(m => m.id !== med.id));
  };

  const handleProcessAll = async () => {
    if (meds.length === 0) return;
    if (!hasGeminiKey()) {
      toast.error('No hay API key de Gemini configurada');
      return;
    }
    setGlobalRunning(true);
    let okCount = 0;
    let errCount = 0;
    for (const med of [...meds]) {
      const beforeId = med.id;
      await processOne(med);
      const finalState = processes.get(beforeId)?.state;
      if (finalState === 'done') okCount++;
      else if (finalState === 'error') errCount++;
    }
    setMeds(prev => prev.filter(m => !processes.get(m.id) || processes.get(m.id)?.state !== 'done'));
    setGlobalRunning(false);
    toast.success(`Listo: ${okCount} actualizados, ${errCount} con error`);
  };

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-amber-300 bg-amber-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-amber-900 flex items-center gap-2">
            <Wand2 className="w-5 h-5" /> Re-analizar Medicamentos Externos con IA
          </h3>
          <p className="text-sm text-amber-800 mt-1">
            Medicamentos externos con datos placeholder (cuando Gemini no estaba disponible). Se vuelven a analizar con IA para obtener datos reales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPlaceholders}
            disabled={loading || globalRunning}
            className="px-3 py-2 text-sm font-bold rounded-xl bg-white text-amber-700 border border-amber-300 hover:bg-amber-50 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refrescar
          </button>
          <button
            onClick={handleProcessAll}
            disabled={loading || globalRunning || meds.length === 0}
            className="px-4 py-2 text-sm font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition flex items-center gap-1.5 disabled:opacity-50"
          >
            {globalRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {globalRunning ? 'Procesando...' : `Re-analizar todos (${meds.length})`}
          </button>
        </div>
      </div>

      <div className="p-5">
        {!hasGeminiKey() && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <strong>VITE_GEMINI_API_KEY no configurada.</strong> Agregala al archivo <code className="bg-red-100 px-1 rounded">.env</code> en la raíz del proyecto y reiniciá el dev server.
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-amber-700 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Buscando placeholders en Firestore...
          </div>
        ) : meds.length === 0 ? (
          <div className="text-center py-8 text-emerald-700 flex flex-col items-center gap-2">
            <CheckCircle2 className="w-8 h-8" />
            <p className="font-bold">No hay placeholders falsos</p>
            <p className="text-sm text-emerald-600">Todos los medicamentos externos tienen datos reales de IA.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {meds.map(med => {
                const proc = processes.get(med.id);
                return (
                  <motion.div
                    key={med.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-white border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{med.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
                        <div className="text-slate-500">
                          <span className="font-bold">Activo:</span>{' '}
                          <span className={med.activeIngredient === 'No identificado' ? 'text-rose-600' : ''}>
                            {med.activeIngredient || '—'}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          <span className="font-bold">Distribuidor:</span>{' '}
                          <span className={med.distributorGT === 'Desconocido' ? 'text-rose-600' : ''}>
                            {med.distributorGT || '—'}
                          </span>
                        </div>
                        <div className="text-slate-500">
                          <span className="font-bold">Farmacia:</span>{' '}
                          <span className={med.pharmacy === 'Farmacias Generales' ? 'text-rose-600' : ''}>
                            {med.pharmacy || '—'}
                          </span>
                        </div>
                      </div>
                      {proc && proc.state === 'done' && proc.newData && (
                        <div className="mt-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 inline mr-1" />
                          Actualizado: {proc.newData.activeIngredient} · {proc.newData.distributorGT}
                        </div>
                      )}
                      {proc && proc.state === 'error' && (
                        <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                          <XCircle className="w-3 h-3 inline mr-1" />
                          {proc.errorMsg}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleProcessOne(med)}
                      disabled={globalRunning || proc?.state === 'analyzing' || proc?.state === 'updating'}
                      className="px-3 py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      {proc?.state === 'analyzing' || proc?.state === 'updating' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      Re-analizar
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
