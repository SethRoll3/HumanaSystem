
import emailjs from '@emailjs/browser';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { Patient } from '../../types.ts';

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

// ÚNICA NOTIFICACIÓN ACTIVA: ANULACIÓN DE CONSULTA (SOLO A ADMINS)
export const notifyCancellationToAdmins = async (patient: Patient, cancelledBy: string, reason: string) => {
    const cancelHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 2px solid #fee2e2; border-radius: 16px; padding: 25px; background-color: #fef2f2;">
            <div style="color: #dc2626; font-size: 18px; font-weight: bold; margin-bottom: 15px;">⚠️ ALERTA DE SEGURIDAD: CONSULTA ANULADA</div>
            <p style="color: #991b1b; font-size: 15px; margin-bottom: 15px;">Se ha eliminado una consulta activa del sistema.</p>
            
            <table width="100%" style="font-size: 14px; color: #334155; margin-bottom: 20px;">
                <tr><td style="padding: 5px 0;"><b>Paciente Afectado:</b></td><td>${patient.fullName}</td></tr>
                <tr><td style="padding: 5px 0;"><b>Código/DPI:</b></td><td>${patient.billingCode || patient.id}</td></tr>
                <tr><td style="padding: 5px 0;"><b>Responsable de la Acción:</b></td><td>${cancelledBy}</td></tr>
            </table>

            <div style="background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 12px; padding: 15px;">
                <div style="font-size: 12px; color: #94a3b8; margin-bottom: 5px;">MOTIVO REGISTRADO:</div>
                <div style="font-size: 14px; color: #b91c1c; font-style: italic;">"${reason}"</div>
            </div>
            
            <div style="font-size: 11px; color: #94a3b8; margin-top: 20px; text-align: center;">
                Este es un mensaje automático de auditoría para la administración.
            </div>
        </div>
    `;

    const admins = await getAdminEmails();
    
    // Enviar a todos los admins encontrados
    for (const admin of admins) {
        await sendEmail(admin.email, admin.name, `ALERTA: Anulación de Consulta - ${patient.fullName}`, cancelHtml);
    }
};
