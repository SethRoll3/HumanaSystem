import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Patient } from '../types';
import ExcelJS from 'exceljs';

export const generateQualityReportExcel = async (dateStr: string): Promise<Blob> => {
    const start = new Date(`${dateStr}T00:00:00`);
    const end = new Date(`${dateStr}T23:59:59.999`);

    let casesToday: Patient[] = [];
    try {
        const casesSnap = await getDocs(query(
            collection(db, 'patients'),
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end))
        ));
        casesToday = casesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Patient));
    } catch (e) {
        console.error('Error fetching cases for quality report', e);
    }

    const qualityCases: Array<{
        nombre: string;
        id: string;
        telefono: string;
        severidad: 'CRÍTICO' | 'ALERTA' | 'OBSERVACIÓN';
        faltantes: string;
    }> = [];

    for (const p of casesToday) {
        const missing: string[] = [];
        if (!p.dpi?.trim()) missing.push('DPI');
        if (!p.billingCode?.trim()) missing.push('Código Facturación');
        if (!p.phone?.trim()) missing.push('Teléfono');
        if (!p.gender) missing.push('Género');
        if (!p.referralChannel) missing.push('Canal Referencia');
        if (!p.birthDate && !p.age) missing.push('Edad/Fecha Nac.');
        if (!p.address?.department && !p.address?.municipality) missing.push('Dirección');

        if (missing.length > 0) {
            const severidad = missing.length >= 5 ? 'CRÍTICO' : missing.length >= 3 ? 'ALERTA' : 'OBSERVACIÓN';
            qualityCases.push({
                nombre: p.fullName || 'Incompleto',
                id: p.id,
                telefono: p.phone || 'N/A',
                severidad,
                faltantes: missing.join(', ')
            });
        }
    }

    const sevOrder: Record<string, number> = { CRÍTICO: 0, ALERTA: 1, OBSERVACIÓN: 2 };
    qualityCases.sort((a, b) => sevOrder[a.severidad] - sevOrder[b.severidad]);
    const criticalCount = qualityCases.filter(c => c.severidad === 'CRÍTICO').length;
    const alertCount = qualityCases.filter(c => c.severidad === 'ALERTA').length;

    let bitacoraRows: any[] = [];
    try {
        const bitacoraSnap = await getDocs(query(collection(db, 'quality_reviews'), where('dateKey', '==', dateStr)));
        bitacoraRows = bitacoraSnap.docs.map(d => d.data());
    } catch (e) {
        console.error('Error fetching quality review logs', e);
    }

    // Fallback: si no existe documento en quality_reviews, reconstruimos desde audit_logs.
    // Esto cubre escenarios donde la bitácora quedó en log de auditoría pero no en la colección principal.
    if (bitacoraRows.length === 0) {
        try {
            const start = new Date(`${dateStr}T00:00:00-06:00`).getTime();
            const end = new Date(`${dateStr}T23:59:59.999-06:00`).getTime();
            const auditSnap = await getDocs(query(
                collection(db, 'audit_logs'),
                where('action', '==', 'REVISION_CALIDAD_DATOS'),
                where('timestamp', '>=', start),
                where('timestamp', '<=', end)
            ));
            bitacoraRows = auditSnap.docs.map(d => {
                const row = d.data() as any;
                const details = String(row.details || '');
                const bitacoraMatch = details.match(/Bitácora:\s*([\s\S]*?)(?:\s*\[Fecha GT:|$)/i);
                const reviewerFromDetails = details.match(/^([^[]*?)\s+revisó/i)?.[1]?.trim();
                return {
                    reviewerName: reviewerFromDetails || row.user || '',
                    reviewerEmail: row.user || '',
                    reviewedCasesCount: 0,
                    criticalToday: 0,
                    bitacora: (bitacoraMatch?.[1] || '').trim()
                };
            }).filter(r => !!r.bitacora);
        } catch (e) {
            console.error('Error fetching fallback quality logs', e);
        }
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte de Calidad', {
        properties: { tabColor: { argb: 'FF0F172A' } },
        views: [{ showGridLines: false }]
    });

    sheet.columns = [
        { width: 3 },
        { width: 22 },
        { width: 28 },
        { width: 18 },
        { width: 18 },
        { width: 42 },
        { width: 3 },
    ];

    let currentRow = 2;

    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const titleCell = sheet.getCell(`B${currentRow}`);
    titleCell.value = ' REPORTE DIARIO DE CONTROL DE INGRESO DE INFORMACIÓN';
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    currentRow++;

    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const subCell = sheet.getCell(`B${currentRow}`);
    subCell.value = `Resumen del día: ${dateStr}`;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    currentRow += 2;

    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec1 = sheet.getCell(`B${currentRow}`);
    sec1.value = ' 1. INDICADORES CLAVE';
    sec1.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };
    sec1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
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

    fillSummaryBox('B', 'Casos Ingresados', casesToday.length, 'FFF0F9FF', 'FF0284C7');
    fillSummaryBox('C', 'Críticos', criticalCount, 'FFFEE2E2', 'FFDC2626');
    fillSummaryBox('D', 'Alerta', alertCount, 'FFFEF3C7', 'FFD97706');
    currentRow += 3;

    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec2 = sheet.getCell(`B${currentRow}`);
    sec2.value = ` 2. CASOS CRÍTICOS Y ALERTA (${qualityCases.length})`;
    sec2.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF991B1B' } };
    sec2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    sec2.border = { bottom: { style: 'thick', color: { argb: 'FFCBD5E1' } } };
    currentRow += 2;

    if (qualityCases.length === 0) {
        sheet.mergeCells(`B${currentRow}:F${currentRow}`);
        const okCell = sheet.getCell(`B${currentRow}`);
        okCell.value = '✅ Sin casos críticos o de alerta en el día.';
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
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
            cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        });
        currentRow++;

        qualityCases.forEach(p => {
            const isCrit = p.severidad === 'CRÍTICO';
            const isAlert = p.severidad === 'ALERTA';
            sheet.getCell(`B${currentRow}`).value = p.severidad;
            sheet.getCell(`B${currentRow}`).font = { bold: true, color: isCrit ? { argb: 'FFDC2626' } : isAlert ? { argb: 'FFD97706' } : { argb: 'FF2563EB' }, size: 9 };
            sheet.getCell(`B${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: isCrit ? { argb: 'FFFEE2E2' } : isAlert ? { argb: 'FFFEF3C7' } : { argb: 'FFDBEAFE' } };
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

    currentRow += 1;
    sheet.mergeCells(`B${currentRow}:F${currentRow}`);
    const sec3 = sheet.getCell(`B${currentRow}`);
    sec3.value = ` 3. BITÁCORA DIARIA DE REVISIÓN (${bitacoraRows.length})`;
    sec3.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF334155' } };
    sec3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    sec3.border = { bottom: { style: 'thick', color: { argb: 'FFCBD5E1' } } };
    currentRow += 2;

    if (bitacoraRows.length === 0) {
        sheet.mergeCells(`B${currentRow}:F${currentRow}`);
        const noLogCell = sheet.getCell(`B${currentRow}`);
        noLogCell.value = 'No hay bitácora registrada para esta fecha.';
        noLogCell.font = { bold: true, color: { argb: 'FFB45309' } };
        noLogCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        currentRow += 2;
    } else {
        ['B', 'C', 'D', 'E', 'F'].forEach((col, i) => {
            const labels = ['Revisor', 'Correo', 'Revisados', 'Críticos', 'Bitácora'];
            const cell = sheet.getCell(`${col}${currentRow}`);
            cell.value = labels[i];
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
        });
        currentRow++;
        bitacoraRows.forEach((row) => {
            sheet.getCell(`B${currentRow}`).value = row.reviewerName || '';
            sheet.getCell(`C${currentRow}`).value = row.reviewerEmail || '';
            sheet.getCell(`D${currentRow}`).value = row.reviewedCasesCount || 0;
            sheet.getCell(`E${currentRow}`).value = row.criticalToday || 0;
            sheet.getCell(`F${currentRow}`).value = row.bitacora || '';
            ['B', 'C', 'D', 'E', 'F'].forEach((col) => {
                sheet.getCell(`${col}${currentRow}`).font = { size: 9 };
                sheet.getCell(`${col}${currentRow}`).alignment = { vertical: 'top', horizontal: col === 'F' ? 'left' : 'center', wrapText: col === 'F' };
                sheet.getCell(`${col}${currentRow}`).border = { bottom: { style: 'thin', color: { argb: 'FFF1F5F9' } } };
            });
            currentRow++;
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};
