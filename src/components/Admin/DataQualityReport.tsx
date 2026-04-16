
import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, Timestamp, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { logAuditAction } from '../../services/auditService';
import { UserProfile, Patient } from '../../types';
import { ShieldCheck, AlertTriangle, Users, CheckCircle2, Loader2, Eye, Save } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface DataQualityReportProps {
    isOpen: boolean;
    onConfirm: () => void;
    currentUser: UserProfile;
}

interface QualityAlert {
    patient: Patient;
    missingFields: string[];
    severity: 'high' | 'medium' | 'low';
}

interface DailySummary {
    totalCasesToday: number;
    criticalToday: number;
    alertToday: number;
    reviewedToday: number;
}

const TODAY_START = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
};

const TODAY_END = () => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
};

export const DataQualityReport: React.FC<DataQualityReportProps> = ({ isOpen, onConfirm, currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [qualityAlerts, setQualityAlerts] = useState<QualityAlert[]>([]);
    const [selectedAlert, setSelectedAlert] = useState<QualityAlert | null>(null);
    const [savingCase, setSavingCase] = useState(false);
    const [bitacora, setBitacora] = useState('');
    const [reviewedCaseIds, setReviewedCaseIds] = useState<string[]>([]);
    const [editForm, setEditForm] = useState({
        fullName: '',
        dpi: '',
        billingCode: '',
        phone: '',
        gender: '',
        referralChannel: '',
        birthDate: '',
        age: '',
        department: ''
    });
    const [summary, setSummary] = useState<DailySummary>({
        totalCasesToday: 0,
        criticalToday: 0,
        alertToday: 0,
        reviewedToday: 0,
    });

    useEffect(() => {
        if (!isOpen) return;
        loadReportData();
    }, [isOpen]);

    const loadReportData = async () => {
        setLoading(true);
        try {
            const yStart = TODAY_START();
            const yEnd = TODAY_END();

            const patientsSnap = await getDocs(query(
                collection(db, 'patients'),
                where('createdAt', '>=', Timestamp.fromDate(yStart)),
                where('createdAt', '<=', Timestamp.fromDate(yEnd))
            ));
            const patients = patientsSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Patient))
                .filter(p => (p as any).isActive !== false);

            const alerts: QualityAlert[] = [];
            for (const p of patients) {
                const missing: string[] = [];
                if (!p.dpi) missing.push('DPI');
                if (!p.billingCode) missing.push('Código Facturación');
                if (!p.phone) missing.push('Teléfono');
                if (!p.gender) missing.push('Género');
                if (!p.referralChannel) missing.push('Canal Referencia');
                if (!p.age && !p.birthDate) missing.push('Edad/Fecha Nac.');
                if (!p.address?.department) missing.push('Dirección');

                if (missing.length > 0) {
                    const severity = missing.length >= 5 ? 'high' : missing.length >= 3 ? 'medium' : 'low';
                    alerts.push({ patient: p, missingFields: missing, severity });
                }
            }
            const severityOrder = { high: 0, medium: 1, low: 2 };
            alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
            setQualityAlerts(alerts);

            setSummary({
                totalCasesToday: patients.length,
                criticalToday: alerts.filter(a => a.severity === 'high').length,
                alertToday: alerts.filter(a => a.severity === 'medium').length,
                reviewedToday: reviewedCaseIds.length,
            });
        } catch (error) {
            console.error('Error loading quality report:', error);
        } finally {
            setLoading(false);
        }
    };

    const openCase = (alert: QualityAlert) => {
        setSelectedAlert(alert);
        setReviewedCaseIds(prev => {
            const id = alert.patient.id;
            if (!id || prev.includes(id)) return prev;
            return [...prev, id];
        });
        setEditForm({
            fullName: alert.patient.fullName || '',
            dpi: alert.patient.dpi || '',
            billingCode: alert.patient.billingCode || '',
            phone: alert.patient.phone || '',
            gender: alert.patient.gender || '',
            referralChannel: alert.patient.referralChannel || '',
            birthDate: alert.patient.birthDate || '',
            age: alert.patient.age ? String(alert.patient.age) : '',
            department: alert.patient.address?.department || ''
        });
    };

    const handleSavePatient = async () => {
        if (!selectedAlert?.patient?.id) return;
        setSavingCase(true);
        try {
            const patientRef = doc(db, 'patients', selectedAlert.patient.id);
            await updateDoc(patientRef, {
                fullName: editForm.fullName.trim(),
                dpi: editForm.dpi.trim(),
                billingCode: editForm.billingCode.trim(),
                phone: editForm.phone.trim(),
                gender: editForm.gender || null,
                referralChannel: editForm.referralChannel.trim(),
                birthDate: editForm.birthDate || null,
                age: editForm.age ? Number(editForm.age) : null,
                'address.department': editForm.department.trim(),
            });
            toast.success('Caso actualizado');
            await loadReportData();
        } catch (error) {
            console.error('Error saving patient quality review data', error);
            toast.error('No se pudo guardar el caso');
        } finally {
            setSavingCase(false);
        }
    };

    const handleConfirm = async () => {
        const bitacoraText = bitacora.trim();
        if (!bitacoraText) {
            toast.error('Debes registrar la bitácora diaria');
            return;
        }

        setConfirming(true);

        try {
            const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
            localStorage.setItem(`qualityReport_lastReviewed`, todayStr);
            localStorage.setItem(`qualityReport_lastReviewedBy`, currentUser.email || currentUser.name);

            const alertCount = qualityAlerts.length;
            const highCount = qualityAlerts.filter(a => a.severity === 'high').length;
            const mediumCount = qualityAlerts.filter(a => a.severity === 'medium').length;
            const payload = {
                dateKey: todayStr,
                reviewerEmail: currentUser.email || '',
                reviewerName: currentUser.name || '',
                totalCasesToday: summary.totalCasesToday,
                criticalToday: highCount,
                alertToday: mediumCount,
                reviewedCaseIds,
                reviewedCasesCount: reviewedCaseIds.length,
                bitacora: bitacoraText,
                createdAt: serverTimestamp()
            };

            let persisted = true;
            try {
                await addDoc(collection(db, 'quality_reviews'), payload);
            } catch (error) {
                persisted = false;
                localStorage.setItem(`qualityReport_pending_${todayStr}`, JSON.stringify({
                    ...payload,
                    createdAt: Date.now()
                }));
                console.error('Error saving quality review in Firestore:', error);
            }

            await logAuditAction(
                currentUser.email || 'admin@humana.com',
                'REVISION_CALIDAD_DATOS',
                `${currentUser.name} revisó calidad del día. Casos del día: ${summary.totalCasesToday}. Alertas: ${alertCount} (${highCount} críticos, ${mediumCount} alerta). Revisados manualmente: ${reviewedCaseIds.length}. Bitácora: ${bitacoraText}`
            );

            if (persisted) {
                toast.success('Revisión registrada correctamente');
            } else {
                toast.warning('No se pudo guardar en servidor, pero se marcó la revisión localmente');
            }

            onConfirm();
        } catch (error) {
            console.error('Error confirming quality report:', error);
            toast.error('No se pudo confirmar la revisión');
        } finally {
            setConfirming(false);
        }
    };

    if (!isOpen) return null;

    const severityColors = {
        high: 'bg-red-50 border-l-red-500 text-red-800',
        medium: 'bg-amber-50 border-l-amber-500 text-amber-800',
        low: 'bg-blue-50 border-l-blue-500 text-blue-800',
    };

    const severityLabels = {
        high: 'CRÍTICO',
        medium: 'MEDIO',
        low: 'BAJO',
    };

    const severityBadges = {
        high: 'bg-red-100 text-red-700 border-red-200',
        medium: 'bg-amber-100 text-amber-700 border-amber-200',
        low: 'bg-blue-100 text-blue-700 border-blue-200',
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-lg z-[9999] flex items-center justify-center p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl flex flex-col max-h-[95vh] overflow-hidden"
            >
                <div className="p-6 md:p-8 border-b bg-gradient-to-r from-slate-900 to-slate-800 text-white shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/10 rounded-2xl">
                            <ShieldCheck className="w-7 h-7" />
                        </div>
                        <div>
                            <h2 className="text-xl md:text-2xl font-bold">Reporte Diario de Calidad de Datos</h2>
                            <p className="text-sm text-slate-300 mt-1">
                                Revisión obligatoria — {new Date().toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-8 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
                            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Analizando datos del sistema...</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <Users className="w-4 h-4" /> Indicadores clave del día
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-3">
                                            <Users className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{summary.totalCasesToday}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Casos Ingresados</p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-3">
                                            <AlertTriangle className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{summary.criticalToday}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Críticos</p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mb-3">
                                            <AlertTriangle className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{summary.alertToday}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Alertas</p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                                            <CheckCircle2 className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{reviewedCaseIds.length}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Revisados</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Casos con estado crítico o alerta
                                    <span className="ml-auto px-3 py-1 bg-slate-200 text-slate-700 rounded-full text-xs font-bold">{qualityAlerts.length} pacientes</span>
                                </h3>
                                {qualityAlerts.length === 0 ? (
                                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
                                        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                                        <p className="text-emerald-700 font-bold">¡Todos los pacientes tienen datos completos!</p>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                        <div className="max-h-80 overflow-y-auto custom-scrollbar">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-100 text-[10px] text-slate-500 uppercase font-bold tracking-widest sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-3 pl-5">Severidad</th>
                                                        <th className="p-3">Paciente</th>
                                                        <th className="p-3">Campos Faltantes</th>
                                                        <th className="p-3">Revisión</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {qualityAlerts.map((alert, idx) => (
                                                        <tr key={alert.patient.id || idx} className={`border-l-4 ${severityColors[alert.severity]} hover:bg-opacity-80 transition`}>
                                                            <td className="p-3 pl-5">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${severityBadges[alert.severity]}`}>
                                                                    {severityLabels[alert.severity]}
                                                                </span>
                                                            </td>
                                                            <td className="p-3">
                                                                <p className="font-bold text-sm text-slate-800">{alert.patient.fullName || 'Sin nombre'}</p>
                                                                <p className="text-[10px] text-slate-400 font-mono">{alert.patient.id?.substring(0, 8)}...</p>
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {alert.missingFields.map(f => (
                                                                        <span key={f} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">{f}</span>
                                                                    ))}
                                                                </div>
                                                            </td>
                                                            <td className="p-3">
                                                                <button
                                                                    onClick={() => openCase(alert)}
                                                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                                                                >
                                                                    <Eye className="w-3 h-3" />
                                                                    Ver caso
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Log y bitácora diaria</h3>
                                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                    <p className="text-xs text-slate-500 mb-3">Registra qué revisaste hoy y observaciones.</p>
                                    <textarea
                                        value={bitacora}
                                        onChange={(e) => setBitacora(e.target.value)}
                                        className="w-full min-h-[100px] rounded-xl border border-slate-300 p-3 text-sm text-slate-700"
                                        placeholder="Ejemplo: Revisé 8 casos, corregí DPI/teléfono en 3, dejé pendientes 2 críticos por confirmar con expediente."
                                    />
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 md:p-8 border-t bg-white shrink-0">
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="flex-1 text-center md:text-left">
                            <p className="text-xs text-slate-400">
                                Al confirmar, se registra evidencia diaria de revisión con bitácora y casos revisados por <strong className="text-slate-600">{currentUser.name}</strong>.
                            </p>
                        </div>
                        <button
                            onClick={handleConfirm}
                            disabled={loading || confirming}
                            className="w-full md:w-auto px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 shadow-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {confirming ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-5 h-5" />
                            )}
                            He Revisado el Reporte de Calidad
                        </button>
                    </div>
                </div>

                {selectedAlert && (
                    <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center p-4">
                        <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between">
                                <h4 className="font-bold text-slate-800">Revisión de caso</h4>
                                <button className="text-xs font-bold text-slate-500" onClick={() => setSelectedAlert(null)}>Cerrar</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input className="rounded-xl border border-slate-300 p-3 text-sm" placeholder="Nombre" value={editForm.fullName} onChange={e => setEditForm(prev => ({ ...prev, fullName: e.target.value }))} />
                                <input className="rounded-xl border border-slate-300 p-3 text-sm" placeholder="DPI" value={editForm.dpi} onChange={e => setEditForm(prev => ({ ...prev, dpi: e.target.value }))} />
                                <input className="rounded-xl border border-slate-300 p-3 text-sm" placeholder="Código facturación" value={editForm.billingCode} onChange={e => setEditForm(prev => ({ ...prev, billingCode: e.target.value }))} />
                                <input className="rounded-xl border border-slate-300 p-3 text-sm" placeholder="Teléfono" value={editForm.phone} onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))} />
                                <select className="rounded-xl border border-slate-300 p-3 text-sm" value={editForm.gender} onChange={e => setEditForm(prev => ({ ...prev, gender: e.target.value }))}>
                                    <option value="">Género</option>
                                    <option value="M">Masculino</option>
                                    <option value="F">Femenino</option>
                                </select>
                                <input className="rounded-xl border border-slate-300 p-3 text-sm" placeholder="Canal de referencia" value={editForm.referralChannel} onChange={e => setEditForm(prev => ({ ...prev, referralChannel: e.target.value }))} />
                                <input type="date" className="rounded-xl border border-slate-300 p-3 text-sm" value={editForm.birthDate} onChange={e => setEditForm(prev => ({ ...prev, birthDate: e.target.value }))} />
                                <input className="rounded-xl border border-slate-300 p-3 text-sm" placeholder="Edad" value={editForm.age} onChange={e => setEditForm(prev => ({ ...prev, age: e.target.value }))} />
                                <input className="rounded-xl border border-slate-300 p-3 text-sm md:col-span-2" placeholder="Departamento" value={editForm.department} onChange={e => setEditForm(prev => ({ ...prev, department: e.target.value }))} />
                            </div>
                            <div className="flex justify-between items-center">
                                <div className="flex flex-wrap gap-1">
                                    {selectedAlert.missingFields.map(field => (
                                        <span key={field} className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-bold">{field}</span>
                                    ))}
                                </div>
                                <button
                                    onClick={handleSavePatient}
                                    disabled={savingCase}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60"
                                >
                                    {savingCase ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar cambios
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </div>
    );
};
