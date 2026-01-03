
import { collection, getDocs, writeBatch, doc, Timestamp, query, orderBy, limit, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { logAuditAction } from './auditService.ts';
// @ts-ignore
import * as XLSX from 'xlsx';

// Colecciones a respaldar (System Backup .ah)
const COLLECTIONS = [
    'users',
    'patients',
    'inventory',
    'consultations',
    'specialties',
    'pathologies',
    'external_medicines',
    'system_settings', 
    'audit_logs' 
];

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
                const safeData: any = { _id: d.id, ...data };
                
                Object.keys(safeData).forEach(key => {
                    if (safeData[key] instanceof Timestamp) {
                        safeData[key] = { _type: 'Timestamp', value: safeData[key].toDate().toISOString() };
                    }
                });
                return safeData;
            });
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
            return date.toLocaleString('es-GT');
        };

        // 1. PACIENTES
        const patSnap = await getDocs(collection(db, 'patients'));
        const patData = patSnap.docs.map(d => {
            const p = d.data() as any;
            return {
                "Nombre Completo": p.fullName,
                "Código/DPI": p.billingCode || p.id,
                "Edad": p.age,
                "Género": p.gender,
                "Teléfono": p.phone,
                "Ocupación": p.occupation,
                "Responsable": p.responsibleName,
                "Tel. Responsable": p.responsiblePhone,
                "Historial Médico": p.medical_history,
                "Tipo Consulta": p.consultationType,
                "Tratamiento Previo": p.previousTreatment,
                "Creado": fmtDate(p.createdAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(patData), "Pacientes");

        // 2. CONSULTAS
        const consSnap = await getDocs(query(collection(db, 'consultations'), orderBy('date', 'desc')));
        const consData = consSnap.docs.map(d => {
            const c = d.data() as any;
            
            const prescriptionStr = c.prescription?.map((m: any) => 
                `• ${m.name} (${m.quantity}): ${m.dosage}`
            ).join('\n') || '';

            const labsStr = [
                ...(c.referralGroups?.map((g: any) => `[PERFIL ${g.pathology}]: ${g.exams.join(', ')}`) || []),
                ...(c.exams || []).map((e: string) => `• ${e}`)
            ].join('\n');

            const refStr = c.specialtyReferrals?.map((r: any) => 
                `• A ${r.specialty}: ${r.note || ''}`
            ).join('\n') || '';

            return {
                "Fecha": fmtDate(c.date),
                "Paciente": c.patientName,
                "Médico": c.doctorName,
                "Estado": c.status === 'delivered' ? 'ENTREGADO' : (c.status === 'finished' ? 'FINALIZADO' : c.status.toUpperCase()),
                "Diagnóstico": c.diagnosis,
                "Receta Médica": prescriptionStr,
                "Notas Receta": c.prescriptionNotes,
                "Laboratorios Solicitados": labsStr,
                "Referencias Externas": refStr,
                "Notas Enfermería": c.followUpText,
                "Signos Vitales": c.vitals ? `T:${c.vitals.temp}, P:${c.vitals.pressure}, W:${c.vitals.weight}` : '',
                "Boleta Pago": c.paymentReceipt,
                "Recepción": c.receptionistId, 
                "ID Consulta": d.id
            };
        });
        const wsCons = XLSX.utils.json_to_sheet(consData);
        wsCons['!cols'] = [{wch: 20}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 40}, {wch: 50}, {wch: 30}, {wch: 40}];
        XLSX.utils.book_append_sheet(wb, wsCons, "Consultas");

        // 3. INVENTARIO (INTERNO)
        const invSnap = await getDocs(collection(db, 'inventory'));
        const invData = invSnap.docs.map(d => {
            const i = d.data() as any;
            return {
                "Medicamento": i.name,
                "Presentación": i.presentation,
                "Stock Actual": i.stock,
                "Precio (Q)": i.price,
                "Categoría": i.category,
                "Unidades p/Caja": i.units_per_box
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invData), "Inventario Interno");

        // 4. MEDICAMENTOS EXTERNOS
        const extSnap = await getDocs(collection(db, 'external_medicines'));
        const extData = extSnap.docs.map(d => {
            const e = d.data() as any;
            return {
                "Nombre Genérico": e.name,
                "Nombre Comercial": e.commercialName,
                "Ingrediente Activo": e.activeIngredient,
                "Farmacia": e.pharmacy,
                "Distribuidor GT": e.distributorGT,
                "Registrado": fmtDate(e.createdAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(extData), "Meds. Externos");

        // 5. PATOLOGIAS
        const pathSnap = await getDocs(collection(db, 'pathologies'));
        const pathData = pathSnap.docs.map(d => {
            const p = d.data() as any;
            return {
                "Nombre Patología": p.name,
                "Exámenes Asociados": Array.isArray(p.exams) ? p.exams.join(', ') : ''
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pathData), "Patologías");

        // 6. ESPECIALIDADES
        const specSnap = await getDocs(collection(db, 'specialties'));
        const specData = specSnap.docs.map(d => ({ "Especialidad": (d.data() as any).name }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(specData), "Especialidades");

        // 7. USUARIOS
        const userSnap = await getDocs(collection(db, 'users'));
        const userData = userSnap.docs.map(d => {
            const u = d.data() as any;
            return {
                "Nombre": u.name || u.displayName,
                "Email": u.email,
                "Rol": u.role,
                "Especialidad": u.specialty || 'N/A',
                "Estado": u.isActive !== false ? 'ACTIVO' : 'INACTIVO',
                "Creado": fmtDate(u.createdAt)
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(userData), "Usuarios del Sistema");

        // 8. LOGS DE AUDITORÍA
        const logSnap = await getDocs(query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(2000)));
        const logData = logSnap.docs.map(d => {
            const l = d.data() as any;
            return {
                "Fecha": fmtDate(l.timestamp),
                "Usuario": l.user,
                "Acción": l.action,
                "Detalle": l.details
            };
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logData), "Auditoría");

        // 9. INVENTARIO DE ARCHIVOS (NUEVO: PARA CONTROL DE STORAGE)
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
        });

        // B. Archivos de Pacientes (PDFs, Imágenes)
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

// Restaurar Backup (Lógica Inalterada)
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

                const collections = Object.keys(parsed.data);
                
                for (const colName of collections) {
                    const records = parsed.data[colName];
                    const chunks = chunkArray(records, 400); 

                    for (const chunk of chunks) {
                        const batch = writeBatch(db);
                        chunk.forEach((record: any) => {
                            const docId = record._id;
                            const docData = { ...record };
                            delete docData._id;
                            Object.keys(docData).forEach(key => {
                                if (docData[key] && docData[key]._type === 'Timestamp') {
                                    docData[key] = Timestamp.fromDate(new Date(docData[key].value));
                                }
                            });
                            const docRef = doc(db, colName, docId);
                            batch.set(docRef, docData);
                        });
                        await batch.commit();
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
