
import * as React from 'react';
import { useState, useEffect } from 'react';
import { LogOut, Activity, ClipboardList, Ticket, Menu, X, Bell, CheckCircle, ShieldCheck, Settings, AlertTriangle, Download, Check } from 'lucide-react';
import { UserProfile, AppNotification } from '../../types.ts';
import { motion, AnimatePresence } from 'framer-motion';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config.ts';
import { getBackupSettings, generateSystemBackup } from '../../services/backupService.ts';
import { toast } from 'sonner';
import { LOGOLARGO_BASE64 } from '../../data/assets.ts';

interface MainLayoutProps {
  user: UserProfile;
  onLogout: () => void;
  children: React.ReactNode;
  currentTitle?: string;
  onBack?: () => void;
  activeView: 'dashboard' | 'history' | 'admin' | 'settings';
  onViewChange: (view: 'dashboard' | 'history' | 'admin' | 'settings') => void;
}

// --- COLOR PALETTES DEFINITION ---
const THEMES = {
  admin: { // VIOLET (Default)
    50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa',
    500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065'
  },
  nurse: { // BLUE
    50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa',
    500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554'
  },
  doctor: { // SLATE / GRAY (Elegant & Minimalist)
    50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
    500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617'
  },
  receptionist: { // AMBER (Warm)
    50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
    500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03'
  }
};

export const MainLayout: React.FC<MainLayoutProps> = ({ 
  user, onLogout, children, currentTitle, onBack, activeView, onViewChange 
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showBackupAlert, setShowBackupAlert] = useState(false);
  
  const isReceptionist = user.role === 'receptionist';
  const isAdmin = user.role === 'admin';
  
  const canSeeNotifications = ['doctor', 'nurse', 'admin', 'receptionist'].includes(user.role);

  // --- THEME INJECTION ---
  useEffect(() => {
    const root = document.documentElement;
    const theme = THEMES[user.role] || THEMES.admin;
    
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--brand-${key}`, value as string);
    });
  }, [user.role]);

  // --- BACKUP AUTOMATIC CHECKER ---
  useEffect(() => {
      const checkBackupStatus = async () => {
          if (!isAdmin) return;
          const today = new Date();
          const currentHour = today.getHours();
          if (currentHour < 10) return;

          const config = await getBackupSettings() as any;
          if (!config || !config.days) return;

          const todayDayIndex = today.getDay();
          const todayStr = today.toISOString().split('T')[0];

          if (config.days.includes(todayDayIndex) && config.lastBackupDate?.substring(0, 10) !== todayStr) {
              setShowBackupAlert(true);
          }
      };
      checkBackupStatus();
      const interval = setInterval(checkBackupStatus, 3600000); 
      return () => clearInterval(interval);
  }, [isAdmin]);

  const handleTriggerAutoBackup = async () => {
      const toastId = toast.loading("Iniciando respaldo automático...");
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
          a.download = `AsociacionHumana_AutoBackup_${year}-${month}-${day}_${hour}-${minute}.ah`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          toast.success("Respaldo completado", { id: toastId });
          setShowBackupAlert(false);
      } catch (e) {
          toast.error("Error en respaldo", { id: toastId });
      }
  };

  useEffect(() => {
    if (!canSeeNotifications) return;
    const notifRef = collection(db, 'notifications');
    const q = query(notifRef, where('read', '==', false), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
        const allNotifs = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() } as AppNotification));
        const filtered = allNotifs.filter((n: AppNotification) => {
            if (n.targetUserId) return n.targetUserId === user.uid;
            if (n.targetRole) return n.targetRole === user.role;
            return false; 
        });
        setNotifications(filtered);
    });
    return () => unsubscribe();
  }, [user.uid, user.role, canSeeNotifications]);

  const markAllAsRead = async () => {
      for (const notif of notifications) {
          if (notif.id) await updateDoc(doc(db, 'notifications', notif.id), { read: true });
      }
      setShowNotifPanel(false);
  };

  const markSingleAsRead = async (id: string) => {
      try { await updateDoc(doc(db, 'notifications', id), { read: true }); } catch (e) { console.error(e); }
  };

  const navItems = [
    { id: 'dashboard', label: 'Gestión / Check-In', icon: Ticket, show: true, onClick: () => onViewChange('dashboard') },
    { id: 'history', label: 'Historiales', icon: ClipboardList, show: !isReceptionist, onClick: () => onViewChange('history') },
    { id: 'admin', label: 'Panel Administrativo', icon: ShieldCheck, show: isAdmin, onClick: () => onViewChange('admin') },
    { id: 'settings', label: 'Configuración', icon: Settings, show: true, onClick: () => onViewChange('settings') }
  ];

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      <div className="p-4 border-b border-slate-800 flex flex-col items-center justify-center shrink-0">
        <div className="w-full h-32 bg-white rounded-2xl flex items-center justify-center p-4 shadow-xl overflow-hidden">
          <img src={LOGOLARGO_BASE64} alt="Logo" className="w-full h-full object-contain" />
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-2 mt-4 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => item.show && (
          <div key={item.id} onClick={() => { item.onClick(); setIsMobileMenuOpen(false); }} className={`p-3.5 rounded-xl flex items-center gap-3 cursor-pointer transition-all duration-300 ${activeView === item.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/20 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            <item.icon className="w-5 h-5"/><span>{item.label}</span>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-800 shrink-0">
        <button onClick={onLogout} className="w-full flex items-center gap-3 p-3.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all font-medium">
          <LogOut className="w-5 h-5"/><span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-inter text-slate-900">
      <AnimatePresence>
        {showBackupAlert && (
            <motion.div initial={{y: -100}} animate={{y: 0}} exit={{y: -100}} className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white p-3 shadow-xl flex justify-center items-center gap-4 flex-col md:flex-row text-center">
                <div className="flex items-center gap-2 font-bold animate-pulse"><AlertTriangle className="w-5 h-5"/><span>COPIA DE SEGURIDAD PENDIENTE</span></div>
                <button onClick={handleTriggerAutoBackup} className="bg-white text-amber-600 px-4 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-amber-50 flex items-center gap-2"><Download className="w-4 h-4"/> Descargar Ahora</button>
                <button onClick={() => setShowBackupAlert(false)} className="text-amber-100 hover:text-white md:ml-4"><X className="w-5 h-5"/></button>
            </motion.div>
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-slate-200 shadow-xl z-20">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] lg:hidden" />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="fixed inset-y-0 left-0 w-72 z-[101] lg:hidden">
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 shrink-0 shadow-sm z-50">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"><Menu className="w-6 h-6" /></button>
            {onBack ? (
              <button onClick={onBack} className="flex items-center gap-2 font-bold text-slate-800 hover:text-brand-600 transition truncate"><span className="text-brand-600 mr-1">←</span><span className="truncate">{currentTitle}</span></button>
            ) : (
              <h2 className="font-bold text-slate-800 text-sm lg:text-base truncate">{currentTitle || (activeView === 'history' ? 'Historial de Consultas' : activeView === 'admin' ? 'Administración' : activeView === 'settings' ? 'Configuración' : 'Panel de Control')}</h2>
            )}
          </div>

          <div className="flex items-center gap-3 lg:gap-6 shrink-0">
            {canSeeNotifications && (
                <div className="relative">
                    <button onClick={() => setShowNotifPanel(!showNotifPanel)} className="p-2.5 rounded-xl bg-slate-50 text-slate-500 hover:bg-brand-50 hover:text-brand-600 transition relative">
                        <Bell className="w-5 h-5" />
                        {notifications.length > 0 && <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold border-2 border-white animate-bounce">{notifications.length}</span>}
                    </button>
                    <AnimatePresence>
                    {showNotifPanel && (
                        <>
                            <div className="fixed inset-0 z-[199]" onClick={() => setShowNotifPanel(false)} />
                            <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }} 
                                animate={{ opacity: 1, y: 0, scale: 1 }} 
                                exit={{ opacity: 0, y: 10, scale: 0.95 }} 
                                className="fixed top-20 left-4 right-4 md:absolute md:top-full md:right-0 md:left-auto md:w-80 md:mt-3 bg-white rounded-3xl shadow-2xl border border-slate-100 z-[200] overflow-hidden"
                            >
                                <div className="p-4 border-b bg-slate-50 flex justify-between items-center"><span className="font-bold text-slate-800 text-sm">Buzón de Avisos</span><button onClick={markAllAsRead} className="text-[10px] font-bold text-brand-600 hover:underline uppercase tracking-widest">Limpiar</button></div>
                                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                                    {notifications.length > 0 ? notifications.map(n => (
                                        <div key={n.id} className={`p-4 border-b last:border-0 hover:bg-slate-50 transition border-l-4 group flex items-start justify-between gap-3 ${n.type === 'alert' ? 'border-l-red-500 bg-red-50/50' : (n.type === 'success' ? 'border-l-emerald-500 bg-emerald-50/50' : 'border-l-brand-500')}`}>
                                            <div className="flex-1">
                                                <p className="font-bold text-xs text-slate-800">{n.title}</p>
                                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{n.message}</p>
                                                <p className="text-[9px] text-slate-400 mt-2 font-medium">{n.timestamp?.toDate ? n.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Reciente'}</p>
                                            </div>
                                            {n.id && <button onClick={(e) => { e.stopPropagation(); markSingleAsRead(n.id!); }} className="p-1.5 rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-brand-600 hover:border-brand-300 transition-all opacity-0 group-hover:opacity-100" title="Marcar como leída"><Check className="w-3.5 h-3.5"/></button>}
                                        </div>
                                    )) : <div className="p-8 text-center"><CheckCircle className="w-8 h-8 text-emerald-100 mx-auto mb-2"/><p className="text-xs text-slate-400">Sin notificaciones pendientes</p></div>}
                                </div>
                            </motion.div>
                        </>
                    )}
                    </AnimatePresence>
                </div>
            )}
            <div className="flex items-center gap-3 border-l pl-3 lg:pl-6 border-slate-100">
                <div className="text-right hidden sm:block"><p className="text-sm font-bold text-slate-800 leading-none">{user.name}</p><p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-1">{user.role}</p></div>
                <div className="w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold border-2 border-slate-100 shadow-sm">{user.name.charAt(0)}</div>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
};
