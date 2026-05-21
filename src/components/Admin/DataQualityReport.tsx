
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
    missingResponsibleFields: string[];
    severity: 'high' | 'medium' | 'low';
}

interface DailySummary {
    totalAppointmentsToday: number;
    arrivedToday: number;
    noShowsToday: number;
    cancelledToday: number;
    criticalToday: number;
    alertToday: number;
    reviewedToday: number;
}

const getAgeFromBirthDate = (birthDate?: string) => {
    if (!birthDate) return undefined;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
};

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
        department: '',
        isSelfResponsible: false,
        emergencyContactName: '',
        emergencyContactPhone: '',
        responsibleName: '',
        responsiblePhone: '',
        responsibleEmail: ''
    });
    const [summary, setSummary] = useState<DailySummary>({
        totalAppointmentsToday: 0,
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
    }, [isOpen]);

    const loadReportData = async () => {
        setLoading(true);
        try {
            const yStart = TODAY_START();
            const yEnd = TODAY_END();

            // 1. Fetch appointments for today
            const appointmentsSnap = await getDocs(query(
                collection(db, 'appointments'),
                where('date', '>=', Timestamp.fromDate(yStart)),
                where('date', '<=', Timestamp.fromDate(yEnd))
            ));
            const appointments = appointmentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            
            // 2. Extract unique patient IDs
            const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));
            
            // 3. Fetch patient data for those IDs
            let patients: Patient[] = [];
            if (patientIds.length > 0) {
                // Firestore 'in' query supports up to 30 items. If more, we need chunks.
                const chunks = [];
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

                if (p.responsibleName === 'No hay') {
                    if (!p.emergencyContactName) missingResp.push('Nombre Emergencia');
                    if (!p.emergencyContactPhone) missingResp.push('Tel. Emergencia');
                } else {
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
                totalAppointmentsToday: appointments.length,
                arrivedToday: appointments.filter(a => a.status === 'arrived' || a.status === 'completed' || a.status === 'in_consultation').length,
                noShowsToday: appointments.filter(a => a.status === 'no_show').length,
                cancelledToday: appointments.filter(a => a.status === 'cancelled').length,
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
            department: alert.patient.address?.department || '',
            isSelfResponsible: alert.patient.responsibleName === 'No hay',
            emergencyContactName: alert.patient.emergencyContactName || '',
            emergencyContactPhone: alert.patient.emergencyContactPhone || '',
            responsibleName: alert.patient.responsibleName === 'No hay' ? '' : (alert.patient.responsibleName || ''),
            responsiblePhone: alert.patient.responsibleName === 'No hay' ? '' : (alert.patient.responsiblePhone || ''),
            responsibleEmail: alert.patient.responsibleName === 'No hay' ? '' : (alert.patient.responsibleEmail || '')
        });
    };

    const handleSavePatient = async () => {
        if (!selectedAlert?.patient?.id) return;
        setSavingCase(true);
        try {
            const patientRef = doc(db, 'patients', selectedAlert.patient.id);
            const updatePayload: any = {
                fullName: editForm.fullName.trim(),
                dpi: editForm.dpi.trim(),
                billingCode: editForm.billingCode.trim(),
                phone: editForm.phone.trim(),
                gender: editForm.gender || null,
                referralChannel: editForm.referralChannel.trim(),
                birthDate: editForm.birthDate || null,
                age: editForm.age ? Number(editForm.age) : null,
                'address.department': editForm.department.trim(),
            };

            if (editForm.isSelfResponsible) {
                updatePayload.responsibleName = 'No hay';
                updatePayload.responsiblePhone = 'No hay';
                updatePayload.responsibleEmail = 'No hay';
                updatePayload.emergencyContactName = editForm.emergencyContactName.trim();
                updatePayload.emergencyContactPhone = editForm.emergencyContactPhone.trim();
            } else {
                updatePayload.responsibleName = editForm.responsibleName.trim();
                updatePayload.responsiblePhone = editForm.responsiblePhone.trim();
                updatePayload.responsibleEmail = editForm.responsibleEmail.trim();
                updatePayload.emergencyContactName = '';
                updatePayload.emergencyContactPhone = '';
            }

            await updateDoc(patientRef, updatePayload);
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
                totalCasesToday: summary.totalAppointmentsToday,
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
                `${currentUser.name} revisó calidad del día. Citas del día: ${summary.totalAppointmentsToday}. Alertas: ${alertCount} (${highCount} críticos, ${mediumCount} alerta). Revisados manualmente: ${reviewedCaseIds.length}. Bitácora: ${bitacoraText}`
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
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 text-center">
                                        <div className="w-10 h-10 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <Users className="w-5 h-5 text-brand-500" />
                                        </div>
                                        <div className="text-2xl font-bold text-slate-800">{summary.totalAppointmentsToday}</div>
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
                    <div className="fixed inset-0 z-[99999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">

                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-base">Revisión de caso</h4>
                                    <p className="text-xs text-slate-400 mt-0.5">{selectedAlert.patient.fullName}</p>
                                </div>
                                <button
                                    className="text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                                    onClick={() => setSelectedAlert(null)}
                                >
                                    Cerrar ✕
                                </button>
                            </div>

                            {/* Campos faltantes */}
                            {(selectedAlert.missingFields.length > 0 || selectedAlert.missingResponsibleFields.length > 0) && (
                                <div className="px-6 pt-4 shrink-0">
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex flex-wrap gap-1.5 items-center">
                                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mr-1">Faltan:</span>
                                        {[...selectedAlert.missingFields, ...selectedAlert.missingResponsibleFields].map(field => (
                                            <span key={field} className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">{field}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Scroll body */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5">

                                {/* Datos Personales */}
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Datos Personales</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nombre Completo</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="Nombre completo"
                                                value={editForm.fullName}
                                                onChange={e => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">DPI</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="DPI"
                                                value={editForm.dpi}
                                                onChange={e => setEditForm(prev => ({ ...prev, dpi: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Teléfono</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="Teléfono"
                                                value={editForm.phone}
                                                onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Género</label>
                                            <select
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                value={editForm.gender}
                                                onChange={e => setEditForm(prev => ({ ...prev, gender: e.target.value }))}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="M">Masculino</option>
                                                <option value="F">Femenino</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Fecha de Nacimiento</label>
                                            <input
                                                type="date"
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                value={editForm.birthDate}
                                                onChange={e => setEditForm(prev => ({ ...prev, birthDate: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Edad</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="Edad"
                                                value={editForm.age}
                                                onChange={e => setEditForm(prev => ({ ...prev, age: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Departamento</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="Departamento / Dirección"
                                                value={editForm.department}
                                                onChange={e => setEditForm(prev => ({ ...prev, department: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Canal de Referencia</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="Canal de referencia"
                                                value={editForm.referralChannel}
                                                onChange={e => setEditForm(prev => ({ ...prev, referralChannel: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Código de Facturación</label>
                                            <input
                                                className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                placeholder="Código Facturación"
                                                value={editForm.billingCode}
                                                onChange={e => setEditForm(prev => ({ ...prev, billingCode: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Responsable / Emergencia */}
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-2">Responsable / Contacto</p>
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded text-brand-600"
                                                checked={editForm.isSelfResponsible}
                                                onChange={e => setEditForm(prev => ({ ...prev, isSelfResponsible: e.target.checked }))}
                                            />
                                            <span className="text-xs font-bold text-brand-700 uppercase tracking-wide">El paciente ve por su propia salud</span>
                                        </label>

                                        {editForm.isSelfResponsible ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] font-bold text-amber-600 uppercase mb-1 block">Nombre Contacto Emergencia</label>
                                                    <input
                                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                                                        value={editForm.emergencyContactName || ''}
                                                        onChange={e => setEditForm(prev => ({ ...prev, emergencyContactName: e.target.value }))}
                                                        placeholder="Ej: María García"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-amber-600 uppercase mb-1 block">Teléfono Contacto Emergencia</label>
                                                    <input
                                                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                                                        value={editForm.emergencyContactPhone || ''}
                                                        onChange={e => setEditForm(prev => ({ ...prev, emergencyContactPhone: e.target.value.replace(/[^0-9]/g, '') }))}
                                                        placeholder="Solo números"
                                                    />
                                                </div>
                                                <div className="md:col-span-2 text-xs text-amber-600 mt-1 flex items-center gap-1">
                                                    ⚠️ El paciente es autónomo. Complete el contacto de emergencia.
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div className="md:col-span-2">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nombre Responsable</label>
                                                    <input
                                                        className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                        placeholder="Nombre del responsable"
                                                        value={editForm.responsibleName}
                                                        onChange={e => setEditForm(prev => ({ ...prev, responsibleName: e.target.value }))}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Teléfono Responsable</label>
                                                    <input
                                                        className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                        placeholder="Tel. responsable"
                                                        value={editForm.responsiblePhone}
                                                        onChange={e => setEditForm(prev => ({ ...prev, responsiblePhone: e.target.value }))}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Email Responsable</label>
                                                    <input
                                                        type="email"
                                                        className="w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:ring-2 focus:ring-brand-400"
                                                        placeholder="email@ejemplo.com"
                                                        value={editForm.responsibleEmail}
                                                        onChange={e => setEditForm(prev => ({ ...prev, responsibleEmail: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Info del creador */}
                                {(selectedAlert.patient.creatorName || selectedAlert.patient.createdByEmail) && (
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-3 text-xs text-slate-500">
                                        <span className="font-bold text-slate-600">Registrado por:</span>
                                        <span>{selectedAlert.patient.creatorName || selectedAlert.patient.createdByEmail}</span>
                                        {selectedAlert.patient.createdByEmail && selectedAlert.patient.creatorName && (
                                            <span className="text-slate-400">({selectedAlert.patient.createdByEmail})</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end">
                                <button
                                    onClick={handleSavePatient}
                                    disabled={savingCase}
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 shadow-lg shadow-emerald-200 transition-all"
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
