
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, Timestamp, getDocs, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config.ts';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile, Patient, PatientFile, Specialty } from '../../types.ts';
import { Users, ClipboardList, Package, FlaskConical, Stethoscope, History, Edit2, Trash2, Ban, Plus, X, Save, Loader2, AlertTriangle, CheckCircle, Search, UserMinus, ShieldAlert, ChevronLeft, ChevronRight, Globe, Building2, UploadCloud, FileText, Database, Download, Upload, Clock, FileSpreadsheet, Cloud, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { logAuditAction } from '../services/auditService.ts';
import { createSystemUser, updateSystemUser } from '../services/userService.ts';
import { createPatient } from '../services/patientService.ts';
import { getSpecialties } from '../services/inventoryService.ts';
import { generateSystemBackup, restoreSystemBackup, getBackupSettings, saveBackupSettings, generateReadableExcelReport } from '../services/backupService.ts';
import { COUNTRIES, GT_DEPARTMENTS, GT_ZONES, MUNICIPALITIES_WITH_ZONES } from '../data/geography.ts';
import { UserModal } from '../components/Admin/UserModal.tsx';
import { AccountingDashboard } from '../components/Admin/AccountingDashboard.tsx';
// @ts-ignore
import * as XLSX from 'xlsx';

interface AdminPanelProps {
  user: UserProfile;
}

type AdminTab = 'users' | 'patients' | 'inventory' | 'laboratories' | 'external' | 'pathologies' | 'specialties' | 'logs' | 'security' | 'accounting';

export const AdminPanel: React.FC<AdminPanelProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [backupConfig, setBackupConfig] = useState<any>({ days: [] });
  const [isRestoring, setIsRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [formValues, setFormValues] = useState<any>({});
  const [isNoResponsible, setIsNoResponsible] = useState(false);
  
  const [patientFiles, setPatientFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<PatientFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [specialtiesList, setSpecialtiesList] = useState<Specialty[]>([]);

  useEffect(() => {
    setLoading(true);
    setCurrentPage(1);
    
    if (activeTab === 'security') {
        getBackupSettings().then(cfg => {
            setBackupConfig(cfg || { days: [] });
            setLoading(false);
        });
        return;
    }

    if (activeTab === 'accounting') {
        setLoading(false);
        return;
    }

    let collectionName = '';
    switch (activeTab) {
        case 'logs': collectionName = 'audit_logs'; break;
        case 'inventory': collectionName = 'inventory'; break;
        case 'laboratories': collectionName = 'laboratory_catalog'; break;
        case 'external': collectionName = 'external_medicines'; break;
        case 'pathologies': collectionName = 'pathologies'; break;
        case 'specialties': collectionName = 'specialties'; break;
        case 'users': collectionName = 'users'; break;
        case 'patients': collectionName = 'patients'; break;
        default: collectionName = 'users';
    }

    let q;
    if (activeTab === 'logs') {
        q = query(collection(db, collectionName), orderBy('timestamp', 'desc'));
    } else {
        q = query(collection(db, collectionName));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data(), uid: d.id }));
        
        if (activeTab !== 'logs') {
            docs.sort((a: any, b: any) => {
                const nameA = (a.name || a.fullName || a.commercialName || '').toLowerCase();
                const nameB = (b.name || b.fullName || b.commercialName || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        }
        
        setData(docs);
        setLoading(false);
    }, (error) => {
        console.error("Data Sync Error:", error);
        toast.error(`Error cargando ${activeTab}. Verifique permisos o conexión.`);
        setLoading(false);
    });

    if(activeTab === 'users') {
        getSpecialties().then(setSpecialtiesList);
    }

    return () => unsubscribe();
  }, [activeTab]);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      const reader = new FileReader();
      
      reader.onload = async (evt) => {
          try {
              const bstr = evt.target?.result;
              const wb = XLSX.read(bstr, { type: 'binary' });
              const wsname = wb.SheetNames[0];
              const ws = wb.Sheets[wsname];
              
              const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
              
              let headerIndex = -1;
              for(let i=0; i < Math.min(rawData.length, 20); i++) {
                  const rowStr = JSON.stringify(rawData[i]).toUpperCase();
                  if(rowStr.includes("CODIGO") && rowStr.includes("DESCRIPCION")) {
                      headerIndex = i;
                      break;
                  }
              }

              if (headerIndex === -1) headerIndex = 0; 

              const data = XLSX.utils.sheet_to_json(ws, { range: headerIndex });

              if (data.length === 0) {
                  toast.error("El archivo está vacío o no se encontraron datos.");
                  return;
              }

              let collectionName = '';
              let importType = '';

              if (activeTab === 'inventory') {
                  collectionName = 'inventory';
                  importType = 'MEDICAMENTOS';
              } else if (activeTab === 'laboratories') {
                  collectionName = 'laboratory_catalog';
                  importType = 'LABORATORIOS';
              } else {
                  toast.error("Pestaña no válida para importación.");
                  return;
              }

              const toastId = toast.loading(`Procesando ${data.length} registros...`);
              let count = 0;

              for (const row of data as any[]) {
                  const upperRow: any = {};
                  Object.keys(row).forEach(k => {
                      if (k && typeof k === 'string') {
                          upperRow[k.toUpperCase().trim()] = row[k];
                      }
                  });

                  const codigo = upperRow['CODIGO'] || upperRow['CÓDIGO'] || '';
                  const nombre = upperRow['DESCRIPCION'] || upperRow['DESCRIPCIÓN'] || upperRow['NOMBRE'] || upperRow['PRODUCTO'] || '';
                  const medida = upperRow['MEDIDA'] || upperRow['PRESENTACION'] || upperRow['PRESENTACIÓN'] || upperRow['UNIDAD'] || '';
                  
                  const cleanCurrency = (val: any) => {
                      if (val === undefined || val === null || val === '') return 0;
                      const strVal = String(val).replace(/[Q\s,]/g, '').trim();
                      const num = parseFloat(strVal);
                      return isNaN(num) ? 0 : num;
                  };

                  const costo = cleanCurrency(upperRow['COSTO']);
                  const precio = cleanCurrency(upperRow['PRECIO']);

                  if (nombre) {
                      const payload: any = {
                          code: String(codigo),
                          name: String(nombre),
                          presentation: String(medida),
                          measure: String(medida),
                          cost: Number(costo),
                          price: Number(precio),
                          createdAt: Timestamp.now()
                      };

                      if (activeTab === 'inventory') {
                          payload.stock = 100; 
                          payload.units_per_box = 1;
                      }

                      await addDoc(collection(db, collectionName), payload);
                      count++;
                  }
              }

              toast.success(`${count} registros importados exitosamente.`, { id: toastId });
              await logAuditAction(user.email, `IMPORTACION_${importType}`, `Se importaron ${count} items desde Excel.`);

          } catch (error: any) {
              console.error("Excel Import Error:", error);
              toast.error("Error al leer el archivo Excel. Verifique el formato.");
          } finally {
              setIsImporting(false);
              if (excelInputRef.current) excelInputRef.current.value = ''; 
          }
      };
      reader.readAsBinaryString(file);
  };

  const handleDownloadBackup = async () => {
      const toastId = toast.loading("Generando archivo de respaldo...");
      try {
          const blob = await generateSystemBackup(user.email);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          const now = new Date();
          const gtString = now.toLocaleString('en-US', { timeZone: 'America/Guatemala', hour12: false });
          const gtDate = new Date(gtString);
          const year = gtDate.getFullYear();
          const month = String(gtDate.getMonth() + 1).padStart(2, '0');
          const day = String(gtDate.getDate()).padStart(2, '0');
          const hour = String(gtDate.getHours()).padStart(2, '0');
          const minute = String(gtDate.getMinutes()).padStart(2, '0');
          a.href = url;
          a.download = `AsociacionHumana_Respaldo_${year}-${month}-${day}_${hour}-${minute}.ah`; 
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          toast.success("Respaldo descargado correctamente", { id: toastId });
          setBackupConfig((prev: any) => ({ ...prev, lastBackupDate: `${year}-${month}-${day}`, lastBackupDisplay: new Date().toLocaleString('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'medium', timeStyle: 'short' }) }));
      } catch (e) { console.error(e); toast.error("Error al generar respaldo", { id: toastId }); }
  };

  const handleUpdateAddress = (field: string, value: string) => {
      setFormValues((prev: any) => {
          const newAddress = { ...(prev.address || {}), [field]: value };
          if (field === 'country' && value !== 'Guatemala') { newAddress.department = ''; newAddress.municipality = ''; newAddress.zone = ''; }
          if (field === 'department') { newAddress.municipality = ''; newAddress.zone = ''; }
          if (field === 'municipality') { newAddress.zone = ''; }
          return { ...prev, address: newAddress };
      });
  };

  const handleDownloadExcel = async () => { const toastId = toast.loading("Generando reporte Excel..."); try { await generateReadableExcelReport(user.email); toast.success("Reporte Excel descargado.", { id: toastId }); } catch (e) { console.error(e); toast.error("Error al generar Excel", { id: toastId }); } };
  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; if (!confirm("⚠️ PELIGRO: ESTA ACCIÓN SOBRESCRIBIRÁ DATOS EXISTENTES.\n\n¿Está seguro que desea restaurar la base de datos con este archivo?")) { e.target.value = ''; return; } setIsRestoring(true); const toastId = toast.loading("Restaurando... Por favor espere."); try { await restoreSystemBackup(file, user.email); toast.success("Sistema restaurado exitosamente. Recargue la página.", { id: toastId, duration: 8000 }); setTimeout(() => window.location.reload(), 3000); } catch (e: any) { console.error(e); toast.error(`Error crítico: ${e.message}`, { id: toastId }); setIsRestoring(false); } e.target.value = ''; };
  const toggleBackupDay = async (dayIndex: number) => { const currentDays = backupConfig.days || []; let newDays; if (currentDays.includes(dayIndex)) { newDays = currentDays.filter((d: number) => d !== dayIndex); } else { newDays = [...currentDays, dayIndex].sort(); } const newConfig = { ...backupConfig, days: newDays }; setBackupConfig(newConfig); await saveBackupSettings(newConfig, user.email); toast.success("Programación actualizada"); };

  const handleOpenModal = (item: any = null) => {
      setEditItem(item);
      
      // SI ES USUARIO, USAR EL NUEVO MODAL DEDICADO
      if (activeTab === 'users') {
          setIsUserModalOpen(true);
          return;
      }

      setPatientFiles([]); 
      setExistingFiles([]); 

      if (activeTab === 'pathologies' && item?.exams) {
          setFormValues({ ...item, exams: item.exams.join(', ') });
      } else if (activeTab === 'patients' && item) {
          setFormValues(item);
          setIsNoResponsible(item.responsibleName === 'No hay');
          if (item.historyFiles) {
              setExistingFiles(item.historyFiles);
          }
      } else {
          const defaults: any = {};
          if (activeTab === 'patients') { defaults.consultationType = 'Nueva'; defaults.previousTreatment = 'No ha estado en tratamiento'; defaults.address = { country: 'Guatemala' }; }
          setFormValues(item || defaults);
          setIsNoResponsible(false);
      }
      setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSaving(true);
      try {
          let collectionName = '';
          switch (activeTab) {
              case 'patients': collectionName = 'patients'; break;
              case 'inventory': collectionName = 'inventory'; break;
              case 'laboratories': collectionName = 'laboratory_catalog'; break;
              case 'external': collectionName = 'external_medicines'; break;
              case 'pathologies': collectionName = 'pathologies'; break;
              case 'specialties': collectionName = 'specialties'; break;
          }
          
          let finalPayload = { ...formValues };
          if (activeTab === 'patients') {
              if (isNoResponsible) { finalPayload.responsibleName = 'No hay'; finalPayload.responsiblePhone = 'No hay'; finalPayload.responsibleEmail = 'No hay'; }
              if (!editItem) {
                  const id = finalPayload.billingCode;
                  const codeCheck = await getDocs(query(collection(db, 'patients'), where('billingCode', '==', id)));
                  if (!codeCheck.empty) throw new Error("Código ya registrado");
                  finalPayload.id = id;
              }
              const uploadedFiles: PatientFile[] = [...existingFiles];
              if (patientFiles.length > 0) {
                  const patientId = editItem ? editItem.id : finalPayload.billingCode;
                  for (const file of patientFiles) {
                      const storageRef = ref(storage, `patients/${patientId}/files/${Date.now()}_${file.name}`);
                      await uploadBytes(storageRef, file);
                      const url = await getDownloadURL(storageRef);
                      uploadedFiles.push({ name: file.name, url: url, type: file.type, uploadedAt: Date.now() });
                  }
              }
              finalPayload.historyFiles = uploadedFiles;
          }

          if (activeTab === 'pathologies' && typeof finalPayload.exams === 'string') {
              finalPayload.exams = finalPayload.exams.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          }

          const itemName = finalPayload.name || finalPayload.fullName || finalPayload.commercialName || 'Registro';
          const itemIdRef = finalPayload.billingCode || finalPayload.id || editItem?.id || 'Nuevo';

          if (editItem) {
              await updateDoc(doc(db, collectionName, editItem.id), { ...finalPayload, updatedAt: Timestamp.now() });
              await logAuditAction(user.email, `EDICION_${activeTab.toUpperCase()}`, `Se editó: "${itemName}". ID/Ref: [${itemIdRef}]`);
              toast.success("Actualizado con éxito");
          } else {
              if (activeTab === 'patients') { await createPatient(finalPayload); } 
              else { await addDoc(collection(db, collectionName), { ...finalPayload, createdAt: Timestamp.now() }); }
              await logAuditAction(user.email, `CREACION_${activeTab.toUpperCase()}`, `Se creó: "${itemName}". ID/Ref: [${itemIdRef}]`);
              toast.success("Creado con éxito");
          }
          setIsModalOpen(false);
      } catch (err: any) { toast.error(err.message || "Error al procesar"); } finally { setIsSaving(false); }
  };

  const confirmDelete = async () => {
      if (!deleteReason.trim()) { toast.error("Razón obligatoria"); return; }
      setIsSaving(true);
      try {
          let collectionName = '';
          switch (activeTab) {
              case 'users': collectionName = 'users'; break;
              case 'patients': collectionName = 'patients'; break;
              case 'inventory': collectionName = 'inventory'; break;
              case 'laboratories': collectionName = 'laboratory_catalog'; break;
              case 'external': collectionName = 'external_medicines'; break;
              case 'pathologies': collectionName = 'pathologies'; break;
              case 'specialties': collectionName = 'specialties'; break;
          }
          const isSoftDelete = activeTab === 'users' || activeTab === 'patients';
          const itemName = itemToDelete.name || itemToDelete.fullName || itemToDelete.commercialName || 'Item';
          if (isSoftDelete) { await updateDoc(doc(db, collectionName, itemToDelete.id), { isActive: false, disableReason: deleteReason }); } 
          else { await deleteDoc(doc(db, collectionName, itemToDelete.id)); }
          const actionType = isSoftDelete ? 'INACTIVACION' : 'ELIMINACION';
          await logAuditAction(user.email, `${actionType}_${activeTab.toUpperCase()}`, `Se eliminó/desactivó: "${itemName}". Motivo: ${deleteReason}`);
          toast.success("Acción procesada");
          setIsDeleteModalOpen(false); setItemToDelete(null); setDeleteReason('');
      } catch (e) { toast.error("Error al borrar"); } finally { setIsSaving(false); }
  };

  const filteredData = data.filter(item => {
      const search = searchTerm.toLowerCase();
      const name = (item.name || item.fullName || item.commercialName || '').toLowerCase();
      const code = (item.billingCode || item.id || item.code || '').toLowerCase();
      return name.includes(search) || code.includes(search);
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredData.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const tabs: {id: AdminTab, label: string, icon: any}[] = [
      { id: 'accounting', label: 'Contabilidad', icon: Wallet },
      { id: 'users', label: 'Usuarios', icon: Users },
      { id: 'patients', label: 'Pacientes', icon: ClipboardList },
      { id: 'inventory', label: 'Inventario', icon: Package },
      { id: 'laboratories', label: 'Laboratorios', icon: FlaskConical }, 
      { id: 'external', label: 'Meds. Externos', icon: Globe },
      { id: 'pathologies', label: 'Patologías', icon: Stethoscope },
      { id: 'specialties', label: 'Especialidades', icon: Stethoscope },
      { id: 'security', label: 'Seguridad & Datos', icon: Database },
      { id: 'logs', label: 'Auditoría', icon: History },
  ];

  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const hasZones = (muni: string) => MUNICIPALITIES_WITH_ZONES.includes(muni);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 px-4">
        <div className="flex bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-x-auto scrollbar-hide snap-x">
            <div className="flex gap-2 min-w-max">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSearchTerm(''); setCurrentPage(1); }} className={`flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap snap-center ${activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
                        <tab.icon className="w-4 h-4" /> {tab.label}
                    </button>
                ))}
            </div>
        </div>

        <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
        >
            {activeTab === 'accounting' ? (
                <AccountingDashboard />
            ) : activeTab === 'security' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
                        <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2 mb-4"><Clock className="w-6 h-6 text-brand-600"/> Programación Automática</h3>
                        <div className="flex flex-wrap gap-3 mb-8">
                            {DAYS.map((day, idx) => (
                                <button key={day} onClick={() => toggleBackupDay(idx)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${backupConfig.days?.includes(idx) ? 'bg-brand-600 text-white border-brand-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>{day}</button>
                            ))}
                        </div>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase">Último Respaldo:</span><span className="font-mono font-bold text-slate-800">{backupConfig.lastBackupDisplay || 'Nunca'}</span></div>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 flex flex-col justify-center items-center text-center">
                            <div className="flex gap-4 mb-4"><div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-sm"><Download className="w-8 h-8"/></div><div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shadow-sm"><FileSpreadsheet className="w-8 h-8"/></div></div>
                            <h3 className="font-bold text-slate-800 text-lg">Respaldo y Reportes</h3>
                            <div className="flex flex-col gap-3 w-full mt-4">
                                <button onClick={handleDownloadBackup} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg transition-all flex justify-center items-center gap-2"><Download className="w-4 h-4"/> Respaldo Sistema (.ah)</button>
                                <button onClick={handleDownloadExcel} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition-all flex justify-center items-center gap-2"><FileSpreadsheet className="w-4 h-4"/> Reporte Maestro (Excel)</button>
                            </div>
                        </div>
                        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 flex flex-col justify-center items-center text-center relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>
                            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4 shadow-sm"><Upload className="w-8 h-8"/></div>
                            <h3 className="font-bold text-slate-800 text-lg">Restauración de Emergencia</h3>
                            <input type="file" ref={restoreInputRef} onChange={handleRestoreBackup} accept=".ah,.json" className="hidden" />
                            <button onClick={() => restoreInputRef.current?.click()} disabled={isRestoring} className="w-full py-3 bg-white border-2 border-red-100 text-red-600 font-bold rounded-xl hover:bg-red-50 hover:border-red-200 transition-all flex justify-center items-center gap-2 mt-4">{isRestoring ? <Loader2 className="animate-spin w-4 h-4"/> : <Upload className="w-4 h-4"/>} Cargar Archivo de Respaldo</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[650px]">
                    <div className="p-6 border-b flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-50/30">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">{tabs.find(t => t.id === activeTab)?.label}</h3>
                            <div className="relative flex-1 md:w-64 w-full">
                                <Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
                                <input type="text" placeholder="Buscar..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-200 text-slate-900" value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
                            </div>
                        </div>
                        
                        <div className="flex gap-2 w-full md:w-auto">
                            {(activeTab === 'inventory' || activeTab === 'laboratories') && (
                                <div className="relative">
                                    <input 
                                        type="file" 
                                        ref={excelInputRef} 
                                        onChange={handleExcelUpload} 
                                        accept=".xlsx,.xls" 
                                        className="hidden" 
                                    />
                                    <button 
                                        onClick={() => excelInputRef.current?.click()} 
                                        disabled={isImporting}
                                        className="w-full md:w-auto px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        {isImporting ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileSpreadsheet className="w-4 h-4"/>} 
                                        Importar Excel
                                    </button>
                                </div>
                            )}

                            {activeTab !== 'logs' && (
                                <button onClick={() => handleOpenModal()} className="w-full md:w-auto px-6 py-3 bg-brand-600 text-white rounded-xl text-xs font-bold hover:bg-brand-700 transition flex items-center justify-center gap-2 shadow-lg">
                                    <Plus className="w-4 h-4"/> Nuevo
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] text-slate-400 uppercase font-bold tracking-widest border-b">
                                <tr>
                                    {activeTab === 'users' && <><th className="p-4">Nombre</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'patients' && <><th className="p-4">Paciente</th><th className="p-4">Código</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'inventory' && <><th className="p-4">Código</th><th className="p-4">Producto</th><th className="p-4">Costo</th><th className="p-4">Precio</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'laboratories' && <><th className="p-4">Código</th><th className="p-4">Examen</th><th className="p-4">Medida</th><th className="p-4">Costo</th><th className="p-4">Precio</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'external' && <><th className="p-4">Nombre Comercial</th><th className="p-4">Ingrediente Activo</th><th className="p-4">Farmacia / Dist.</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'pathologies' && <><th className="p-4">Patología</th><th className="p-4">Exámenes</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'specialties' && <><th className="p-4">Especialidad</th><th className="p-4 text-right">Acciones</th></>}
                                    {activeTab === 'logs' && <><th className="p-4">Fecha</th><th className="p-4">Usuario</th><th className="p-4">Acción</th><th className="p-4">Detalle</th></>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {loading ? (
                                    <tr><td colSpan={10} className="p-24 text-center animate-pulse text-slate-300 font-bold uppercase text-xs tracking-widest">Cargando...</td></tr>
                                ) : currentItems.length > 0 ? currentItems.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors text-sm">
                                        {activeTab === 'users' && <><td className="p-4 font-bold text-slate-800">{item.name}</td><td className="p-4"><span className="px-3 py-1 bg-brand-50 text-brand-600 rounded-full text-[10px] font-bold uppercase border border-brand-100">{item.role}</span></td><td className="p-4">{item.isActive !== false ? <span className="text-emerald-600 flex items-center gap-1.5 font-bold text-xs"><CheckCircle className="w-3 h-3"/> Activo</span> : <span className="text-red-400 flex items-center gap-1.5 font-bold text-xs"><ShieldAlert className="w-3 h-3"/> Inactivo</span>}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button></td></>}
                                        {activeTab === 'inventory' && <><td className="p-4 text-xs font-mono text-slate-500">{item.code || '—'}</td><td className="p-4 font-bold text-slate-800">{item.name}</td><td className="p-4 text-sm font-mono font-bold text-slate-700">Q {item.cost?.toFixed(2) || '0.00'}</td><td className="p-4 text-sm font-bold text-emerald-800">Q {item.price?.toFixed(2) || '0.00'}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button><button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition shadow-sm"><Trash2 className="w-4 h-4"/></button></td></>}
                                        {activeTab === 'laboratories' && <><td className="p-4 text-xs font-mono text-slate-500">{item.code || '—'}</td><td className="p-4 font-bold text-slate-800">{item.name}</td><td className="p-4 text-sm font-medium text-slate-700">{item.measure || 'U'}</td><td className="p-4 text-sm font-mono font-bold text-slate-700">Q {item.cost?.toFixed(2) || '0.00'}</td><td className="p-4 text-sm font-bold text-emerald-800">Q {item.price?.toFixed(2) || '0.00'}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button><button onClick={() => { setItemToDelete(item); setIsDeleteModalOpen(true); }} className="p-2.5 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition shadow-sm"><Trash2 className="w-4 h-4"/></button></td></>}
                                        {activeTab === 'patients' && <><td className="p-4 font-bold text-slate-800">{item.fullName}</td><td className="p-4 text-slate-500 font-mono font-bold">{item.billingCode}</td><td className="p-4">{item.isActive !== false ? <span className="text-emerald-600 flex items-center gap-1.5 font-bold text-xs"><CheckCircle className="w-3 h-3"/> Activo</span> : <span className="text-red-400 flex items-center gap-1.5 font-bold text-xs"><Ban className="w-3 h-3"/> Baja</span>}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button></td></>}
                                        {activeTab === 'pathologies' && <><td className="p-4 font-bold text-slate-800">{item.name}</td><td className="p-4 text-slate-500 text-[10px] font-bold uppercase">{item.exams?.join(' • ') || '—'}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button></td></>}
                                        {activeTab === 'logs' && <><td className="p-4 text-xs font-bold text-slate-400">{new Date(item.timestamp).toLocaleString()}</td><td className="p-4 font-bold text-slate-700">{item.user}</td><td className="p-4"><span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase">{item.action}</span></td><td className="p-4 text-xs text-slate-500 italic whitespace-pre-wrap break-words">{item.details}</td></>}
                                        {activeTab === 'external' && <><td className="p-4 font-bold text-slate-800">{item.commercialName}</td><td className="p-4 text-xs text-slate-500">{item.activeIngredient}</td><td className="p-4 text-xs text-slate-500">{item.pharmacy || item.distributorGT}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button></td></>}
                                        {activeTab === 'specialties' && <><td colSpan={3} className="p-4 font-bold text-slate-800">{item.name}</td><td className="p-4 text-right flex items-center justify-end gap-2"><button onClick={() => handleOpenModal(item)} className="p-2.5 bg-brand-50 text-brand-600 hover:bg-brand-100 rounded-xl transition shadow-sm"><Edit2 className="w-4 h-4"/></button></td></>}
                                    </tr>
                                )) : (
                                    <tr><td colSpan={10} className="p-24 text-center text-slate-400 italic">No hay resultados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="p-6 border-t flex justify-between items-center bg-slate-50/30">
                        <span className="text-xs font-bold text-slate-500 uppercase">Mostrando {currentItems.length} de {filteredData.length}</span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage === 1} className="p-2.5 bg-white border border-slate-200 rounded-xl disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                            <button onClick={() => setCurrentPage(p => p+1)} disabled={currentPage >= totalPages} className="p-2.5 bg-white border border-slate-200 rounded-xl disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>

        {/* MODAL ESPECÍFICO PARA USUARIOS */}
        <UserModal 
            isOpen={isUserModalOpen}
            onClose={() => setIsUserModalOpen(false)}
            userToEdit={editItem}
            currentUser={user}
            specialtiesList={specialtiesList}
        />

        <AnimatePresence>
        {isModalOpen && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden">
                    <div className="p-6 md:p-8 border-b bg-white flex justify-between items-center shrink-0">
                        <h3 className="font-bold text-slate-800 text-xl md:text-2xl flex items-center gap-4">
                            <div className="p-3 bg-brand-600 text-white rounded-2xl shadow-lg">{editItem ? <Edit2 className="w-5 h-5 md:w-6 md:h-6"/> : <Plus className="w-5 h-5 md:w-6 md:h-6"/>}</div>
                            {editItem ? `Editar Registro` : `Nuevo Registro`}
                        </h3>
                        <button type="button" onClick={() => setIsModalOpen(false)} className="p-3 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-all"><X className="w-6 h-6 md:w-7 md:h-7"/></button>
                    </div>
                    
                    <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
                        <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 overflow-y-auto custom-scrollbar flex-1 bg-white">
                            
                            {activeTab === 'patients' && <>
                                <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2">Datos Personales</div>
                                <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre del Paciente</label><input required className="w-full p-4 bg-white border border-slate-200 rounded-2xl text-lg font-bold" value={formValues.fullName || ''} onChange={e => setFormValues({...formValues, fullName: e.target.value})} /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">DPI / Código Facturación</label><input required className="w-full p-4 bg-white border border-slate-200 rounded-2xl font-mono font-bold" value={formValues.billingCode || ''} onChange={e => setFormValues({...formValues, billingCode: e.target.value, id: e.target.value})} /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ocupación</label><input className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.occupation || ''} onChange={e => setFormValues({...formValues, occupation: e.target.value})} /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Edad</label><input required type="number" className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.age || ''} onChange={e => setFormValues({...formValues, age: e.target.value})} /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Género</label><select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.gender || 'M'} onChange={e => setFormValues({...formValues, gender: e.target.value})}><option value="M">Masculino</option><option value="F">Femenino</option></select></div>
                                
                                <div className="md:col-span-2 text-sm font-bold text-brand-600 uppercase tracking-widest border-b border-brand-100 pb-2 mb-2 mt-4">Dirección Domiciliar</div>
                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">País</label><select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.country} onChange={e => handleUpdateAddress('country', e.target.value)}>{COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                    {formValues.address?.country === 'Guatemala' && <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Departamento</label><select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.department} onChange={e => handleUpdateAddress('department', e.target.value)}><option value="">-- Seleccionar --</option>{Object.keys(GT_DEPARTMENTS).map(d => <option key={d} value={d}>{d}</option>)}</select></div>}
                                    {formValues.address?.department && <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Municipio</label><select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.municipality} onChange={e => handleUpdateAddress('municipality', e.target.value)}><option value="">-- Seleccionar --</option>{GT_DEPARTMENTS[formValues.address.department].map(m => <option key={m} value={m}>{m}</option>)}</select></div>}
                                    {formValues.address?.department === 'Guatemala' && hasZones(formValues.address.municipality) && <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Zona</label><select className="w-full p-4 bg-white border border-slate-200 rounded-2xl" value={formValues.address?.zone} onChange={e => handleUpdateAddress('zone', e.target.value)}><option value="">-- Zona --</option>{GT_ZONES.map(z => <option key={z} value={z}>{z}</option>)}</select></div>}
                                </div>

                                <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Datos del Responsable</div>
                                <div className="md:col-span-2 flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200"><input type="checkbox" className="w-5 h-5" checked={isNoResponsible} onChange={e => setIsNoResponsible(e.target.checked)} /><label className="text-xs font-bold text-slate-500 uppercase">EL PACIENTE VE POR SU PROPIA SALUD</label></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre Responsable</label><input required={!isNoResponsible} disabled={isNoResponsible} className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100" value={isNoResponsible ? 'No hay' : formValues.responsibleName || ''} onChange={e => setFormValues({...formValues, responsibleName: e.target.value})} /></div>
                                <div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Teléfono Responsable</label><input required={!isNoResponsible} disabled={isNoResponsible} className="w-full p-4 bg-white border border-slate-200 rounded-2xl disabled:bg-slate-100" value={isNoResponsible ? 'No hay' : formValues.responsiblePhone || ''} onChange={e => setFormValues({...formValues, responsiblePhone: e.target.value})} /></div>
                                
                                <div className="md:col-span-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-2 mt-4">Historial Clínico y Archivos</div>
                                <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Antecedentes Médicos</label><textarea className="w-full p-4 bg-white border rounded-2xl" rows={4} value={formValues.medical_history || ''} onChange={e => setFormValues({...formValues, medical_history: e.target.value})} /></div>
                                <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Archivos Adjuntos</label>
                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {existingFiles.map((f, i) => <div key={i} className="flex items-center gap-2 bg-white border rounded-lg px-2 py-1 text-xs">{f.name}</div>)}
                                            {patientFiles.map((f, i) => <div key={i} className="flex items-center gap-2 bg-blue-50 border-blue-200 rounded-lg px-2 py-1 text-xs">{f.name}</div>)}
                                        </div>
                                        <input type="file" ref={fileInputRef} onChange={(e) => setPatientFiles(Array.from(e.target.files || []))} multiple className="hidden"/>
                                        <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-brand-600 bg-white border border-brand-200 px-4 py-2 rounded-lg">Seleccionar Archivos</button>
                                    </div>
                                </div>
                            </>}

                            {activeTab === 'inventory' && <><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Medicamento</label><input required className="w-full p-4 bg-white border rounded-2xl font-bold" value={formValues.name || ''} onChange={e => setFormValues({...formValues, name: e.target.value})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Código</label><input className="w-full p-4 bg-white border rounded-2xl font-mono" value={formValues.code || ''} onChange={e => setFormValues({...formValues, code: e.target.value})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Presentación</label><input className="w-full p-4 bg-white border rounded-2xl" value={formValues.presentation || ''} onChange={e => setFormValues({...formValues, presentation: e.target.value})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Costo (Q)</label><input type="number" step="0.01" className="w-full p-4 bg-white border rounded-2xl" value={formValues.cost || 0} onChange={e => setFormValues({...formValues, cost: parseFloat(e.target.value)})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Precio (Q)</label><input type="number" step="0.01" required className="w-full p-4 bg-white border rounded-2xl font-bold text-emerald-700" value={formValues.price || 0} onChange={e => setFormValues({...formValues, price: parseFloat(e.target.value)})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Stock</label><input type="number" required className="w-full p-4 bg-white border rounded-2xl" value={formValues.stock || 0} onChange={e => setFormValues({...formValues, stock: parseInt(e.target.value)})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Unidades por Caja</label><input type="number" className="w-full p-4 bg-white border rounded-2xl" value={formValues.units_per_box || 1} onChange={e => setFormValues({...formValues, units_per_box: parseInt(e.target.value)})} /></div></>}
                            {activeTab === 'laboratories' && <><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Examen</label><input required className="w-full p-4 bg-white border rounded-2xl font-bold" value={formValues.name || ''} onChange={e => setFormValues({...formValues, name: e.target.value})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Código</label><input className="w-full p-4 bg-white border rounded-2xl font-mono" value={formValues.code || ''} onChange={e => setFormValues({...formValues, code: e.target.value})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Medida</label><input className="w-full p-4 bg-white border rounded-2xl" value={formValues.measure || ''} onChange={e => setFormValues({...formValues, measure: e.target.value})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Costo (Q)</label><input type="number" step="0.01" className="w-full p-4 bg-white border rounded-2xl" value={formValues.cost || 0} onChange={e => setFormValues({...formValues, cost: parseFloat(e.target.value)})} /></div><div><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Precio (Q)</label><input type="number" step="0.01" required className="w-full p-4 bg-white border rounded-2xl font-bold text-emerald-700" value={formValues.price || 0} onChange={e => setFormValues({...formValues, price: parseFloat(e.target.value)})} /></div></>}
                            {activeTab === 'pathologies' && <><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Patología</label><input required className="w-full p-4 bg-white border rounded-2xl font-bold" value={formValues.name || ''} onChange={e => setFormValues({...formValues, name: e.target.value})} /></div><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Exámenes (por comas)</label><textarea required className="w-full p-5 bg-white border rounded-[1.5rem]" rows={5} value={formValues.exams || ''} onChange={e => setFormValues({...formValues, exams: e.target.value})} /></div></>}
                            {activeTab === 'specialties' && <div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Especialidad</label><input required className="w-full p-4 bg-white border rounded-2xl font-bold" value={formValues.name || ''} onChange={e => setFormValues({...formValues, name: e.target.value})} /></div>}
                            {activeTab === 'external' && <><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nombre Comercial</label><input required className="w-full p-4 bg-white border rounded-2xl font-bold" value={formValues.commercialName || ''} onChange={e => setFormValues({...formValues, commercialName: e.target.value, name: e.target.value})} /></div><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Ingrediente Activo</label><input className="w-full p-4 bg-white border rounded-2xl" value={formValues.activeIngredient || ''} onChange={e => setFormValues({...formValues, activeIngredient: e.target.value})} /></div><div className="md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Farmacia / Distribuidor</label><input className="w-full p-4 bg-white border rounded-2xl" value={formValues.pharmacy || formValues.distributorGT || ''} onChange={e => setFormValues({...formValues, pharmacy: e.target.value})} /></div></>}
                        </div>
                        <div className="p-6 md:p-8 bg-slate-50 border-t flex gap-4 shrink-0 rounded-b-[2rem]">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-200 rounded-2xl transition-all">Descartar</button>
                            <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-brand-600 text-white font-bold rounded-2xl hover:bg-brand-700 shadow-xl flex justify-center items-center gap-3">{isSaving ? <Loader2 className="animate-spin w-5 h-5"/> : <Save className="w-5 h-5"/>} {editItem ? 'Guardar' : 'Confirmar'}</button>
                        </div>
                    </form>
                </motion.div>
            </div>
        )}
        </AnimatePresence>
        <AnimatePresence>
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[300] flex items-center justify-center p-4">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md text-center">
                        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4"/>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">¿Confirmar Eliminación?</h3>
                        <p className="text-slate-500 mb-6">Esta acción borrará permanentemente el registro de <strong>{itemToDelete?.name || itemToDelete?.fullName}</strong>.</p>
                        <div className="text-left mb-6">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Razón de Eliminación</label>
                            <textarea className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 text-sm" rows={3} value={deleteReason} onChange={e => setDeleteReason(e.target.value)} placeholder="Escriba el motivo..." />
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => {setIsDeleteModalOpen(false); setDeleteReason('');}} className="flex-1 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl">Cancelar</button>
                            <button onClick={confirmDelete} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg">Eliminar</button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    </div>
  );
};
