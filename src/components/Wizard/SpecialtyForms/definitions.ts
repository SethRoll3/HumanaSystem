import { SpecialtyFormDefinition } from './types';

export const SPECIALTY_FORMS: SpecialtyFormDefinition[] = [
    {
        id: 'epilepsy',
        name: 'Ficha Clínica de Epilepsia',
        specialties: ['Neurología', 'Epileptología', 'Neurofisiología'],
        sections: [
            {
                id: 'general_data',
                title: 'Datos Generales',
                fields: [
                    { id: 'education', label: 'Escolaridad', type: 'select', width: 'half', options: ['Analfabeta', 'Alfabeta no escolarizado', 'Primaria', 'Secundaria', 'Diversificado', 'Grado Universitario', 'Post-grado Universitario'] },
                    { id: 'gender', label: 'Género', type: 'radio', width: 'half', options: ['Masculino', 'Femenino'] },
                    { id: 'residence_muni', label: 'Municipio de residencia', type: 'text', width: 'half' },
                    { id: 'origin_muni', label: 'Municipio de origen', type: 'text', width: 'half' },
                    { id: 'nationality', label: 'Nacionalidad', type: 'text', width: 'half' },
                    { id: 'origin_country', label: 'País de origen', type: 'text', width: 'half' },
                ]
            },
            {
                id: 'alerts',
                title: 'Alertas y Factores de Riesgo',
                fields: [
                    { id: 'allergies', label: 'Alergias a fármacos', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'allergies_list', label: 'Lista de fármacos a los que es alérgico', type: 'text', width: 'full', conditional: { fieldId: 'allergies', value: 'Si' } },
                    { id: 'antiepileptic_allergy', label: 'Alergia a fármacos antiepilépticos', type: 'text', width: 'full' },
                    { id: 'cardio_risk', label: 'Riesgo Cardiovascular', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'sudep_risk', label: 'Riesgo SUDEP', type: 'radio', width: 'third', options: ['Si', 'No', 'Desconocido'] },
                ]
            },
            {
                id: 'history',
                title: 'Antecedentes',
                fields: [
                    { id: 'perinatal_history', label: 'Antecedentes Perinatales', type: 'textarea', width: 'full' },
                    { id: 'pathological_history', label: 'Antecedentes Patológicos', type: 'textarea', width: 'full' },
                    { id: 'family_history', label: 'Antecedentes Familiares', type: 'textarea', width: 'full' },
                ]
            }
        ]
    },
    {
        id: 'neuropsychology',
        name: 'Entrevista Neuropsicológica',
        specialties: ['Neuropsicología', 'Psicología'],
        sections: [
            {
                id: 'general_adults',
                title: 'Datos Generales (Adultos)',
                fields: [
                    { id: 'interview_date', label: 'Fecha de entrevista', type: 'date', width: 'third' },
                    { id: 'interviewer', label: 'Entrevistador', type: 'text', width: 'third' },
                    { id: 'informant', label: 'Informante', type: 'text', width: 'third' },
                    { id: 'patient_name', label: 'Nombre completo del paciente', type: 'text', width: 'full' },
                    { id: 'patient_age', label: 'Edad', type: 'number', width: 'third' },
                    { id: 'patient_gender', label: 'Género', type: 'radio', width: 'third', options: ['Femenino', 'Masculino'] },
                    { id: 'marital_status', label: 'Estado civil', type: 'select', width: 'third', options: ['Soltero', 'Casado', 'Unión libre', 'Separado', 'Divorciado', 'Viudo'] },
                    { id: 'birth_place_dept', label: 'Lugar de nacimiento (Depto)', type: 'text', width: 'half' },
                    { id: 'birth_place_muni', label: 'Lugar de nacimiento (Muni)', type: 'text', width: 'half' },
                    { id: 'education_level', label: 'Escolaridad', type: 'select', width: 'full', options: ['Pre escolar', 'Primaria', 'Secundaria', 'Diversificado', 'Técnico', 'Licenciatura', 'Especialidad', 'Maestría', 'Doctorado'] },
                    { id: 'education_title', label: 'Título obtenido', type: 'text', width: 'full', placeholder: 'Especifique el título del último grado' },
                    { id: 'school_years', label: 'Años de escolaridad', type: 'number', width: 'third' },
                    { id: 'occupation_current', label: 'Ocupación actual', type: 'text', width: 'third' },
                    { id: 'handedness', label: 'Lateralidad', type: 'select', width: 'third', options: ['Diestra', 'Zurda', 'Mixta'] },
                ]
            },
            {
                id: 'general_children',
                title: 'Datos Generales (Niños)',
                fields: [
                    { id: 'child_name', label: 'Nombre del niño', type: 'text', width: 'half' },
                    { id: 'child_age', label: 'Edad del niño', type: 'number', width: 'third' },
                    { id: 'child_gender', label: 'Género (niño)', type: 'radio', width: 'third', options: ['Femenino', 'Masculino'] },
                    { id: 'school_grade', label: 'Grado escolar actual', type: 'text', width: 'half' },
                    { id: 'school_name', label: 'Nombre del establecimiento', type: 'text', width: 'half' },
                ]
            },
            {
                id: 'clinical_history',
                title: 'Historia Clínica',
                fields: [
                    { id: 'referral_reason', label: 'Motivo de Consulta', type: 'textarea', width: 'full' },
                    { id: 'current_illness', label: 'Historia de la enfermedad actual', type: 'textarea', width: 'full' },
                    { id: 'previous_diagnoses', label: 'Diagnósticos previos relevantes', type: 'textarea', width: 'full' },
                    { id: 'neurological_history', label: 'Historia neurológica relevante', type: 'textarea', width: 'full' },
                ]
            },
            {
                id: 'perinatal_history',
                title: 'Historia Perinatal y Desarrollo',
                fields: [
                    { id: 'pregnancy_course', label: 'Curso del embarazo', type: 'textarea', width: 'full' },
                    { id: 'birth_complications', label: 'Complicaciones durante el parto', type: 'textarea', width: 'full' },
                    { id: 'early_development', label: 'Desarrollo psicomotor temprano', type: 'textarea', width: 'full' },
                    { id: 'school_history', label: 'Historia escolar y dificultades de aprendizaje', type: 'textarea', width: 'full' },
                ]
            },
            {
                id: 'current_symptoms',
                title: 'Síntomas y Cambios Cognitivos',
                fields: [
                    { id: 'current_symptoms_list', label: 'Síntomas que aquejan actualmente', type: 'textarea', width: 'full' },
                    { id: 'cognitive_changes', label: 'Cambios cognitivos recientes', type: 'textarea', width: 'full' },
                    { id: 'behavior_changes', label: 'Cambios conductuales o emocionales', type: 'textarea', width: 'full' },
                ]
            },
            {
                id: 'tests_and_scales',
                title: 'Tests y Cuestionarios Aplicados',
                fields: [
                    { id: 'screening_tests', label: 'Screening / Pruebas globales (ej. MMSE, MoCA)', type: 'textarea', width: 'full' },
                    { id: 'memory_tests', label: 'Pruebas de memoria aplicadas', type: 'textarea', width: 'full' },
                    { id: 'attention_tests', label: 'Pruebas de atención y funciones ejecutivas', type: 'textarea', width: 'full' },
                    { id: 'language_tests', label: 'Pruebas de lenguaje', type: 'textarea', width: 'full' },
                    { id: 'visuospatial_tests', label: 'Pruebas visoespaciales / construcción', type: 'textarea', width: 'full' },
                    { id: 'other_scales', label: 'Otras escalas y cuestionarios (ánimo, conducta, etc.)', type: 'textarea', width: 'full' },
                ]
            }
        ]
    },
    {
        id: 'movement_disorders',
        name: 'Trastornos del Movimiento',
        specialties: ['Neurología', 'Movimientos Anormales'],
        sections: [
            {
                id: 'general',
                title: 'Datos Generales',
                fields: [
                    { id: 'civil_status', label: 'Estado Civil', type: 'select', width: 'half', options: ['Soltero', 'Casado', 'Divorciado', 'Unido', 'Separado', 'Viudo'] },
                    { id: 'religion', label: 'Religión', type: 'select', width: 'half', options: ['Católico', 'Evangélico', 'Judío', 'Agnóstico', 'Otro'] },
                    { id: 'occupation', label: 'Ocupación', type: 'text', width: 'full' },
                    { id: 'retired', label: 'Jubilado', type: 'radio', width: 'half', options: ['Si', 'No', 'No aplica'] },
                ]
            },
            {
                id: 'clinical',
                title: 'Evaluación Clínica',
                fields: [
                    { id: 'onset_age', label: 'Edad de inicio de síntomas', type: 'number', width: 'third' },
                    { id: 'symptoms_progression', label: 'Progresión de síntomas', type: 'select', width: 'third', options: ['Lenta', 'Rápida', 'Estable', 'Fluctuante'] },
                    { id: 'family_history_movement', label: 'Antecedentes Familiares de Movimientos Anormales', type: 'textarea', width: 'full' },
                ]
            }
        ]
    },
    {
        id: 'general_anamnesis',
        name: 'Ficha General / Pediatría',
        specialties: ['Pediatría', 'Medicina General', 'Medicina Interna'],
        sections: [
            {
                id: 'personal_data',
                title: 'Datos Personales Extendidos',
                fields: [
                    { id: 'emergency_phones', label: 'Teléfonos Emergencia', type: 'text', width: 'half' },
                    { id: 'ethnicity', label: 'Etnia', type: 'select', width: 'half', options: ['Maya', 'Ladino', 'Xinca', 'Garífuna', 'Otro'] },
                    { id: 'address', label: 'Domicilio Completo', type: 'text', width: 'full' },
                    { id: 'email', label: 'Email', type: 'text', width: 'half' },
                    { id: 'companion', label: 'Nombre de quien lo acompaña', type: 'text', width: 'half' },
                    { id: 'referral_hospital', label: 'Hospital de Referencia', type: 'text', width: 'half' },
                    { id: 'treating_doctor', label: 'Médico que lo ha tratado', type: 'text', width: 'half' },
                    { id: 'referral_source', label: '¿Cómo se enteró de nosotros?', type: 'text', width: 'full' },
                ]
            },
            {
                id: 'birth_history',
                title: 'Antecedentes del Nacimiento',
                fields: [
                    { id: 'birth_type', label: '¿Cómo fue el nacimiento?', type: 'radio', width: 'full', options: ['Parto Normal (vaginal)', 'Cesárea'] },
                    { id: 'birth_complications', label: '¿Hubo complicaciones?', type: 'textarea', width: 'full' },
                ]
            }
        ]
    },
     {
        id: 'standard_neurology',
        name: 'Historia Clínica Estándar',
        specialties: ['default'], // Ficha por defecto
        sections: [
            {
                id: 'main_complaint',
                title: 'Motivo de Consulta',
                fields: [
                    { id: 'chief_complaint', label: 'Queja Principal', type: 'textarea', width: 'full' },
                    { id: 'duration', label: 'Tiempo de evolución', type: 'text', width: 'half' },
                ]
            },
            {
                id: 'system_review',
                title: 'Revisión por Sistemas',
                fields: [
                    { id: 'neuro', label: 'Neurológico', type: 'textarea', width: 'full' },
                    { id: 'cardio', label: 'Cardiovascular', type: 'text', width: 'half' },
                    { id: 'respiratory', label: 'Respiratorio', type: 'text', width: 'half' },
                ]
            }
        ]
    }
];
