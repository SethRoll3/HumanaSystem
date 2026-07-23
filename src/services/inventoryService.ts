
import { collection, query, where, getDocs, limit, orderBy, startAt, endAt, addDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebase/config.ts';
import { Medicine, Specialty, Pathology, LaboratoryItem } from '../types.ts';
import { normalizeText } from './pharmacySalesService.ts';

// --- OBTENER TODOS LOS MEDICAMENTOS (PARA CACHÉ LOCAL) ---
export const getAllMedicines = async (): Promise<Medicine[]> => {
    try {
        const inventoryRef = collection(db, 'inventory');
        const externalRef = collection(db, 'external_medicines');

        const [snapInv, snapExt] = await Promise.all([
            getDocs(query(inventoryRef, orderBy('name'))),
            getDocs(query(externalRef, orderBy('name')))
        ]);

        const internalResults: Medicine[] = snapInv.docs.map(doc => {
            const d = doc.data() as any;
            return {
                id: doc.id,
                name: d.name,
                stock: d.stock || 0,
                price: d.price || 0,
                presentation: d.presentation || '',
                units_per_box: d.units_per_box || 1,
                category: d.category,
                brandName: d.brandName || d.commercialName || '',
                activeIngredient: d.activeIngredient || '',
                isExternal: d.isExternal || false
            } as Medicine;
        });

        const externalResults: Medicine[] = snapExt.docs.map(doc => {
            const d = doc.data() as any;
            return {
                id: doc.id,
                name: d.name,
                stock: 0,
                price: 0,
                presentation: d.presentation || 'Externo',
                units_per_box: d.units_per_box || 1,
                category: d.category,
                brandName: d.brandName || d.commercialName || '',
                activeIngredient: d.activeIngredient || '',
                isExternal: true
            } as Medicine;
        });

        return [...internalResults, ...externalResults];
    } catch (error) {
        console.error("Error fetching all medicines:", error);
        return [];
    }
};

// --- BÚSQUEDA HÍBRIDA (INVENTARIO + EXTERNOS) ---
export const searchMedicine = async (term: string): Promise<Medicine[]> => {
  try {
    // Si no hay término, devolver un mix por defecto (últimos agregados o alfabético)
    if (!term || term.trim() === '') {
        const inventoryRef = collection(db, 'inventory');
        const externalRef = collection(db, 'external_medicines');
        
        const [snapInv, snapExt] = await Promise.all([
            getDocs(query(inventoryRef, orderBy('name'), limit(5))),
            getDocs(query(externalRef, orderBy('name'), limit(5)))
        ]);

        const internalResults: Medicine[] = snapInv.docs.map(doc => {
            const d = doc.data() as any;
            return {
                id: doc.id,
                name: d.name,
                stock: d.stock || 0,
                price: d.price || 0,
                presentation: d.presentation || '',
                units_per_box: d.units_per_box || 1,
                category: d.category,
                brandName: d.brandName || d.commercialName || '',
                activeIngredient: d.activeIngredient || '',
                isExternal: d.isExternal || false
            } as Medicine;
        });

        const externalResults: Medicine[] = snapExt.docs.map(doc => {
            const d = doc.data() as any;
            return {
                id: doc.id,
                name: d.name,
                stock: 0,
                price: 0,
                presentation: d.presentation || 'Externo',
                units_per_box: d.units_per_box || 1,
                category: d.category,
                brandName: d.brandName || d.commercialName || '',
                activeIngredient: d.activeIngredient || '',
                isExternal: true
            } as Medicine;
        });

        return [...internalResults, ...externalResults];
    }

    const termLower = normalizeText(term);
    const termCap = termLower.charAt(0).toUpperCase() + termLower.slice(1);
    
    const mapDocToMedicine = (docSnap: any, isExternalCol: boolean): Medicine => {
        const d = docSnap.data() as any;
        return {
            id: docSnap.id,
            name: d.name,
            stock: isExternalCol ? 0 : (d.stock || 0),
            price: isExternalCol ? 0 : (d.price || 0),
            presentation: d.presentation || (isExternalCol ? 'Externo' : ''),
            units_per_box: d.units_per_box || 1,
            category: d.category,
            brandName: d.brandName || d.commercialName || '',
            activeIngredient: d.activeIngredient || '',
            isExternal: isExternalCol || d.isExternal || false
        } as Medicine;
    };

    const fetchFromCol = async (colName: string, field: string, searchPrefix: string, isExternalCol: boolean) => {
        const ref = collection(db, colName);
        const q = query(
            ref,
            orderBy(field),
            startAt(searchPrefix),
            endAt(searchPrefix + '\uf8ff'),
            limit(5)
        );
        const snap = await getDocs(q);
        return snap.docs.map(docSnap => mapDocToMedicine(docSnap, isExternalCol));
    };

    const [invByName, extByNameCap, extByNameLow, invByBrand, extByBrandCap, extByBrandLow, invByActive, extByActiveCap, extByActiveLow] =
      await Promise.all([
        fetchFromCol('inventory', 'name', termCap, false),
        fetchFromCol('external_medicines', 'name', termCap, true),
        termCap !== termLower ? fetchFromCol('external_medicines', 'name', termLower, true) : Promise.resolve([]),
        fetchFromCol('inventory', 'brandName', termCap, false),
        fetchFromCol('external_medicines', 'brandName', termCap, true),
        termCap !== termLower ? fetchFromCol('external_medicines', 'brandName', termLower, true) : Promise.resolve([]),
        fetchFromCol('inventory', 'activeIngredient', termCap, false),
        fetchFromCol('external_medicines', 'activeIngredient', termCap, true),
        termCap !== termLower ? fetchFromCol('external_medicines', 'activeIngredient', termLower, true) : Promise.resolve([]),
      ]);

    const allResults = [
        ...invByName,
        ...extByNameCap,
        ...extByNameLow,
        ...invByBrand,
        ...extByBrandCap,
        ...extByBrandLow,
        ...invByActive,
        ...extByActiveCap,
        ...extByActiveLow
    ];
    const uniqueMap = new Map();
    allResults.forEach(item => {
        if (!uniqueMap.has(item.id)) uniqueMap.set(item.id, item);
    });

    return Array.from(uniqueMap.values());

  } catch (error) {
    console.error("Error fetching inventory:", error);
    return [];
  }
};

// --- GUARDAR MEDICAMENTO EXTERNO ---
export const saveExternalMedicine = async (name: string, aiData: any) => {
    try {
        const ref = collection(db, 'external_medicines');
        const q = query(ref, where('name', '==', name));
        const snap = await getDocs(q);

        if (!snap.empty) return;

        await addDoc(ref, {
            name: name,
            activeIngredient: aiData?.activeIngredient || '',
            distributorGT: aiData?.distributorGT || '',
            pharmacy: aiData?.pharmacy || '',
            commercialName: aiData?.commercialName || name,
            brandName: aiData?.commercialName || name,
            createdAt: new Date(),
            isExternal: true
        });
    } catch (e) {
        console.error("Error saving external med:", e);
    }
};

// --- OBTENER MEDICAMENTOS EXTERNOS CON PLACEHOLDERS FALSOS ---
export interface PlaceholderMedicine {
  id: string;
  name: string;
  activeIngredient?: string;
  distributorGT?: string;
  pharmacy?: string;
  commercialName?: string;
}

const PLACEHOLDER_VALUES = {
  activeIngredient: 'No identificado',
  distributorGT: 'Desconocido',
  pharmacy: 'Farmacias Generales',
};

const isPlaceholder = (med: PlaceholderMedicine): boolean => {
  return (
    med.activeIngredient === PLACEHOLDER_VALUES.activeIngredient ||
    med.distributorGT === PLACEHOLDER_VALUES.distributorGT ||
    med.pharmacy === PLACEHOLDER_VALUES.pharmacy
  );
};

export const getPlaceholderExternalMedicines = async (): Promise<PlaceholderMedicine[]> => {
  try {
    const ref = collection(db, 'external_medicines');
    const [aiSnap, distSnap, pharmSnap] = await Promise.all([
      getDocs(query(ref, where('activeIngredient', '==', PLACEHOLDER_VALUES.activeIngredient))),
      getDocs(query(ref, where('distributorGT', '==', PLACEHOLDER_VALUES.distributorGT))),
      getDocs(query(ref, where('pharmacy', '==', PLACEHOLDER_VALUES.pharmacy))),
    ]);

    const map = new Map<string, PlaceholderMedicine>();
    const collect = (snap: any) => {
      snap.docs.forEach((d: any) => {
        const data = d.data() as any;
        map.set(d.id, {
          id: d.id,
          name: data.name,
          activeIngredient: data.activeIngredient,
          distributorGT: data.distributorGT,
          pharmacy: data.pharmacy,
          commercialName: data.commercialName || data.brandName,
        });
      });
    };
    collect(aiSnap);
    collect(distSnap);
    collect(pharmSnap);
    return Array.from(map.values()).filter(isPlaceholder);
  } catch (e) {
    console.error('Error fetching placeholder medicines:', e);
    return [];
  }
};

// --- RE-ANALIZAR MEDICAMENTO EXTERNO CON IA Y ACTUALIZAR EN FIRESTORE ---
export const reanalyzeExternalMedicine = async (
  medId: string,
  aiData: { activeIngredient: string; distributorGT: string; pharmacy: string; commercialName: string }
): Promise<void> => {
  try {
    const ref = doc(db, 'external_medicines', medId);
    await updateDoc(ref, {
      activeIngredient: aiData.activeIngredient || '',
      distributorGT: aiData.distributorGT || '',
      pharmacy: aiData.pharmacy || '',
      commercialName: aiData.commercialName || '',
      brandName: aiData.commercialName || '',
      reanalyzedAt: new Date(),
    });
    } catch (e) {
        console.error('Error re-analyzing medicine:', e);
        throw e;
    }
};

export const getSpecialties = async (): Promise<Specialty[]> => {
  try {
    const ref = collection(db, 'specialties');
    const snapshot = await getDocs(ref);
    return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Specialty));
  } catch (e) {
    console.error(e);
    return [];
  }
};

// --- CROSS-REFERENCE: MEDICAMENTOS EXTERNOS CUYA MOLÉCULA TENEMOS INTERNAMENTE ---
export interface MoleculeOverlap {
  molecule: string; // Active ingredient (canonical display)
  externalMedicine: Medicine; // The external medicine that has this molecule
  internalMatches: Medicine[]; // All internal medicines with the same molecule
}

export interface MoleculeOverlapReport {
  overlaps: MoleculeOverlap[];
  totalExternalMedsWithInternalMolecule: number;
  uniqueMoleculesCount: number;
  totalInternalMeds: number;
  totalExternalMeds: number;
}

const buildMoleculeIndex = (meds: Medicine[]): Map<string, Medicine[]> => {
  const index = new Map<string, Medicine[]>();
  meds.forEach(med => {
    const mol = (med.activeIngredient || '').trim();
    if (!mol) return;
    const key = normalizeText(mol);
    if (!key) return;
    const list = index.get(key) || [];
    list.push(med);
    index.set(key, list);
  });
  return index;
};

export const findMoleculeOverlaps = (allMedicines: Medicine[]): MoleculeOverlapReport => {
  const internal = allMedicines.filter(m => !m.isExternal);
  const external = allMedicines.filter(m => m.isExternal);

  const moleculeIndex = buildMoleculeIndex(internal);
  const overlapMap = new Map<string, MoleculeOverlap>();

  external.forEach(extMed => {
    const mol = (extMed.activeIngredient || '').trim();
    if (!mol) return;
    const key = normalizeText(mol);
    const internalMatches = moleculeIndex.get(key) || [];
    if (internalMatches.length === 0) return;

    const canonical = internalMatches[0].activeIngredient || mol;
    const overlapKey = `${key}|${normalizeText(extMed.name)}`;
    if (overlapMap.has(overlapKey)) return;

    overlapMap.set(overlapKey, {
      molecule: canonical,
      externalMedicine: extMed,
      internalMatches,
    });
  });

  const overlaps = Array.from(overlapMap.values()).sort((a, b) => {
    const m = a.molecule.localeCompare(b.molecule, 'es');
    if (m !== 0) return m;
    return a.externalMedicine.name.localeCompare(b.externalMedicine.name, 'es');
  });

  return {
    overlaps,
    totalExternalMedsWithInternalMolecule: overlaps.length,
    uniqueMoleculesCount: new Set(overlaps.map(o => normalizeText(o.molecule))).size,
    totalInternalMeds: internal.length,
    totalExternalMeds: external.length,
  };
};

// --- OVERLAP DESDE RECETAS FILTRADAS (reactivo a filtros de doctor/especialidad/molecula) ---
export interface PrescriptionOverlapInput {
  name: string;
  activeIngredient?: string;
  isExternal: boolean;
}

export const findMoleculeOverlapsFromPrescriptions = (
  filteredPrescriptionItems: PrescriptionOverlapInput[],
  allMedicines: Medicine[]
): MoleculeOverlapReport => {
  const internalCatalog = allMedicines.filter(m => !m.isExternal);
  const moleculeIndex = buildMoleculeIndex(internalCatalog);

  const prescribedExternalNames = new Set(
    filteredPrescriptionItems
      .filter(p => p.isExternal)
      .map(p => normalizeText(p.name))
  );

  const prescribedExternalFromCatalog = allMedicines.filter(
    m => m.isExternal && prescribedExternalNames.has(normalizeText(m.name))
  );

  const overlapMap = new Map<string, MoleculeOverlap>();

  prescribedExternalFromCatalog.forEach(extMed => {
    const mol = (extMed.activeIngredient || '').trim();
    if (!mol) return;
    const key = normalizeText(mol);
    const internalMatches = moleculeIndex.get(key) || [];
    if (internalMatches.length === 0) return;

    const canonical = internalMatches[0].activeIngredient || mol;
    const overlapKey = `${key}|${normalizeText(extMed.name)}`;
    if (overlapMap.has(overlapKey)) return;

    overlapMap.set(overlapKey, {
      molecule: canonical,
      externalMedicine: extMed,
      internalMatches,
    });
  });

  const overlaps = Array.from(overlapMap.values()).sort((a, b) => {
    const m = a.molecule.localeCompare(b.molecule, 'es');
    if (m !== 0) return m;
    return a.externalMedicine.name.localeCompare(b.externalMedicine.name, 'es');
  });

  return {
    overlaps,
    totalExternalMedsWithInternalMolecule: overlaps.length,
    uniqueMoleculesCount: new Set(overlaps.map(o => normalizeText(o.molecule))).size,
    totalInternalMeds: internalCatalog.length,
    totalExternalMeds: prescribedExternalFromCatalog.length,
  };
};

export const getPathologies = async (): Promise<Pathology[]> => {
  try {
    const ref = collection(db, 'pathologies');
    const q = query(ref, orderBy('name'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Pathology));
  } catch (e) {
    console.error(e);
    return [];
  }
};

// NUEVO: Obtener catálogo de laboratorios desde DB
export const getLaboratories = async (): Promise<LaboratoryItem[]> => {
    try {
        const ref = collection(db, 'laboratory_catalog');
        const q = query(ref, orderBy('name'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as LaboratoryItem));
    } catch (e) {
        console.error("Error fetching labs:", e);
        return [];
    }
};

// --- SEED SPECIALTIES (Simplificado: Solo Nombres) ---
export const seedSpecialties = async () => {
    const specialtiesData: string[] = [
        "Cardiología", "Neurología", "Pediatría", "Ginecología", 
        "Nutrición", "Psiquiatría", "Traumatología", "Medicina Interna"
    ];

    const ref = collection(db, 'specialties');
    for (const specName of specialtiesData) {
        // Usamos el nombre como ID para no duplicar
        await setDoc(doc(ref, specName), { name: specName });
    }
};

// --- SEED PATHOLOGIES (NUEVO: Patologías y Exámenes) ---
export const seedPathologies = async () => {
    const pathologiesData: Pathology[] = [
        {
            name: "Diabetes Mellitus Tipo 2",
            exams: ["Glucosa en Ayunas", "Hemoglobina Glicosilada (HbA1c)", "Orina Completa", "Creatinina Sérica", "Perfil Lipídico"]
        },
        {
            name: "Hipertensión Arterial",
            exams: ["Electrocardiograma (EKG)", "Perfil Lipídico", "Creatinina", "Potasio Sérico", "Ácido Úrico"]
        },
        {
            name: "Síndrome Metabólico",
            exams: ["Glucosa en Ayunas", "Triglicéridos", "Colesterol HDL/LDL", "Insulina Basal", "Ácido Úrico"]
        },
        {
            name: "Infección Urinaria Recurrente",
            exams: ["Urocultivo", "Hematología Completa", "Orina Completa", "Nitrógeno de Urea", "Creatinina"]
        },
        {
            name: "Anemia Ferropénica",
            exams: ["Hematología Completa", "Ferritina", "Hierro Sérico", "Capacidad de Fijación de Hierro", "Sangre Oculta en Heces"]
        },
        {
            name: "Control Prenatal (Primer Trimestre)",
            exams: ["Hematología Completa", "Grupo Sanguíneo y Rh", "VDRL/RPR", "VIH", "Glucosa en Ayunas", "Orina Completa"]
        }
    ];

    const ref = collection(db, 'pathologies');
    let count = 0;
    for (const pat of pathologiesData) {
        // Usamos el nombre como ID
        await setDoc(doc(ref, pat.name), pat);
        count++;
    }
    return count;
};

// --- CREAR DOCTOR DEMO ---
const seedDoctorUser = async (onProgress?: (msg: string) => void) => {
    const email = "doctor@asociacion.com";
    const password = "123456"; 
    
    if (onProgress) onProgress("Verificando usuario doctor...");

    try {
        let uid = "";
        
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            uid = userCredential.user.uid;
            if (onProgress) onProgress("Usuario Auth creado...");
        } catch (authError: any) {
            if (authError.code === 'auth/email-already-in-use') {
                if (onProgress) onProgress("El usuario ya existe.");
                return; 
            }
            console.error("Auth error:", authError);
        }

        if (uid) {
            await setDoc(doc(db, 'users', uid), {
                email: email,
                displayName: "Dr. Demo",
                role: 'doctor',
                specialty: "Cardiología",
                createdAt: new Date()
            });
            if (onProgress) onProgress("Perfil Dr. Demo creado.");
        }

    } catch (e) {
        console.error("Error seeding doctor:", e);
    }
};

export const seedInventory = async (onProgress?: (status: string) => void) => {
  if (onProgress) onProgress("Conectando con DB...");
  const inventoryRef = collection(db, 'inventory');
  
  const medicines = [
    { name: "Amoxicilina 500mg", stock: 50, units_per_box: 100, price: 150, presentation: "Caja x 100 tabletas", category: "Antibiótico" },
    { name: "Paracetamol 500mg", stock: 200, units_per_box: 100, price: 85, presentation: "Caja x 100 tabletas", category: "Analgésico" }
  ];

  let count = 0;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("TIEMPO AGOTADO")), 8000)
  );

  try {
    if (onProgress) onProgress("Insertando Especialidades...");
    await seedSpecialties();
    
    if (onProgress) onProgress("Insertando Patologías...");
    await seedPathologies();

    if (!auth.currentUser) await seedDoctorUser(onProgress);

    for (const med of medicines) {
      // Check if exists roughly
      const q = query(inventoryRef, where('name', '==', med.name));
      const snap = await getDocs(q);
      if(snap.empty) {
         if (onProgress) onProgress(`Escribiendo: ${med.name}`);
         await Promise.race([addDoc(inventoryRef, med), timeoutPromise]);
         count++;
      }
    }
    
    if (onProgress) onProgress("¡Finalizado!");
    return count;
  } catch (error: any) {
    console.error("Error crítico en seedInventory:", error);
    throw error;
  }
};
