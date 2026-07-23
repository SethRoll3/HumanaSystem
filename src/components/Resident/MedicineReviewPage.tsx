import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Pill, CheckCircle2, XCircle, AlertTriangle, Filter, Search, RefreshCw,
    Eye, Loader2, X, Flag, User
} from 'lucide-react';
import { toast } from 'sonner';
import {
    PrescriptionReview, ReviewStatus,
    getPrescriptionReviews, updateReviewStatus, getReviewStats,
    COMMON_FLAGS
} from '../../services/prescriptionReviewService';
import { UserProfile } from '../../../types';

interface MedicineReviewPageProps {
    currentUser: UserProfile;
}

const STATUS_LABELS: Record<ReviewStatus, string> = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    flagged: 'Marcado',
    rejected: 'Rechazado'
};

const STATUS_COLORS: Record<ReviewStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    flagged: 'bg-orange-100 text-orange-800 border-orange-200',
    rejected: 'bg-red-100 text-red-800 border-red-200'
};

const formatDate = (timestamp: number) => {
    if (!timestamp) return '—';
    return new Date(timestamp).toLocaleDateString('es-GT', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
};

export const MedicineReviewPage: React.FC<MedicineReviewPageProps> = ({ currentUser }) => {
    const [reviews, setReviews] = useState<PrescriptionReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('pending');
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selected, setSelected] = useState<PrescriptionReview | null>(null);
    const [actionStatus, setActionStatus] = useState<ReviewStatus | null>(null);
    const [notes, setNotes] = useState('');
    const [selectedFlags, setSelectedFlags] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const filters: any = {};
            if (statusFilter !== 'all') filters.status = statusFilter;
            if (startDate) filters.startDate = startOfDay(new Date(startDate));
            if (endDate) {
                const d = new Date(endDate);
                d.setHours(23, 59, 59, 999);
                filters.endDate = d.getTime();
            }
            const data = await getPrescriptionReviews(filters);
            setReviews(data);
        } catch (e) {
            console.error('Error loading reviews:', e);
            toast.error('Error al cargar las revisiones');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, [statusFilter, startDate, endDate]);

    const stats = useMemo(() => {
        const pending = reviews.filter(r => r.status === 'pending').length;
        const approved = reviews.filter(r => r.status === 'approved').length;
        const flagged = reviews.filter(r => r.status === 'flagged').length;
        const rejected = reviews.filter(r => r.status === 'rejected').length;
        return { total: reviews.length, pending, approved, flagged, rejected };
    }, [reviews]);

    const filtered = useMemo(() => {
        if (!search.trim()) return reviews;
        const lower = search.toLowerCase();
        return reviews.filter(r =>
            r.medName.toLowerCase().includes(lower) ||
            r.patientName.toLowerCase().includes(lower) ||
            r.doctorName.toLowerCase().includes(lower)
        );
    }, [reviews, search]);

    const openReview = (r: PrescriptionReview) => {
        setSelected(r);
        setActionStatus(null);
        setNotes(r.notes || '');
        setSelectedFlags(r.flags || []);
    };

    const closeReview = () => {
        setSelected(null);
        setActionStatus(null);
        setNotes('');
        setSelectedFlags([]);
    };

    const toggleFlag = (flagId: string) => {
        setSelectedFlags(prev =>
            prev.includes(flagId) ? prev.filter(f => f !== flagId) : [...prev, flagId]
        );
    };

    const handleAction = async (status: ReviewStatus) => {
        if (!selected) return;
        setSaving(true);
        try {
            await updateReviewStatus(
                selected.id, status,
                currentUser.uid, currentUser.name,
                notes, status === 'approved' ? [] : selectedFlags
            );
            toast.success(`Medicamento ${STATUS_LABELS[status].toLowerCase()}`);
            closeReview();
            await load();
        } catch (e) {
            console.error(e);
            toast.error('Error al guardar la revisión');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Pill className="w-6 h-6 text-violet-500" />
                        Control de Calidad — Medicamentos
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        Revisa cada medicamento recetado para verificar dosis, frecuencia y disponibilidad
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase">Total</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</h3>
                </div>
                <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                    <p className="text-xs font-bold text-amber-700 uppercase">Pendientes</p>
                    <h3 className="text-2xl font-bold text-amber-800 mt-1">{stats.pending}</h3>
                </div>
                <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4">
                    <p className="text-xs font-bold text-emerald-700 uppercase">Aprobados</p>
                    <h3 className="text-2xl font-bold text-emerald-800 mt-1">{stats.approved}</h3>
                </div>
                <div className="bg-orange-50 rounded-2xl border border-orange-200 p-4">
                    <p className="text-xs font-bold text-orange-700 uppercase">Marcados</p>
                    <h3 className="text-2xl font-bold text-orange-800 mt-1">{stats.flagged}</h3>
                </div>
                <div className="bg-red-50 rounded-2xl border border-red-200 p-4">
                    <p className="text-xs font-bold text-red-700 uppercase">Rechazados</p>
                    <h3 className="text-2xl font-bold text-red-800 mt-1">{stats.rejected}</h3>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por medicamento, paciente o doctor..."
                        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-200"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as ReviewStatus | 'all')}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                >
                    <option value="all">Todos los estados</option>
                    <option value="pending">Solo pendientes</option>
                    <option value="approved">Solo aprobados</option>
                    <option value="flagged">Solo marcados</option>
                    <option value="rejected">Solo rechazados</option>
                </select>
                <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                />
                <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white"
                />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <Pill className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-base font-bold text-slate-600">No hay medicamentos para revisar</p>
                        <p className="text-sm text-slate-400 mt-1">
                            {statusFilter === 'pending'
                                ? 'Todos los medicamentos pendientes han sido revisados.'
                                : 'No se encontraron resultados con los filtros aplicados.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-bold tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="p-3">Medicamento</th>
                                    <th className="p-3">Paciente</th>
                                    <th className="p-3">Doctor</th>
                                    <th className="p-3">Fecha consulta</th>
                                    <th className="p-3">Estado</th>
                                    <th className="p-3">Revisado por</th>
                                    <th className="p-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtered.map(r => (
                                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-3">
                                            <span className="font-bold text-slate-800">{r.medName}</span>
                                        </td>
                                        <td className="p-3 text-slate-600">{r.patientName}</td>
                                        <td className="p-3 text-slate-600">{r.doctorName}</td>
                                        <td className="p-3 text-slate-500 text-xs">{formatDate(r.consultationDate)}</td>
                                        <td className="p-3">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_COLORS[r.status]}`}>
                                                {STATUS_LABELS[r.status]}
                                            </span>
                                        </td>
                                        <td className="p-3 text-xs text-slate-500">
                                            {r.reviewedByName || <span className="italic text-slate-300">—</span>}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={() => openReview(r)}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-violet-50 text-violet-700 hover:bg-violet-100 transition"
                                            >
                                                <Eye className="w-3 h-3" /> Revisar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <AnimatePresence>
                {selected && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
                        onClick={closeReview}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-pink-50 flex items-center justify-between shrink-0">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                        <Pill className="w-5 h-5 text-violet-600" />
                                        Revisar medicamento
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">{selected.medName}</p>
                                </div>
                                <button
                                    onClick={closeReview}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Paciente</p>
                                        <p className="font-bold text-slate-800 mt-1">{selected.patientName}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Doctor</p>
                                        <p className="font-bold text-slate-800 mt-1">{selected.doctorName}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Fecha</p>
                                        <p className="font-bold text-slate-800 mt-1">{formatDate(selected.consultationDate)}</p>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase">Estado actual</p>
                                        <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_COLORS[selected.status]}`}>
                                            {STATUS_LABELS[selected.status]}
                                        </span>
                                    </div>
                                </div>

                                <div className="border-t border-slate-200 pt-4">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                        Marcar con (opcional)
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {COMMON_FLAGS.map(flag => (
                                            <label key={flag.id} className="flex items-center gap-2 text-xs cursor-pointer p-2 rounded-lg hover:bg-slate-50">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedFlags.includes(flag.id)}
                                                    onChange={() => toggleFlag(flag.id)}
                                                    className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                                />
                                                <span className="text-slate-700">{flag.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                                        Notas (opcional)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        placeholder="Observaciones sobre la revisión..."
                                        className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:ring-2 focus:ring-violet-200"
                                    />
                                </div>

                                {selected.notes && selected.notes !== notes && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs">
                                        <p className="font-bold text-yellow-800 mb-1">Notas existentes:</p>
                                        <p className="text-yellow-700 italic">{selected.notes}</p>
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/40 flex flex-wrap items-center justify-end gap-2 shrink-0">
                                <button
                                    onClick={closeReview}
                                    disabled={saving}
                                    className="px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleAction('rejected')}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                                >
                                    <XCircle className="w-4 h-4" /> Rechazar
                                </button>
                                <button
                                    onClick={() => handleAction('flagged')}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-orange-600 text-white hover:bg-orange-700 transition disabled:opacity-50"
                                >
                                    <Flag className="w-4 h-4" /> Marcar
                                </button>
                                <button
                                    onClick={() => handleAction('approved')}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-4 h-4" /> Aprobar
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
