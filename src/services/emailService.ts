
import emailjs from '@emailjs/browser';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Patient } from '../types';

const SERVICE_ID = "service_yiq2ht5"; 
const TEMPLATE_ID = "template_j5rnsr9"; 
const PUBLIC_KEY = "uJklkGkkhjModglNK"; 

emailjs.init(PUBLIC_KEY);

// Helper para obtener correos de Administradores
const getAdminEmails = async (): Promise<{email: string, name: string}[]> => {
    try {
        const q = query(collection(db, 'users'), where('role', '==', 'admin'));
        const snapshot = await getDocs(q);
        const admins: {email: string, name: string}[] = [];
        snapshot.forEach(doc => { 
            const data = doc.data() as any;
            if (data.email && data.isActive !== false) {
                admins.push({ email: data.email, name: data.name || 'Administrador' });
            }
        });
        return admins;
    } catch (e) { 
        console.error("Error fetching admin emails:", e);
        return []; 
    }
};

const sendEmail = async (toEmail: string, toName: string, subject: string, htmlMessage: string) => {
    if (!toEmail || toEmail.includes('example.com')) return; 
    try {
        await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
            to_email: toEmail,
            to_name: toName,
            subject: subject,
            message: htmlMessage, 
            reply_to: "info@asociacionhumana.com"
        });
    } catch (error) { console.error("Error enviando email:", error); }
};

// NOTIFICACIÓN: ANULACIÓN DE CONSULTA (YA EXISTENTE)
export const notifyCancellationToAdmins = async (patient: Patient, cancelledBy: string, reason: string) => {
    const cancelHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 2px solid #fee2e2; border-radius: 16px; padding: 25px; background-color: #fef2f2;">
            <div style="color: #dc2626; font-size: 18px; font-weight: bold; margin-bottom: 15px;">⚠️ ALERTA DE SEGURIDAD: CONSULTA ANULADA</div>
            <p style="color: #991b1b; font-size: 15px; margin-bottom: 15px;">Se ha eliminado una consulta activa del sistema.</p>
            
            <table width="100%" style="font-size: 14px; color: #334155; margin-bottom: 20px;">
                <tr><td style="padding: 5px 0;"><b>Paciente Afectado:</b></td><td>${patient.fullName}</td></tr>
                <tr><td style="padding: 5px 0;"><b>Responsable de la Acción:</b></td><td>${cancelledBy}</td></tr>
            </table>

            <div style="background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 12px; padding: 15px;">
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 5px;">MOTIVO REGISTRADO:</div>
                <div style="font-size: 14px; color: #b91c1c; font-style: italic;">"${reason}"</div>
            </div>
        </div>
    `;

    const admins = await getAdminEmails();
    for (const admin of admins) {
        await sendEmail(admin.email, admin.name, `ALERTA: Anulación de Consulta - ${patient.fullName}`, cancelHtml);
    }
};

// NOTIFICACIÓN: CANCELACIÓN DE CITA (NUEVA)
export const notifyAppointmentCancellationToAdmins = async (
    patientName: string,
    doctorName: string,
    dateString: string,
    cancelledBy: string,
    reason: string
) => {
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 2px solid #fef3c7; border-radius: 16px; padding: 25px; background-color: #fffbeb;">
            <div style="color: #92400e; font-size: 18px; font-weight: bold; margin-bottom: 15px;">📅 AGENDA: CITA CANCELADA</div>
            
            <table width="100%" style="font-size: 14px; color: #334155; margin-bottom: 20px;">
                <tr><td style="padding: 5px 0;"><b>Paciente:</b></td><td>${patientName}</td></tr>
                <tr><td style="padding: 5px 0;"><b>Doctor:</b></td><td>${doctorName}</td></tr>
                <tr><td style="padding: 5px 0;"><b>Fecha Original:</b></td><td>${dateString}</td></tr>
                <tr><td style="padding: 5px 0;"><b>Cancelado por:</b></td><td>${cancelledBy}</td></tr>
            </table>

            <div style="background-color: #ffffff; border: 1px solid #fcd34d; border-radius: 12px; padding: 15px;">
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 5px;">MOTIVO:</div>
                <div style="font-size: 14px; color: #b45309; font-style: italic;">"${reason}"</div>
            </div>
        </div>
    `;

    const admins = await getAdminEmails();
    for (const admin of admins) {
        await sendEmail(admin.email, admin.name, `AGENDA: Cita Cancelada - ${patientName}`, html);
    }
};
