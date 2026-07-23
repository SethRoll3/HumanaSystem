import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { logAuditAction } from '../../services/auditService';
import { UserProfile, Consultation } from '../../../types';
import { Wand2, Link2, Unlink, Check, X, Loader2, RefreshCw, FlaskConical, AlertTriangle, FileText, Calendar, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { medicineNormalizationService, MedNormalizationRule, DuplicateCluster, detectDuplicateClusters } from '../../services/medicineNormalizationService';

interface MedicineNormalizationPageProps {
    currentUser: UserProfile;
    startDate?: number;
    endDate?: number;
}

const getGuatemalaDateStr = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });

export const MedicineNormalizationPage: React.FC<MedicineNormalizationPageProps> = ({ currentUser, startDate, endDate }) => {
    const [normRules, setNormRules] = useState<MedNormalizationRule[]>([]);
    const [duplicateClusters, setDuplicateClusters] = useState<DuplicateCluster[]>([]);
    const [normSaving, setNormSaving] = useState(false);
    const [normIgnoredClusters, setNormIgnoredClusters] = useState<string[]>([]);
    const [normManualCanonicalMap, setNormManualCanonicalMap] = useState<Record<string, string>>({});
    const [normalizationReviewed, setNormalizationReviewed] = useState(false);
    const [bitacora, setBitacora] = useState('');
    const [loading, setLoading] = useState(true);
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
        start: startDate ? getGuatemalaDateStr(new Date(startDate)) : getGuatemalaDateStr(new Date()),
        end: endDate ? getGuatemalaDateStr(new Date(endDate)) : getGuatemalaDateStr(new Date())
    });
    const [showDatePicker, setShowDatePicker] = useState(false);

    const pendingClusters = useMemo(() =>
        duplicateClusters.filter(c =>
            !c.hasRule && !normIgnoredClusters.includes(c.variants.map(v => v.name).sort().join('|'))
        ),
        [duplicateClusters, normIgnoredClusters]
    );

    const normalizationComplete = pendingClusters.length === 0 || normalizationReviewed;
    const canConfirm = bitacora.trim().length > 0 && normalizationComplete;

    const loadData = async () => {
        setLoading(true);
        try {
            const rules = await medicineNormalizationService.getRules();
            setNormRules(rules);

            const startStr = dateRange.start;
            const endStr = dateRange.end;
            const [sy, sm, sd] = startStr.split('-').map(Number);
            const [ey, em, ed] = endStr.split('-').map(Number);
            const yStart = new Date(sy, sm - 1, sd, 0, 0, 0);
            const yEnd = new Date(ey, em - 1, ed, 23, 59, 59);

            const startTs = yStart.getTime();
            const endTs = yEnd.getTime();
            const consultSnap = await getDocs(query(
                collection(db, 'consultations'),
                where('date', '>=', startTs),
                where('date', '<=', endTs)
            ));
            const allConsultations = consultSnap.docs.map(d => ({ id: d.id, ...d.data() } as Consultation));
            const todayConsultations = allConsultations.filter(c => c.status === 'finished' || c.status === 'delivered');

            const rawMedMap = new Map<string, number>();
            todayConsultations.forEach(c => {
                (c.prescription || []).forEach(item => {
                    if (item.name) {
                        rawMedMap.set(item.name, (rawMedMap.get(item.name) || 0) + (item.quantity || 1));
                    }
                });
            });

            const medNames = Array.from(rawMedMap.entries()).map(([name, count]) => ({ name, count }));
            const clusters = detectDuplicateClusters(medNames, rules);
            setDuplicateClusters(clusters);
        } catch (e) {
            console.error('Error loading normalization data:', e);
            toast.error('Error al cargar la normalización');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [dateRange]);

    const refreshNormRules = async () => {
        try {
            const rules = await medicineNormalizationService.getRules();
            setNormRules(rules);
        } catch (e) {
            console.error(e);
        }
    };

    const handleApprove = async (canonical: string, variants: string[]) => {
        setNormSaving(true);
        try {
            await medicineNormalizationService.approveCluster(canonical, variants, currentUser.email || 'resident');
            toast.success(`Normalizado: ${variants.length} variantes → "${canonical}"`);
            await refreshNormRules();
            setDuplicateClusters(prev => prev.filter(c => !c.variants.every(v => variants.includes(v.name))));
        } catch (e) {
            console.error(e);
            toast.error('Error al aprobar');
        } finally {
            setNormSaving(false);
        }
    };

    const handleReject = async (variants: string[]) => {
        setNormSaving(true);
        try {
            await medicineNormalizationService.rejectCluster(variants, currentUser.email || 'resident');
            toast.success('Duplicado descartado permanentemente');
            const newIgnored = variants.slice().sort().join('|');
            setNormIgnoredClusters(prev => [...prev, newIgnored]);
            setDuplicateClusters(prev => prev.filter(c => c.variants.map(v => v.name).sort().join('|') !== newIgnored));
            setNormalizationReviewed(true);
        } catch (e) {
            console.error(e);
            toast.error('Error al descartar');
        } finally {
            setNormSaving(false);
        }
    };

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setNormSaving(true);
        try {
            const startStr = dateRange.start;
            const summary = {
                dateKey: dateRange.start,
                startDate: dateRange.start,
                endDate: dateRange.end,
                reviewerEmail: currentUser.email,
                reviewerName: currentUser.name,
                reviewerRole: currentUser.role,
                totalCasesToday: pendingClusters.length,
                reviewedCasesCount: pendingClusters.length,
                bitacora: bitacora.trim(),
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, 'quality_reviews'), summary);
            try {
                await logAuditAction(
                    currentUser.email || 'unknown',
                    'REVISION_NORMALIZACION_MEDICAMENTOS',
                    `Residente ${currentUser.name} confirmó revisión de normalización (${pendingClusters.length} clusters) del ${dateRange.start} al ${dateRange.end}. Bitácora: ${bitacora.trim()}`
                );
            } catch (e) {
                console.warn('Audit log write failed (non-blocking):', e);
            }
            toast.success('Revisión de normalización guardada');
            setBitacora('');
            setNormalizationReviewed(false);
            await loadData();
        } catch (e) {
            console.error(e);
            toast.error('Error al guardar la revisión');
        } finally {
            setNormSaving(false);
        }
    };

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FlaskConical className="w-6 h-6 text-violet-500" />
                        Normalización de Medicamentos
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Detecta nombres de medicamentos duplicados y unifica conteos automáticamente
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                    >
                        <Calendar className="w-4 h-4" />
                        {dateRange.start} → {dateRange.end}
                        {showDatePicker ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                </div>
            </div>

            {showDatePicker && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Fecha Inicio</label>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-violet-200"
                            max={dateRange.end}
                        />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 block">Fecha Fin</label>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-violet-200"
                            min={dateRange.start}
                        />
                    </div>
                    <button
                        onClick={loadData}
                        disabled={loading}
                        className="self-end px-4 py-2 text-sm font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''} mr-1`} />
                        Cargar
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase">Reglas Aprobadas</p>
                    <h3 className="text-2xl font-bold text-emerald-700 mt-1">
                        {normRules.filter(r => r.status === 'approved').length}
                    </h3>
                </div>
                <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                    <p className="text-xs font-bold text-amber-700 uppercase">Clusters Pendientes</p>
                    <h3 className="text-2xl font-bold text-amber-800 mt-1">{pendingClusters.length}</h3>
                </div>
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase">Clusters Descartados</p>
                    <h3 className="text-2xl font-bold text-slate-700 mt-1">{normIgnoredClusters.length}</h3>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-5 border-b bg-slate-50/60 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-violet-500" /> Posibles duplicados del periodo
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Medicamentos prescritos en el rango seleccionado con nombres similares
                        </p>
                    </div>
                </div>

                <div className="p-5 space-y-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                        </div>
                    ) : pendingClusters.length === 0 ? (
                        <div className="text-center py-10">
                            <Check className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                            <p className="text-base font-bold text-slate-700">No hay duplicados pendientes</p>
                            <p className="text-sm text-slate-400 mt-1">Todos los medicamentos del periodo tienen nombres únicos.</p>
                        </div>
                    ) : (
                        pendingClusters.map((cluster, idx) => {
                            const clusterId = cluster.variants.map(v => v.name).sort().join('|');
                            const activeCanonical = normManualCanonicalMap[clusterId] || cluster.canonicalCandidate;
                            return (
                                <div key={clusterId + idx} className="border border-amber-200 bg-amber-50/30 rounded-2xl p-4">
                                    <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <p className="text-base font-bold text-slate-800 mb-2 flex items-center gap-2">
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                Posible duplicado ({cluster.variants.length} variantes, {cluster.totalCount} recetas)
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {cluster.variants.map(v => (
                                                    <button
                                                        key={v.name}
                                                        onClick={() => setNormManualCanonicalMap(prev => ({ ...prev, [clusterId]: v.name }))}
                                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-bold border cursor-pointer hover:shadow-sm transition ${v.name === activeCanonical ? 'bg-violet-100 text-violet-800 border-violet-300' : 'bg-white text-slate-600 border-slate-200'}`}
                                                    >
                                                        {v.name === activeCanonical && <Check className="w-3 h-3" />}
                                                        {v.name} <span className="text-slate-400">×{v.count}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Canónico: <strong className="text-violet-700">{activeCanonical}</strong>
                                            </p>
                                        </div>
                                        <div className="flex flex-col gap-2 shrink-0">
                                            <button
                                                disabled={normSaving}
                                                onClick={() => handleApprove(activeCanonical, cluster.variants.map(v => v.name))}
                                                className="px-3 py-2 text-sm font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                                            >
                                                <Check className="w-3 h-3" /> Aprobar
                                            </button>
                                            <button
                                                disabled={normSaving}
                                                onClick={() => handleReject(cluster.variants.map(v => v.name))}
                                                className="px-3 py-2 text-sm font-bold rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                                            >
                                                <X className="w-3 h-3" /> Descartar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="p-5 border-b bg-slate-50/60">
                    <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-500" /> Bitácora y confirmación
                    </h3>
                    <p className="text-sm text-slate-400 mt-0.5">
                        Registra lo que revisaste hoy. La confirmación requiere bitácora y que no haya clusters pendientes.
                    </p>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                            Notas de la revisión
                        </label>
                        <textarea
                            rows={3}
                            value={bitacora}
                            onChange={e => setBitacora(e.target.value)}
                            placeholder="Ejemplo: Revisé 5 clusters, aprobé 3 normalizaciones, descarté 2 falsos positivos."
                            className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-violet-200"
                        />
                    </div>
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="text-sm text-slate-600">
                            {pendingClusters.length > 0 ? (
                                <span className="text-amber-700 font-bold">
                                    {pendingClusters.length} cluster{pendingClusters.length === 1 ? '' : 's'} pendiente{pendingClusters.length === 1 ? '' : 's'}
                                </span>
                            ) : (
                                <span className="text-emerald-700 font-bold">Sin clusters pendientes</span>
                            )}
                            <span className="text-slate-400 ml-2">— rol: {currentUser.role}</span>
                        </div>
                        <button
                            onClick={handleConfirm}
                            disabled={!canConfirm || normSaving}
                            className="px-4 py-2 text-sm font-bold rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            <Check className="w-4 h-4" /> Confirmar revisión
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};