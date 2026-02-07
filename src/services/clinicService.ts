import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Clinic } from '../types';

const COLLECTION_NAME = 'clinics';

export const getClinics = async (): Promise<Clinic[]> => {
  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  return snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Clinic));
};

export const createClinic = async (data: Omit<Clinic, 'id'>): Promise<string> => {
  const payload: any = {
    name: data.name,
    code: data.code || '',
    isActive: data.isActive !== false,
  };
  const ref = await addDoc(collection(db, COLLECTION_NAME), payload);
  return ref.id;
};

export const updateClinic = async (id: string, data: Partial<Clinic>): Promise<void> => {
  const ref = doc(db, COLLECTION_NAME, id);
  await updateDoc(ref, { ...data });
};

export const deleteClinic = async (id: string): Promise<void> => {
  const ref = doc(db, COLLECTION_NAME, id);
  await deleteDoc(ref);
};

