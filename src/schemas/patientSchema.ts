import { z } from 'zod';
import { PatientOrigin } from '../types';

export const patientSchema = z.object({
  fullName: z.string()
    .min(3, "El nombre es muy corto")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, "Solo se permiten letras y espacios"),
  
  // Validación de CUI (DPI)
  id: z.string()
    .length(13, "El DPI debe tener exactamente 13 dígitos")
    .regex(/^\d+$/, "Solo se permiten números")
    .refine((val) => !/^(\d)\1+$/.test(val), "El DPI no puede tener todos los dígitos iguales"),

  age: z.number({ message: "La edad debe ser un número" })
    .min(0, "La edad no puede ser negativa")
    .max(120, "Edad no válida"),
  
  gender: z.enum(['M', 'F'], { message: "Seleccione género" }),
  
  origin: z.nativeEnum(PatientOrigin, { message: "Seleccione origen" }),
  
  // Nuevo: Validación estricta de teléfono (Requerido para CRM)
  phone: z.string()
    .length(8, "El teléfono debe tener 8 dígitos")
    .regex(/^\d+$/, "Solo se permiten números")
    .optional(), // Opcional al principio, pero con validación estricta si se ingresa

  email: z.string().email("Correo electrónico inválido").optional().or(z.literal('')),

  protocol_code: z.string().optional(),
  
  // Ahora opcional porque puede ser un paciente nuevo sin historial previo cargado
  medical_history: z.string().optional(),
}).refine((data) => {
  // Regla: Si es IGSS, requiere protocolo/afiliación
  if (data.origin === PatientOrigin.IGSS && !data.protocol_code) {
    return false;
  }
  return true;
}, {
  message: "El código de afiliación es obligatorio para pacientes IGSS",
  path: ["protocol_code"],
});

export type PatientFormData = z.infer<typeof patientSchema>;
