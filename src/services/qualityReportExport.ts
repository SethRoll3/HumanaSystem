import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Patient } from '../types';
import ExcelJS from 'exceljs';

export const generateQualityReportExcel = async (dateStr: string): Promise<Blob> => {
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(`${dateStr}T23:59:59.999`);

    // 1. Fetch appointments
    let totalAppointments = 0;
    try {
        const apptSnap = await getDocs(query(collection(db, 'appointments'), where('date', '>=', Timestamp.fromDate(start)), where('date', '<=', Timestamp.fromDate(end))));
        totalAppointments = apptSnap.size;
    } catch (e) {
        console.error("Error fetching appointments for report", e);
    }

    // 2. Fetch consultations
    let totalConsultations = 0;
    try {
        const consultSnap = await getDocs(query(collection(db, 'consultations'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<=', Timestamp.fromDate(end))));
        totalConsultations = consultSnap.docs.filter(d => ['finished', 'delivered'].includes(d.data().status)).length;
    } catch (e) {
        console.error("Error fetching consultations for report", e);
    }

    // 3. Fetch patients created that day
    let newPatients = 0;
    try {
        const newPSnap = await getDocs(query(collection(db, 'patients'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<=', Timestamp.fromDate(end))));
        newPatients = newPSnap.size;
    } catch (e) {
        console.error("Error fetching new patients for report", e);
    }

    // 4. All patients alerts and breakdowns
    const patSnap = await getDocs(collection(db, 'patients'));
    const patients = patSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));

    const channelBreakdown: Record<string, number> = {};
    const centerBreakdown: Record<string, number> = {};
    const genderBreakdown: Record<string, number> = {};
    const incompletePatients: any[] = [];

    for (const p of patients) {
        const ch = p.referralChannel || 'SIN DATO';
        channelBreakdown[ch] = (channelBreakdown[ch] || 0) + 1;

        const cc = p.careCenter || 'SIN DATO';
        centerBreakdown[cc] = (centerBreakdown[cc] || 0) + 1;

        const gen = p.gender === 'M' || p.gender === 'masculino' ? 'Masculino'
            : p.gender === 'F' || p.gender === 'femenino' ? 'Femenino'
                : 'SIN DATO';
        genderBreakdown[gen] = (genderBreakdown[gen] || 0) + 1;

        const missing = [];
        if (!p.dpi?.trim()) missing.push('DPI');
        if (!p.billingCode?.trim()) missing.push('Código Facturación');
        if (!p.gender) missing.push('Género');
        if (!p.referralChannel) missing.push('Canal Referencia');
        if (!p.birthDate && !p.age) missing.push('Edad/Fecha Nac.');
        if (!p.address?.department && !p.address?.municipality) missing.push('Dirección');

        if (missing.length > 0) {
            const severity = missing.length >= 5 ? 'high' : missing.length >= 3 ? 'medium' : 'low';
            const severityLabel = severity === 'high' ? 'CRÍTICO' : severity === 'medium' ? 'MEDIO' : 'BAJO';

            incompletePatients.push({
                nombre: p.fullName || 'Incompleto',
                id: p.id,
                telefono: p.phone || 'N/A',
                severidad: severityLabel,
                faltantes: missing.join(", ")
            });
        }
    }

    const sevOrder: Record<string, number> = { 'CRÍTICO': 0, 'MEDIO': 1, 'BAJO': 2 };
    incompletePatients.sort((a, b) => sevOrder[a.severidad] - sevOrder[b.severidad]);

    // CREATE EXCELJS WORKBOOK
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte de Calidad', {
        properties: { tabColor: { argb: 'FF0F172A' } },
        views: [{ showGridLines: false }]
    });

    // Column Widths
    sheet.columns = [
        { width: 3 },  // Margin Col A
        { width: 20 }, // Col B
        { width: 35 }, // Col C
        { width: 15 }, // Col D
        { width: 20 }, // Col E
        { width: 45 }, // Col F (Campos faltantes)
        { width: 3 },  // Margin Right Col G
    ];

    let currentRow = 2;

    // --- MAIN HEADER ---
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const titleCell = sheet.getCell(`B${currentRow}`);
    titleCell.value = ' REPORTE DIARIO DE CALIDAD DE DATOS (HUMANASYSTEM)';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate 900
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    currentRow++;

    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const subCell = sheet.getCell(`B${currentRow}`);
    subCell.value = `Resumen Ejecutivo — Reporte del día: ${dateStr}`;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } }; // Slate 500
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    currentRow += 2;

    // --- SECTION 1: RESUMEN DEL DÍA ---
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec1 = sheet.getCell(`B${currentRow}`);
    sec1.value = ' 1. RESUMEN DEL DÍA (INGRESOS RECIENTES)';
    sec1.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };
    sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Slate 100
    sec1.border = { bottom: { style: 'thick', color: { argb: 'FFCBD5E1' } } };
    currentRow += 2;

    const fillSummaryBox = (col: string, title: string, value: number, bgColor: string, fgColor: string) => {
        const c1 = sheet.getCell(`${col}${currentRow}`);
        const c2 = sheet.getCell(`${col}${currentRow + 1}`);
        c1.value = value;
        c1.font = { size: 18, bold: true, color: { argb: fgColor } };
        c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        c1.alignment = { horizontal: 'center', vertical: 'bottom' };

        c2.value = title;
        c2.font = { size: 9, bold: true, color: { argb: 'FF64748B' } };
        c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        c2.alignment = { horizontal: 'center', vertical: 'top' };

        c1.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        c2.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
    };

    fillSummaryBox('B', 'Citas Agendadas', totalAppointments, 'FFF0F9FF', 'FF0284C7'); // Sky
    fillSummaryBox('C', 'Consultas Médicas', totalConsultations, 'FFECFDF5', 'FF059669'); // Emerald
    fillSummaryBox('D', 'Pacientes Nuevos', newPatients, 'FFF5F3FF', 'FF7C3AED'); // Violet 
    currentRow += 3;

    // --- SECTION 2: DESGLOSE GERENCIAL ---
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec2 = sheet.getCell(`B${currentRow}`);
    sec2.value = ' 2. DESGLOSE DEMOGRÁFICO DE BASE DE DATOS';
    sec2.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };
    sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    sec2.border = { bottom: { style: 'thick', color: { argb: 'FFCBD5E1' } } };
    currentRow += 2;

    const renderKV = (cKey: string, cVal: string, title: string, data: Record<string, number>, rStart: number) => {
        let tempRow = rStart;
        sheet.getCell(`${cKey}${tempRow}`).value = title;
        sheet.getCell(`${cKey}${tempRow}`).font = { bold: true, size: 9, color: { argb: 'FF1E293B' } };
        sheet.getCell(`${cKey}${tempRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        tempRow++;
        for (const [k, v] of Object.entries(data).sort((a, b) => b[1] - a[1])) {
            sheet.getCell(`${cKey}${tempRow}`).value = k;
            sheet.getCell(`${cKey}${tempRow}`).font = { size: 9 };
            sheet.getCell(`${cVal}${tempRow}`).value = v;
            sheet.getCell(`${cVal}${tempRow}`).font = { size: 9, bold: true };
            tempRow++;
        }
        return tempRow;
    };

    const r1 = renderKV('B', 'C', 'Canal de Referencia', channelBreakdown, currentRow);
    const r2 = renderKV('D', 'E', 'Centro de Atención', centerBreakdown, currentRow);
    const r3 = renderKV('F', 'F', 'Género', genderBreakdown, currentRow); // Let column F hold both since we only have three items

    currentRow = Math.max(r1, r2, r3) + 2;

    // --- SECTION 3: ALERTAS DE CALIDAD ---
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec3 = sheet.getCell(`B${currentRow}`);
    sec3.value = ` 3. ALERTAS DE CALIDAD DE DATOS (${incompletePatients.length} pacientes incompletos)`;
    sec3.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF991B1B' } };
    sec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    sec3.border = { bottom: { style: 'thick', color: { argb: 'FFFCA5A5' } } };
    currentRow += 2;

    if (incompletePatients.length === 0) {
        sheet.mergeCells(`B${currentRow}:F${currentRow}`);
        const okCell = sheet.getCell(`B${currentRow}`);
        okCell.value = "✅  EXCELENTE: Todos los pacientes tienen sus datos completos.";
        okCell.font = { bold: true, color: { argb: 'FF059669' } };
        okCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        okCell.alignment = { vertical: 'middle', horizontal: 'center' };
        currentRow += 2;
    } else {
        const headers = ['Severidad', 'Paciente (Nombre)', 'ID Único', 'Teléfono', 'Campos Faltantes'];
        ['B', 'C', 'D', 'E', 'F'].forEach((col, i) => {
            const cell = sheet.getCell(`${col}${currentRow}`);
            cell.value = headers[i];
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } }; // Slate 600
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        });
        currentRow++;

        incompletePatients.forEach(p => {
            const isCrit = p.severidad === 'CRÍTICO';
            const isMed = p.severidad === 'MEDIO';

            sheet.getCell(`B${currentRow}`).value = p.severidad;
            sheet.getCell(`B${currentRow}`).font = { bold: true, color: isCrit ? { argb: 'FFDC2626' } : isMed ? { argb: 'FFD97706' } : { argb: 'FF2563EB' }, size: 9 };
            sheet.getCell(`B${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: isCrit ? { argb: 'FFFEE2E2' } : isMed ? { argb: 'FFFEF3C7' } : { argb: 'FFDBEAFE' } };
            sheet.getCell(`B${currentRow}`).alignment = { horizontal: 'center' };

            sheet.getCell(`C${currentRow}`).value = p.nombre;
            sheet.getCell(`C${currentRow}`).font = { bold: true, size: 9, color: { argb: 'FF1E293B' } };

            sheet.getCell(`D${currentRow}`).value = p.id;
            sheet.getCell(`D${currentRow}`).font = { size: 8, color: { argb: 'FF64748B' } };

            sheet.getCell(`E${currentRow}`).value = p.telefono;
            sheet.getCell(`E${currentRow}`).font = { size: 9 };

            sheet.getCell(`F${currentRow}`).value = p.faltantes;
            sheet.getCell(`F${currentRow}`).font = { size: 9, italic: true, color: isCrit ? { argb: 'FF991B1B' } : { argb: 'FF475569' } };

            ['B', 'C', 'D', 'E', 'F'].forEach((col) => {
                sheet.getCell(`${col}${currentRow}`).border = { bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } } };
                sheet.getCell(`${col}${currentRow}`).alignment = { ...sheet.getCell(`${col}${currentRow}`).alignment, vertical: 'middle' };
            });
            currentRow++;
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
