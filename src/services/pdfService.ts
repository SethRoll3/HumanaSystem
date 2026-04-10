
import { Consultation, Patient, UserProfile, ReferralGroup, ResonanceOrder, EegOrder } from '../types.ts';
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

const getGuatemalaDateParts = (date: Date) => {
    const parts = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: 'long', year: 'numeric' }).formatToParts(date);
    const day = parts.find(p => p.type === 'day')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const year = parts.find(p => p.type === 'year')?.value || '';
    return { day, month, year };
};

const drawClinicLogo = (doc: any, x: number, y: number, w: number, h: number) => {
    const logo = LOGO_BASE64 || LOGOLARGO_BASE64;
    if (logo) doc.addImage(logo, 'PNG', x, y, w, h);
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
    
    // Columna 2
    doc.text("EDAD:", 135, startY);
    doc.text("GÉNERO:", 165, startY);

    // Valores
    doc.setFontSize(10);
    doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
    doc.setFont("helvetica", "normal");

    // Enable maxWidth so extremely long names don't overlap into EDAD
    doc.text(patient.fullName.toUpperCase(), 35, startY, { maxWidth: 95 });
    doc.text(`${patient.age || 0} años`, 147, startY);
    
    const genderStr = patient.gender ? patient.gender.toString().toLowerCase() : '';
    const isMale = genderStr === 'm' || genderStr.startsWith('masc');
    doc.text(isMale ? 'Masculino' : 'Femenino', 183, startY);
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
      const specialtiesList = Array.isArray(doctor.specialties) && doctor.specialties.length > 0
        ? doctor.specialties
        : (doctor.specialty ? [doctor.specialty] : []);
      const specialtyLabel = specialtiesList.join(', ') || "Medicina General";
      doc.text(specialtyLabel, 105, signatureY + 25, { align: 'center' });
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
        if (consultation.followUpRequestText) {
            medsRows.push(`RECONSULTA: ${consultation.followUpRequestText}`);
        }
        if (consultation.followUpEstimatedDate) {
            const followUpDateText = new Date(consultation.followUpEstimatedDate).toLocaleDateString('es-GT');
            medsRows.push(`FECHA APROX.: ${followUpDateText}${consultation.followUpDays ? ` (aprox. ${consultation.followUpDays} días)` : ''}`);
        }

        // Laboratorios
        const labsRows: string[] = [];
        const shouldIncludeExam = (exam: string) => {
            const normalized = exam.toLowerCase();
            const isLabToggle = normalized.includes('laboratorios') && !exam.startsWith('Laboratorios:');
            return !isLabToggle;
        };
        consultation.referralGroups?.forEach(g => {
            const filtered = g.exams.filter(shouldIncludeExam);
            if (filtered.length === 0 && !g.note) return;
            labsRows.push(`[${g.pathology}]`);
            filtered.forEach(e => labsRows.push(`• ${e}`));
            if (g.note) labsRows.push(`  Nota: ${g.note}`);
        });
        consultation.exams?.forEach(e => {
            if (shouldIncludeExam(e)) labsRows.push(`• ${e}`);
        });
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
        
        const decodeOptionKey = (value: string) => {
            try {
                return decodeURIComponent(value);
            } catch {
                return value;
            }
        };

        let specialtyEntriesRaw = specialtyData ? Object.entries(specialtyData) : [];
        const activeForm = formId ? forms.find(f => f.id === formId) : undefined;

        if (activeForm) {
            const allowedIds = new Set(activeForm.sections.flatMap(section => section.fields.map(field => field.id)));
            specialtyEntriesRaw = specialtyEntriesRaw.filter(([key]) => allowedIds.has(key));
        }

        let specialtyEntries: Array<[string, string]> = [];
        for (const [k, v] of specialtyEntriesRaw) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                for (const subKey of Object.keys(v)) {
                    const label = `${resolveFichaLabel(forms, formId, k)} - ${decodeOptionKey(subKey).toUpperCase()}`;
                    const val = v[subKey] ? String(v[subKey]) : '---';
                    specialtyEntries.push([label, val]);
                }
            } else {
                const label = resolveFichaLabel(forms, formId, k);
                const val = v ? String(v) : '---';
                specialtyEntries.push([label, val]);
            }
        }

        if (specialtyEntries.length > 0) {
            // Convertir entradas plana a pares para 2 columnas
            const rows = [];
            for (let i = 0; i < specialtyEntries.length; i += 2) {
                const item1 = specialtyEntries[i];
                const item2 = specialtyEntries[i+1];
                
                const label1 = item1[0];
                const val1 = item1[1] ? String(item1[1]) : '---';
                
                let row = [`${label1}:\n${val1}`];

                if (item2) {
                    const label2 = item2[0];
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

    doc.setFontSize(16); 
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
    doc.text("RECETA MÉDICA", 105, currentY, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]);
    doc.text(`No. ${consultation.prescriptionNumber || 'Pendiente'}`, 14, currentY);
    currentY += 12;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
    if (consultation.followUpEstimatedDate) {
        const followUpDateText = new Date(consultation.followUpEstimatedDate).toLocaleDateString('es-GT');
        const followUpLabel = `Próximo control (fecha aproximada): ${followUpDateText}${consultation.followUpDays ? ` (aprox. ${consultation.followUpDays} días)` : ''}`;
        doc.text(followUpLabel, 14, currentY);
        currentY += 8;
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
                    fontSize: 9,
                    halign: 'left',
                    cellPadding: 8
                },
                columnStyles: {
                    0: { cellWidth: 60, fontStyle: 'bold' }, 
                    1: { cellWidth: 40, halign: 'center' }, 
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
        // Caja de Observaciones con recuadro completo
        const splitNotes = doc.splitTextToSize(consultation.prescriptionNotes, 168);
        const boxPadding = 6;
        const titleHeight = 8;
        const textHeight = splitNotes.length * 5;
        const boxHeight = titleHeight + textHeight + boxPadding * 2 + 4;
        const boxX = 14;
        const boxW = 182;

        // Recuadro completo
        doc.setDrawColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]);
        doc.setLineWidth(0.6);
        doc.rect(boxX, currentY, boxW, boxHeight);

        // Título OBSERVACIONES dentro del recuadro
        doc.setFontSize(9); 
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.ACCENT[0], COLORS.ACCENT[1], COLORS.ACCENT[2]); 
        doc.text("OBSERVACIONES", boxX + boxPadding, currentY + boxPadding + 4);

        // Línea separadora debajo del título
        doc.setLineWidth(0.3);
        doc.line(boxX + boxPadding, currentY + boxPadding + titleHeight, boxX + boxW - boxPadding, currentY + boxPadding + titleHeight);

        // Texto de las observaciones
        doc.setFontSize(10); 
        doc.setFont("helvetica", "normal");
        doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        doc.text(splitNotes, boxX + boxPadding, currentY + boxPadding + titleHeight + 6);

        currentY += boxHeight + 10;
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
        const shouldIncludeExam = (exam: string) => {
            const normalized = exam.toLowerCase();
            const isLabToggle = normalized.includes('laboratorios') && !exam.startsWith('Laboratorios:');
            return !isLabToggle;
        };
        consultation.referralGroups?.forEach(g => g.exams.forEach(e => {
            if (shouldIncludeExam(e)) uniqueExams.add(e);
        }));
        consultation.exams?.forEach(e => {
            if (shouldIncludeExam(e)) uniqueExams.add(e);
        });
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

export const generateResonanceOrdersPDF = async (
    consultation: Consultation,
    patient: Patient,
    doctor: UserProfile,
    action: 'download' | 'print' = 'download'
) => {
    try {
        const orders = (consultation.resonanceOrders || []) as ResonanceOrder[];
        if (orders.length === 0) {
            alert("No hay órdenes de resonancia.");
            return;
        }
        const { jsPDF } = await loadPdfLibs();
        const doc = new jsPDF();
        const now = new Date();
        const { day, month, year } = getGuatemalaDateParts(now);
        const dateLine = `Guatemala, ${day} de ${month} de ${year}`;

        const drawOrder = (order: ResonanceOrder, index: number) => {
            if (index > 0) doc.addPage();
            doc.setFont("helvetica", "normal");
            doc.setTextColor(0, 0, 0);
            drawClinicLogo(doc, 14, 10, 18, 18);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("ORDEN DE RESONANCIA MAGNETICA CON", 105, 16, { align: 'center' });
            doc.text("PROTOCOLO DE EPILEPSIA", 105, 22, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(dateLine, 196, 30, { align: 'right' });

            let y = 36;
            doc.setFont("helvetica", "bold");
            doc.text("TECNODIAGNOSIS", 14, y);
            doc.setFont("helvetica", "normal");
            y += 5;
            doc.text("Depto. Imágenes", 14, y);
            y += 4;
            doc.text("Diag. 6, 5ta. Av. y 11 Calle Zona 10", 14, y);
            y += 4;
            doc.text("Edif. Interamericas nivel 1 y 2", 14, y);
            y += 4;
            doc.text("Tel. 2413-0000", 14, y);
            y += 4;
            doc.text("Indicar que tienen una orden de Asociación Humana.", 14, y);

            y += 8;
            doc.text("Por medio de la presente, tengo a bien referir", 14, y);
            y += 6;
            doc.text("Al(a) paciente:", 14, y);
            doc.line(45, y + 1, 196, y + 1);
            doc.setFont("helvetica", "bold");
            doc.text(patient.fullName || "", 47, y);
            doc.setFont("helvetica", "normal");
            y += 6;
            doc.text("que está siendo estudiada(o) por epilepsia de difícil control con diagnóstico probable de", 14, y);
            y += 6;
            doc.line(14, y + 1, 196, y + 1);
            doc.text(order.probableDiagnosis || "", 16, y);
            y += 8;
            doc.setFont("helvetica", "bold");
            doc.text("Para realizar RESONANCIA MAGNETICA CEREBRAL CON PROTOCOLO DE EPILEPSIA. Sin medio de contraste.", 14, y);
            doc.setFont("helvetica", "normal");
            y += 8;
            doc.text("Poner especial atención en:", 14, y);
            y += 5;
            doc.line(14, y + 1, 196, y + 1);
            doc.text(order.attentionNotes || "", 16, y);
            y += 7;
            doc.text("Sírvase enviar los resultados a nuestras oficinas en zona 10.", 14, y);

            y += 12;
            doc.text("Atentamente,", 105, y, { align: 'center' });
            y += 10;
            doc.line(60, y, 150, y);
            y += 4;
            doc.text("Nombre y firma del médico", 105, y, { align: 'center' });

            y += 6;
            doc.setFontSize(8);
            doc.text("NOTIFICACION: Pacientes de 0 a 8 años existe la posibilidad que se requiera el uso de sedación.", 14, y);
            y += 4;
            doc.text("Este servicio de sedación lo presta la empresa que realiza el estudio y tiene un precio aproximado de Q.800.00", 14, y);
            y += 4;
            doc.text("que lo cobra directamente la empresa.", 14, y);

            y += 10;
            doc.setFontSize(9);
            doc.text(`Guatemala, ${day} de ${month} de ${year}`, 196, y, { align: 'right' });
            y += 6;
            doc.text("NOMBRE DEL PACIENTE:", 14, y);
            doc.line(56, y + 1, 196, y + 1);
            doc.text(patient.fullName || "", 58, y);
            y += 6;
            doc.text("se le informa que el estudio tiene el siguiente valor para su conocimiento:", 14, y);

            y += 8;
            doc.text("Valor real del estudio:", 14, y);
            doc.line(55, y + 1, 110, y + 1);
            doc.text("Q", 50, y);
            y += 6;
            doc.text("Donación paciente:", 14, y);
            doc.line(55, y + 1, 110, y + 1);
            doc.text("Q", 50, y);
            y += 6;
            doc.text("Beneficio para el paciente:", 14, y);
            doc.line(65, y + 1, 110, y + 1);
            doc.text("Q", 60, y);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("RM", 170, y - 6);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            y += 10;
            doc.line(14, y, 96, y);
            doc.line(114, y, 196, y);
            y += 4;
            doc.text("Nombre y apellidos del paciente", 14, y);
            doc.text("Nombre y apellidos del testigo", 114, y);
            y += 4;
            y += 6;
            doc.text("Centro de Epilepsia y Neurocirugía Funcional Humana: 7ª. Calle A 1-62 Zona 10 Teléfono: 23 62 32 09/11.", 14, y);
        };

        orders.forEach(drawOrder);
        handlePdfOutput(doc, `Ordenes_Resonancia_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);
    } catch (error) {
        console.error("PDF Generation Error", error);
        alert("Error generando PDF de órdenes de resonancia.");
    }
};

export const generateEegOrdersPDF = async (
    consultation: Consultation,
    patient: Patient,
    doctor: UserProfile,
    action: 'download' | 'print' = 'download'
) => {
    try {
        const orders = (consultation.eegOrders || []) as EegOrder[];
        if (orders.length === 0) {
            alert("No hay órdenes de EEG.");
            return;
        }
        const { jsPDF } = await loadPdfLibs();
        const doc = new jsPDF();
        const now = new Date();
        const { day, month, year } = getGuatemalaDateParts(now);
        const dateLine = `Guatemala, ${day} de ${month} del ${year}`;
        const gender = patient.gender?.toString().toLowerCase() === 'f' || patient.gender?.toString().toLowerCase() === 'femenino' ? 'F' : patient.gender ? 'M' : '';

        const drawCheckbox = (x: number, y: number, checked: boolean) => {
            doc.rect(x, y, 5, 5);
            if (checked) doc.text("X", x + 1.2, y + 3.8);
        };

        const drawOrder = (order: EegOrder, index: number) => {
            if (index > 0) doc.addPage();
            doc.setFont("helvetica", "normal");
            doc.setTextColor(0, 0, 0);
            drawClinicLogo(doc, 14, 10, 18, 18);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("PROTOCOLO DE EPILEPSIA DE DIFICIL CONTROL", 105, 14, { align: 'center' });
            doc.text("NEUROFISIOLOGIA", 105, 20, { align: 'center' });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            const prepBoxY = 26;
            const prepBoxH = 42;
            const prepBoxX = 132;
            const prepBoxW = 64;
            doc.rect(prepBoxX, prepBoxY, prepBoxW, prepBoxH);
            doc.text("PREPARACION EEG", prepBoxX + prepBoxW / 2, prepBoxY + 4, { align: 'center' });
            doc.setFontSize(7);
            const prepItems = [
                "1. Lavar el cabello únicamente con jabón de olor.",
                "2. Cabello completamente seco a la hora del examen.",
                "3. No frotarlo con toalla (secado al aire libre).",
                "4. No aplicarse crema, gotas, gelatina etc.",
                "5. Paciente pediátrico con 4 horas de ayuno.",
                "6. Presentarse a la hora programada de lo contrario no se le atenderá."
            ];
            let prepY = prepBoxY + 8;
            const prepLineHeight = 3.2;
            const prepTextX = prepBoxX + 2;
            const prepMaxY = prepBoxY + prepBoxH - 2;
            for (const item of prepItems) {
                if (prepY > prepMaxY) break;
                const itemLines = doc.splitTextToSize(item, prepBoxW - 4);
                doc.text(itemLines, prepTextX, prepY);
                prepY += (itemLines.length * prepLineHeight) + 1.2;
            }

            doc.setFontSize(10);
            const dateLineY = prepBoxY + prepBoxH + 8;
            const patientRowY = dateLineY + 8;
            doc.text(dateLine, 196, dateLineY, { align: 'right' });
            doc.text("Paciente", 14, patientRowY);
            doc.line(32, patientRowY + 1, 120, patientRowY + 1);
            doc.text(patient.fullName || "", 34, patientRowY);
            doc.text("Edad", 130, patientRowY);
            doc.line(140, patientRowY + 1, 155, patientRowY + 1);
            doc.text(patient.age ? String(patient.age) : "", 142, patientRowY);
            doc.text("Sexo", 160, patientRowY);
            doc.line(170, patientRowY + 1, 186, patientRowY + 1);
            doc.text(gender || "", 172, patientRowY);
            const lineHeight = 6;
            let y = patientRowY + 8;
            const diagnosisLabel = "Que está siendo estudiado(a) por epilepsia de difícil control, con diagnóstico probable de";
            const diagnosisLabelLines = doc.splitTextToSize(diagnosisLabel, 182);
            doc.text(diagnosisLabelLines, 14, y);
            y += diagnosisLabelLines.length * lineHeight;
            const diagnosisText = order.probableDiagnosis || "";
            const diagnosisLines = doc.splitTextToSize(diagnosisText, 182);
            doc.text(diagnosisLines.length ? diagnosisLines : [""], 14, y);
            y += (diagnosisLines.length ? diagnosisLines.length : 1) * lineHeight;
            doc.line(14, y + 1, 196, y + 1);
            y += 8;

            doc.text("Con CCTCG", 14, y);
            drawCheckbox(38, y - 2, !!order.cctcg);
            doc.text("CPC", 48, y);
            drawCheckbox(57, y - 2, !!order.cpc);
            doc.text("CPC SEC. Generalizadas", 68, y);
            drawCheckbox(120, y - 2, !!order.cpcSecGeneralizadas);
            doc.text("Ausencias", 128, y);
            drawCheckbox(147, y - 2, !!order.ausencias);
            doc.text("Crisis Mioclónicas", 155, y);
            drawCheckbox(192, y - 2, !!order.crisisMioclonicas);
            y += 7;

            doc.text("C. Estáticas", 14, y);
            drawCheckbox(35, y - 2, !!order.crisisEstaticas);
            y += 7;

            doc.text("INDICACIONES ESPECIALES:", 14, y);
            y += 6;
            const indicationsText = order.specialIndications || "";
            const indicationsLines = doc.splitTextToSize(indicationsText, 182);
            doc.text(indicationsLines.length ? indicationsLines : [""], 14, y);
            y += (indicationsLines.length ? indicationsLines.length : 1) * lineHeight;
            doc.line(14, y + 1, 196, y + 1);
            y += 8;

            doc.text("Medicado(a) con", 14, y);
            doc.line(45, y + 1, 196, y + 1);
            doc.text(order.medicatedWith || "", 47, y);
            y += 10;

            const videoHours = order.videoMonitoringHours || order.duration || '';
            doc.text("Video Monitoreo", 14, y);
            doc.rect(48, y - 2, 14, 6);
            doc.text(videoHours, 50, y + 2);
            doc.text("Horas", 66, y + 2);
            doc.text("Supresión de Sueño", 90, y + 2);
            doc.text("SI", 138, y + 2);
            drawCheckbox(146, y, order.videoMonitoringSleepDeprivation === 'Si');
            doc.text("NO", 158, y + 2);
            drawCheckbox(166, y, order.videoMonitoringSleepDeprivation === 'No');
            y += 10;

            doc.text("Video Monitoreo Ictal", 14, y);
            doc.rect(60, y - 2, 14, 6);
            doc.text(order.ictalVideoHours || "", 62, y + 2);
            doc.text("Horas", 78, y + 2);
            doc.text("Supresión de Sueño", 102, y + 2);
            doc.text("SI", 150, y + 2);
            drawCheckbox(158, y, order.ictalSleepDeprivation === 'Si');
            doc.text("NO", 170, y + 2);
            drawCheckbox(178, y, order.ictalSleepDeprivation === 'No');
            y += 10;

            doc.text("Detección de Puntas (Curry)", 14, y);
            doc.text("64 Canales", 78, y);
            drawCheckbox(102, y - 2, !!order.spikeDetection64);
            doc.text("128 Canales", 114, y);
            drawCheckbox(140, y - 2, !!order.spikeDetection128);
            doc.text("Horas", 152, y);
            doc.rect(166, y - 2, 14, 6);
            doc.text(order.spikeDetectionHours || "", 168, y + 2);
            y += 10;

            doc.text("P300", 14, y);
            drawCheckbox(26, y - 2, !!order.p300);

            doc.text("Atentamente,", 105, y + 10, { align: 'center' });
            doc.line(60, y + 18, 150, y + 18);
            doc.text("Nombre y firma del médico", 105, y + 24, { align: 'center' });

            doc.text(`Guatemala, ${day} de ${month} de ${year}`, 196, y + 34, { align: 'right' });
            doc.text("NOMBRE DEL PACIENTE:", 14, y + 40);
            doc.line(56, y + 41, 196, y + 41);
            doc.text(patient.fullName || "", 58, y + 40);
            doc.text("se le informa que el estudio tiene el siguiente valor para su conocimiento:", 14, y + 46);

            doc.text("Valor real del estudio:", 14, y + 54);
            doc.line(55, y + 55, 110, y + 55);
            doc.text("Q", 50, y + 54);
            doc.text("Donación paciente:", 14, y + 60);
            doc.line(55, y + 61, 110, y + 61);
            doc.text("Q", 50, y + 60);
            doc.text("Beneficio para el paciente:", 14, y + 66);
            doc.line(65, y + 67, 110, y + 67);
            doc.text("Q", 60, y + 66);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text("EEG", 170, y + 60);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.line(14, y + 76, 96, y + 76);
            doc.line(114, y + 76, 196, y + 76);
            doc.text("Nombre y apellidos del paciente", 14, y + 80);
            doc.text("Nombre y apellidos del testigo", 114, y + 80);
            doc.text("Centro de Epilepsia y Neurocirugía Funcional Humana: 7ª. Calle A 1-62 Zona 10 Teléfono: 23 62 32 09/11.", 14, y + 90);
        };

        orders.forEach(drawOrder);
        handlePdfOutput(doc, `Ordenes_EEG_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);
    } catch (error) {
        console.error("PDF Generation Error", error);
        alert("Error generando PDF de órdenes de EEG.");
    }
    //await logAuditAction( "GENERATE_ORDER_PDF", `PDF de órdenes de EEG generado para el paciente ${patient.fullName}`);
};
