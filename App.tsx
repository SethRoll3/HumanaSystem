
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './src/firebase/config.ts';
import { DoctorStation } from './src/pages/DoctorStation.tsx';
import { UserProfile } from './types.ts';
import { Lock, Mail, Eye, EyeOff, Activity, ChevronRight, Loader2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LOGO_BASE64 } from './src/data/assets.ts';

// TIEMPO DE SESIÓN: 1 hora y 30 minutos (90 min)
const SESSION_DURATION_MINUTES = 90;
const SESSION_DURATION_MS = SESSION_DURATION_MINUTES * 60 * 1000; 

// --- HELPERS PARA COOKIES (Para mantener localStorage limpio solo para borradores) ---
const setSessionCookie = (timestamp: number) => {
    const d = new Date();
    d.setTime(d.getTime() + SESSION_DURATION_MS);
    const expires = "expires=" + d.toUTCString();
    document.cookie = "ah_session_start=" + timestamp + ";" + expires + ";path=/;SameSite=Strict";
};

const getSessionCookie = (): number | null => {
    const name = "ah_session_start=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for(let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1);
        if (c.indexOf(name) == 0) {
            return parseInt(c.substring(name.length, c.length));
        }
    }
    return null;
};

const deleteSessionCookie = () => {
    document.cookie = "ah_session_start=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
};

export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true); 
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const sessionTimeoutRef = useRef<any>(null);

  // --- 1. FUNCIÓN PARA CERRAR SESIÓN ---
  const handleLogout = async (reason?: string) => {
    try {
        setLoading(false);
        await signOut(auth);
        
        // Limpieza: Borramos cookie de sesión
        deleteSessionCookie();
        
        // Limpieza: Cancelar timer activo
        if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
        
        // IMPORTANTE: NO borramos localStorage completo aquí para no perder borradores guardados,
        // pero sí podríamos borrar datos sensibles si los hubiera.
        
        setUser(null);
        setEmail('');
        setPassword('');
        
        if (reason) {
            setTimeout(() => {
                toast.error("Sesión Finalizada", {
                    description: reason,
                    duration: 6000,
                    icon: <ShieldAlert className="w-5 h-5 text-red-500"/>
                });
            }, 500);
        }
    } catch (error) {
        console.error("Error al cerrar sesión:", error);
    }
  };

  // --- 2. CONTROL DE TIEMPO ---
  const startSessionTimer = (startTime: number) => {
      if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);

      const now = Date.now();
      const timeElapsed = now - startTime;
      const timeLeft = SESSION_DURATION_MS - timeElapsed;

      if (timeLeft <= 0) {
          handleLogout("Su sesión ha expirado por seguridad (límite de 90 min).");
      } else {
          // Programar logout automático
          console.log(`Sesión válida. Expira en ${(timeLeft / 60000).toFixed(1)} minutos.`);
          sessionTimeoutRef.current = setTimeout(() => {
              handleLogout("Tiempo de sesión agotado por seguridad.");
          }, timeLeft);
          
          // Actualizar cookie para que no expire antes que el timer
          setSessionCookie(startTime); 
      }
  };

  // --- 3. PERSISTENCIA DE AUTH ---
  useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
          if (firebaseUser) {
              try {
                  // A. Verificar Cookie de Tiempo
                  let sessionStart = getSessionCookie();
                  
                  // Si no hay cookie (ej. se borró o expiró con el navegador cerrado), reiniciamos si el token de Firebase sigue vivo
                  // O forzamos logout. Para seguridad estricta, si no hay cookie, logout.
                  // Pero para UX (si el usuario cerró y abrió rápido), podemos renovar si Firebase dice que es válido.
                  // ESTRATEGIA HÍBRIDA: Si no hay cookie, asumimos nueva sesión.
                  if (!sessionStart) {
                      sessionStart = Date.now();
                      setSessionCookie(sessionStart);
                  }

                  startSessionTimer(sessionStart);

                  // B. Obtener Datos Usuario
                  const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                  
                  if (userDoc.exists()) {
                      const userData = userDoc.data() as any;
                      if (userData.isActive === false) {
                          handleLogout("Su cuenta ha sido desactivada.");
                          setIsAuthChecking(false);
                          return;
                      }

                      setUser({
                          uid: firebaseUser.uid,
                          email: userData.email,
                          role: userData.role,
                          name: userData.displayName || userData.name || 'Usuario',
                          specialty: userData.specialty || 'Medicina General',
                          isActive: userData.isActive !== false,
                          digitalCertData: userData.digitalCertData
                      });
                  } else {
                      // Fallback
                      setUser({
                          uid: firebaseUser.uid,
                          email: firebaseUser.email || '',
                          role: 'doctor',
                          name: 'Usuario',
                          specialty: 'Medicina',
                          isActive: true
                      });
                  }
              } catch (error) {
                  console.error("Error sesión:", error);
                  handleLogout();
              }
          } else {
              setUser(null);
              setLoading(false);
              if (sessionTimeoutRef.current) clearTimeout(sessionTimeoutRef.current);
          }
          setIsAuthChecking(false);
      });

      return () => unsubscribe();
  }, []);

  // --- 4. LISTENER PARA SINCRONIZAR PESTAÑAS (STORAGE EVENT) ---
  // Si el usuario cierra sesión en una pestaña, las demás deben enterarse.
  // Como usamos cookies ahora para el tiempo, el evento 'storage' no se dispara solo.
  // Pero Firebase Auth sí sincroniza. Agregamos esto por si acaso usamos localStorage para otras flags.
  useEffect(() => {
      const handleStorageChange = (e: StorageEvent) => {
          if (e.key === 'logout-event') {
              handleLogout("Sesión cerrada desde otra pestaña.");
          }
      };
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        const now = Date.now();
        setSessionCookie(now);
        startSessionTimer(now);
        toast.success("Bienvenido al sistema.");
    } catch (error: any) {
        console.error("Auth Error", error);
        toast.error("Credenciales incorrectas.");
        setLoading(false);
    }
  };

  if (isAuthChecking) {
      return (
          <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-inter">
              <motion.div 
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
                  className="mb-8"
              >
                  <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl border border-slate-100 p-4">
                      <img src={LOGO_BASE64} alt="Logo" className="w-full h-full object-contain" />
                  </div>
              </motion.div>
              <div className="flex items-center gap-3 text-slate-500 font-medium">
                  <Loader2 className="w-5 h-5 animate-spin text-violet-600"/>
                  <span className="text-sm tracking-wide">Iniciando sesión segura...</span>
              </div>
          </div>
      );
  }

  if (user) {
    return (
      <AnimatePresence>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Toaster position="top-right" richColors />
            <DoctorStation user={user} onLogout={() => {
                // Disparar evento para otras pestañas
                localStorage.setItem('logout-event', Date.now().toString());
                handleLogout();
            }} />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-6 font-inter relative overflow-hidden">
       <Toaster position="top-right" richColors />
       
       <motion.div 
         animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
         transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
         className="absolute top-[-10%] right-[-5%] w-[250px] md:w-[300px] h-[250px] md:h-[300px] bg-violet-400/20 rounded-full blur-3xl"
       />
       <motion.div 
         animate={{ scale: [1, 1.3, 1], x: [0, 50, 0] }}
         transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
         className="absolute bottom-[-10%] left-[-10%] w-[250px] md:w-[300px] h-[250px] md:h-[300px] bg-indigo-400/20 rounded-full blur-3xl"
       />
       
       <motion.div 
         initial={{ opacity: 0, y: 30, scale: 0.95 }}
         animate={{ opacity: 1, y: 0, scale: 1 }}
         transition={{ duration: 0.6, type: "spring", bounce: 0.3 }}
         className="w-full max-w-4xl bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/50 overflow-hidden flex flex-col md:flex-row min-h-[550px] md:h-[600px] relative z-10"
       >
          <div className="w-full md:w-1/2 relative bg-slate-900 overflow-hidden shrink-0 h-48 sm:h-64 md:h-auto group">
             <motion.img 
                src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2053&auto=format&fit=crop" 
                alt="Hospital Clean"
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-700"
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 5 }}
             />
             <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent md:bg-gradient-to-t md:from-slate-900 md:via-slate-900/60 md:to-violet-900/40"></div>
             
             <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end text-white">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}>
                    <span className="bg-violet-600 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider mb-2 inline-block shadow-lg">Sistema Clínico</span>
                    <h1 className="text-2xl md:text-3xl font-bold leading-tight drop-shadow-md">Asociación<br/>Humana</h1>
                </motion.div>
                <motion.p 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  transition={{ delay: 0.5 }}
                  className="text-slate-200 text-xs md:text-sm hidden sm:block mt-2"
                >
                  Gestión integral de pacientes, historial médico y farmacia inteligente.
                </motion.p>
             </div>
          </div>

          <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col justify-center bg-white/60 relative flex-1">
             <div className="max-w-[320px] mx-auto w-full">
                 
                 <div className="mb-8 md:mb-10 text-center md:text-left">
                     <motion.div 
                        initial={{ scale: 0 }} 
                        animate={{ scale: 1 }} 
                        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                        className="w-24 h-24 md:w-32 md:h-32 bg-white rounded-3xl flex items-center justify-center mb-6 mx-auto md:mx-0 shadow-xl border border-slate-100 p-4 transform hover:scale-105 transition-transform duration-500"
                     >
                         <img src={LOGO_BASE64} alt="Logo" className="w-full h-full object-contain" />
                     </motion.div>
                     <h2 className="text-xl md:text-2xl font-bold text-slate-800">Iniciar Sesión</h2>
                     <p className="text-slate-500 text-xs md:text-sm mt-1">Ingrese sus credenciales para acceder.</p>
                 </div>

                 <form onSubmit={handleLogin} className="space-y-4 md:space-y-5">
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      transition={{ delay: 0.3 }}
                      className="space-y-1.5"
                    >
                        <label className="text-[10px] md:text-xs font-bold text-slate-500 ml-1 uppercase tracking-wide">Correo Electrónico</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-violet-600 transition-colors pointer-events-none" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="ejemplo@correo.com"
                                required
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base md:text-sm rounded-xl pl-12 pr-4 py-3 outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all shadow-sm"
                            />
                        </div>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }} 
                      animate={{ opacity: 1, x: 0 }} 
                      transition={{ delay: 0.4 }}
                      className="space-y-1.5"
                    >
                       <label className="text-[10px] md:text-xs font-bold text-slate-500 ml-1 uppercase tracking-wide">Contraseña</label>
                       <div className="relative group">
                           <Lock className="absolute left-4 top-3.5 text-slate-400 w-5 h-5 group-focus-within:text-violet-600 transition-colors pointer-events-none" />
                           <input
                             type={showPassword ? "text" : "password"}
                             value={password}
                             onChange={(e) => setPassword(e.target.value)}
                             placeholder="••••••••"
                             required
                             className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-base md:text-sm rounded-xl pl-12 pr-12 py-3 outline-none focus:ring-2 focus:ring-violet-500 focus:bg-white transition-all shadow-sm"
                           />
                           <button
                             type="button"
                             onClick={() => setShowPassword(!showPassword)}
                             className="absolute right-4 top-3.5 text-slate-400 hover:text-violet-600 transition p-0.5"
                           >
                             {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                           </button>
                       </div>
                    </motion.div>

                    <motion.div 
                      initial={{ opacity: 0, y: 20 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      transition={{ delay: 0.5 }}
                      className="pt-2"
                    >
                        <motion.button 
                          type="submit" 
                          disabled={loading}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="w-full bg-slate-900 text-white font-bold text-sm py-3.5 rounded-xl hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-900/20 active:scale-[0.98] transition-all duration-200 flex justify-center items-center gap-2"
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                          ) : (
                            <>
                                Acceder al Sistema
                                <ChevronRight className="w-4 h-4" />
                            </>
                          )}
                        </motion.button>
                    </motion.div>
                 </form>
             </div>
          </div>
       </motion.div>
       
       <p className="fixed bottom-2 md:bottom-4 text-[10px] text-slate-400 font-medium text-center w-full">
           © 2024 Asociación Humana. Todos los derechos reservados.
       </p>
    </div>
  );
}
