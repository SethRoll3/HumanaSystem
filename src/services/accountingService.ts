
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { Consultation } from '../types.ts';

export interface DailyIncomeSummary {
    totalIncome: number;
    consultationCount: number;
    averageTicket: number;
    transactions: Consultation[];
}

export const getIncomeByDateRange = async (startDate: Date, endDate: Date): Promise<DailyIncomeSummary> => {
    try {
        // Convertir a timestamps numéricos para comparar con el campo 'date' de Consultation
        const startTs = startDate.getTime();
        const endTs = endDate.getTime();

        const ref = collection(db, 'consultations');
        
        // Consulta compuesta: rango de fechas
        // Nota: Firestore requiere índice compuesto para 'date' desc con filtros de rango.
        // Si falla en consola, seguir el link que provee Firebase para crear el índice.
        const q = query(
            ref, 
            where('date', '>=', startTs), 
            where('date', '<=', endTs),
            orderBy('date', 'desc')
        );

        const snapshot = await getDocs(q);
        const transactions = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Consultation));

        // Calcular totales
        const totalIncome = transactions.reduce((acc, curr) => acc + (curr.paymentAmount || 0), 0);
        const consultationCount = transactions.length;
        const averageTicket = consultationCount > 0 ? totalIncome / consultationCount : 0;

        return {
            totalIncome,
            consultationCount,
            averageTicket,
            transactions
        };

    } catch (error) {
        console.error("Error fetching accounting data:", error);
        return { totalIncome: 0, consultationCount: 0, averageTicket: 0, transactions: [] };
    }
};
