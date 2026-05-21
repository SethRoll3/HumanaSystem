
import { collection, getDocs, writeBatch, doc, Timestamp, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { logAuditAction } from './auditService.ts';
// @ts-ignore
import * as XLSX from 'xlsx';

// Colecciones a respaldar (System Backup .ah)
const COLLECTIONS = [
    'users',
    'patients',
    'appointments',
    'consultations',
    'inventory',
    'external_medicines',
    'laboratory_catalog',
    'specialties',
    'specialty_forms',
    'pathologies',
    'clinics',
    'doctor_day_schedules',
    'doctor_schedule_settings',
    'notifications',
    'system_settings',
    'system_counters',
    'audit_logs',
    'quality_reviews',
    'pharmacy_sales_reports'
];

// Colecciones con subcollections que necesitan manejo especial
const SUBCOLLECTION_MAP: Record<string, string[]> = {
    'pharmacy_sales_reports': ['rows']
};

// Helper: Serializar Timestamps recursivamente (profundidad completa)
const serializeTimestamps = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Timestamp) {
        return { _type: 'Timestamp', value: obj.toDate().toISOString() };
    }
    if (Array.isArray(obj)) {
        return obj.map(item => serializeTimestamps(item));
    }
    if (typeof obj === 'object' && obj.constructor === Object) {
        const result: any = {};
        for (const key of Object.keys(obj)) {
            result[key] = serializeTimestamps(obj[key]);
        }
        return result;
    }
    return obj;
};

// Helper: Deserializar Timestamps recursivamente (profundidad completa)
const deserializeTimestamps = (obj: any): any => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'object' && obj._type === 'Timestamp' && obj.value) {
        return Timestamp.fromDate(new Date(obj.value));
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deserializeTimestamps(item));
    }
    if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const key of Object.keys(obj)) {
            result[key] = deserializeTimestamps(obj[key]);
        }
        return result;
    }
    return obj;
};

// Generar Backup (.ah / JSON)
export const generateSystemBackup = async (userEmail: string): Promise<Blob> => {
    const backupData: any = {
        meta: {
            version: '1.0',
            generatedAt: new Date().toISOString(),
            generatedBy: userEmail,
            system: 'Asociación Humana HIS'
        },
        data: {}
    };

    try {
        for (const colName of COLLECTIONS) {
            const colRef = collection(db, colName);
            const snapshot = await getDocs(colRef);
            backupData.data[colName] = snapshot.docs.map(d => {
                const data = d.data() as any;
                const safeData: any = { _id: d.id, ...serializeTimestamps(data) };
                return safeData;
            });

            // Manejar subcollections si existen
            const subNames = SUBCOLLECTION_MAP[colName];
            if (subNames && subNames.length > 0) {
                for (const subName of subNames) {
                    for (const parentDoc of snapshot.docs) {
                        const subRef = collection(db, colName, parentDoc.id, subName);
                        const subSnap = await getDocs(subRef);
                        if (subSnap.docs.length > 0) {
                            const subKey = `${colName}/__sub__/${parentDoc.id}/${subName}`;
                            backupData.data[subKey] = subSnap.docs.map(sd => {
                                const sData = sd.data() as any;
                                return { _id: sd.id, ...serializeTimestamps(sData) };
                            });
                        }
                    }
                }
            }
        }

        const jsonString = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        await logAuditAction(userEmail, 'BACKUP_GENERADO', 'Se generó y descargó una copia completa de la base de datos.');
        await registerBackupCompletion();

        return blob;

    } catch (error) {
        console.error("Backup failed:", error);
        throw new Error("Error generando el respaldo. Revise la consola.");
    }
};

// --- GENERAR EXCEL LEGIBLE (REPORTE MAESTRO) ---
export const generateReadableExcelReport = async (userEmail: string) => {
    try {
        const wb = XLSX.utils.book_new();
        
        // Helper para formato de fecha GT
        const fmtDate = (val: any) => {
            if (!val) return '';
            const date = val instanceof Timestamp ? val.toDate() : new Date(val);
            if (isNaN(date.getTime())) return String(val);
            return date.toLocaleString('es-GT');
        };

        const safeStr = (val: any) => {
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
        };

        const safeArr = (val: any) => {
            if (!val || !Array.isArray(val)) return '';
            return val.join(', ');
        };

        // ====================================
        // 1. PACIENTES (patients)
        // ====================================
        const patSnap = await getDocs(collection(db, 'patients'));
        const patData = patSnap.docs.map(d => {
            const p = d.data() as any;
            return {
                "ID": d.id,
                "Nombre Completo": p.fullName || '',
                "DPI": p.dpi || '',
                "Código Facturación": p.billingCode || '',
                "Edad": p.age ?? '',
                "Fecha Nacimiento": p.birthDate || '',
                "Género": p.gender || '',
                "Teléfono": p.phone || '',
                "Email": p.email || '',
                "Ocupación": p.occupation || '',
                "Foto URL": p.photoUrl || '',
                "País": p.address?.country || '',
                "Departamento": p.address?.department || '',
                "Municipio": p.address?.municipality || '',
                "Zona": p.address?.zone || '',
                "Procedencia": p.careCenter || '',
                "Tratamiento Previo": p.previousTreatment || '',
                "Detalle Trat. Previo": p.previousTreatmentDetail || '',
                "Canal Referencia": p.referralChannel || '',
                "Origen": p.origin || '',
                "Código Protocolo": p.protocol_code || '',
                "Responsable": p.responsibleName || '',
                "Tel. Responsable": p.responsiblePhone || '',
                "Email Responsable": p.responsibleEmail || '',
                "Historial Médico": p.medical_history || '',
                "Archivos Adjuntos": p.historyFiles?.length || 0,
                "Detalle Archivos": p.historyFiles?.map((f: any) => f.name).join(', ') || '',
                "Creado": fmtDate(p.createdAt),
                "Actualizado": fmtDate(p.updatedAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(patData), "Pacientes");

        // ====================================
        // 2. CITAS (appointments)
        // ====================================
        const apptSnap = await getDocs(collection(db, 'appointments'));
        const apptData = apptSnap.docs.map(d => {
            const a = d.data() as any;
            return {
                "ID": d.id,
                "Paciente ID": a.patientId || '',
                "Paciente": a.patientName || '',
                "Doctor ID": a.doctorId || '',
                "Doctor": a.doctorName || '',
                "Tipo Consulta": a.consultationType || '',
                "Modalidad": a.modality || '',
                "Estado": a.status || '',
                "Fecha Inicio": fmtDate(a.date),
                "Fecha Fin": fmtDate(a.endDate),
                "Duración (min)": a.duration ?? '',
                "Motivo": a.reason || '',
                "Razón Consulta": a.reasonForConsultation || '',
                "Es IGSS": a.isIGSS ? 'Sí' : 'No',
                "Tipo IGSS": a.igssType || '',
                "Ir a Enfermería": a.goToNurse ? 'Sí' : 'No',
                "Clínico Residente Completado": a.residentClinicalCompleted ? 'Sí' : 'No',
                "Form Especialidad Residente": a.residentSpecialtyFormName || '',
                "Datos Especialidad Residente": a.residentSpecialtyData ? JSON.stringify(a.residentSpecialtyData) : '',
                "Creado": fmtDate(a.createdAt),
                "Creado Por (UID)": a.createdBy || '',
                "Confirmado": fmtDate(a.confirmedAt),
                "Confirmado Por": a.confirmedBy || '',
                "Método Confirmación": a.confirmationMethod || '',
                "Boleta Pago": a.paymentReceipt || '',
                "Monto Pago": a.paymentAmount ?? '',
                "Pagado": fmtDate(a.paidAt),
                "Pagado Por": a.paidBy || ''
            };
        });
        const wsAppt = XLSX.utils.json_to_sheet(apptData);
        wsAppt['!cols'] = Array(28).fill({ wch: 20 });
        XLSX.utils.book_append_sheet(wb, wsAppt, "Citas");

        // ====================================
        // 3. CONSULTAS (consultations)
        // ====================================
        const consSnap = await getDocs(query(collection(db, 'consultations'), orderBy('date', 'desc')));
        const consData = consSnap.docs.map(d => {
            const c = d.data() as any;
            
            const prescriptionStr = c.prescription?.map((m: any) => 
                `• ${m.name} (Cant: ${m.quantity}, Dosis: ${m.dosage}, Días: ${m.duration_days || ''}${m.isExternal ? ' [EXT]' : ''})`
            ).join('\n') || '';

            const labsStr = [
                ...(c.referralGroups?.map((g: any) => `[${g.pathology}]: ${g.exams.join(', ')}${g.note ? ' Nota: ' + g.note : ''}`) || []),
                ...(c.exams || []).map((e: string) => `• ${e}`)
            ].join('\n');

            const refStr = c.specialtyReferrals?.map((r: any) => 
                `• A ${r.specialty}: ${r.note || ''}`
            ).join('\n') || '';

            const resonanceStr = c.resonanceOrders?.map((r: any) => 
                `Dx: ${r.probableDiagnosis || ''}, Atención: ${r.attentionNotes || ''}`
            ).join('\n') || '';

            const eegStr = c.eegOrders?.map((e: any) => 
                `Dx: ${e.probableDiagnosis || ''}, Indicaciones: ${e.specialIndications || ''}, Medicado: ${e.medicatedWith || ''}`
            ).join('\n') || '';

            const vitalsStr = c.vitals ? 
                `TEMP°C: ${c.vitals.temp || ''}, Peso: ${c.vitals.weight || ''} Lbs., P/A: ${c.vitals.pressure || ''} mmHg, FR: ${c.vitals.fr || ''} xm, FC: ${c.vitals.fc || ''} xm, SpO2: ${c.vitals.sat || ''} %` : '';

            return {
                "ID Consulta": d.id,
                "Fecha": fmtDate(c.date),
                "Paciente ID": c.patientId || '',
                "Paciente": c.patientName || '',
                "Paciente Foráneo": c.patientIsForeign ? 'Sí' : 'No',
                "Doctor ID": c.doctorId || '',
                "Médico": c.doctorName || '',
                "Especialidad Médico": c.doctorSpecialty || '',
                "Tipo Consulta": c.consultationType || '',
                "Estado": c.status || '',
                "Cita ID": c.appointmentId || '',
                "Diagnóstico": c.diagnosis || '',
                "Signos Vitales": vitalsStr,
                "Receta Médica": prescriptionStr,
                "No. Receta": c.prescriptionNumber || '',
                "Notas Receta": c.prescriptionNotes || '',
                "Laboratorios": labsStr,
                "Nota Referencia": c.referralNote || '',
                "Referencias Especialistas": refStr,
                "Órdenes Resonancia": resonanceStr,
                "Órdenes EEG": eegStr,
                "Observación Salud Mental": c.mentalHealthObservation || '',
                "Evaluación Emocional": safeArr(c.emotionalEvaluationSelections),
                "Avisos Importantes": c.importantNotices || '',
                "Avisos Vistos Por": safeArr(c.importantNoticesSeenBy),
                "Indicaciones Enfermería": c.followUpText || '',
                "Seguimiento Requerido": c.followUpRequired ? 'Sí' : 'No',
                "Texto Seguimiento": c.followUpRequestText || '',
                "Días Seguimiento": c.followUpDays ?? '',
                "Fecha Est. Seguimiento": fmtDate(c.followUpEstimatedDate),
                "Form Especialidad ID": c.specialtyFormId || '',
                "Datos Especialidad": c.specialtyData ? JSON.stringify(c.specialtyData) : '',
                "Firma Tipo": c.signature?.type || '',
                "Firma URL": c.signature?.url || '',
                "Firma Nombre": c.signature?.signerName || '',
                "Firma Fecha": fmtDate(c.signature?.signatureDate),
                "Firma Cert. Serial": c.signature?.certificateSerial || '',
                "Boleta Pago": c.paymentReceipt || '',
                "Monto Pago": c.paymentAmount ?? '',
                "Recepcionista ID": c.receptionistId || '',
                "Docs Impresos": c.printedDocs ? JSON.stringify(c.printedDocs) : '',
                "Campos Omitidos": c.omittedFields ? JSON.stringify(c.omittedFields) : '',
                "Entregado": fmtDate(c.deliveredAt),
                "Entregado Por": c.deliveredBy || '',
                "Razón No Impresión": c.nonPrintReason || ''
            };
        });
        const wsCons = XLSX.utils.json_to_sheet(consData);
        wsCons['!cols'] = Array(44).fill({ wch: 22 });
        XLSX.utils.book_append_sheet(wb, wsCons, "Consultas");

        // ====================================
        // 4. INVENTARIO INTERNO (inventory)
        // ====================================
        const invSnap = await getDocs(collection(db, 'inventory'));
        const invData = invSnap.docs.map(d => {
            const i = d.data() as any;
            return {
                "ID": d.id,
                "Código": i.code || '',
                "Medicamento": i.name || '',
                "Nombre Marca": i.brandName || '',
                "Ingrediente Activo": i.activeIngredient || '',
                "Presentación": i.presentation || '',
                "Stock Actual": i.stock ?? '',
                "Unidades p/Caja": i.units_per_box ?? '',
                "Precio (Q)": i.price ?? '',
                "Costo (Q)": i.cost ?? '',
                "Categoría": i.category || '',
                "Es Externo": i.isExternal ? 'Sí' : 'No'
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invData), "Inventario Interno");

        // ====================================
        // 5. MEDICAMENTOS EXTERNOS (external_medicines)
        // ====================================
        const extSnap = await getDocs(collection(db, 'external_medicines'));
        const extData = extSnap.docs.map(d => {
            const e = d.data() as any;
            return {
                "ID": d.id,
                "Nombre Genérico": e.name || '',
                "Nombre Comercial": e.commercialName || '',
                "Ingrediente Activo": e.activeIngredient || '',
                "Presentación": e.presentation || '',
                "Farmacia": e.pharmacy || '',
                "Distribuidor GT": e.distributorGT || '',
                "Registrado": fmtDate(e.createdAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extData), "Meds. Externos");

        // ====================================
        // 6. CATÁLOGO LABORATORIOS (laboratory_catalog)
        // ====================================
        const labCatSnap = await getDocs(collection(db, 'laboratory_catalog'));
        const labCatData = labCatSnap.docs.map(d => {
            const l = d.data() as any;
            return {
                "ID": d.id,
                "Código": l.code || '',
                "Nombre / Descripción": l.name || '',
                "Medida (U)": l.measure || '',
                "Precio (Q)": l.price ?? '',
                "Costo (Q)": l.cost ?? ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(labCatData), "Catálogo Labs");

        // ====================================
        // 7. PATOLOGÍAS (pathologies)
        // ====================================
        const pathSnap = await getDocs(collection(db, 'pathologies'));
        const pathData = pathSnap.docs.map(d => {
            const p = d.data() as any;
            return {
                "ID": d.id,
                "Nombre Patología": p.name || '',
                "Exámenes Asociados": Array.isArray(p.exams) ? p.exams.join(', ') : ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pathData), "Patologías");

        // ====================================
        // 8. ESPECIALIDADES (specialties)
        // ====================================
        const specSnap = await getDocs(collection(db, 'specialties'));
        const specData = specSnap.docs.map(d => {
            const s = d.data() as any;
            return {
                "ID": d.id,
                "Especialidad": s.name || ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(specData), "Especialidades");

        // ====================================
        // 9. CLÍNICAS (clinics)
        // ====================================
        const clinicSnap = await getDocs(collection(db, 'clinics'));
        const clinicData = clinicSnap.docs.map(d => {
            const cl = d.data() as any;
            return {
                "ID": d.id,
                "Nombre": cl.name || '',
                "Código": cl.code || '',
                "Activa": cl.isActive !== false ? 'Sí' : 'No'
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clinicData), "Clínicas");

        // ====================================
        // 10. USUARIOS (users)
        // ====================================
        const userSnap = await getDocs(collection(db, 'users'));
        const userData = userSnap.docs.map(d => {
            const u = d.data() as any;
            return {
                "ID / UID": d.id,
                "Nombre": u.name || u.displayName || '',
                "Email": u.email || '',
                "Rol": u.role || '',
                "Especialidad": u.specialty || '',
                "Especialidades": safeArr(u.specialties),
                "Colegiado": u.colegiado || '',
                "Teléfono": u.phone || '',
                "Estado": u.isActive !== false ? 'ACTIVO' : 'INACTIVO',
                "Firma URL": u.signatureUrl || '',
                "Cert. Digital URL": u.digitalCertData?.fileUrl || '',
                "Cert. Emisor": u.digitalCertData?.issuedBy || '',
                "Cert. Nombre": u.digitalCertData?.issuedTo || '',
                "Cert. Serial": u.digitalCertData?.serialNumber || '',
                "Cert. Vencimiento": u.digitalCertData?.expiryDate || '',
                "Creado": fmtDate(u.createdAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userData), "Usuarios");

        // ====================================
        // 11. HORARIOS DOCTOR POR DÍA (doctor_day_schedules)
        // ====================================
        const schedSnap = await getDocs(collection(db, 'doctor_day_schedules'));
        const schedData = schedSnap.docs.map(d => {
            const s = d.data() as any;
            return {
                "ID": d.id,
                "Doctor ID": s.doctorId || '',
                "Doctor": s.doctorName || '',
                "Fecha": s.date || '',
                "Modo": s.mode || '',
                "Hora Inicio": s.startTime || '',
                "Hora Fin": s.endTime || '',
                "Máx. Pacientes": s.maxPatients ?? '',
                "Creado": fmtDate(s.createdAt),
                "Creado Por": s.createdBy || ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedData), "Horarios Doctor");

        // ====================================
        // 12. CONFIG. HORARIOS (doctor_schedule_settings)
        // ====================================
        const schedSettSnap = await getDocs(collection(db, 'doctor_schedule_settings'));
        const schedSettData = schedSettSnap.docs.map(d => {
            const s = d.data() as any;
            return {
                "ID": d.id,
                "Autogestión Doctor": s.allowDoctorSelfManage ? 'Sí' : 'No',
                "Datos Completos": JSON.stringify(s)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(schedSettData), "Config. Horarios");

        // ====================================
        // 13. NOTIFICACIONES (notifications)
        // ====================================
        const notifSnap = await getDocs(collection(db, 'notifications'));
        const notifData = notifSnap.docs.map(d => {
            const n = d.data() as any;
            return {
                "ID": d.id,
                "Título": n.title || '',
                "Mensaje": n.message || '',
                "Tipo": n.type || '',
                "Leída": n.read ? 'Sí' : 'No',
                "Rol Destino": n.targetRole || '',
                "Usuario Destino": n.targetUserId || '',
                "Fecha": fmtDate(n.timestamp)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notifData), "Notificaciones");

        // ====================================
        // 14. FORMULARIOS ESPECIALIDAD (specialty_forms)
        // ====================================
        const sfSnap = await getDocs(collection(db, 'specialty_forms'));
        const sfData = sfSnap.docs.map(d => {
            const f = d.data() as any;
            const sectionsStr = f.sections?.map((s: any) => 
                `[${s.title}]: ${s.fields?.map((field: any) => field.label).join(', ') || ''}`
            ).join('\n') || '';
            return {
                "ID": d.id,
                "Nombre": f.name || '',
                "Especialidades": safeArr(f.specialties),
                "No. Secciones": f.sections?.length || 0,
                "Secciones y Campos": sectionsStr
            };
        });
        const wsSf = XLSX.utils.json_to_sheet(sfData);
        wsSf['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsSf, "Forms Especialidad");

        // ====================================
        // 15. CONTADORES SISTEMA (system_counters)
        // ====================================
        const scSnap = await getDocs(collection(db, 'system_counters'));
        const scData = scSnap.docs.map(d => {
            const s = d.data() as any;
            return {
                "ID": d.id,
                "Valor Actual": s.current ?? '',
                "Actualizado": fmtDate(s.updatedAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scData), "Contadores Sistema");

        // ====================================
        // 16. CONFIGURACIÓN SISTEMA (system_settings)
        // ====================================
        const ssSnap = await getDocs(collection(db, 'system_settings'));
        const ssData = ssSnap.docs.map(d => {
            const s = d.data() as any;
            return {
                "ID": d.id,
                "Datos Completos": JSON.stringify(s, null, 2)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ssData), "Config. Sistema");

        // ====================================
        // 17. LOGS AUDITORÍA (audit_logs)
        // ====================================
        const logSnap = await getDocs(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(5000)));
        const logData = logSnap.docs.map(d => {
            const l = d.data() as any;
            return {
                "ID": d.id,
                "Fecha": fmtDate(l.timestamp),
                "Usuario": l.user || '',
                "Acción": l.action || '',
                "Detalle": l.details || ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logData), "Auditoría");

        // ====================================
        // 18. REVISIONES CALIDAD (quality_reviews)
        // ====================================
        const qrSnap = await getDocs(collection(db, 'quality_reviews'));
        const qrData = qrSnap.docs.map(d => {
            const q = d.data() as any;
            return {
                "ID": d.id,
                "Fecha": q.dateKey || '',
                "Revisor": q.reviewerName || '',
                "Email Revisor": q.reviewerEmail || '',
                "Total Casos Día": q.totalCasesToday ?? '',
                "Críticos": q.criticalToday ?? '',
                "Alertas": q.alertToday ?? '',
                "Casos Revisados": q.reviewedCasesCount ?? '',
                "IDs Revisados": safeArr(q.reviewedCaseIds),
                "Bitácora": q.bitacora || '',
                "Creado": fmtDate(q.createdAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qrData), "Revisiones Calidad");

        // ====================================
        // 19. REPORTES VENTAS FARMACIA (pharmacy_sales_reports)
        // ====================================
        const psrSnap = await getDocs(collection(db, 'pharmacy_sales_reports'));
        const psrData = psrSnap.docs.map(d => {
            const r = d.data() as any;
            return {
                "ID": d.id,
                "Archivo": r.fileName || '',
                "Subido Por": r.uploadedBy || '',
                "Subido": fmtDate(r.uploadedAt),
                "No. Filas": r.rowCount ?? '',
                "Total Ventas (Q)": r.totalSales ?? '',
                "Clientes Únicos": r.uniqueClients ?? '',
                "Fecha Inicio": r.dateStart ? new Date(r.dateStart).toLocaleDateString('es-GT') : '',
                "Fecha Fin": r.dateEnd ? new Date(r.dateEnd).toLocaleDateString('es-GT') : '',
                "URL Descarga": r.downloadUrl || '',
                "Columnas": safeArr(r.columns)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(psrData), "Ventas Farmacia");

        // ====================================
        // 18. INVENTARIO ARCHIVOS (Storage)
        // ====================================
        const fileList: any[] = [];
        
        // A. Firmas Digitales de Doctores
        userSnap.docs.forEach(d => {
            const u = d.data() as any;
            if (u.digitalCertData && u.digitalCertData.fileUrl) {
                fileList.push({
                    "Contexto": "Firma Digital (.p12)",
                    "Propietario": u.name || u.displayName,
                    "Detalle": `Serial: ${u.digitalCertData.serialNumber}`,
                    "Fecha Registro": "N/A",
                    "URL Descarga": u.digitalCertData.fileUrl
                });
            }
            if (u.signatureUrl) {
                fileList.push({
                    "Contexto": "Firma Imagen",
                    "Propietario": u.name || u.displayName,
                    "Detalle": "Imagen de firma",
                    "Fecha Registro": "N/A",
                    "URL Descarga": u.signatureUrl
                });
            }
        });

        // B. Fotos de Pacientes
        patSnap.docs.forEach(d => {
            const p = d.data() as any;
            if (p.photoUrl) {
                fileList.push({
                    "Contexto": "Foto Paciente",
                    "Propietario": p.fullName,
                    "Detalle": "Fotografía del paciente",
                    "Fecha Registro": fmtDate(p.createdAt),
                    "URL Descarga": p.photoUrl
                });
            }
        });

        // C. Archivos de Pacientes (PDFs, Imágenes)
        patSnap.docs.forEach(d => {
            const p = d.data() as any;
            if (p.historyFiles && Array.isArray(p.historyFiles)) {
                p.historyFiles.forEach((f: any) => {
                    fileList.push({
                        "Contexto": "Expediente Paciente",
                        "Propietario": p.fullName,
                        "Detalle": f.name,
                        "Fecha Registro": fmtDate(f.uploadedAt),
                        "URL Descarga": f.url
                    });
                });
            }
        });

        if (fileList.length > 0) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fileList), "Inventario Archivos");
        } else {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{Info: "No hay archivos adjuntos en el sistema."}]), "Inventario Archivos");
        }

        // GENERAR ARCHIVO
        const fileName = `Reporte_AH_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        await logAuditAction(userEmail, 'EXPORTAR_EXCEL', 'Se descargó el reporte maestro en Excel con todas las tablas y archivos.');

    } catch (error) {
        console.error("Error generating Excel:", error);
        throw new Error("No se pudo generar el Excel. Ver consola.");
    }
};

// Restaurar Backup
export const restoreSystemBackup = async (file: File, userEmail: string) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                const parsed = JSON.parse(content);

                if (!parsed.meta || parsed.meta.system !== 'Asociación Humana HIS') {
                    throw new Error("Archivo inválido o incompatible.");
                }

                const allKeys = Object.keys(parsed.data);
                // Separar colecciones normales de subcollections
                const normalCollections = allKeys.filter(k => !k.includes('/__sub__/'));
                const subCollections = allKeys.filter(k => k.includes('/__sub__/'));
                
                // Restaurar colecciones normales
                for (const colName of normalCollections) {
                    try {
                        const records = parsed.data[colName];
                        const chunks = chunkArray(records, 400); 

                        for (const chunk of chunks) {
                            const batch = writeBatch(db);
                            chunk.forEach((record: any) => {
                                const docId = record._id;
                                const docData = { ...record };
                                delete docData._id;
                                const restored = deserializeTimestamps(docData);
                                const docRef = doc(db, colName, docId);
                                batch.set(docRef, restored);
                            });
                            await batch.commit();
                        }
                    } catch (err: any) {
                        console.error(`Error restaurando colección ${colName}:`, err);
                        if (err.message?.includes('permissions')) {
                            throw new Error(`Permisos insuficientes para restaurar la tabla "${colName}". Contacte al administrador de base de datos.`);
                        }
                        throw err;
                    }
                }

                // Restaurar subcollections (formato: "parentCol/__sub__/parentDocId/subColName")
                for (const subKey of subCollections) {
                    try {
                        const parts = subKey.split('/__sub__/');
                        const parentCol = parts[0];
                        const rest = parts[1]; // "parentDocId/subColName"
                        const slashIdx = rest.indexOf('/');
                        const parentDocId = rest.substring(0, slashIdx);
                        const subColName = rest.substring(slashIdx + 1);

                        const records = parsed.data[subKey];
                        const chunks = chunkArray(records, 400);

                        for (const chunk of chunks) {
                            const batch = writeBatch(db);
                            chunk.forEach((record: any) => {
                                const docId = record._id;
                                const docData = { ...record };
                                delete docData._id;
                                const restored = deserializeTimestamps(docData);
                                const docRef = doc(db, parentCol, parentDocId, subColName, docId);
                                batch.set(docRef, restored);
                            });
                            await batch.commit();
                        }
                    } catch (err: any) {
                        console.error(`Error restaurando sub-colección ${subKey}:`, err);
                        throw new Error(`Permisos insuficientes para restaurar datos secundarios (${subKey}).`);
                    }
                }

                await logAuditAction(userEmail, 'RESTAURO_SISTEMA', `Sistema restaurado desde archivo generado el: ${parsed.meta.generatedAt}`);
                resolve(true);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsText(file);
    });
};

export const getBackupSettings = async () => {
    try {
        const docRef = doc(db, 'system_settings', 'backup_config');
        // @ts-ignore
        const d = await import('firebase/firestore').then(m => m.getDoc(docRef));
        if (d.exists()) return d.data();
        return { enabled: false, days: [], lastBackupDate: null, lastBackupDisplay: null };
    } catch (e) {
        return { enabled: false, days: [], lastBackupDate: null, lastBackupDisplay: null };
    }
};

export const saveBackupSettings = async (settings: any, userEmail: string) => {
    await setDoc(doc(db, 'system_settings', 'backup_config'), settings, { merge: true });
    await logAuditAction(userEmail, 'CONFIG_BACKUP', `Configuración de respaldo actualizada.`);
};

const registerBackupCompletion = async () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; 
    const displayStr = today.toLocaleString('es-GT', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
    await setDoc(doc(db, 'system_settings', 'backup_config'), { lastBackupDate: todayStr, lastBackupDisplay: displayStr, lastBackupTs: Date.now() }, { merge: true });
};

const chunkArray = (myArray: any[], chunk_size: number) => {
    let index = 0;
    const arrayLength = myArray.length;
    const tempArray = [];
    for (index = 0; index < arrayLength; index += chunk_size) {
        let myChunk = myArray.slice(index, index + chunk_size);
        tempArray.push(myChunk);
    }
    return tempArray;
};
