
import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { logAuditAction } from '../../services/auditService';
import { UserProfile, Patient } from '../../types';
import { ShieldCheck, AlertTriangle, Users, CalendarCheck, ClipboardList, BarChart3, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

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
    totalAppointmentsYesterday: number;
    totalConsultationsYesterday: number;
    newPatientsYesterday: number;
    channelBreakdown: Record<string, number>;
    centerBreakdown: Record<string, number>;
    genderBreakdown: Record<string, number>;
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
    const [summary, setSummary] = useState<DailySummary>({
        totalAppointmentsYesterday: 0,
        totalConsultationsYesterday: 0,
        newPatientsYesterday: 0,
        channelBreakdown: {},
        centerBreakdown: {},
        genderBreakdown: {},
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

            // 1. Fetch all patients for quality analysis
            const patientsSnap = await getDocs(collection(db, 'patients'));
            const patients = patientsSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Patient))
                .filter(p => (p as any).isActive !== false);

            // 2. Quality alerts
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
            // Sort by severity
            const severityOrder = { high: 0, medium: 1, low: 2 };
            alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
            setQualityAlerts(alerts);

            // 3. Yesterday's appointments
            let totalAppointments = 0;
            try {
                const apptSnap = await getDocs(query(
                    collection(db, 'appointments'),
                    where('date', '>=', Timestamp.fromDate(yStart)),
                    where('date', '<=', Timestamp.fromDate(yEnd))
                ));
                totalAppointments = apptSnap.size;
            } catch { totalAppointments = 0; }

            // 4. Yesterday's consultations
            let totalConsultations = 0;
            try {
                const consultSnap = await getDocs(query(
                    collection(db, 'consultations'),
                    where('createdAt', '>=', Timestamp.fromDate(yStart)),
                    where('createdAt', '<=', Timestamp.fromDate(yEnd))
                ));
                totalConsultations = consultSnap.docs.filter(d => ['finished', 'delivered'].includes(d.data().status)).length;
            } catch { totalConsultations = 0; }

            // 5. New patients yesterday
            let newPatientsYesterday = 0;
            try {
                const newPSnap = await getDocs(query(
                    collection(db, 'patients'),
                    where('createdAt', '>=', Timestamp.fromDate(yStart)),
                    where('createdAt', '<=', Timestamp.fromDate(yEnd))
                ));
                newPatientsYesterday = newPSnap.size;
            } catch { newPatientsYesterday = 0; }

            // 6. Breakdowns from ALL patients
            const channelBreakdown: Record<string, number> = {};
            const centerBreakdown: Record<string, number> = {};
            const genderBreakdown: Record<string, number> = {};

            for (const p of patients) {
                const ch = p.referralChannel || 'SIN DATO';
                channelBreakdown[ch] = (channelBreakdown[ch] || 0) + 1;

                const cc = p.careCenter || 'SIN DATO';
                centerBreakdown[cc] = (centerBreakdown[cc] || 0) + 1;

                const g = p.gender === 'M' || p.gender === 'masculino' ? 'Masculino'
                    : p.gender === 'F' || p.gender === 'femenino' ? 'Femenino'
                        : 'Sin dato';
                genderBreakdown[g] = (genderBreakdown[g] || 0) + 1;
            }

            setSummary({
                totalAppointmentsYesterday: totalAppointments,
                totalConsultationsYesterday: totalConsultations,
                newPatientsYesterday,
                channelBreakdown,
                centerBreakdown,
                genderBreakdown,
            });
        } catch (error) {
            console.error('Error loading quality report:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            // Save to localStorage
            const todayStr = new Date().toISOString().split('T')[0];
            localStorage.setItem(`qualityReport_lastReviewed`, todayStr);
            localStorage.setItem(`qualityReport_lastReviewedBy`, currentUser.email || currentUser.name);

            // Log audit action
            const alertCount = qualityAlerts.length;
            const highCount = qualityAlerts.filter(a => a.severity === 'high').length;
            await logAuditAction(
                currentUser.email || 'admin@humana.com',
                'REVISION_CALIDAD_DATOS',
                `${currentUser.name} revisó el reporte diario de calidad. Pacientes con datos incompletos: ${alertCount} (${highCount} críticos). Citas ayer: ${summary.totalAppointmentsYesterday}, Consultas ayer: ${summary.totalConsultationsYesterday}, Pacientes nuevos ayer: ${summary.newPatientsYesterday}`
            );

            onConfirm();
        } catch (error) {
            console.error('Error confirming quality report:', error);
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
                {/* Header */}
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

                {/* Body */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-8 bg-slate-50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="w-10 h-10 animate-spin text-brand-600" />
                            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Analizando datos del sistema...</p>
                        </div>
                    ) : (
                        <>
                            {/* SECTION A: Yesterday Summary */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <CalendarCheck className="w-4 h-4" /> Resumen del Día
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mb-3">
                                            <CalendarCheck className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{summary.totalAppointmentsYesterday}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Citas Agendadas</p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                                            <ClipboardList className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{summary.totalConsultationsYesterday}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Consultas Realizadas</p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 text-center shadow-sm">
                                        <div className="w-12 h-12 mx-auto bg-violet-50 text-violet-600 rounded-full flex items-center justify-center mb-3">
                                            <Users className="w-6 h-6" />
                                        </div>
                                        <p className="text-3xl font-bold text-slate-800">{summary.newPatientsYesterday}</p>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Pacientes Nuevos</p>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION B: Quality Alerts */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Alertas de Calidad — Pacientes con Datos Incompletos
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
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* SECTION C: Management Summary */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4" /> Resumen Gerencial (Base de Datos Completa)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Channel Breakdown */}
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Por Canal de Referencia</p>
                                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                            {Object.entries(summary.channelBreakdown)
                                                .sort(([, a], [, b]) => b - a)
                                                .map(([channel, count]) => (
                                                    <div key={channel} className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-600 truncate flex-1">{channel}</span>
                                                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full ml-2">{count}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Center Breakdown */}
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Por Procedencia</p>
                                        <div className="space-y-2">
                                            {Object.entries(summary.centerBreakdown)
                                                .sort(([, a], [, b]) => b - a)
                                                .map(([center, count]) => (
                                                    <div key={center} className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-600">{center}</span>
                                                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Gender Breakdown */}
                                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Por Género</p>
                                        <div className="space-y-2">
                                            {Object.entries(summary.genderBreakdown)
                                                .sort(([, a], [, b]) => b - a)
                                                .map(([gender, count]) => (
                                                    <div key={gender} className="flex justify-between items-center">
                                                        <span className="text-xs text-slate-600">{gender}</span>
                                                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 md:p-8 border-t bg-white shrink-0">
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="flex-1 text-center md:text-left">
                            <p className="text-xs text-slate-400">
                                Al confirmar, se registrará en auditoría que <strong className="text-slate-600">{currentUser.name}</strong> revisó este reporte.
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
            </motion.div>
        </div>
    );
};
