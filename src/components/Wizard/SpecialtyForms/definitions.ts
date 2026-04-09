import { SpecialtyFormDefinition } from './types';

export const SPECIALTY_FORMS: SpecialtyFormDefinition[] = [
    {
        id: 'epilepsy',
        name: 'Ficha de Epilepsia',
        specialties: ['Neurología', 'Epilepsia', 'Epileptología', 'Neurofisiología'],
        sections: [
            {
                id: 'perinatal_epilepsia',
                title: 'Gestación y Alumbramiento del paciente',
                fields: [
                    { id: 'embarazo_problemas', label: '¿Tuvo problemas durante el embarazo? ¿Cuáles fueron?', type: 'textarea', width: 'full' },
                    { id: 'nacimiento_tipo', label: '¿Cómo fue el nacimiento?', type: 'radio', width: 'half', options: ['Parto', 'Cesárea'] },
                    { id: 'parto_complicaciones', label: '¿Hubo complicaciones durante el parto? ¿Cuáles fueron?', type: 'textarea', width: 'full' },
                    { id: 'peso_nacer', label: 'Peso al nacer', type: 'number', width: 'third' },
                    { id: 'talla_nacer', label: 'Talla al nacer', type: 'number', width: 'third' },
                    { id: 'enfermedad_nacer', label: '¿Presentó alguna enfermedad al nacer?', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'enfermedad_nacer_detalle', label: '¿Cuáles fueron?', type: 'text', width: 'full', conditional: { fieldId: 'enfermedad_nacer', value: 'Si' } }
                ]
            },
            {
                id: 'ninez_epilepsia',
                title: 'Niñez del paciente',
                fields: [
                    { id: 'crisis_fiebre', label: '¿Presentó convulsión o crisis con fiebre?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'crisis_fiebre_edad', label: 'En caso de ser "SI" ¿a qué edad fue?', type: 'number', width: 'half', conditional: { fieldId: 'crisis_fiebre', value: 'Si' } },
                    { id: 'crisis_fiebre_duracion', label: '¿Cuánto duró la(s) convulsión(es) o crisis con fiebre?', type: 'text', width: 'half', conditional: { fieldId: 'crisis_fiebre', value: 'Si' } },
                    { id: 'crisis_fiebre_tipo', label: '¿Cómo fueron las crisis?', type: 'radio', width: 'half', options: ['Todo el cuerpo', 'Solo una parte del cuerpo'], conditional: { fieldId: 'crisis_fiebre', value: 'Si' } }
                ]
            },
            {
                id: 'hitos_desarrollo_epilepsia',
                title: 'Hitos de desarrollo',
                fields: [
                    { id: 'edad_camino', label: '¿A qué edad caminó por primera vez?', type: 'number', width: 'third' },
                    { id: 'edad_hablo', label: '¿A qué edad dijo sus primeras palabras?', type: 'number', width: 'third' },
                    { id: 'edad_bano', label: '¿A qué edad aprendió a ir al baño solo?', type: 'number', width: 'third' }
                ]
            },
            {
                id: 'escolaridad_epilepsia',
                title: 'Escolaridad',
                fields: [
                    { id: 'grado_academico', label: 'Grado académico', type: 'select', width: 'half', options: ['No sabe leer ni escribir', 'Preprimaria', 'Primaria', 'Básicos', 'Diversificado', 'Universitario'] },
                    { id: 'rendimiento_escolar', label: 'Rendimiento escolar', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'] },
                    { id: 'promedio_notas', label: 'Promedio de notas', type: 'number', width: 'half' },
                    { id: 'ultimo_grado', label: 'Último grado cursado', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'antecedentes_personales_epilepsia',
                title: 'Antecedentes Personales',
                fields: [
                    { id: 'dedicacion_actual', label: '¿A qué se dedica actualmente?', type: 'select', width: 'half', options: ['Estudiar', 'Trabajo', 'Otra'] },
                    { id: 'rendimiento_estudio', label: 'Si estudia, ¿cómo es el rendimiento académico?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'], conditional: { fieldId: 'dedicacion_actual', value: 'Estudiar' } },
                    { id: 'rendimiento_trabajo', label: 'Si trabaja, ¿cómo es Ud. en el trabajo?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'], conditional: { fieldId: 'dedicacion_actual', value: 'Trabajo' } },
                    { id: 'sintomas_psiquicos', label: '¿Ha presentado alguno de los siguientes síntomas?', type: 'checkbox', width: 'full', options: ['Depresión', 'Psicosis', 'Angustia', 'Irritabilidad', 'Ansiedad', 'Estrés'] },
                    { id: 'otra_enfermedad', label: '¿Tiene Ud. alguna otra enfermedad o problema de salud? ¿Cuáles?', type: 'textarea', width: 'full' },
                    { id: 'medicamento_diario', label: '¿Toma algún medicamento diario?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'medicamento_diario_detalle', label: '¿Cuáles?', type: 'text', width: 'half', conditional: { fieldId: 'medicamento_diario', value: 'Si' } },
                    { id: 'problemas_dormir', label: '¿Tiene problemas para dormir?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'horas_dormir', label: '¿Cuántas horas duerme?', type: 'number', width: 'half' },
                    { id: 'ronca', label: '¿Ronca?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'consume_alcohol', label: 'Consume alcohol', type: 'radio', width: 'half', options: ['Si', 'No', 'Eventualmente, social'] },
                    { id: 'fuma', label: 'Fuma', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'conduce', label: '¿Conduce automóviles?', type: 'radio', width: 'half', options: ['Si', 'No'] }
                ]
            },
            {
                id: 'riesgo_epilepsia',
                title: 'Antecedentes Generales',
                fields: [
                    { id: 'traumatismo_craneano', label: '¿Tuvo algún traumatismo craneano?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'traumatismo_detalle', label: 'Especifique edad y características del accidente', type: 'text', width: 'full', conditional: { fieldId: 'traumatismo_craneano', value: 'Si' } },
                    { id: 'infeccion_snc', label: '¿Tuvo alguna infección del sistema nervioso?', type: 'checkbox', width: 'full', options: ['Meningitis', 'Meningoencefalitis', 'Parásitos'] },
                    { id: 'antecedentes_epilepsia_familia', label: '¿Antecedentes de epilepsia en la familia?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'antecedentes_enfermedades_familia', label: '¿Antecedentes de enfermedades en la familia?', type: 'text', width: 'half' },
                    { id: 'familiares_detalle', label: 'En caso de ser "SI" explique qué familiares', type: 'text', width: 'full', conditional: { fieldId: 'antecedentes_epilepsia_familia', value: 'Si' } }
                ]
            },
            {
                id: 'primera_crisis',
                title: 'Historia de Crisis',
                fields: [
                    { id: 'edad_primera_crisis', label: '¿A qué edad fue la primera crisis y en qué año fue?', type: 'text', width: 'full' },
                    { id: 'como_primera_crisis', label: '¿Cómo fue la primera crisis?', type: 'textarea', width: 'full' },
                    { id: 'crisis_serie', label: '¿Ha presentado crisis en serie, estatus o estado epiléptico?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'crisis_serie_detalle', label: 'Especificar edad y contexto clínico', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'semiologia_crisis',
                title: 'Tipo de Crisis',
                fields: [
                    { id: 'tipos_crisis', label: '¿Cuántos tipos diferentes de crisis presenta Ud?', type: 'number', width: 'half' },
                    { id: 'aura', label: 'Aura (sensación o aviso de que va a venir la crisis)', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'aura_detalle', label: 'Detalle de aura', type: 'text', width: 'full', conditional: { fieldId: 'aura', value: 'Si' } },
                    { id: 'crisis_focal', label: 'Focal (afecta solo una parte del cuerpo)', type: 'checkbox', width: 'full', options: ['Mov. Chupeteo', 'Mov. Automáticos', 'Mov. De búsqueda', 'Se amarra los zapatos', 'Se desnuda', 'Se desconecta', 'Pierde conciencia', 'Generalizada', 'Atónica', 'Ausencia', 'Tonicoclínica'] },
                    { id: 'descripcion_crisis', label: 'Breve descripción de la crisis', type: 'textarea', width: 'full' },
                    { id: 'factores_desencadenantes', label: 'Factores que desencadenan las crisis', type: 'checkbox', width: 'full', options: ['Durmiendo', 'Por trasnochas', 'Por ruidos fuertes', 'Ejercicio', 'Despierto', 'Por luces', 'Por fiebre', 'Por leer', 'Estando solo', 'Por estrés', 'Por comer', 'Por ingesta de alcohol', 'Con mucha gente', 'Tiene relación con el ciclo menstrual'] },
                    { id: 'duracion_crisis', label: '¿Cuánto duran las crisis?', type: 'text', width: 'half' },
                    { id: 'frecuencia_crisis', label: '¿Qué frecuencia de crisis presenta?', type: 'text', width: 'half' },
                    { id: 'tiempo_libre_crisis', label: '¿Cuánto tiempo ha estado libre de crisis?', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'historia_tratamiento_epilepsia',
                title: 'Historia del Tratamiento',
                fields: [
                    { id: 'inicio_tratamiento', label: '¿Cuándo comenzó el tratamiento? (edad y año)', type: 'text', width: 'full' },
                    { id: 'cambio_medicamento', label: '¿Por qué ha cambiado de medicamento?', type: 'checkbox', width: 'full', options: ['Muy caro', 'Seguía con crisis', 'Efecto adverso'] },
                    { id: 'efectos_secundarios', label: '¿Ha presentado problemas con los fármacos (efectos secundarios)?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'efectos_secundarios_detalle', label: 'En caso de ser "SI" ¿Cuáles?', type: 'text', width: 'half', conditional: { fieldId: 'efectos_secundarios', value: 'Si' } }
                ]
            },
            {
                id: 'tratamiento_antiepileptico_epilepsia',
                title: 'Tratamiento Antiepiléptico',
                fields: [
                    { id: 'cantidad_farmacos', label: '¿Cuántos fármacos toma actualmente?', type: 'radio', width: 'half', options: ['1 fármaco', '2 fármacos', '3 o más fármacos'] },
                    { id: 'farmacos_actuales', label: '¿Qué medicamentos recibe actualmente?', type: 'checkbox', width: 'full', options: ['Ácido valproico', 'Carbamazepina', 'Clobazam', 'Clonazepam', 'Fenobarbital', 'Fenitoína', 'Gabapentina', 'Lamotrigina', 'Levetiracetam'] }
                ]
            },
            {
                id: 'tratamientos_previos_epilepsia',
                title: 'Tratamientos antiepilépticos previos',
                fields: [
                    { id: 'farmacos_previos', label: '¿Qué medicamentos ha tomado antes?', type: 'textarea', width: 'full' }
                ]
            },
            {
                id: 'examenes_epilepsia',
                title: 'Exámenes',
                fields: [
                    { id: 'examenes_realizados', label: '¿Qué exámenes se ha realizado? (fecha y resultado)', type: 'textarea', width: 'full' },
                    { id: 'examenes_lista', label: 'Marque los exámenes realizados', type: 'checkbox', width: 'full', options: ['EEG', 'Scanner cerebral', 'RMN', 'PET', 'SPECT', 'TAC', 'Otro'] }
                ]
            }
        ]
    },
    {
        id: 'columna',
        name: 'Ficha de Columna',
        specialties: ['Columna'],
        sections: [
            {
                id: 'perinatal_columna',
                title: 'Antecedentes prenatales y perinatales',
                fields: [
                    { id: 'embarazo_problemas', label: '¿Tuvo problemas durante el embarazo?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'embarazo_problemas_detalle', label: '¿Cuáles fueron?', type: 'textarea', width: 'full', conditional: { fieldId: 'embarazo_problemas', value: 'Si' } },
                    { id: 'nacimiento_tipo', label: '¿Cómo fue el nacimiento?', type: 'radio', width: 'half', options: ['Parto', 'Cesárea'] },
                    { id: 'parto_complicaciones', label: '¿Hubo complicaciones durante el parto?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'parto_complicaciones_detalle', label: '¿Cuáles fueron?', type: 'textarea', width: 'full', conditional: { fieldId: 'parto_complicaciones', value: 'Si' } },
                    { id: 'peso_nacer', label: 'Peso al nacer', type: 'number', width: 'third' },
                    { id: 'talla_nacer', label: 'Talla al nacer', type: 'number', width: 'third' },
                    { id: 'enfermedad_nacer', label: '¿Presentó alguna enfermedad al nacer?', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'enfermedad_nacer_detalle', label: '¿Cuáles fueron?', type: 'textarea', width: 'full', conditional: { fieldId: 'enfermedad_nacer', value: 'Si' } },
                    { id: 'edad_camino', label: 'Edad a la que caminó por primera vez', type: 'number', width: 'third' },
                    { id: 'edad_hablo', label: 'Edad a la que dijo sus primeras palabras', type: 'number', width: 'third' },
                    { id: 'edad_bano', label: 'Edad a la que fue al baño solo', type: 'number', width: 'third' }
                ]
            },
            {
                id: 'escolaridad_columna',
                title: 'Escolaridad',
                fields: [
                    { id: 'grado_academico', label: 'Grado académico', type: 'select', width: 'half', options: ['No sabe leer ni escribir', 'Preprimaria', 'Primaria', 'Básicos', 'Diversificado', 'Universitario'] },
                    { id: 'rendimiento_escolar', label: 'Rendimiento escolar', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'] },
                    { id: 'promedio_notas', label: 'Promedio de notas', type: 'number', width: 'half' },
                    { id: 'ultimo_grado', label: 'Último grado cursado', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'antecedentes_personales_columna',
                title: 'Antecedentes personales generales',
                fields: [
                    { id: 'dedicacion_actual', label: '¿A qué se dedica actualmente?', type: 'select', width: 'half', options: ['Estudiar', 'Trabajo', 'Otra'] },
                    { id: 'rendimiento_estudio', label: 'Si estudia, ¿cómo es el rendimiento académico?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'], conditional: { fieldId: 'dedicacion_actual', value: 'Estudiar' } },
                    { id: 'promedio_notas_estudio', label: 'Promedio de notas', type: 'number', width: 'half', conditional: { fieldId: 'dedicacion_actual', value: 'Estudiar' } },
                    { id: 'estudios_superiores', label: 'Estudios Superiores', type: 'text', width: 'half', conditional: { fieldId: 'dedicacion_actual', value: 'Estudiar' } },
                    { id: 'repitencia_estudio', label: '¿Hay repitencias?', type: 'radio', width: 'half', options: ['Si', 'No'], conditional: { fieldId: 'dedicacion_actual', value: 'Estudiar' } },
                    { id: 'rendimiento_trabajo', label: 'Si trabaja, ¿cómo es Ud. en el trabajo?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular', 'Malo'], conditional: { fieldId: 'dedicacion_actual', value: 'Trabajo' } },
                    { id: 'sintomas_psiquicos', label: '¿Ha presentado alguno de los siguientes síntomas?', type: 'checkbox', width: 'full', options: ['Depresión', 'Psicosis', 'Angustia', 'Irritabilidad', 'Ansiedad', 'Estrés'] },
                    { id: 'otra_enfermedad', label: '¿Tiene Ud. alguna otra enfermedad o problema de salud? ¿Cuáles?', type: 'textarea', width: 'full' },
                    { id: 'medicamento_diario', label: '¿Toma algún medicamento diario?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'medicamento_diario_detalle', label: '¿Qué medicamento toma?', type: 'textarea', width: 'full', conditional: { fieldId: 'medicamento_diario', value: 'Si' } },
                    { id: 'problemas_dormir', label: 'Tiene problemas para dormir', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'horas_dormir', label: '¿Cuántas horas duerme?', type: 'number', width: 'half' },
                    { id: 'ronca', label: '¿Ronca?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'consume_alcohol', label: 'Consume alcohol', type: 'radio', width: 'half', options: ['Si', 'No', 'Eventualmente, social'] },
                    { id: 'fuma', label: 'Fuma', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'conduce', label: '¿Conduce automóviles?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'caida_importancia', label: 'Ha sufrido alguna caída de importancia', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'paresia_parestesia', label: 'Presenta alguna paresia / parestesia en cualquiera de sus extremidades', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'accidente_alto_impacto', label: 'Ha tenido algún accidente de alto impacto', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'problema_actual', label: 'Descripción del problema actual', type: 'textarea', width: 'full' },
                    { id: 'tratamiento', label: 'Tratamiento', type: 'radio', width: 'full', options: ['Un fármaco', '2 fármacos', '3 fármacos'] }
                ]
            }
        ]
    },
    {
        id: 'parkinson',
        name: 'Ficha de Parkinson',
        specialties: ['Parkinson'],
        sections: [
            {
                id: 'problema_actual_parkinson',
                title: 'Breve descripción del problema actual',
                fields: [
                    { id: 'problema_actual', label: 'Descripción breve', type: 'textarea', width: 'full' }
                ]
            },
            {
                id: 'antecedentes_patologicos',
                title: 'Antecedentes patológicos',
                fields: [
                    { id: 'antecedentes_medicos', label: 'Signos Vitales', type: 'text', width: 'full' },
                    { id: 'antecedentes_quirurgicos', label: 'Antecedentes Quirúrgicos', type: 'text', width: 'full' },
                    { id: 'antecedentes_alergicos', label: 'Antecedentes Alérgicos', type: 'text', width: 'full' },
                    { id: 'antecedentes_traumaticos', label: 'Antecedentes Traumáticos', type: 'text', width: 'full' },
                    { id: 'antecedentes_familiares', label: 'Antecedentes Familiares', type: 'text', width: 'full' }
                ]
            },
            {
                id: 'factores_riesgo_parkinson',
                title: '3. Factores de riesgo para enfermedad de Parkinson',
                fields: [
                    { id: 'pesticidas', label: 'Exposición crónica a pesticidas', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'disolventes', label: 'Exposición ocupacional a disolventes', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'cafeina', label: 'Consumo de cafeína', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'tazas_cafe', label: '¿Cuántas tazas de café al día?', type: 'number', width: 'half', conditional: { fieldId: 'cafeina', value: 'Si' } },
                    { id: 'fumador_estado', label: 'Fumador', type: 'select', width: 'half', options: ['Activo', 'Nunca', 'Exfumador'] },
                    { id: 'fumador_cigarrillos', label: 'No. de cigarrillos al día', type: 'number', width: 'half', conditional: { fieldId: 'fumador_estado', value: 'Activo' } },
                    { id: 'fumador_anos', label: 'Años de fumar', type: 'number', width: 'half', conditional: { fieldId: 'fumador_estado', value: 'Activo' } },
                    { id: 'exfumador_cigarrillos', label: 'No. de cigarrillos al día (exfumador)', type: 'number', width: 'half', conditional: { fieldId: 'fumador_estado', value: 'Exfumador' } },
                    { id: 'exfumador_anos', label: 'Años de fumar (exfumador)', type: 'number', width: 'half', conditional: { fieldId: 'fumador_estado', value: 'Exfumador' } },
                    { id: 'familia_parkinson', label: 'Familiar de primer grado con enfermedad de Parkinson', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'familia_trastorno_mov', label: 'Familiar de primer grado con trastorno del movimiento', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'trauma_craneo', label: 'Trauma craneoencefálico que requirió hospitalización', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'trauma_tiempo', label: '¿Hace cuánto tiempo?', type: 'text', width: 'half', conditional: { fieldId: 'trauma_craneo', value: 'Si' } },
                    { id: 'lacteos', label: 'Consumo de lácteos', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'alcohol_estado', label: 'Consumo de alcohol', type: 'select', width: 'half', options: ['Nunca', 'Exbebedor', 'Activo'] },
                    { id: 'alcohol_activo_bebidas_dia', label: 'No. de bebidas al día (activo)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Activo' } },
                    { id: 'alcohol_activo_anos_beber', label: 'Años de beber (activo)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Activo' } },
                    { id: 'alcohol_exbebedor_bebidas_semana', label: 'No. de bebidas a la semana (exbebedor)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Exbebedor' } },
                    { id: 'alcohol_exbebedor_anos_beber', label: 'Años de beber (exbebedor)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Exbebedor' } },
                    { id: 'alcohol_exbebedor_anos_sobrio', label: 'Años sobrio (exbebedor)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Exbebedor' } },
                    { id: 'deportes_contacto', label: 'Antecedente de realizar deportes de contacto', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'deportes_cual', label: '¿Qué deporte?', type: 'text', width: 'half', conditional: { fieldId: 'deportes_contacto', value: 'Si' } },
                    { id: 'deportes_tiempo', label: '¿Cuánto tiempo lo practicó?', type: 'text', width: 'half', conditional: { fieldId: 'deportes_contacto', value: 'Si' } }
                ]
            },
            {
                id: 'diagnostico_previo',
                title: '4. Diagnóstico',
                fields: [
                    { id: 'diagnostico_tiempo', label: '¿Hace cuánto tiempo le diagnosticaron Enfermedad de Parkinson?', type: 'text', width: 'full' }
                ]
            },
            {
                id: 'info_tratamiento_parkinson',
                title: 'Información sobre tratamiento para Parkinson',
                fields: [
                    { id: 'cantidad_farmacos_parkinson', label: 'Número de fármacos', type: 'radio', width: 'full', options: ['Un fármaco', '2 fármacos', '3 o más fármacos'] }
                ]
            },
            {
                id: 'tratamiento_actual',
                title: 'Tratamiento actual',
                fields: [
                    { id: 'levodopa_carbidopa_dosis', label: 'Levodopa/carbidopa - Dosis', type: 'text', width: 'half' },
                    { id: 'levodopa_carbidopa_lp_dosis', label: 'Levodopa/carbidopa LP - Dosis', type: 'text', width: 'half' },
                    { id: 'levodopa_benserazida_dosis', label: 'Levodopa/benserazida - Dosis', type: 'text', width: 'half' },
                    { id: 'selegilina_dosis', label: 'Selegilina - Dosis', type: 'text', width: 'half' },
                    { id: 'rasagilina_dosis', label: 'Rasagilina - Dosis', type: 'text', width: 'half' },
                    { id: 'biperideno_dosis', label: 'Biperideno - Dosis', type: 'text', width: 'half' },
                    { id: 'pramipexol_dosis', label: 'Pramipexol - Dosis', type: 'text', width: 'half' },
                    { id: 'rotigotina_dosis', label: 'Rotigotina - Dosis', type: 'text', width: 'half' },
                    { id: 'tolcapone_dosis', label: 'Tolcapone - Dosis', type: 'text', width: 'half' },
                    { id: 'entacapona_dosis', label: 'Entacapona - Dosis', type: 'text', width: 'half' },
                    { id: 'ropinirol_dosis', label: 'Ropinirol - Dosis', type: 'text', width: 'half' },
                    { id: 'trihexifenidilo_dosis', label: 'Trihexifenidilo - Dosis', type: 'text', width: 'half' },
                    { id: 'apoformina_dosis', label: 'Apoformina - Dosis', type: 'text', width: 'half' },
                    { id: 'otro_tratamiento_actual', label: 'Otro (actual)', type: 'text', width: 'half' },
                    { id: 'otro_tratamiento_actual_dosis', label: 'Dosis (otro actual)', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'tratamiento_previo',
                title: 'Tratamiento anterior para Parkinson',
                fields: [
                    { id: 'prev_levodopa_carbidopa_dosis', label: 'Levodopa/carbidopa - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_levodopa_carbidopa_lp_dosis', label: 'Levodopa/carbidopa LP - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_levodopa_benserazida_dosis', label: 'Levodopa/benserazida - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_selegilina_dosis', label: 'Selegilina - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_rasagilina_dosis', label: 'Rasagilina - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_biperideno_dosis', label: 'Biperideno - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_pramipexol_dosis', label: 'Pramipexol - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_rotigotina_dosis', label: 'Rotigotina - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_tolcapone_dosis', label: 'Tolcapone - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_entacapona_dosis', label: 'Entacapona - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_ropinirol_dosis', label: 'Ropinirol - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_trihexifenidilo_dosis', label: 'Trihexifenidilo - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_apoformina_dosis', label: 'Apoformina - Dosis', type: 'text', width: 'half' },
                    { id: 'prev_otro_tratamiento', label: 'Otro (previo)', type: 'text', width: 'half' },
                    { id: 'prev_otro_tratamiento_dosis', label: 'Dosis (otro previo)', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'sintomas_no_motores',
                title: '5. Síntomas no motores de Parkinson',
                fields: [
                    { id: 'sueno_alteracion', label: 'Alteración del sueño', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'sueno_horas', label: '¿Cuántas horas duerme por las noches?', type: 'number', width: 'half', conditional: { fieldId: 'sueno_alteracion', value: 'Si' } },
                    { id: 'sueno_tratamiento', label: 'Tratamiento', type: 'text', width: 'half', conditional: { fieldId: 'sueno_alteracion', value: 'Si' } },
                    { id: 'psiquiatrico_alteracion', label: 'Alteraciones psiquiátricas', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'psiquiatrico_cual', label: '¿Cuál?', type: 'text', width: 'half', conditional: { fieldId: 'psiquiatrico_alteracion', value: 'Si' } },
                    { id: 'psiquiatrico_depresion', label: 'Síntomas de depresión', type: 'text', width: 'half', conditional: { fieldId: 'psiquiatrico_alteracion', value: 'Si' } },
                    { id: 'psiquiatrico_tratamiento', label: 'Tratamiento', type: 'text', width: 'half', conditional: { fieldId: 'psiquiatrico_alteracion', value: 'Si' } },
                    { id: 'dolor_cronico', label: 'Dolor crónico', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'dolor_descripcion', label: 'Descripción', type: 'text', width: 'half', conditional: { fieldId: 'dolor_cronico', value: 'Si' } },
                    { id: 'memoria_problemas', label: 'Problemas de memoria', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'memoria_tratamiento', label: 'Tratamiento', type: 'text', width: 'half', conditional: { fieldId: 'memoria_problemas', value: 'Si' } },
                    { id: 'estrenimiento', label: 'Estreñimiento', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'estrenimiento_tratamiento', label: 'Tratamiento', type: 'text', width: 'half', conditional: { fieldId: 'estrenimiento', value: 'Si' } },
                    { id: 'perdida_olfato', label: 'Pérdida de olfato', type: 'radio', width: 'half', options: ['Si', 'No'] }
                ]
            }
        ]
    },
    {
        id: 'neurologica',
        name: 'Ficha Neurológica',
        specialties: ['Neurológica'],
        sections: [
            {
                id: 'perinatal_neuro',
                title: 'Gestación y alumbramiento del paciente',
                fields: [
                    { id: 'embarazo_problemas_neuro', label: '¿Tuvo problemas durante el embarazo?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'parto_complicaciones_neuro', label: '¿Hubo complicaciones durante el parto?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'parto_complicaciones_detalle_neuro', label: '¿Cuáles fueron?', type: 'textarea', width: 'full', conditional: { fieldId: 'parto_complicaciones_neuro', value: 'Si' } },
                    { id: 'apgar_nacer_neuro', label: 'APGAR al nacer (1-10)', type: 'number', width: 'third' },
                    { id: 'enfermedad_nacer_neuro', label: '¿Presentó alguna enfermedad al nacer?', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'enfermedad_nacer_detalle_neuro', label: '¿Cuáles fueron?', type: 'textarea', width: 'third', conditional: { fieldId: 'enfermedad_nacer_neuro', value: 'Si' } }
                ]
            },
            {
                id: 'ninez_neuro',
                title: 'Niñez del paciente',
                fields: [
                    { id: 'crisis_fiebre_neuro', label: '¿Presentó convulsión o crisis con fiebre?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'crisis_fiebre_edad_neuro', label: '¿A qué edad fue? (1-100)', type: 'number', width: 'half', conditional: { fieldId: 'crisis_fiebre_neuro', value: 'Si' } },
                    { id: 'duracion_convulsiones_min_neuro', label: '¿Cuánto duraron las convulsiones? (minutos)', type: 'number', width: 'half', conditional: { fieldId: 'crisis_fiebre_neuro', value: 'Si' } },
                    { id: 'duracion_convulsiones_seg_neuro', label: '¿Cuánto duraron las convulsiones? (segundos)', type: 'number', width: 'half', conditional: { fieldId: 'crisis_fiebre_neuro', value: 'Si' } },
                    { id: 'tipo_crisis_ninez_neuro', label: 'Las crisis fueron', type: 'radio', width: 'half', options: ['Todo el cuerpo', 'Parte del cuerpo'], conditional: { fieldId: 'crisis_fiebre_neuro', value: 'Si' } },
                    { id: 'desarrollo_neurologico_neuro', label: '¿Cómo fue el desarrollo neurológico?', type: 'radio', width: 'half', options: ['Normal', 'Anormal'] },
                    { id: 'desarrollo_neurologico_detalle_neuro', label: 'Si fue anormal explique por qué', type: 'textarea', width: 'full', conditional: { fieldId: 'desarrollo_neurologico_neuro', value: 'Anormal' } }
                ]
            },
            {
                id: 'escolaridad_neuro',
                title: 'Escolaridad',
                fields: [
                    { id: 'repitencia_neuro', label: 'Repitencia', type: 'radio', width: 'half', options: ['Si', 'No'] }
                ]
            },
            {
                id: 'antecedentes_personales_neuro',
                title: 'Antecedentes personales',
                fields: [
                    { id: 'trauma_craneo_neuro', label: '¿Tuvo algún traumatismo craneoencefálico?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'trauma_craneo_detalle_neuro', label: 'En caso de que sí, especificar', type: 'textarea', width: 'full', conditional: { fieldId: 'trauma_craneo_neuro', value: 'Si' } },
                    { id: 'infeccion_sistema_nervioso_neuro', label: '¿Tuvo alguna infección del sistema nervioso?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'infeccion_sistema_nervioso_detalle_neuro', label: 'En caso de ser sí explique', type: 'textarea', width: 'full', conditional: { fieldId: 'infeccion_sistema_nervioso_neuro', value: 'Si' } },
                    { id: 'epilepsia_familia_neuro', label: '¿Antecedentes de epilepsia en la familia?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'epilepsia_familia_detalle_neuro', label: 'En caso de ser sí explique qué familiares', type: 'textarea', width: 'full', conditional: { fieldId: 'epilepsia_familia_neuro', value: 'Si' } },
                    { id: 'enfermedades_mentales_familia_neuro', label: '¿Antecedentes de enfermedades mentales en la familia?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'enfermedades_mentales_familia_detalle_neuro', label: 'En caso de ser sí explique qué familiares y cuáles', type: 'textarea', width: 'full', conditional: { fieldId: 'enfermedades_mentales_familia_neuro', value: 'Si' } },
                    { id: 'enfermedades_familiares_neuro', label: '¿Antecedentes de enfermedades familiares?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'enfermedades_familiares_detalle_neuro', label: 'En caso de ser sí explique qué familiares y cuáles', type: 'textarea', width: 'full', conditional: { fieldId: 'enfermedades_familiares_neuro', value: 'Si' } },
                    { id: 'tratamiento_neuro', label: 'Tratamiento', type: 'textarea', width: 'full' }
                ]
            },
            {
                id: 'antecedentes_generales_neuro',
                title: 'Antecedentes generales',
                fields: [
                    { id: 'dedicacion_actual_neuro', label: '¿A qué se dedica actualmente?', type: 'select', width: 'half', options: ['Estudiar', 'Trabajo', 'Otra'] },
                    { id: 'sintomas_psiquicos_neuro', label: '¿Ha presentado alguno de los siguientes síntomas?', type: 'checkbox', width: 'full', options: ['Depresión', 'Psicosis', 'Angustia', 'Irritabilidad', 'Ansiedad', 'Estrés'] },
                    { id: 'otra_enfermedad_neuro', label: '¿Tiene Ud. alguna otra enfermedad o problema de salud? ¿Cuáles?', type: 'textarea', width: 'full' },
                    { id: 'medicamento_diario_neuro', label: '¿Toma algún medicamento diario?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'problemas_dormir_neuro', label: '¿Tiene problemas para dormir?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'horas_dormir_neuro', label: '¿Cuántas horas duerme?', type: 'number', width: 'half' },
                    { id: 'ronca_neuro', label: '¿Ronca?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'consume_alcohol_neuro', label: 'Consume alcohol', type: 'radio', width: 'half', options: ['Si', 'No', 'Eventualmente, social'] },
                    { id: 'fuma_neuro', label: 'Fuma', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'conduce_neuro', label: '¿Conduce automóviles?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'problema_actual_neuro', label: 'Descripción del problema actual', type: 'textarea', width: 'full' },
                    { id: 'cantidad_farmacos_neuro', label: 'Tratamiento', type: 'radio', width: 'full', options: ['Un fármaco', '2 fármacos', '3 fármacos'] },
                    { id: 'farmacos_dosis_frecuencia_inicio_neuro', label: 'Descripción de fármacos, dosis, frecuencia e inicio de tratamiento', type: 'textarea', width: 'full' }
                ]
            }
        ]
    }
];

