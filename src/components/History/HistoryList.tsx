
import * as React from 'react';
import { useState, useEffect } from 'react';
import { ClipboardList, Search, FileCheck, Clock, Eye, ShieldAlert } from 'lucide-react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config.ts';
import { Consultation, UserProfile } from '../../../types.ts';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface HistoryListProps {
    user: UserProfile;
    onSelectConsultation: (consultation: Consultation) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ user, onSelectConsultation }) => {
    const [consultations, setConsultations] = useState<Consultation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const isDoctor = user.role === 'doctor';
    const isAdmin = user.role === 'admin';
    const isNurse = user.role === 'nurse';
    // Recepción no debería tener acceso, definimos flag para UI
    const hasAccess = isAdmin || isNurse || isDoctor;

    useEffect(() => {
        const fetchHistory = async () => {
            if (!hasAccess) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                let q;
                // LOGIC CORRECTION: 
                // Admin OR Nurse -> See ALL finished consultations.
                // Doctor -> See ONLY their own finished consultations.
                if (isAdmin || isNurse) {
                    q = query(
                        collection(db, 'consultations'), 
                        where('status', 'in', ['finished', 'delivered']), 
                        orderBy('date', 'desc'), 
                        limit(100)
                    );
                } else if (isDoctor) {
                    q = query(
                        collection(db, 'consultations'), 
                        where('status', 'in', ['finished', 'delivered']), 
                        where('doctorId', '==', user.uid),
                        orderBy('date', 'desc'), 
                        limit(50)
                    );
                }
                
                if (q) {
                    const snap = await getDocs(q);
                    const data = snap.docs.map(d => ({ id: d.id, ...(d.data() as object) } as Consultation));
                    setConsultations(data);
                }
            } catch (e) {
                console.error("Error fetching history:", e);
                toast.error("Error al cargar historial.");
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [user.uid, isDoctor, isAdmin, isNurse, hasAccess]);

    // Helper para fecha GT
    const formatDateGT = (ts: number) => {
        return new Date(ts).toLocaleDateString('es-GT', {
            timeZone: 'America/Guatemala',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    // Client-side filtering for search
    const filteredConsultations = consultations.filter(c => 
        (c.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
         c.doctorName?.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!hasAccess) {
        return (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center p-20 text-slate-400 bg-white rounded-3xl border border-slate-200 shadow-sm min-h-[400px]">
                <ShieldAlert className="w-12 h-12 mb-4 text-slate-300" />
                <h3 className="text-lg font-bold">Acceso Restringido</h3>
                <p className="text-sm">Su perfil no tiene permisos para ver el historial clínico.</p>
            </motion.div>
        );
    }

    return (
        <motion.div initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} className="max-w-6xl mx-auto space-y-6">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                {/* Header */}
                <div className="p-6 border-b flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/30">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm text-brand-600">
                            <ClipboardList className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">Historial de Consultas</h3>
                            <p className="text-xs text-slate-500">Pacientes atendidos y finalizados</p>
                        </div>
                    </div>
                    <div className="relative flex-1 md:max-w-xs w-full">
                        <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                        <input 
                            type="text" 
                            placeholder="Buscar por paciente o médico..." 
                            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-200 transition-all shadow-sm" 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b">
                            <tr>
                                <th className="p-4">Fecha</th>
                                <th className="p-4">Paciente</th>
                                <th className="p-4">Médico</th>
                                <th className="p-4">Estado</th>
                                <th className="p-4 text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {loading ? (
                                <tr><td colSpan={5} className="p-24 text-center animate-pulse text-slate-300 font-bold uppercase text-xs tracking-widest">Cargando Historial...</td></tr>
                            ) : filteredConsultations.length > 0 ? (
                                filteredConsultations.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors text-sm group">
                                        <td className="p-4 font-mono font-bold text-slate-500 text-xs">{formatDateGT(c.date)}</td>
                                        <td className="p-4 font-bold text-slate-800">{c.patientName}</td>
                                        <td className="p-4 text-slate-600 text-xs">Dr. {c.doctorName}</td>
                                        <td className="p-4">
                                            {c.status === 'delivered' ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-100">
                                                    <FileCheck className="w-3 h-3" /> Entregado
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-bold uppercase border border-slate-200">
                                                    <Clock className="w-3 h-3" /> Pendiente Entrega
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <button 
                                                onClick={() => onSelectConsultation(c)}
                                                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 transition-all shadow-sm flex items-center justify-end gap-2 ml-auto"
                                            >
                                                <Eye className="w-3 h-3" /> Ver Detalle
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={5} className="p-24 text-center text-slate-400 italic">No se encontraron registros.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
};
