import * as React from 'react';
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { Consultation } from '../../../types';
import { AlertCircle, History, X, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ReferralNotesAlertProps {
    patientId: string;
    doctorSpecialty: string;
}

interface ReferralNote {
    id: string;
    date: Date;
    doctorName: string;
    note: string;
}

export const ReferralNotesAlert: React.FC<ReferralNotesAlertProps> = ({ patientId, doctorSpecialty }) => {
    const [notes, setNotes] = useState<ReferralNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    useEffect(() => {
        const loadReferrals = async () => {
            if (!patientId || !doctorSpecialty) {
                setLoading(false);
                return;
            }
            
            try {
                // Obtenemos todas las consultas del paciente
                const q = query(
                    collection(db, 'consultations'), 
                    where('patientId', '==', patientId),
                    orderBy('date', 'desc') // Usamos 'date' ya que 'createdAt' no está garantizado
                );
                
                const snap = await getDocs(q);
                const foundNotes: ReferralNote[] = [];

                snap.forEach(doc => {
                    const data = doc.data() as Consultation;
                    if (data.specialtyReferrals && Array.isArray(data.specialtyReferrals)) {
                        // Buscar referencias a ESTA especialidad
                        const relevantRef = data.specialtyReferrals.find(
                            ref => ref.specialty === doctorSpecialty
                        );

                        if (relevantRef && relevantRef.note && relevantRef.note.trim().length > 0) {
                            foundNotes.push({
                                id: doc.id,
                                date: typeof data.date === 'number' ? new Date(data.date) : new Date(),
                                doctorName: data.doctorName || 'Desconocido',
                                note: relevantRef.note
                            });
                        }
                    }
                });

                setNotes(foundNotes);
            } catch (err) {
                console.error("Error loading referral notes:", err);
            } finally {
                setLoading(false);
            }
        };

        loadReferrals();
    }, [patientId, doctorSpecialty]);

    if (loading || notes.length === 0) return null;

    const latestNote = notes[0];

    return (
        <>
            <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm"
            >
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                        <h4 className="text-sm font-bold text-amber-800 mb-1 flex items-center justify-between">
                            <span>Nota de Referencia ({doctorSpecialty})</span>
                            <span className="text-[10px] font-normal text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                {format(latestNote.date, "d 'de' MMMM, yyyy", { locale: es })}
                            </span>
                        </h4>
                        <p className="text-sm text-amber-900 leading-relaxed italic">
                            "{latestNote.note}"
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                            <span className="text-xs text-amber-700 font-medium">Ref: Dr. {latestNote.doctorName}</span>
                            
                            {notes.length > 1 && (
                                <button 
                                    onClick={() => setShowHistoryModal(true)}
                                    className="text-xs font-bold text-amber-700 hover:text-amber-900 underline flex items-center gap-1 cursor-pointer"
                                    type="button"
                                >
                                    <History className="w-3 h-3" /> Ver {notes.length - 1} notas anteriores
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* MODAL DE HISTORIAL */}
            <AnimatePresence>
                {showHistoryModal && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
                        >
                            <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                    <History className="w-5 h-5 text-brand-600" />
                                    Historial de Referencias
                                </h3>
                                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition" type="button">
                                    <X className="w-5 h-5 text-slate-500" />
                                </button>
                            </div>
                            
                            <div className="p-4 overflow-y-auto custom-scrollbar space-y-4 bg-slate-50/50 flex-1">
                                {notes.map((note, idx) => (
                                    <div key={note.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded-md flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {format(note.date, "dd/MM/yyyy", { locale: es })}
                                            </span>
                                            {idx === 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Más Reciente</span>}
                                        </div>
                                        <p className="text-sm text-slate-700 mb-3 italic">"{note.note}"</p>
                                        <div className="flex justify-end border-t pt-2">
                                            <span className="text-xs text-slate-500">Ref: Dr. {note.doctorName}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};
