
import { initializeApp, getApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut, updateEmail, updatePassword } from 'firebase/auth';
import { collection, doc, getDocs, setDoc, updateDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db, firebaseConfig, functions } from '../firebase/config';
import { UserProfile } from '../types';
import { logAuditAction } from './auditService';
import { httpsCallable } from 'firebase/functions';

const normalizeDoctorName = (value: string) => {
    return value.replace(/^\s*(dr\.?|dra\.?|doctor|doctora)\s+/i, '').trim();
};

export const userService = {
    getDoctors: async (): Promise<UserProfile[]> => {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(query(usersRef, where('role', 'in', ['doctor', 'licenciado'])));
        return snapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as UserProfile)).filter(d => d.isActive !== false);
    },
    getAllUsers: async (): Promise<UserProfile[]> => {
        const usersRef = collection(db, 'users');
        const snapshot = await getDocs(query(usersRef, orderBy('name')));
        return snapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as UserProfile));
    }
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(query(usersRef, orderBy('name')));
    return snapshot.docs.map(doc => ({ uid: doc.id, ...(doc.data() as any) } as UserProfile));
};

export const getActiveDoctors = async (): Promise<UserProfile[]> => {
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(query(usersRef, where('role', 'in', ['doctor', 'licenciado'])));
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

    const rawSpecialties = Array.isArray(userData.specialties)
        ? userData.specialties
        : (userData.specialty ? [userData.specialty] : []);
    const specialties = rawSpecialties.map((s: any) => String(s)).filter((s: string) => s.trim() !== '');
    const rawName = String(userData.name || '').trim();
    const isDoctorRole = userData.role === 'doctor' || userData.role === 'licenciado';
    const normalizedName = isDoctorRole ? normalizeDoctorName(rawName) : rawName;
    await setDoc(doc(db, 'users', uid), {
        email: userData.email,
        name: normalizedName,
        role: userData.role,
        specialty: specialties[0] || '',
        specialties,
        isActive: true,
        createdAt: Timestamp.now()
    });

    await signOut(secondaryAuth);
};

type AuthUpdates = {
    email?: string;
    password?: string;
};

const updateUserAuth = async (payload: { uid: string } & AuthUpdates) => {
    const callable = httpsCallable(functions, 'updateUserAuth');
    try {
        await callable(payload);
    } catch (error: any) {
        const code = error?.code || '';
        if (code === 'functions/not-found' || code === 'unavailable') {
            throw new Error("La función updateUserAuth no está desplegada o no responde en us-central1.");
        }
        throw error;
    }
};

export const updateSystemUser = async (uid: string, data: Partial<UserProfile>, adminEmail: string, authUpdates?: AuthUpdates) => {
    try {
        const userRef = doc(db, 'users', uid);
        const auth = getAuth();
        const currentUser = auth.currentUser;
        const nextData: any = { ...data };
        if (typeof nextData.name === 'string') {
            const rawName = nextData.name.trim();
            const isDoctorRole = nextData.role === 'doctor' || nextData.role === 'licenciado';
            nextData.name = isDoctorRole ? normalizeDoctorName(rawName) : rawName;
        }

        // SI ES EL USUARIO ACTUAL, ACTUALIZAR AUTH TAMBIÉN
        if (authUpdates?.email || authUpdates?.password) {
            await updateUserAuth({
                uid,
                email: authUpdates.email,
                password: authUpdates.password
            });
            await logAuditAction(adminEmail, "SYNC_AUTH_CREDENTIALS", `Actualización Auth solicitada para UID ${uid}.`);
        }

        if (currentUser && currentUser.uid === uid && authUpdates?.email && authUpdates.email !== currentUser.email) {
            try {
                await updateEmail(currentUser, authUpdates.email);
                await logAuditAction(adminEmail, "SYNC_AUTH_EMAIL", `Se sincronizó el correo de Auth para: ${data.name}`);
            } catch (e: any) {
                console.warn("Auth Email update requires re-authentication", e);
                await logAuditAction(adminEmail, "SYNC_AUTH_EMAIL_PENDING", `Sincronización de correo Auth pendiente para ${data.name} (Requiere login reciente).`);
            }
        }

        if (currentUser && currentUser.uid === uid && authUpdates?.password) {
            try {
                await updatePassword(currentUser, authUpdates.password);
                await logAuditAction(adminEmail, "SYNC_AUTH_PASSWORD", `Contraseña Auth actualizada para: ${data.name}`);
            } catch (e: any) {
                console.warn("Auth Password update requires re-authentication", e);
                await logAuditAction(adminEmail, "SYNC_AUTH_PASSWORD_PENDING", `Sincronización de contraseña Auth pendiente para ${data.name} (Requiere login reciente).`);
            }
        }

        await updateDoc(userRef, {
            ...nextData,
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
