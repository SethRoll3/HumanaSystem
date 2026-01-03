
import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Calendar, TrendingUp, Users, Search, Wallet, Download, CheckCircle, Clock } from 'lucide-react';
import { getIncomeByDateRange, DailyIncomeSummary } from '../../services/accountingService';
import { LOGO_BASE64 } from '../../data/assets.ts';
// @ts-ignore
import ExcelJS from 'exceljs';

// --- UTILIDADES DE ZONA HORARIA GUATEMALA ---

// Obtener fecha actual en formato YYYY-MM-DD según hora Guatemala
const getGuatemalaToday = () => {
    // Usamos en-CA porque da formato ISO (YYYY-MM-DD) directo
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guatemala' });
};

// Formatear fecha para mostrar en UI/Excel
const formatGuatemalaTime = (dateInput: number | Date | string) => {
    const d = new Date(dateInput);
    return d.toLocaleTimeString('es-GT', { 
        timeZone: 'America/Guatemala', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true 
    });
};

const formatGuatemalaDateFull = (dateInput: number | Date | string) => {
    const d = new Date(dateInput);
    return d.toLocaleDateString('es-GT', { 
        timeZone: 'America/Guatemala',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

// Helper para traducir estados
const translateStatus = (status: string) => {
    switch(status) {
        case 'waiting': return 'En Espera';
        case 'in_progress': return 'En Consulta';
        case 'finished': return 'Finalizado';
        case 'delivered': return 'Entregado';
        default: return status.charAt(0).toUpperCase() + status.slice(1);
    }
};

export const AccountingDashboard: React.FC = () => {
    // Inicializar con la fecha de GT, no la del navegador local
    const [selectedDate, setSelectedDate] = useState<string>(getGuatemalaToday());
    const [summary, setSummary] = useState<DailyIncomeSummary>({ totalIncome: 0, consultationCount: 0, averageTicket: 0, transactions: [] });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, [selectedDate]);

    const fetchData = async () => {
        setLoading(true);
        
        // CONSTRUCCIÓN ESTRICTA DE RANGO CON OFFSET UTC-6 (Guatemala)
        // Esto asegura que si el admin está en China o España, siga viendo los datos del día de Guatemala.
        // ISO String con Offset: "2023-10-25T00:00:00-06:00"
        const start = new Date(`${selectedDate}T00:00:00-06:00`); 
        const end = new Date(`${selectedDate}T23:59:59.999-06:00`);
        
        const data = await getIncomeByDateRange(start, end);
        setSummary(data);
        setLoading(false);
    };

    const handleExportExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Corte de Caja');

        // --- 1. CONFIGURACIÓN VISUAL ---
        worksheet.columns = [
            { key: 'date', width: 25 },
            { key: 'patient', width: 35 },
            { key: 'doctor', width: 30 },
            { key: 'receipt', width: 20 },
            { key: 'status', width: 20 },
            { key: 'amount', width: 20 },
        ];

        // --- 2. INSERTAR LOGO ---
        if (LOGO_BASE64) {
            const imageId = workbook.addImage({
                base64: LOGO_BASE64.split(',')[1],
                extension: 'png',
            });
            worksheet.addImage(imageId, {
                tl: { col: 0, row: 0 },
                ext: { width: 100, height: 100 },
                editAs: 'absolute'
            });
        }

        // --- 3. ENCABEZADOS DEL REPORTE (TÍTULO) ---
        worksheet.mergeCells('B2:F2');
        const titleCell = worksheet.getCell('B2');
        titleCell.value = "REPORTE DE CORTE DE CAJA DIARIO";
        titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF4C1D95' } }; // Brand 900
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.mergeCells('B3:F3');
        const dateCell = worksheet.getCell('B3');
        // Usar formateador GT explícito
        // Reconstruimos la fecha seleccionada con offset para asegurar que el formateador la lea bien
        const dateObj = new Date(`${selectedDate}T12:00:00-06:00`); 
        const fmtDate = formatGuatemalaDateFull(dateObj);
        
        dateCell.value = `Fecha de Corte: ${fmtDate.charAt(0).toUpperCase() + fmtDate.slice(1)}`;
        dateCell.font = { name: 'Arial', size: 12, italic: true, color: { argb: 'FF6B7280' } }; // Gray
        dateCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // Espacio antes de la tabla (Fila 6 empieza la tabla con nuestros titulos manuales)
        worksheet.getRow(6).values = ['FECHA / HORA', 'PACIENTE', 'MÉDICO', 'NO. BOLETA', 'ESTADO', 'MONTO (Q)'];
        
        // Estilo de Cabecera de Tabla
        const headerRow = worksheet.getRow(6);
        headerRow.height = 30;
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF7C3AED' } // Brand 600 (Violet)
            };
            cell.font = {
                name: 'Arial',
                color: { argb: 'FFFFFFFF' }, // White
                bold: true,
                size: 11
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'medium' },
                right: { style: 'thin' }
            };
        });

        // --- 4. DATOS ---
        summary.transactions.forEach((t) => {
            const rowValues = {
                date: formatGuatemalaTime(t.date), // Usar helper GT
                patient: t.patientName + (t.patientIsForeign ? ' (FORÁNEO)' : ''),
                doctor: 'Dr. ' + t.doctorName,
                receipt: t.paymentReceipt,
                status: translateStatus(t.status).toUpperCase(),
                amount: t.paymentAmount || 0
            };
            const row = worksheet.addRow(rowValues);
            
            // Estilo de Filas de Datos
            row.height = 20;
            row.eachCell((cell, colNumber) => {
                cell.font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
                cell.alignment = { vertical: 'middle', horizontal: colNumber === 6 ? 'right' : 'left' };
                if (colNumber === 1 || colNumber === 4 || colNumber === 5) {
                     cell.alignment = { vertical: 'middle', horizontal: 'center' };
                }
                
                cell.border = {
                    top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                    right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
                };
            });
            
            row.getCell(6).numFmt = '"Q"#,##0.00';
        });

        // --- 5. FILA DE TOTALES ---
        const totalRow = worksheet.addRow(['', '', '', '', 'TOTAL INGRESOS:', summary.totalIncome]);
        totalRow.height = 35;
        
        // Estilo Celda "TOTAL INGRESOS"
        const labelCell = totalRow.getCell(5);
        labelCell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4C1D95' } }; // Brand 900
        labelCell.alignment = { vertical: 'middle', horizontal: 'right' };
        labelCell.border = { top: { style: 'medium' }, bottom: { style: 'medium' } };

        // Estilo Celda MONTO
        const amountCell = totalRow.getCell(6);
        amountCell.numFmt = '"Q"#,##0.00';
        amountCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        amountCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald 600
        amountCell.alignment = { vertical: 'middle', horizontal: 'center' };
        amountCell.border = { top: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };

        // --- 6. DESCARGA ---
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Corte_Caja_${selectedDate}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const setToday = () => {
        setSelectedDate(getGuatemalaToday());
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header y Filtros */}
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="w-8 h-8 text-emerald-600"/> Contabilidad y Caja
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Gestión de ingresos (Zona Horaria: Guatemala)</p>
                </div>
                
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                    <button onClick={setToday} className="px-4 py-2 bg-white text-slate-600 text-xs font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition shadow-sm">
                        Hoy
                    </button>
                    <div className="relative">
                        <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none"/>
                        <input 
                            type="date" 
                            value={selectedDate} 
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-sm"
                        />
                    </div>
                    <button onClick={fetchData} className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition shadow-lg">
                        <Search className="w-4 h-4"/>
                    </button>
                </div>
            </div>

            {/* Tarjetas de Resumen (Stats Cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Total Ingresos */}
                <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay: 0.1}} className="bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-3xl p-6 text-white shadow-xl shadow-emerald-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <DollarSign className="w-32 h-32"/>
                    </div>
                    <div className="relative z-10">
                        <p className="text-emerald-100 font-bold text-sm uppercase tracking-widest mb-1">Total Ingresos</p>
                        <h3 className="text-4xl font-bold flex items-baseline gap-1">
                            <span className="text-2xl">Q.</span>
                            {loading ? "..." : summary.totalIncome.toFixed(2)}
                        </h3>
                        <p className="text-emerald-100/80 text-xs mt-4 font-medium flex items-center gap-1">
                            {/* Fecha formateada en GT */}
                            <Calendar className="w-3 h-3"/> 
                            {formatGuatemalaDateFull(new Date(`${selectedDate}T12:00:00-06:00`))}
                        </p>
                    </div>
                </motion.div>

                {/* 2. Total Consultas */}
                <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay: 0.2}} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-blue-200 transition-all">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Users className="w-6 h-6"/>
                    </div>
                    <div>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Consultas Pagadas</p>
                        <h3 className="text-3xl font-bold text-slate-800 mt-1">
                            {loading ? "..." : summary.consultationCount}
                        </h3>
                    </div>
                </motion.div>

                {/* 3. Ticket Promedio */}
                <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} transition={{delay: 0.3}} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-violet-200 transition-all">
                    <div className="w-12 h-12 bg-violet-50 text-violet-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-6 h-6"/>
                    </div>
                    <div>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Ticket Promedio</p>
                        <h3 className="text-3xl font-bold text-slate-800 mt-1 flex items-baseline gap-1">
                            <span className="text-lg text-slate-400">Q.</span>
                            {loading ? "..." : summary.averageTicket.toFixed(2)}
                        </h3>
                    </div>
                </motion.div>
            </div>

            {/* Tabla de Detalle */}
            <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay: 0.4}} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                        Detalle de Movimientos
                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">{summary.transactions.length}</span>
                    </h3>
                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-emerald-600 hover:border-emerald-200 rounded-xl text-xs font-bold transition shadow-sm">
                        <Download className="w-4 h-4"/> Exportar Reporte Excel
                    </button>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b">
                            <tr>
                                <th className="p-4">Hora</th>
                                <th className="p-4">No. Boleta</th>
                                <th className="p-4">Paciente</th>
                                <th className="p-4">Médico</th>
                                <th className="p-4">Estado</th>
                                <th className="p-4 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr><td colSpan={6} className="p-20 text-center text-slate-400 animate-pulse font-medium">Calculando ingresos...</td></tr>
                            ) : summary.transactions.length > 0 ? (
                                summary.transactions.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-50 transition-colors text-sm">
                                        <td className="p-4 font-mono text-slate-500 text-xs">
                                            {formatGuatemalaTime(t.date)}
                                        </td>
                                        <td className="p-4 font-bold text-slate-700 font-mono bg-slate-50/50 w-32">
                                            {t.paymentReceipt}
                                        </td>
                                        <td className="p-4 font-medium text-slate-800">
                                            {t.patientName}
                                            {t.patientIsForeign && <span className="ml-2 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">FORÁNEO</span>}
                                        </td>
                                        <td className="p-4 text-slate-500 text-xs">
                                            Dr. {t.doctorName}
                                        </td>
                                        <td className="p-4">
                                            {t.status === 'delivered' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-100">
                                                    <CheckCircle className="w-3 h-3"/> {translateStatus(t.status)}
                                                </span>
                                            ) : (
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase border ${t.status === 'finished' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                    <Clock className="w-3 h-3"/> {translateStatus(t.status)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-bold text-slate-800">
                                            Q. {(t.paymentAmount || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={6} className="p-20 text-center text-slate-400 italic">No hay movimientos registrados en esta fecha.</td></tr>
                            )}
                        </tbody>
                        {/* Footer de Totales */}
                        {!loading && summary.transactions.length > 0 && (
                            <tfoot className="bg-slate-50 border-t border-slate-200">
                                <tr>
                                    <td colSpan={5} className="p-4 text-right text-xs font-bold text-slate-500 uppercase tracking-widest">Total del Día:</td>
                                    <td className="p-4 text-right text-lg font-bold text-emerald-600">Q. {summary.totalIncome.toFixed(2)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </motion.div>
        </div>
    );
};
