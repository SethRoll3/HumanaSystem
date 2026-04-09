import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Clock, Search, Download, FileSpreadsheet } from 'lucide-react';
import { doctorScheduleService } from '../../services/doctorScheduleService';
import { generateQualityReportExcel } from '../../services/qualityReportExport';
import { toast } from 'sonner';

export const QualityReportsAudit: React.FC = () => {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [reportTime, setReportTime] = useState('16:00');

    useEffect(() => {
        doctorScheduleService.getGlobalSettings().then(s => setReportTime(s.qualityReportTime || '16:00'));

        const q = query(
            collection(db, 'audit_logs'),
            orderBy('timestamp', 'desc')
        );

        const unsub = onSnapshot(q, snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
            setLogs(data.filter(d => d.action === 'REVISION_CALIDAD_DATOS'));
            setLoading(false);
        }, err => {
            console.error("Error fetching quality audit logs:", err);
            toast.error("Error al cargar el historial de revisiones");
            setLoading(false);
        });

        return () => unsub();
    }, []);

    const handleSaveTime = async () => {
        try {
            await doctorScheduleService.updateGlobalSettings({ qualityReportTime: reportTime });
            toast.success("Hora de reporte actualizada correctamente");
        } catch (e) {
            toast.error("Error al actualizar la configuración");
        }
    };

    const handleDownloadExcel = async (timestampObj: any) => {
        const date = timestampObj?.toDate ? timestampObj.toDate() : new Date(timestampObj);
        if (isNaN(date.getTime())) return toast.error("Fecha inválida");
        
        const dateStr = date.toISOString().split('T')[0];
        const toastId = toast.loading(`Generando Excel del ${dateStr}...`);
        
        try {
            const blob = await generateQualityReportExcel(dateStr);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ReporteCalidad_${dateStr}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success("Reporte generado con éxito", { id: toastId });
        } catch (e) {
            console.error(e);
            toast.error("Error al generar el reporte", { id: toastId });
        }
    };

    const filteredLogs = logs.filter(log => {
        let matchesSearch = true;
        let matchesDate = true;

        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            matchesSearch = log.userEmail?.toLowerCase().includes(s) || log.details?.toLowerCase().includes(s);
        }

        if (filterDate) {
            const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            if (!isNaN(logDate.getTime())) {
                const dateStr = logDate.toISOString().split('T')[0];
                matchesDate = dateStr === filterDate;
            }
        }

        return matchesSearch && matchesDate;
    });

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
                <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2 mb-4"><Clock className="w-6 h-6 text-brand-600"/> Configuración de Reporte</h3>
                <p className="text-slate-500 mb-6 font-medium">Establece la hora del día a partir de la cual el reporte de calidad empezará a mostrarse a los administradores.</p>
                <div className="flex gap-4 items-center">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Hora de Activación</label>
                        <input type="time" className="w-48 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold font-mono" value={reportTime} onChange={e => setReportTime(e.target.value)} />
                    </div>
                    <button onClick={handleSaveTime} className="bg-brand-600 text-white font-bold py-4 px-8 rounded-2xl hover:bg-brand-700 transition-all self-end shadow-md">Guardar</button>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-slate-800 text-xl">Historial de Revisiones</h3>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-bold text-slate-500">Filtrar por fecha:</label>
                        <input type="date" className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
                    </div>
                    <div className="relative">
                        <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" placeholder="Buscar por usuario o detalles..." className="w-64 pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12"><div className="w-8 h-8 rounded-full border-4 border-brand-500 border-t-transparent animate-spin"></div></div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-200 text-slate-400 text-xs uppercase tracking-widest font-bold">
                                    <th className="p-4">Fecha y Hora</th>
                                    <th className="p-4">Usuario</th>
                                    <th className="p-4 min-w-[300px]">Detalles</th>
                                    <th className="p-4 w-48 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredLogs.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">No hay revisiones registradas</td></tr>
                                ) : filteredLogs.map(log => {
                                    const d = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                                    return (
                                        <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 last:border-0 group">
                                            <td className="p-4 font-bold text-slate-700 whitespace-nowrap">{d.toLocaleString()}</td>
                                            <td className="p-4 text-slate-600">{log.userEmail}</td>
                                            <td className="p-4 text-slate-500 text-sm">{log.details}</td>
                                            <td className="p-4 text-center">
                                                <button onClick={() => handleDownloadExcel(log.timestamp)} className="inline-flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-4 py-2 rounded-xl text-sm font-bold transition-all hover:bg-blue-100">
                                                    <FileSpreadsheet className="w-4 h-4"/> Descargar
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
