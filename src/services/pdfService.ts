
import { Consultation, Patient, UserProfile, ReferralGroup } from '../../types.ts';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { LOGO_BASE64 } from '../data/assets.ts';
import { LOGOLARGO_BASE64 } from '../data/assets.ts';

// --- CONFIGURACIÓN DE COLORES (IDENTITY) ---
const COLORS = {
    PRIMARY: [124, 58, 237], 
    PRIMARY_LIGHT: [245, 243, 255], 
    TEXT_DARK: [15, 23, 42],   
    TEXT_GRAY: [71, 85, 105],  
    BG_GRAY: [248, 250, 252],  
    WATERMARK: [221, 214, 254] 
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

// --- MARCA DE AGUA (LOGO CENTRADO) ---
const drawWatermark = (doc: any) => {
    if (!LOGO_BASE64) return; 

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // GUARDAR ESTADO ACTUAL (Opacidad 100%)
    doc.saveGraphicsState();

    try {
        // Configurar opacidad baja para marca de agua
        if (doc.GState) {
            doc.setGState(new doc.GState({ opacity: 0.25 })); // 15% de opacidad
        }
        
        // REDUCIMOS TAMAÑO PARA EVITAR PIXELADO POR ESTIRAMIENTO
        const imgWidth = 100;
        const imgHeight = 100; 
        const x = (pageWidth - imgWidth) / 2;
        const y = (pageHeight - imgHeight) / 2;

        doc.addImage(LOGOLARGO_BASE64, 'PNG', x, y, imgWidth, imgHeight);
        
    } catch (e) {
        console.warn("Watermark transparency issue", e);
    } finally {
        // RESTAURAR ESTADO (Volver a opacidad 100%)
        doc.restoreGraphicsState();
        
        // FUERZA BRUTA: Asegurar que la opacidad es 1.0 por si restore falla en algunos navegadores
        try {
            if (doc.GState) {
                doc.setGState(new doc.GState({ opacity: 1.0 }));
            }
        } catch(e) {}
    }
};

const drawHeader = (doc: any, doctor: UserProfile, consultation: Consultation) => {
    // Asegurar colores sólidos antes de escribir
    doc.setTextColor(0, 0, 0);
    
    // FECHA Y HORA (Top Right, Discreto)
    const guateDate = new Date(consultation.date).toLocaleString('es-GT', { 
        timeZone: 'America/Guatemala',
        dateStyle: 'long',
        timeStyle: 'short'
    });

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.setFont("helvetica", "normal");
    doc.text(guateDate, 195, 15, { align: 'right' });

    // LOGO E IDENTIDAD (Top Left)
    if (LOGO_BASE64) {
        // Logo Imagen
        try {
            doc.addImage(LOGO_BASE64, 'PNG', 15, 10, 25, 25); 
        } catch (e) {
            console.error("Error drawing logo", e);
        }
        
        // Dirección / Info Asociación (Al lado del logo)
        doc.setFontSize(14);
        doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        doc.setFont("helvetica", "bold");
        doc.text("Asociación Humana", 45, 18);

        doc.setFontSize(9);
        doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
        doc.setFont("helvetica", "normal");
        doc.text("Gestión Clínica & Farmacia", 45, 23);
        doc.text("Guatemala, C.A.", 45, 28);

    } else {
        doc.setFontSize(22);
        doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        doc.setFont("helvetica", "bold");
        doc.text("Asociación Humana", 15, 20);
    }

    // LÍNEA DIVISORIA
    doc.setDrawColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
    doc.setLineWidth(0.5);
    doc.line(15, 40, 195, 40);
};

const drawPatientInfo = (doc: any, patient: Patient, consultation: Consultation) => {
    // Reset colors for safety
    doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
    doc.setDrawColor(200, 200, 200);
    
    doc.setFillColor(COLORS.BG_GRAY[0], COLORS.BG_GRAY[1], COLORS.BG_GRAY[2]);
    doc.roundedRect(15, 45, 180, 28, 2, 2, 'F'); 
    
    doc.setFontSize(12); 
    
    const row1Y = 55;
    const row2Y = 65;

    doc.setFont("helvetica", "bold");
    doc.text("PACIENTE:", 20, row1Y);
    doc.setFont("helvetica", "normal");
    doc.text(patient.fullName, 48, row1Y);

    doc.setFont("helvetica", "bold");
    doc.text("EDAD:", 120, row1Y);
    doc.setFont("helvetica", "normal");
    doc.text(`${patient.age || 0} años`, 138, row1Y);
    
    doc.setFont("helvetica", "bold");
    doc.text("DPI:", 20, row2Y);
    doc.setFont("helvetica", "normal");
    doc.text(patient.id, 48, row2Y);

    doc.setFont("helvetica", "bold");
    doc.text("GÉNERO:", 120, row2Y);
    doc.setFont("helvetica", "normal");
    
    const genderStr = patient.gender ? patient.gender.toString().toLowerCase() : '';
    const isMale = genderStr === 'm' || genderStr.startsWith('masc');
    doc.text(isMale ? 'Masculino' : 'Femenino', 145, row2Y);
};

const drawSignature = async (doc: any, currentY: number, doctor: UserProfile, consultation: Consultation) => {
    const signatureY = currentY + 15; 
    
    // IF SIGNATURE TYPE IS DIGITAL P12 (CERTIFICATE)
    if (consultation.signature && consultation.signature.type === 'digital_p12') {
        const sig = consultation.signature;
        const signDate = new Date(sig.signatureDate || Date.now()).toLocaleString('es-GT');
        
        doc.setDrawColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        doc.setLineWidth(0.5);
        doc.rect(60, signatureY - 5, 90, 30);
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        doc.text("DOCUMENTO FIRMADO DIGITALMENTE", 105, signatureY, { align: 'center' });
        
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        
        doc.text(`Firmante: ${sig.signerName || doctor.name}`, 105, signatureY + 6, { align: 'center' });
        doc.text(`Fecha Firma: ${signDate}`, 105, signatureY + 11, { align: 'center' });
        doc.text(`Serial Cert: ${sig.certificateSerial || 'N/A'}`, 105, signatureY + 16, { align: 'center' });
        
        doc.setFont("courier", "normal");
        doc.setTextColor(100);
        doc.text(`HASH: ${consultation.id?.substring(0, 16).toUpperCase()}`, 105, signatureY + 21, { align: 'center' });

    } 
    // IF NO SIGNATURE (MANUAL)
    else {
      doc.setDrawColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
      doc.setLineWidth(0.5);
      doc.line(70, signatureY + 15, 140, signatureY + 15);
      
      doc.setFontSize(11); 
      doc.setFont("helvetica", "bold");
      doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
      doc.text("Dr. " + doctor.name, 105, signatureY + 22, { align: 'center' });
      
      doc.setFontSize(10); 
      doc.setFont("helvetica", "normal");
      doc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
      
      doc.text(doctor.specialty || "Medicina General", 105, signatureY + 27, { align: 'center' });
      doc.text("Firma y Sello", 105, signatureY + 32, { align: 'center' });
    }

    const pageHeight = doc.internal.pageSize.height;
    doc.setDrawColor(200);
    doc.line(15, pageHeight - 20, 195, pageHeight - 20);
    
    doc.setFontSize(8); 
    doc.setTextColor(150);
    doc.text("Este documento es oficial y generado por el sistema HIS de Asociación Humana.", 15, pageHeight - 15);
    doc.text(`ID: ${consultation.id?.substring(0,8)}`, 195, pageHeight - 15, { align: 'right' });
};

export const generateNursingPDF = async (
    consultation: Consultation,
    patient: Patient,
    doctor: UserProfile,
    action: 'download' | 'print' = 'download'
) => {
    try {
        const { jsPDF } = await loadPdfLibs();
        const pdfDoc = new jsPDF(); 
        
        drawWatermark(pdfDoc);
        drawHeader(pdfDoc, doctor, consultation); 

        // Titulo Reporte
        let currentY = 55;
        pdfDoc.setFontSize(16);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        pdfDoc.text("Reporte de Enfermería y Clínica", 105, currentY, { align: 'center' });
        
        currentY += 15;

        // --- PATIENT INFO BOX ---
        drawPatientInfo(pdfDoc, patient, consultation);
        currentY += 40; 

        // --- 1. DIAGNÓSTICO MÉDICO ---
        const diagnosisOmitted = consultation.omittedFields?.['diagnosis'];
        
        pdfDoc.setFontSize(13); // Section Header
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        pdfDoc.text("DIAGNÓSTICO MÉDICO", 15, currentY);
        currentY += 8;

        if (!diagnosisOmitted) {
            pdfDoc.setFillColor(255, 255, 255);
            pdfDoc.setDrawColor(200);
            pdfDoc.setLineWidth(0.1);
            
            pdfDoc.setFontSize(12); // Normal Text 12
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
            const splitDiag = pdfDoc.splitTextToSize(consultation.diagnosis || "Sin diagnóstico.", 180);
            
            const diagHeight = (splitDiag.length * 6) + 8; // Increased line height multiplier
            
            // Aplicar transparencia al fondo del diagnóstico
            // @ts-ignore
            if (pdfDoc.GState) {
                // @ts-ignore
                pdfDoc.saveGraphicsState();
                // @ts-ignore
                pdfDoc.setGState(new pdfDoc.GState({ opacity: 0.85 }));
            }

            pdfDoc.setFillColor(COLORS.BG_GRAY[0], COLORS.BG_GRAY[1], COLORS.BG_GRAY[2]);
            pdfDoc.rect(15, currentY - 5, 180, diagHeight, 'F');

            // Restaurar opacidad para el texto
            // @ts-ignore
            if (pdfDoc.GState) {
                // @ts-ignore
                pdfDoc.restoreGraphicsState();
            }

            pdfDoc.text(splitDiag, 18, currentY);
            
            currentY += diagHeight + 10;
        } else {
            pdfDoc.setFontSize(12);
            pdfDoc.setFont("helvetica", "italic");
            pdfDoc.setTextColor(150);
            pdfDoc.text("(Sección omitida)", 15, currentY);
            currentY += 15;
        }

        // --- 2. ÓRDENES CLÍNICAS (GRID) ---
        pdfDoc.setFontSize(13);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        pdfDoc.text("RESUMEN DE ÓRDENES CLÍNICAS", 15, currentY);
        currentY += 8;

        // --- COLUMNA 1: MEDICAMENTOS ---
        const medsStartX = 15;
        const medsWidth = 85;
        let medsY = currentY;

        pdfDoc.setFontSize(12); // Title 12
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        pdfDoc.text("Tratamiento / Receta:", medsStartX, medsY);
        medsY += 6;

        const medsOmitted = consultation.omittedFields?.['prescription'];
        if (!medsOmitted && consultation.prescription && consultation.prescription.length > 0) {
            pdfDoc.setFontSize(12); // List 12
            pdfDoc.setFont("helvetica", "normal");
            consultation.prescription.forEach(p => {
                const medText = `• ${p.name} (${p.quantity})`;
                const doseText = `  ${p.dosage}`;
                
                const splitMed = pdfDoc.splitTextToSize(medText, medsWidth);
                pdfDoc.text(splitMed, medsStartX, medsY);
                medsY += (splitMed.length * 5); // Spacing
                
                pdfDoc.setTextColor(100);
                const splitDose = pdfDoc.splitTextToSize(doseText, medsWidth);
                pdfDoc.text(splitDose, medsStartX, medsY);
                pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
                medsY += (splitDose.length * 5) + 4; // Extra spacing between items
            });
        } else {
            pdfDoc.setFontSize(12);
            pdfDoc.setTextColor(150);
            pdfDoc.text("Ninguno", medsStartX, medsY);
            medsY += 6;
        }

        // --- COLUMNA 2: LABORATORIOS (SEPARADOS) ---
        const labsStartX = 110;
        const labsWidth = 85;
        let labsY = currentY;

        pdfDoc.setFontSize(12);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        pdfDoc.text("Laboratorios y Estudios:", labsStartX, labsY);
        labsY += 6;

        const examsOmitted = consultation.omittedFields?.['exams'];
        const hasReferralGroups = consultation.referralGroups && consultation.referralGroups.length > 0;
        const hasSpecificExams = consultation.exams && consultation.exams.length > 0;

        if (!examsOmitted && (hasReferralGroups || hasSpecificExams)) {
            pdfDoc.setFontSize(12); // List 12
            
            // A. Perfiles de Patologías
            if (hasReferralGroups) {
                consultation.referralGroups?.forEach(g => {
                    pdfDoc.setFont("helvetica", "bold");
                    pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
                    pdfDoc.text(`Perfil: ${g.pathology}`, labsStartX, labsY);
                    labsY += 5;
                    
                    pdfDoc.setFont("helvetica", "normal");
                    pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
                    g.exams.forEach(e => {
                        pdfDoc.text(`• ${e}`, labsStartX + 2, labsY);
                        labsY += 5;
                    });
                    labsY += 4;
                });
            }

            // B. Laboratorios Específicos/Opcionales
            if (hasSpecificExams) {
                // Separator if needed
                if(hasReferralGroups) labsY += 2;

                pdfDoc.setFont("helvetica", "bold");
                pdfDoc.setTextColor(COLORS.TEXT_GRAY[0], COLORS.TEXT_GRAY[1], COLORS.TEXT_GRAY[2]);
                pdfDoc.text("Seleccionados / Opcionales:", labsStartX, labsY);
                labsY += 5;
                
                pdfDoc.setFont("helvetica", "normal");
                pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
                consultation.exams?.forEach(e => {
                    const splitExam = pdfDoc.splitTextToSize(`• ${e}`, labsWidth);
                    pdfDoc.text(splitExam, labsStartX + 2, labsY);
                    labsY += (splitExam.length * 5);
                });
            }

        } else {
            pdfDoc.setFontSize(12);
            pdfDoc.setTextColor(150);
            pdfDoc.text("Ninguno", labsStartX, labsY);
            labsY += 6;
        }

        // Sincronizar Y
        currentY = Math.max(medsY, labsY) + 15;

        // Check page break
        if (currentY > 230) {
            pdfDoc.addPage();
            currentY = 20;
        }

        // --- 3. REFERENCIAS ---
        const referralsOmitted = consultation.omittedFields?.['referrals'];
        if (!referralsOmitted && consultation.specialtyReferrals && consultation.specialtyReferrals.length > 0) {
            pdfDoc.setFontSize(13);
            pdfDoc.setFont("helvetica", "bold");
            pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
            pdfDoc.text("REFERENCIAS A ESPECIALISTAS", 15, currentY);
            currentY += 8;
            
            pdfDoc.setFontSize(12); // List 12
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
            
            consultation.specialtyReferrals.forEach(ref => {
                pdfDoc.text(`• ${ref.specialty}`, 20, currentY);
                currentY += 6;
                if (ref.note) {
                    const splitNote = pdfDoc.splitTextToSize(`Nota: ${ref.note}`, 160);
                    pdfDoc.setFont("helvetica", "italic");
                    pdfDoc.setTextColor(100);
                    pdfDoc.text(splitNote, 25, currentY);
                    pdfDoc.setTextColor(50);
                    pdfDoc.setFont("helvetica", "normal");
                    currentY += (splitNote.length * 5) + 4;
                }
            });
            currentY += 5;
        }

        // --- 4. ANOTACIONES ENFERMERÍA ---
        const notesOmitted = consultation.omittedFields?.['nursing'];
        
        pdfDoc.setFontSize(13);
        pdfDoc.setFont("helvetica", "bold");
        pdfDoc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        pdfDoc.text("ANOTACIONES PARA ENFERMERÍA / INDICACIONES FINALES", 15, currentY);
        currentY += 8;

        if (notesOmitted) {
            pdfDoc.setFontSize(12);
            pdfDoc.setFont("helvetica", "italic");
            pdfDoc.setTextColor(150);
            pdfDoc.text("(Sin indicaciones adicionales)", 15, currentY);
        } else {
            const splitNotes = pdfDoc.splitTextToSize(consultation.followUpText || "Sin anotaciones.", 175);
            const boxHeight = Math.max(25, (splitNotes.length * 6) + 12);
            
            pdfDoc.setDrawColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
            pdfDoc.setLineWidth(0.3);
            pdfDoc.rect(15, currentY, 180, boxHeight); 
            
            pdfDoc.setFontSize(12); // Text 12
            pdfDoc.setFont("helvetica", "normal");
            pdfDoc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
            pdfDoc.text(splitNotes, 18, currentY + 8);
            
            currentY += boxHeight + 15;
        }

        const spaceRemaining = 280 - currentY;
        if (spaceRemaining < 40) {
            pdfDoc.addPage();
            currentY = 20;
        } else {
            currentY += 10;
        }

        await drawSignature(pdfDoc, currentY, doctor, consultation);

        handlePdfOutput(pdfDoc, `Enfermeria_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);

    } catch (error) {
        console.error("PDF Nursing Generation Error", error);
        alert("Error generando reporte de enfermería.");
    }
};

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

    let currentY = 90; 

    doc.setFontSize(13); // Header 13
    doc.setFont("helvetica", "bold");
    doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
    
    doc.setFontSize(12); // Text 12
    doc.setFont("helvetica", "normal");
    doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
    
    const splitDiagnosis = doc.splitTextToSize(consultation.diagnosis || "Sin diagnóstico registrado.", 180);

    let tableStartY = currentY + 10 + (splitDiagnosis.length * 6);

    if (consultation.prescription && consultation.prescription.length > 0) {
        const tableBody = consultation.prescription.map(item => {
        let qtyDisplay = item.quantity.toString();
        
        if (item.units_per_box && item.units_per_box > 1) {
            const boxes = item.quantity / item.units_per_box;
            if (boxes >= 1) {
                const boxLabel = boxes === 1 ? 'Caja' : 'Cajas';
                if (boxes % 1 === 0) {
                    qtyDisplay = `${boxes} ${boxLabel}`;
                } else {
                    qtyDisplay = `${boxes.toFixed(1)} ${boxLabel}`;
                }
            } else {
                qtyDisplay = `${item.quantity} Unid.`;
            }
        } else {
            qtyDisplay = `${item.quantity} Unid.`;
        }

        // REMOVED DURATION COLUMN AS REQUESTED
        return [
            item.name,
            qtyDisplay, 
            item.dosage
        ];
        });

        if (autoTable) {
            // Aplicar transparencia a la tabla para que se vea la marca de agua
            // @ts-ignore
            if (doc.GState) {
                // @ts-ignore
                doc.saveGraphicsState();
                // @ts-ignore
                doc.setGState(new doc.GState({ opacity: 0.85 }));
            }

            autoTable(doc, {
            startY: tableStartY,
            head: [['MEDICAMENTO', 'CANTIDAD', 'INDICACIONES / DOSIS']], // Removed Duration Header
            body: tableBody,
            theme: 'grid',
            margin: { left: 15, right: 15 },
            tableWidth: 180, 
            styles: {
                fontSize: 12, // Increased to 12
                cellPadding: 5,
                textColor: [50, 50, 50],
                lineColor: [230, 230, 230],
                lineWidth: 0.1,
                overflow: 'linebreak', 
                valign: 'middle'
            },
            headStyles: { 
                fillColor: COLORS.PRIMARY, 
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'left',
                fontSize: 12 // Header 12
            },
            columnStyles: {
                0: { cellWidth: 70, fontStyle: 'bold' }, // Wider Medication Name
                1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' }, // Quantity
                2: { cellWidth: 80 } // Wider Indications
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            }
        });

            // Restaurar opacidad
            // @ts-ignore
            if (doc.GState) {
                // @ts-ignore
                doc.restoreGraphicsState();
            }
        }
        // @ts-ignore
        currentY = (doc.lastAutoTable?.finalY || tableStartY) + 20;
    } else {
        currentY = tableStartY + 15;
    }

    if (consultation.prescriptionNotes && consultation.prescriptionNotes.trim().length > 0) {
        if (currentY > 230) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFontSize(13); // Header 13
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]); 
        doc.text("OBSERVACIONES / CUIDADOS GENERALES", 15, currentY);
        
        doc.setFontSize(12); // Text 12
        doc.setFont("helvetica", "normal");
        doc.setTextColor(COLORS.TEXT_DARK[0], COLORS.TEXT_DARK[1], COLORS.TEXT_DARK[2]);
        
        const splitNotes = doc.splitTextToSize(consultation.prescriptionNotes, 180);
        doc.text(splitNotes, 15, currentY + 8);
        currentY += (splitNotes.length * 6) + 15;
    }
    
    if (currentY > 240) {
        doc.addPage();
        currentY = 40;
    }

    await drawSignature(doc, currentY, doctor, consultation);

    handlePdfOutput(doc, `Receta_${patient.fullName.replace(/\s+/g, '_')}_${Date.now()}.pdf`, action);

  } catch (error) {
    console.error("PDF Generation Error", error);
    alert("Error generando PDF. Ver consola.");
  }
};

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
        drawHeader(doc, doctor, consultation); // Cleaner header
        drawPatientInfo(doc, patient, consultation);

        let currentY = 85;

        doc.setFontSize(16); // Bigger Title
        doc.setFont("helvetica", "bold");
        doc.setTextColor(COLORS.PRIMARY[0], COLORS.PRIMARY[1], COLORS.PRIMARY[2]);
        doc.text("SOLICITUD DE LABORATORIOS Y ESTUDIOS", 105, currentY, { align: 'center' });
        
        currentY += 20;

        // COMBINE FOR TECHNICIAN ORDER
        const uniqueExams = new Set<string>();
        
        consultation.referralGroups?.forEach(g => {
            g.exams.forEach(e => uniqueExams.add(e));
        });
        
        consultation.exams?.forEach(e => uniqueExams.add(e));

        const allExamsList = Array.from(uniqueExams).sort();

        if (allExamsList.length > 0) {
            const tableBody = allExamsList.map(exam => [exam, '']);

            if (autoTable) {
                // Aplicar transparencia a la tabla para que se vea la marca de agua
                // @ts-ignore
                if (doc.GState) {
                    // @ts-ignore
                    doc.saveGraphicsState();
                    // @ts-ignore
                    doc.setGState(new doc.GState({ opacity: 0.85 }));
                }

                autoTable(doc, {
                    startY: currentY,
                    head: [['EXAMEN SOLICITADO', 'REALIZADO']],
                    body: tableBody,
                    theme: 'grid',
                    margin: { left: 20, right: 20 },
                    tableWidth: 170,
                    styles: {
                        fontSize: 12, // Text 12
                        cellPadding: 5,
                        textColor: [50, 50, 50],
                        lineColor: [200, 200, 200],
                        lineWidth: 0.1,
                        valign: 'middle'
                    },
                    headStyles: { 
                        fillColor: COLORS.PRIMARY,
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        halign: 'left',
                        fontSize: 12 // Header 12
                    },
                    columnStyles: {
                        0: { fontStyle: 'bold' },
                        1: { cellWidth: 30, halign: 'center' } 
                    },
                    alternateRowStyles: {
                        fillColor: [248, 250, 252]
                    },
                    didDrawCell: (data: any) => {
                        if (data.section === 'body' && data.column.index === 1) {
                        }
                    }
                });

                // Restaurar opacidad
                // @ts-ignore
                if (doc.GState) {
                    // @ts-ignore
                    doc.restoreGraphicsState();
                }
            }
            // @ts-ignore
            currentY = doc.lastAutoTable?.finalY + 20 || currentY + 25;
        } else {
             doc.setFontSize(12);
             doc.setFont("helvetica", "italic");
             doc.setTextColor(150);
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
