import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Patient, Appointment } from '../types';
// @ts-ignore
import ExcelJS from 'exceljs';

export const generateQualityReportExcel = async (startDate: Date, endDate: Date): Promise<Blob> => {
    // 1. Fetch appointments for the range
    const apptsSnap = await getDocs(query(
        collection(db, 'appointments'),
        where('date', '>=', Timestamp.fromDate(startDate)),
        where('date', '<=', Timestamp.fromDate(endDate))
    ));
    const appointments = apptsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
    
    // 2. Fetch unique patients
    const patientIds = Array.from(new Set(appointments.map(a => a.patientId).filter(Boolean)));
    let patients: Patient[] = [];
    if (patientIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < patientIds.length; i += 30) {
            chunks.push(patientIds.slice(i, i + 30));
        }
        const patientsData = await Promise.all(chunks.map(chunk => 
            getDocs(query(collection(db, 'patients'), where('__name__', 'in', chunk)))
        ));
        patients = patientsData.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() } as Patient)));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Calidad de Datos');

    // Estilos base
    worksheet.columns = [
        { header: 'Fecha Cita', key: 'date', width: 15 },
        { header: 'Paciente', key: 'fullName', width: 35 },
        { header: 'DPI (000 si <18)', key: 'dpi', width: 15 },
        { header: 'Código Facturación', key: 'billingCode', width: 20 },
        { header: 'Estado Calidad', key: 'status', width: 15 },
        { header: 'Campos Faltantes', key: 'missing', width: 40 }
    ];

    // Título
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'REPORTE DE CALIDAD DE DATOS (CITAS DEL DÍA)';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };

    // Rango de fechas
    worksheet.mergeCells('A2:F2');
    const rangeCell = worksheet.getCell('A2');
    rangeCell.value = `Periodo: ${startDate.toLocaleDateString()} al ${endDate.toLocaleDateString()}`;
    rangeCell.alignment = { horizontal: 'center' };

    // Estadísticas
    worksheet.getRow(4).values = ['RESUMEN DE CITAS'];
    worksheet.getRow(4).font = { bold: true };
    worksheet.getRow(5).values = ['Total Citas', 'Pacientes Llegados', 'No Show', 'Cancelados'];
    worksheet.getRow(6).values = [
        appointments.length,
        appointments.filter(a => ['arrived', 'completed', 'in_consultation'].includes(a.status)).length,
        appointments.filter(a => a.status === 'no_show').length,
        appointments.filter(a => a.status === 'cancelled').length
    ];

    // Encabezados de tabla
    const headerRow = worksheet.getRow(8);
    headerRow.values = ['Fecha Cita', 'Paciente', 'DPI (000 si <18)', 'Código Fact.', 'Severidad', 'Campos Faltantes'];
    headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    });

    // Datos
    let rowIndex = 9;
    appointments.forEach(appt => {
        const p = patients.find(pat => pat.id === appt.patientId);
        if (!p) return;

        const missing: string[] = [];
        if (!p.dpi) missing.push('DPI');
        if (!p.billingCode) missing.push('Código Facturación');
        if (!p.phone) missing.push('Teléfono');
        if (!p.gender) missing.push('Género');
        if (!p.referralChannel) missing.push('Canal Referencia');
        if (!p.age && !p.birthDate) missing.push('Edad/Fecha Nac.');
        if (!p.address?.department) missing.push('Dirección');

        if (missing.length === 0) return; // Omitir si está todo bien

        const severity = missing.length >= 5 ? 'CRÍTICO' : missing.length >= 3 ? 'ALERTA' : 'BAJA';
        
        // Regla DPI menores
        const isMinor = p.birthDate ? (new Date().getFullYear() - new Date(p.birthDate).getFullYear() < 18) : false;
        const dpiToExport = isMinor ? '000' : (p.dpi || '—');

        const row = worksheet.getRow(rowIndex);
        const apptDate = appt.date?.toDate ? appt.date.toDate() : new Date(appt.date);
        row.values = [
            apptDate.toLocaleDateString(),
            p.fullName,
            dpiToExport,
            p.billingCode || '—',
            severity,
            missing.join(', ')
        ];

        // Colores por severidad
        if (severity === 'CRÍTICO') {
            row.getCell(5).font = { color: { argb: 'FFFF0000' }, bold: true };
        } else if (severity === 'ALERTA') {
            row.getCell(5).font = { color: { argb: 'FFF59E0B' }, bold: true };
        }

        rowIndex++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
