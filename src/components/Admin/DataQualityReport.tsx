import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, Timestamp, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { logAuditAction } from '../../services/auditService';
import { UserProfile, Patient } from '../../types';
import { ShieldCheck, AlertTriangle, CheckCircle2, Loader2, Eye, Users as UsersIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface DataQualityReportProps {
    isOpen: boolean;
    onConfirm: () => void;
    currentUser: UserProfile;
    startDate?: number;
    endDate?: number;
}

interface QualityAlert {
    patient: Patient;
    missingFields: string[];
    missingResponsibleFields: string[];
    severity: 'high' | 'medium' | 'low';
}

interface DailySummary {
    totalAppointments: number;
    arrivedToday: number;
    noShowsToday: number;
    cancelledToday: number;
    criticalToday: number;
    alertToday: number;
    reviewedToday: number;
}


export const DataQualityReport: React.FC<DataQualityReportProps> = ({ isOpen, onConfirm, currentUser, startDate, endDate }) => {
    const [loading, setLoading] = useState(true);
    const [confirming, setConfirming] = useState(false);
    const [qualityAlerts, setQualityAlerts] = useState<QualityAlert[]>([]);
    const [bitacora, setBitacora] = useState('');
    const [reviewedCaseIds, setReviewedCaseIds] = useState<string[]>([]);
    const [summary, setSummary] = useState<DailySummary>({
        totalAppointments: 0,
        arrivedToday: 0,
        noShowsToday: 0,
        cancelledToday: 0,
        criticalToday: 0,
        alertToday: 0,
        reviewedToday: 0,
    });

    useEffect(() => {
        if (!isOpen) return;
        loadReportData();
        const safetyTimeout = setTimeout(() => {
            setLoading(false);
            toast.warning('La carga está tardando más de lo esperado.');
        }, 15000);
        return () => clearTimeout(safetyTimeout);
    }, [isOpen, startDate, endDate]);

    const loadReportData = async () => {
        setLoading(true);
        try {
            const effectiveStart = startDate ? new Date(startDate) : new Date();
            const effectiveEnd = endDate ? new Date(endDate) : new Date();
            effectiveStart.setHours(0, 0, 0, 0);
            effectiveEnd.setHours(23, 59, 59, 999);

            const appointmentsSnap = await getDocs(query(
                collection(db, 'appointments'),
                where('date', '>=', Timestamp.fromDate(effectiveStart)),
                where('date', '<=', Timestamp.fromDate(effectiveEnd))
            ));

            const appointments = appointmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

            const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));

            let patients: Patient[] = [];
            if (patientIds.length > 0) {
                const chunks: string[][] = [];
                for (let i = 0; i < patientIds.length; i += 30) {
                    chunks.push(patientIds.slice(i, i + 30));
                }

                const patientsData = await Promise.all(chunks.map(chunk =>
                    getDocs(query(collection(db, 'patients'), where('__name__', 'in', chunk)))
                ));

                patients = patientsData.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
            }

            const alerts: QualityAlert[] = [];
            for (const p of patients) {
                const missing: string[] = [];
                const missingResp: string[] = [];

                if (!p.dpi) missing.push('DPI');
                if (!p.billingCode) missing.push('Código Facturación');
                if (!p.phone) missing.push('Teléfono');
                if (!p.gender) missing.push('Género');
                if (!p.referralChannel) missing.push('Canal Referencia');
                if (!p.age && !p.birthDate) missing.push('Edad/Fecha Nac.');
                if (!p.address?.department) missing.push('Dirección');

                const isSelfResp = p.responsibleName === 'No hay'
                    || (p as any).isSelfResponsible === true
                    || !p.responsibleName;

                if (!isSelfResp) {
                    if (!p.responsibleName) missingResp.push('Nombre Responsable');
                    if (!p.responsiblePhone) missingResp.push('Tel. Responsable');
                }

                if (missing.length > 0 || missingResp.length > 0) {
                    const totalMissing = missing.length + missingResp.length;
                    const severity = totalMissing >= 5 ? 'high' : totalMissing >= 3 ? 'medium' : 'low';
                    alerts.push({ patient: p, missingFields: missing, missingResponsibleFields: missingResp, severity });
                }
            }

            const severityOrder = { high: 0, medium: 1, low: 2 };
            alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
            setQualityAlerts(alerts);

            setSummary({
                totalAppointments: appointments.length,
                arrivedToday: appointments.filter(a => a.status === 'arrived' || a.status === 'completed' || a.status === 'in_consultation').length,
                noShowsToday: appointments.filter(a => a.status === 'no_show').length,
                cancelledToday: appointments.filter(a => a.status === 'cancelled').length,
                criticalToday: alerts.filter(a => a.severity === 'high').length,
                alertToday: alerts.filter(a => a.severity === 'medium').length,
                reviewedToday: reviewedCaseIds.length,
            });
        } catch (error) {
            console.error('Error loading quality report:', error);
            toast.error('Error al cargar datos. Verifica tu conexión y permisos.');
        } finally {
            setLoading(false);
        }
    };

    const canConfirm = bitacora.trim().length > 0;

    const openCase = (alert: QualityAlert) => {
        setReviewedCaseIds(prev => {
            const id = alert.patient.id;
            if (!id || prev.includes(id)) return prev;
            return [...prev, id];
        });
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
                totalCasesToday: qualityAlerts.length,
                criticalToday: qualityAlerts.filter(a => a.severity === 'high').length,
                alertToday: qualityAlerts.filter(a => a.severity === 'medium').length,
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
                `${currentUser.name} revisó calidad del día. Citas del día: ${qualityAlerts.length}. Alertas: ${qualityAlerts.filter(a => a.severity === 'high').length} críticos, ${qualityAlerts.filter(a => a.severity === 'medium').length} alerta. Revisados manualmente: ${reviewedCaseIds.length}. Bitácora: ${bitacora.trim()}`
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

    if (!isOpen) return null;

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
                        <div className="space-y-8">
                            {/* PACIENTES */}
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <UsersIcon className="w-4 h-4" /> Indicadores clave del día
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 text-center">
                                            <div className="w-10 h-10 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <UsersIcon className="w-5 h-5 text-brand-500" />
                                            </div>
                                            <div className="text-2xl font-bold text-slate-800">{summary.totalAppointments}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Citas Agendadas</div>
                                        </motion.div>

                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 text-center">
                                            <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <AlertTriangle className="w-5 h-5 text-red-500" />
                                            </div>
                                            <div className="text-2xl font-bold text-red-600">{summary.criticalToday}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Críticos</div>
                                        </motion.div>

                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 text-center">
                                            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <AlertTriangle className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div className="text-2xl font-bold text-amber-600">{summary.alertToday}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Alertas</div>
                                        </motion.div>

                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 text-center">
                                            <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div className="text-2xl font-bold text-emerald-600">{summary.arrivedToday}</div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pacientes en Clínica</div>
                                        </motion.div>
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
                                                        <th className="p-3">Resp. Llenado</th>
                                                        <th className="p-3">Datos Contacto</th>
                                                        <th className="p-3">Faltantes (Paciente)</th>
                                                        <th className="p-3">Faltantes (Resp/Emerg)</th>
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
                                                                <p className="font-bold text-xs text-slate-700">{alert.patient.creatorName || 'N/D'}</p>
                                                                <p className="text-[10px] text-slate-400">{alert.patient.createdByEmail || ''}</p>
                                                            </td>
                                                            <td className="p-3">
                                                                {alert.patient.responsibleName === 'No hay' ? (
                                                                    <>
                                                                        <p className="text-xs font-bold text-brand-600">Emergencia: {alert.patient.emergencyContactName || 'N/D'}</p>
                                                                        <p className="text-[10px] text-slate-500">{alert.patient.emergencyContactPhone || 'N/D'}</p>
                                                                    </>
                                    ) : (
                                        <>
                                            <p className="text-xs font-bold text-slate-700">Responsable: {alert.patient.responsibleName || 'N/D'}</p>
                                            <p className="text-[10px] text-slate-500">{alert.patient.responsiblePhone || 'N/D'}</p>
                                        </>
                                    )}
                                </td>
                                <td className="p-3">
                                    <div className="flex flex-wrap gap-1">
                                        {alert.missingFields.map(f => (
                                            <span key={f} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold">{f}</span>
                                        ))}
                                        {alert.missingFields.length === 0 && <span className="text-[10px] text-emerald-600 font-bold">Completos</span>}
                                    </div>
                                </td>
                                <td className="p-3">
                                    <div className="flex flex-wrap gap-1">
                                        {alert.missingResponsibleFields.map(f => (
                                            <span key={f} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold">{f}</span>
                                        ))}
                                        {alert.missingResponsibleFields.length === 0 && <span className="text-[10px] text-emerald-600 font-bold">Completos</span>}
                                    </div>
                                </td>
                                <td className="p-3">
                                    <button
                                        onClick={() => openCase(alert)}
                                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                                    >
                                        <Eye className="w-3 h-3" /> Ver caso
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

                            {/* BITÁCORA */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">Log y bitácora diaria</h3>
                                <div className="bg-white rounded-2xl border border-slate-200 p-4">
                                    <p className="text-xs text-slate-500 mb-3">Registra qué revisaste hoy y observaciones.</p>
                                    <textarea
                                        rows={3}
                                        value={bitacora}
                                        onChange={(e) => setBitacora(e.target.value)}
                                        className="w-full min-h-[100px] rounded-xl border border-slate-300 p-3 text-sm text-slate-700"
                                        placeholder="Ejemplo: Revisé 8 casos, corregí DPI/teléfono en 3, dejé pendientes 2 críticos por confirmar con expediente."
                                    />
                                </div>
                            </div>
                        </div>
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
                            disabled={loading || confirming || !canConfirm}
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
            </motion.div>
        </div>
    );
}