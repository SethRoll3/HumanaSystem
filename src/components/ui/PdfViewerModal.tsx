import * as React from 'react';
import { useState } from 'react';
import { X, Download, Printer, Loader2, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PdfViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    blobUrl: string;
    filename: string;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({ isOpen, onClose, blobUrl, filename }) => {
    const [loading, setLoading] = useState(true);

    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handlePrint = () => {
        const printWindow = window.open(blobUrl, '_blank');
        if (printWindow) {
            printWindow.onload = () => {
                printWindow.print();
            };
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-100 rounded-xl">
                                <FileText className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-base">{filename}</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Vista previa del documento</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handlePrint}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition"
                            >
                                <Printer className="w-4 h-4" /> Imprimir
                            </button>
                            <button
                                onClick={handleDownload}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition"
                            >
                                <Download className="w-4 h-4" /> Descargar
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition ml-2"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* PDF Viewer */}
                    <div className="flex-1 relative bg-slate-200">
                        {loading && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
                                <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                            </div>
                        )}
                        <iframe
                            src={blobUrl}
                            className="w-full h-full border-0"
                            onLoad={() => setLoading(false)}
                            title={filename}
                        />
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
