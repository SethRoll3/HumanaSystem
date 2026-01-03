
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase/config.ts';

export const logAuditAction = async (userEmail: string, action: string, details: string) => {
  try {
    // Obtenemos la fecha actual en formato Guatemala para incluirla en los detalles si es necesario
    const guateDate = new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala' });
    
    await addDoc(collection(db, 'audit_logs'), {
      action: action,
      details: `${details} [Fecha GT: ${guateDate}]`,
      user: userEmail,
      timestamp: Date.now() // Guardamos timestamp numérico para ordenamiento fácil
    });
  } catch (error) {
    console.error("Error logging audit action:", error);
    // No lanzamos error para no interrumpir el flujo principal si falla el log
  }
};
