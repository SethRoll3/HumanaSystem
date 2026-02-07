import { SpecialtyFormDefinition } from '../components/Wizard/SpecialtyForms/types';

export const SPECIALTY_LABEL_MAP: Record<string, string> = {
    // --- DATOS GENERALES Y PERSONALES ---
    'education': 'Escolaridad',
    'gender': 'Género',
    'residence_muni': 'Municipio de residencia',
    'origin_muni': 'Municipio de origen',
    'nationality': 'Nacionalidad',
    'origin_country': 'País de origen',
    'civil_status': 'Estado Civil',
    'marital_status': 'Estado Civil',
    'religion': 'Religión',
    'occupation': 'Ocupación',
    'occupation_current': 'Ocupación actual',
    'retired': 'Jubilado',
    'interview_date': 'Fecha de entrevista',
    'interviewer': 'Entrevistador',
    'informant': 'Informante',
    'patient_name': 'Nombre completo del paciente',
    'patient_age': 'Edad',
    'patient_gender': 'Género',
    'birth_place_dept': 'Lugar de nacimiento (Depto)',
    'birth_place_muni': 'Lugar de nacimiento (Muni)',
    'education_level': 'Escolaridad',
    'education_title': 'Título obtenido',
    'school_years': 'Años de escolaridad',
    'handedness': 'Lateralidad',
    'ethnicity': 'Etnia',
    'address': 'Domicilio Completo',
    'email': 'Email',
    'emergency_phones': 'Teléfonos de Emergencia',
    'companion': 'Acompañante',
    'referral_hospital': 'Hospital de Referencia',
    'treating_doctor': 'Médico Tratante',
    'referral_source': 'Fuente de Referencia',

    // --- NIÑOS / PEDIATRÍA ---
    'child_name': 'Nombre del niño',
    'child_age': 'Edad del niño',
    'child_gender': 'Género del niño',
    'school_grade': 'Grado escolar',
    'school_name': 'Nombre del establecimiento',
    'birth_type': 'Tipo de nacimiento',
    'early_development': 'Desarrollo psicomotor temprano',
    'school_history': 'Historia escolar',

    // --- HISTORIA CLÍNICA Y ANTECEDENTES ---
    'referral_reason': 'Motivo de Consulta',
    'chief_complaint': 'Queja Principal',
    'current_illness': 'Historia de la enfermedad actual',
    'previous_diagnoses': 'Diagnósticos previos',
    'neurological_history': 'Historia neurológica',
    'perinatal_history': 'Antecedentes Perinatales',
    'pathological_history': 'Antecedentes Patológicos',
    'family_history': 'Antecedentes Familiares',
    'family_history_movement': 'Antecedentes de Movimientos Anormales',
    'pregnancy_course': 'Curso del embarazo',
    'birth_complications': 'Complicaciones del parto',
    'duration': 'Tiempo de evolución',

    // --- SÍNTOMAS Y REVISIÓN POR SISTEMAS ---
    'current_symptoms_list': 'Síntomas actuales',
    'cognitive_changes': 'Cambios cognitivos',
    'behavior_changes': 'Cambios conductuales',
    'neuro': 'Revisión Neurológica',
    'cardio': 'Revisión Cardiovascular',
    'respiratory': 'Revisión Respiratoria',

    // --- ALERTAS Y RIESGOS ---
    'allergies': 'Alergias a fármacos',
    'allergies_list': 'Lista de alergias',
    'antiepileptic_allergy': 'Alergia a antiepilépticos',
    'cardio_risk': 'Riesgo Cardiovascular',
    'sudep_risk': 'Riesgo SUDEP',

    // --- PRUEBAS Y EVALUACIONES ---
    'screening_tests': 'Pruebas de Screening',
    'memory_tests': 'Pruebas de memoria',
    'attention_tests': 'Pruebas de atención/ejecutivas',
    'language_tests': 'Pruebas de lenguaje',
    'visuospatial_tests': 'Pruebas visoespaciales',
    'other_scales': 'Otras escalas',
    'onset_age': 'Edad de inicio',
    'symptoms_progression': 'Progresión de síntomas'
};

/**
 * Traduce un ID de campo de ficha al español usando el diccionario maestro.
 * Si no lo encuentra, busca en las definiciones de fichas cargadas.
 */
export const translateSpecialtyLabel = (
    key: string, 
    forms?: SpecialtyFormDefinition[], 
    formId?: string
): string => {
    const normalizedKey = key.replace(/^specialtyData\./, '').trim();
    const lowerKey = normalizedKey.toLowerCase();
    
    // 1. Prioridad Máxima: Diccionario Manual (Corrigiendo errores históricos)
    if (SPECIALTY_LABEL_MAP[lowerKey]) {
        return SPECIALTY_LABEL_MAP[lowerKey];
    }

    // 2. Segunda Prioridad: Buscar en definiciones de fichas (Soporta campos nuevos del admin panel)
    if (forms && forms.length > 0) {
        const formsToSearch = formId ? forms.filter(f => f.id === formId) : forms;
        for (const form of formsToSearch) {
            for (const section of form.sections) {
                const found = section.fields.find(f => f.id === normalizedKey);
                if (found) return found.label;
            }
        }
    }

    // 3. Tercera Prioridad: Formateo inteligente (Fallback)
    let label = normalizedKey
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/\s+/g, ' ')
        .trim();

    const commonTranslations: Record<string, string> = {
        'history': 'Historia',
        'tests': 'Pruebas',
        'changes': 'Cambios',
        'status': 'Estado',
        'level': 'Nivel',
        'name': 'Nombre',
        'age': 'Edad',
        'gender': 'Género',
        'date': 'Fecha',
        'current': 'Actual',
        'previous': 'Previo',
        'reason': 'Motivo',
        'type': 'Tipo',
        'notes': 'Notas',
        'description': 'Descripción',
        'result': 'Resultado',
        'grade': 'Grado',
        'school': 'Escuela/Colegio',
        'birth': 'Nacimiento',
        'complications': 'Complicaciones'
    };

    Object.entries(commonTranslations).forEach(([en, es]) => {
        const regex = new RegExp(`\\b${en}\\b`, 'gi');
        label = label.replace(regex, es);
    });

    return label.charAt(0).toUpperCase() + label.slice(1);
};
