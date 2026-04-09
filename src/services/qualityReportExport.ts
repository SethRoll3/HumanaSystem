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
        totalConsultations = consultSnap.size;
    } catch(e) {
        console.error("Error fetching consultations for report", e);
    }

    // 3. Fetch patients created that day
    let newPatients = 0;
    try {
        const newPSnap = await getDocs(query(collection(db, 'patients'), where('createdAt', '>=', Timestamp.fromDate(start)), where('createdAt', '<=', Timestamp.fromDate(end))));
        newPatients = newPSnap.size;
    } catch(e) {
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

        const gen = p.gender || 'SIN DATO';
        genderBreakdown[gen] = (genderBreakdown[gen] || 0) + 1;

        const missing = [];
        if (!p.dpi?.trim()) missing.push('DPI');
        if (!p.billingCode?.trim()) missing.push('Código Facturación');
        if (!p.gender) missing.push('Género');
        if (!p.referralChannel) missing.push('Canal Referencia');
        if (!p.birthDate && !p.age) missing.push('Edad/Fecha Nac.');
        if (!p.address?.department && !p.address?.municipality) missing.push('Dirección');
        
        if (missing.length > 0) {
            incompletePatients.push({
                nombre: p.fullName || 'Incompleto',
                id: p.id,
                telefono: p.phone || 'N/A',
                severidad: missing.length >= 3 ? "CRÍTICO" : "ADVERTENCIA",
                faltantes: missing.join(", ")
            });
        }
    }

    // CREATE EXCELJS WORKBOOK
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte de Calidad', {
        properties: { tabColor: { argb: 'FF0F172A' } },
        views: [{ showGridLines: false }]
    });

    // Column Widths
    sheet.columns = [
        { width: 3 },  // Margin
        { width: 25 }, // Col B
        { width: 40 }, // Col C
        { width: 20 }, // Col D
        { width: 20 }, // Col E
        { width: 30 }, // Col F (Campos faltantes)
    ];

    let currentRow = 2;

    // TITLE
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const titleCell = sheet.getCell(`B${currentRow}`);
    titleCell.value = 'REPORTE DIARIO DE CALIDAD DE DATOS';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    currentRow++;

    // SUBTITLE
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const subCell = sheet.getCell(`B${currentRow}`);
    subCell.value = `Resumen correspondiente al día: ${dateStr}`;
    subCell.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };
    currentRow += 2;

    // --- SECTION 1: RESUMEN DEL DIA ---
    sheet.mergeCells(`B${currentRow}:C${currentRow}`);
    const sec1 = sheet.getCell(`B${currentRow}`);
    sec1.value = 'RESUMEN DEL DÍA';
    sec1.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF334155' } };
    sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    currentRow++;

    sheet.getCell(`B${currentRow}`).value = 'Citas Agendadas';
    sheet.getCell(`C${currentRow}`).value = totalAppointments;
    sheet.getCell(`C${currentRow}`).alignment = { horizontal: 'left' };
    currentRow++;
    sheet.getCell(`B${currentRow}`).value = 'Consultas Realizadas';
    sheet.getCell(`C${currentRow}`).value = totalConsultations;
    sheet.getCell(`C${currentRow}`).alignment = { horizontal: 'left' };
    currentRow++;
    sheet.getCell(`B${currentRow}`).value = 'Pacientes Nuevos';
    sheet.getCell(`C${currentRow}`).value = newPatients;
    sheet.getCell(`C${currentRow}`).alignment = { horizontal: 'left' };
    currentRow += 2;

    // --- SECTION 2: DESGLOSE GERENCIAL ---
    sheet.mergeCells(`B${currentRow}:D${currentRow}`);
    const sec2 = sheet.getCell(`B${currentRow}`);
    sec2.value = 'DESGLOSE GERENCIAL (EN TODA LA BASE DE DATOS)';
    sec2.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF334155' } };
    sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    currentRow++;

    const writeBreakdown = (title: string, data: Record<string, number>) => {
        sheet.getCell(`B${currentRow}`).value = title;
        sheet.getCell(`B${currentRow}`).font = { bold: true };
        currentRow++;
        for (const [k, v] of Object.entries(data)) {
            sheet.getCell(`C${currentRow}`).value = k;
            sheet.getCell(`D${currentRow}`).value = v;
            sheet.getCell(`D${currentRow}`).alignment = { horizontal: 'left' };
            currentRow++;
        }
        currentRow++;
    };

    writeBreakdown('Canal de Referencia', channelBreakdown);
    writeBreakdown('Centro de Atención', centerBreakdown);
    writeBreakdown('Género', genderBreakdown);

    // --- SECTION 3: ALERTAS DE CALIDAD ---
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec3 = sheet.getCell(`B${currentRow}`);
    sec3.value = `ALERTAS DE CALIDAD - PACIENTES INCOMPLETOS (${incompletePatients.length})`;
    sec3.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF991B1B' } };
    sec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    currentRow++;

    // Table Headers
    const headers = ['Severidad', 'Paciente', 'ID Paciente', 'Teléfono', 'Campos Faltantes'];
    ['B', 'C', 'D', 'E', 'F'].forEach((col, i) => {
        const cell = sheet.getCell(`${col}${currentRow}`);
        cell.value = headers[i];
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    });
    currentRow++;

    // Table Data
    if (incompletePatients.length === 0) {
        sheet.mergeCells(`B${currentRow}:F${currentRow}`);
        sheet.getCell(`B${currentRow}`).value = "Excelente, no hay pacientes con datos incompletos.";
        sheet.getCell(`B${currentRow}`).font = { italic: true };
    } else {
        incompletePatients.forEach(p => {
            sheet.getCell(`B${currentRow}`).value = p.severidad;
            if (p.severidad === 'CRÍTICO') {
                sheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FFDC2626' } };
            } else {
                sheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: 'FFD97706' } };
            }
            sheet.getCell(`C${currentRow}`).value = p.nombre;
            sheet.getCell(`D${currentRow}`).value = p.id;
            sheet.getCell(`E${currentRow}`).value = p.telefono;
            sheet.getCell(`F${currentRow}`).value = p.faltantes;
            
            // Add a subtle bottom border
            ['B', 'C', 'D', 'E', 'F'].forEach((col) => {
                sheet.getCell(`${col}${currentRow}`).border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
            });
            currentRow++;
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
