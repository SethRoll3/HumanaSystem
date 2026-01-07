
import { collection, query, where, getDocs, limit, orderBy, startAt, endAt, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebase/config.ts';
import { Medicine, Specialty, Pathology, LaboratoryItem } from '../types.ts';

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

        const internalResults: Medicine[] = snapInv.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) } as Medicine));
        const externalResults: Medicine[] = snapExt.docs.map(doc => {
            const data = doc.data() as any;
            return {
                id: doc.id,
                name: data.name,
                stock: 0,
                price: 0,
                presentation: 'Externo',
                units_per_box: 1,
                isExternal: true
            } as Medicine;
        });

        return [...internalResults, ...externalResults];
    }

    const termLower = term.toLowerCase();
    const termCap = termLower.charAt(0).toUpperCase() + termLower.slice(1);
    
    // Helper para buscar en una colección con un prefijo específico
    const fetchFromCol = async (colName: string, searchPrefix: string, isExternalCol: boolean) => {
        const ref = collection(db, colName);
        const q = query(
            ref,
            orderBy('name'),
            startAt(searchPrefix),
            endAt(searchPrefix + '\uf8ff'),
            limit(5)
        );
        const snap = await getDocs(q);
        return snap.docs.map(doc => {
            const d = doc.data() as any;
            return {
                id: doc.id,
                name: d.name,
                stock: isExternalCol ? 0 : (d.stock || 0),
                price: isExternalCol ? 0 : (d.price || 0),
                presentation: d.presentation || (isExternalCol ? 'Externo' : ''),
                units_per_box: d.units_per_box || 1,
                isExternal: isExternalCol || d.isExternal || false
            } as Medicine;
        });
    };

    // Ejecutamos búsquedas en paralelo para cubrir:
    // 1. Inventario (Capitalizado - Estándar)
    // 2. Externos (Capitalizado - Estándar)
    // 3. Externos (Minúscula - Casos manuales como 'panadol')
    
    const [invResults, extCapResults, extLowResults] = await Promise.all([
        fetchFromCol('inventory', termCap, false),
        fetchFromCol('external_medicines', termCap, true),
        // Solo buscamos en minúscula si es diferente a capitalizado para ahorrar lecturas
        (termCap !== termLower) ? fetchFromCol('external_medicines', termLower, true) : Promise.resolve([])
    ]);

    // Unir y eliminar duplicados por ID
    const allResults = [...invResults, ...extCapResults, ...extLowResults];
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
            createdAt: new Date(),
            isExternal: true
        });
    } catch (e) {
        console.error("Error saving external med:", e);
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
