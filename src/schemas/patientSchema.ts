import { z } from 'zod';
import { PatientOrigin } from '../../types.ts';

export const patientSchema = z.object({
  fullName: z.string()
    .min(3, "El nombre es muy corto")
    .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, "Solo se permiten letras y espacios"),
  id: z.string()
    .length(13, "El DPI debe tener exactamente 13 dígitos")
    .regex(/^\d+$/, "Solo se permiten números"),
  age: z.number({ message: "La edad debe ser un número" })
    .min(0, "La edad no puede ser negativa")
    .max(120, "Edad no válida"),
  gender: z.enum(['M', 'F'], { message: "Seleccione género" }),
  origin: z.nativeEnum(PatientOrigin, { message: "Seleccione origen" }),
  protocol_code: z.string().optional(),
  medical_history: z.string().min(10, "El historial médico es obligatorio (mínimo 10 caracteres)"),
}).refine((data) => {
  if (data.origin === PatientOrigin.IGSS && !data.protocol_code) {
    return false;
  }
  return true;
}, {
  message: "El código de protocolo es obligatorio para pacientes IGSS",
  path: ["protocol_code"],
});

export type PatientFormData = z.infer<typeof patientSchema>;