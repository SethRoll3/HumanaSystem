
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, updateEmail } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, updateDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase/config';
import { UserProfile } from '../types';
import { logAuditAction } from './auditService';

export const userService = {
  getDoctors: async (): Promise<UserProfile[]> => {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(query(usersRef, where('role', '==', 'doctor')));
    return snapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as UserProfile)).filter(d => d.isActive !== false);
  }
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(query(usersRef, orderBy('name')));
    return snapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as UserProfile));
};

export const getActiveDoctors = async (): Promise<UserProfile[]> => {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(query(usersRef, where('role', '==', 'doctor')));
    return snapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as UserProfile)).filter(d => d.isActive !== false);
};

export const createSystemUser = async (userData: any, password: string): Promise<void> => {
    const appName = "secondaryAppForUserCreation";
    const existingApps = getApps();
    const foundApp = existingApps.find(app => app.name === appName);
    const secondaryApp = foundApp || initializeApp(firebaseConfig, appName);

    const secondaryAuth = getAuth(secondaryApp);
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, userData.email, password);
    const uid = userCredential.user.uid;

    await setDoc(doc(db, 'users', uid), {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        specialty: userData.specialty || '',
        isActive: true,
        createdAt: Timestamp.now()
    });

    await signOut(secondaryAuth);
};

export const updateSystemUser = async (uid: string, data: Partial<UserProfile>, adminEmail: string) => {
    try {
        const userRef = doc(db, 'users', uid);
        const auth = getAuth();
        const currentUser = auth.currentUser;

        // SI ES EL USUARIO ACTUAL, ACTUALIZAR AUTH TAMBIÉN
        if (currentUser && currentUser.uid === uid && data.email && data.email !== currentUser.email) {
            try {
                await updateEmail(currentUser, data.email);
                await logAuditAction(adminEmail, "SYNC_AUTH_EMAIL", `Se sincronizó el correo de Auth para: ${data.name}`);
            } catch (e: any) {
                console.warn("Auth Email update requires re-authentication", e);
                await logAuditAction(adminEmail, "SYNC_AUTH_EMAIL_PENDING", `Sincronización de correo Auth pendiente para ${data.name} (Requiere login reciente).`);
            }
        } else if (data.email) {
             // LOG PARA SEGUIMIENTO DE OTROS USUARIOS (Requiere Admin SDK en Cloud Functions)
             await logAuditAction(adminEmail, "REQUEST_EMAIL_SYNC", `Cambio de correo solicitado para UID ${uid}. De Firestore a Auth.`);
        }

        await updateDoc(userRef, {
            ...data,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error("Error updating user:", error);
        throw error;
    }
};

export const toggleUserStatus = async (uid: string, currentStatus: boolean, adminEmail: string) => {
    const userRef = doc(db, 'users', uid);
    const statusText = !currentStatus ? 'DESACTIVADO' : 'ACTIVADO';
    await updateDoc(userRef, { isActive: !currentStatus });
    await logAuditAction(adminEmail, "CAMBIO_ESTADO_USUARIO", `UID: ${uid} marcado como ${statusText}`);
};
