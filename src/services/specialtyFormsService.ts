import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { SpecialtyFormDefinition } from '../components/Wizard/SpecialtyForms/types';
import { SPECIALTY_FORMS } from '../components/Wizard/SpecialtyForms/definitions';

const COLLECTION_NAME = 'specialty_forms';

const ensureSeedForms = async () => {
  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    if (!snap.empty) return;
    await Promise.all(
      SPECIALTY_FORMS.map(async form => {
        const ref = doc(db, COLLECTION_NAME, form.id);
        await setDoc(ref, form);
      })
    );
  } catch (e) {
    console.error('[specialtyFormsService] No se pudieron seedear specialty_forms, usando solo definiciones locales.', e);
  }
};

export const specialtyFormsService = {
  async getAll(): Promise<SpecialtyFormDefinition[]> {
    try {
      await ensureSeedForms();
      const snap = await getDocs(collection(db, COLLECTION_NAME));
      const docs = snap.docs.map(d => d.data() as SpecialtyFormDefinition);
      if (docs.length === 0) {
        console.warn('[specialtyFormsService] specialty_forms vacío en Firestore, usando definiciones locales.');
        return SPECIALTY_FORMS;
      }
      const fixedForms = ['epilepsy', 'parkinson', 'neurologica', 'columna']
        .map(id => SPECIALTY_FORMS.find(form => form.id === id))
        .filter(Boolean) as SpecialtyFormDefinition[];
      if (fixedForms.length === 0) return docs;
      const fixedIds = new Set(fixedForms.map(form => form.id));
      const formsWithoutFixed = docs.filter(form => !fixedIds.has(form.id));
      return [...fixedForms, ...formsWithoutFixed];
    } catch (e) {
      console.error('[specialtyFormsService] Error leyendo specialty_forms, usando definiciones locales.', e);
      return SPECIALTY_FORMS;
    }
  },

  async save(form: SpecialtyFormDefinition): Promise<void> {
    const ref = doc(db, COLLECTION_NAME, form.id);
    const clean = JSON.parse(JSON.stringify(form)) as SpecialtyFormDefinition;
    await setDoc(ref, clean, { merge: true });
  },

  async delete(id: string): Promise<void> {
    const ref = doc(db, COLLECTION_NAME, id);
    await deleteDoc(ref);
  },
};
