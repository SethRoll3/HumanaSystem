
import { Consultation, Patient, UserProfile, ReferralGroup } from '../types.ts';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { LOGO_BASE64 } from '../data/assets.ts';
import { LOGOLARGO_BASE64 } from '../data/assets.ts';
import { specialtyFormsService } from './specialtyFormsService';
import { translateSpecialtyLabel } from '../utils/specialtyTranslation';
import type { SpecialtyFormDefinition } from '../components/Wizard/SpecialtyForms/types';

// --- CONFIGURACIÓN DE COLORES (PROFESSIONAL WARM NEUTRAL) ---
// Paleta Neutra Cálida: Gris Carbón + Bronce Suave. Sin tonos morados/azules.
const COLORS = {
    PRIMARY: [51, 51, 51],      // #333333 - Gris Carbón Neutro (Elegante)
    ACCENT: [166, 124, 82],     // #A67C52 - Bronce/Cafe Suave (Cálido y Profesional)
    HEADER_BG: [255, 253, 250], // #FFFDFA - Blanco Crema (Muy sutil)
    TEXT_DARK: [30, 30, 30],    // #1E1E1E - Casi Negro
    TEXT_GRAY: [100, 100, 100], // #646464 - Gris Medio
    BG_LIGHT: [250, 248, 245],  // #FAF8F5 - Fondo Cálido Muy Claro
    BORDER: [220, 215, 210],    // #DCD7D2 - Borde Cálido Grisáceo
    WATERMARK: [166, 124, 82]   // Mismo bronce para marca de agua
};

const resolveFichaLabel = (
    forms: SpecialtyFormDefinition[],
    formId: string | undefined,
    fieldKey: string
) => {
    return translateSpecialtyLabel(fieldKey, forms, formId);
};

// Helper to lazy load PDF libraries
const loadPdfLibs = async () => {
  const { jsPDF } = await import('jspdf');
  let autoTable;
  try {
    const mod = await import('jspdf-autotable');
    autoTable = mod.default || mod;
  } catch (e) {
    console.warn("AutoTable failed to load dynamically", e);
  }
  return { jsPDF, autoTable };
};

const handlePdfOutput = (doc: any, filename: string, action: 'download' | 'print') => {
    if (action === 'print') {
        doc.autoPrint();
        const blob = doc.output('bloburl');
        window.open(blob, '_blank');
    } else {
        doc.save(filename);
    }
};

// --- MARCA DE AGUA (SUTIL Y ELEGANTE) ---
const drawWatermark = (doc: any) => {
    const logoToUse = LOGO_BASE64 || LOGOLARGO_BASE64;
    if (!logoToUse) return; 

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    doc.saveGraphicsState();

    try {
        if (doc.GState) {
            doc.setGState(new doc.GState({ opacity: 0.08 })); // 8% opacidad (muy sutil)
        }
        
        const imgWidth = 70;
        const imgHeight = 70; 
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        doc.addImage(logoToUse, 'PNG', x, y, imgWidth, imgHeight);
        
    } catch (e) {
        console.warn("Watermark transparency issue", e);
    } finally {
        doc.restoreGraphicsState();
        try { if (doc.GState) doc.setGState(new doc.GState({ opacity: 1.0 })); } catch(e) {}
    }
};

// --- HEADER PROFESIONAL (LOGO DINÁMICO) ---
const drawHeader = (doc: any, doctor: UserProfile, consultation: Consultation) => {
    // 1. Fondo Header Sutil
    doc.setFillColor(COLORS.HEADER_BG[0], COLORS.HEADER_BG[1], COLORS.HEADER_BG[2]);
    doc.rect(0, 0, 210, 40, 'F'); 

    // 2. Logo Largo (Izquierda) - AJUSTE DINÁMICO DE PROPORCIÓN
    if (LOGOLARGO_BASE64) {
        try {
            const imgProps = doc.getImageProperties(LOGOLARGO_BASE64);
            const originalWidth = imgProps.width;
            const originalHeight = imgProps.height;
            
            // Definimos el área máxima disponible para el logo
            const maxWidth = 70;
            const maxHeight = 25;
            
            // Calculamos el ratio para ajustar sin deformar ("contain")
            const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
            
            const newWidth = originalWidth * ratio;
            const newHeight = originalHeight * ratio;

            // Centramos verticalmente en el espacio asignado (y=8 a y=35 aprox)
            // Espacio disponible 25mm.
            const yPos = 10 + (25 - newHeight) / 2;

            doc.addImage(LOGOLARGO_BASE64, 'PNG', 14, yPos, newWidth, newHeight); 
        } catch (e) {
            console.error("Error drawing logo dynamically", e);
            // Fallback si falla
            doc.addImage(LOGOLARGO_BASE64, 'PNG', 14, 12, 55, 18);
        }
    } else if (LOGO_BASE64) {
        try {
            doc.addImage(LOGO_BASE64, 'PNG', 14, 8, 22, 22);
            doc.setFontSize(16);
            doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
            doc.setFont("helvetica", "bold");
            doc.text("Asociación Humana", 42, 20);
        } catch(e) {}
    }

    // 3. Información de Fecha y Ubicación (Derecha)
    const guateDate = new Date(consultation.date).toLocaleString('es-GT', { 
        timeZone: 'America/Guatemala',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    doc.setFontSize(9);
    doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
    doc.setFont("helvetica", "normal");
    
    // Alineado a la derecha con un diseño más limpio
    doc.text(guateDate, 196, 18, { align: 'right' });
    doc.text("Guatemala, C.A.", 196, 23, { align: 'right' });
    
    // 4. Línea decorativa inferior del header
    doc.setDrawColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]);
    doc.setLineWidth(0.8);
    doc.line(14, 38, 196, 38);
};

// --- INFO PACIENTE (ESTILO COLUMNAS / CLEAN) ---
const drawPatientInfo = (doc: any, patient: Patient, consultation: Consultation) => {
    // No usamos "caja" cerrada, sino un diseño abierto más moderno y limpio.
    
    const startY = 48;
    
    doc.setFontSize(10);
    doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
    doc.setFont("helvetica", "bold");
    
    // Columna 1
    doc.text("PACIENTE:", 14, startY);
    doc.text("DPI / ID:", 14, startY + 6);
    
    // Columna 2
    doc.text("EDAD:", 110, startY);
    doc.text("GÉNERO:", 110, startY + 6);

    // Valores
    doc.setFontSize(10);
    doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
    doc.setFont("helvetica", "normal");

    doc.text(patient.fullName.toUpperCase(), 38, startY);
    doc.text(patient.id || "---", 38, startY + 6);
    
    doc.text(`${patient.age || 0} años`, 130, startY);
    
    const genderStr = patient.gender ? patient.gender.toString().toLowerCase() : '';
    const isMale = genderStr === 'm' || genderStr.startsWith('masc');
    doc.text(isMale ? 'Masculino' : 'Femenino', 130, startY + 6);
};

// --- FIRMA (PROFESIONAL) ---
const drawSignature = async (doc: any, currentY: number, doctor: UserProfile, consultation: Consultation) => {
    const pageHeight = doc.internal.pageSize.height;
    // Footer siempre al final
    const footerY = pageHeight - 35;
    
    // Si el contenido empuja mucho, nueva página para la firma
    if (currentY > footerY - 20) {
        doc.addPage();
        currentY = 40;
    } else {
        // Empujar la firma hacia abajo si hay espacio, para que se vea bien
        currentY = Math.max(currentY + 10, footerY - 40); 
    }

    const signatureY = currentY; 
    
    // Firma Digital
    if (consultation.signature && consultation.signature.type === 'digital_p12') {
        const sig = consultation.signature;
        const signDate = new Date(sig.signatureDate || Date.now()).toLocaleString('es-GT');
        
        // Marco de firma digital elegante
        doc.setDrawColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]);
        doc.setLineWidth(0.5);
        doc.roundedRect(60, signatureY, 90, 28, 1, 1);
        
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]);
        doc.text("FIRMADO DIGITALMENTE", 105, signatureY + 5, { align: 'center' });
        
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        
        doc.text(`Dr(a). ${sig.signerName || doctor.name}`, 105, signatureY + 10, { align: 'center' });
        doc.text(`Fecha: ${signDate}`, 105, signatureY + 14, { align: 'center' });
        
        doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
        doc.text(`Serial: ${sig.certificateSerial || 'N/A'}`, 105, signatureY + 18, { align: 'center' });
        doc.text(`ID Consulta: ${consultation.id?.substring(0, 16).toUpperCase()}`, 105, signatureY + 22, { align: 'center' });

    } else {
      // Firma Manual
      doc.setDrawColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
      doc.setLineWidth(0.3);
      doc.line(70, signatureY + 15, 140, signatureY + 15);
      
      doc.setFontSize(10); 
      doc.setFont("helvetica", "bold");
      doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
      doc.text("Dr(a). " + doctor.name, 105, signatureY + 20, { align: 'center' });
      
      doc.setFontSize(9); 
      doc.setFont("helvetica", "normal");
      doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
      doc.text(doctor.specialty || "Medicina General", 105, signatureY + 25, { align: 'center' });
    }

    // Footer Oficial
    doc.setDrawColor(COLORS.BORDER[0], COLORS.BORDER[1], COLORS.BORDER[2]);
    doc.setLineWidth(0.5);
    doc.line(14, pageHeight - 15, 196, pageHeight - 15);
    
    doc.setFontSize(7); 
    doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
    doc.text("Humana System - Centro de Epilepsia y Neurocirugía Funcional", 14, pageHeight - 10);
    doc.text(`Página ${doc.internal.getCurrentPageInfo().pageNumber}`, 196, pageHeight - 10, { align: 'right' });
};

// ==========================================
// 1. REPORTE DE ENFERMERÍA / RESUMEN CONSULTA
// ==========================================
export const generateNursingPDF = async (
    consultation: Consultation,
    patient: Patient,
    doctor: UserProfile,
    action: 'download' | 'print' = 'download'
) => {
    try {
        const { jsPDF, autoTable } = await loadPdfLibs();
        const pdfDoc = new jsPDF(); 
        
        drawWatermark(pdfDoc);
        drawHeader(pdfDoc, doctor, consultation); 
        drawPatientInfo(pdfDoc, patient, consultation);

        let currentY = 70;

        // Título Principal
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        pdfDoc.text("REPORTE DE CONSULTA", 14, currentY); 
        
        // Subtítulo Tipo de Consulta
        pdfDoc.setFontSize(10);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
        const typeStr = consultation.consultationType || "Consulta General";
        pdfDoc.text(typeStr.toUpperCase(), 196, currentY, { align: 'right' });

        currentY += 10;

        // --- 1. DIAGNÓSTICO (Full Width) ---
        const diagnosisText = consultation.diagnosis || "Sin diagnóstico registrado.";
        
        if (autoTable) {
            autoTable(pdfDoc, {
                startY: currentY,
                head: [['DIAGNÓSTICO MÉDICO']],
                body: [[diagnosisText]],
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 2, textColor: COLORS.TEXT_DARK },
                headStyles: { 
                    fillColor: COLORS.BG_LIGHT, 
                    textColor: COLORS.PRIMARY, 
                    fontSize: 10, 
                    fontStyle: 'bold',
                    halign: 'left'
                },
                margin: { left: 14, right: 14 }
            });
            // @ts-ignore
            currentY = pdfDoc.lastAutoTable.finalY + 10;
        }

        // --- 2. ÓRDENES CLÍNICAS (2 COLUMNAS: Tratamiento y Labs) ---
        // Tratamiento
        const medsRows = consultation.prescription?.map(p => `• ${p.name} (${p.quantity})\n  ${p.dosage}`) || ["Ninguno"];
        // Notas de receta
        if (consultation.prescriptionNotes) {
            medsRows.push(`NOTA: ${consultation.prescriptionNotes}`);
        }

        // Laboratorios
        const labsRows: string[] = [];
        consultation.referralGroups?.forEach(g => {
            labsRows.push(`[${g.pathology}]`);
            g.exams.forEach(e => labsRows.push(`• ${e}`));
            if (g.note) labsRows.push(`  Nota: ${g.note}`);
        });
        consultation.exams?.forEach(e => labsRows.push(`• ${e}`));
        if (consultation.referralNote) {
            labsRows.push(`NOTA GENERAL: ${consultation.referralNote}`);
        }
        if (labsRows.length === 0) labsRows.push("Ninguno");

        // Combinar
        const maxRows = Math.max(medsRows.length, labsRows.length);
        const combinedBody = [];
        for (let i = 0; i < maxRows; i++) {
            combinedBody.push([
                medsRows[i] || "",
                labsRows[i] || ""
            ]);
        }

        if (autoTable) {
            autoTable(pdfDoc, {
                startY: currentY,
                head: [['TRATAMIENTO / RECETA', 'LABORATORIOS / ESTUDIOS']],
                body: combinedBody,
                theme: 'grid',
                styles: { 
                    fontSize: 9, 
                    cellPadding: 4, 
                    textColor: COLORS.TEXT_DARK,
                    lineColor: COLORS.BORDER,
                    lineWidth: 0.1,
                    valign: 'top'
                },
                headStyles: { 
                    fillColor: COLORS.PRIMARY, 
                    textColor: [255, 255, 255], 
                    fontSize: 10, 
                    fontStyle: 'bold',
                    halign: 'center'
                },
                columnStyles: {
                    0: { cellWidth: 91 },
                    1: { cellWidth: 91 }
                },
                margin: { left: 14, right: 14 }
            });
            // @ts-ignore
            currentY = pdfDoc.lastAutoTable.finalY + 10;
        }

        // --- 4. REFERENCIAS A ESPECIALISTAS (Si existen) ---
        if (consultation.specialtyReferrals && consultation.specialtyReferrals.length > 0) {
            const referralRows = consultation.specialtyReferrals.map(r => [
                r.specialty,
                r.note || "---"
            ]);

            if (autoTable) {
                autoTable(pdfDoc, {
                    startY: currentY,
                    head: [['REFERENCIA A ESPECIALIDAD', 'MOTIVO / NOTA']],
                    body: referralRows,
                    theme: 'grid',
                    styles: { fontSize: 9, cellPadding: 3, textColor: COLORS.TEXT_DARK, lineColor: COLORS.BORDER, lineWidth: 0.1 },
                    headStyles: { fillColor: COLORS.PRIMARY, textColor: [255, 255, 255], fontSize: 10, fontStyle: 'bold' },
                    columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' }, 1: { cellWidth: 122 } },
                    margin: { left: 14, right: 14 }
                });
                // @ts-ignore
                currentY = pdfDoc.lastAutoTable.finalY + 10;
            }
        }

        // --- 5. AVISOS IMPORTANTES (Si existen) ---
        if (consultation.importantNotices) {
             if (autoTable) {
                autoTable(pdfDoc, {
                    startY: currentY,
                    head: [['AVISOS IMPORTANTES / ALARMAS']],
                    body: [[consultation.importantNotices]],
                    theme: 'plain',
                    styles: { fontSize: 10, cellPadding: 2, textColor: [200, 50, 50] }, // Rojo oscuro para resaltar importancia
                    headStyles: { fillColor: COLORS.BG_LIGHT, textColor: COLORS.PRIMARY, fontSize: 10, fontStyle: 'bold' },
                    margin: { left: 14, right: 14 }
                });
                // @ts-ignore
                currentY = pdfDoc.lastAutoTable.finalY + 10;
            }
        }

        // --- 6. SALUD MENTAL / OBSERVACIONES (Si existen) ---
        if (consultation.mentalHealthObservation) {
            if (autoTable) {
                autoTable(pdfDoc, {
                    startY: currentY,
                    head: [['OBSERVACIONES DE SALUD MENTAL / PSICOLOGÍA']],
                    body: [[consultation.mentalHealthObservation]],
                    theme: 'plain',
                    styles: { fontSize: 10, cellPadding: 2, textColor: COLORS.TEXT_DARK },
                    headStyles: { fillColor: COLORS.BG_LIGHT, textColor: COLORS.PRIMARY, fontSize: 10, fontStyle: 'bold' },
                    margin: { left: 14, right: 14 }
                });
                // @ts-ignore
                currentY = pdfDoc.lastAutoTable.finalY + 10;
            }
        }

        // --- 7. INDICACIONES DE ENFERMERÍA / PLAN (Full Width) ---
        const notesText = consultation.followUpText || "Sin indicaciones adicionales.";

        if (autoTable) {
            autoTable(pdfDoc, {
                startY: currentY,
                head: [['INDICACIONES DE ENFERMERÍA / PLAN DE SEGUIMIENTO']],
                body: [[notesText]],
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 2, textColor: COLORS.TEXT_DARK },
                headStyles: { 
                    fillColor: COLORS.BG_LIGHT, 
                    textColor: COLORS.PRIMARY, 
                    fontSize: 10, 
                    fontStyle: 'bold',
                    halign: 'left'
                },
                margin: { left: 14, right: 14 }
            });
            // @ts-ignore
            currentY = pdfDoc.lastAutoTable.finalY + 15;
        }

        await drawSignature(pdfDoc, currentY, doctor, consultation);

        handlePdfOutput(pdfDoc, `ReporteConsulta_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);

    } catch (error) {
        console.error("PDF Nursing Generation Error", error);
        alert("Error generando reporte de consulta.");
    }
};

// ==========================================
// 2. FICHA CLÍNICA COMPLETA (LAYOUT COLUMNAS)
// ==========================================
export const generateFullFichaPDF = async (
    consultation: Consultation,
    patient: Patient,
    doctor: UserProfile,
    action: 'download' | 'print' = 'download'
) => {
    try {
        const { jsPDF, autoTable } = await loadPdfLibs();
        const pdfDoc = new jsPDF();

        drawWatermark(pdfDoc);
        drawHeader(pdfDoc, doctor, consultation);
        drawPatientInfo(pdfDoc, patient, consultation);

        let currentY = 70;

        // Título
        pdfDoc.setFontSize(14);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        pdfDoc.text("FICHA CLÍNICA", 14, currentY);
        currentY += 10;

        // 1. Diagnóstico
        const diagnosisText = consultation.diagnosis || "Sin diagnóstico registrado.";
        autoTable(pdfDoc, {
            startY: currentY,
            head: [['DIAGNÓSTICO PRINCIPAL']],
            body: [[diagnosisText]],
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 2, textColor: COLORS.TEXT_DARK },
            headStyles: { fillColor: COLORS.BG_LIGHT, textColor: COLORS.PRIMARY, fontSize: 10, fontStyle: 'bold' },
            margin: { left: 14, right: 14 }
        });
        // @ts-ignore
        currentY = pdfDoc.lastAutoTable.finalY + 8;

        // 2. Datos Clínicos (Especialidad) - EN 2 COLUMNAS
        const forms = await specialtyFormsService.getAll();
        const formId = (consultation as any).specialtyFormId as string | undefined;
        const specialtyData = (consultation as any).specialtyData as Record<string, any> | undefined;
        
        let specialtyEntries = specialtyData ? Object.entries(specialtyData) : [];
        const activeForm = formId ? forms.find(f => f.id === formId) : undefined;

        if (activeForm) {
            const allowedIds = new Set(activeForm.sections.flatMap(section => section.fields.map(field => field.id)));
            specialtyEntries = specialtyEntries.filter(([key]) => allowedIds.has(key));
        }

        if (specialtyEntries.length > 0) {
            // Convertir entradas plana a pares para 2 columnas
            const rows = [];
            for (let i = 0; i < specialtyEntries.length; i += 2) {
                const item1 = specialtyEntries[i];
                const item2 = specialtyEntries[i+1];
                
                const label1 = resolveFichaLabel(forms, formId, item1[0]);
                const val1 = item1[1] ? String(item1[1]) : '---';
                
                let row = [`${label1}:\n${val1}`];

                if (item2) {
                    const label2 = resolveFichaLabel(forms, formId, item2[0]);
                    const val2 = item2[1] ? String(item2[1]) : '---';
                    row.push(`${label2}:\n${val2}`);
                } else {
                    row.push("");
                }
                rows.push(row);
            }

            autoTable(pdfDoc, {
                startY: currentY,
                head: [['DATOS CLÍNICOS', '']], // Header spans
                body: rows,
                theme: 'plain',
                styles: { 
                    fontSize: 9, 
                    cellPadding: 4, 
                    textColor: COLORS.TEXT_DARK,
                    valign: 'top',
                    overflow: 'linebreak'
                },
                headStyles: { 
                    fillColor: COLORS.BG_LIGHT, 
                    textColor: COLORS.PRIMARY, 
                    fontSize: 10, 
                    fontStyle: 'bold' 
                },
                columnStyles: {
                    0: { cellWidth: 91 },
                    1: { cellWidth: 91 }
                },
                margin: { left: 14, right: 14 }
            });
            // @ts-ignore
            currentY = pdfDoc.lastAutoTable.finalY + 8;
        }

        // 3. Plan / Indicaciones
        if (consultation.followUpText) {
             autoTable(pdfDoc, {
                startY: currentY,
                head: [['PLAN / INDICACIONES']],
                body: [[consultation.followUpText]],
                theme: 'plain',
                styles: { fontSize: 10, cellPadding: 2, textColor: COLORS.TEXT_DARK },
                headStyles: { fillColor: COLORS.BG_LIGHT, textColor: COLORS.PRIMARY, fontSize: 10, fontStyle: 'bold' },
                margin: { left: 14, right: 14 }
            });
            // @ts-ignore
            currentY = pdfDoc.lastAutoTable.finalY + 15;
        }

        await drawSignature(pdfDoc, currentY, doctor, consultation);

        handlePdfOutput(
            pdfDoc,
            `FichaClinica_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`,
            action
        );
    } catch (error) {
        console.error("PDF Full Ficha Generation Error", error);
        alert("Error generando ficha clínica completa.");
    }
};

// ==========================================
// 3. RECETA MÉDICA (PRESCRIPTION)
// ==========================================
export const generatePrescriptionPDF = async (
    consultation: Consultation, 
    patient: Patient, 
    doctor: UserProfile, 
    action: 'download' | 'print' = 'download'
) => {
  try {
    const { jsPDF, autoTable } = await loadPdfLibs();
    const doc = new jsPDF();
    
    drawWatermark(doc);
    drawHeader(doc, doctor, consultation); 
    drawPatientInfo(doc, patient, consultation);

    let currentY = 75; 

    // Título elegante
    doc.setFontSize(16); 
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
    doc.text("RECETA MÉDICA", 105, currentY, { align: 'center' });
    currentY += 12;

    // Diagnóstico sutil
    doc.setFontSize(10); 
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
    const diagText = consultation.diagnosis ? `Diagnóstico: ${consultation.diagnosis}` : "";
    if (diagText) {
        const splitDiag = doc.splitTextToSize(diagText, 180);
        doc.text(splitDiag, 105, currentY, { align: 'center' });
        currentY += (splitDiag.length * 5) + 8;
    }

    if (consultation.prescription && consultation.prescription.length > 0) {
        const tableBody = consultation.prescription.map(item => {
            let qtyDisplay = item.quantity.toString();
            if (item.units_per_box && item.units_per_box > 1) {
                const boxes = item.quantity / item.units_per_box;
                qtyDisplay = boxes >= 1 
                    ? (boxes % 1 === 0 ? `${boxes} Cajas` : `${boxes.toFixed(1)} Cajas`) 
                    : `${item.quantity} Unid.`;
            } else {
                qtyDisplay = `${item.quantity} Unid.`;
            }

            return [item.name, qtyDisplay, item.dosage];
        });

        if (autoTable) {
            autoTable(doc, {
                startY: currentY,
                head: [['MEDICAMENTO', 'CANTIDAD', 'INDICACIONES / DOSIS']], 
                body: tableBody,
                theme: 'striped', // Striped is better for reading lists
                margin: { left: 14, right: 14 },
                tableWidth: 182, 
                styles: {
                    fontSize: 10,
                    cellPadding: 6,
                    textColor: COLORS.TEXT_DARK,
                    valign: 'middle',
                },
                headStyles: { 
                    fillColor: COLORS.PRIMARY, 
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    halign: 'left',
                    cellPadding: 8
                },
                columnStyles: {
                    0: { cellWidth: 70, fontStyle: 'bold' }, 
                    1: { cellWidth: 30, halign: 'center' }, 
                    2: { cellWidth: 82 } 
                },
                alternateRowStyles: {
                    fillColor: COLORS.BG_LIGHT
                }
            });
        }
        // @ts-ignore
        currentY = (doc.lastAutoTable?.finalY || currentY) + 15;
    }

    if (consultation.prescriptionNotes && consultation.prescriptionNotes.trim().length > 0) {
        // Caja de Observaciones Elegante
        doc.setDrawColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]);
        doc.setLineWidth(0.5);
        doc.line(14, currentY, 50, currentY); // Pequeña línea decorativa
        
        doc.setFontSize(9); 
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]); 
        doc.text("OBSERVACIONES", 14, currentY + 5);
        
        doc.setFontSize(10); 
        doc.setFont("helvetica", "normal");
        doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        
        const splitNotes = doc.splitTextToSize(consultation.prescriptionNotes, 182);
        doc.text(splitNotes, 14, currentY + 12);
        currentY += (splitNotes.length * 5) + 20;
    }
    
    await drawSignature(doc, currentY, doctor, consultation);

    handlePdfOutput(doc, `Receta_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);

  } catch (error) {
    console.error("PDF Generation Error", error);
    alert("Error generando receta médica.");
  }
};

// ==========================================
// 4. LABORATORIOS (EXAMS)
// ==========================================
export const generateExamsPDF = async (
    consultation: Consultation,
    patient: Patient,
    doctor: UserProfile,
    action: 'download' | 'print' = 'download'
) => {
    try {
        const { jsPDF, autoTable } = await loadPdfLibs();
        const doc = new jsPDF();
        
        drawWatermark(doc);
        drawHeader(doc, doctor, consultation);
        drawPatientInfo(doc, patient, consultation);

        let currentY = 75;

        doc.setFontSize(16); 
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        doc.text("SOLICITUD DE LABORATORIOS", 105, currentY, { align: 'center' });
        
        currentY += 15;

        const uniqueExams = new Set<string>();
        consultation.referralGroups?.forEach(g => g.exams.forEach(e => uniqueExams.add(e)));
        consultation.exams?.forEach(e => uniqueExams.add(e));
        const allExamsList = Array.from(uniqueExams).sort();

        if (allExamsList.length > 0) {
            // Layout de 2 columnas para la lista de exámenes para ahorrar espacio y verse pro
            const rows = [];
            for (let i = 0; i < allExamsList.length; i += 2) {
                rows.push([
                    allExamsList[i],
                    allExamsList[i+1] || ""
                ]);
            }

            if (autoTable) {
                autoTable(doc, {
                    startY: currentY,
                    head: [['EXAMEN SOLICITADO', '']],
                    body: rows,
                    theme: 'grid',
                    margin: { left: 14, right: 14 },
                    tableWidth: 182,
                    styles: {
                        fontSize: 10, 
                        cellPadding: 5,
                        textColor: COLORS.TEXT_DARK,
                        valign: 'middle',
                        lineColor: COLORS.BORDER,
                        lineWidth: 0.1
                    },
                    headStyles: { 
                        fillColor: COLORS.PRIMARY,
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        halign: 'left',
                        cellPadding: 6
                    },
                    alternateRowStyles: {
                        fillColor: COLORS.BG_LIGHT
                    }
                });
            }
            // @ts-ignore
            currentY = (doc.lastAutoTable?.finalY || currentY) + 25;
        } else {
             doc.setFontSize(11);
             doc.setFont("helvetica", "italic");
             doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
             doc.text("No se han solicitado exámenes específicos.", 105, currentY, { align: 'center' });
             currentY += 25;
        }

        await drawSignature(doc, currentY, doctor, consultation);

        handlePdfOutput(doc, `Laboratorios_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);

    } catch (error) {
        console.error("PDF Generation Error", error);
        alert("Error generando PDF de exámenes.");
    }
};
