
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Consultation, Patient, UserProfile } from '../types';

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

// --- NOTIFICACIONES DE CITAS (AGENDA) ---

export const notifyAppointmentCreated = async (
    patientName: string,
    doctorName: string,
    doctorId: string,
    dateString: string
) => {
    // Al Doctor
    await createNotification(
        "Nueva Cita Agendada", 
        `Tiene una nueva cita con ${patientName} para el ${dateString}.`, 
        'info', 
        undefined, 
        doctorId
    );

    // Al Admin
    await createNotification(
        "Nueva Cita en Agenda", 
        `Se ha agendado una cita: Paciente ${patientName} con Dr. ${doctorName} (${dateString}).`, 
        'info', 
        'admin'
    );
};

export const notifyAppointmentNoShow = async (
    patientName: string,
    doctorName: string,
    doctorId: string,
    dateString: string
) => {
    const msg = `El paciente ${patientName} no se presentó a su cita de las ${dateString}.`;

    // Al Doctor
    await createNotification(
        "Paciente No Presentado", 
        msg, 
        'alert', 
        undefined, 
        doctorId
    );

    // Al Admin
    await createNotification(
        "Ausencia de Paciente", 
        `Paciente ${patientName} no se presentó a cita con Dr. ${doctorName} (${dateString}).`, 
        'alert', 
        'admin'
    );
};

export const notifyAppointmentCancelled = async (
    patientName: string,
    doctorName: string,
    doctorId: string,
    reason: string,
    cancelledBy: string
) => {
    const msg = `Cita de ${patientName} cancelada por ${cancelledBy}. Motivo: ${reason}`;

    // Al Doctor
    await createNotification(
        "Cita Cancelada", 
        msg, 
        'alert', 
        undefined, 
        doctorId
    );

    // Al Admin
    await createNotification(
        "Cancelación de Cita", 
        `Agenda Dr. ${doctorName}: ${msg}`, 
        'alert', 
        'admin'
    );
};


// --- NOTIFICACIONES DE CONSULTAS (SALA/CLÍNICA) ---

// 1. CUANDO SE CREA UNA CONSULTA (CHECK-IN)
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
export const notifyConsultationCancelled = async (
    consultation: Consultation,
    cancelledBy: string,
    reason: string
) => {
    const details = `Paciente: ${consultation.patientName}. Anulado por: ${cancelledBy}. Motivo: ${reason}`;

    if (consultation.doctorId) {
        await createNotification(
            "Consulta Cancelada",
            `Una consulta de su lista ha sido anulada. ${details}`,
            'alert',
            undefined,
            consultation.doctorId
        );
    }

    await createNotification(
        "Consulta Anulada",
        `Atención cancelada en sala de espera. ${details}`,
        'alert',
        'nurse'
    );

    await createNotification(
        "Anulación Registrada",
        details,
        'alert',
        'admin'
    );
};

// 3. CUANDO EL MÉDICO COMPLETA LA CONSULTA
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

    // A Recepción
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

export const notifyReceptionFollowUp = async (
    consultation: Consultation,
    doctorName: string,
    days: number,
    followUpDate: Date
) => {
    const dateStr = followUpDate.toLocaleDateString('es-GT', {
        timeZone: 'America/Guatemala',
        year: 'numeric',
        month: 'short',
        day: '2-digit'
    });

    const title = "Reconsulta Solicitada";
    const body = `El Dr. ${doctorName} desea volver a ver a ${consultation.patientName} en aproximadamente ${days} días. Fecha sugerida: ${dateStr}.`;

    await createNotification(
        title,
        body,
        'info',
        'receptionist'
    );
};

// 4. CUANDO ENFERMERÍA ENTREGA/FINALIZA EL PROCESO
export const notifyConsultationDelivered = async (
    consultation: Consultation,
    nurseName: string
) => {
    const msg = `Paciente: ${consultation.patientName}. Entregado por: ${nurseName}.`;

    await createNotification(
        "Expediente Entregado y Finalizado",
        `El ciclo de atención ha concluido. ${msg}`,
        'success',
        'admin'
    );
};
