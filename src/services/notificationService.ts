
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { Consultation, Patient, UserProfile } from '../../types.ts';

// Helper genérico para crear notificación en Firestore
const createNotification = async (
    title: string, 
    message: string, 
    type: 'info' | 'success' | 'alert', 
    targetRole?: 'nurse' | 'admin' | 'doctor' | 'receptionist', 
    targetUserId?: string
) => {
    try {
        await addDoc(collection(db, 'notifications'), {
            title,
            message,
            type,
            targetRole: targetRole || null,
            targetUserId: targetUserId || null,
            read: false,
            timestamp: Timestamp.now()
        });
    } catch (error) {
        console.error("Error creating notification:", error);
    }
};

// 1. CUANDO SE CREA UNA CONSULTA (CHECK-IN)
// - Doctor Asignado: Recibe aviso personal.
// - Admin: Recibe aviso general de monitoreo.
export const notifyConsultationCreated = async (
    doctor: UserProfile, 
    patient: Patient, 
    receptionistName: string
) => {
    const msg = `Paciente: ${patient.fullName}. Creado por: ${receptionistName}.`;
    
    // Al Doctor Específico
    await createNotification(
        "Nueva Consulta Asignada", 
        `Se le ha asignado un nuevo paciente. ${msg}`, 
        'info', 
        undefined, 
        doctor.uid // targetUserId
    );

    // Al Admin
    await createNotification(
        "Nueva Consulta en Sala", 
        `Dr. ${doctor.name} tiene un nuevo paciente. ${msg}`, 
        'info', 
        'admin'
    );
};

// 2. CUANDO SE ANULA UNA CONSULTA
// - Doctor Asignado: Aviso personal (si estaba asignado).
// - Enfermería: Aviso para descartar preparación.
// - Admin: Aviso de auditoría.
export const notifyConsultationCancelled = async (
    consultation: Consultation,
    cancelledBy: string,
    reason: string
) => {
    const details = `Paciente: ${consultation.patientName}. Anulado por: ${cancelledBy}. Motivo: ${reason}`;

    // Al Doctor (si existe ID)
    if (consultation.doctorId) {
        await createNotification(
            "Consulta Cancelada",
            `Una consulta de su lista ha sido anulada. ${details}`,
            'alert',
            undefined,
            consultation.doctorId
        );
    }

    // A Enfermería
    await createNotification(
        "Consulta Anulada",
        `Atención cancelada en sala de espera. ${details}`,
        'alert',
        'nurse'
    );

    // Al Admin
    await createNotification(
        "Anulación Registrada",
        details,
        'alert',
        'admin'
    );
};

// 3. CUANDO EL MÉDICO COMPLETA LA CONSULTA
// - Enfermería: Aviso "Listo para entrega/medicinas".
// - Admin: Aviso de flujo.
// - Recepción: Aviso de que terminó (NUEVO).
export const notifyConsultationFinished = async (
    consultation: Consultation,
    doctorName: string
) => {
    const msg = `Paciente: ${consultation.patientName}. Atendido por: Dr. ${doctorName}.`;

    // A Enfermería
    await createNotification(
        "Paciente Listo para Entrega",
        `Consulta finalizada. Proceder con entrega de documentos/medicinas. ${msg}`,
        'success',
        'nurse'
    );

    // A Recepción (NUEVO)
    await createNotification(
        "Consulta Finalizada",
        `El Dr. ${doctorName} ha finalizado la atención de ${consultation.patientName}.`,
        'info',
        'receptionist'
    );

    // Al Admin
    await createNotification(
        "Consulta Médica Completada",
        msg,
        'success',
        'admin'
    );
};

// 4. CUANDO ENFERMERÍA ENTREGA/FINALIZA EL PROCESO
// - Admin: Aviso de cierre de ciclo.
export const notifyConsultationDelivered = async (
    consultation: Consultation,
    nurseName: string
) => {
    const msg = `Paciente: ${consultation.patientName}. Entregado por: ${nurseName}.`;

    // Al Admin
    await createNotification(
        "Expediente Entregado y Finalizado",
        `El ciclo de atención ha concluido. ${msg}`,
        'success',
        'admin'
    );
};
