import { SpecialtyFormDefinition } from './types';

export const SPECIALTY_FORMS: SpecialtyFormDefinition[] = [
    {
        id: 'epilepsy',
        name: 'Ficha de Epilepsia',
        specialties: ['Neurología', 'Epilepsia', 'Epileptología', 'Neurofisiología'],
        sections: [
            {
                id: 'perinatal_epilepsia',
                title: 'Antecedentes prenatales y perinatales',
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
                title: 'Antecedentes personales niñez del paciente (Historia de crisis febril)',
                fields: [
                    { id: 'crisis_fiebre', label: '¿Presentó convulsión o crisis con fiebre?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'crisis_fiebre_edad', label: 'En caso de ser "SI" ¿a qué edad fue?', type: 'number', width: 'half', conditional: { fieldId: 'crisis_fiebre', value: 'Si' } },
                    { id: 'crisis_fiebre_duracion', label: '¿Cuánto duró la(s) convulsión(es) o crisis con fiebre?', type: 'text', width: 'half', conditional: { fieldId: 'crisis_fiebre', value: 'Si' } },
                    { id: 'crisis_fiebre_tipo', label: '¿Cómo fueron las crisis?', type: 'radio', width: 'half', options: ['Todo el cuerpo', 'Solo una parte del cuerpo'], conditional: { fieldId: 'crisis_fiebre', value: 'Si' } },
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
                id: 'riesgo_epilepsia',
                title: 'Factores de riesgo para epilepsia',
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
                id: 'antecedentes_personales_epilepsia',
                title: 'Antecedentes personales generales',
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
                id: 'primera_crisis',
                title: 'Historia de primera crisis',
                fields: [
                    { id: 'edad_primera_crisis', label: '¿A qué edad fue la primera crisis y en qué año fue?', type: 'text', width: 'full' },
                    { id: 'como_primera_crisis', label: '¿Cómo fue la primera crisis?', type: 'textarea', width: 'full' },
                    { id: 'crisis_serie', label: '¿Ha presentado crisis en serie, estatus o estado epiléptico?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'crisis_serie_detalle', label: 'Especificar edad y contexto clínico', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'semiologia_crisis',
                title: 'Semiología de crisis',
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
                id: 'tratamiento_epilepsia',
                title: 'Historia del tratamiento',
                fields: [
                    { id: 'inicio_tratamiento', label: '¿Cuándo comenzó el tratamiento? (edad y año)', type: 'text', width: 'full' },
                    { id: 'cambio_medicamento', label: '¿Por qué ha cambiado de medicamento?', type: 'checkbox', width: 'full', options: ['Muy caro', 'Seguía con crisis', 'Efecto adverso'] },
                    { id: 'efectos_secundarios', label: '¿Ha presentado problemas con los fármacos (efectos secundarios)?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'efectos_secundarios_detalle', label: 'En caso de ser "SI" ¿Cuáles?', type: 'text', width: 'half', conditional: { fieldId: 'efectos_secundarios', value: 'Si' } },
                    { id: 'cantidad_farmacos', label: '¿Cuántos fármacos toma actualmente?', type: 'radio', width: 'half', options: ['1 fármaco', '2 fármacos', '3 o más fármacos'] },
                    { id: 'farmacos_actuales', label: '¿Qué medicamentos recibe actualmente?', type: 'checkbox', width: 'full', options: ['Ácido valproico', 'Carbamazepina', 'Clobazam', 'Clonazepam', 'Fenobarbital', 'Fenitoína', 'Gabapentina', 'Lamotrigina', 'Levetiracetam'] },
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
                    { id: 'embarazo_problemas', label: '¿Tuvo problemas durante el embarazo? ¿Cuáles fueron?', type: 'textarea', width: 'full' },
                    { id: 'nacimiento_tipo', label: '¿Cómo fue el nacimiento?', type: 'radio', width: 'half', options: ['Parto', 'Cesárea'] },
                    { id: 'parto_complicaciones', label: '¿Hubo complicaciones durante el parto? ¿Cuáles fueron?', type: 'textarea', width: 'full' },
                    { id: 'peso_nacer', label: 'Peso al nacer', type: 'number', width: 'third' },
                    { id: 'talla_nacer', label: 'Talla al nacer', type: 'number', width: 'third' },
                    { id: 'enfermedad_nacer', label: '¿Presentó alguna enfermedad al nacer?', type: 'radio', width: 'third', options: ['Si', 'No'] },
                    { id: 'enfermedad_nacer_detalle', label: '¿Cuáles fueron?', type: 'text', width: 'full', conditional: { fieldId: 'enfermedad_nacer', value: 'Si' } },
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
                    { id: 'rendimiento_trabajo', label: 'Si trabaja, ¿cómo es Ud. en el trabajo?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'], conditional: { fieldId: 'dedicacion_actual', value: 'Trabajo' } },
                    { id: 'sintomas_psiquicos', label: '¿Ha presentado alguno de los siguientes síntomas?', type: 'checkbox', width: 'full', options: ['Depresión', 'Psicosis', 'Angustia', 'Irritabilidad', 'Ansiedad', 'Estrés'] },
                    { id: 'otra_enfermedad', label: '¿Tiene Ud. alguna otra enfermedad o problema de salud? ¿Cuáles?', type: 'textarea', width: 'full' },
                    { id: 'medicamento_diario', label: '¿Toma algún medicamento diario?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'medicamento_diario_detalle', label: '¿Cuáles?', type: 'text', width: 'half', conditional: { fieldId: 'medicamento_diario', value: 'Si' } },
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
                    { id: 'antecedentes_medicos', label: 'Antecedentes Médicos', type: 'text', width: 'full' },
                    { id: 'antecedentes_quirurgicos', label: 'Antecedentes Quirúrgicos', type: 'text', width: 'full' },
                    { id: 'antecedentes_alergicos', label: 'Antecedentes Alérgicos', type: 'text', width: 'full' },
                    { id: 'antecedentes_traumaticos', label: 'Antecedentes Traumáticos', type: 'text', width: 'full' },
                    { id: 'antecedentes_familiares', label: 'Antecedentes Familiares', type: 'text', width: 'full' }
                ]
            },
            {
                id: 'factores_riesgo_parkinson',
                title: 'Factores de riesgo para enfermedad de Parkinson',
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
                    { id: 'alcohol_estado', label: 'Consumo de alcohol', type: 'select', width: 'half', options: ['Activo', 'Nunca', 'Exbebedor'] },
                    { id: 'alcohol_bebidas', label: 'Bebidas a la semana', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Activo' } },
                    { id: 'alcohol_anos', label: 'Años de beber', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Activo' } },
                    { id: 'exalcohol_bebidas', label: 'Bebidas a la semana (exbebedor)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Exbebedor' } },
                    { id: 'exalcohol_anos', label: 'Años de beber (exbebedor)', type: 'number', width: 'half', conditional: { fieldId: 'alcohol_estado', value: 'Exbebedor' } },
                    { id: 'deportes_contacto', label: 'Antecedente de realizar deportes de contacto', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'deportes_cual', label: '¿Cuál?', type: 'text', width: 'half', conditional: { fieldId: 'deportes_contacto', value: 'Si' } },
                    { id: 'deportes_tiempo', label: 'Tiempo de practicarlo', type: 'text', width: 'half', conditional: { fieldId: 'deportes_contacto', value: 'Si' } }
                ]
            },
            {
                id: 'diagnostico_previo',
                title: 'Diagnóstico previo de enfermedad de Parkinson',
                fields: [
                    { id: 'diagnostico_tiempo', label: '¿Hace cuánto tiempo le diagnosticaron Enfermedad de Parkinson?', type: 'text', width: 'full' }
                ]
            },
            {
                id: 'tratamiento_actual',
                title: 'Información sobre tratamiento para Parkinson (actual)',
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
                title: 'Síntomas no motores de Parkinson',
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
                title: 'Antecedentes prenatales y perinatales',
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
                id: 'escolaridad_neuro',
                title: 'Escolaridad',
                fields: [
                    { id: 'grado_academico', label: 'Grado académico', type: 'select', width: 'half', options: ['No sabe leer ni escribir', 'Preprimaria', 'Primaria', 'Básicos', 'Diversificado', 'Universitario'] },
                    { id: 'rendimiento_escolar', label: 'Rendimiento escolar', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'] },
                    { id: 'promedio_notas', label: 'Promedio de notas', type: 'number', width: 'half' },
                    { id: 'ultimo_grado', label: 'Último grado cursado', type: 'text', width: 'half' }
                ]
            },
            {
                id: 'antecedentes_personales_neuro',
                title: 'Antecedentes personales generales',
                fields: [
                    { id: 'dedicacion_actual', label: '¿A qué se dedica actualmente?', type: 'select', width: 'half', options: ['Estudiar', 'Trabajo', 'Otra'] },
                    { id: 'rendimiento_estudio', label: 'Si estudia, ¿cómo es el rendimiento académico?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'], conditional: { fieldId: 'dedicacion_actual', value: 'Estudiar' } },
                    { id: 'rendimiento_trabajo', label: 'Si trabaja, ¿cómo es Ud. en el trabajo?', type: 'select', width: 'half', options: ['Excelente', 'Bueno', 'Regular'], conditional: { fieldId: 'dedicacion_actual', value: 'Trabajo' } },
                    { id: 'sintomas_psiquicos', label: '¿Ha presentado alguno de los siguientes síntomas?', type: 'checkbox', width: 'full', options: ['Depresión', 'Psicosis', 'Angustia', 'Irritabilidad', 'Ansiedad', 'Estrés'] },
                    { id: 'otra_enfermedad', label: '¿Tiene Ud. alguna otra enfermedad o problema de salud? ¿Cuáles?', type: 'textarea', width: 'full' },
                    { id: 'medicamento_diario', label: '¿Toma algún medicamento diario?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'medicamento_diario_detalle', label: '¿Cuáles?', type: 'text', width: 'half', conditional: { fieldId: 'medicamento_diario', value: 'Si' } },
                    { id: 'problemas_dormir', label: 'Tiene problemas para dormir', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'horas_dormir', label: '¿Cuántas horas duerme?', type: 'number', width: 'half' },
                    { id: 'ronca', label: '¿Ronca?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'consume_alcohol', label: 'Consume alcohol', type: 'radio', width: 'half', options: ['Si', 'No', 'Eventualmente, social'] },
                    { id: 'fuma', label: 'Fuma', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'conduce', label: '¿Conduce automóviles?', type: 'radio', width: 'half', options: ['Si', 'No'] },
                    { id: 'problema_actual', label: 'Descripción del problema actual', type: 'textarea', width: 'full' },
                    { id: 'tratamiento', label: 'Tratamiento', type: 'radio', width: 'full', options: ['Un fármaco', '2 fármacos', '3 fármacos'] }
                ]
            }
        ]
    }
];
